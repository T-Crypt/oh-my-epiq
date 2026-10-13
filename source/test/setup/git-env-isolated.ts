/**
 * Agent shells inject git config through the environment
 * (`GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_i` / `GIT_CONFIG_VALUE_i` — e.g. a
 * push guard's `core.hooksPath`). `git-utils` snapshots `process.env` into
 * `gitEnv` at module load and passes it as the env of every git child it
 * spawns, so clearing the keys from `process.env` here cannot reach them:
 * the snapshot was already taken. Stripped from the `gitEnv` object itself,
 * no fixture that pushes into a bare remote trips a host hook, whatever the
 * surrounding shell carries.
 */
import {gitEnv} from '../../git/git-utils.js';

// The spread into the snapshot drops `process.env`'s index signature from the
// inferred type, so delete through the wider one.
const env: NodeJS.ProcessEnv = gitEnv;

for (const key of Object.keys(env)) {
	if (key.startsWith('GIT_CONFIG_')) delete env[key];
}
