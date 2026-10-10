import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ACTOR_NAME_ENV} from '../../lib/config/actor-env.js';
import {getOmeConfigPath, readOmeConfig} from '../../lib/config/user-config.js';
import {isFail} from '../../lib/model/result-types.js';
import {listBoards} from '../ome-api.js';
import {initProjectTool} from '../ome-init.js';
import {
	cloneRepo,
	commitFile,
	initBareRepo,
	makeTempDir,
	useTempHome,
} from '../../test/helpers/git-repo.js';

useTempHome();

// Each test gets a global dir of its own, so config.json starts empty.
let originalGlobalDir: string | undefined;

beforeEach(() => {
	originalGlobalDir = process.env['OME_GLOBAL_DIR'];
	process.env['OME_GLOBAL_DIR'] = makeTempDir();
	delete process.env[ACTOR_NAME_ENV];
});

afterEach(() => {
	process.env['OME_GLOBAL_DIR'] = originalGlobalDir;
	delete process.env[ACTOR_NAME_ENV];
	vi.restoreAllMocks();
});

const setupPlainRepo = async () => {
	const remoteRoot = makeTempDir();
	const repoRoot = makeTempDir();

	await initBareRepo(remoteRoot);
	await cloneRepo({remoteRoot, cloneRoot: repoRoot});
	await commitFile({
		repoRoot,
		fileName: 'README.md',
		content: 'hello\n',
		message: 'initial',
	});

	return {remoteRoot, repoRoot};
};

const readConfig = () => {
	const result = readOmeConfig();
	if (isFail(result)) throw new Error(result.message);
	return result.value;
};

const answers = {userName: 'Jo', preferredEditor: 'vim', autoSync: false};

describe('ome_project_init', () => {
	it('asks for every setup answer when the machine has none, writing nothing', async () => {
		const {repoRoot} = await setupPlainRepo();

		const result = await initProjectTool({repoRoot});

		expect(isFail(result)).toBe(true);
		expect(result.message).toContain('Ask the user for:');
		expect(result.message).toContain('userName');
		expect(result.message).toContain('preferredEditor');
		expect(result.message).toContain('autoSync');
		expect(fs.existsSync(path.join(repoRoot, '.ome'))).toBe(false);
		expect(fs.existsSync(getOmeConfigPath())).toBe(false);
	});

	it('keeps a partial answer and asks only for the rest', async () => {
		const {repoRoot} = await setupPlainRepo();

		const result = await initProjectTool({repoRoot, userName: 'Jo'});

		expect(isFail(result)).toBe(true);
		expect(result.message).not.toContain('userName');
		expect(result.message).toContain('preferredEditor');
		expect(result.message).toContain('autoSync');

		const config = readConfig();
		expect(config.userName).toBe('Jo');
		expect(config.userId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
		expect(fs.existsSync(path.join(repoRoot, '.ome'))).toBe(false);
	});

	it('treats autoSync false as answered', async () => {
		const {repoRoot} = await setupPlainRepo();

		const result = await initProjectTool({
			repoRoot,
			userName: 'Jo',
			autoSync: false,
		});

		expect(isFail(result)).toBe(true);
		expect(result.message).toContain('preferredEditor');
		expect(result.message).not.toContain('autoSync');
		expect(readConfig().autoSync).toBe(false);
	});

	it('sets up the board once every answer is in, and the other tools then work there', async () => {
		const {repoRoot} = await setupPlainRepo();

		const result = await initProjectTool({repoRoot, ...answers});
		if (isFail(result)) throw new Error(result.message);

		expect(result.message).toBe('Project initialized');
		expect(result.value.warnings).toEqual([]);
		expect(result.value.user.userName).toBe('Jo');
		expect(result.value.repoRoot).toBe(fs.realpathSync(repoRoot));

		const config = readConfig();
		expect(config).toMatchObject(answers);
		expect(config.userId).toBe(result.value.user.userId);

		const boards = await listBoards({repoRoot});
		if (isFail(boards)) throw new Error(boards.message);
		expect(boards.value.map(board => board.title)).toContain('Default');
	});

	it('refuses to change an answer the machine already has', async () => {
		const {repoRoot} = await setupPlainRepo();
		const first = await initProjectTool({repoRoot, ...answers});
		if (isFail(first)) throw new Error(first.message);

		const {repoRoot: secondRepo} = await setupPlainRepo();
		const renamed = await initProjectTool({
			repoRoot: secondRepo,
			userName: 'Jo Renamed',
		});
		expect(isFail(renamed)).toBe(true);
		expect(renamed.message).toContain('already set up with userName "Jo"');

		const otherEditor = await initProjectTool({
			repoRoot: secondRepo,
			preferredEditor: 'code --wait',
		});
		expect(isFail(otherEditor)).toBe(true);
		expect(otherEditor.message).toContain('preferredEditor "vim"');

		const otherSync = await initProjectTool({
			repoRoot: secondRepo,
			autoSync: true,
		});
		expect(isFail(otherSync)).toBe(true);
		expect(otherSync.message).toContain('autoSync false');

		expect(readConfig()).toMatchObject(answers);
		expect(fs.existsSync(path.join(secondRepo, '.ome'))).toBe(false);
	});

	it('accepts the answers it already has, and keeps the user id', async () => {
		const {repoRoot} = await setupPlainRepo();
		const first = await initProjectTool({repoRoot, ...answers});
		if (isFail(first)) throw new Error(first.message);

		const {repoRoot: secondRepo} = await setupPlainRepo();
		const second = await initProjectTool({repoRoot: secondRepo, ...answers});
		if (isFail(second)) throw new Error(second.message);

		expect(second.value.user.userId).toBe(first.value.user.userId);
	});

	it('mints an id for a configured name that has none', async () => {
		const {repoRoot} = await setupPlainRepo();
		fs.mkdirSync(path.dirname(getOmeConfigPath()), {recursive: true});
		fs.writeFileSync(
			getOmeConfigPath(),
			JSON.stringify({logLevel: 'info', userName: 'Jo'}),
		);

		const result = await initProjectTool({
			repoRoot,
			preferredEditor: 'vim',
			autoSync: false,
		});
		if (isFail(result)) throw new Error(result.message);

		expect(result.value.user.userName).toBe('Jo');
		expect(readConfig().userId).toBe(result.value.user.userId);
		expect(result.value.user.userId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
	});

	it("refuses the agent's own name as the user's", async () => {
		const {repoRoot} = await setupPlainRepo();
		process.env[ACTOR_NAME_ENV] = 'claude/peter';

		const result = await initProjectTool({
			repoRoot,
			...answers,
			userName: 'Claude/Peter',
		});

		expect(isFail(result)).toBe(true);
		expect(result.message).toContain("this agent's own identity");
		expect(fs.existsSync(getOmeConfigPath())).toBe(false);
	});

	it("passes the init core's refusal through", async () => {
		const {repoRoot} = await setupPlainRepo();
		const first = await initProjectTool({repoRoot, ...answers});
		if (isFail(first)) throw new Error(first.message);

		const second = await initProjectTool({repoRoot});

		expect(isFail(second)).toBe(true);
		expect(second.message).toBe('[4] OME project already initialized');
	});
});
