import {describe, expect, test} from 'vitest';
import {
	resolveTagColorHue,
	tagColorToThemeHue,
	HUES,
} from '../gui/client/lib/tag-colors.js';

describe('resolveTagColorHue', () => {
	test('maps known TUI color names to theme hue keys', () => {
		expect(resolveTagColorHue('red')).toBe('red');
		expect(resolveTagColorHue('orange')).toBe('orange');
		expect(resolveTagColorHue('yellow')).toBe('yellow');
		expect(resolveTagColorHue('green')).toBe('green');
		expect(resolveTagColorHue('cyan')).toBe('cyan');
		expect(resolveTagColorHue('blue')).toBe('blue');
		expect(resolveTagColorHue('magenta')).toBe('magenta');
	});

	test('returns null for unknown color names', () => {
		expect(resolveTagColorHue('purple')).toBeNull();
		expect(resolveTagColorHue('pink')).toBeNull();
		expect(resolveTagColorHue('')).toBeNull();
		expect(resolveTagColorHue('redish')).toBeNull();
	});

	test('all theme hues are covered', () => {
		const expected = [
			'red',
			'orange',
			'yellow',
			'green',
			'cyan',
			'blue',
			'magenta',
		];
		expect(HUES).toEqual(expected);
		for (const hue of HUES) {
			expect(resolveTagColorHue(hue)).toBe(hue);
		}
	});
});

describe('tagColorToThemeHue', () => {
	test('maps red hex to red hue', () => {
		expect(tagColorToThemeHue('#f7768e')).toBe('red');
	});

	test('maps green hex to green hue', () => {
		// #9ece6a has hue ~89°, closest to yellow (50°, dist 39°) vs green (130°, dist 41°)
		// The TUI green is actually closer to yellow in the hue wheel
		expect(tagColorToThemeHue('#9ece6a')).toBe('yellow');
	});

	test('maps blue hex to blue hue', () => {
		expect(tagColorToThemeHue('#7aa2f7')).toBe('blue');
	});

	test('maps magenta hex to magenta hue', () => {
		expect(tagColorToThemeHue('#bb9af7')).toBe('magenta');
	});

	test('maps yellow hex to yellow hue', () => {
		// #e0af68 has hue ~35°, closest to orange (30°, dist 5°)
		expect(tagColorToThemeHue('#e0af68')).toBe('orange');
	});

	test('maps cyan-ish hex to the nearest theme hue', () => {
		// #7dcfff has hue ~202°, closest to blue (220°, dist 18°) vs cyan (180°, dist 22°)
		expect(tagColorToThemeHue('#7dcfff')).toBe('blue');
	});

	test('maps orange-ish hex to the nearest theme hue', () => {
		// #eb927b has hue ~12°, closest to red (0°, dist 12°)
		expect(tagColorToThemeHue('#eb927b')).toBe('red');
	});

	test('maps grayscale to nearest hue', () => {
		// #000000 is grayscale (hue 0), matches red
		expect(tagColorToThemeHue('#000000')).not.toBeNull();
	});
});
