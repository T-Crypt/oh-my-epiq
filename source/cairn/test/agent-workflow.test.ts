import {describe, expect, it} from 'vitest';
import {WorkItem} from '../model/entities.js';
import {
	claimWork,
	releaseWork,
	requestReview,
	acceptWork,
	rejectWork,
	handoffWork,
	resumeWork,
} from '../agent/workflow.js';

function wi(id: string, status: WorkItem['status'] = 'ready'): WorkItem {
	return {
		id,
		ref: id.slice(-7).toUpperCase(),
		title: 't',
		spec: 'spec',
		priority: 1,
		status,
		tags: [],
		acceptanceCriteria: [],
		blockedBy: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	};
}

describe('agent workflow claim', () => {
	it('success', () => {
		const w = wi('01WWWWWWWWWWWWW');
		const r = claimWork(w, 'agent1', 'exclusive');
		expect(r.success).toBe(true);
		expect(r.workItem?.status).toBe('claimed');
		expect(r.lease).toBeDefined();
	});
	it('conflict on already claimed', () => {
		const w = wi('01WWWWWWWWWWWWW');
		const first = claimWork(w, 'agent1', 'exclusive');
		const second = claimWork(first.workItem!, 'agent2', 'exclusive');
		expect(second.success).toBe(false);
		expect(second.conflict).toBeDefined();
	});
});

describe('agent workflow release', () => {
	it('releases', () => {
		const w = wi('01WWWWWWWWWWWWW');
		const c = claimWork(w, 'agent1', 'exclusive');
		const r = releaseWork(c.workItem!, c.lease!, 'agent1');
		expect(r.success).toBe(true);
		expect(r.workItem?.status).toBe('ready');
	});
});

describe('agent workflow review', () => {
	it('request review sets in_review', () => {
		const w = wi('01WWWWWWWWWWWWW', 'claimed');
		const exec = {
			id: 'e1', workItemId: w.id, actorId: 'agent1',
			startedAt: '2026-01-01T00:00:00.000Z', outcome: 'succeeded' as const,
		};
		const ev = {id: 'ev1', kind: 'test_run' as const, digest: 'd', createdAt: '2026-01-01T00:00:00.000Z', retention: 'keep' as const};
		const r = requestReview(w, exec, [ev]);
		expect(r.success).toBe(true);
		expect(r.workItem?.status).toBe('in_review');
	});
	it('accept sets done', () => {
		const w = wi('01WWWWWWWWWWWWW', 'in_review');
		const v = {
			id: 'v1', criterionId: 'c1', verifier: 'human', outcome: 'pass' as const,
			freshness: 'fresh' as const, checkedAt: '2026-01-01T00:00:00.000Z',
		};
		const r = acceptWork(w, 'human', v);
		expect(r.success).toBe(true);
		expect(r.workItem?.status).toBe('done');
	});
	it('reject reopens', () => {
		const w = wi('01WWWWWWWWWWWWW', 'in_review');
		const r = rejectWork(w, 'human', 'not good');
		expect(r.success).toBe(true);
		expect(r.workItem?.status).toBe('ready');
	});
});

describe('agent workflow handoff', () => {
	it('handoff and resume', () => {
		const w = wi('01WWWWWWWWWWWWW', 'claimed');
		const h = handoffWork(w, 'a1', 'a2', 'cap1', ['q1']);
		expect(h.success).toBe(true);
		const res = resumeWork(h.handoff!, {text: 'capsule'});
		expect(res.workItemId).toBe(w.id);
		expect(res.openQuestions).toEqual(['q1']);
	});
});