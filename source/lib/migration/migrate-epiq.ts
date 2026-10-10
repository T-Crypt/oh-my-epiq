// Migrating an Epiq install to OME.
//
// Epiq and OME share a data model — a project descriptor in the checkout, an
// append-only event log on a state branch, and a worktree per project under the
// global directory — but every name moved: `.epiq` to `.ome`, `__epiq_state__`
// to `__ome_state__`, `~/.epiq-global` to `~/.ome-global`. The board itself is
// just events, so nothing a person wrote is lost by the rename; what has to be
// moved is the scaffolding around it.
//
// This is the one sanctioned way to touch the state branch outside the event
// log: the log's *location* is what is being renamed, and git can only record
// that as a commit. It is deliberately not an MCP tool — an agent must never
// trigger a migration — and it plans before it acts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {git} from '../../git/git-commands.js';
import {commitAndGetSha, execGit, hasLocalBranch} from '../../git/git-utils.js';
import {logger} from '../../logger.js';
import {failed, isFail, Result, succeeded} from '../model/result-types.js';
import {
	DEFAULT_STATE_BRANCH,
	OmeProject,
} from '../project-setup/project-setup.js';
import {getGlobalConfigDir} from '../storage/global-config-dir.js';

export const LEGACY_DIR_NAME = '.epiq';
export const LEGACY_GLOBAL_DIR_NAME = '.epiq-global';
export const LEGACY_STATE_BRANCH = '__epiq_state__';
export const LEGACY_GLOBAL_DIR_ENV = 'EPIQ_GLOBAL_DIR';

export const getLegacyGlobalConfigDir = (): string =>
	process.env[LEGACY_GLOBAL_DIR_ENV] ??
	path.join(os.homedir(), LEGACY_GLOBAL_DIR_NAME);

export const getLegacyProjectFilePath = (repoRoot: string): string =>
	path.join(repoRoot, LEGACY_DIR_NAME, 'project.json');

export const hasLegacyProject = (repoRoot: string): boolean =>
	fs.existsSync(getLegacyProjectFilePath(repoRoot));

/** The closest ancestor holding `.epiq/project.json`, for a migration run from a subdirectory. */
export const resolveClosestLegacyProjectRoot = (
	startDir: string,
): Result<string> => {
	let dir = path.resolve(startDir);

	while (true) {
		if (hasLegacyProject(dir)) {
			return succeeded('Resolved legacy project root', dir);
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			return failed('No .epiq/project.json found in any parent');
		}

		dir = parent;
	}
};

export type MigrationActionId =
	| 'rename-state-branch'
	| 'move-global-dir'
	| 'repair-worktree'
	| 'rename-checkout-dir'
	| 'rewrite-checkout-project'
	| 'update-gitignore'
	| 'rewrite-state-project'
	| 'commit-state-branch'
	| 'commit-checkout';

export type MigrationAction = {
	id: MigrationActionId;
	description: string;
	from?: string;
	to?: string;
	destructive: boolean;
};

export type EpiqMigrationPlan = {
	/** The project checkout, when the command ran inside one. */
	repoRoot: string | null;
	projectId: string | null;
	legacyProjectDir: string | null;
	projectDir: string | null;
	legacyGlobalDir: string;
	globalDir: string;
	stateBranchFrom: string;
	stateBranchTo: string;
	legacyWorktreeRoot: string | null;
	worktreeRoot: string | null;
	/** True when the state worktree's contents still live under `.epiq`. */
	worktreeNeedsRename: boolean;
	actions: MigrationAction[];
};

export type EpiqMigrationReport = {
	plan: EpiqMigrationPlan;
	dryRun: boolean;
	backupDir: string | null;
	applied: MigrationAction[];
	warnings: string[];
};

// A project file as either Epiq or OME wrote it. Read leniently: a half-renamed
// file, or one from a slightly different Epiq, should still name its project so
// the migration can find the worktree, and a missing field falls back rather
// than aborting.
const readProjectFields = (
	filePath: string,
): {project: OmeProject | null; error: string | null} => {
	if (!fs.existsSync(filePath)) return {project: null, error: null};

	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;

		if (typeof parsed !== 'object' || parsed === null) {
			return {project: null, error: `Not an object: ${filePath}`};
		}

		const record = parsed as Record<string, unknown>;
		const projectId = record['projectId'];
		const stateBranch = record['stateBranch'];
		const createdAt = record['createdAt'];

		if (typeof projectId !== 'string' || projectId.length === 0) {
			return {project: null, error: `Missing projectId: ${filePath}`};
		}

		return {
			project: {
				projectId,
				stateBranch:
					typeof stateBranch === 'string' && stateBranch.length > 0
						? stateBranch
						: LEGACY_STATE_BRANCH,
				createdAt:
					typeof createdAt === 'string' ? createdAt : new Date().toISOString(),
			},
			error: null,
		};
	} catch (error) {
		return {
			project: null,
			error:
				error instanceof Error
					? `Failed to read ${filePath}: ${error.message}`
					: `Failed to read ${filePath}`,
		};
	}
};

const existsDir = (p: string): boolean => {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
};

const existsFile = (p: string): boolean => {
	try {
		return fs.statSync(p).isFile();
	} catch {
		return false;
	}
};

/**
 * Works out what a migration would do, without touching anything. Branch
 * lookups are reads, so this is safe to run on any checkout at any time.
 */
export const planEpiqMigration = async ({
	repoRoot,
}: {
	repoRoot: string | null;
}): Promise<Result<EpiqMigrationPlan>> => {
	const legacyGlobalDir = getLegacyGlobalConfigDir();
	const globalDir = getGlobalConfigDir();

	let project: OmeProject | null = null;
	if (repoRoot) {
		const read = readProjectFields(getLegacyProjectFilePath(repoRoot));
		if (read.error) return failed(read.error);
		project = read.project;
	}

	// With no checkout in hand, the project id can still come from OME's own
	// recent list if a previous dry-run already moved the descriptor. Fall back
	// only to what the checkout told us; a global-only migration matches by id.
	const projectId = project?.projectId ?? null;
	const stateBranchFrom = project?.stateBranch ?? LEGACY_STATE_BRANCH;

	const legacyProjectDir = repoRoot
		? path.join(repoRoot, LEGACY_DIR_NAME)
		: null;
	const projectDir = repoRoot ? path.join(repoRoot, '.ome') : null;

	const legacyWorktreeRoot = projectId
		? path.join(legacyGlobalDir, 'worktrees', projectId)
		: null;
	const worktreeRoot = projectId
		? path.join(globalDir, 'worktrees', projectId)
		: null;

	// Whether this run moves `~/.epiq-global` to `~/.ome-global`. The worktree
	// actions read from wherever the worktree is *now*: after a move it is at
	// the OME path, before one it is still at the legacy path.
	const willMoveGlobalDir =
		legacyGlobalDir !== globalDir &&
		existsDir(legacyGlobalDir) &&
		!fs.existsSync(globalDir);

	const worktreeSource = willMoveGlobalDir ? legacyWorktreeRoot : worktreeRoot;

	const worktreeNeedsRename =
		worktreeSource !== null &&
		existsDir(path.join(worktreeSource, LEGACY_DIR_NAME)) &&
		!existsDir(path.join(worktreeSource, '.ome'));

	const actions: MigrationAction[] = [];

	if (repoRoot && existsFile(getLegacyProjectFilePath(repoRoot))) {
		if (!existsDir(projectDir ?? '')) {
			actions.push({
				id: 'rename-checkout-dir',
				description: 'Rename the checkout board directory',
				from: legacyProjectDir ?? undefined,
				to: projectDir ?? undefined,
				destructive: false,
			});
		}

		if (stateBranchFrom !== DEFAULT_STATE_BRANCH) {
			actions.push({
				id: 'rewrite-checkout-project',
				description: 'Point the checkout board at the OME state branch',
				from: path.join(projectDir ?? '', 'project.json'),
				destructive: false,
			});
		}
	}

	if (repoRoot && gitignoreHasLegacyEntry(repoRoot)) {
		actions.push({
			id: 'update-gitignore',
			description: 'Rename .epiq ignore entries to .ome',
			from: path.join(repoRoot, '.gitignore'),
			destructive: false,
		});
	}

	// Before the move, while the state worktree is still valid: a broken
	// registration would make `git branch -m` look at a worktree git cannot
	// read. The move then follows, and `repair-worktree` re-points it.
	if (stateBranchFrom !== DEFAULT_STATE_BRANCH && repoRoot) {
		const hasLegacy = await hasLocalBranch({
			repoRoot,
			branch: stateBranchFrom,
		});
		const hasNew = await hasLocalBranch({
			repoRoot,
			branch: DEFAULT_STATE_BRANCH,
		});

		if (isFail(hasLegacy)) return failed(hasLegacy.message);
		if (isFail(hasNew)) return failed(hasNew.message);

		if (hasLegacy.value && !hasNew.value) {
			actions.push({
				id: 'rename-state-branch',
				description: 'Rename the state branch',
				from: stateBranchFrom,
				to: DEFAULT_STATE_BRANCH,
				destructive: false,
			});
		}
	}

	if (willMoveGlobalDir) {
		actions.push({
			id: 'move-global-dir',
			description: 'Move the global directory',
			from: legacyGlobalDir,
			to: globalDir,
			destructive: false,
		});
	}

	if (
		worktreeSource &&
		existsDir(worktreeSource) &&
		(willMoveGlobalDir || existsDir(worktreeRoot ?? ''))
	) {
		actions.push({
			id: 'repair-worktree',
			description: 'Repair the moved state worktree registration',
			to: worktreeRoot ?? undefined,
			destructive: false,
		});
	}

	if (worktreeNeedsRename) {
		actions.push({
			id: 'rewrite-state-project',
			description: 'Rename .epiq to .ome on the state branch',
			from: path.join(worktreeRoot ?? '', LEGACY_DIR_NAME),
			to: path.join(worktreeRoot ?? '', '.ome'),
			destructive: false,
		});
		actions.push({
			id: 'commit-state-branch',
			description: 'Commit the rename on the state branch',
			destructive: false,
		});
	}

	if (actions.some(a => a.id === 'rename-checkout-dir')) {
		actions.push({
			id: 'commit-checkout',
			description: 'Commit the checkout rename on the project branch',
			destructive: false,
		});
	}

	return succeeded('Planned Epiq migration', {
		repoRoot,
		projectId,
		legacyProjectDir,
		projectDir,
		legacyGlobalDir,
		globalDir,
		stateBranchFrom,
		stateBranchTo: DEFAULT_STATE_BRANCH,
		legacyWorktreeRoot,
		worktreeRoot,
		worktreeNeedsRename,
		actions,
	});
};

const GITIGNORE_MARKERS = [
	'.epiq/*',
	'!.epiq/project.json',
	'.epiq/events/',
	'.epiq/log/',
];

export const gitignoreHasLegacyEntry = (repoRoot: string): boolean => {
	const gitignorePath = path.join(repoRoot, '.gitignore');
	if (!existsFile(gitignorePath)) return false;

	const content = fs.readFileSync(gitignorePath, 'utf8');
	return content.includes('.epiq');
};

// `.epiq` as a path prefix only: comment prose, or a URL, must survive.
const rewriteGitignoreContent = (content: string): string =>
	content
		.split('\n')
		.map(line => {
			const trimmed = line.trim();
			if (GITIGNORE_MARKERS.includes(trimmed)) {
				return line.replace('.epiq', '.ome');
			}
			// `.epiq/` or `/.epiq` style entries.
			if (/^\/?\.epiq(\/|$)/.test(trimmed)) {
				return line.replace('.epiq', '.ome');
			}
			return line;
		})
		.join('\n');

/**
 * Runs the migration. Idempotent at every step, so a run that fails partway is
 * finished by running it again. `dryRun` returns the plan and changes nothing;
 * a real run copies the checkout's board directory aside first.
 */
export const migrateEpiqProject = async ({
	repoRoot,
	dryRun = false,
}: {
	repoRoot: string | null;
	dryRun?: boolean;
}): Promise<Result<EpiqMigrationReport>> => {
	const planResult = await planEpiqMigration({repoRoot});
	if (isFail(planResult)) return planResult;

	const plan = planResult.value;
	const warnings: string[] = [];
	const applied: MigrationAction[] = [];

	if (plan.actions.length === 0) {
		return succeeded('Nothing to migrate', {
			plan,
			dryRun,
			backupDir: null,
			applied,
			warnings,
		});
	}

	if (dryRun) {
		return succeeded('Dry run: nothing changed', {
			plan,
			dryRun,
			backupDir: null,
			applied,
			warnings,
		});
	}

	// A backup of the small, precious part: the checkout's descriptor and any
	// hydrated events. The global directory is moved, not copied, and a move is
	// reversible by moving it back, so it is not duplicated here.
	let backupDir: string | null = null;
	if (repoRoot && plan.legacyProjectDir && existsDir(plan.legacyProjectDir)) {
		backupDir = path.join(repoRoot, `.epiq-migration-backup-${Date.now()}`);
		try {
			fs.cpSync(plan.legacyProjectDir, backupDir, {recursive: true});
		} catch (error) {
			return failed(
				`Could not write a backup to ${backupDir}: ${
					error instanceof Error ? error.message : 'unknown error'
				}`,
			);
		}
	}

	const fail = (action: MigrationAction, message: string) =>
		failed(
			[
				`Migration stopped at "${action.description}".`,
				message,
				'',
				'Every step is idempotent, so fix the cause and run it again: the',
				'steps already applied are skipped, and it resumes from here.',
				backupDir ? `Backup of the checkout board: ${backupDir}` : '',
			]
				.filter(Boolean)
				.join('\n'),
		);

	for (const action of plan.actions) {
		const stepResult = await applyAction({action, plan, warnings});
		if (isFail(stepResult)) return fail(action, stepResult.message);
		applied.push(action);
	}

	return succeeded(
		`Migrated ${plan.projectId ?? 'the global directory'} to OME`,
		{plan, dryRun, backupDir, applied, warnings},
	);
};

const applyAction = async ({
	action,
	plan,
	warnings,
}: {
	action: MigrationAction;
	plan: EpiqMigrationPlan;
	warnings: string[];
}): Promise<Result<void>> => {
	switch (action.id) {
		case 'rename-state-branch':
			return renameStateBranch(plan);
		case 'move-global-dir':
			return moveGlobalDir(plan);
		case 'repair-worktree':
			return repairWorktree(plan);
		case 'rename-checkout-dir':
			return renameCheckoutDir(plan);
		case 'rewrite-checkout-project':
			return rewriteCheckoutProject(plan);
		case 'update-gitignore':
			return updateGitignore(plan);
		case 'rewrite-state-project':
			return rewriteStateProject(plan);
		case 'commit-state-branch':
			return commitStateBranch(plan, warnings);
		case 'commit-checkout':
			return commitCheckout(plan, warnings);
		default:
			return failed(`Unknown migration action: ${String(action.id)}`);
	}
};

const renameStateBranch = async (
	plan: EpiqMigrationPlan,
): Promise<Result<void>> => {
	if (!plan.repoRoot) return failed('No repository to rename the branch in');

	const result = await execGit({
		args: ['branch', '-m', plan.stateBranchFrom, plan.stateBranchTo],
		cwd: plan.repoRoot,
	});
	if (isFail(result)) {
		return failed(
			`Failed to rename ${plan.stateBranchFrom}:\n${result.message}`,
		);
	}

	// The old name's upstream would otherwise follow the branch and point at
	// origin/__epiq_state__; the next sync sets the new one.
	await execGit({
		args: ['branch', '--unset-upstream', plan.stateBranchTo],
		cwd: plan.repoRoot,
	});

	logger.info(`Renamed state branch to ${plan.stateBranchTo}`);
	return succeeded('Renamed state branch', undefined);
};

const moveGlobalDir = async (
	plan: EpiqMigrationPlan,
): Promise<Result<void>> => {
	try {
		fs.mkdirSync(path.dirname(plan.globalDir), {recursive: true});
		fs.renameSync(plan.legacyGlobalDir, plan.globalDir);
	} catch (error) {
		return failed(
			`Failed to move ${plan.legacyGlobalDir} to ${plan.globalDir}: ${
				error instanceof Error ? error.message : 'unknown error'
			}`,
		);
	}

	logger.info(`Moved ${plan.legacyGlobalDir} to ${plan.globalDir}`);
	return succeeded('Moved global directory', undefined);
};

const repairWorktree = async (
	plan: EpiqMigrationPlan,
): Promise<Result<void>> => {
	if (!plan.repoRoot || !plan.worktreeRoot) {
		return succeeded('No worktree to repair', undefined);
	}

	if (!existsDir(plan.worktreeRoot)) {
		// The worktree was never moved (global dir already correct) or is about
		// to be recreated by boot; either way there is nothing to repair.
		return succeeded('No worktree at the OME path', undefined);
	}

	const result = await execGit({
		args: ['worktree', 'repair', plan.worktreeRoot],
		cwd: plan.repoRoot,
	});
	if (isFail(result)) {
		return failed(
			`Failed to repair the worktree registration:\n${result.message}`,
		);
	}

	return succeeded('Repaired worktree', undefined);
};

const renameCheckoutDir = async (
	plan: EpiqMigrationPlan,
): Promise<Result<void>> => {
	if (!plan.legacyProjectDir || !plan.projectDir) {
		return succeeded('No checkout directory to rename', undefined);
	}

	if (existsDir(plan.projectDir)) {
		return succeeded('Checkout already renamed', undefined);
	}

	try {
		fs.renameSync(plan.legacyProjectDir, plan.projectDir);
	} catch (error) {
		return failed(
			`Failed to rename ${plan.legacyProjectDir}: ${
				error instanceof Error ? error.message : 'unknown error'
			}`,
		);
	}

	return succeeded('Renamed checkout directory', undefined);
};

const rewriteCheckoutProject = async (
	plan: EpiqMigrationPlan,
): Promise<Result<void>> => {
	if (!plan.projectDir) return succeeded('No checkout project file', undefined);

	return rewriteProjectFile(path.join(plan.projectDir, 'project.json'));
};

const rewriteStateProject = async (
	plan: EpiqMigrationPlan,
): Promise<Result<void>> => {
	if (!plan.worktreeRoot) return succeeded('No state worktree', undefined);

	const legacyDir = path.join(plan.worktreeRoot, LEGACY_DIR_NAME);
	const newDir = path.join(plan.worktreeRoot, '.ome');

	if (existsDir(legacyDir)) {
		try {
			fs.renameSync(legacyDir, newDir);
		} catch (error) {
			return failed(
				`Failed to rename ${legacyDir}: ${
					error instanceof Error ? error.message : 'unknown error'
				}`,
			);
		}
	}

	if (existsDir(newDir)) {
		return rewriteProjectFile(path.join(newDir, 'project.json'));
	}

	return succeeded('State branch already renamed', undefined);
};

const rewriteProjectFile = (filePath: string): Result<void> => {
	if (!existsFile(filePath))
		return succeeded('No project file to rewrite', undefined);

	const read = readProjectFields(filePath);
	if (read.error) return failed(read.error);
	if (!read.project) return succeeded('No project file to rewrite', undefined);

	read.project.stateBranch = DEFAULT_STATE_BRANCH;

	try {
		fs.writeFileSync(
			filePath,
			`${JSON.stringify(read.project, null, 2)}\n`,
			'utf8',
		);
	} catch (error) {
		return failed(
			`Failed to rewrite ${filePath}: ${
				error instanceof Error ? error.message : 'unknown error'
			}`,
		);
	}

	return succeeded('Rewrote project file', undefined);
};

const updateGitignore = async (
	plan: EpiqMigrationPlan,
): Promise<Result<void>> => {
	if (!plan.repoRoot) return succeeded('No .gitignore to update', undefined);

	const gitignorePath = path.join(plan.repoRoot, '.gitignore');
	if (!existsFile(gitignorePath)) return succeeded('No .gitignore', undefined);

	const before = fs.readFileSync(gitignorePath, 'utf8');
	const after = rewriteGitignoreContent(before);
	if (after === before)
		return succeeded('.gitignore already updated', undefined);

	fs.writeFileSync(gitignorePath, after, 'utf8');
	return succeeded('Updated .gitignore', undefined);
};

const commitStateBranch = async (
	plan: EpiqMigrationPlan,
	warnings: string[],
): Promise<Result<void>> => {
	if (!plan.worktreeRoot || !existsDir(plan.worktreeRoot)) {
		return succeeded('No state worktree to commit', undefined);
	}

	const stageResult = await git.stage({
		cwd: plan.worktreeRoot,
		pathspec: ['.'],
	});
	if (isFail(stageResult)) {
		return failed(
			`Failed to stage the state branch rename:\n${stageResult.message}`,
		);
	}

	const commitResult = await commitAndGetSha({
		cwd: plan.worktreeRoot,
		message: '[ome:migrate]',
	});
	if (isFail(commitResult)) {
		// Nothing staged means a previous run already committed the rename.
		warnings.push(`[migrate:state] ${commitResult.message}`);
		return succeeded('State branch already committed', undefined);
	}

	return succeeded('Committed state branch rename', undefined);
};

const commitCheckout = async (
	plan: EpiqMigrationPlan,
	warnings: string[],
): Promise<Result<void>> => {
	if (!plan.repoRoot) return succeeded('No checkout to commit', undefined);

	const pathspec = ['.epiq', '.ome', '.gitignore'];
	const stageResult = await git.stage({cwd: plan.repoRoot, pathspec});
	if (isFail(stageResult)) {
		warnings.push(`[migrate:checkout] ${stageResult.message}`);
		return succeeded('Could not stage the checkout rename', undefined);
	}

	const commitResult = await git.commit({
		cwd: plan.repoRoot,
		message: '[ome:migrate-project]',
		pathspec,
	});
	if (isFail(commitResult)) {
		warnings.push(`[migrate:checkout] ${commitResult.message}`);
		return succeeded('Checkout rename left uncommitted', undefined);
	}

	return succeeded('Committed checkout rename', undefined);
};
