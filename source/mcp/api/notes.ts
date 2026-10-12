import {ulid} from 'ulid';
import {materializeAndPersistAll} from '../../lib/board/board-log.js';
import {actorOf, AppEvent} from '../../lib/board/board-events.model.js';
import {failed, isFail, succeeded} from '../../lib/model/result-types.js';
import {MAX_COMMENT_LENGTH} from '../../lib/utils/text.limits.js';
import {ToolInput, bootedWithActorAndState} from './boot.js';
import {findWritableIssue} from './node-targets.js';

type AddIssueNoteInput = ToolInput & {
	issueId: string;
	body: string;
};

type DeleteIssueNoteInput = ToolInput & {
	noteId: string;
};

type EditIssueNoteInput = ToolInput & {
	noteId: string;
	body: string;
};

export const addIssueNote = async (input: AddIssueNoteInput) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	const issueResult = findWritableIssue(input.issueId);
	if (isFail(issueResult)) return issueResult;

	const issueId = issueResult.value.id;

	const body = input.body.trim();

	if (!body) {
		return failed('Note cannot be empty');
	}

	if (body.length > MAX_COMMENT_LENGTH) {
		return failed(
			`Note cannot exceed ${MAX_COMMENT_LENGTH} characters (got ${body.length})`,
		);
	}

	const noteId = ulid();

	const event = {
		id: ulid(),
		...actorOf(ready.value.actor),
		action: 'add.issue.note',
		payload: {
			id: noteId,
			issue: issueId,
			md: body,
			author: ready.value.actor.userId,
		},
	} satisfies AppEvent<'add.issue.note'>;

	const results = materializeAndPersistAll(
		[event],
		ready.value.boot.stateBranchRoot,
	);

	if (isFail(results)) return failed(results.message);

	return succeeded('Added issue note', {
		id: noteId,
		issueId,
		body,
	});
};

export const deleteIssueNote = async (input: DeleteIssueNoteInput) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	const noteEvent = ready.value.state.eventLog.find(
		(event): event is AppEvent<'add.issue.note'> =>
			event.action === 'add.issue.note' &&
			event.payload.id === input.noteId,
	);

	if (!noteEvent) {
		return failed('Unable to resolve note');
	}

	if (noteEvent.payload.author !== ready.value.actor.userId) {
		return failed('You can only delete your own notes');
	}

	const issueResult = findWritableIssue(noteEvent.payload.issue);
	if (isFail(issueResult)) return issueResult;

	const alreadyDeleted = ready.value.state.eventLog.some(
		event =>
			event.action === 'delete.issue.note' &&
			event.payload.id === input.noteId,
	);

	if (alreadyDeleted) {
		return succeeded('Note already deleted', {
			id: input.noteId,
			issueId: noteEvent.payload.issue,
		});
	}

	const event = {
		id: ulid(),
		...actorOf(ready.value.actor),
		action: 'delete.issue.note',
		payload: {
			id: input.noteId,
			issue: noteEvent.payload.issue,
		},
	} satisfies AppEvent<'delete.issue.note'>;

	const results = materializeAndPersistAll(
		[event],
		ready.value.boot.stateBranchRoot,
	);

	if (isFail(results)) return failed(results.message);

	return succeeded('Deleted issue note', {
		id: input.noteId,
		issueId: noteEvent.payload.issue,
	});
};

export const editIssueNote = async (input: EditIssueNoteInput) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	const noteEvent = ready.value.state.eventLog.find(
		(event): event is AppEvent<'add.issue.note'> =>
			event.action === 'add.issue.note' &&
			event.payload.id === input.noteId,
	);

	if (!noteEvent) {
		return failed('Unable to resolve note');
	}

	if (noteEvent.payload.author !== ready.value.actor.userId) {
		return failed('You can only edit your own notes');
	}

	const issueResult = findWritableIssue(noteEvent.payload.issue);
	if (isFail(issueResult)) return issueResult;

	const deleted = ready.value.state.eventLog.some(
		event =>
			event.action === 'delete.issue.note' &&
			event.payload.id === input.noteId,
	);

	if (deleted) return failed('Note was deleted');

	const body = input.body.trim();

	if (!body) {
		return failed('Note cannot be empty');
	}

	if (body.length > MAX_COMMENT_LENGTH) {
		return failed(
			`Note cannot exceed ${MAX_COMMENT_LENGTH} characters (got ${body.length})`,
		);
	}

	const event = {
		id: ulid(),
		...actorOf(ready.value.actor),
		action: 'edit.issue.note',
		payload: {
			id: input.noteId,
			issue: noteEvent.payload.issue,
			md: body,
		},
	} satisfies AppEvent<'edit.issue.note'>;

	const results = materializeAndPersistAll(
		[event],
		ready.value.boot.stateBranchRoot,
	);

	if (isFail(results)) return failed(results.message);

	return succeeded('Edited issue note', {
		id: input.noteId,
		issueId: noteEvent.payload.issue,
		body,
	});
};
