import fs from 'node:fs';
import path from 'node:path';
import {failed, isFail, Result, succeeded} from '../model/result-types.js';
import {getRepoRootDir, getStateBranchRoot} from '../../git/git-storage.js';

export {
	GLOBAL_CONFIG_DIR_NAME,
	getGlobalConfigDir,
} from './global-config-dir.js';

export const isLocal = process.env['IS_LOCAL'] === 'true';

export const OME_DIR_NAME = '.ome';
export const EVENTS_DIR_NAME = 'events';
export const MEDIA_DIR_NAME = 'media';
export const PROJECT_FILE_NAME = 'project.json';

export const getOMEDirPath = (root: string): string =>
	path.join(root, OME_DIR_NAME);

export const getProjectFilePath = (root: string): string =>
	path.join(getOMEDirPath(root), PROJECT_FILE_NAME);

/** The authoritative event logs, in the state branch worktree (not the user repo root). */
export const getEventsDirPath = (stateRoot: string): string =>
	path.join(getOMEDirPath(stateRoot), EVENTS_DIR_NAME);

/** Attachment blobs, beside the logs so an attachment and its blob share a commit. */
export const getMediaDirPath = (stateRoot: string): string =>
	path.join(getOMEDirPath(stateRoot), MEDIA_DIR_NAME);

export const getExportsDirPath = (repoRoot: string): string =>
	path.join(repoRoot, OME_DIR_NAME);

const hasLocalOMEDir = (dir: string): boolean => {
	const candidate = path.join(dir, OME_DIR_NAME);

	return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
};

export const hasLocalProjectFile = (dir: string): boolean => {
	const candidate = getProjectFilePath(dir);

	return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
};

/** The closest directory containing `.ome`; project discovery prefers `resolveClosestOMEProjectRoot`. */
export const resolveClosestOMERoot = (startDir: string): Result<string> => {
	let dir = path.resolve(startDir);

	while (true) {
		if (hasLocalOMEDir(dir)) {
			return succeeded('Resolved closest .ome root', dir);
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			return failed('No .ome directory found in any parent');
		}

		dir = parent;
	}
};

// Named so callers can tell "there is no project here" apart from a boot that
// failed for some other reason, without matching on prose.
export const NO_PROJECT_MESSAGE = 'No .ome/project.json found in any parent';

export const resolveClosestOMEProjectRoot = (
	startDir: string,
): Result<string> => {
	let dir = path.resolve(startDir);

	while (true) {
		if (hasLocalProjectFile(dir)) {
			return succeeded('Resolved closest ome project root', dir);
		}

		const parent = path.dirname(dir);
		if (parent === dir) {
			return failed(NO_PROJECT_MESSAGE);
		}

		dir = parent;
	}
};

export const ensureEventsDir = (stateRoot: string): Result<string> => {
	const eventsPath = getEventsDirPath(stateRoot);

	try {
		fs.mkdirSync(eventsPath, {recursive: true});
		return succeeded('Resolved events dir', eventsPath);
	} catch (error) {
		return failed(
			error instanceof Error
				? `Failed to ensure events dir: ${error.message}`
				: 'Failed to ensure events dir',
		);
	}
};

export const getPersistRoot = async () => {
	const repoRootResult = await getRepoRootDir(process.cwd());
	if (isFail(repoRootResult)) return repoRootResult;

	const stateBranchRootResult = getStateBranchRoot({
		repoRoot: repoRootResult.value,
	});
	if (isFail(stateBranchRootResult)) return stateBranchRootResult;

	return succeeded('Resolved persist root', stateBranchRootResult.value);
};
