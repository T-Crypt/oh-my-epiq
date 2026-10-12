// Map a stored tag color (hex from the TUI palette) to the active theme's hue.
// The TUI uses six fixed hues; the theme has the same six under --o-red .. --o-magenta.
// We match by comparing hue angles and pick the nearest theme hue.

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
