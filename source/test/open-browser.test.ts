import {EventEmitter} from 'node:events';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const child = Object.assign(new EventEmitter(), {unref: vi.fn()});

vi.mock('node:child_process', () => ({spawn: vi.fn(() => child)}));

import {spawn} from 'node:child_process';
import {canOpenBrowser, openBrowser} from '../gui/open-browser.js';

const logged = vi.fn();
vi.stubGlobal('logger', {info: logged, debug: vi.fn(), error: vi.fn()});

beforeEach(() => {
	child.removeAllListeners();
	logged.mockClear();
	vi.mocked(spawn).mockClear();
});

describe('openBrowser', () => {
	// A slim container has no xdg-open: spawn reports ENOENT as an 'error'
	// event, which with no listener is thrown and ends the process.
	it('survives a missing opener', () => {
		openBrowser('http://127.0.0.1:3710');

		expect(spawn).toHaveBeenCalledOnce();
		expect(() =>
			child.emit('error', new Error('spawn xdg-open ENOENT')),
		).not.toThrow();
		expect(logged).toHaveBeenCalledWith(expect.stringContaining('ENOENT'));
	});
});

describe('canOpenBrowser', () => {
	it('opens on macOS and Windows', () => {
		expect(canOpenBrowser('darwin', {}, true)).toBe(true);
		expect(canOpenBrowser('win32', {}, true)).toBe(true);
	});

	it('opens on Linux only with a display', () => {
		expect(canOpenBrowser('linux', {}, true)).toBe(false);
		expect(canOpenBrowser('linux', {DISPLAY: ':0'}, true)).toBe(true);
		expect(canOpenBrowser('linux', {WAYLAND_DISPLAY: 'wayland-0'}, true)).toBe(
			true,
		);
	});

	it('opens without a display when $BROWSER names one, as on WSL', () => {
		expect(canOpenBrowser('linux', {BROWSER: 'wslview'}, true)).toBe(true);
	});

	// A script's pipe and an agent's spawn are not a person at a terminal, and
	// the window they must not open is the operator's own browser.
	it('refuses when the caller is not interactive', () => {
		expect(canOpenBrowser('linux', {DISPLAY: ':0'}, false)).toBe(false);
		expect(canOpenBrowser('darwin', {}, false)).toBe(false);
	});

	// A pty hands the launcher a tty, so this is the switch that stops a harness
	// that would otherwise pass the interactivity test.
	it('refuses when $OME_GUI_NO_OPEN is set, however interactive', () => {
		expect(
			canOpenBrowser('linux', {DISPLAY: ':0', OME_GUI_NO_OPEN: '1'}, true),
		).toBe(false);
		expect(canOpenBrowser('darwin', {OME_GUI_NO_OPEN: '1'}, true)).toBe(false);
	});

	// A keybind launches with no terminal attached, and that is still a person
	// asking for the board.
	it('opens without a tty when $OME_GUI_OPEN is set', () => {
		expect(
			canOpenBrowser('linux', {DISPLAY: ':0', OME_GUI_OPEN: '1'}, false),
		).toBe(true);
	});

	it('lets $OME_GUI_NO_OPEN win over $OME_GUI_OPEN', () => {
		expect(
			canOpenBrowser(
				'linux',
				{DISPLAY: ':0', OME_GUI_OPEN: '1', OME_GUI_NO_OPEN: '1'},
				true,
			),
		).toBe(false);
	});
});
