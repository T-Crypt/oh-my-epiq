import {AppEvent} from '../board/board-events.model.js';
import {Note} from '../model/context.model.js';
import {nodes} from '../state/node-builder.js';

export const createNoteNode = (
	note: NoteItem,
	index: number,
	parentNodeId: string,
): Note =>
	nodes.note({
		id: note.id,
		parentNodeId,
		rank: String(index).padStart(6, '0'),
		name: note.id,
		props: {
			value: note.md,
		},
		readonly: true,
		isVirtual: true,
	});

export const isDeleteNoteEvent = (
	event: AppEvent,
): event is AppEvent<'delete.issue.note'> =>
	event.action === 'delete.issue.note';

export const isAddNoteEvent = (
	event: AppEvent,
): event is AppEvent<'add.issue.note'> => event.action === 'add.issue.note';

export type NoteItem = {
	id: string;
	issue: string;
	md: string;
	authorId: string;
};
