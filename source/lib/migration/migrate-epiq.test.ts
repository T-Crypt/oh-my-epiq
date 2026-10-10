import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {GIT_BIN} from '../../git/git-utils.js';
import {isFail, Result} from '../model/result-types.js';
import {
	LEGACY_GLOBAL_DIR_ENV,
	migrateEpiqProject,
	planEpiqMigration,
	resolveClosestLegacyProjectRoot,
} from './migrate-epiq.js';

// Migration renames a board's scaffolding and commits that to the state branch.
// These tests run it against real repositories and assert the end state — the
// point is the git operations, so mocking them would test nothing.
const unwrap = <T>(result: Result<T>): T => {
	if (isFail(result)) throw new Error(result.message);
	return result.value;
};

const gitIn = (repo: string, args: string[]): string =>
	execFileSync(GIT_BIN, args, {cwd: repo, encoding: 'utf8'}).trim();

const write = (repo: string, name: string, body: string): void => {
	const full = path.join(repo, name);
	fs.mkdirSync(path.dirname(full), {recursive: true});
	fs.writeFileSync(full, body);
};

const PROJECT_ID = '01M1YMMJYNZ09GRZH6CZBBPZ5G';

type Fixture = {
	root: string;
	repo: string;
	legacyGlobal: string;
	global: string;
	worktree: string;
};

const created: string[] = [];

const makeLegacyProject = (): Fixture => {
	const root = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), 'ome-migrate-')),
	);
	created.push(root);

	const repo = path.join(root, 'repo');
	const legacyGlobal = path.join(root, '.epiq-global');
	const global = path.join(root, '.ome-global');
	const worktree = path.join(legacyGlobal, 'worktrees', PROJECT_ID);

	fs.mkdirSync(repo, {recursive: true});
	gitIn(repo, ['init', '-q', '--initial-branch=main', '.']);
	gitIn(repo, ['config', 'user.name', 'Test']);
	gitIn(repo, ['config', 'user.email', 'test@example.com']);

	const descriptor = `${JSON.stringify(
		{
			projectId: PROJECT_ID,
			stateBranch: '__epiq_state__',
			createdAt: '2026-09-07T19:13:36.213Z',
		},
		null,
		2,
	)}\n`;

	// The checkout descriptor, on the project branch.
	write(repo, '.epiq/project.json', descriptor);
	write(
		repo,
		'.gitignore',
		'# exception is the epiq board pointer, which every checkout needs.\n.epiq/*\n!.epiq/project.json\n',
	);
	gitIn(repo, ['add', '-A']);
	gitIn(repo, ['commit', '-qm', 'init']);

	// The state branch, an orphan history holding only `.epiq/`, checked out
	// under the legacy global directory — the shape Epiq leaves behind.
	fs.mkdirSync(path.dirname(worktree), {recursive: true});
	gitIn(repo, [
		'worktree',
		'add',
		'-q',
		'--orphan',
		'-b',
		'__epiq_state__',
		worktree,
	]);
	write(worktree, '.epiq/project.json', descriptor);
	write(worktree, '.epiq/events/0001.jsonl', '{"type":"created"}\n');
	gitIn(worktree, ['add', '-A']);
	gitIn(worktree, ['commit', '-qm', 'state init']);

	return {root, repo, legacyGlobal, global, worktree};
};

// The module reads both directories from the environment, so the test points
// them at its own temp root rather than the developer's real home.
const useFixtureEnv = (fixture: Fixture): void => {
	process.env[LEGACY_GLOBAL_DIR_ENV] = fixture.legacyGlobal;
	process.env['OME_GLOBAL_DIR'] = fixture.global;
};

const savedEnv = {
	legacy: process.env[LEGACY_GLOBAL_DIR_ENV],
	ome: process.env['OME_GLOBAL_DIR'],
};

afterEach(() => {
	while (created.length) {
		fs.rmSync(created.pop()!, {recursive: true, force: true});
	}

	if (savedEnv.legacy === undefined) delete process.env[LEGACY_GLOBAL_DIR_ENV];
	else process.env[LEGACY_GLOBAL_DIR_ENV] = savedEnv.legacy;

	if (savedEnv.ome === undefined) delete process.env['OME_GLOBAL_DIR'];
	else process.env['OME_GLOBAL_DIR'] = savedEnv.ome;
});

describe('planEpiqMigration', () => {
	it('names every step and changes nothing', async () => {
		const fixture = makeLegacyProject();
		useFixtureEnv(fixture);

		const plan = unwrap(await planEpiqMigration({repoRoot: fixture.repo}));

		expect(plan.actions.map(a => a.id)).toEqual([
			'rename-checkout-dir',
			'rewrite-checkout-project',
			'update-gitignore',
			'rename-state-branch',
			'move-global-dir',
			'repair-worktree',
			'rewrite-state-project',
			'commit-state-branch',
			'commit-checkout',
		]);

		// Nothing moved.
		expect(fs.existsSync(path.join(fixture.repo, '.epiq'))).toBe(true);
		expect(fs.existsSync(path.join(fixture.repo, '.ome'))).toBe(false);
		expect(fs.existsSync(fixture.global)).toBe(false);
		expect(fs.existsSync(fixture.legacyGlobal)).toBe(true);
		expect(
			gitIn(fixture.repo, [
				'branch',
				'--list',
				'--format=%(refname:short)',
				'__epiq_state__',
			]),
		).toBe('__epiq_state__');
	});
});

describe('migrateEpiqProject', () => {
	it('moves the checkout, the global directory, and the state branch', async () => {
		const fixture = makeLegacyProject();
		useFixtureEnv(fixture);

		const report = unwrap(
			await migrateEpiqProject({repoRoot: fixture.repo, dryRun: false}),
		);

		expect(report.dryRun).toBe(false);
		expect(report.backupDir).not.toBeNull();
		expect(fs.existsSync(report.backupDir!)).toBe(true);

		// Checkout descriptor renamed and repointed.
		expect(fs.existsSync(path.join(fixture.repo, '.epiq'))).toBe(false);
		const checkoutDescriptor = JSON.parse(
			fs.readFileSync(path.join(fixture.repo, '.ome/project.json'), 'utf8'),
		) as {stateBranch: string; projectId: string};
		expect(checkoutDescriptor.stateBranch).toBe('__ome_state__');
		expect(checkoutDescriptor.projectId).toBe(PROJECT_ID);

		// Global directory moved; the worktree came with it.
		expect(fs.existsSync(fixture.legacyGlobal)).toBe(false);
		const newWorktree = path.join(fixture.global, 'worktrees', PROJECT_ID);
		expect(fs.existsSync(newWorktree)).toBe(true);
		expect(
			fs.existsSync(path.join(newWorktree, '.ome/events/0001.jsonl')),
		).toBe(true);
		expect(fs.existsSync(path.join(newWorktree, '.epiq'))).toBe(false);

		// Branch renamed, and the worktree registration follows it.
		expect(
			gitIn(fixture.repo, [
				'branch',
				'--list',
				'--format=%(refname:short)',
				'__ome_state__',
			]),
		).toBe('__ome_state__');
		const worktreeList = gitIn(fixture.repo, [
			'worktree',
			'list',
			'--porcelain',
		]);
		expect(worktreeList).toContain(newWorktree);
		expect(worktreeList).toContain('branch refs/heads/__ome_state__');
		expect(worktreeList).not.toContain('__epiq_state__');

		// The state branch carries the renamed identity.
		const branchIdentity = JSON.parse(
			gitIn(fixture.repo, ['show', '__ome_state__:.ome/project.json']),
		) as {stateBranch: string};
		expect(branchIdentity.stateBranch).toBe('__ome_state__');
		expect(
			gitIn(fixture.repo, ['ls-tree', '--name-only', '__ome_state__']),
		).toContain('.ome');

		// The ignore block moved with it.
		const gitignore = fs.readFileSync(
			path.join(fixture.repo, '.gitignore'),
			'utf8',
		);
		expect(gitignore).toContain('.ome/*');
		expect(gitignore).toContain('!.ome/project.json');
		expect(gitignore).not.toContain('.epiq');
	});

	it('is idempotent: a second run finds nothing to do', async () => {
		const fixture = makeLegacyProject();
		useFixtureEnv(fixture);

		unwrap(await migrateEpiqProject({repoRoot: fixture.repo, dryRun: false}));
		const second = unwrap(
			await migrateEpiqProject({repoRoot: fixture.repo, dryRun: false}),
		);

		expect(second.plan.actions).toEqual([]);
		expect(second.applied).toEqual([]);
	});

	it('dry run reports the plan and leaves everything in place', async () => {
		const fixture = makeLegacyProject();
		useFixtureEnv(fixture);

		const report = unwrap(
			await migrateEpiqProject({repoRoot: fixture.repo, dryRun: true}),
		);

		expect(report.dryRun).toBe(true);
		expect(report.applied).toEqual([]);
		expect(fs.existsSync(path.join(fixture.repo, '.epiq/project.json'))).toBe(
			true,
		);
		expect(fs.existsSync(fixture.global)).toBe(false);
	});
});

describe('resolveClosestLegacyProjectRoot', () => {
	it('walks up to the directory holding .epiq/project.json', () => {
		const fixture = makeLegacyProject();
		const nested = path.join(fixture.repo, 'packages/app');
		fs.mkdirSync(nested, {recursive: true});

		expect(unwrap(resolveClosestLegacyProjectRoot(nested))).toBe(fixture.repo);
	});
});
