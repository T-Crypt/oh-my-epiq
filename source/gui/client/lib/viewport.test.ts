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

// The installed web app: the only place platform chrome sits over the page without an inset describing it.
const installed = {standalone: true};

describe('resolveViewportFix', () => {
	it('leaves the stylesheet alone when the layout viewport is the visible one', () => {
		expect(
			resolveViewportFix({...installedWebApp, visibleHeight: 956}, installed),
		).toBeNull();
	});

	it('leaves the stylesheet alone for a sub-pixel difference', () => {
		expect(
			resolveViewportFix({...installedWebApp, visibleHeight: 955.5}, installed),
		).toBeNull();
	});

	it('sizes the shell to the visible viewport and drops the covered part of the inset', () => {
		expect(resolveViewportFix(installedWebApp, installed)).toEqual({
			appHeight: 907,
			padBottom: 0,
		});
	});

	it('keeps the part of the inset the chrome does not cover', () => {
		expect(
			resolveViewportFix(
				{
					layoutHeight: 956,
					visibleHeight: 936,
					safeBottom: 34,
					typing: false,
				},
				installed,
			),
		).toEqual({appHeight: 936, padBottom: 14});
	});

	it('reads the keyboard as the keyboard, not as chrome', () => {
		expect(
			resolveViewportFix({...installedWebApp, visibleHeight: 560}, installed),
		).toBeNull();
	});

	it('leaves a focused field alone even when the covered strip is small', () => {
		expect(
			resolveViewportFix({...installedWebApp, typing: true}, installed),
		).toBeNull();
	});

	it('leaves an unmeasurable viewport alone', () => {
		expect(
			resolveViewportFix({...installedWebApp, layoutHeight: 0}, installed),
		).toBeNull();
		expect(
			resolveViewportFix(
				{...installedWebApp, visibleHeight: Number.NaN},
				installed,
			),
		).toBeNull();
	});

	it('leaves a browser tab alone even when a strip is covered', () => {
		// Mobile Safari with its toolbar mid-flight, or a pinch zoom left in place: transient, and a shell shrunk
		// to it floats the tab bar above a gap. The stylesheet (`100dvh` follows the browser toolbar) stays in
		// charge here.
		expect(resolveViewportFix(installedWebApp)).toBeNull();
		expect(resolveViewportFix(installedWebApp, {standalone: false})).toBeNull();
	});

	it('leaves a regular-iPhone browser tab alone too', () => {
		// 393x852pt with the same 34pt home inset: no device-specific path, same null.
		expect(
			resolveViewportFix({
				layoutHeight: 852,
				visibleHeight: 803,
				safeBottom: 34,
				typing: false,
			}),
		).toBeNull();
	});
});
