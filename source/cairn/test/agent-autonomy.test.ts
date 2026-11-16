import {describe, expect, it} from 'vitest';
import {canPromoteToConstraint, canSetDone, canDeleteHistory, requiresHuman} from '../agent/autonomy.js';

describe('agent autonomy', () => {
	it('agent cannot promote to user origin', () => {
		expect(canPromoteToConstraint('agent', 'user')).toBe(false);
		expect(canPromoteToConstraint({kind: 'agent'}, 'user')).toBe(false);
	});
	it('human can promote to user origin', () => {
		expect(canPromoteToConstraint('human', 'user')).toBe(true);
	});
	it('non-user origin allowed', () => {
		expect(canPromoteToConstraint('agent', 'architecture')).toBe(true);
	});
	it('agent cannot set done', () => {
		expect(canSetDone('agent')).toBe(false);
		expect(canSetDone({kind: 'agent'})).toBe(false);
	});
	it('human can delete history only', () => {
		expect(canDeleteHistory('human')).toBe(true);
		expect(canDeleteHistory('agent')).toBe(false);
	});
	it('requiresHuman list', () => {
		expect(requiresHuman('delete_history')).toBe(true);
		expect(requiresHuman('claim_work')).toBe(false);
	});
});