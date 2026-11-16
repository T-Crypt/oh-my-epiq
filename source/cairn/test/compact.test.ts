import {describe, expect, it} from 'vitest';
import {WorkItem} from '../model/entities.js';
import {
	compactWorkItem,
	compactWorkItemList,
	formatBrief,
	formatJson,
} from '../output/compact.js';

function wi(overrides: Partial<WorkItem> & {id: string}): WorkItem {
	const {id, ...rest} = overrides;
	return {
		id,
		ref: rest.ref ?? 'REF1234',
		title: rest.title ?? 'title',
		spec: 'spec',
		priority: rest.priority ?? 2,
		status: rest.status ?? 'ready',
		tags: rest.tags ?? ['t1', 't2'],
		acceptanceCriteria: [],
		blockedBy: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		lane: rest.lane,
		assignee: rest.assignee,
		...rest,
	};
}

describe('compact', () => {
	it('brief line', () => {
		const item = wi({id: 'a'});
		expect(formatBrief([item])).toBe('REF1234  title  [ready]  t1,t2');
	});

	it('json', () => {
		const item = wi({id: 'a'});
		const parsed = JSON.parse(formatJson([item]));
		expect(parsed).toHaveLength(1);
		expect(parsed[0].ref).toBe('REF1234');
		expect(parsed[0].tags).toEqual(['t1', 't2']);
	});

	it('compactWorkItem fields', () => {
		const item = wi({id: 'a', lane: 'dev', assignee: 'hada'});
		const c = compactWorkItem(item);
		expect(c.ref).toBe('REF1234');
		expect(c.lane).toBe('dev');
		expect(c.assignee).toBe('hada');
		expect(compactWorkItemList([item])).toHaveLength(1);
	});
});
