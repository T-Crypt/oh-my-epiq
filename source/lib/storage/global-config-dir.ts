import os from 'node:os';
import path from 'node:path';

export const GLOBAL_CONFIG_DIR_NAME = '.ome-global';

/** Where ome's global state lives; `OME_GLOBAL_DIR` isolates it without touching `HOME`. */
export const getGlobalConfigDir = (): string =>
	process.env['OME_GLOBAL_DIR'] ??
	path.join(os.homedir(), GLOBAL_CONFIG_DIR_NAME);
