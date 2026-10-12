import {useEffect, useRef, useState} from 'react';
import {CONTENT_FONT, GUI_THEME, TEXT} from '../lib/gui-theme';
import {Button} from './Button';
import {ActionRow, Empty, Textarea} from './FormPrimitives';
import {GuiNote, GuiUser} from '../lib/gui-state.model';
import {timeAgo} from '../lib/gui-format.helper';
import {MarkdownContent} from './MarkdownContent';
import {MAX_COMMENT_LENGTH} from '../../../lib/utils/text.limits.js';

type Props = {
	issueId: string;
	readonly?: boolean;
	notes?: GuiNote[];
	whoAmI: GuiUser;
	onAddNote?: (issueId: string, body: string) => void;
	onDeleteNote?: (issueId: string, noteId: string) => void;
	onEditNote?: (issueId: string, noteId: string, body: string) => void;
};

export const IssueNotes = ({
	whoAmI,
	issueId,
	readonly = false,
	notes = [],
	onAddNote,
	onDeleteNote,
	onEditNote,
}: Props) => {
	const [body, setBody] = useState('');
	const [editing, setEditing] = useState<{id: string; text: string} | null>(
		null,
	);

	const saveEdit = (note: GuiNote) => {
		if (!editing || !onEditNote) return;

		const next = editing.text.trim();
		if (next && next !== note.body) onEditNote(issueId, note.id, next);

		setEditing(null);
	};

	const length = body.trim().length;
	const tooLong = length > MAX_COMMENT_LENGTH;

	const addNote = () => {
		const nextBody = body.trim();
		if (!nextBody || tooLong) return;

		onAddNote?.(issueId, nextBody);
		setBody('');
	};

	const ordered = [...notes].sort(
		(a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
	);

	return (
		<div>
			{notes.length === 0 ? (
				<Empty>No notes</Empty>
			) : (
				<div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
					{ordered.map(note => {
						return (
							<div
								key={note.id}
								style={{
									background: GUI_THEME.panel2,
									borderRadius: 8,
									padding: '8px 10px',
								}}
							>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 8,
										marginBottom: 6,
									}}
								>
									<div
										style={{
											flex: 1,
											minWidth: 0,
											color: GUI_THEME.secondary,
											fontSize: TEXT.meta,
										}}
									>
										{note.author.name ?? 'unknown'}
										{note.createdAt && (
											<span style={{color: GUI_THEME.dim2}}>
												{' '}
												· {timeAgo(note.createdAt)}
											</span>
										)}
									</div>

									{!readonly &&
										note.author.id === whoAmI.id &&
										onEditNote &&
										editing?.id !== note.id && (
											<Button
												variant="ghost"
												testId="edit-note"
												title="Edit note"
												onClick={() =>
													setEditing({
														id: note.id,
														text: note.body,
													})
												}
											>
												edit
											</Button>
										)}
									{!readonly &&
										note.author.id === whoAmI.id &&
										onDeleteNote && (
											<Button
												variant="ghost"
												testId="delete-note"
												title="Delete note"
												onClick={event => {
													event.preventDefault();
													event.stopPropagation();
													onDeleteNote(issueId, note.id);
												}}
											>
												×
											</Button>
										)}
								</div>

								{editing?.id === note.id ? (
									<>
										<Textarea
											autoFocus
											maxLength={Number.MAX_SAFE_INTEGER}
											value={editing.text}
											placeholder="write a note"
											onChange={event =>
												setEditing({id: note.id, text: event.target.value})
											}
											onKeyDown={event => {
												if (event.key === 'Escape') setEditing(null);
												if (
													(event.metaKey || event.ctrlKey) &&
													event.key === 'Enter'
												) {
													saveEdit(note);
												}
											}}
											style={{
												minHeight: 45,
												font: 'inherit',
												fontFamily: CONTENT_FONT,
												fontSize: TEXT.prose,
											}}
										/>
										<ActionRow>
											<Button variant="ghost" onClick={() => setEditing(null)}>
												cancel
											</Button>
											<Button
												variant="primary"
												onClick={() => saveEdit(note)}
											>
												save
											</Button>
										</ActionRow>
									</>
								) : (
									<MarkdownContent content={note.body} softBreaks />
								)}
							</div>
						);
					})}
				</div>
			)}

			{!readonly && (
				<div style={{marginTop: 20}}>
					<Textarea
						maxLength={Number.MAX_SAFE_INTEGER}
						value={body}
						placeholder="write a note"
						onChange={event => setBody(event.target.value)}
						onKeyDown={event => {
							if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
								addNote();
							}
						}}
						style={{
							minHeight: 45,
							font: 'inherit',
							fontFamily: CONTENT_FONT,
							fontSize: TEXT.prose,
						}}
					/>

					<ActionRow>
						{length > MAX_COMMENT_LENGTH / 2 && (
							<span
								style={{
									alignSelf: 'center',
									fontSize: TEXT.meta,
									color: tooLong ? GUI_THEME.red : GUI_THEME.dim,
								}}
							>
								{tooLong
									? `${length - MAX_COMMENT_LENGTH} over the limit`
									: `${MAX_COMMENT_LENGTH - length} left`}
							</span>
						)}

						<Button variant="primary" disabled={tooLong} onClick={addNote}>
							note
						</Button>
					</ActionRow>
				</div>
			)}
		</div>
	);
};
