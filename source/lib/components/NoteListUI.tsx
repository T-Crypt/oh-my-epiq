import {Box, Text} from 'ink';
import React, {useEffect, useMemo, useRef} from 'react';
import {decodeTime} from 'ulid';
import {navigationUtils} from '../actions/default/navigation-action-utils.js';
import {ulidTimeMs} from '../event/date-utils.js';
import {timeAgo} from '../utils/date.utils.js';
import {Note, isFieldNode, isNoteNode, Ticket} from '../model/context.model.js';
import {isSuccess} from '../model/result-types.js';
import {nodeRepo} from '../repository/node-repo.js';
import {getState, useAppState} from '../state/state.js';
import {theme} from '../theme/themes.js';
import {virtualNodeId} from '../virtual-nodes/virtual-ids.js';
import {AssigneeUI} from './Assignee.js';
import {ScrollBoxUI} from './ScrollBox.js';
import {NoteItem, createNoteNode} from '../utils/note.utils.js';
import {renderMarkdownLines} from '../utils/markdown-lite.js';
import {MarkdownLinesUI} from './MarkdownLinesUI.js';

type Props = {
	ticket: Ticket;
	width: number;
	height: number;
};

// Top border, two header rows, one row of padding under the body.
const CARD_CHROME_ROWS = 4;

const getNotesRootNodeId = (ticketId: string) =>
	virtualNodeId(ticketId, 'notes');

const getNoteItems = (ticket: Ticket): NoteItem[] =>
	nodeRepo
		.getNotesByIssue(ticket.id)
		.sort((a, b) => decodeTime(a.id) - decodeTime(b.id))
		.map(note => ({
			id: note.id,
			issue: note.issue,
			authorId: note.authorId,
			md: note.md,
		}));

const detachNoteNodes = (noteNodes: Note[]) => {
	for (const node of noteNodes) {
		nodeRepo.deleteNode(node.id);
	}
};

const attachNoteNodes = (ticket: Ticket, notes: NoteItem[]): Note[] => {
	const rootNode = nodeRepo.getNode(getNotesRootNodeId(ticket.id));
	if (!rootNode || !isFieldNode(rootNode)) return [];

	const nodes = notes
		.map((note, index) => createNoteNode(note, index, rootNode.id))
		.map(nodeRepo.createNode)
		.filter(isSuccess)
		.map(({value}) => value)
		.filter(isNoteNode);

	if (notes.length > 0 && getState().selectedIndex < 0) {
		navigationUtils.navigate({
			contextNode: rootNode,
			selectedIndex: 0,
		});
	}

	return nodes;
};

export function NoteListUI({ticket, width, height}: Props) {
	const notes = useMemo(() => getNoteItems(ticket), [ticket]);

	const noteNodesRef = useRef<Note[]>([]);

	useEffect(() => {
		detachNoteNodes(noteNodesRef.current);

		noteNodesRef.current = attachNoteNodes(ticket, notes);

		return () => {
			detachNoteNodes(noteNodesRef.current);
			noteNodesRef.current = [];
		};
	}, [ticket, notes]);

	const {selectedIndex} = useAppState();
	const padding = 4;
	const scrollHeight = Math.max(1, height - padding);
	const bodyWidth = Math.max(20, width - 8);

	const bodies = useMemo(
		() =>
			notes.map(note => {
				const lines = renderMarkdownLines(note.md, bodyWidth);
				return lines.length > 0 ? lines : [{kind: 'blank' as const}];
			}),
		[notes, bodyWidth],
	);
	const itemHeights = bodies.map(lines => lines.length + CARD_CHROME_ROWS);

	if (notes.length === 0) {
		return (
			<Box flexDirection="column" width={width} height={height} padding={1}>
				<Text color={theme.primary}>No notes yet.</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" width={width} height={height}>
			<Box
				paddingLeft={4}
				borderLeft={false}
				borderRight={false}
				borderBottom={false}
				borderTop={true}
				borderColor={theme.secondary}
				borderStyle="single"
				paddingBottom={1}
			>
				<Text color={theme.secondary2}>Notes ({notes.length}) </Text>
			</Box>

			<ScrollBoxUI
				height={scrollHeight}
				itemHeights={itemHeights}
				selectedIndex={selectedIndex}
			>
				{notes.map((note, index) => {
					const isSelected = index === selectedIndex;

					return (
						<Box
							key={note.id}
							flexDirection="column"
							paddingX={1}
							borderLeft={false}
							borderBottom={false}
							borderRight={false}
							borderColor={theme.secondary}
							borderStyle="single"
						>
							<Box flexDirection="row" paddingBottom={1}>
								<Text color={theme.accent}>{isSelected ? '❯ ' : '  '}</Text>
								<Box paddingLeft={1}>
									<Text color={theme.secondary2}>{`#${index + 1} `}</Text>
									<AssigneeUI id={note.authorId} />
									<Text color={theme.secondary2}>
										{' ' + timeAgo(ulidTimeMs(note.id))}
									</Text>
								</Box>
							</Box>

							<Box paddingLeft={3} paddingBottom={1}>
								<MarkdownLinesUI
									lines={bodies[index] ?? []}
									width={bodyWidth}
								/>
							</Box>
						</Box>
					);
				})}
			</ScrollBoxUI>
		</Box>
	);
}
