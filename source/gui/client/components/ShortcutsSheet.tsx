import {useEffect, useRef} from 'react';
import {IconClose} from './PocketShell';

// The chord as the platform writes it, so the pill teaches the right key. A Mac
// reader shown `Ctrl` reaches for the wrong one, and a list of keys that lies is
// worse than no list.
const isApple = (): boolean =>
	typeof navigator !== 'undefined' &&
	/Mac|iPhone|iPad/.test(navigator.userAgent);

const modifier = isApple() ? ['⌘', 'K'] : ['Ctrl', 'K'];

type Row = {keys: string[]; label: string};

// Every row here is a key the board actually answers to today: the board's own
// bare presses (use-board-hotkeys), the palette's chord and its colon
// (use-command-palette), Escape, the palette's own list keys, and the lane tabs'
// walk. Nothing is listed that is not bound somewhere in the client.
const ROWS: Row[] = [
	{keys: modifier, label: 'Command palette'},
	{keys: [':'], label: 'Command palette'},
	{keys: ['['], label: 'Previous board'},
	{keys: [']'], label: 'Next board'},
	{keys: ['/'], label: 'Filter tickets'},
	{keys: ['l'], label: 'The activity log'},
	{keys: ['t'], label: 'Play the board back'},
	{keys: ['?'], label: 'This list'},
	{keys: ['Esc'], label: 'Close a sheet, or clear the selection'},
	{keys: ['↑', '↓'], label: 'Move in the command palette'},
	{keys: ['←', '→'], label: 'Walk the lane tabs on a phone'},
];

/**
 * Every shortcut in one place.
 *
 * A shortcut nobody can find is a shortcut nobody uses, so `?` opens this and
 * lists what the board answers to. It is a sheet like the Devices one — the same
 * scrim, the same head, the same Escape and click-past-it — because a second way
 * of drawing a sheet over the board would be a second thing to keep in step.
 *
 * Two test ids, deliberately: `shortcuts-sheet` has been the name of the
 * overlay since the sheet existed and is not renamed here, and `shortcut-sheet`
 * names the dialog itself, which is the part a reader means by "the sheet".
 */
export const ShortcutsSheet = ({onClose}: {onClose: () => void}) => {
	const closeRef = useRef<HTMLButtonElement | null>(null);

	// Focus lands on the way out: a sheet opened from the keyboard has to be
	// closable from the keyboard, and Tab from here reaches the way out too.
	useEffect(() => {
		closeRef.current?.focus();
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();
			}
		};

		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [onClose]);

	return (
		<div
			className="sheet-scrim"
			data-testid="shortcuts-sheet"
			onClick={onClose}
		>
			<div
				className="sheet"
				data-testid="shortcut-sheet"
				role="dialog"
				aria-modal="true"
				aria-label="Keyboard shortcuts"
				onClick={event => event.stopPropagation()}
			>
				<div className="sheet-head">
					<span>Keyboard shortcuts</span>
					<button
						ref={closeRef}
						className="rail-button"
						style={{width: 44, height: 44}}
						title="Close"
						aria-label="Close"
						onClick={onClose}
					>
						<IconClose />
					</button>
				</div>
				<div className="sheet-body">
					{ROWS.map(row => (
						<div className="shortcut-row" key={row.label}>
							<span className="shortcut-label">{row.label}</span>
							<span className="shortcut-keys">
								{row.keys.map((key, index) => (
									<kbd key={index}>{key}</kbd>
								))}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};
