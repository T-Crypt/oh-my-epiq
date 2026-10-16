import {useState} from 'react';
import {GuiContributor, GuiIssue, GuiTag} from '../lib/gui-state.model';
import {GUI_THEME} from '../lib/gui-theme';
import {bulkCloseTargets, bulkReopenTargets} from '../lib/bulk-edit';
import {tagChipColor} from '../lib/tag-colors';
import {Aside} from './Aside';
import {AsideDock} from '../lib/aside-dock';
import {Button} from './Button';
import {ChipRow, Empty, Input, AddRow, Textarea} from './FormPrimitives';
import {FormHeader} from './FormHeader';
import {Section} from './Section';
import {ConfirmModal} from './ConfirmModal';

// Counted so a chip can say whether it applies to the whole selection or only
// part of it — removing something half the tickets have needs to be visible.
const countBy = <T extends {id: string}>(
	issues: GuiIssue[],
	pick: (issue: GuiIssue) => T[],
) => {
	const byId = new Map<string, {item: T; count: number}>();

	for (const issue of issues) {
		for (const item of pick(issue)) {
			const seen = byId.get(item.id);
			byId.set(item.id, {item, count: (seen?.count ?? 0) + 1});
		}
	}

	return [...byId.values()];
};

const ticketWord = (count: number): string =>
	count === 1 ? 'ticket' : 'tickets';

export const BulkDetails = ({
	dock,
	issues,
	knownTags,
	knownAssignees,
	tagName,
	assigneeName,
	onChangeTagName,
	onChangeAssigneeName,
	onAddTag,
	onRemoveTag,
	onAddAssignee,
	onRemoveAssignee,
	onCloseIssues,
	onReopenIssues,
	onAddCommentAll,
	onAppendDescription,
	onReplaceDescription,
	swimlanes,
	onMoveAll,
	onClear,
}: {
	dock: AsideDock;
	issues: GuiIssue[];
	knownTags: GuiTag[];
	knownAssignees: GuiContributor[];
	tagName: string;
	assigneeName: string;
	onChangeTagName: (value: string) => void;
	onChangeAssigneeName: (value: string) => void;
	onAddTag: (tagName: string) => void;
	onRemoveTag: (tagId: string) => void;
	onAddAssignee: (assigneeId: string) => void;
	onRemoveAssignee: (assigneeId: string) => void;
	onCloseIssues: () => void;
	onReopenIssues: () => void;
	onAddCommentAll: (body: string) => void;
	// Appended after a separator, so whatever is there survives.
	onAppendDescription: (text: string) => void;
	// Replaces every selected description wholesale — behind a confirm.
	onReplaceDescription: (text: string) => void;
	swimlanes: {id: string; title: string}[];
	onMoveAll: (swimlaneId: string) => void;
	onClear: () => void;
}) => {
	const total = issues.length;
	const closable = bulkCloseTargets(issues).length;
	const reopenable = bulkReopenTargets(issues).length;
	const tags = countBy(issues, issue => issue.tags);
	const assignees = countBy(issues, issue => issue.assignees);

	const [comment, setComment] = useState('');
	const [description, setDescription] = useState('');
	const [moveTarget, setMoveTarget] = useState('');
	const [confirming, setConfirming] = useState<
		null | 'close' | 'reopen' | 'replace'
	>(null);

	const availableTags = knownTags.filter(
		tag =>
			!tags.some(entry => entry.item.id === tag.id && entry.count === total),
	);
	const availableAssignees = knownAssignees.filter(
		person =>
			!assignees.some(
				entry => entry.item.id === person.id && entry.count === total,
			),
	);

	const partial = (count: number) =>
		count === total ? '' : ` ${count}/${total}`;

	const postComment = () => {
		const body = comment.trim();
		if (!body) return;

		onAddCommentAll(body);
		setComment('');
	};

	const appendDescription = () => {
		const text = description.trim();
		if (!text) return;

		onAppendDescription(text);
		setDescription('');
	};

	const replaceDescription = () => {
		const text = description.trim();
		if (!text) return;

		onReplaceDescription(text);
		setDescription('');
		setConfirming(null);
	};

	// Short composer: the default 140px would push the actions off a phone
	// sheet under the mobile keyboard.
	const composerStyle = {minHeight: 64};

	return (
		<Aside dock={dock}>
			<FormHeader>
				<div style={{fontSize: 13, fontWeight: 600, color: GUI_THEME.primary}}>
					{total} tickets selected
				</div>
				<Button variant="ghost" onClick={onClear}>
					clear
				</Button>
			</FormHeader>

			<Section title="Tags">
				<ChipRow>
					{tags.length === 0 ? (
						<Empty>No tags</Empty>
					) : (
						tags.map(({item, count}) => {
							const chip = tagChipColor(item.name);
							return (
								<Button
									key={item.id}
									variant="chip"
									title="Remove from every selected ticket"
									onClick={() => onRemoveTag(item.id)}
									tint={chip.tint}
									style={{color: chip.text}}
								>
									{item.name}
									{partial(count)} ×
								</Button>
							);
						})
					)}
				</ChipRow>

				<ChipRow>
					{availableTags.map(tag => {
						const chip = tagChipColor(tag.name);
						return (
							<Button
								key={tag.id}
								variant="chip"
								title="Add to every selected ticket"
								onClick={() => onAddTag(tag.name)}
								tint={chip.tint}
								style={{color: chip.text, opacity: 0.6}}
							>
								+ {tag.name}
							</Button>
						);
					})}
				</ChipRow>

				<AddRow>
					<Input
						value={tagName}
						placeholder="new tag"
						onChange={event => onChangeTagName(event.target.value)}
						onKeyDown={event => {
							if (event.key === 'Enter' && tagName.trim()) {
								onAddTag(tagName.trim());
							}
						}}
					/>
					<Button onClick={() => tagName.trim() && onAddTag(tagName.trim())}>
						add
					</Button>
				</AddRow>
			</Section>

			<Section title="Assignees">
				<ChipRow>
					{assignees.length === 0 ? (
						<Empty>No assignees</Empty>
					) : (
						assignees.map(({item, count}) => (
							<Button
								key={item.id}
								variant="chip"
								title="Remove from every selected ticket"
								onClick={() => onRemoveAssignee(item.id)}
								style={{color: item.color}}
							>
								@{item.name}
								{partial(count)} ×
							</Button>
						))
					)}
				</ChipRow>

				<ChipRow>
					{availableAssignees.map(person => (
						<Button
							key={person.id}
							variant="chip"
							title="Add to every selected ticket"
							onClick={() => onAddAssignee(person.id)}
							style={{color: person.color, opacity: 0.6}}
						>
							+ @{person.isSelf ? 'me' : person.name}
						</Button>
					))}
				</ChipRow>

				<AddRow>
					<Input
						value={assigneeName}
						placeholder="name of unknown contributor"
						onChange={event => onChangeAssigneeName(event.target.value)}
					/>
				</AddRow>
			</Section>

			<Section title={`Comment · posts to all ${total}`}>
				<Textarea
					data-testid="bulk-comment"
					value={comment}
					placeholder={`Comment on ${total} ${ticketWord(total)}`}
					maxLength={Number.MAX_SAFE_INTEGER}
					onChange={event => setComment(event.target.value)}
					style={composerStyle}
				/>
				<AddRow>
					<span style={{flex: 1}} />
					<Button
						data-testid="bulk-comment-post"
						variant="primary"
						disabled={!comment.trim()}
						onClick={postComment}
					>
						post to all
					</Button>
				</AddRow>
			</Section>

			<Section title={`Description · edits all ${total}`}>
				<Textarea
					data-testid="bulk-description"
					value={description}
					placeholder="Text to append or replace with"
					maxLength={Number.MAX_SAFE_INTEGER}
					onChange={event => setDescription(event.target.value)}
					style={composerStyle}
				/>
				<ChipRow>
					<Button
						data-testid="bulk-description-append"
						disabled={!description.trim()}
						title="Adds after a separator, keeping what is there"
						onClick={appendDescription}
					>
						append to all
					</Button>
					<Button
						data-testid="bulk-description-replace"
						disabled={!description.trim()}
						title="Replaces every selected description"
						onClick={() => setConfirming('replace')}
					>
						replace all…
					</Button>
				</ChipRow>
			</Section>

			<Section title="Move to lane">
				<AddRow>
					<select
						data-testid="bulk-move-lane"
						aria-label="Target lane"
						value={moveTarget}
						onChange={event => setMoveTarget(event.target.value)}
						style={{
							flex: 1,
							minWidth: 0,
							background: GUI_THEME.bg,
							color: GUI_THEME.primary,
							border: `1px solid ${GUI_THEME.line}`,
							borderRadius: 8,
							padding: '8px 10px',
							font: 'inherit',
							minHeight: 44,
						}}
					>
						<option value="">pick a lane…</option>
						{swimlanes.map(swimlane => (
							<option key={swimlane.id} value={swimlane.id}>
								{swimlane.title}
							</option>
						))}
					</select>
					<Button
						data-testid="bulk-move-go"
						variant="primary"
						disabled={!moveTarget}
						onClick={() => moveTarget && onMoveAll(moveTarget)}
					>
						move {total}
					</Button>
				</AddRow>
			</Section>

			<Section title="Actions">
				<ChipRow>
					{closable > 0 && (
						<Button
							data-testid="bulk-close"
							onClick={() => setConfirming('close')}
						>
							close {closable} {ticketWord(closable)}
						</Button>
					)}

					{reopenable > 0 && (
						<Button
							data-testid="bulk-reopen"
							onClick={() => setConfirming('reopen')}
						>
							reopen {reopenable} {ticketWord(reopenable)}
						</Button>
					)}
				</ChipRow>
			</Section>

			{confirming === 'close' && (
				<ConfirmModal
					eyebrow="Bulk close"
					heading={`Close ${closable} ${ticketWord(closable)}?`}
					body={
						total - closable > 0
							? `${closable} open ${ticketWord(closable)} will be closed. ${
									total - closable
							  } already closed stay as they are.`
							: `${closable} ${ticketWord(closable)} will be closed.`
					}
					confirmLabel={`close ${closable}`}
					onConfirm={() => {
						setConfirming(null);
						onCloseIssues();
					}}
					onClose={() => setConfirming(null)}
				/>
			)}

			{confirming === 'reopen' && (
				<ConfirmModal
					eyebrow="Bulk reopen"
					heading={`Reopen ${reopenable} ${ticketWord(reopenable)}?`}
					body={
						total - reopenable > 0
							? `${reopenable} closed ${ticketWord(
									reopenable,
							  )} will be reopened. ${
									total - reopenable
							  } already open stay as they are.`
							: `${reopenable} ${ticketWord(reopenable)} will be reopened.`
					}
					confirmLabel={`reopen ${reopenable}`}
					onConfirm={() => {
						setConfirming(null);
						onReopenIssues();
					}}
					onClose={() => setConfirming(null)}
				/>
			)}

			{confirming === 'replace' && (
				<ConfirmModal
					eyebrow="Bulk replace"
					heading={`Replace ${total} descriptions?`}
					body="Every selected ticket's description becomes this text. Append instead to keep what is there."
					confirmLabel={`replace ${total}`}
					onConfirm={replaceDescription}
					onClose={() => setConfirming(null)}
				/>
			)}
		</Aside>
	);
};
