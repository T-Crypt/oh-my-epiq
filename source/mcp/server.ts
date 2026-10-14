import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {isFail, Result} from '../lib/model/result-types.js';
import {
	MAX_ASSIGNEE_NAME_LENGTH,
	MAX_ASSIGNEES_PER_CREATE,
	MAX_ATTACHMENT_NAME_LENGTH,
	MAX_COMMENT_LENGTH,
	MAX_DESCRIPTION_LENGTH,
	MAX_TAG_NAME_LENGTH,
	MAX_TAGS_PER_CREATE,
	MAX_TITLE_LENGTH,
} from '../lib/utils/text.limits.js';
import {
	addIssueAttachment,
	getBoardContributors,
	tombstoneContributor,
	restoreContributor,
	tombstoneTag,
	restoreTag,
	addIssueComment,
	addIssueNote,
	assumeActor,
	closeIssue,
	createBoard,
	createIssue,
	createSwimlane,
	deleteIssueComment,
	deleteIssueNote,
	editIssueComment,
	editIssueNote,
	deleteSwimlane,
	editBoardTitle,
	editSwimlaneTitle,
	getIssue,
	listBoards,
	listIssues,
	listSwimlanes,
	moveSwimlane,
	reopenIssue,
	sync,
	updateIssue,
} from './ome-api.js';
import {
	claimCollabMessage,
	listCollabMessages,
	pinCollabMessage,
	postCollabMessage,
	resolveCollabMessage,
} from './api/collab.js';
import {initProjectTool} from './ome-init.js';
import {getIssueStats} from './ome-issue-stats.js';
import {installSkill} from './ome-skill.js';
import {runExclusive} from './ome-time-travel.js';
import {OME_VERSION} from '../version.js';

export const resultJson = <T>(result: Result<T>) => ({
	isError: isFail(result),
	content: [
		{
			type: 'text' as const,
			text: JSON.stringify(result, null, 2),
		},
	],
});

// The MCP SDK does not serialize requests, and every ome-api call is a
// boot-read-persist over the shared state singleton across several awaits —
// two in flight interleave, so one call's boot() can rebuild the state another
// call already checked its preconditions against. Serialized here, at the
// registration boundary, like the GUI's `runMutation` and websocket handlers.
// `runExclusive` is not re-entrant; nothing reached from ome-api takes it.
const exclusiveTool =
	<I, R>(fn: (input: I) => Promise<Result<R>>) =>
	(input: I) =>
		runExclusive(async () => resultJson(await fn(input)));

// Sent to every client on connect. This is the whole board workflow an agent
// needs: the server works on its own, with no skill installed in the project.
const OME_INSTRUCTIONS = [
	'OME is a git-backed issue board. Use these tools for every read and write — never edit the state branch, its worktree or the event log by hand.',
	'Take an identity first: ome_actor_assume with provider/name (e.g. claude/peter). Reuse one from ome_contributor_list.',
	'Only ome_sync touches the network. Call it on demand to pull or publish.',
	'Prefix commit subjects with the ticket ref returned by these tools.',
	'Keep tickets small; put a follow-up on its existing ticket.',
	'When done, add a comment starting with "Solution:". Ask before closing.',
].join('\n');

// When false, only the core tool set is available. Set OME_MCP_FULL=true
// to enable the full surface including administrative tools.
const FULL = process.env['OME_MCP_FULL'] === 'true';

export const createMcpServer = () => {
	const server = new McpServer(
		{
			name: 'ome',
			version: OME_VERSION,
		},
		{instructions: OME_INSTRUCTIONS},
	);

	const registerFull = (
		name: string,
		desc: string,
		schema: z.ZodTypeAny,
		fn: unknown,
	) => {
		if (!FULL) return;
		server.registerTool(
			name,
			{description: desc, inputSchema: schema},
			exclusiveTool(fn as never),
		);
	};

	// `ome_state_get` is deliberately not registered: it dumps the whole board
	// plus the event log, and agents use `ome_issue_list`/`ome_issue_get`. The
	// GUI websocket still calls the underlying function, so it stays exported.

	server.registerTool(
		'ome_issue_list',
		{
			description:
				'List OME issues. Narrow with boardId, swimlaneId, tag, assignee or query (matched against title and description). Brief is the default — returns id, ref, title, swimlane, tag names and assignee names only. Pass view:full to get the full payload with descriptions, comments and notes. Read one ticket with ome_issue_get.',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				includeClosed: z.boolean().optional(),
				boardId: z.string().optional(),
				swimlaneId: z.string().optional(),
				tag: z.string().optional(),
				assignee: z.string().optional(),
				query: z.string().optional(),
				view: z.enum(['brief', 'full']).optional(),
			}),
		},
		exclusiveTool(listIssues),
	);

	server.registerTool(
		'ome_issue_get',
		{
			description:
				'Get one OME issue by its full id or its 7-character ref. Brief is the default — returns id, ref, title, swimlane, tags, assignees, and counts. Pass view:full to get the full payload with descriptions, comments and notes. Use this rather than listing the whole board when you already know which issue you want.',
			inputSchema: z.object({
				idOrRef: z.string().min(1),
				repoRoot: z.string().optional(),
				view: z.enum(['brief', 'full']).optional(),
			}),
		},
		exclusiveTool(getIssue),
	);

	server.registerTool(
		'ome_issue_stats',
		{
			description:
				'Code stats for one issue, derived from the commits whose subject carries its ref: how big the change is, how it is spread, and how much of it the ticket spent rewriting its own work. Reads git only — it never touches the board — so it is safe to call while other work is in flight. No commits carrying the ref reads as a change of zero size, which is not the same as no work: a commit only links if its subject opens with the ref.',
			inputSchema: z.object({
				idOrRef: z.string().min(1),
				repoRoot: z.string().optional(),
			}),
		},
		// Deliberately not exclusiveTool: this reads git and never the state
		// singleton, so taking the write lock for it would only make board calls
		// queue behind a scan.
		async input => resultJson(await getIssueStats(input)),
	);

	server.registerTool(
		'ome_board_list',
		{
			description: 'List OME boards',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(listBoards),
	);

	registerFull(
		'ome_board_create',
		'Create an OME board. It comes out without swimlanes; add them with ome_swimlane_create. Refused while time travelling.',
		z.object({
			repoRoot: z.string().optional(),
			title: z.string().min(1).max(MAX_TITLE_LENGTH),
		}),
		createBoard,
	);

	server.registerTool(
		'ome_swimlane_list',
		{
			description: 'List OME swimlanes',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				boardId: z.string().optional(),
			}),
		},
		exclusiveTool(listSwimlanes),
	);

	registerFull(
		'ome_swimlane_create',
		'Create an OME swimlane on a board',
		z.object({
			repoRoot: z.string().optional(),
			boardId: z.string().min(1),
			title: z.string().min(1).max(MAX_TITLE_LENGTH),
		}),
		createSwimlane,
	);

	registerFull(
		'ome_swimlane_title_edit',
		'Edit an OME swimlane title',
		z.object({
			repoRoot: z.string().optional(),
			swimlaneId: z.string().min(1),
			title: z.string().min(1).max(MAX_TITLE_LENGTH),
		}),
		editSwimlaneTitle,
	);

	registerFull(
		'ome_board_title_edit',
		'Edit an OME board title. Refused while time travelling.',
		z.object({
			repoRoot: z.string().optional(),
			boardId: z.string().min(1),
			title: z.string().min(1).max(MAX_TITLE_LENGTH),
		}),
		editBoardTitle,
	);

	server.registerTool(
		'ome_swimlane_move',
		{
			description: 'Move/reorder an OME swimlane, optionally to another board',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				swimlaneId: z.string().min(1),
				boardId: z.string().min(1),
				position: z
					.discriminatedUnion('at', [
						z.object({at: z.literal('start')}),
						z.object({at: z.literal('end')}),
						z.object({
							at: z.literal('before'),
							sibling: z.string().min(1),
						}),
						z.object({
							at: z.literal('after'),
							sibling: z.string().min(1),
						}),
					])
					.optional(),
			}),
		},
		exclusiveTool(moveSwimlane),
	);

	registerFull(
		'ome_swimlane_delete',
		'Delete (archive) an OME swimlane. This also archives every issue contained in it.',
		z.object({
			repoRoot: z.string().optional(),
			swimlaneId: z.string().min(1),
		}),
		deleteSwimlane,
	);

	server.registerTool(
		'ome_issue_create',
		{
			description:
				'Create an OME issue and file it under a swimlane. parentId is a swimlane id from ome_swimlane_list. An issue never nests under another issue, so a ticket or board id is refused. Omit parentId to place the issue in the first open lane of the first board. Optionally set description, tags, and assignees in the same call.',
			inputSchema: z.object({
				title: z.string().min(1).max(MAX_TITLE_LENGTH),
				parentId: z.string().min(1).optional(),
				repoRoot: z.string().optional(),
				description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
				tagNames: z
					.array(z.string().max(MAX_TAG_NAME_LENGTH))
					.max(MAX_TAGS_PER_CREATE)
					.optional(),
				assigneeNames: z
					.array(z.string().max(MAX_ASSIGNEE_NAME_LENGTH))
					.max(MAX_ASSIGNEES_PER_CREATE)
					.optional(),
			}),
		},
		exclusiveTool(createIssue),
	);

	server.registerTool(
		'ome_issue_update',
		{
			description:
				'Update an OME issue in one call: title, description, tags, assignees, and lane. Pass the issue by full id or 7-char ref. Any field omitted is left unchanged. Adding a tag or assignee already present is a no-op; removing one not present is also a no-op. Returns which fields actually changed.',
			inputSchema: z.object({
				issueId: z.string().min(1),
				title: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
				description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
				tagsToAdd: z.array(z.string().max(MAX_TAG_NAME_LENGTH)).optional(),
				tagsToRemove: z.array(z.string()).optional(),
				assigneesToAdd: z.array(z.string()).optional(),
				assigneesToRemove: z.array(z.string()).optional(),
				lane: z.string().optional(),
				board: z.string().optional(),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(updateIssue),
	);

	server.registerTool(
		'ome_contributor_list',
		{
			description:
				'List people who can be assigned: everyone who has authored an event (optionally scoped to one board) unioned with the contributor registry. Use these ids with ome_issue_update.assigneesToAdd rather than assigning by name.',
			inputSchema: z.object({
				boardId: z.string().min(1).optional(),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(getBoardContributors),
	);

	registerFull(
		'ome_contributor_remove',
		'Remove an external contributor from the assignee suggestion lists. Their id and every reference to it survive, so existing assignments stay intact and the event log is untouched. Refused for anyone who has authored events, since their name is in the log regardless.',
		z.object({
			contributorId: z.string().min(1),
			repoRoot: z.string().optional(),
		}),
		tombstoneContributor,
	);

	registerFull(
		'ome_tag_remove',
		'Delete a tag from the whole workspace. It disappears from every ticket, picker and filter, but its id and history stay in the event log, and the name is free for a new tag.',
		z.object({
			tagId: z.string().min(1),
			repoRoot: z.string().optional(),
		}),
		tombstoneTag,
	);

	registerFull(
		'ome_tag_restore',
		'Put back a tag deleted with ome_tag_remove, on every ticket that still carried it.',
		z.object({
			tagId: z.string().min(1),
			repoRoot: z.string().optional(),
		}),
		restoreTag,
	);

	registerFull(
		'ome_contributor_restore',
		'Put a contributor removed with ome_contributor_remove back into the suggestion lists, under the name they were created with.',
		z.object({
			contributorId: z.string().min(1),
			repoRoot: z.string().optional(),
		}),
		restoreContributor,
	);

	server.registerTool(
		'ome_issue_comment_add',
		{
			description: 'Add a comment to an OME issue',
			inputSchema: z.object({
				issueId: z.string().min(1),
				body: z.string().min(1).max(MAX_COMMENT_LENGTH),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(addIssueComment),
	);

	registerFull(
		'ome_issue_attachment_add',
		'Attach an image file to an OME issue. Returns `markdown` — paste it into a comment or description body to render the image inline.',
		z.object({
			issueId: z.string().min(1),
			filePath: z.string().min(1),
			name: z.string().min(1).max(MAX_ATTACHMENT_NAME_LENGTH).optional(),
			repoRoot: z.string().optional(),
		}),
		addIssueAttachment,
	);

	server.registerTool(
		'ome_issue_comment_delete',
		{
			description: 'Delete a comment from an OME issue',
			inputSchema: z.object({
				commentId: z.string().min(1),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(deleteIssueComment),
	);

	server.registerTool(
		'ome_issue_comment_edit',
		{
			description:
				'Replace the body of one of your own comments on an OME issue',
			inputSchema: z.object({
				commentId: z.string().min(1),
				body: z.string().min(1).max(MAX_COMMENT_LENGTH),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(editIssueComment),
	);

	server.registerTool(
		'ome_issue_note_add',
		{
			description:
				'Add a note to an OME issue (additional information, distinct from comments)',
			inputSchema: z.object({
				issueId: z.string().min(1),
				body: z.string().min(1).max(MAX_COMMENT_LENGTH),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(addIssueNote),
	);

	server.registerTool(
		'ome_issue_note_delete',
		{
			description: 'Delete a note from an OME issue',
			inputSchema: z.object({
				noteId: z.string().min(1),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(deleteIssueNote),
	);

	registerFull(
		'ome_collab_post',
		'Post a line on the collaboration board: a note, an assistance request, or a handoff. Global rides the synced state branch; local stays on this machine.',
		z.object({
			kind: z.enum(['note', 'request', 'handoff']),
			body: z.string().min(1).max(MAX_COMMENT_LENGTH),
			channel: z.enum(['global', 'local']).optional(),
			ticket: z.string().optional(),
			dueBy: z.string().optional(),
			repoRoot: z.string().optional(),
		}),
		exclusiveTool(postCollabMessage),
	);

	registerFull(
		'ome_collab_list',
		'List collaboration board lines, pins first. Narrow by channel, kind or status.',
		z.object({
			channel: z.enum(['global', 'local']).optional(),
			kind: z.enum(['note', 'request', 'handoff']).optional(),
			status: z.enum(['open', 'claimed', 'resolved']).optional(),
			repoRoot: z.string().optional(),
		}),
		exclusiveTool(listCollabMessages),
	);

	registerFull(
		'ome_collab_claim',
		'Claim an open request or handoff: it is yours to carry now.',
		z.object({
			messageId: z.string().min(1),
			repoRoot: z.string().optional(),
		}),
		exclusiveTool(claimCollabMessage),
	);

	registerFull(
		'ome_collab_resolve',
		'Resolve a claimed request or handoff: the work it named is done.',
		z.object({
			messageId: z.string().min(1),
			repoRoot: z.string().optional(),
		}),
		exclusiveTool(resolveCollabMessage),
	);

	registerFull(
		'ome_collab_pin',
		'Pin or unpin a collaboration board line. Pins list first.',
		z.object({
			messageId: z.string().min(1),
			pinned: z.boolean().optional(),
			repoRoot: z.string().optional(),
		}),
		exclusiveTool(pinCollabMessage),
	);

	server.registerTool(
		'ome_issue_note_edit',
		{
			description: 'Replace the body of one of your own notes on an OME issue',
			inputSchema: z.object({
				noteId: z.string().min(1),
				body: z.string().min(1).max(MAX_COMMENT_LENGTH),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(editIssueNote),
	);

	server.registerTool(
		'ome_issue_reopen',
		{
			description:
				'Reopen a closed OME issue, restoring it to its previous swimlane',
			inputSchema: z.object({
				issueId: z.string().min(1),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(reopenIssue),
	);

	server.registerTool(
		'ome_issue_close',
		{
			description:
				'Close an OME issue, or many at once with issueIds — one call, an outcome per ticket',
			inputSchema: z.object({
				issueId: z.string().min(1).optional(),
				issueIds: z.array(z.string().min(1)).min(1).max(200).optional(),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(closeIssue),
	);

	server.registerTool(
		'ome_actor_assume',
		{
			description:
				'Take a board identity for the rest of this session, so your writes are attributed to you rather than to the user. Pass the name you announced — the model provider, a slash, then a short human first name, e.g. "claude/peter". Takes effect on the very next write; no relaunch. A name the server was launched with wins, and re-assuming the same name is harmless. Reuse an existing agent identity (ome_contributor_list) before inventing one: a name is permanent once it has authored anything.',
			inputSchema: z.object({
				name: z.string().min(1).max(80),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(assumeActor),
	);

	// `ome_contributor_email_*` is deliberately not registered: agents never
	// call it (zero uses mined from session logs), the operator's GUI does. The
	// functions stay exported from api/emails.js for the websocket.

	registerFull(
		'ome_project_init',
		'Set up a new OME board in a git repository without the TUI. Runs in the repository at repoRoot (default: the current directory), which may carry uncommitted work: init commits only .ome/project.json and .gitignore, and refuses only if those (or anything under .ome/) already have changes. The first time on a machine it also records the user\'s setup: ask the user for userName (how they want to appear on the board), preferredEditor (e.g. "vim" or "code --wait") and autoSync (whether the TUI and GUI sync with the remote on their own) and pass them here; called without them it fails naming what is still missing, keeping whatever was given. It fills in answers the machine lacks and refuses to change ones it has. Pass the user\'s name, never your own agent identity. Commits the state branch and .ome/project.json and tries to push both; a push that fails is a warning, not an error. The board is titled boardTitle (default: the repository folder name) and gets the swimlanes listed in swimlanes, in order; the reply carries the board id and each lane id. Afterwards the other tools work in that repository, and calls that leave repoRoot off mean it.',
		z.object({
			repoRoot: z.string().optional(),
			userName: z.string().min(1).max(80).optional(),
			preferredEditor: z.string().min(1).max(200).optional(),
			autoSync: z.boolean().optional(),
			boardTitle: z.string().min(1).max(300).optional(),
			swimlanes: z.array(z.string().min(1).max(300)).max(20).optional(),
		}),
		initProjectTool,
	);

	registerFull(
		'ome_skill_install',
		'Optional, and only when the user asks for it: write the longer OME workflow skill into this clone at .claude/skills/ome/SKILL.md. The board does not need it. The file is local to the clone and added to .git/info/exclude, so it is never committed. Refuses to overwrite a differing file unless force is true; an identical file is left alone.',
		z.object({
			repoRoot: z.string().optional(),
			force: z.boolean().optional(),
		}),
		installSkill,
	);

	server.registerTool(
		'ome_sync',
		{
			description:
				'Sync OME state with the configured Git remote (pull remote changes and push local ones). Other OME MCP tools only read and write local state and never sync automatically — call this on demand when you need to see or publish the latest remote changes.',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(sync),
	);

	return server;
};

export const startMcpServer = async () => {
	const server = createMcpServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
};
