import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach} from 'vitest';

/**
 * A throwaway project root carrying a real `.ome/project.json`.
 *
 * `.ome/project.json` is this machine's project identity, not repository
 * content, so it is untracked and every fresh clone starts without one. Suites
 * that boot a board still need a descriptor: booting reads it from
 * `resolveClosestOmeProjectRoot(process.cwd())`, and these suites used to find
 * the one the checkout happened to carry. Each one makes its own root instead,
 * so nothing has to be committed and no test writes into the checkout.
 */

const DEFAULT_PROJECT_ID = '01J000000000000000000WSPC';

const created: string[] = [];

const makeProjectRoot = (projectId: string = DEFAULT_PROJECT_ID): string => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ome-project-root-'));

	fs.mkdirSync(path.join(root, '.ome'), {recursive: true});
	fs.writeFileSync(
		path.join(root, '.ome', 'project.json'),
		JSON.stringify(
			{
				projectId,
				stateBranch: '__ome_state__',
				createdAt: new Date().toISOString(),
			},
			null,
			2,
		) + '\n',
		'utf8',
	);

	created.push(root);

	return root;
};

/**
 * Registers one fresh project root per test and clears every root the file made
 * afterwards. Returns the getter a `vi.mock` factory resolves through, since a
 * factory is written before the test that uses it exists.
 */
export const useProjectRoot = (): (() => string) => {
	let root: string | null = null;

	beforeEach(() => {
		root = makeProjectRoot();
	});

	afterEach(() => {
		root = null;

		for (const dir of created.splice(0)) {
			fs.rmSync(dir, {recursive: true, force: true});
		}
	});

	// Answered even before the first `beforeEach`, for anything that resolves a
	// project while the file is still being imported.
	return () => {
		root ??= makeProjectRoot();

		return root;
	};
};
