// Map a stored tag color (hex from the TUI palette) to the active theme's hue.
// The TUI uses six fixed hues; the theme has the same six under --o-red .. --o-magenta.
// We match by comparing hue angles and pick the nearest theme hue.

import {themeVar} from './gui-theme.js';

export const HUES = [
	'red',
	'orange',
	'yellow',
	'green',
	'cyan',
	'blue',
	'magenta',
] as const;
export type HueKey = (typeof HUES)[number];

/** Theme hue angles in degrees — matches the TUI palette ordering. */
const THEME_HUE_ANGLES: Record<HueKey, number> = {
	red: 0,
	orange: 30,
	yellow: 50,
	green: 130,
	cyan: 180,
	blue: 220,
	magenta: 280,
};

function hexToHue(hex: string): number {
	const h = hex.replace('#', '');
	const r = Number.parseInt(h.slice(0, 2), 16) / 255;
	const g = Number.parseInt(h.slice(2, 4), 16) / 255;
	const b = Number.parseInt(h.slice(4, 6), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const d = max - min;
	if (d === 0) return 0;
	let hAngle: number;
	if (max === r) hAngle = ((g - b) / d + 6) % 6;
	else if (max === g) hAngle = (b - r) / d + 2;
	else hAngle = (r - g) / d + 4;
	return hAngle * 60;
}

/**
 * Given a TUI color name (e.g. 'red'), return the corresponding theme hue key.
 * Returns null if the name is not recognized.
 */
export function resolveTagColorHue(tuiColorName: string): HueKey | null {
	const mapping: Record<string, HueKey> = {
		red: 'red',
		orange: 'orange',
		yellow: 'yellow',
		green: 'green',
		cyan: 'cyan',
		blue: 'blue',
		magenta: 'magenta',
	};
	return mapping[tuiColorName] ?? null;
}

/**
 * Given a stored tag color (hex from the TUI palette), return the
 * theme's corresponding --o-* color key. Falls back to the stored color
 * if no theme hue is close enough.
 */
export function tagColorToThemeHue(tagColor: string): HueKey | null {
	const tagHue = hexToHue(tagColor);

	let best: HueKey | null = null;
	let bestDist = 999;

	for (const hue of HUES) {
		const themeHue = THEME_HUE_ANGLES[hue];
		// Account for circular distance on the hue wheel
		const rawDist = Math.abs(tagHue - themeHue);
		const dist = Math.min(rawDist, 360 - rawDist);
		if (dist < bestDist) {
			bestDist = dist;
			best = hue;
		}
	}

	return bestDist < 60 ? best : null;
}

// ─── A chip's colour: the name decides, the theme paints ──────────
//
// Above maps a *stored* colour to the nearest theme hue, which is a guess: a
// name-hashed hex sits at an arbitrary angle, and one more than 60 degrees from
// every accent was drawn in a colour the theme had never heard of and would
// not repaint on a theme switch. A chip is drawn from the name instead — one of
// the palette's own eight accents, always, read from the theme so every bundled
// theme paints it and a switch repaints the fill as well as the name.

/** The eight accents a tag may wear, in the order the palette declares them. */
export const TAG_ACCENTS = [
	'accent',
	'cyan',
	'magenta',
	'green',
	'yellow',
	'orange',
	'red',
	'blue',
] as const;

export type TagAccent = (typeof TAG_ACCENTS)[number];

/**
 * djb2 over the name, so a tag's colour follows its name and nothing else: the
 * same tag is the same colour on every board, in every session, on both
 * machines, without anything being stored for it.
 */
export function tagAccent(name: string): TagAccent {
	let hash = 5381;

	for (let at = 0; at < name.length; at += 1) {
		hash = (hash * 33 + name.charCodeAt(at)) >>> 0;
	}

	return TAG_ACCENTS[hash % TAG_ACCENTS.length] ?? 'accent';
}

// Tokyo Night's own values, for a render that lands before the theme is applied.
const ACCENT_FALLBACK: Record<TagAccent, string> = {
	accent: '#7aa2f7',
	cyan: '#449dab',
	magenta: '#ad8ee6',
	green: '#9ece6a',
	yellow: '#e0af68',
	orange: '#eb927b',
	red: '#f7768e',
	blue: '#7aa2f7',
};

export type TagChipColor = {
	accent: TagAccent;
	// The theme's own hex for that accent. `Button` builds a chip's fill and
	// border by appending an alpha to it, which a `var()` reference cannot take.
	tint: string;
	// The name's colour: the accent lifted toward the bright foreground, so the
	// word is read and the wash behind it is not.
	text: string;
};

/** The two colours a tag chip is drawn in, from the tag's name. */
export function tagChipColor(name: string): TagChipColor {
	const accent = tagAccent(name);

	return {
		accent,
		tint: themeVar(`--o-${accent}`, ACCENT_FALLBACK[accent]),
		text: `color-mix(in oklab, var(--o-${accent}) 62%, var(--o-fg-bright))`,
	};
}
