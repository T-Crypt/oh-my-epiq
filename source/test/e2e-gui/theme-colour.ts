import {GUI_THEME} from '../../gui/client/lib/gui-theme.js';

// A theme colour as `getComputedStyle` reports it, so a test asserts what the
// theme says rather than a copy of it. The palette has moved twice (Epiq, then
// OMP, then Oh-My-Pocket), and each time every pinned rgb() went stale while
// the behaviour they guarded was fine.
export const rgbOf = (hex: string): string => {
	const value = hex.replace('#', '');
	const [r, g, b] = [0, 2, 4].map(at =>
		Number.parseInt(value.slice(at, at + 2), 16),
	);

	return `rgb(${r}, ${g}, ${b})`;
};

export const themeRgb = (name: keyof typeof GUI_THEME): string =>
	rgbOf(GUI_THEME[name]);
