import {describe, expect, it} from 'vitest';
import {
	appendToDescription,
	bulkCloseTargets,
	bulkReopenTargets,
	DESCRIPTION_SEPARATOR,
	toggleIdInList,
} from './bulk-edit';

describe('toggleIdInList', () => {
	it('adds a missing id', () => {
		expect(toggleIdInList(['a'], 'b')).toEqual(['a', 'b']);
	});

	it('removes a present id', () => {
		expect(toggleIdInList(['a', 'b'], 'a')).toEqual(['b']);
	});

	it('does not duplicate on re-add', () => {
		expect(toggleIdInList(['a'], 'a')).toEqual([]);
	});
});

describe('appendToDescription', () => {
	it('joins with a visible separator', () => {
		expect(appendToDescription('old', 'new')).toBe(
			`old${DESCRIPTION_SEPARATOR}new`,
		);
	});

	it('leaves an empty description bare, with no separator', () => {
		expect(appendToDescription('', 'new')).toBe('new');
		expect(appendToDescription('   ', 'new')).toBe('new');
	});

	it('trims trailing blank lines off the old text before joining', () => {
		expect(appendToDescription('old\n\n', 'new')).toBe(
			`old${DESCRIPTION_SEPARATOR}new`,
		);
	});

	it('trims the addition and ignores an empty one', () => {
		expect(appendToDescription('old', '  new  ')).toBe(
			`old${DESCRIPTION_SEPARATOR}new`,
		);
		expect(appendToDescription('old', '   ')).toBe('old');
	});
});

describe('bulk close/reopen targets', () => {
	const issues = [
		{id: 'open', isClosed: false},
		{id: 'shut', isClosed: true},
	];

	it('close skips the already-closed', () => {
		expect(bulkCloseTargets(issues)).toEqual(['open']);
	});

	it('reopen takes only the closed', () => {
		expect(bulkReopenTargets(issues)).toEqual(['shut']);
	});

	it('both are empty on an empty selection', () => {
		expect(bulkCloseTargets([])).toEqual([]);
		expect(bulkReopenTargets([])).toEqual([]);
	});
});
