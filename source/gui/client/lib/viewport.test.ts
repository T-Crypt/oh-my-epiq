import {describe, expect, it} from 'vitest';
import {resolveViewportFix, ViewportReading} from './viewport';

// An installed web app on iOS 26: a 956pt screen, a top bar and a bottom toolbar drawn over it, 49pt of the bottom
// covered and no inset reported for it. The home-indicator inset is still 34.
const installedWebApp: ViewportReading = {
	layoutHeight: 956,
	visibleHeight: 907,
	safeBottom: 34,
	typing: false,
};

describe('resolveViewportFix', () => {
	it('leaves the stylesheet alone when the layout viewport is the visible one', () => {
		expect(
			resolveViewportFix({...installedWebApp, visibleHeight: 956}),
		).toBeNull();
	});

	it('leaves the stylesheet alone for a sub-pixel difference', () => {
		expect(
			resolveViewportFix({...installedWebApp, visibleHeight: 955.5}),
		).toBeNull();
	});

	it('sizes the shell to the visible viewport and drops the covered part of the inset', () => {
		expect(resolveViewportFix(installedWebApp)).toEqual({
			appHeight: 907,
			padBottom: 0,
		});
	});

	it('keeps the part of the inset the chrome does not cover', () => {
		expect(
			resolveViewportFix({
				layoutHeight: 956,
				visibleHeight: 936,
				safeBottom: 34,
				typing: false,
			}),
		).toEqual({appHeight: 936, padBottom: 14});
	});

	it('reads the keyboard as the keyboard, not as chrome', () => {
		expect(
			resolveViewportFix({...installedWebApp, visibleHeight: 560}),
		).toBeNull();
	});

	it('leaves a focused field alone even when the covered strip is small', () => {
		expect(resolveViewportFix({...installedWebApp, typing: true})).toBeNull();
	});

	it('leaves an unmeasurable viewport alone', () => {
		expect(
			resolveViewportFix({...installedWebApp, layoutHeight: 0}),
		).toBeNull();
		expect(
			resolveViewportFix({...installedWebApp, visibleHeight: Number.NaN}),
		).toBeNull();
	});
});
