import os from 'node:os';
import path from 'node:path';

export const GLOBAL_CONFIG_DIR_NAME = '.ome-global';

/**
 * Where OME's global state (user config, worktrees) lives. Overridable via
 * `OME_GLOBAL_DIR` so tests (and other embedders) can isolate it without
 * touching `HOME`, which git/ssh/npm also rely on.
 */
export const getGlobalConfigDir = (): string =>
	process.env['OME_GLOBAL_DIR'] ??
	path.join(os.homedir(), GLOBAL_CONFIG_DIR_NAME);
