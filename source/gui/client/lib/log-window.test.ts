import {describe, expect, it} from 'vitest';
import {parseLogLinesMessage, parseLogWindowMessage} from './log-window';

describe('parseLogWindowMessage', () => {
	it('reads the four things a window can say', () => {
		expect(parseLogWindowMessage({type: 'ome-log:ready'})).toEqual({
			type: 'ome-log:ready',
		});
		expect(parseLogWindowMessage({type: 'ome-log:closed'})).toEqual({
			type: 'ome-log:closed',
		});
		expect(
			parseLogWindowMessage({
				type: 'ome-log:open',
				destination: {kind: 'commit', sha: 'abc'},
			}),
		).toEqual({
			type: 'ome-log:open',
			destination: {kind: 'commit', sha: 'abc'},
			replace: false,
		});
		expect(
			parseLogWindowMessage({
				type: 'ome-log:open',
				destination: {kind: 'ticket', issueId: 'i1', tab: 'comments'},
			}),
		).toEqual({
			type: 'ome-log:open',
			destination: {kind: 'ticket', issueId: 'i1', tab: 'comments'},
			replace: false,
		});
	});

	// The channel is shared with every other script that posts to the window,
	// so anything not shaped exactly as one of ours is nothing.
	it('is null for anything else on the channel', () => {
		expect(parseLogWindowMessage(null)).toBeNull();
		expect(parseLogWindowMessage('ome-log:ready')).toBeNull();
		expect(parseLogWindowMessage({type: 'ome-log:lines'})).toBeNull();
		expect(parseLogWindowMessage({type: 'ome-log:open'})).toBeNull();
		expect(
			parseLogWindowMessage({
				type: 'ome-log:open',
				destination: {kind: 'ticket', issueId: 'i1', tab: 'code'},
			}),
		).toBeNull();
		expect(
			parseLogWindowMessage({
				type: 'ome-log:open',
				destination: {kind: 'commit'},
			}),
		).toBeNull();
	});
});

// WKK7PS0: a comment line clicked in the popped-out window has to reach the
// board with the comment still on it, or the pop-out opens the tab alone.
describe('a destination crossing the window boundary', () => {
	it('keeps the comment a ticket destination points at', () => {
		expect(
			parseLogWindowMessage({
				type: 'ome-log:open',
				destination: {
					kind: 'ticket',
					issueId: 'i1',
					tab: 'comments',
					comment: 'c1',
				},
			}),
		).toMatchObject({destination: {comment: 'c1'}});
	});

	it('refuses a comment that is not a string', () => {
		expect(
			parseLogWindowMessage({
				type: 'ome-log:open',
				destination: {
					kind: 'ticket',
					issueId: 'i1',
					tab: 'comments',
					comment: 7,
				},
			}),
		).toBeNull();
	});
});

describe('parseLogLinesMessage', () => {
	it('reads a slice, moment included', () => {
		expect(
			parseLogLinesMessage({
				type: 'ome-log:lines',
				entries: [],
				moment: Infinity,
			}),
		).toEqual({
			type: 'ome-log:lines',
			entries: [],
			moment: Infinity,
			// Absent from an older board, which followed nothing.
			followedLine: null,
			// Likewise: an older board sent every event it had.
			eventsUnlisted: false,
		});
	});

	// 8CYH2TC: the window says the board series was withheld, so the popped-out
	// panel can say so too rather than draw a stretch of commits alone.
	it('carries word of a window too crowded to list', () => {
		expect(
			parseLogLinesMessage({
				type: 'ome-log:lines',
				entries: [],
				moment: Infinity,
				eventsUnlisted: true,
			})?.eventsUnlisted,
		).toBe(true);
	});

	it('carries the line the board is standing on', () => {
		expect(
			parseLogLinesMessage({
				type: 'ome-log:lines',
				entries: [],
				moment: 1,
				followedLine: 'event-7',
			}),
		).toMatchObject({followedLine: 'event-7'});
	});

	it('is null for anything else', () => {
		expect(parseLogLinesMessage({type: 'ome-log:lines'})).toBeNull();
		expect(
			parseLogLinesMessage({type: 'ome-log:lines', entries: [], moment: '1'}),
		).toBeNull();
		expect(parseLogLinesMessage({type: 'ome-log:ready'})).toBeNull();
	});
});
