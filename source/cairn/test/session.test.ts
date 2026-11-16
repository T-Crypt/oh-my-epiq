import {describe, expect, it} from 'vitest';
import {buildSession, closeSession, canResume} from '../handoff/session.js';
import {buildHandoff} from '../handoff/handoff.js';

describe('session build', () => {
	it('builds a session', () => {
		const s = buildSession('W1', 'a1', 'node');
		expect(s.actorId).toBe('a1');
		expect(s.runtime).toBe('node');
		expect(s.workItemId).toBe('W1');
		expect(s.endedAt).toBeUndefined();
		expect(typeof s.id).toBe('string');
		expect(typeof s.startedAt).toBe('string');
	});
});

describe('session close', () => {
	it('closes session with exit reason', () => {
		const s = buildSession('W1', 'a1', 'node');
		const c = closeSession(s, 'done');
		expect(c.exitReason).toBe('done');
		expect(typeof c.endedAt).toBe('string');
		expect(s.endedAt).toBeUndefined();
	});
});

describe('session canResume', () => {
	it('true when work items match', () => {
		const s = buildSession('W1', 'a1', 'node');
		const h = buildHandoff('W1', 'a1', 'a2', 'C1', [], false);
		expect(canResume(s, h)).toBe(true);
	});

	it('false when work items differ', () => {
		const s = buildSession('W1', 'a1', 'node');
		const h = buildHandoff('W2', 'a1', 'a2', 'C1', [], false);
		expect(canResume(s, h)).toBe(false);
	});
});
