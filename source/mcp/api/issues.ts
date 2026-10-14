import {ulid} from 'ulid';
import {getStateBranchRoot} from '../../git/git-storage.js';
import {createIssueEvents} from '../../lib/board/common-events.js';
import {ulidTimeMs} from '../../lib/event/date-utils.js';
import {bootStateFromEventLog} from '../../lib/board/board-boot.js';
import {loadMergedEventsWithUnreadable} from '../../lib/board/board-log.js';
import {materializeAndPersistAll} from '../../lib/board/board-log.js';
import {
	actorOf,
	AppEvent,
	MovePosition,
} from '../../lib/board/board-events.model.js';
import {resolveReopenParentFromLog} from '../../lib/board/log-utils.js';
import {CLOSED_SWIMLANE_ID} from '../../lib/board/static-ids.js';
import {
	isBoardNode,
	isTicketNode,
	isSwimlaneNode,
	Ticket,
} from '../../lib/model/context.model.js';
import {AppState} from '../../lib/model/app-state.model.js';
import {identityOf} from '../../lib/model/identity.js';
import {
	failed,
	isFail,
	Result,
	succeeded,
} from '../../lib/model/result-types.js';
import {nodeRepo} from '../../lib/repository/node-repo.js';
import {
	resolveAndPersistRankForCreate,
	resolveAndPersistRankForMove,
} from '../../lib/repository/rank.js';
import {describeEvent} from '../../lib/board/format-log-utils.js';
import {
	MAX_ASSIGNEE_NAME_LENGTH,
	MAX_ASSIGNEES_PER_CREATE,
	MAX_DESCRIPTION_LENGTH,
	MAX_TAG_NAME_LENGTH,
	MAX_TAGS_PER_CREATE,
	MAX_TITLE_LENGTH,
	tooLong,
} from '../../lib/utils/text.limits.js';
import {laneEntryTime} from '../../lib/utils/lane-dwell.js';
import {nodeRef, nodeRefMatches} from '../../lib/utils/node-ref.js';
import {sanitizeInlineText} from '../../lib/utils/string.utils.js';
import {contributorDirectory} from '../../lib/repository/contributor-directory.js';
import {findEventLogAuthor} from './contributors.js';
import {
	ApiBatchOutcome,
	ApiIssue,
	ApiIssueBrief,
	ApiIssueDetail,
	ApiIssueHistoryEntry,
} from '../api-state.model.js';
import {
	ToolInput,
	Actor,
	bootLocal,
	bootedWithActorAndState,
	getActor,
	getStateResult,
	resolveRepoRoot,
} from './boot.js';
import {
	boardsEverOnOf,
	getIssueTags,
	getIssueComments,
	getIssueNotes,
	getIssueAssignees,
} from './issue-projection.js';
import {
	IssueTargets,
	IssueRef,
	targetIds,
	batchResult,
	forEachTarget,
} from './issue-targets.js';
import {
	findWritableIssue,
	findWritableSwimlane,
	resolveIssueId,
} from './node-targets.js';
import {loadActorNames} from '../../lib/board/board-log.js';

type MoveIssueInput = ToolInput &
	IssueTargets & {
		parentId: string;
		position?: MovePosition;
	};

type ListIssuesInput = ToolInput & {
	includeClosed?: boolean;
	boardId?: string;
	swimlaneId?: string;
	tag?: string;
	assignee?: string;
	query?: string;
	view?: 'brief' | 'full';
};

type CreateIssueInput = ToolInput & {
	title: string;
	parentId?: string;
	description?: string;
	tagNames?: string[];
	assigneeNames?: string[];
};

type CloseIssueInput = ToolInput & IssueTargets;

type EditIssueDescriptionInput = ToolInput & {
	issueId: string;
	description: string;
};

type EditIssueTitleInput = ToolInput & {
	issueId: string;
	title: string;
};

type GetIssueInput = ToolInput & {
	idOrRef: string;
	view?: 'brief' | 'full';
};

type UpdateIssueInput = ToolInput & {
	issueId: string;
	title?: string;
	description?: string;
	tagsToAdd?: string[];
	tagsToRemove?: string[];
	assigneesToAdd?: string[];
	assigneesToRemove?: string[];
	lane?: string;
	board?: string;
};

/**
 * One issue, by full id or by the 7-character ref the commit convention uses.
 *
 * The inverse of that convention had no tool: going from a ref back to a
 * ticket meant listing the whole board and filtering, and on a board of any
 * age that response is large enough to be unusable for reading one field.
 */
export const getIssue = async (
	input: GetIssueInput,
): Promise<Result<ApiIssueBrief | ApiIssueDetail>> => {
	const bootResult = await bootLocal(input.repoRoot);
	if (isFail(bootResult)) return bootResult;

	const stateResult = getStateResult();
	if (isFail(stateResult)) return stateResult;

	const query = input.idOrRef.trim();
	if (!query) return failed('Provide an issue id or ref');

	const tickets = Object.values(stateResult.value.nodes)
		.filter(isTicketNode)
		.filter(n => !n.isDeleted);

	const exact = tickets.find(n => n.id === query);

	// `nodeRefMatches` is a substring match, so a short query can legitimately
	// hit several tickets. Naming them beats guessing.
	const matches = exact
		? [exact]
		: tickets.filter(n => nodeRefMatches(n.id, query));

	if (matches.length === 0) {
		return failed(`No issue matches "${query}"`);
	}

	if (matches.length > 1) {
		return failed(
			`"${query}" matches ${matches.length} issues: ${matches
				.map(n => `${nodeRef(n.id)} (${sanitizeInlineText(n.title)})`)
				.join(', ')}. Use a full ref or id.`,
		);
	}

	const issue = matches[0] as Ticket;

	const view = input.view ?? 'brief';

	if (view === 'brief') {
		return succeeded('Found issue', {
			id: issue.id,
			ref: nodeRef(issue.id),
			title: sanitizeInlineText(issue.title),
			swimlane: sanitizeInlineText(
				issue.parentNodeId
					? stateResult.value.nodes[issue.parentNodeId]?.title ?? ''
					: '',
			),
			tags: getIssueTags(issue).map(t => t.name),
			assignees: getIssueAssignees(issue).map(a => a.name),
			commentCount: getIssueComments(issue.id).length,
			noteCount: getIssueNotes(issue.id).length,
			createdAt: ulidTimeMs(issue.id),
			enteredLaneAt: laneEntryTime(issue.log ?? [], ulidTimeMs(issue.id)),
		} satisfies ApiIssueBrief);
	}

	return succeeded('Found issue', {
		id: issue.id,
		ref: nodeRef(issue.id),
		title: sanitizeInlineText(issue.title),
		description: issue.props.description ?? '',
		createdAt: ulidTimeMs(issue.id),
		enteredLaneAt: laneEntryTime(issue.log ?? [], ulidTimeMs(issue.id)),
		parentNodeId: issue.parentNodeId!,
		isClosed: issue.parentNodeId === CLOSED_SWIMLANE_ID,
		boardIds: boardsEverOnOf(issue),
		readonly: Boolean(issue.readonly),
		tags: getIssueTags(issue),
		assignees: getIssueAssignees(issue),
		comments: getIssueComments(issue.id),
		notes: getIssueNotes(issue.id),
	} satisfies ApiIssueDetail);
};

const sameName = (a: string, b: string) =>
	a.trim().toLowerCase() === b.trim().toLowerCase();

export function listIssues(
	input: ListIssuesInput & {view?: 'full'},
): Promise<Result<ApiIssue[]>>;
export function listIssues(
	input: ListIssuesInput & {view: 'brief'},
): Promise<Result<ApiIssueBrief[]>>;
export function listIssues(
	input: ListIssuesInput,
): Promise<Result<ApiIssue[] | ApiIssueBrief[]>>;
export async function listIssues(
	input: ListIssuesInput,
): Promise<Result<ApiIssue[] | ApiIssueBrief[]>> {
	const bootResult = await bootLocal(input.repoRoot);
	if (isFail(bootResult)) return bootResult;

	const stateResult = getStateResult();
	if (isFail(stateResult)) return stateResult;

	const nodes = stateResult.value.nodes;
	const query = input.query?.trim().toLowerCase();

	const tickets = Object.values(nodes)
		.filter(isTicketNode)
		.filter(n => !n.isDeleted)
		.filter(n => input.includeClosed || n.parentNodeId !== CLOSED_SWIMLANE_ID)
		.filter(n => {
			if (!input.boardId) return true;
			const swimlane = n.parentNodeId ? nodes[n.parentNodeId] : undefined;
			return swimlane?.parentNodeId === input.boardId;
		})
		.filter(n => !input.swimlaneId || n.parentNodeId === input.swimlaneId)
		.filter(
			n =>
				!input.tag ||
				getIssueTags(n).some(tag => sameName(tag.name, input.tag!)),
		)
		.filter(
			n =>
				!input.assignee ||
				getIssueAssignees(n).some(a => sameName(a.name, input.assignee!)),
		)
		.filter(
			n =>
				!query ||
				n.title.toLowerCase().includes(query) ||
				(n.props.description ?? '').toLowerCase().includes(query),
		);

	const swimlaneTitle = (n: Ticket) =>
		sanitizeInlineText(
			(n.parentNodeId ? nodes[n.parentNodeId]?.title : undefined) ?? '',
		);

	const isFull = input.view === 'full';

	if (!isFull) {
		return succeeded(
			'Listed issues',
			tickets.map(n => {
				const comments = getIssueComments(n.id);
				const notes = getIssueNotes(n.id);
				return {
					id: n.id,
					ref: nodeRef(n.id),
					title: sanitizeInlineText(n.title),
					swimlane: swimlaneTitle(n),
					tags: getIssueTags(n).map(tag => tag.name),
					assignees: getIssueAssignees(n).map(a => a.name),
					commentCount: comments.length,
					noteCount: notes.length,
					createdAt: ulidTimeMs(n.id),
					enteredLaneAt: laneEntryTime(n.log ?? [], ulidTimeMs(n.id)),
				} satisfies ApiIssueBrief;
			}),
		);
	}

	return succeeded(
		'Listed issues',
		tickets.map(
			n =>
				({
					id: n.id,
					ref: nodeRef(n.id),
					title: sanitizeInlineText(n.title),
					description: n.props?.description ?? '',
					createdAt: ulidTimeMs(n.id),
					enteredLaneAt: laneEntryTime(n.log ?? [], ulidTimeMs(n.id)),
					parentNodeId: n.parentNodeId!,
					isClosed: n.parentNodeId === CLOSED_SWIMLANE_ID,
					boardIds: boardsEverOnOf(n),
					readonly: Boolean(n.readonly),
					tags: getIssueTags(n),
					assignees: getIssueAssignees(n),
				} satisfies ApiIssue),
		),
	);
}

export const createIssue = async (input: CreateIssueInput) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	// The other three title paths all sanitize; this one used to write the raw
	// input, so a newline or a control character landed in the log for good.
	const title = sanitizeInlineText(input.title);

	if (!title) {
		return failed('Issue title cannot be empty');
	}

	const description = input.description ?? '';

	const overLong =
		tooLong('Issue title', title, MAX_TITLE_LENGTH) ??
		tooLong('Issue description', description, MAX_DESCRIPTION_LENGTH);
	if (overLong) return failed(overLong);

	if ((input.tagNames?.length ?? 0) > MAX_TAGS_PER_CREATE) {
		return failed(`Cannot set more than ${MAX_TAGS_PER_CREATE} tags at once`);
	}

	if ((input.assigneeNames?.length ?? 0) > MAX_ASSIGNEES_PER_CREATE) {
		return failed(
			`Cannot set more than ${MAX_ASSIGNEES_PER_CREATE} assignees at once`,
		);
	}

	// Resolve the parent lane: required when named, defaults to the first open
	// lane of the first board when omitted.
	let parentId = input.parentId;

	if (!parentId) {
		// A closed board is readonly and every lane under it inherits that, so it
		// can never be a create target even when its id happens to sort first.
		const boards = Object.values(ready.value.state.nodes)
			.filter(n => n.context === 'BOARD' && !n.isDeleted && !n.readonly)
			.sort((a, b) => (a.id < b.id ? -1 : 1));

		if (boards.length === 0) {
			return failed('No open board found — create one first, or pass parentId');
		}

		const firstBoard = boards[0]!;

		const lanes = Object.values(ready.value.state.nodes)
			.filter(
				n =>
					n.context === 'SWIMLANE' &&
					!n.isDeleted &&
					!n.readonly &&
					n.parentNodeId === firstBoard.id,
			)
			.sort((a, b) => (a.id < b.id ? -1 : 1));

		if (lanes.length === 0) {
			return failed(
				`Board "${firstBoard.title}" has no open lanes — create one first, or pass parentId`,
			);
		}

		parentId = lanes[0]!.id;
	}

	const laneResult = findWritableSwimlane(parentId);
	if (isFail(laneResult)) {
		// The usual mistake is reading parentId as the parent ticket. An issue
		// files under a swimlane, so a ticket or board id here is named plainly,
		// with the way out, instead of the bare kind guard's "Target must be a
		// swimlane". A lane that is genuinely unknown or readonly is passed
		// through unchanged.
		const nodes = ready.value.state.nodes;
		const node = nodes[parentId] ?? nodes[resolveIssueId(parentId)];

		if (node && isTicketNode(node)) {
			return failed(
				'That is an issue id. An issue files under a swimlane and does not nest under another issue. Pass a swimlane id from ome_swimlane_list, or omit parentId to use the first open lane.',
			);
		}
		if (node && isBoardNode(node)) {
			return failed(
				"That is a board id. An issue files under one of a board's swimlanes, not the board itself. Pass a swimlane id from ome_swimlane_list, or omit parentId to use the first open lane.",
			);
		}
		return laneResult;
	}

	const rankResult = resolveAndPersistRankForCreate(
		parentId,
		ready.value.actor,
		ready.value.boot.stateBranchRoot,
	);
	if (isFail(rankResult)) return rankResult;

	const issueEventsResult = createIssueEvents({
		name: title,
		parent: parentId,
		user: ready.value.actor,
		rank: rankResult.value,
	});
	if (isFail(issueEventsResult)) return issueEventsResult;

	const events: AppEvent[] = [...issueEventsResult.value];
	const issueId = events.find(e => e.action === 'add.issue')?.payload.id;
	if (!issueId) return failed('Unable to determine created issue id');

	if (description) {
		events.push({
			id: ulid(),
			...actorOf(ready.value.actor),
			action: 'edit.description',
			payload: {id: issueId, md: description},
		} satisfies AppEvent<'edit.description'>);
	}

	const tags: {id: string; name: string}[] = [];
	for (const rawName of input.tagNames ?? []) {
		const tagName = sanitizeInlineText(rawName).trim();
		if (!tagName || tags.some(tag => tag.name === tagName)) continue;

		const overLongTag = tooLong('Tag name', tagName, MAX_TAG_NAME_LENGTH);
		if (overLongTag) return failed(overLongTag);

		const existingTag = nodeRepo.findTagByName(tagName);
		const tagId = existingTag?.id ?? ulid();

		if (!existingTag) {
			events.push({
				id: ulid(),
				...actorOf(ready.value.actor),
				action: 'create.tag',
				payload: {id: tagId, name: tagName},
			} satisfies AppEvent<'create.tag'>);
		}

		events.push({
			id: ulid(),
			...actorOf(ready.value.actor),
			action: 'add.issue.tag',
			payload: {id: issueId, tag: tagId},
		} satisfies AppEvent<'add.issue.tag'>);

		tags.push({id: tagId, name: tagName});
	}

	const assignees: {id: string; name: string}[] = [];
	for (const rawName of input.assigneeNames ?? []) {
		const assigneeName = sanitizeInlineText(rawName).trim();
		if (!assigneeName || assignees.some(a => a.name === assigneeName)) {
			continue;
		}

		const overLongName = tooLong(
			'Assignee name',
			assigneeName,
			MAX_ASSIGNEE_NAME_LENGTH,
		);
		if (overLongName) return failed(overLongName);

		const existingAssignee = Object.values(ready.value.state.contributors).find(
			contributor => contributor.name === assigneeName,
		);
		const assigneeId = existingAssignee?.id ?? ulid();

		if (!existingAssignee) {
			events.push({
				id: ulid(),
				...actorOf(ready.value.actor),
				action: 'create.contributor',
				payload: {id: assigneeId, name: assigneeName},
			} satisfies AppEvent<'create.contributor'>);
		}

		events.push({
			id: ulid(),
			...actorOf(ready.value.actor),
			action: 'add.issue.assignee',
			payload: {id: issueId, assignee: assigneeId},
		} satisfies AppEvent<'add.issue.assignee'>);

		assignees.push({id: assigneeId, name: assigneeName});
	}

	const results = materializeAndPersistAll(
		events,
		ready.value.boot.stateBranchRoot,
	);
	if (isFail(results)) return failed(results.message);

	return succeeded('Created issue', {
		id: issueId,
		ref: nodeRef(issueId),
		title,
		parentId: input.parentId,
		description,
		tags,
		assignees,
	});
};

const closeOne = (id: string, actor: Actor, stateBranchRoot: string) => {
	const issueResult = findWritableIssue(id);
	if (isFail(issueResult)) return issueResult;

	const rankResult = resolveAndPersistRankForMove(
		CLOSED_SWIMLANE_ID,
		id,
		{at: 'end'},
		actor,
		stateBranchRoot,
	);
	if (isFail(rankResult)) return rankResult;

	const event = {
		id: ulid(),
		...actorOf(actor),
		action: 'close.issue',
		payload: {
			id,
			parent: CLOSED_SWIMLANE_ID,
			rank: rankResult.value,
		},
	} satisfies AppEvent<'close.issue'>;

	const results = materializeAndPersistAll([event], stateBranchRoot);
	if (isFail(results)) return failed(results.message);

	return succeeded('Closed issue', {id, ref: nodeRef(id)});
};

export function closeIssue(
	input: CloseIssueInput & {issueIds: string[]},
): Promise<Result<ApiBatchOutcome>>;
export function closeIssue(input: CloseIssueInput): Promise<Result<IssueRef>>;
export async function closeIssue(
	input: CloseIssueInput,
): Promise<Result<ApiBatchOutcome | IssueRef>> {
	const bootResult = await bootLocal(input.repoRoot);
	if (isFail(bootResult)) return bootResult;

	const actorResult = getActor();
	if (isFail(actorResult)) return actorResult;

	const idsResult = targetIds(input);
	if (isFail(idsResult)) return idsResult;

	const close = (id: string) =>
		closeOne(id, actorResult.value, bootResult.value.stateBranchRoot);

	if (!input.issueIds) return close(idsResult.value[0]!);

	return batchResult('Closed', forEachTarget(idsResult.value, close));
}

export const reopenIssue = async (input: ToolInput & {issueId: string}) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	const issue = ready.value.state.nodes[resolveIssueId(input.issueId)];

	if (!issue || issue.isDeleted) {
		return failed('Issue not found — pass the issue id or its 7-character ref');
	}
	if (!isTicketNode(issue)) return failed('Target must be an issue');

	if (issue.parentNodeId !== CLOSED_SWIMLANE_ID) {
		return failed('Issue is not closed');
	}

	const previousParentId = resolveReopenParentFromLog(issue);

	if (!previousParentId) {
		return failed('Unable to resolve previous parent from issue history');
	}

	if (previousParentId === CLOSED_SWIMLANE_ID) {
		return failed('Previous parent resolves to closed swimlane');
	}

	const previousParentResult = findWritableSwimlane(previousParentId);
	if (isFail(previousParentResult)) return previousParentResult;
	const previousParent = previousParentResult.value;

	const rankResult = resolveAndPersistRankForMove(
		previousParent.id,
		issue.id,
		{at: 'end'},
		ready.value.actor,
		ready.value.boot.stateBranchRoot,
	);

	if (isFail(rankResult)) return rankResult;

	const event = {
		id: ulid(),
		...actorOf(ready.value.actor),
		action: 'reopen.issue',
		payload: {
			id: issue.id,
			parent: previousParent.id,
			rank: rankResult.value,
		},
	} satisfies AppEvent<'reopen.issue'>;

	const results = materializeAndPersistAll(
		[event],
		ready.value.boot.stateBranchRoot,
	);

	if (isFail(results)) return failed(results.message);

	return succeeded('Reopened issue', {
		id: issue.id,
		ref: nodeRef(issue.id),
		parentId: previousParent.id,
	});
};

const moveOne = (
	id: string,
	input: MoveIssueInput,
	actor: Actor,
	stateBranchRoot: string,
) => {
	const issueResult = findWritableIssue(id);
	if (isFail(issueResult)) return issueResult;

	const laneResult = findWritableSwimlane(input.parentId);
	if (isFail(laneResult)) return laneResult;

	const rankResult = resolveAndPersistRankForMove(
		input.parentId,
		id,
		input.position ?? {at: 'end'},
		actor,
		stateBranchRoot,
	);
	if (isFail(rankResult)) return rankResult;

	const event = {
		id: ulid(),
		...actorOf(actor),
		action: 'move.node',
		payload: {
			id,
			parent: input.parentId,
			rank: rankResult.value,
		},
	} satisfies AppEvent<'move.node'>;

	const results = materializeAndPersistAll([event], stateBranchRoot);
	if (isFail(results)) return failed(results.message);

	return succeeded('Moved issue', {
		id,
		ref: nodeRef(id),
		parentId: input.parentId,
	});
};

export function moveIssue(
	input: MoveIssueInput & {issueIds: string[]},
): Promise<Result<ApiBatchOutcome>>;
export function moveIssue(
	input: MoveIssueInput,
): Promise<Result<IssueRef & {parentId: string}>>;
export async function moveIssue(
	input: MoveIssueInput,
): Promise<Result<ApiBatchOutcome | (IssueRef & {parentId: string})>> {
	const repoRootResult = resolveRepoRoot(input.repoRoot);
	if (isFail(repoRootResult)) return repoRootResult;

	const actorResult = getActor();
	if (isFail(actorResult)) return actorResult;

	const stateBranchRootResult = getStateBranchRoot({
		repoRoot: repoRootResult.value,
	});

	if (isFail(stateBranchRootResult)) return stateBranchRootResult;

	const eventsResult = loadMergedEventsWithUnreadable(
		stateBranchRootResult.value,
	);
	if (isFail(eventsResult)) return eventsResult;

	const bootStateResult = bootStateFromEventLog(
		eventsResult.value.events,
		eventsResult.value.unreadable,
	);
	if (isFail(bootStateResult)) return bootStateResult;

	const idsResult = targetIds(input);
	if (isFail(idsResult)) return idsResult;

	const move = (id: string) =>
		moveOne(id, input, actorResult.value, stateBranchRootResult.value);

	if (!input.issueIds) return move(idsResult.value[0]!);

	return batchResult('Moved', forEachTarget(idsResult.value, move));
}

/**
 * A ticket's own event log, oldest first. Reads whatever is materialized rather
 * than booting, so it stays correct mid-scrub like the state beside it.
 */
export const getIssueHistory = (
	issueId: string,
): Result<ApiIssueHistoryEntry[]> => {
	const stateResult = getStateResult();
	if (isFail(stateResult)) return stateResult;

	const issue = stateResult.value.nodes[issueId];
	if (!issue) return failed('Issue not found');

	return succeeded(
		'Read issue history',
		(issue.log ?? []).map(event => ({
			id: event.id,
			t: ulidTimeMs(event.id),
			action: event.action,
			label: describeEvent(event),
			...(event.action === 'move.node'
				? {parentId: (event.payload as {parent?: string}).parent}
				: {}),
			// By id from the registry, never from the event: an event carries no
			// name at all since ZFZFW9D, and only the registry knows who an id is.
			// The registry or the id: not booting is the point of this, so it
			// never loads the log. `loadActorNames` has the rule.
			actor: identityOf(
				event.userId,
				stateResult.value.contributors[event.userId]?.name,
			),
		})),
	);
};

export const editIssueDescription = async (
	input: EditIssueDescriptionInput,
) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	const issueResult = findWritableIssue(input.issueId);
	if (isFail(issueResult)) return issueResult;
	const issue = issueResult.value;
	const issueId = issue.id;

	const overLongDescription = tooLong(
		'Issue description',
		input.description,
		MAX_DESCRIPTION_LENGTH,
	);
	if (overLongDescription) return failed(overLongDescription);

	const currentDescription = issue.props.description ?? '';

	if (currentDescription === input.description) {
		return succeeded('No changes made', {
			id: issueId,
			ref: nodeRef(issueId),
			description: currentDescription,
		});
	}

	const event = {
		id: ulid(),
		...actorOf(ready.value.actor),
		action: 'edit.description',
		payload: {
			id: issueId,
			md: input.description,
		},
	} satisfies AppEvent<'edit.description'>;

	const results = materializeAndPersistAll(
		[event],
		ready.value.boot.stateBranchRoot,
	);

	if (isFail(results)) return failed(results.message);

	return succeeded('Edited issue description', {
		id: issueId,
		ref: nodeRef(issueId),
		description: input.description,
	});
};

export const editIssueTitle = async (input: EditIssueTitleInput) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	const issueResult = findWritableIssue(input.issueId);
	if (isFail(issueResult)) return issueResult;
	const issue = issueResult.value;
	const issueId = issue.id;

	const title = sanitizeInlineText(input.title);

	if (!title.trim()) {
		return failed('Issue title cannot be empty');
	}

	const overLongTitle = tooLong('Issue title', title, MAX_TITLE_LENGTH);
	if (overLongTitle) return failed(overLongTitle);

	if (issue.title === title) {
		return succeeded('No changes made', {
			id: issueId,
			ref: nodeRef(issueId),
			title,
		});
	}

	const event = {
		id: ulid(),
		...actorOf(ready.value.actor),
		action: 'edit.title',
		payload: {
			id: issueId,
			name: title,
		},
	} satisfies AppEvent<'edit.title'>;

	const results = materializeAndPersistAll(
		[event],
		ready.value.boot.stateBranchRoot,
	);

	if (isFail(results)) return failed(results.message);

	return succeeded('Edited issue title', {
		id: issueId,
		ref: nodeRef(issueId),
		title,
	});
};

/**
 * One tool for the common ticket edits: title, description, tags, assignees,
 * and lane — all in a single call, all atomic.
 *
 * Adding a tag or an assignee the ticket already has is an idempotent no-op,
 * never an error. Removing one it does not have is also a no-op.
 *
 * The lane field accepts a swimlane id, its 7-char ref, or a name. When the
 * name alone is ambiguous, pass the board to disambiguate.
 */
export const updateIssue = async (input: UpdateIssueInput) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	const issueResult = findWritableIssue(input.issueId);
	if (isFail(issueResult)) return issueResult;
	const issue = issueResult.value;
	const issueId = issue.id;

	const stateResult = getStateResult();
	if (isFail(stateResult)) return stateResult;

	const changes: string[] = [];
	const events: AppEvent[] = [];

	// --- title ---
	if (input.title !== undefined) {
		const title = sanitizeInlineText(input.title);
		if (!title.trim()) return failed('Issue title cannot be empty');

		const overLong = tooLong('Issue title', title, MAX_TITLE_LENGTH);
		if (overLong) return failed(overLong);

		if (issue.title !== title) {
			events.push({
				id: ulid(),
				...actorOf(ready.value.actor),
				action: 'edit.title',
				payload: {id: issueId, name: title},
			} satisfies AppEvent<'edit.title'>);
			changes.push('title');
		}
	}

	// --- description ---
	if (input.description !== undefined) {
		const overLong = tooLong(
			'Issue description',
			input.description,
			MAX_DESCRIPTION_LENGTH,
		);
		if (overLong) return failed(overLong);

		const currentDesc = issue.props.description ?? '';
		if (currentDesc !== input.description) {
			events.push({
				id: ulid(),
				...actorOf(ready.value.actor),
				action: 'edit.description',
				payload: {id: issueId, md: input.description},
			} satisfies AppEvent<'edit.description'>);
			changes.push('description');
		}
	}

	// --- tags to add ---
	if (input.tagsToAdd?.length) {
		for (const raw of input.tagsToAdd) {
			const tagName = sanitizeInlineText(raw).trim();
			if (!tagName) continue;

			const existing = nodeRepo.findTagByName(tagName);
			const tagId = existing?.id ?? ulid();

			if (!existing) {
				events.push({
					id: ulid(),
					...actorOf(ready.value.actor),
					action: 'create.tag',
					payload: {id: tagId, name: tagName},
				} satisfies AppEvent<'create.tag'>);
			}

			// Idempotent: skip if the ticket already has this tag.
			const currentTags = issue.props.tags ?? [];
			if (currentTags.includes(tagId)) continue;

			events.push({
				id: ulid(),
				...actorOf(ready.value.actor),
				action: 'add.issue.tag',
				payload: {id: issueId, tag: tagId},
			} satisfies AppEvent<'add.issue.tag'>);
			changes.push(`tag:${tagName}`);
		}
	}

	// --- tags to remove ---
	if (input.tagsToRemove?.length) {
		for (const token of input.tagsToRemove) {
			const tag =
				nodeRepo.getTag(token) ??
				nodeRepo.findTagByName(sanitizeInlineText(token).trim());

			if (!tag) return failed(`Tag not found — pass the tag id, ref, or name`);

			const currentTags = issue.props.tags ?? [];
			if (!currentTags.includes(tag.id)) continue; // idempotent no-op

			events.push({
				id: ulid(),
				...actorOf(ready.value.actor),
				action: 'remove.issue.tag',
				payload: {id: issueId, tag: tag.id},
			} satisfies AppEvent<'remove.issue.tag'>);
			changes.push(`tag:-${tag.name}`);
		}
	}

	// --- assignees to add ---
	if (input.assigneesToAdd?.length) {
		for (const token of input.assigneesToAdd) {
			const assignee = resolveAssigneeToken(token, ready);
			if (isFail(assignee)) return assignee;

			const currentAssignees = issue.props.assignees ?? [];
			if (currentAssignees.includes(assignee.value.id)) continue; // idempotent

			const eventsArr: AppEvent[] = [];

			const isRegistered = Boolean(
				ready.value.state.contributors[assignee.value.id],
			);
			if (!isRegistered) {
				const authored = await findEventLogAuthor(
					ready.value.boot.stateBranchRoot,
					assignee.value.id,
				);
				const name = authored?.name ?? assignee.value.name;

				if (!authored && !ready.value.state.contributors[assignee.value.id]) {
					return failed(
						`Unknown assignee id — pass a contributor id, a name, or self`,
					);
				}

				eventsArr.push({
					id: ulid(),
					...actorOf(ready.value.actor),
					action: 'create.contributor',
					payload: {id: assignee.value.id, name},
				} satisfies AppEvent<'create.contributor'>);
			}

			eventsArr.push({
				id: ulid(),
				...actorOf(ready.value.actor),
				action: 'add.issue.assignee',
				payload: {id: issueId, assignee: assignee.value.id},
			} satisfies AppEvent<'add.issue.assignee'>);

			events.push(...eventsArr);
			changes.push(`assignee:${assignee.value.name}`);
		}
	}

	// --- assignees to remove ---
	if (input.assigneesToRemove?.length) {
		for (const token of input.assigneesToRemove) {
			const assignee = resolveAssigneeToken(token, ready);
			if (isFail(assignee)) return assignee;

			if (!ready.value.state.contributors[assignee.value.id]) {
				return failed(
					`Assignee not found — pass the contributor id, ref, or name`,
				);
			}

			const currentAssignees = issue.props.assignees ?? [];
			if (!currentAssignees.includes(assignee.value.id)) continue; // idempotent

			events.push({
				id: ulid(),
				...actorOf(ready.value.actor),
				action: 'remove.issue.assignee',
				payload: {id: issueId, assignee: assignee.value.id},
			} satisfies AppEvent<'remove.issue.assignee'>);
			changes.push(`assignee:-${assignee.value.name}`);
		}
	}

	// --- lane ---
	if (input.lane !== undefined) {
		const resolvedLane = resolveLaneId(
			input.lane,
			input.board,
			stateResult.value,
		);
		if (isFail(resolvedLane)) return resolvedLane;

		if (issue.parentNodeId !== resolvedLane.value) {
			events.push({
				id: ulid(),
				...actorOf(ready.value.actor),
				action: 'move.node',
				payload: {
					id: issueId,
					parent: resolvedLane.value,
					rank: 'end',
				},
			} satisfies AppEvent<'move.node'>);
			changes.push('lane');
		}
	}

	// Nothing changed — return early.
	if (events.length === 0) {
		return succeeded('No changes made', {
			id: issueId,
			ref: nodeRef(issueId),
			changed: [] as string[],
		});
	}

	const results = materializeAndPersistAll(
		events,
		ready.value.boot.stateBranchRoot,
	);
	if (isFail(results)) return failed(results.message);

	return succeeded('Updated issue', {
		id: issueId,
		ref: nodeRef(issueId),
		changed: changes,
	});
};

// Resolve an assignee token (id, ref, or name) to a contributor.
const resolveAssigneeToken = (
	token: string,
	ready: Awaited<ReturnType<typeof bootedWithActorAndState>>,
): Result<{id: string; name: string}> => {
	const trimmed = token.trim();
	const state = ready.value!.state;
	const contributors = state.contributors;

	// Direct id match in the contributor registry.
	const byId = contributors[trimmed];
	if (byId) return succeeded('Found assignee', {id: byId.id, name: byId.name});

	// Name match in the contributor directory.
	const matches = contributorDirectory({
		events: state.eventLog ?? [],
		registry: contributors,
		logFileNames: loadActorNames(ready.value!.boot.stateBranchRoot),
	}).filter(c => c.name === trimmed);

	if (matches.length > 1) {
		return failed(
			`"${trimmed}" matches ${matches.length} contributors (${matches
				.map(c => c.id)
				.join(', ')}). Pass an id.`,
		);
	}

	if (matches.length === 1) {
		return succeeded('Found assignee', {
			id: matches[0]!.id,
			name: matches[0]!.name,
		});
	}

	// Fallback: treat as an id that might be an event-log author.
	return succeeded('Treat as id', {id: trimmed, name: trimmed});
};

// Resolve a lane token (id, ref, or name) to a swimlane id.
const resolveLaneId = (
	token: string,
	board: string | undefined,
	state: AppState,
): Result<string> => {
	const trimmed = token.trim();
	const {nodes} = state;

	// Exact id match.
	const direct = nodes[trimmed];
	if (direct && isSwimlaneNode(direct) && !direct.isDeleted) {
		return succeeded('Found swimlane', trimmed);
	}

	// Ref match.
	const refMatches = Object.keys(nodes).filter(id => {
		const node = nodes[id];
		return (
			node &&
			isSwimlaneNode(node) &&
			!node.isDeleted &&
			nodeRefMatches(id, trimmed)
		);
	});

	if (refMatches.length === 1)
		return succeeded('Found swimlane', refMatches[0]!);

	// Name match.
	const nameMatches = Object.values(nodes).filter(n => {
		if (!isSwimlaneNode(n) || n.isDeleted) return false;
		if (board && n.parentNodeId !== board) return false;
		return n.title.toLowerCase() === trimmed.toLowerCase();
	});

	if (nameMatches.length === 1) {
		return succeeded('Found swimlane', nameMatches[0]!.id);
	}

	if (nameMatches.length > 1) {
		return failed(
			`"${trimmed}" matches ${nameMatches.length} swimlanes: ${nameMatches
				.map(n => `${n.title} (${n.id})`)
				.join(', ')}. Use an id or ref.`,
		);
	}

	return failed(`Swimlane not found — pass the id, ref, or name`);
};
