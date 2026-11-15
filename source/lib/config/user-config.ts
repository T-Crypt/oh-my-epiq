import path from 'node:path';
import {z} from 'zod';
import {resolveEnvActor} from './actor-env.js';
import {DEFAULT_AUTO_SYNC_INTERVAL_MS} from './auto-sync-interval.js';
import {GLOBAL_CONFIG_DIR_NAME, getGlobalConfigDir} from '../storage/paths.js';
import {failed, isFail, Result, succeeded} from '../model/result-types.js';
import {SettingsState} from '../state/settings.state.js';
import {fileManager} from '../storage/file-manager.js';

export const SYSTEM_USER: OMEConfig = {
	logLevel: 'info',
	userId: '',
	userName: '',
	preferredEditor: '',
	autoSync: false,
};

const OMEConfigSchema = z
	.object({
		logLevel: z.enum(['info', 'error', 'debug']),
		preferredEditor: z.string().optional(),
		userName: z.string().optional(),
		userId: z.string().optional(),
		autoSync: z.boolean().nullable().optional(),
		autoSyncDebounceMs: z.number().optional(),
		attachmentMaxKb: z.number().optional(),
		repoCloneMaxMb: z.number().optional(),
		viewMode: z.enum(['dense', 'wide']).optional(),
		// Boards where this machine declined linking its git addresses. Kept
		// locally and per board, so the refusal never replicates to other clones.
		declinedEmailBoards: z.array(z.string()).optional(),
	})
	.partial();

export type OMEConfig = z.infer<typeof OMEConfigSchema>;

const CONFIG_FILE_NAME = 'config.json';

export const getOMEHomePath = getGlobalConfigDir;

export const getOMEConfigPath = (): string =>
	path.join(getOMEHomePath(), CONFIG_FILE_NAME);

const ensureOMEHomeExists = (): Result<null> => {
	try {
		fileManager.mkDir(getOMEHomePath());
		return succeeded(`Ensured ~/${GLOBAL_CONFIG_DIR_NAME} exists`, null);
	} catch {
		return failed(`Unable to create ~/${GLOBAL_CONFIG_DIR_NAME}`);
	}
};

const safeParseConfig = (raw: string): Result<OMEConfig> => {
	let parsed: unknown;

	try {
		parsed = JSON.parse(raw);
	} catch {
		return failed(`Invalid ~/${GLOBAL_CONFIG_DIR_NAME}/config.json JSON`);
	}

	const result = OMEConfigSchema.safeParse(parsed ?? {});

	if (!result.success) {
		return failed(
			`Invalid ~/${GLOBAL_CONFIG_DIR_NAME}/config.json shape: ${result.error.issues
				.map(issue => issue.path.join('.') || issue.message)
				.join(', ')}`,
		);
	}

	return succeeded('Parsed config', result.data);
};

export const readOMEConfig = (): Result<OMEConfig> => {
	const ensureResult = ensureOMEHomeExists();
	if (isFail(ensureResult)) return failed(ensureResult.message);

	const configPath = getOMEConfigPath();
	const raw = fileManager.readFile(configPath);

	if (raw == null || raw.trim() === '') {
		return succeeded('No config found, using empty config', {
			logLevel: 'info',
			autoSync: null,
			preferredEditor: '',
			userId: '',
			userName: '',
			autoSyncIntervalMs: DEFAULT_AUTO_SYNC_INTERVAL_MS,
		});
	}

	return safeParseConfig(raw);
};

export const writeOMEConfig = (config: OMEConfig): Result<null> => {
	const ensureResult = ensureOMEHomeExists();
	if (isFail(ensureResult)) return failed(ensureResult.message);

	const result = OMEConfigSchema.safeParse(config);

	if (!result.success) {
		return failed(
			`Invalid config: ${result.error.issues
				.map(issue => issue.path.join('.') || issue.message)
				.join(', ')}`,
		);
	}

	const configPath = getOMEConfigPath();

	try {
		fileManager.writeToFile(
			configPath,
			JSON.stringify(result.data, null, 2) + '\n',
		);
		return succeeded('Config written', null);
	} catch {
		return failed(`Unable to write ~/${GLOBAL_CONFIG_DIR_NAME}/config.json`);
	}
};

export const setConfig = (partialConfig: Partial<OMEConfig>) => {
	const existingResult = readOMEConfig();
	if (isFail(existingResult)) return failed('Failed to read existing config');

	const nextConfig: OMEConfig = {
		...existingResult.value,
		...partialConfig,
	};

	return writeOMEConfig(nextConfig);
};

export const loadSettingsFromConfig = (): Result<SettingsState> => {
	const configPath = getOMEConfigPath();

	const ensureResult = ensureOMEHomeExists();
	if (isFail(ensureResult)) {
		return failed(`Unable to create ~/${GLOBAL_CONFIG_DIR_NAME}`);
	}

	const exists = fileManager.readFile(configPath) !== null;

	if (!exists) {
		const createResult = writeOMEConfig(SYSTEM_USER);
		if (isFail(createResult)) {
			throw new Error(
				`Unable to create ~/${GLOBAL_CONFIG_DIR_NAME}/config.json`,
			);
		}
	}

	const result = readOMEConfig();
	if (isFail(result)) {
		throw new Error(result.message || 'Unable to load settings');
	}

	const {
		preferredEditor,
		userName,
		userId,
		declinedEmailBoards,
		autoSync,
		autoSyncDebounceMs: autoSyncIntervalMs,
		attachmentMaxKb,
		logLevel,
		viewMode,
	} = result.value;

	// Applied before the check below, so an environment-supplied actor is a
	// complete identity on a machine whose config has none.
	const actorResult = resolveEnvActor({userId, userName});
	if (isFail(actorResult)) return failed(actorResult.message);

	const actor = actorResult.value ?? {userId, userName};

	if (!actor.userName || !actor.userId) {
		return failed(
			`User name or ID not configured in ~/${GLOBAL_CONFIG_DIR_NAME}/config.json`,
		);
	}

	process.env['OME_LOG_LEVEL'] = logLevel;

	return succeeded('successfully loaded settings', {
		// Not a config value. Config knows nothing about git, so this is cleared
		// here and filled by whoever boots, from the repository they booted in.
		gitEmail: null,
		gitName: null,
		declinedEmailBoards: declinedEmailBoards ?? [],
		logLevel: logLevel ?? 'debug',
		preferredEditor: preferredEditor ?? '',
		userName: actor.userName,
		userId: actor.userId,
		autoSync: autoSync ?? false,
		autoSyncIntervalMs: autoSyncIntervalMs ?? DEFAULT_AUTO_SYNC_INTERVAL_MS,
		attachmentMaxKb: attachmentMaxKb ?? null,
		viewMode: viewMode ?? 'dense',
	});
};
