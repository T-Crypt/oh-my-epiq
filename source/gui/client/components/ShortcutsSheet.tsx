import {useEffect} from 'react';
import {GUI_THEME, TEXT} from '../lib/gui-theme';

// The chord as the platform writes it, so the pill teaches the right key.
const isApple = (): boolean =>
	typeof navigator !== 'undefined' &&
	/Mac|iPhone|iPad/.test(navigator.userAgent);

const Key = ({children}: {children: string}) => (
	<kbd
		style={{
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			minWidth: 18,
			height: 18,
			padding: '0 5px',
			boxSizing: 'border-box',
			borderRadius: 4,
			background: GUI_THEME.panel2,
			border: `1px solid ${GUI_THEME.line}`,
			color: GUI_THEME.secondary,
			font: 'inherit',
			fontSize: TEXT.label,
			lineHeight: 1,
		}}
	>
		{children}
	</kbd>
);

type Row = {keys: string[]; label: string};

const modifier = isApple() ? ['⌘', 'K'] : ['Ctrl', 'K'];

const rows: Row[] = [
	{keys: modifier, label: 'Command palette'},
	{keys: [':'], label: 'Command palette'},
	{keys: ['['], label: 'Previous board'},
	{keys: [']'], label: 'Next board'},
	{keys: ['/'], label: 'Filter tickets'},
	{keys: ['l'], label: 'Toggle the activity log'},
	{keys: ['t'], label: 'Play the board back'},
	{keys: ['?'], label: 'This list'},
];

/**
 * Every shortcut in one place.
 *
 * A shortcut nobody can find is a shortcut nobody uses, so `?` opens this and
 * lists what the board answers to. Escape or a click past the sheet closes it,
 * the way the other sheets close.
 */
export const ShortcutsSheet = ({onClose}: {onClose: () => void}) => {
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
			data-testid="shortcuts-sheet"
			role="dialog"
			aria-modal="true"
			aria-label="Keyboard shortcuts"
			onMouseDown={onClose}
			style={{
				position: 'fixed',
				inset: 0,
				background: GUI_THEME.scrim,
				display: 'flex',
				alignItems: 'flex-start',
				justifyContent: 'center',
				paddingTop: '12vh',
				zIndex: 1100,
			}}
		>
			<div
				onMouseDown={event => event.stopPropagation()}
				style={{
					width: 'min(420px, calc(100vw - 32px))',
					background: GUI_THEME.panel,
					border: `1px solid ${GUI_THEME.edge}`,
					borderRadius: 8,
					boxShadow: `0 16px 48px ${GUI_THEME.shadow}`,
					padding: 16,
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						marginBottom: 8,
					}}
				>
					<span style={{fontSize: TEXT.ui, color: GUI_THEME.primary}}>
						Keyboard shortcuts
					</span>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						style={{
							background: 'transparent',
							border: 'none',
							color: GUI_THEME.dim,
							fontSize: TEXT.label,
							fontFamily: 'inherit',
							cursor: 'pointer',
						}}
					>
						Close
					</button>
				</div>

				{rows.map(row => (
					<div
						key={row.label}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 16,
							padding: '7px 0',
							borderTop: `1px solid ${GUI_THEME.line}`,
						}}
					>
						<span style={{fontSize: TEXT.ui, color: GUI_THEME.secondary}}>
							{row.label}
						</span>
						<span style={{display: 'inline-flex', gap: 3, flexShrink: 0}}>
							{row.keys.map((key, index) => (
								<Key key={index}>{key}</Key>
							))}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};
