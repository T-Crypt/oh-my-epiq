import fs from 'node:fs';
import path from 'node:path';
import {ulid} from 'ulid';
import {getStateBranchRoot} from '../../../git/git-storage.js';
import {NO_WORKSPACE_INIT_MESSAGE} from '../../../lib/board/board-boot.js';
import {actorOf, AppEvent} from '../../../lib/board/board-events.model.js';
import {
	loadMergedEventsWithUnreadable,
	materializeAndPersistAll,
} from '../../../lib/board/board-log.js';
import {loadSettingsFromConfig} from '../../../lib/config/user-config.js';
import {
	listRecentProjects,
	recentProjectName,
	scanAndRecordProjects,
} from '../../../lib/config/recent-projects.js';
import {
	failed,
	isFail,
	Result,
	succeeded,
} from '../../../lib/model/result-types.js';
import {NO_PROJECT_MESSAGE} from '../../../lib/storage/paths.js';
import {getGuiState} from '../../../mcp/ome-api.js';

// The project a GUI server is serving. Mutable so `project:open` can point a
// server started outside any project at one from the recent list.
export type GuiProject = {repoRoot: string};

export type RecentProjectView = {
	projectId: string;
	name: string;
	root: string;
	lastOpenedAt: number;
};

export const recentProjectViews = (exclude: string): RecentProjectView[] => {
	// A board initialised anywhere else on this device (TUI `:init`,
	// `ome_project_init`, a fresh clone's adopt) joins the picker without
	// anyone typing its path. Best-effort: a failed scan reads as-is.
	scanAndRecordProjects();

	const result = listRecentProjects({exclude});
	if (isFail(result)) return [];

	return result.value.map(entry => ({
		projectId: entry.projectId,
		name: recentProjectName(entry.root),
		root: entry.root,
		lastOpenedAt: entry.lastOpenedAt,
	}));
};

// The short path for a root the registry lists. Anything else goes through
// detection, which validates the path itself: the socket is origin-guarded,
// but a message still should not be able to aim the server at a path that
// fails that check.
export const scanProjectViews = (exclude: string): RecentProjectView[] => {
	scanAndRecordProjects();

	const result = listRecentProjects({exclude});
	if (isFail(result)) return [];

	return result.value.map(entry => ({
		projectId: entry.projectId,
		name: recentProjectName(entry.root),
		root: entry.root,
		lastOpenedAt: entry.lastOpenedAt,
	}));
};

export const resolveRecentProjectRoot = (root: string): Result<string> => {
	scanAndRecordProjects();

	const result = listRecentProjects();
	if (isFail(result)) return failed(result.message);

	const entry = result.value.find(candidate => candidate.root === root);
	if (!entry) return failed(`Not a recent project: ${root}`);

	return succeeded('Resolved recent project', entry.root);
};

// Where a root stands: no OME state at all, a bootable board, or the
// half-initialized shape in between — a descriptor whose log never recorded
// its genesis. Anything else (a lock a concurrent TUI holds, a log this
// build cannot read) is transient and stays an error, never a slot.
export type ProjectSlot = 'none' | 'ready' | 'half';

export type ProjectDetection = {
	slot: ProjectSlot;
	root: string;
	name: string;
	message: string;
};

export const detectProjectState = async (
	root: string,
): Promise<Result<ProjectDetection>> => {
	if (!path.isAbsolute(root)) return failed(`Not an absolute path: ${root}`);

	let stat: fs.Stats;
	try {
		stat = fs.statSync(root);
	} catch {
		return failed(`No such directory: ${root}`);
	}
	if (!stat.isDirectory()) return failed(`Not a directory: ${root}`);

	const name = recentProjectName(root);
	const stateResult = await getGuiState({repoRoot: root});
	if (!isFail(stateResult)) {
		return succeeded('Project is ready', {
			slot: 'ready',
			root,
			name,
			message: 'Project is ready',
		});
	}

	if (stateResult.message === NO_PROJECT_MESSAGE) {
		return succeeded('Project has no OME state', {
			slot: 'none',
			root,
			name,
			message: stateResult.message,
		});
	}

	if (stateResult.message === NO_WORKSPACE_INIT_MESSAGE) {
		return succeeded('Project never finished initializing', {
			slot: 'half',
			root,
			name,
			message: stateResult.message,
		});
	}

	return failed(stateResult.message);
};

// Writes the genesis a half-initialized log is missing, then boots. Only an
// empty log qualifies: events without a genesis mean a clone waiting on its
// first pull or damage this must not paper over, so those refuse with the
// reason instead.
export const repairWorkspace = async (
	root: string,
): Promise<Result<ProjectDetection>> => {
	const detection = await detectProjectState(root);
	if (isFail(detection)) return detection;
	if (detection.value.slot !== 'half') {
		return failed(`Nothing to repair: ${detection.value.message}`);
	}

	const branchResult = getStateBranchRoot({repoRoot: root});
	if (isFail(branchResult)) return branchResult;

	const eventsResult = loadMergedEventsWithUnreadable(branchResult.value);
	if (isFail(eventsResult)) return eventsResult;
	if (eventsResult.value.events.length > 0) {
		return failed(
			`Cannot repair: the log holds ${eventsResult.value.events.length} event(s) but no workspace init. Pull first, or report the damage.`,
		);
	}

	const settingsResult = loadSettingsFromConfig();
	if (isFail(settingsResult)) return settingsResult;
	const userId = settingsResult.value.userId;
	if (!userId) return failed('Cannot repair: no OME user id is configured');

	const event = {
		id: ulid(),
		...actorOf({userId}),
		action: 'init.workspace',
		payload: {id: ulid(), name: 'Workspace', rank: 'a0'},
	} satisfies AppEvent<'init.workspace'>;

	const persistResult = materializeAndPersistAll([event], branchResult.value);
	if (isFail(persistResult)) return failed(persistResult.message);

	return detectProjectState(root);
};
