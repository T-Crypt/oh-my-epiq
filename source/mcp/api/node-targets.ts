import {
	Board,
	Swimlane,
	Ticket,
	isBoardNode,
	isSwimlaneNode,
	isTicketNode,
} from '../../lib/model/context.model.js';
import {
	Result,
	failed,
	isFail,
	succeeded,
} from '../../lib/model/result-types.js';
import {nodeRefMatches} from '../../lib/utils/node-ref.js';
import {getStateResult} from './boot.js';

// A write names its target or its parent by id, and the id has to be a live,
// writable node of the kind the write expects: a comment on a board, or a
// ticket filed under a board, would go into the log and never show anywhere.
// Guarded here, at the door, so the event is never written; replay stays
// tolerant of logs that predate these checks.

// A write may name a ticket by its full id or by the 7-character ref every
// list and get response carries; agents habitually copy the ref out of a
// ticket heading, so refusing it made every write that did so fail with
// "Issue not found" while the ticket was plainly there.
//
// Resolution is deliberately conservative: an unknown token is handed back
// untouched, so a genuine mistake still reads as "not found" rather than
// being silently remapped. `nodeRefMatches` ignores case and a typed hyphen,
// and only a unique match resolves — a short token hitting several tickets
// stays a not-found the caller can report.
export const resolveIssueId = (token: string): string => {
	const stateResult = getStateResult();
	if (isFail(stateResult)) return token;

	const query = token.trim();
	const nodes = stateResult.value.nodes;

	// Fast path: an exact, live ticket id.
	const direct = nodes[query];
	if (direct && !direct.isDeleted && isTicketNode(direct)) return query;

	const matches = Object.keys(nodes).filter(id => {
		const node = nodes[id];
		return Boolean(
			node && !node.isDeleted && isTicketNode(node) && nodeRefMatches(id, query),
		);
	});

	return matches.length === 1 ? matches[0]! : query;
};

export const findWritableIssue = (id: string): Result<Ticket> => {
	const stateResult = getStateResult();
	if (isFail(stateResult)) return stateResult;

	const resolved = resolveIssueId(id);
	const issue = stateResult.value.nodes[resolved];
	if (!issue || issue.isDeleted) {
		return failed('Issue not found — pass the issue id or its 7-character ref');
	}
	if (!isTicketNode(issue)) return failed('Target must be an issue');
	if (issue.readonly) return failed('Issue is readonly');

	return succeeded('Found issue', issue);
};

export const findWritableSwimlane = (id: string): Result<Swimlane> => {
	const stateResult = getStateResult();
	if (isFail(stateResult)) return stateResult;

	const lane = stateResult.value.nodes[id];
	if (!lane || lane.isDeleted) return failed('Swimlane not found');
	if (!isSwimlaneNode(lane)) return failed('Target must be a swimlane');
	if (lane.readonly) return failed('Swimlane is readonly');

	return succeeded('Found swimlane', lane);
};

export const findWritableBoard = (id: string): Result<Board> => {
	const stateResult = getStateResult();
	if (isFail(stateResult)) return stateResult;

	const board = stateResult.value.nodes[id];
	if (!board || board.isDeleted) return failed('Board not found');
	if (!isBoardNode(board)) return failed('Target must be a board');
	if (board.readonly) return failed('Board is readonly');

	return succeeded('Found board', board);
};
