import {useEffect, useRef, useState} from 'react';
import {GuiComment, GuiIssue} from '../lib/gui-state.model';
import {GUI_THEME, TEXT} from '../lib/gui-theme';
import {tagChipColor} from '../lib/tag-colors';
import {
	THEATRE_CARD_IN_ANIMATION,
	THEATRE_FLASH_FRAMES,
	THEATRE_FLASH_TIMING,
} from '../lib/theatre';
import {isSwimlaneDrag} from '../lib/gui-move-swimlane';
// Types only, over the boundary `use-swimlane-stats` reads its own over.
import {RefDiffStat} from '../../../lib/stats/ref-diff-stats.model.js';
import {CARD_DIFF_GAP} from '../lib/diff-stat.style';
import {Button} from './Button';
import {DiffStat} from './DiffStat';
import {DwellLevel} from '../lib/lane-dwell';
import {formatDuration} from '../lib/gui-format.helper';
import {CopyRef} from './CopyRef';
import {IconButton, ICON_SIZE} from './IconButton';
import {IconClock} from './IconClock';
import {IconComment} from './IconComment';
import {User} from './User';

// The title's first line, which the controls at the card's right edge — the
// dwell, the comment count, the assignees — centre themselves on. Set by the
// title's own 15px step rather than by its old 13px one.
const TITLE_LINE_HEIGHT = 20;

// How many of a ticket's tags a card shows before it counts the rest. A card is
// read down a column of thirty, and a ticket tagged six ways was six chips of
// height in every one of them.
const TAGS_SHOWN = 2;

// The index's box at the card's left edge: three figures at the meta step,
// and the gap after it. Fixed, so a longer number never moves the title.
const CARD_INDEX_WIDTH = 22;
const CARD_INDEX_GAP = 8;

/** How long this ticket has sat in its lane, and how that reads beside its peers. */
export type CardDwell = {ms: number; level: DwellLevel};

// The one thing the figures beside it do not already say.
const diffTitle = (diff: RefDiffStat): string =>
	`${diff.commits} commit${diff.commits === 1 ? '' : 's'}`;

const DWELL_COLOR: Record<DwellLevel, string> = {
	none: GUI_THEME.dim,
	warn: GUI_THEME.amber,
	alert: GUI_THEME.red,
};

// A touch held this long becomes a selection, the stand-in for
// modifier-click where there is no keyboard.
const LONG_PRESS_MS = 450;

export const TicketCard = ({
	ticket,
	index,
	isSelected,
	isPicked,
	selectMode,
	commentCount,
	onOpenComments,
	onOpenCode,
	onSelect,
	isolatedTagId,
	onFilterByTag,
	onDragOverIssue,
	onDropIssueAt,
	theatre,
	flashKey,
	dwell,
	diff,
}: {
	ticket: GuiIssue;
	index: number;
	isSelected: boolean;
	// Part of a multi-ticket selection, which reads differently from the one
	// ticket whose details are open.
	isPicked: boolean;
	// The board is in touch-select mode: a tap toggles the ticket instead of
	// opening it, and the checkbox is always drawn.
	selectMode: boolean;
	onSelect: (options: {toggle: boolean}) => void;
	commentCount: number;
	onOpenComments: (issueId: string) => void;
	// The diff stat is the way into the commits behind it, the way the comment
	// count is the way into the comments.
	onOpenCode: (issueId: string) => void;
	// The tag the board is narrowed to, if it is exactly one.
	isolatedTagId: string | null;
	onFilterByTag: (tagId: string) => void;
	onDragOverIssue: (targetIndex: number) => void;
	onDropIssueAt: (issueId: string, targetIndex: number) => void;
	// The history player is up, so a card arriving on the board is one the movie
	// just produced and is worth an entrance.
	theatre: boolean;
	// The id of the event that just landed on this ticket, or null. Its identity
	// is what matters, not its content: two events in a row on one ticket have
	// to flash twice.
	flashKey: string | null;
	// Null while the board is not showing the present, where an elapsed time
	// measured against now means nothing.
	dwell: CardDwell | null;
	// What the commits naming this ticket add up to, or null for a ticket no
	// commit names — which draws nothing at all. Most of a board is tickets
	// nobody has written code for yet, and a flat grey line on every one of
	// them would be a column of noise saying nothing.
	diff: RefDiffStat | null;
}) => {
	const cardRef = useRef<HTMLDivElement | null>(null);
	const [diffHovered, setDiffHovered] = useState(false);
	const pressTimer = useRef<number | null>(null);
	// Set when the press timer fires, so the click that follows a long-press
	// is swallowed instead of opening the ticket just selected.
	const pressedLong = useRef(false);

	const cancelPress = () => {
		if (pressTimer.current !== null) {
			window.clearTimeout(pressTimer.current);
			pressTimer.current = null;
		}
	};

	// Opening the details panel takes 440px off the board, which can leave the
	// card that was just clicked behind it.
	useEffect(() => {
		if (!isSelected) return;

		cardRef.current?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest',
			inline: 'nearest',
		});
	}, [isSelected]);

	// Run off the element rather than through a CSS animation on the style prop:
	// the card's entrance already owns that property, and the board re-renders
	// on every frame of the movie, which would put the entrance back and cut a
	// running flash short. A web animation overrides the inline styles for its
	// own duration and reverts, and starts fresh on every call — which is what
	// makes two events in a row on one ticket flash twice.
	//
	// Deliberately not cancelled on the way out: events land closer together
	// than the flash is long, so cancelling as the spotlight moves to the next
	// ticket would cut every one of them short. A later flash on this same card
	// simply wins, and a finished one drops off on its own.
	useEffect(() => {
		const card = cardRef.current;
		if (!card || flashKey === null) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

		card.animate(THEATRE_FLASH_FRAMES, THEATRE_FLASH_TIMING);
	}, [flashKey]);

	const getVisualTargetIndex = (isAfterMiddle: boolean) =>
		index + (isAfterMiddle ? 1 : 0);

	return (
		<div
			ref={cardRef}
			draggable={!ticket.readonly}
			// Stopped here, or the board's own click handler would clear the
			// selection this click just made.
			onClick={event => {
				event.stopPropagation();
				if (pressedLong.current) {
					pressedLong.current = false;
					return;
				}
				const toggle =
					selectMode || event.metaKey || event.ctrlKey || event.shiftKey;
				if (toggle && ticket.readonly) return;
				onSelect({toggle});
			}}
			// Touch-only: the desktop already has modifier-click and the
			// select-mode checkbox. A drag scrolls, so movement cancels.
			onTouchStart={() => {
				if (ticket.readonly) return;
				pressedLong.current = false;
				cancelPress();
				pressTimer.current = window.setTimeout(() => {
					pressTimer.current = null;
					pressedLong.current = true;
					onSelect({toggle: true});
				}, LONG_PRESS_MS);
			}}
			onTouchMove={cancelPress}
			onTouchEnd={cancelPress}
			onTouchCancel={cancelPress}
			// Carries the id and nothing else. Selecting here would navigate to
			// the issue route mid-drag, remounting the board under the pointer so
			// the drop never lands.
			onDragStart={event => {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('text/plain', ticket.id);
			}}
			onDragOver={event => {
				// A swimlane crossing the card belongs to the column underneath, which
				// decides its own landing edge.
				if (isSwimlaneDrag(event.dataTransfer)) return;

				event.preventDefault();
				event.dataTransfer.dropEffect = 'move';

				const rect = event.currentTarget.getBoundingClientRect();
				const isAfterMiddle = event.clientY > rect.top + rect.height / 2;

				onDragOverIssue(getVisualTargetIndex(isAfterMiddle));
			}}
			onDrop={event => {
				// Before stopPropagation, or a column dropped over a card would be
				// swallowed here and never reach the section's own handler.
				if (isSwimlaneDrag(event.dataTransfer)) return;

				event.preventDefault();
				event.stopPropagation();

				const issueId = event.dataTransfer.getData('text/plain');
				if (!issueId) return;

				const rect = event.currentTarget.getBoundingClientRect();
				const isAfterMiddle = event.clientY > rect.top + rect.height / 2;

				onDropIssueAt(issueId, getVisualTargetIndex(isAfterMiddle));
			}}
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				// Inherited by the title and nothing else: everything else on the card
				// sets a tone of its own.
				color: isSelected || isPicked ? GUI_THEME.accent : GUI_THEME.body,
				fontSize: 11,
				cursor: ticket.readonly ? 'default' : 'grab',
				// A selected card is a step above a resting one, not a different
				// colour at the same weight: the two washes have to move together,
				// or picking one stops reading as picking it up.
				//
				// A resting card is a further step above the lane it stands in — the
				// foreground at ten percent, laid over the lane's own tile — where it
				// used to be the hover wash, which was faint enough that a column of
				// cards read as one grey block rather than as a column of cards.
				background:
					isSelected || isPicked ? GUI_THEME.accentWash : GUI_THEME.card,
				// Roomier than a list row: a card is read, not scanned, and the
				// air around its title is what keeps a column of them from
				// running together.
				// None on the left: the index's box is the margin there.
				//
				// The four steps below are the density tokens (ome.css), so the
				// comfortable/compact control moves a card without a second set of
				// card styles to keep in step with these.
				padding: 'var(--card-pad, 12px 18px 12px 0)',
				minHeight: 'var(--card-min-h, 58px)',
				borderRadius: '0',
				marginBottom: 'var(--card-gap, 12px)',
				border: `1px solid ${
					isSelected || isPicked ? GUI_THEME.accent : 'transparent'
				}`,
				borderLeft:
					'2px solid ' +
					(isSelected || isPicked ? GUI_THEME.accent : GUI_THEME.lineStrong),
				// The flash is applied to the node directly (see above), so it must
				// not be set here too or React would put it back on every render and
				// cut the running one short.
				animation: theatre ? THEATRE_CARD_IN_ANIMATION : undefined,
			}}
		>
			{(selectMode || isPicked) && (
				<button
					type="button"
					data-testid="ticket-select"
					aria-pressed={isPicked}
					title={isPicked ? 'Remove from selection' : 'Add to selection'}
					// Stopped here, or the click would also toggle the card — landing
					// back where it started.
					onClick={event => {
						event.stopPropagation();
						if (ticket.readonly) return;
						pressedLong.current = false;
						cancelPress();
						onSelect({toggle: true});
					}}
					style={{
						flexShrink: 0,
						width: 32,
						height: 32,
						margin: '-8px 0 -8px -8px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						background: 'none',
						border: 'none',
						cursor: 'pointer',
						color: isPicked ? GUI_THEME.accent : GUI_THEME.dim,
						fontSize: 16,
						lineHeight: 1,
					}}
				>
					<span
						aria-hidden
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							width: 16,
							height: 16,
							borderRadius: 5,
							border: `1.5px solid ${
								isPicked ? GUI_THEME.accent : GUI_THEME.dim
							}`,
							background: isPicked ? GUI_THEME.accentWash : 'transparent',
						}}
					>
						{isPicked && '✓'}
					</span>
				</button>
			)}
			{/* The card's number, on the title's first line. */}
			<span
				data-testid="ticket-index"
				aria-hidden
				style={{
					width: CARD_INDEX_WIDTH,
					marginRight: CARD_INDEX_GAP,
					flexShrink: 0,
					lineHeight: `${TITLE_LINE_HEIGHT}px`,
					textAlign: 'right',
					fontSize: TEXT.meta,
					whiteSpace: 'nowrap',
					overflow: 'hidden',
					// A mark in the margin, not a figure to read: well under the
					// ref's tone, and no brighter on the selected card, so it can
					// never draw the eye off the title.
					color: GUI_THEME.dim,
					fontVariantNumeric: 'tabular-nums',
				}}
			>
				{index + 1}
			</span>

			<div
				style={{
					flex: 1,
					minWidth: 0,
					display: 'flex',
					justifyContent: 'space-between',
					gap: 8,
				}}
			>
				<div
					style={{
						minWidth: 0,
						display: 'flex',
						flexDirection: 'column',
						gap: 12,
						flex: 1,
					}}
				>
					<div
						data-testid="ticket-title"
						style={{
							display: '-webkit-box',
							WebkitLineClamp: 2,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
							// A step above the metadata around it and a weight above the
							// lane's own title, so a card is read title first, tags second.
							fontWeight: 600,
							fontSize: 'var(--card-title-size, 15px)',
							lineHeight: `${TITLE_LINE_HEIGHT}px`,
							wordBreak: 'break-word',
						}}
					>
						{ticket.title}
					</div>

					{ticket.ref && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: CARD_DIFF_GAP,
								color: GUI_THEME.faint,
								fontSize: TEXT.meta,
							}}
						>
							<CopyRef refValue={ticket.ref} />
							{/* Nothing at all where the commits changed no lines — an
							    empty commit, a pure rename. The stat draws nothing there,
							    and the button around it would be an invisible thing to
							    hover and click. */}
							{diff && diff.insertions + diff.deletions > 0 && (
								<button
									type="button"
									data-testid="ticket-diff"
									title={diffTitle(diff)}
									// Stopped here, or the click would also select the card
									// — which would land on whichever tab was already open.
									onClick={event => {
										event.stopPropagation();
										onOpenCode(ticket.id);
									}}
									onMouseEnter={() => setDiffHovered(true)}
									onMouseLeave={() => setDiffHovered(false)}
									// The hover ground is the button's only chrome, and it is
									// pulled back out again by an equal negative margin: the
									// ground reaches past the figures without the ref's line
									// growing under it.
									//
									// Deliberately not an `IconButton`, which every other
									// control of this kind is: that one is a 24px square that
									// lights to the accent, and both would be wrong here —
									// this sits on the ref's own line, and what lights is the
									// stat, in its own two colours.
									style={{
										display: 'flex',
										alignItems: 'center',
										padding: '2px 4px',
										margin: '-2px -4px',
										borderRadius: 4,
										background: diffHovered ? GUI_THEME.hover : 'transparent',
										border: 'none',
										cursor: 'pointer',
										transition: 'background 120ms ease',
									}}
								>
									<DiffStat
										insertions={diff.insertions}
										deletions={diff.deletions}
										variant="card"
										lit={diffHovered}
									/>
								</button>
							)}
						</div>
					)}

					{/* A card's tags: a dot in the tag's own accent and its name, capped
					    at two with a count of the rest. The tag is the ticket's, but the
					    colour is the theme's — the name picks one of the palette's eight,
					    so the chip repaints with a theme switch and the same word is the
					    same colour on every board. */}
					{ticket.tags.length > 0 && (
						<div
							data-testid="card-tag"
							style={{
								display: 'flex',
								// Nothing wraps: a chip that broke across two lines would be a
								// second line of card height for one word.
								flexWrap: 'nowrap',
								gap: 6,
								alignItems: 'center',
								minWidth: 0,
							}}
						>
							{ticket.tags.slice(0, TAGS_SHOWN).map(tag => {
								const isolated = tag.id === isolatedTagId;
								const chip = tagChipColor(tag.name);

								return (
									<Button
										key={tag.id}
										variant="chip"
										data-testid="ticket-tag"
										aria-pressed={isolated}
										tint={chip.tint}
										held={isolated}
										dense
										title={
											isolated
												? 'Show every ticket again'
												: `Show only tickets tagged ${tag.name}`
										}
										// Stopped here, or the click would also select the card.
										onClick={event => {
											event.stopPropagation();
											onFilterByTag(tag.id);
										}}
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 5,
											whiteSpace: 'nowrap',
											minWidth: 0,
											color: chip.text,
										}}
									>
										<span
											aria-hidden
											style={{
												width: 6,
												height: 6,
												flexShrink: 0,
												background: `var(--o-${chip.accent})`,
											}}
										/>
										{/* Bounded rather than left to run: a name long enough to
										    take the row is cut, and the title above holds it whole. */}
										<span
											style={{
												overflow: 'hidden',
												textOverflow: 'ellipsis',
											}}
										>
											{tag.name}
										</span>
									</Button>
								);
							})}

							{ticket.tags.length > TAGS_SHOWN && (
								<span
									title={ticket.tags
										.slice(TAGS_SHOWN)
										.map(tag => tag.name)
										.join(', ')}
									aria-label={`${ticket.tags.length - TAGS_SHOWN} more tags`}
									style={{
										fontSize: TEXT.label,
										color: GUI_THEME.dim2,
										fontVariantNumeric: 'tabular-nums',
										flexShrink: 0,
									}}
								>
									+{ticket.tags.length - TAGS_SHOWN}
								</span>
							)}
						</div>
					)}
				</div>

				{/* The controls, each centred on the title's first line whatever its
				    own height: the box is that line's height and lets them overhang. */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 4,
						flexShrink: 0,
						height: TITLE_LINE_HEIGHT,
					}}
				>
					{dwell && dwell.level !== 'none' && (
						<span
							data-testid="ticket-dwell"
							data-dwell-level={dwell.level}
							title={`In this lane ${formatDuration(
								dwell.ms,
							)} — far longer than the rest of the column`}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 4,
								color: DWELL_COLOR[dwell.level],
								fontSize: 11,
								fontWeight: 600,
								lineHeight: 1,
								whiteSpace: 'nowrap',
								marginRight: 4,
							}}
						>
							<IconClock size={12} />
							<span>{formatDuration(dwell.ms)}</span>
						</span>
					)}

					{commentCount > 0 && (
						<IconButton
							testId="ticket-comments"
							title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
							label={String(commentCount)}
							// Stopped here, or the click would also select the card.
							onClick={event => {
								event.stopPropagation();
								onOpenComments(ticket.id);
							}}
						>
							<IconComment size={ICON_SIZE} />
						</IconButton>
					)}

					{ticket.assignees.length > 0 && (
						<div style={{display: 'flex', flexShrink: 0, marginLeft: 4}}>
							{ticket.assignees.map((assignee, idx) => (
								<User
									key={assignee.id}
									user={assignee}
									index={idx}
									isFocus={isSelected}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
