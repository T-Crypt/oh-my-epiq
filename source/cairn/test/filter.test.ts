import {describe, expect, it} from 'vitest';
import {WorkItem} from '../model/entities.js';
import {filterWorkItems} from '../query/filter.js';
import {parseQualifier} from '../query/qualifier.js';

function wi(overrides: Partial<WorkItem> & {id: string}): WorkItem {
	const {id, ...rest} = overrides;
	return {
		id,
		ref: rest.ref ?? id.toUpperCase().slice(0, 7),
		title: rest.title ?? 't',
		spec: rest.spec ?? 'spec',
		priority: rest.priority ?? 1,
		status: rest.status ?? 'ready',
		tags: rest.tags ?? [],
		acceptanceCriteria: [],
		blockedBy: [],
		createdAt: rest.createdAt ?? '2026-01-01T00:00:00.000Z',
		updatedAt: rest.updatedAt ?? '2026-01-01T00:00:00.000Z',
		lane: rest.lane,
		assignee: rest.assignee,
		objectiveId: rest.objectiveId,
		...rest,
	};
}

describe('filter', () => {
	it('status filter', () => {
		const items = [wi({id: 'a', ref: 'AAAAAAA', status: 'ready'}), wi({id: 'b', ref: 'BBBBBBB', status: 'done'})];
		const out = filterWorkItems(items, {status: 'ready'});
		expect(out).toHaveLength(1);
		expect(out[0]!.ref).toBe('AAAAAAA');
	});

	it('tag filter', () => {
		const items = [wi({id: 'a', ref: 'A', tags: ['t1']}), wi({id: 'b', ref: 'B', tags: []})];
		const out = filterWorkItems(items, {tag: 't1'});
		expect(out).toHaveLength(1);
		expect(out[0]!.ref).toBe('A');
	});

	it('sort by title', () => {
		const items = [
			wi({id: 'a', ref: 'A', title: 'bravo', createdAt: '2026-01-02T00:00:00.000Z'}),
			wi({id: 'b', ref: 'B', title: 'alpha', createdAt: '2026-01-01T00:00:00.000Z'}),
		];
		const q = parseQualifier('sort:title');
		const out = filterWorkItems(items, q);
		expect(out[0]!.title).toBe('alpha');
	});

	it('limit and offset', () => {
		const items = [1, 2, 3, 4].map((n) =>
			wi({id: String(n), ref: String(n), title: String(n), createdAt: `2026-01-0${n}T00:00:00.000Z`}),
		);
		const q = parseQualifier('sort:created limit:2 offset:1');
		const out = filterWorkItems(items, q);
		expect(out).toHaveLength(2);
		expect(out[0]!.title).toBe('2');
	});
});
