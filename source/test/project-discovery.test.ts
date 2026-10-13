import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
	discoverOmeProjectRoots,
	getProjectSearchRoots,
	listRecentProjects,
	readRecentProjects,
	reconcileRecentProjects,
	recordRecentProject,
} from '../lib/config/recent-projects.js';
import {isFail, Result} from '../lib/model/result-types.js';

const tempDirs: string[] = [];

const track = (dir: string): string => {
	tempDirs.push(dir);
	return dir;
};

const makeRoot = (): string =>
	track(fs.mkdtempSync(path.join(os.tmpdir(), 'ome-disc-')));

const makeProject = (
	parent: string,
	name: string,
	projectId: string,
): string => {
	const root = path.join(parent, name);
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

const unwrap = <T>(result: Result<T>): T => {
	if (isFail(result)) throw new Error(result.message);
	return result.value;
};

let originalGlobalDir: string | undefined;
let originalRoots: string | undefined;
let originalScan: string | undefined;

beforeEach(() => {
	originalGlobalDir = process.env['OME_GLOBAL_DIR'];
	originalRoots = process.env['OME_PROJECT_ROOTS'];
	originalScan = process.env['OME_PROJECT_SCAN'];
	process.env['OME_GLOBAL_DIR'] = path.join(makeRoot(), '.ome-global');
	delete process.env['OME_PROJECT_SCAN'];
});

afterEach(() => {
	if (originalGlobalDir === undefined) delete process.env['OME_GLOBAL_DIR'];
	else process.env['OME_GLOBAL_DIR'] = originalGlobalDir;
	if (originalRoots === undefined) delete process.env['OME_PROJECT_ROOTS'];
	else process.env['OME_PROJECT_ROOTS'] = originalRoots;
	if (originalScan === undefined) delete process.env['OME_PROJECT_SCAN'];
	else process.env['OME_PROJECT_SCAN'] = originalScan;
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, {recursive: true, force: true});
	}
});

describe('getProjectSearchRoots', () => {
	it('prefers OME_PROJECT_ROOTS when set', () => {
		process.env['OME_PROJECT_ROOTS'] = '/a:/b';
		expect(getProjectSearchRoots()).toEqual(['/a', '/b']);
	});
});

describe('discoverOmeProjectRoots', () => {
	it('finds projects nested under a search root', () => {
		const search = makeRoot();
		const first = makeProject(search, 'alpha', 'p-alpha');
		const nested = path.join(search, 'group');
		fs.mkdirSync(nested, {recursive: true});
		const second = makeProject(nested, 'beta', 'p-beta');

		const found = discoverOmeProjectRoots({roots: [search]});

		expect(found.sort()).toEqual([first, second].sort());
	});

	it('skips node_modules subtrees', () => {
		const search = makeRoot();
		makeProject(path.join(search, 'node_modules', 'dep'), 'inner', 'p-inner');

		expect(discoverOmeProjectRoots({roots: [search]})).toEqual([]);
	});

	it('tolerates a missing search root', () => {
		expect(
			discoverOmeProjectRoots({roots: [path.join(makeRoot(), 'nope')]}),
		).toEqual([]);
	});
});

describe('reconcileRecentProjects', () => {
	it('registers a board initialised outside the GUI', () => {
		const search = makeRoot();
		const root = makeProject(search, 'outside', 'p-outside');
		expect(unwrap(readRecentProjects())).toEqual([]);

		const reconciled = unwrap(reconcileRecentProjects({roots: [search]}));

		expect(reconciled.map(entry => entry.root)).toContain(root);
		expect(unwrap(listRecentProjects()).map(entry => entry.root)).toContain(
			root,
		);
	});

	it('keeps the existing lastOpenedAt for opened projects', () => {
		const search = makeRoot();
		const root = makeProject(search, 'known', 'p-known');
		recordRecentProject({root, now: 42});

		const reconciled = unwrap(reconcileRecentProjects({roots: [search]}));

		expect(reconciled.find(entry => entry.root === root)?.lastOpenedAt).toBe(
			42,
		);
	});

	it('leaves the registry alone when there is nothing new', () => {
		const search = makeRoot();
		const root = makeProject(search, 'solo', 'p-solo');
		recordRecentProject({root, now: 7});

		const reconciled = unwrap(reconcileRecentProjects({roots: [search]}));

		expect(reconciled.map(entry => entry.root)).toEqual([root]);
	});
});
