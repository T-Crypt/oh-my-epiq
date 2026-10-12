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

// The chrome's own face. Set once on the tree the app draws into, and again by
// anything drawn outside it: a window of its own, the screen shown before there
// is a board, and any popover portalled to the body, which inherits from there
// rather than from the control it belongs to.

import {resolvePalette} from './theme.js';

const palette = resolvePalette();

// Oh-My-Pocket's palette — Tokyo Night, the theme it ships by default — so the
// board and the agent harness read as one family on the same phone. Surfaces
// are the foreground laid over the ground at a few percent, the way Pocket
// mixes them (ome.css carries the same values as variables); hex rather than
// variables here because canvases and `${colour}33` alphas read these too.

const c = palette.colors;
const bg = c['background'] ?? '#1a1b26';
const fg = c['foreground'] ?? '#a9b1d6';

const hex = (key: string, fallback: string): string => c[key] ?? fallback;

export const GUI_THEME = {
	bg: bg,
	// The instrumentation around the work: the top bar, the timeline and the
	// event log. Below the board's own ground rather than above it, so the
	// chrome reads as the room and the board as what is lit in it.
	chrome: hex('dark_background', '#13141c'),
	bgHighlight: hex('lighter_background', '#24283b') + '65',
	panel: hex('dark_background', '#20212d'),
	panel2: hex('darker_background', '#252734'),
	line: `rgba(${hexToRgb(fg)}, 0.13)`,
	// The detail panel's own outer edge. `line` divides sections inside one
	// surface; this one has to hold the panel apart from the board behind it.
	// Kept above 0.4 (panel-edge.pw.ts): at the section rule's strength the
	// panel was hard to pick out against the board.
	edge: `rgba(${hexToRgb(fg)}, 0.45)`,
	// The same edge over the chrome's darker ground, where a translucent line
	// lands on more contrast and reads brighter at the same value.
	edgeOnChrome: `rgba(${hexToRgb(fg)}, 0.16)`,
	primary: hex('bright_foreground', '#c0caf5'),
	// One step under `primary`, for text that repeats all the way down a column
	// — a card's title — so thirty of them do not outshout the selected card.
	primarySoft: hex('foreground', '#a9b1d6'),
	secondary: hex('dark_foreground', '#9aa5ce'),
	tertiary: hex('lighter_background', '#24283b'),
	// The chrome's quiet text — labels, unselected scope buttons, placeholders,
	// the connection line.
	dim: hex('dark_foreground', '#565f89'),
	dim2: hex('muted', '#737aa2'),
	// What anything the pointer is over takes on: a lift off whatever it sits
	// on rather than a colour of its own.
	hover: `rgba(${hexToRgb(fg)}, 0.08)`,
	raised: `rgba(${hexToRgb(fg)}, 0.11)`,
	raisedHover: `rgba(${hexToRgb(fg)}, 0.16)`,
	// Pocket's accent, Tokyo Night blue. Selection, links, the selected card and
	// the follower all take it.
	accent: hex('accent', '#7aa2f7'),
	accentWash: `rgba(${hexToRgb(hex('accent', '#7aa2f7'))}, 0.13)`,
	green: hex('green', '#9ece6a'),
	amber: hex('yellow', '#e0af68'),
	red: hex('red', '#f7768e'),
	transparent: 'rgba(0, 0, 0, 0)',
} as const;

// The Board series split by what kind of change each event was. Tickets keeps
// the accent; the rest are the palette's yellow, magenta and cyan. Green is
// avoided — that is the commit series.
export const EVENT_CATEGORY_COLORS = {
	tickets: GUI_THEME.accent,
	comments: hex('yellow', '#e0af68'),
	tagging: hex('magenta', '#bb9af7'),
	assigning: hex('cyan', '#7dcfff'),
} as const;

// The Contributors series, which is not a kind of event but a way of splitting
// every kind, so a hue of its own.
export const BOARD_CONTRIBUTOR_COLOR = hex('cyan', '#73daca');

// The mark's gradient, cyan → blue → magenta, as the favicon draws it. Worn by
// anything that names OME in a heading.
export const OME_GRADIENT =
	`linear-gradient(100deg, ${hex('cyan', '#7dcfff')} 0%, ${hex('accent', '#7aa2f7')} 52%, ${hex('magenta', '#bb9af7')} 100%)`;

// The style a span takes to wear `OME_GRADIENT`. `background-clip: text` shows
// the gradient through the glyphs only while the text colour is transparent,
// and the `-webkit-` spelling is the one that shipped everywhere.
export const OME_MARK_STYLE = {
	background: OME_GRADIENT,
	WebkitBackgroundClip: 'text',
	backgroundClip: 'text',
	color: 'transparent',
} as const;

export const getContrastTextColor = (backgroundColor: string): string => {
	const hexStr = backgroundColor.replace('#', '');

	const r = Number.parseInt(hexStr.slice(0, 2), 16);
	const g = Number.parseInt(hexStr.slice(2, 4), 16);
	const b = Number.parseInt(hexStr.slice(4, 6), 16);

	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	return luminance > 0.6 ? '#111111' : '#ffffff';
};

function hexToRgb(hex: string): string {
	const h = hex.replace('#', '');
	const r = Number.parseInt(h.slice(0, 2), 16);
	const g = Number.parseInt(h.slice(2, 4), 16);
	const b = Number.parseInt(h.slice(4, 6), 16);
	return `${r}, ${g}, ${b}`;
}
