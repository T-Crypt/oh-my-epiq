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
	addIssueAssignee,
	addIssueAttachment,
	getBoardContributors,
	tombstoneContributor,
	restoreContributor,
	tombstoneTag,
	restoreTag,
	addIssueComment,
	addIssueNote,
	addIssueTag,
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
	editIssueDescription,
	editIssueTitle,
	editBoardTitle,
	editSwimlaneTitle,
	getIssue,
	listBoards,
	listIssues,
	listSwimlanes,
	moveIssue,
	moveSwimlane,
	removeIssueAssignee,
	removeIssueTag,
	reopenIssue,
	sync,
} from './ome-api.js';
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
	'OME is a git-backed issue board. Use these tools for every board read and write; never edit the state branch, its worktree or the event log by hand.',
	'Take an identity before your first write: ome_actor_assume with provider/name (e.g. claude/peter), reusing one from ome_contributor_list.',
	'Only ome_sync touches the network. Call it to see remote changes and to publish yours.',
	'Picking up a ticket: read its comments, assign yourself, move it to the in-progress lane. Ask before taking one assigned to someone else.',
	'Keep tickets small and their lane, tags and description current. A small follow-up goes on its existing ticket.',
	'Start commit subjects with the ticket ref returned by these tools; never derive the ref from the id.',
	'When a ticket is done, add a comment starting with "Solution:". Ask the user before closing tickets, and file decisions that are theirs as a ticket tagged human-input-needed.',
	'Do not install a skill to use the board. ome_skill_install is only for a user who asks for the longer written workflow in one clone.',
].join('\n');

export const createMcpServer = () => {
	const server = new McpServer(
		{
			name: 'ome',
			version: OME_VERSION,
		},
		{instructions: OME_INSTRUCTIONS},
	);

	// `ome_state_get` is deliberately not registered: it dumps the whole board
	// plus the event log, and agents use `ome_issue_list`/`ome_issue_get`. The
	// GUI websocket still calls the underlying function, so it stays exported.

	server.registerTool(
		'ome_issue_list',
		{
			description:
				'List OME issues. Narrow with boardId, swimlaneId, tag, assignee or query (matched against title and description), and pass brief to get id, ref, title, swimlane, tag names and assignee names only — descriptions are the bulk of a board. Read one ticket with ome_issue_get.',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				includeClosed: z.boolean().optional(),
				boardId: z.string().optional(),
				swimlaneId: z.string().optional(),
				tag: z.string().optional(),
				assignee: z.string().optional(),
				query: z.string().optional(),
				brief: z.boolean().optional(),
			}),
		},
		exclusiveTool(listIssues),
	);

	server.registerTool(
		'ome_issue_get',
		{
			description:
				'Get one OME issue by its full id or its 7-character ref, with its comments in log order. Use this rather than listing the whole board when you already know which issue you want.',
			inputSchema: z.object({
				idOrRef: z.string().min(1),
				repoRoot: z.string().optional(),
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

	server.registerTool(
		'ome_board_create',
		{
			description:
				'Create an OME board. It comes out without swimlanes; add them with ome_swimlane_create. Refused while time travelling.',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				title: z.string().min(1).max(MAX_TITLE_LENGTH),
			}),
		},
		exclusiveTool(createBoard),
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

	server.registerTool(
		'ome_swimlane_create',
		{
			description: 'Create an OME swimlane on a board',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				boardId: z.string().min(1),
				title: z.string().min(1).max(MAX_TITLE_LENGTH),
			}),
		},
		exclusiveTool(createSwimlane),
	);

	server.registerTool(
		'ome_swimlane_title_edit',
		{
			description: 'Edit an OME swimlane title',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				swimlaneId: z.string().min(1),
				title: z.string().min(1).max(MAX_TITLE_LENGTH),
			}),
		},
		exclusiveTool(editSwimlaneTitle),
	);

	server.registerTool(
		'ome_board_title_edit',
		{
			description: 'Edit an OME board title. Refused while time travelling.',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				boardId: z.string().min(1),
				title: z.string().min(1).max(MAX_TITLE_LENGTH),
			}),
		},
		exclusiveTool(editBoardTitle),
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

	server.registerTool(
		'ome_swimlane_delete',
		{
			description:
				'Delete (archive) an OME swimlane. This also archives every issue contained in it.',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				swimlaneId: z.string().min(1),
			}),
		},
		exclusiveTool(deleteSwimlane),
	);

	server.registerTool(
		'ome_issue_create',
		{
			description:
				'Create an OME issue in a swimlane: parentId is the swimlane id (ome_swimlane_list), never a board id. Optionally set description, tags, and assignees atomically in the same call instead of separate follow-up edits.',
			inputSchema: z.object({
				title: z.string().min(1).max(MAX_TITLE_LENGTH),
				parentId: z.string().min(1),
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
		'ome_issue_description_edit',
		{
			description: 'Edit the markdown description of an OME issue',
			inputSchema: z.object({
				issueId: z.string().min(1),
				description: z.string().max(MAX_DESCRIPTION_LENGTH),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(editIssueDescription),
	);

	server.registerTool(
		'ome_issue_title_edit',
		{
			description: 'Edit the title of an OME issue',
			inputSchema: z.object({
				issueId: z.string().min(1),
				title: z.string().min(1).max(MAX_TITLE_LENGTH),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(editIssueTitle),
	);

	server.registerTool(
		'ome_issue_tag_add',
		{
			description:
				'Add a tag to an OME issue, or to many at once with issueIds, creating the tag if it does not exist',
			inputSchema: z.object({
				issueId: z.string().min(1).optional(),
				issueIds: z.array(z.string().min(1)).min(1).max(200).optional(),
				tagName: z.string().min(1).max(MAX_TAG_NAME_LENGTH),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(addIssueTag),
	);

	server.registerTool(
		'ome_issue_tag_remove',
		{
			description:
				'Remove a tag from an OME issue. Accepts the tag by id or by name — pass whichever you have.',
			inputSchema: z
				.object({
					issueId: z.string().min(1),
					tagId: z.string().min(1).optional(),
					tagName: z.string().min(1).max(MAX_TAG_NAME_LENGTH).optional(),
					repoRoot: z.string().optional(),
				})
				.refine(v => Boolean(v.tagId ?? v.tagName), {
					message: 'Pass tagId or tagName',
				}),
		},
		exclusiveTool(removeIssueTag),
	);

	server.registerTool(
		'ome_contributor_list',
		{
			description:
				'List people who can be assigned: everyone who has authored an event (optionally scoped to one board) unioned with the contributor registry. Use these ids with ome_issue_assignee_add rather than assigning by name.',
			inputSchema: z.object({
				boardId: z.string().min(1).optional(),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(getBoardContributors),
	);

	server.registerTool(
		'ome_contributor_remove',
		{
			description:
				'Remove an external contributor from the assignee suggestion lists. Their id and every reference to it survive, so existing assignments stay intact and the event log is untouched. Refused for anyone who has authored events, since their name is in the log regardless.',
			inputSchema: z.object({
				contributorId: z.string().min(1),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(tombstoneContributor),
	);

	server.registerTool(
		'ome_tag_remove',
		{
			description:
				'Delete a tag from the whole workspace. It disappears from every ticket, picker and filter, but its id and history stay in the event log, and the name is free for a new tag.',
			inputSchema: z.object({
				tagId: z.string().min(1),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(tombstoneTag),
	);

	server.registerTool(
		'ome_tag_restore',
		{
			description:
				'Put back a tag deleted with ome_tag_remove, on every ticket that still carried it.',
			inputSchema: z.object({
				tagId: z.string().min(1),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(restoreTag),
	);

	server.registerTool(
		'ome_contributor_restore',
		{
			description:
				'Put a contributor removed with ome_contributor_remove back into the suggestion lists, under the name they were created with.',
			inputSchema: z.object({
				contributorId: z.string().min(1),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(restoreContributor),
	);

	server.registerTool(
		'ome_issue_assignee_add',
		{
			description:
				'Assign a contributor to an OME issue. Pass self:true to assign yourself. Prefer assigneeId otherwise, which assigns a known contributor (from the registry or the event log) and fails if the id is unknown. assigneeName matches an existing contributor by name; to create somebody new from a name you must also pass createUnlinked, which adds them as an external (non-contributor) assignee.',
			inputSchema: z.object({
				issueId: z.string().min(1),
				assigneeId: z.string().min(1).optional(),
				self: z.boolean().optional(),
				assigneeName: z
					.string()
					.min(1)
					.max(MAX_ASSIGNEE_NAME_LENGTH)
					.optional(),
				createUnlinked: z.boolean().optional(),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(addIssueAssignee),
	);

	server.registerTool(
		'ome_issue_assignee_remove',
		{
			description: 'Remove an assignee from an OME issue',
			inputSchema: z.object({
				issueId: z.string().min(1),
				assigneeId: z.string().min(1),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(removeIssueAssignee),
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

	server.registerTool(
		'ome_issue_attachment_add',
		{
			description:
				'Attach an image file to an OME issue. Returns `markdown` — paste it into a comment or description body to render the image inline.',
			inputSchema: z.object({
				issueId: z.string().min(1),
				filePath: z.string().min(1),
				name: z.string().min(1).max(MAX_ATTACHMENT_NAME_LENGTH).optional(),
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(addIssueAttachment),
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
		'ome_issue_move',
		{
			description:
				'Move an OME issue to another swimlane (parentId is the swimlane id), or many at once with issueIds — one call, an outcome per ticket',
			inputSchema: z.object({
				issueId: z.string().min(1).optional(),
				issueIds: z.array(z.string().min(1)).min(1).max(200).optional(),
				parentId: z.string().min(1),
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
				repoRoot: z.string().optional(),
			}),
		},
		exclusiveTool(moveIssue),
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

	server.registerTool(
		'ome_project_init',
		{
			description:
				'Set up a new OME board in a git repository without the TUI. Runs in the repository at repoRoot (default: the current directory), which may carry uncommitted work: init commits only .ome/project.json and .gitignore, and refuses only if those (or anything under .ome/) already have changes. The first time on a machine it also records the user\'s setup: ask the user for userName (how they want to appear on the board), preferredEditor (e.g. "vim" or "code --wait") and autoSync (whether the TUI and GUI sync with the remote on their own) and pass them here; called without them it fails naming what is still missing, keeping whatever was given. It fills in answers the machine lacks and refuses to change ones it has. Pass the user\'s name, never your own agent identity. Commits the state branch and .ome/project.json and tries to push both; a push that fails is a warning, not an error. The board is titled boardTitle (default: the repository folder name) and gets the swimlanes listed in swimlanes, in order; the reply carries the board id and each lane id. Afterwards the other tools work in that repository, and calls that leave repoRoot off mean it.',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				userName: z.string().min(1).max(80).optional(),
				preferredEditor: z.string().min(1).max(200).optional(),
				autoSync: z.boolean().optional(),
				boardTitle: z.string().min(1).max(300).optional(),
				swimlanes: z.array(z.string().min(1).max(300)).max(20).optional(),
			}),
		},
		exclusiveTool(initProjectTool),
	);

	server.registerTool(
		'ome_skill_install',
		{
			description:
				'Optional, and only when the user asks for it: write the longer OME workflow skill into this clone at .claude/skills/ome/SKILL.md. The board does not need it. The file is local to the clone and added to .git/info/exclude, so it is never committed. Refuses to overwrite a differing file unless force is true; an identical file is left alone.',
			inputSchema: z.object({
				repoRoot: z.string().optional(),
				force: z.boolean().optional(),
			}),
		},
		exclusiveTool(installSkill),
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
