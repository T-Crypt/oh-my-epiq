import {describe, expect, it} from 'vitest';
import {parseQualifier} from '../query/qualifier.js';


describe('qualifier', () => {
	it('basic', () => {
		const r = parseQualifier('status:ready tag:critical assignee:hadaL sort:created');
		expect(r.errors).toEqual([]);
		expect(r.filters.status).toBe('ready');
		expect(r.filters.tag).toBe('critical');
		expect(r.filters.assignee).toBe('hadaL');
		expect(r.sort).toEqual({field: 'created', direction: 'asc'});
	});

	it('quoted', () => {
		const r = parseQualifier('tag:"foo bar"');
		expect(r.errors).toEqual([]);
		expect(r.filters.tag).toBe('foo bar');
	});

	it('multiple and case-insensitive status', () => {
		const r = parseQualifier('status:READY limit:5 offset:2');
		expect(r.errors).toEqual([]);
		expect(r.filters.status).toBe('ready');
		expect(r.limit).toBe(5);
		expect(r.offset).toBe(2);
	});

	it('invalid qualifier errors', () => {
		const r = parseQualifier('foo:bar');
		expect(r.errors.length).toBeGreaterThan(0);
	});
});
