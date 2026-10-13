// Theme switcher: a sheet showing all themes as cards with preview swatches.
// Mounted from the rail on desktop and the Appearance tile on mobile.

import {useEffect, useState} from 'react';
import {
	themeIds,
	applyTheme,
	setThemeId,
	savedThemeId,
	themeVars,
	varsStyle,
	THEMES,
} from '../lib/theme.js';
import {
	subscribeThemeChange,
	notifyThemeChange,
} from '../lib/theme-subscribe.js';

const DOTS = [
	'--o-red',
	'--o-yellow',
	'--o-green',
	'--o-cyan',
	'--o-blue',
	'--o-magenta',
];

// Re-export the shared theme-change subscription so the app root can use it.
export {subscribeThemeChange};

function triggerThemeChange() {
	notifyThemeChange();
}

/** A single theme card: a tiny desktop preview with the theme's colors. */
function ThemeCard({id, index}: {id: string; index: number}) {
	const [active, setActive] = useState(false);

	useEffect(() => {
		const fn = () => {
			const current = savedThemeId();
			setActive(
				current === id || (id === 'tokyo-night' && current === 'desktop'),
			);
		};
		fn();
		return subscribeThemeChange(fn);
	}, [id]);

	const palette = THEMES[id];
	if (!palette) return null;

	const vars = themeVars({
		id,
		name: palette.name,
		mode: palette.colors.mode as 'dark' | 'light',
		colors: palette.colors,
	});
	const isLight = palette.colors.mode === 'light';
	const cssVars: Record<string, string> = {};
	for (const [k, v] of Object.entries(vars)) {
		if (v !== null) cssVars[k] = v;
	}

	return (
		<button
			className={`theme-card${active ? ' on' : ''}`}
			style={
				{...cssVars, '--i': String(index)} as unknown as React.CSSProperties
			}
			title={palette.name}
			onClick={() => {
				if (id !== savedThemeId()) {
					setThemeId(id);
					triggerThemeChange();
				}
			}}
		>
			<div className="tc-desk">
				<div className="tc-win">
					<i></i>
					<i></i>
					<i className="lit"></i>
				</div>
				<div className="tc-win">
					<i></i>
					<i></i>
					<i className="lit"></i>
				</div>
			</div>
			<div className="tc-name">
				{palette.name}
				{isLight && <small>light</small>}
			</div>
			<div className="tc-dots">
				{DOTS.map(dot => (
					<i key={dot} style={{background: `var(${dot})`}} />
				))}
			</div>
		</button>
	);
}

export function ThemeSheet({onClose}: {onClose: () => void}) {
	const ids = themeIds();

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	return (
		<div className="sheet-scrim" onClick={onClose}>
			<div
				className="sheet"
				role="dialog"
				aria-label="Theme"
				onClick={event => event.stopPropagation()}
			>
				<div className="sheet-head">
					<span>Theme</span>
					<button
						className="rail-button"
						style={{width: 44, height: 44}}
						title="Close"
						onClick={onClose}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="square"
							aria-hidden="true"
							style={{width: 20, height: 20}}
						>
							<path d="M6 6l12 12M18 6L6 18" />
						</svg>
					</button>
				</div>
				<div className="sheet-body">
					<div className="theme-grid">
						{ids.map((id, index) => (
							<ThemeCard key={id} id={id} index={index + 1} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
