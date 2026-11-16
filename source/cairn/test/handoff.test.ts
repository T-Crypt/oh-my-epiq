import {describe, expect, it} from 'vitest';
import {
	buildHandoff,
	acceptHandoff,
	rejectHandoff,
	resumeFromHandoff,
} from '../handoff/handoff.js';

describe('handoff build', () => {
	it('builds a pending handoff', () => {
		const h = buildHandoff('W1', 'a1', 'a2', 'C1', ['q1'], true);
		expect(h.state).toBe('pending');
		expect(h.workItemId).toBe('W1');
		expect(h.fromActorId).toBe('a1');
		expect(h.toActorId).toBe('a2');
		expect(h.capsuleId).toBe('C1');
		expect(h.unresolvedQuestions).toEqual(['q1']);
		expect(h.releaseLease).toBe(true);
		expect(h.acceptedAt).toBeUndefined();
		expect(typeof h.id).toBe('string');
		expect(typeof h.createdAt).toBe('string');
	});
});

describe('handoff accept', () => {
	it('accepts with correct receiver', () => {
		const h = buildHandoff('W1', 'a1', 'a2', 'C1', [], false);
		const a = acceptHandoff(h, 'a2');
		expect(a.state).toBe('accepted');
		expect(typeof a.acceptedAt).toBe('string');
		expect(h.state).toBe('pending');
	});

	it('rejects accept with wrong receiver', () => {
		const h = buildHandoff('W1', 'a1', 'a2', 'C1', [], false);
		expect(() => acceptHandoff(h, 'a3')).toThrow();
	});
});

describe('handoff reject', () => {
	it('rejects handoff and stores reason', () => {
		const h = buildHandoff('W1', 'a1', 'a2', 'C1', [], false);
		const r = rejectHandoff(h, 'not ready');
		expect(r.state).toBe('rejected');
		expect(r.reason).toBe('not ready');
		expect(r.rejectionReason).toBe('not ready');
	});
});

describe('handoff resume', () => {
	it('extracts resume payload', () => {
		const h = buildHandoff('W1', 'a1', 'a2', 'C1', ['q1', 'q2'], true);
		const capsule = {text: 'capsule'};
		const res = resumeFromHandoff(h, capsule);
		expect(res.workItemId).toBe('W1');
		expect(res.capsule).toBe(capsule);
		expect(res.openQuestions).toEqual(['q1', 'q2']);
		expect(res.leaseReleased).toBe(true);
	});
});
