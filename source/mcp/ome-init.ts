import path from 'node:path';
import {ulid} from 'ulid';
import {ACTOR_NAME_ENV} from '../lib/config/actor-env.js';
import {recordRecentProject} from '../lib/config/recent-projects.js';
import {readGitName} from '../lib/config/git-identity.js';
import {readOmeConfig, setConfig} from '../lib/config/user-config.js';
import {failed, isFail, Result, succeeded} from '../lib/model/result-types.js';
import {
	initProject,
	InitProjectOutcome,
} from '../lib/project-setup/init-project.js';
import {logger} from '../logger.js';
import {rememberProjectRoot} from './api/boot.js';
import {createSwimlane, editBoardTitle, listBoards} from './api/boards.js';

// Setting up a board from an agent, without the TUI. The tools here run before
// a project exists, so unlike the rest of the API they never boot: there is no
// project.json to resolve yet, and the board is what they create.

type InitInput = {
	repoRoot?: string;
	userName?: string;
	preferredEditor?: string;
	autoSync?: boolean;
	boardTitle?: string;
	swimlanes?: string[];
};

type BoardSetup = {
	boardId?: string;
	boardTitle?: string;
	swimlanes: {id: string; title: string}[];
};

/**
 * The board an agent sets up next, every time: named after the project rather
 * than "Default", with the lanes it works in. Done here so it is one call, not
 * a board listing plus a title edit plus a write per lane, each a chance to
 * aim at the wrong project. A step that fails is a warning: the project exists
 * by now, and the rest can be done by hand.
 */
const setUpBoard = async (
	repoRoot: string,
	input: InitInput,
	warnings: string[],
): Promise<BoardSetup> => {
	const setup: BoardSetup = {swimlanes: []};

	const boards = await listBoards({repoRoot});
	if (isFail(boards)) {
		warnings.push(`Board setup skipped: ${boards.message}`);
		return setup;
	}

	const board = boards.value.find(b => !b.readonly);
	if (!board) {
		warnings.push('Board setup skipped: no writable board after init');
		return setup;
	}

	setup.boardId = board.id;
	setup.boardTitle = board.title;

	const title = (input.boardTitle ?? path.basename(repoRoot)).trim();
	if (title && title !== board.title) {
		const renamed = await editBoardTitle({repoRoot, boardId: board.id, title});
		if (isFail(renamed)) warnings.push(`Board not renamed: ${renamed.message}`);
		else setup.boardTitle = title;
	}

	for (const lane of input.swimlanes ?? []) {
		const created = await createSwimlane({
			repoRoot,
			boardId: board.id,
			title: lane,
		});
		if (isFail(created)) {
			warnings.push(`Swimlane "${lane}" not created: ${created.message}`);
			continue;
		}

		setup.swimlanes.push({id: created.value.id, title: created.value.title});
	}

	return setup;
};

// What the TUI's setup screen asks for, in its order, with the question the
// agent should put to the user. A board can be written without an editor or
// autosync, but the TUI would greet the user with its setup screen the first
// time they opened it, so the same three fields are required here.
const SETUP_FIELDS = [
	{
		name: 'userName',
		question: 'the name they want to appear under on the board',
	},
	{
		name: 'preferredEditor',
		question:
			'the command that opens a file for editing, e.g. "vim", "nano" or "code --wait"',
	},
	{
		name: 'autoSync',
		question:
			'whether the TUI and GUI should sync with the git remote on their own (true or false)',
	},
] as const;

const normalize = (value: string): string => value.trim().toLowerCase();

/**
 * Sets up a board in a git repository for the configured user, recording the
 * user's setup answers on the way. Called without them on a machine that has
 * none, it says which are missing rather than guessing: the answers are the
 * user's, and the agent is expected to ask and call again. Whatever was given
 * is kept, so the second call needs only the rest.
 */
export const initProjectTool = async (
	input: InitInput = {},
): Promise<
	Result<
		Omit<InitProjectOutcome, 'defaultEvents'> & {
			user: {userId: string; userName: string};
			board: BoardSetup;
		}
	>
> => {
	const configResult = readOmeConfig();
	if (isFail(configResult)) return failed(configResult.message);
	const config = configResult.value;

	const givenName = input.userName?.trim();
	const envActor = (process.env[ACTOR_NAME_ENV] ?? '').trim();

	// The name asked for here is the user's. An agent's own — the one this
	// server was launched with or assumed — would make the agent the configured
	// user, signing everything the TUI and GUI do as the agent from then on.
	if (givenName && envActor && normalize(givenName) === normalize(envActor)) {
		return failed(
			`userName "${givenName}" is this agent's own identity. Pass the user's name, the one they want the TUI and GUI to write as.`,
		);
	}

	// Fills in what the machine lacks and never changes what it has: a
	// different name here would rename the configured user on every board they
	// write to, and a different editor would silently replace their choice.
	// Changing an answer is the TUI's `:config`, made by the user.
	const given = {
		userName: givenName || undefined,
		preferredEditor: input.preferredEditor?.trim() || undefined,
		autoSync: input.autoSync,
	};

	const existing = {
		userName: config.userName?.trim() || undefined,
		preferredEditor: config.preferredEditor?.trim() || undefined,
		autoSync:
			typeof config.autoSync === 'boolean' ? config.autoSync : undefined,
	};

	for (const field of SETUP_FIELDS) {
		const wanted = given[field.name];
		const current = existing[field.name];

		if (wanted === undefined || current === undefined || wanted === current) {
			continue;
		}

		return failed(
			`This machine is already set up with ${field.name} ${JSON.stringify(
				current,
			)}; ome_project_init does not change it. Call again without ${
				field.name
			}, or let the user change it in the TUI with :config.`,
		);
	}

	const patch: Parameters<typeof setConfig>[0] = {};

	if (given.userName && !existing.userName) patch.userName = given.userName;
	if (given.preferredEditor && !existing.preferredEditor) {
		patch.preferredEditor = given.preferredEditor;
	}
	if (given.autoSync !== undefined && existing.autoSync === undefined) {
		patch.autoSync = given.autoSync;
	}

	// A name without an id is not a user yet; the id is minted once and kept.
	if ((patch.userName || existing.userName) && !config.userId) {
		patch.userId = ulid();
	}

	if (Object.keys(patch).length > 0) {
		const persisted = setConfig(patch);
		if (isFail(persisted)) return failed(persisted.message);
	}

	const merged = {...config, ...patch};

	const missing = SETUP_FIELDS.filter(field => {
		const value = merged[field.name];
		return typeof value === 'boolean' ? false : !value?.trim();
	});

	if (missing.length > 0) {
		const asks = missing
			.map(field => `${field.name} (${field.question})`)
			.join('; ');

		// Named rather than used. Reading git's name and configuring it unasked
		// would set this machine's identity without the user ever seeing it, and
		// git config in an agent container or on a shared box is not necessarily
		// the user — the guard above refuses an agent's own name for that very
		// reason. Proposing it costs one turn and keeps a person in the loop.
		const suggestion = missing.some(field => field.name === 'userName')
			? await readGitName(input.repoRoot ?? process.cwd())
			: null;

		const proposal = suggestion
			? ` This repository's git user.name is ${JSON.stringify(
					suggestion,
			  )} — offer it as the default for userName, and use it only if the user agrees.`
			: '';

		return failed(
			`Setup incomplete. Ask the user for: ${asks}.${proposal} Then call ome_project_init again with the answers; what was given so far is saved.`,
		);
	}

	const user = {userId: merged.userId ?? '', userName: merged.userName ?? ''};
	if (!user.userId || !user.userName) {
		return failed('Missing OME user id');
	}

	const initResult = await initProject({
		cwd: input.repoRoot ?? process.cwd(),
		user,
	});
	if (isFail(initResult)) return initResult;

	const {defaultEvents: _events, ...outcome} = initResult.value;

	const remembered = recordRecentProject({root: outcome.repoRoot});
	if (isFail(remembered)) logger.info(remembered.message);

	// The project the agent just made is the one it means next.
	rememberProjectRoot(outcome.repoRoot);

	const warnings = [...outcome.warnings];
	const board = await setUpBoard(outcome.repoRoot, input, warnings);

	const message =
		warnings.length === 0
			? 'Project initialized'
			: `Project initialized, with warnings: ${warnings.join(' ')}`;

	return succeeded(message, {...outcome, warnings, user, board});
};
