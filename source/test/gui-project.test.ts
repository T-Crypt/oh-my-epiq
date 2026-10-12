import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../mcp/ome-api.js', () => ({
	getGuiState: vi.fn(),
}));

vi.mock('../git/git-storage.js', () => ({
	getStateBranchRoot: vi.fn(),
}));

vi.mock('../lib/board/board-log.js', () => ({
	loadMergedEventsWithUnreadable: vi.fn(),
	materializeAndPersistAll: vi.fn(),
}));

vi.mock('../lib/config/user-config.js', () => ({
	loadSettingsFromConfig: vi.fn(),
}));

import {getStateBranchRoot} from '../git/git-storage.js';
import {getGuiState} from '../mcp/ome-api.js';
import {
	loadMergedEventsWithUnreadable,
	materializeAndPersistAll,
} from '../lib/board/board-log.js';
import {loadSettingsFromConfig} from '../lib/config/user-config.js';
import {failed, isFail, succeeded} from '../lib/model/result-types.js';
import {NO_PROJECT_MESSAGE} from '../lib/storage/paths.js';
import {NO_WORKSPACE_INIT_MESSAGE} from '../lib/board/board-boot.js';
import {
	detectProjectState,
	repairWorkspace,
} from '../gui/api/lib/gui-project.js';
import {recordRecentProject} from '../lib/config/recent-projects.js';

const tempDirs: string[] = [];

const makeTempDir = (): string => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ome-gui-project-'));
	tempDirs.push(dir);
	return dir;
};

const makeProject = (projectId: string): string => {
	const root = path.join(makeTempDir(), projectId);
	fs.mkdirSync(path.join(root, '.ome'), {recursive: true});
	fs.writeFileSync(
		path.join(root, '.ome', 'project.json'),
		JSON.stringify({
			projectId,
			stateBranch: '__ome_state__',
			createdAt: new Date().toISOString(),
		}),
	);
	return root;
};

describe('detectProjectState', () => {
	let originalGlobalDir: string | undefined;

	beforeEach(() => {
		vi.clearAllMocks();
		originalGlobalDir = process.env['OME_GLOBAL_DIR'];
		process.env['OME_GLOBAL_DIR'] = path.join(makeTempDir(), '.ome-global');
	});

	afterEach(() => {
		if (originalGlobalDir === undefined) delete process.env['OME_GLOBAL_DIR'];
		else process.env['OME_GLOBAL_DIR'] = originalGlobalDir;

		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, {recursive: true, force: true});
		}
	});

	it('refuses a relative path', async () => {
		const result = await detectProjectState('relative/path');

		expect(result.status).not.toBe('success');
	});

	it('refuses a missing directory', async () => {
		const result = await detectProjectState('/no/such/dir');

		expect(result.status).not.toBe('success');
	});

	it('reports none for a directory without OME state', async () => {
		const bare = makeTempDir();
		vi.mocked(getGuiState).mockResolvedValue(failed(NO_PROJECT_MESSAGE));

		const result = await detectProjectState(bare);

		expect(result.status).toBe('success');
		if (isFail(result)) return;
		expect(result.value.slot).toBe('none');
		expect(result.value.root).toBe(bare);
	});

	it('reports ready when the board boots', async () => {
		const root = makeProject('01WSPICK000000000000000001');
		recordRecentProject({root, now: 1});
		vi.mocked(getGuiState).mockResolvedValue(
			succeeded('state', {marker: root} as never),
		);

		const result = await detectProjectState(root);

		expect(result.status).toBe('success');
		if (isFail(result)) return;
		expect(result.value.slot).toBe('ready');
	});

	it('reports half when the log never recorded its genesis', async () => {
		const root = makeProject('01WSPICK000000000000000002');
		vi.mocked(getGuiState).mockResolvedValue(failed(NO_WORKSPACE_INIT_MESSAGE));

		const result = await detectProjectState(root);

		expect(result.status).toBe('success');
		if (isFail(result)) return;
		expect(result.value.slot).toBe('half');
	});

	it('leaves a transient failure an error, not a slot', async () => {
		const root = makeProject('01WSPICK000000000000000003');
		vi.mocked(getGuiState).mockResolvedValue(failed('git lock held'));

		const result = await detectProjectState(root);

		expect(result.status).not.toBe('success');
	});
});

describe('repairWorkspace', () => {
	let originalGlobalDir: string | undefined;

	beforeEach(() => {
		vi.clearAllMocks();
		originalGlobalDir = process.env['OME_GLOBAL_DIR'];
		process.env['OME_GLOBAL_DIR'] = path.join(makeTempDir(), '.ome-global');
	});

	afterEach(() => {
		if (originalGlobalDir === undefined) delete process.env['OME_GLOBAL_DIR'];
		else process.env['OME_GLOBAL_DIR'] = originalGlobalDir;

		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, {recursive: true, force: true});
		}
	});

	it('writes the missing genesis to an empty log and boots', async () => {
		const root = makeProject('01WSPICK000000000000000004');
		vi.mocked(getGuiState)
			.mockResolvedValueOnce(failed(NO_WORKSPACE_INIT_MESSAGE))
			.mockResolvedValueOnce(succeeded('state', {marker: root} as never));
		vi.mocked(getStateBranchRoot).mockReturnValue(
			succeeded('branch root', '/state'),
		);
		vi.mocked(loadMergedEventsWithUnreadable).mockReturnValue(
			succeeded('loaded', {events: [], unreadable: []}),
		);
		vi.mocked(loadSettingsFromConfig).mockReturnValue(
			succeeded('settings', {
				userId: 'user-1',
				userName: 'Ada',
				autoSync: false,
				autoSyncIntervalMs: 0,
			} as never),
		);
		vi.mocked(materializeAndPersistAll).mockReturnValue(
			succeeded('persisted', {persisted: true} as never),
		);

		const result = await repairWorkspace(root);

		expect(result.status).toBe('success');
		if (isFail(result)) return;
		expect(result.value.slot).toBe('ready');

		const persisted = vi.mocked(materializeAndPersistAll).mock.calls[0]?.[0];
		expect(persisted).toHaveLength(1);
		expect(persisted?.[0]).toEqual(
			expect.objectContaining({action: 'init.workspace'}),
		);
	});

	it('refuses a log that holds events but no genesis', async () => {
		const root = makeProject('01WSPICK000000000000000005');
		vi.mocked(getGuiState).mockResolvedValue(failed(NO_WORKSPACE_INIT_MESSAGE));
		vi.mocked(getStateBranchRoot).mockReturnValue(
			succeeded('branch root', '/state'),
		);
		vi.mocked(loadMergedEventsWithUnreadable).mockReturnValue(
			succeeded('loaded', {
				events: [{action: 'create.contributor'}] as never[],
				unreadable: [],
			}),
		);

		const result = await repairWorkspace(root);

		expect(result.status).not.toBe('success');
		expect(materializeAndPersistAll).not.toHaveBeenCalled();
	});

	it('refuses when nothing is missing', async () => {
		const root = makeProject('01WSPICK000000000000000006');
		vi.mocked(getGuiState).mockResolvedValue(
			succeeded('state', {marker: root} as never),
		);

		const result = await repairWorkspace(root);

		expect(result.status).not.toBe('success');
		expect(materializeAndPersistAll).not.toHaveBeenCalled();
	});
});
