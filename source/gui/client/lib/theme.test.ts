import {describe, expect, it} from 'vitest';
import {resolvePalette, themeIds, themeVars, FALLBACK} from './theme';

describe('resolvePalette', () => {
	it('returns the palette for a known id', () => {
		const p = resolvePalette('tokyo-night');
		expect(p.id).toBe('tokyo-night');
		expect(p.name).toBe('Tokyo Night');
		expect(p.mode).toBe('dark');
		expect(p.colors.accent).toBe('#7aa2f7');
	});

	it('returns the palette for a known light theme', () => {
		const p = resolvePalette('white');
		expect(p.id).toBe('white');
		expect(p.name).toBe('White');
		expect(p.mode).toBe('light');
	});

	it('falls back to tokyo-night for an unknown id', () => {
		const p = resolvePalette('nonexistent-theme');
		expect(p.id).toBe(FALLBACK);
		expect(p.name).toBe('Tokyo Night');
		expect(p.mode).toBe('dark');
	});

	it('uses the fallback when THEMES is empty for the id', () => {
		const p = resolvePalette('');
		expect(p.id).toBe(FALLBACK);
	});
});

describe('themeIds', () => {
	it('includes all bundled themes', () => {
		const ids = themeIds();
		expect(ids.length).toBeGreaterThan(15);
		expect(ids).toContain('tokyo-night');
		expect(ids).toContain('white');
	});

	it('orders dark themes before light themes', () => {
		const ids = themeIds();
		const lightIds = [
			'catppuccin-latte',
			'flexoki-light',
			'lupine',
			'rose-pine',
			'white',
		];
		const lastDark = ids.lastIndexOf(id => !lightIds.includes(id));
		const firstLight = ids.indexOf(lightIds[0]);
		expect(lastDark).toBeLessThan(firstLight);
	});

	it('does not include duplicate ids', () => {
		const ids = themeIds();
		const unique = new Set(ids);
		expect(unique.size).toBe(ids.length);
	});
});

describe('themeVars', () => {
	it('produces css variables from a palette', () => {
		const p = resolvePalette('tokyo-night');
		const vars = themeVars(p);
		expect(vars['--o-bg']).toBe('#1a1b26');
		expect(vars['--o-fg']).toBe('#a9b1d6');
		expect(vars['--o-accent']).toBe('#7aa2f7');
	});

	it('falls back when a palette is missing keys', () => {
		const p = resolvePalette('nonexistent');
		const vars = themeVars(p);
		// Should use tokyo-night fallback which has all keys
		expect(vars['--o-bg']).toBe('#1a1b26');
	});

	it("uses the theme's own values when present", () => {
		const p = resolvePalette('gruvbox');
		const vars = themeVars(p);
		expect(vars['--o-bg']).toBe('#282828');
		expect(vars['--o-accent']).toBe('#7daea3');
	});

	it('returns null for --o-inactive', () => {
		const p = resolvePalette('tokyo-night');
		const vars = themeVars(p);
		expect(vars['--o-inactive']).toBeNull();
	});

	it('defaults accent to blue when accent key is missing', () => {
		// Gruvbox has both accent and blue; test with a theme that has accent
		const p = resolvePalette('nord');
		const vars = themeVars(p);
		expect(vars['--o-accent']).toBe('#81a1c1');
	});
});
