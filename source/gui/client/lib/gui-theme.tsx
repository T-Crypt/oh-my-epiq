// One face for everything, as Oh-My-Pocket draws it: JetBrains Mono for the
// chrome and the prose alike. Bundled (dist/gui/JetBrainsMono.woff2), so a
// phone without it installed reads the same board. Two names still, because
// they are set in different places — see UI_FONT.
export const CONTENT_FONT =
	'"JetBrains Mono", "JetBrainsMono Nerd Font", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

// The chrome's own face. Set once on the tree the app draws into, and again by
// anything drawn outside it: a window of its own, the screen shown before there
// is a board, and any popover portalled to the body, which inherits from there
// rather than from the control it belongs to.
export const UI_FONT = CONTENT_FONT;

// The side panel's text sizes. Prose (descriptions, comments, notes) sits a
// step above the mono UI text so the two fonts read at the same visual size.
export const TEXT = {
	label: 10,
	meta: 11,
	ui: 12,
	prose: 13,
	title: 18,
} as const;

// ─── Theme-driven palette ─────────────────────────────────────────

// This file is imported by the root tsconfig (via e2e-gui/theme-colour.ts),
// which does not include DOM types. Declare only the document surface we use.
declare const document:
	| {
			documentElement: {
				dataset: Record<string, string | undefined>;
			};
			defaultView: {
				getComputedStyle(element: unknown): {
					getPropertyValue(name: string): string;
				};
			};
	  }
	| undefined;

function hexToRgb(hex: string): string {
	const h = hex.replace('#', '');
	const r = Number.parseInt(h.slice(0, 2), 16);
	const g = Number.parseInt(h.slice(2, 4), 16);
	const b = Number.parseInt(h.slice(4, 6), 16);
	return `${r}, ${g}, ${b}`;
}

/** Read a CSS custom property from :root, with a Tokyo Night fallback. */
function readVar(name: string, fallback: string): string {
	if (typeof document === 'undefined') return fallback;
	const value = document.defaultView
		.getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
	return value || fallback;
}

function currentMode(): 'dark' | 'light' {
	if (typeof document === 'undefined') return 'dark';
	return document.documentElement.dataset['mode'] === 'light'
		? 'light'
		: 'dark';
}

/**
 * Live theme colours read from CSS custom properties on :root. Every property
 * is a getter, so React components that re-read these at render time pick up
 * a new theme without a page reload. SSR or a missing document falls back to
 * the Tokyo Night defaults.
 */
export const GUI_THEME = Object.freeze({
	get bg() {
		return readVar('--o-bg', '#1a1b26');
	},
	// The instrumentation around the work: the top bar, the timeline and the
	// event log. Below the board's own ground rather than above it, so the
	// chrome reads as the room and the board as what is lit in it.
	get chrome() {
		return readVar('--o-bg-dark', '#13141c');
	},
	get bgHighlight() {
		return readVar('--o-bg-light', '#24283b') + '65';
	},
	get panel() {
		return readVar('--o-bg-dark', '#20212d');
	},
	get panel2() {
		return readVar('--o-bg-darker', '#252734');
	},
	get line() {
		return `rgba(${hexToRgb(readVar('--o-fg', '#a9b1d6'))}, 0.13)`;
	},
	// The detail panel's own outer edge. `line` divides sections inside one
	// surface; this one has to hold the panel apart from the board behind it.
	// Kept above 0.4 (panel-edge.pw.ts): at the section rule's strength the
	// panel was hard to pick out against the board.
	get edge() {
		return `rgba(${hexToRgb(readVar('--o-fg', '#a9b1d6'))}, 0.45)`;
	},
	// The same edge over the chrome's darker ground, where a translucent line
	// lands on more contrast and reads brighter at the same value.
	get edgeOnChrome() {
		return `rgba(${hexToRgb(readVar('--o-fg', '#a9b1d6'))}, 0.16)`;
	},
	get primary() {
		return readVar('--o-fg-bright', '#c0caf5');
	},
	// One step under `primary`, for text that repeats all the way down a column
	// — a card's title — so thirty of them do not outshout the selected card.
	get primarySoft() {
		return readVar('--o-fg', '#a9b1d6');
	},
	get secondary() {
		return readVar('--o-fg-dim', '#9aa5ce');
	},
	get tertiary() {
		return readVar('--o-bg-light', '#24283b');
	},
	// The chrome's quiet text — labels, unselected scope buttons, placeholders,
	// the connection line.
	get dim() {
		return readVar('--o-fg-dim', '#565f89');
	},
	get dim2() {
		return readVar('--o-muted', '#737aa2');
	},
	// What anything the pointer is over takes on: a lift off whatever it sits
	// on rather than a colour of its own.
	get hover() {
		return `rgba(${hexToRgb(readVar('--o-fg', '#a9b1d6'))}, 0.08)`;
	},
	get raised() {
		return `rgba(${hexToRgb(readVar('--o-fg', '#a9b1d6'))}, 0.11)`;
	},
	get raisedHover() {
		return `rgba(${hexToRgb(readVar('--o-fg', '#a9b1d6'))}, 0.16)`;
	},
	// Pocket's accent, Tokyo Night blue. Selection, links, the selected card and
	// the follower all take it.
	get accent() {
		return readVar('--o-accent', '#7aa2f7');
	},
	get accentWash() {
		return `rgba(${hexToRgb(readVar('--o-accent', '#7aa2f7'))}, 0.13)`;
	},
	get green() {
		return readVar('--o-green', '#9ece6a');
	},
	get amber() {
		return readVar('--o-yellow', '#e0af68');
	},
	get red() {
		return readVar('--o-red', '#f7768e');
	},
	get transparent() {
		return 'rgba(0, 0, 0, 0)';
	},
	// Semantic aliases over the same custom properties theme.ts emits.
	// Every getter falls back to its pre-alias value, so surfaces drawn
	// before the aliases existed read unchanged.
	get background() {
		return readVar('--color-background', '#1a1b26');
	},
	get surface() {
		return readVar('--surface', '#13141c');
	},
	get surfaceRaised() {
		return readVar('--surface-raised', '#24283b');
	},
	get border() {
		return readVar('--border', 'rgba(169, 177, 214, 0.13)');
	},
	get textPrimary() {
		return readVar('--text-primary', '#c0caf5');
	},
	get textSecondary() {
		return readVar('--text-secondary', '#a9b1d6');
	},
	get textMuted() {
		return readVar('--text-muted', '#8288a6');
	},
	get textDisabled() {
		return readVar('--text-disabled', '#646881');
	},
	get focus() {
		return readVar('--focus', '#7aa2f7');
	},
	get success() {
		return readVar('--success', '#9ece6a');
	},
	get warning() {
		return readVar('--warning', '#e0af68');
	},
	get danger() {
		return readVar('--danger', '#f7768e');
	},
	// Theme-driven overlay: a scrim that adapts to light and dark palettes.
	get scrim() {
		const bgDark = readVar('--o-bg-darker', '#0e0e14');
		const opacity = currentMode() === 'light' ? 0.55 : 0.62;
		return `color-mix(in srgb, ${bgDark} ${opacity * 100}%, transparent)`;
	},
	// Theme-driven box-shadow colour (the alpha is per-component).
	get shadow() {
		const bgDark = readVar('--o-bg-darker', '#0e0e14');
		return `rgba(${hexToRgb(bgDark)}, ${
			currentMode() === 'light' ? 0.35 : 0.45
		})`;
	},
});

// The Board series split by what kind of change each event was. Tickets keeps
// the accent; the rest are the palette's yellow, magenta and cyan. Green is
// avoided — that is the commit series.
export const EVENT_CATEGORY_COLORS = Object.freeze({
	get tickets() {
		return GUI_THEME.accent;
	},
	get comments() {
		return GUI_THEME.amber;
	},
	get tagging() {
		return readVar('--o-magenta', '#bb9af7');
	},
	get assigning() {
		return readVar('--o-cyan', '#7dcfff');
	},
});

// The Contributors series, which is not a kind of event but a way of splitting
// every kind, so a hue of its own.
export const BOARD_CONTRIBUTOR_COLOR = Object.freeze({
	get value() {
		return readVar('--o-cyan', '#73daca');
	},
}).value;

// The mark's gradient, cyan → blue → magenta, as the favicon draws it. Worn by
// anything that names OME in a heading.
export const OME_GRADIENT = Object.freeze({
	get value() {
		return `linear-gradient(100deg, ${readVar(
			'--o-cyan',
			'#7dcfff',
		)} 0%, ${readVar('--o-accent', '#7aa2f7')} 52%, ${readVar(
			'--o-magenta',
			'#bb9af7',
		)} 100%)`;
	},
}).value;

// The style a span takes to wear `OME_GRADIENT`. `background-clip: text` shows
// the gradient through the glyphs only while the text colour is transparent,
// and the `-webkit-` spelling is the one that shipped everywhere.
export const OME_MARK_STYLE = Object.freeze({
	get background() {
		return OME_GRADIENT;
	},
	WebkitBackgroundClip: 'text',
	backgroundClip: 'text',
	color: 'transparent',
});

export const getContrastTextColor = (backgroundColor: string): string => {
	const hexStr = backgroundColor.replace('#', '');

	const r = Number.parseInt(hexStr.slice(0, 2), 16);
	const g = Number.parseInt(hexStr.slice(2, 4), 16);
	const b = Number.parseInt(hexStr.slice(4, 6), 16);

	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	return luminance > 0.6 ? '#111111' : '#ffffff';
};
