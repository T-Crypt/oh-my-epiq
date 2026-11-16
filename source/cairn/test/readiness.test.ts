import {describe, expect, it} from 'vitest';
import {Edge} from '../model/edges.js';
import {readiness} from '../graph/readiness.js';
import {Verification, WorkItem} from '../model/entities.js';

function wi(overrides: Partial<WorkItem> & {id: string}): WorkItem {
	const {id, ...rest} = overrides;
	return {
		id,
		ref: id.slice(-7).toUpperCase(),
		title: 't',
		spec: 'spec',
		priority: 1,
		status: 'draft',
		tags: [],
		acceptanceCriteria: [],
		blockedBy: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...rest,
	};
}

describe('readiness', () => {
	it('ready when deps done and spec present', () => {
		const a = wi({id: '01AAAAAAAAAAAAA', status: 'done'});
		const b = wi({id: '01BBBBBBBBBBBBB', status: 'draft'});
		const edges: Edge[] = [
			{
				from: {type: 'WorkItem', id: b.id},
				to: {type: 'WorkItem', id: a.id},
				type: 'depends_on',
				author: 'x',
				timestamp: '2026-01-01T00:00:00.000Z',
			},
		];
		const r = readiness({workItem: b, allWorkItems: [a, b], allEdges: edges, allVerifications: []});
		expect(r.ready).toBe(true);
	});

	it('blocked when dep open', () => {
		const a = wi({id: '01AAAAAAAAAAAAA', status: 'draft'});
		const b = wi({id: '01BBBBBBBBBBBBB', status: 'draft'});
		const edges: Edge[] = [
			{
				from: {type: 'WorkItem', id: b.id},
				to: {type: 'WorkItem', id: a.id},
				type: 'depends_on',
				author: 'x',
				timestamp: '2026-01-01T00:00:00.000Z',
			},
		];
		const r = readiness({workItem: b, allWorkItems: [a, b], allEdges: edges, allVerifications: []});
		expect(r.ready).toBe(false);
		expect(r.reasons.some(x => x.includes('not done'))).toBe(true);
	});

	it('blocked when no spec', () => {
		const b = wi({id: '01BBBBBBBBBBBBB', status: 'draft', spec: ''});
		const r = readiness({workItem: b, allWorkItems: [b], allEdges: [], allVerifications: []});
		expect(r.ready).toBe(false);
		expect(r.reasons).toContain('missing spec');
	});

	it('blocked by failing fresh verification', () => {
		const crit = '01CCCCCCCCCCCCC';
		const b = wi({id: '01BBBBBBBBBBBBB', status: 'draft', acceptanceCriteria: [crit]});
		const v: Verification = {
			id: '01VVVVVVVVVVVVV',
			criterionId: crit,
			verifier: 'tool',
			outcome: 'fail',
			freshness: 'fresh',
			checkedAt: '2026-01-01T00:00:00.000Z',
		};
		const r = readiness({workItem: b, allWorkItems: [b], allEdges: [], allVerifications: [v]});
		expect(r.ready).toBe(false);
		expect(r.reasons.some(x => x.includes('failing fresh'))).toBe(true);
	});
});