// UI chrome (labels, buttons, tags) stays monospace to match the rest of the
// app; prose content (description, title, comments) uses this for readability.
// Both lead with the Oh-My-Pi (OMP) faces so OMP and OME read as siblings;
// they fall back to the platform stack when Geist / JetBrains Mono are absent.
export const CONTENT_FONT =
	'"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// The chrome's own face. Set once on the tree the app draws into, and again by
// anything drawn outside it: a window of its own, the screen shown before there
// is a board, and any popover portalled to the body, which inherits from there
// rather than from the control it belongs to.
export const UI_FONT =
	'"JetBrains Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

// The side panel's text sizes. Prose (descriptions, comments, notes) sits a
// step above the mono UI text so the two fonts read at the same visual size.
export const TEXT = {
	label: 10,
	meta: 11,
	ui: 12,
	prose: 13,
	title: 18,
} as const;

// The OMP palette: a near-black ground, a magenta primary, a cyan secondary
// and a violet bridge. Hard white rules and a magenta selection hold it
// together. Keeping these values in one place is what lets OME sit beside OMP
// without looking like a different product.
export const GUI_THEME = {
	bg: '#070708',
	// The instrumentation around the work: the top bar, the timeline and the
	// event log. Below the board's own ground rather than above it, so the
	// chrome reads as the room and the board as what is lit in it.
	chrome: '#000000',
	bgHighlight: '#12121665',
	panel: '#0f0f12',
	panel2: '#151519',
	line: 'rgba(255, 255, 255, 0.08)',
	// The detail panel's own outer edge. `line` divides sections inside one
	// surface; this one has to hold the panel apart from the board behind it,
	// which takes considerably more contrast.
	edge: 'rgba(255, 255, 255, 0.14)',
	// The same edge over the chrome's ground rather than the panel's. That
	// ground is black, so a translucent line lands on more contrast there and
	// reads brighter at the same value — half the alpha is what makes the two
	// look like one edge drawn twice.
	edgeOnChrome: 'rgba(255, 255, 255, 0.07)',
	primary: '#f2f2f4',
	// One step under `primary`, for text that is the content of what it sits in
	// but repeats all the way down a column — a card's title. Thirty of those at
	// full `primary` is the brightest thing on the board, louder than the accent
	// marking the selected card, and it leaves the ref and the tags nothing to
	// stand against. Still well clear of a reading contrast: what comes off is
	// the shout, not the legibility.
	primarySoft: '#d5d5da',
	secondary: '#a0a0a8',
	tertiary: '#1a1a1f',
	// The chrome's quiet text — labels, unselected scope buttons, placeholders,
	// the connection line. OMP's own faint ink, lifted enough to read on black.
	dim: '#626368',
	dim2: '#7d7e85',
	// What anything the pointer is over takes on, throughout: buttons, rows,
	// menu items. A lift off whatever it sits on rather than a colour of its
	// own, so it reads the same on the panel as on the board.
	hover: 'rgba(255,255,255,0.04)',
	// What the confirming button in a row is filled with — `hover` a step
	// further up, and a wash rather than a colour for the same reason: it sits
	// on the panel, on a modal and inside the diff's own composer, whose ground
	// is the flat colour this used to be painted in.
	raised: 'rgba(255,255,255,0.06)',
	raisedHover: 'rgba(255,255,255,0.1)',
	// OMP's primary accent, magenta. Selection, links, the selected card and
	// the follower all take it.
	accent: '#f84fcc',
	// The accent laid over whatever is underneath, for the one thing a link or
	// a follow is pointing at: the log's followed line, the comment a log line
	// leads to. Faint on purpose — it says "this one", not "look here".
	accentWash: 'rgba(248, 79, 204, 0.12)',
	green: '#8ce99a',
	// One step short of `red`, at the same pastel weight, for anything that
	// warns before it alarms.
	amber: '#ffc078',
	red: '#ff8787',
	transparent: 'rgba(0, 0, 0, 0)',
};

// The Board series split by what kind of change each event was. Tickets keeps
// the magenta accent; the rest are the OMP family — amber, violet, cyan —
// spaced around the wheel at a matching lightness. Green is avoided throughout
// — that is the commit series.
export const EVENT_CATEGORY_COLORS = {
	tickets: GUI_THEME.accent,
	comments: '#ffd479',
	tagging: '#9362f4',
	assigning: '#00dbe4',
} as const;

// The Contributors series, which is not a kind of event but a way of splitting
// every kind. Its own hue rather than the Board accent: it plots what "Board
// events" plots, so sharing a colour would leave the two rows saying the same
// thing.
export const BOARD_CONTRIBUTOR_COLOR = '#7fd8c4';

// The mark's own gradient: the three stops the favicon draws, cyan → violet →
// magenta. Worn by anything that names OME in a heading — the header's `:ome`
// and the init screen's kicker — so the wordmark and the favicon are one mark,
// which is what the theme asks for.
export const OME_GRADIENT =
	'linear-gradient(100deg, #00dbe4 0%, #9362f4 52%, #f84fcc 100%)';

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
	const hex = backgroundColor.replace('#', '');

	const r = Number.parseInt(hex.slice(0, 2), 16);
	const g = Number.parseInt(hex.slice(2, 4), 16);
	const b = Number.parseInt(hex.slice(4, 6), 16);

	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	return luminance > 0.6 ? '#111111' : '#ffffff';
};
