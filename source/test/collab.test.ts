import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ulid} from 'ulid';

vi.mock('../lib/board/board-log.js', async () => {
	const actual = await vi.importActual<
		typeof import('../lib/board/board-log.js')
	>('../lib/board/board-log.js');

	return {
		...actual,
		loadMergedEvents: vi.fn(() => ({
			status: 'success',
			message: 'mocked load',
			value: [],
		})),
		materializeAndPersistAll: vi.fn((events: never[], rootDir: string) => {
			(actual.materializeAndPersistAll as typeof materializeAndPersistAll)(
				events,
				'/state',
			);
			return {
				status: 'success',
				message: 'mocked persist',
				value: {rootDir},
			};
		}),
	};
});

vi.mock('../mcp/api/boot.js', () => ({
	bootedWithActorAndState: vi.fn(),
}));

import {materializeAll} from '../lib/board/board-log.js';
import {materializeAndPersistAll} from '../lib/board/board-log.js';
import {AppEvent} from '../lib/board/board-events.model.js';
import {collabRepo, clearCollabMessages} from '../lib/collab/collab-repo.js';
import {isFail} from '../lib/model/result-types.js';
import {nodes} from '../lib/state/node-builder.js';
import {initWorkspaceState} from '../lib/state/state.js';
import {bigIntToHex} from '../lib/utils/rank.js';
import {bootedWithActorAndState} from '../mcp/api/boot.js';
import {
	claimCollabMessage,
	listCollabMessages,
	pinCollabMessage,
	postCollabMessage,
	resolveCollabMessage,
} from '../mcp/api/collab.js';

const tempDirs: string[] = [];

const makeTempDir = (): string => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ome-collab-'));
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

const actor = {userId: 'user-1'};

const boot = (repoRoot: string, stateBranchRoot = '/state') => {
	vi.mocked(bootedWithActorAndState).mockResolvedValue({
		status: 'success',
		message: 'booted',
		value: {
			actor,
			state: {nodes: {}},
			boot: {repoRoot, stateBranchRoot},
		},
	} as never);
};

const postEvent = (
	action: 'collab.post',
	payload: Extract<AppEvent, {action: 'collab.post'}>['payload'],
): Extract<AppEvent, {action: 'collab.post'}> => ({
	id: ulid(),
	action,
	payload,
	...actor,
});

beforeEach(() => {
	vi.clearAllMocks();
	clearCollabMessages();

	const rankResult = bigIntToHex(1n);
	if (isFail(rankResult)) throw new Error(rankResult.message);

	initWorkspaceState(
		nodes.workspace('test-root', 'Test Root', rankResult.value),
	);
});

describe('collab repo', () => {
	it('posts a note that stays open and unpinned', () => {
		const result = collabRepo.post({
			id: ulid(),
			channel: 'global',
			kind: 'note',
			body: 'heads up',
			authorId: 'user-1',
			createdAt: 1,
		});

		expect(isFail(result)).toBe(false);
		if (isFail(result)) return;
		expect(result.value.status).toBe('open');
		expect(result.value.pinned).toBe(false);
	});

	it('moves a request through claimed to resolved', () => {
		const id = ulid();
		collabRepo.post({
			id,
			channel: 'global',
			kind: 'request',
			body: 'need review',
			authorId: 'user-1',
			createdAt: 1,
		});

		expect(collabRepo.claim(id).value?.status).toBe('claimed');
		expect(collabRepo.resolve(id).value?.status).toBe('resolved');
	});

	it('refuses to claim a note or claim twice', () => {
		const id = ulid();
		collabRepo.post({
			id,
			channel: 'global',
			kind: 'note',
			body: 'fyi',
			authorId: 'user-1',
			createdAt: 1,
		});

		expect(isFail(collabRepo.claim(id))).toBe(true);

		const request = ulid();
		collabRepo.post({
			id: request,
			channel: 'local',
			kind: 'request',
			body: 'help',
			authorId: 'user-1',
			createdAt: 2,
		});
		collabRepo.claim(request);
		expect(isFail(collabRepo.claim(request))).toBe(true);
		expect(isFail(collabRepo.resolve(ulid()))).toBe(true);
	});

	it('lists pins first, then oldest first', () => {
		const first = ulid();
		const second = ulid();
		collabRepo.post({
			id: first,
			channel: 'global',
			kind: 'note',
			body: 'first',
			authorId: 'user-1',
			createdAt: 1,
		});
		collabRepo.post({
			id: second,
			channel: 'global',
			kind: 'note',
			body: 'second',
			authorId: 'user-1',
			createdAt: 2,
		});
		collabRepo.pin(second, true);

		expect(collabRepo.list().map(m => m.id)).toEqual([second, first]);
		expect(collabRepo.list({channel: 'local'} as never).map(m => m.id)).toEqual(
			[],
		);
	});
});

describe('collab events', () => {
	it('materializes a post through the log', () => {
		const id = ulid();
		materializeAll([
			postEvent('collab.post', {
				id,
				channel: 'global',
				kind: 'handoff',
				body: 'take this',
			}),
		]);

		expect(collabRepo.get(id)?.kind).toBe('handoff');
		expect(collabRepo.get(id)?.authorId).toBe('user-1');
	});

	it('skips a post with an unknown channel or kind', () => {
		const badChannel = ulid();
		materializeAll([
			postEvent('collab.post', {
				id: badChannel,
				channel: 'everywhere',
				kind: 'note',
				body: 'x',
			} as never),
		]);

		expect(collabRepo.get(badChannel)).toBeUndefined();
	});
});

describe('collab api', () => {
	let originalGlobalDir: string | undefined;
	let repoRoot: string;

	beforeEach(() => {
		originalGlobalDir = process.env['OME_GLOBAL_DIR'];
		process.env['OME_GLOBAL_DIR'] = path.join(makeTempDir(), '.ome-global');
		repoRoot = makeProject('01COLLAB000000000000000001');
		boot(repoRoot);
	});

	afterEach(() => {
		if (originalGlobalDir === undefined) delete process.env['OME_GLOBAL_DIR'];
		else process.env['OME_GLOBAL_DIR'] = originalGlobalDir;

		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, {recursive: true, force: true});
		}
	});

	it('persists global to the state branch and local to the sidecar', async () => {
		const global = await postCollabMessage({
			repoRoot,
			kind: 'note',
			body: 'synced',
		});
		const local = await postCollabMessage({
			repoRoot,
			channel: 'local',
			kind: 'note',
			body: 'unsynced',
		});

		expect(isFail(global)).toBe(false);
		expect(isFail(local)).toBe(false);

		const roots = vi
			.mocked(materializeAndPersistAll)
			.mock.calls.map(call => call[1]);
		expect(roots).toEqual([
			'/state',
			expect.stringContaining(
				path.join('collab', '01COLLAB000000000000000001'),
			),
		]);
	});

	it('refuses an empty body and an unknown kind', async () => {
		expect(
			isFail(await postCollabMessage({repoRoot, kind: 'note', body: ' '})),
		).toBe(true);
		expect(
			isFail(
				await postCollabMessage({
					repoRoot,
					kind: 'shout' as never,
					body: 'x',
				}),
			),
		).toBe(true);
	});

	it('claims and resolves through the message channel', async () => {
		const posted = await postCollabMessage({
			repoRoot,
			channel: 'local',
			kind: 'request',
			body: 'help',
		});
		expect(isFail(posted)).toBe(false);
		if (isFail(posted)) return;

		const claimed = await claimCollabMessage({
			repoRoot,
			messageId: posted.value.id,
		});
		expect(isFail(claimed)).toBe(false);

		const resolved = await resolveCollabMessage({
			repoRoot,
			messageId: posted.value.id,
		});
		expect(isFail(resolved)).toBe(false);
		if (isFail(resolved)) return;
		expect(resolved.value.status).toBe('resolved');

		const roots = vi
			.mocked(materializeAndPersistAll)
			.mock.calls.map(call => call[1]);
		expect(
			roots.every(
				root => typeof root === 'string' && root.includes(path.join('collab')),
			),
		).toBe(true);
	});

	it('lists with pins first and filters by channel', async () => {
		await postCollabMessage({repoRoot, kind: 'note', body: 'a'});
		const pinned = await postCollabMessage({
			repoRoot,
			kind: 'note',
			body: 'b',
		});
		if (isFail(pinned)) return;
		await pinCollabMessage({repoRoot, messageId: pinned.value.id});

		const listed = await listCollabMessages({repoRoot});
		expect(isFail(listed)).toBe(false);
		if (isFail(listed)) return;
		expect(listed.value.map(m => m.body)).toEqual(['b', 'a']);

		const localOnly = await listCollabMessages({
			repoRoot,
			channel: 'local',
		});
		if (isFail(localOnly)) return;
		expect(localOnly.value).toEqual([]);
	});
});
