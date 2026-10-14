import {describe, expect, it} from 'vitest';
import {stepBoardId} from './board-hotkeys';

const boards = [{id: 'a'}, {id: 'b'}, {id: 'c'}];

describe('stepBoardId', () => {
	it('steps forward and back within the list', () => {
		expect(stepBoardId(boards, 'a', 1)).toBe('b');
		expect(stepBoardId(boards, 'b', -1)).toBe('a');
		expect(stepBoardId(boards, 'a', 2)).toBe('c');
	});

	it('wraps at both ends', () => {
		expect(stepBoardId(boards, 'c', 1)).toBe('a');
		expect(stepBoardId(boards, 'a', -1)).toBe('c');
	});

	it('does nothing with a single board', () => {
		expect(stepBoardId([{id: 'only'}], 'only', 1)).toBeNull();
	});

	it('does nothing when there is no current board', () => {
		expect(stepBoardId(boards, null, 1)).toBeNull();
	});

	it('lands on the first board when the current id is unknown', () => {
		expect(stepBoardId(boards, 'gone', 1)).toBe('a');
	});
});
