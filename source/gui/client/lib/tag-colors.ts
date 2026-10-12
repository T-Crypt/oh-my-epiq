// Map a stored tag color (from the TUI palette) to the active theme's hue.
// The TUI uses six fixed hues; the theme has the same six under --o-red .. --o-magenta.
// We match by comparing hue angles and pick the nearest theme hue.

import {resolvePalette} from './theme';

const HUES = [
	'red',
	'orange',
	'yellow',
	'green',
	'cyan',
	'blue',
	'magenta',
] as const;
type HueKey = (typeof HUES)[number];

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

const THEME_HUE_ANGLES: Record<HueKey, number> = {
	red: 0,
	orange: 30,
	yellow: 50,
	green: 130,
	cyan: 180,
	blue: 220,
	magenta: 280,
};

/**
 * Given a stored tag color (hex from the TUI palette), return the
 * theme's corresponding --o-* color key. Falls back to the stored color
 * if no theme hue is close enough.
 */
export function tagColorToThemeHue(tagColor: string): HueKey | null {
	const theme = resolvePalette();
	const tc = theme.colors;
	const tagHue = hexToHue(tagColor);

	let best: HueKey | null = null;
	let bestDist = 999;

	for (const hue of HUES) {
		const themeKey = `--o-${hue}`;
		const cssVar = getComputedStyle(document.documentElement)
			.getPropertyValue(themeKey)
			.trim();
		if (!cssVar || !cssVar.startsWith('#')) continue;
		const themeHue = hexToHue(cssVar);
		const dist = Math.abs(tagHue - themeHue);
		if (dist < bestDist) {
			bestDist = dist;
			best = hue;
		}
	}

	return bestDist < 60 ? best : null;
}
