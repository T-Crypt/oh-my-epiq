import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {z} from 'zod';
import {failed, isFail, Result, succeeded} from '../model/result-types.js';
import {readProjectId} from '../project-setup/project-setup.js';
import {getGlobalConfigDir} from '../storage/global-config-dir.js';
import {hasLocalProjectFile} from '../storage/paths.js';

export const RECENT_PROJECTS_FILE_NAME = 'recent-projects.json';
export const MAX_RECENT_PROJECTS = 20;

// Discovery bounds: a home directory can hold tens of thousands of
// directories, so the scan is breadth-first, skips the usual heavy subtrees,
// and stops at a cap rather than walking everything.
export const PROJECT_SCAN_MAX_DEPTH = 4;
export const PROJECT_SCAN_MAX_DIRS = 5000;

const SCAN_SKIP_DIRS: ReadonlySet<string> = new Set([
	'node_modules',
	'.git',
	'.ome-global',
	'.ome',
	'dist',
	'.cache',
	'Library',
	'.Trash',
]);

const RecentProjectSchema = z.object({
	projectId: z.string().min(1),
	root: z.string().min(1),
	lastOpenedAt: z.number().finite(),
});

const RecentProjectsFileSchema = z.object({
	projects: z.array(RecentProjectSchema),
});

export type RecentProject = z.infer<typeof RecentProjectSchema>;

export const getRecentProjectsPath = (): string =>
	path.join(getGlobalConfigDir(), RECENT_PROJECTS_FILE_NAME);

export const recentProjectName = (root: string): string =>
	path.basename(root) || root;

// `process.cwd()` reports symlinks resolved (macOS's /var → /private/var), so
// comparing a stored root to it has to see through them too.
const canonical = (dir: string): string => {
	const resolved = path.resolve(dir);

	try {
		return fs.realpathSync(resolved);
	} catch {
		return resolved;
	}
};

const byMostRecent = (a: RecentProject, b: RecentProject) =>
	b.lastOpenedAt - a.lastOpenedAt;

// An entry is only worth offering while its directory still hosts the project
// it was recorded for. A re-initialised directory carries a new id and gets
// its own entry the next time it boots.
const isLive = (entry: RecentProject): boolean => {
	if (!hasLocalProjectFile(entry.root)) return false;

	const idResult = readProjectId(entry.root);

	return !isFail(idResult) && idResult.value === entry.projectId;
};

export const readRecentProjects = (): Result<RecentProject[]> => {
	const filePath = getRecentProjectsPath();

	if (!fs.existsSync(filePath)) {
		return succeeded('No recent projects recorded', []);
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch (error) {
		return failed(
			`Invalid ${RECENT_PROJECTS_FILE_NAME}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	const result = RecentProjectsFileSchema.safeParse(parsed);

	if (!result.success) {
		return failed(
			`Invalid ${RECENT_PROJECTS_FILE_NAME} shape: ${result.error.issues
				.map(issue => issue.path.join('.') || issue.message)
				.join(', ')}`,
		);
	}

	return succeeded('Read recent projects', result.data.projects);
};

const writeRecentProjects = (
	projects: RecentProject[],
): Result<RecentProject[]> => {
	const filePath = getRecentProjectsPath();

	try {
		fs.mkdirSync(path.dirname(filePath), {recursive: true});
		fs.writeFileSync(
			filePath,
			JSON.stringify({projects}, null, 2) + '\n',
			'utf8',
		);
	} catch (error) {
		return failed(
			`Unable to write ${RECENT_PROJECTS_FILE_NAME}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	return succeeded('Recorded recent project', projects);
};

/**
 * Lists the projects still worth offering, most recently opened first. `exclude`
 * drops the project the caller is already in.
 */
export const listRecentProjects = ({exclude}: {exclude?: string} = {}): Result<
	RecentProject[]
> => {
	const readResult = readRecentProjects();
	if (isFail(readResult)) return readResult;

	const excluded = exclude === undefined ? null : canonical(exclude);

	return succeeded(
		'Listed recent projects',
		readResult.value
			.filter(entry => excluded === null || canonical(entry.root) !== excluded)
			.filter(isLive)
			.sort(byMostRecent),
	);
};

/**
 * Upserts `root` as the most recently opened project. The registry is a
 * convenience, so a corrupt file is replaced rather than allowed to block the
 * boot that is recording into it.
 */
export const recordRecentProject = ({
	root,
	now = Date.now(),
}: {
	root: string;
	now?: number;
}): Result<RecentProject[]> => {
	const resolvedRoot = path.resolve(root);

	const projectIdResult = readProjectId(resolvedRoot);
	if (isFail(projectIdResult)) return failed(projectIdResult.message);

	const projectId = projectIdResult.value;
	const readResult = readRecentProjects();
	const existing = isFail(readResult) ? [] : readResult.value;

	const projects = [
		{projectId, root: resolvedRoot, lastOpenedAt: now},
		...existing.filter(
			entry => entry.projectId !== projectId && entry.root !== resolvedRoot,
		),
	]
		.filter(isLive)
		.sort(byMostRecent)
		.slice(0, MAX_RECENT_PROJECTS);

	return writeRecentProjects(projects);
};

// Where to look for boards this machine has never opened. Explicit
// `OME_PROJECT_ROOTS` (colon-separated) wins; otherwise the user's home
// directory, which covers `~/projects/*`, `~/homelab` and siblings at the
// default depth below.
//
// The scan only *adds*: a root whose `.ome/project.json` reads gets an entry
// (never-opened entries sort last with `lastOpenedAt: 0`), and nothing is
// ever removed except by the existing live-filter on write.
export const getProjectSearchRoots = (): string[] => {
	const fromEnv = (process.env['OME_PROJECT_ROOTS'] ?? '')
		.split(':')
		.map(part => part.trim())
		.filter(part => part.length > 0);

	if (fromEnv.length > 0) return fromEnv;

	try {
		return [os.homedir()];
	} catch {
		return [];
	}
};

const isProjectRootDir = (dir: string): boolean => {
	try {
		return fs.statSync(path.join(dir, '.ome', 'project.json')).isFile();
	} catch {
		return false;
	}
};

export const discoverOmeProjectRoots = ({
	roots = getProjectSearchRoots(),
	maxDepth = PROJECT_SCAN_MAX_DEPTH,
	maxDirs = PROJECT_SCAN_MAX_DIRS,
}: {
	roots?: string[];
	maxDepth?: number;
	maxDirs?: number;
} = {}): string[] => {
	const found: string[] = [];
	const seen = new Set<string>();
	let visited = 0;

	// Breadth-first so a deep tree cannot starve the sibling projects at the
	// top: every root's children are all visited before any grandchild.
	let level: {dir: string; depth: number}[] = [];
	for (const root of roots) {
		try {
			const resolved = fs.realpathSync(path.resolve(root));
			if (!seen.has(resolved)) {
				seen.add(resolved);
				level.push({dir: resolved, depth: 0});
			}
		} catch {
			// A missing search root is configuration, not an error.
		}
	}

	while (level.length > 0 && visited < maxDirs) {
		const next: {dir: string; depth: number}[] = [];
		for (const {dir, depth} of level) {
			if (visited >= maxDirs) break;
		visited += 1;

		if (isProjectRootDir(dir)) {
			found.push(dir);
			// A project root still has children worth scanning (a monorepo
			// can nest another), so this does not `continue`.
		}

		if (depth >= maxDepth) continue;

		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, {withFileTypes: true});
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
			if (SCAN_SKIP_DIRS.has(entry.name) || entry.name.startsWith('.cache'))
				continue;
		const child = path.join(dir, entry.name);
		let resolved: string;
		try {
			resolved = fs.realpathSync(child);
		} catch {
			continue;
		}
		if (seen.has(resolved)) continue;
		seen.add(resolved);
		next.push({dir: resolved, depth: depth + 1});
		}
	}
		level = next;
	}

	return found;
};

// Merges every discovered board into the registry, preserving existing
// `lastOpenedAt` values and stamping never-opened ones with 0 so they sort
// last. Best-effort by design: a scan that finds nothing, or cannot write,
// leaves the registry as it was and reports what the read holds.
export const reconcileRecentProjects = ({
	roots,
}: {
	roots?: string[];
} = {}): Result<RecentProject[]> => {
	let discovered: string[];
	try {
		discovered = discoverOmeProjectRoots(roots === undefined ? {} : {roots});
	} catch {
		return readRecentProjects();
	}

	if (discovered.length === 0) return readRecentProjects();

	const readResult = readRecentProjects();
	const existing = isFail(readResult) ? [] : readResult.value;
	const byId = new Map(existing.map(entry => [entry.projectId, entry]));
	const byRoot = new Map(existing.map(entry => [entry.root, entry]));

	let changed = false;
	const merged = [...existing];
	for (const root of discovered) {
		if (byRoot.has(root)) continue;
		const idResult = readProjectId(root);
		if (isFail(idResult)) continue;
		if (byId.has(idResult.value)) continue;
		merged.push({projectId: idResult.value, root, lastOpenedAt: 0});
		changed = true;
	}

	if (!changed) return succeeded('Registry already complete', existing);

	const projects = merged
		.filter(isLive)
		.sort(byMostRecent)
		.slice(0, Math.max(MAX_RECENT_PROJECTS, merged.length));

	// The registry cap is for *recent* entries; a device with more boards
	// than the cap keeps all of them once discovered rather than dropping the
	// never-opened ones every scan.
	return writeRecentProjects(projects);
};

// The picker and `project:list` call this before reading: a board
// initialised outside the GUI (TUI `:init`, `ome_project_init`, a fresh
// clone's adopt) shows up without anyone typing its path. Never throws and
// never fails a boot: on `OME_PROJECT_SCAN=0`, or on any error, the
// registry is read as-is.
export const scanAndRecordProjects = (): void => {
	if ((process.env['OME_PROJECT_SCAN'] ?? '').trim() === '0') return;
	try {
		reconcileRecentProjects();
	} catch {
		// Discovery is a convenience; the board must boot without it.
	}
};
