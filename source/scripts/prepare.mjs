#!/usr/bin/env node
// Runs from the `prepare` lifecycle, which fires on `npm install` from a git
// URL or a local folder — the shape of `npm i -g git+https://...` — and on
// `npm pack`/publish, but never when a consumer installs the published
// tarball (that path is covered by `prepack`, which does the full build and
// ships `dist/` inside the tarball).
//
// Two jobs:
// 1. Install the husky git hooks — what `prepare: husky` used to do on its
//    own, kept so a fresh clone still gets commit-msg and pre-push.
// 2. Build `dist/` when its outputs are missing. Git installs never trigger
//    `prepack`, so without this step a `git+` install would link bins at
//    `dist/index.js` and `dist/mcp.js` that do not exist. When both outputs
//    are present it does nothing, so local clones and reinstalls stay fast.
//
// Idempotent: the only case that rebuilds is missing outputs, and the build
// it runs (`build:npm`) starts from a clean `dist/`, so a rerun after a
// partially-finished build converges to the same tree.

import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(command, args) {
	const result = spawnSync(command, args, {cwd: root, stdio: 'inherit'});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

// The exact same build `build:npm` runs, through its npm script so the two
// cannot drift apart.
const BUILD_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Husky v9 no-ops with a message when there is no `.git` (e.g. an npm pack
// staging copy), so it is safe to run everywhere `prepare` runs.
run(process.execPath, [join(root, 'node_modules', 'husky', 'bin.js')]);

const outputs = ['dist/index.js', 'dist/mcp.js'];
const missing = outputs.filter((out) => !existsSync(join(root, out)));

if (missing.length === 0) {
	console.log(`prepare: dist/ is complete, nothing to build`);
} else {
	console.log(`prepare: building dist/ (missing: ${missing.join(', ')})`);
	run(BUILD_COMMAND, ['run', 'build:npm']);
}
