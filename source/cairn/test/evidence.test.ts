import {describe, expect, it} from 'vitest';
import {computeFreshness, completionCheck} from '../evidence/evidence.js';
import {WorkItem, AcceptanceCriterion, Verification} from '../model/entities.js';

describe('evidence', () => {
	it('file change invalidates freshness', () => {
		const f = computeFreshness({
			now: '2026-01-02T00:00:00.000Z',
			currentFileHashes: {'a.ts': 'h2'},
			recordedFileHashes: {'a.ts': 'h1'},
		});
		expect(f).toBe('stale');
	});

	it('fresh when unchanged', () => {
		const f = computeFreshness({
			now: '2026-01-02T00:00:00.000Z',
			currentFileHashes: {'a.ts': 'h1'},
			recordedFileHashes: {'a.ts': 'h1'},
		});
		expect(f).toBe('fresh');
	});

	it('blocks done when criterion missing', () => {
		const wi: WorkItem = {
			id: 'W1',
			ref: 'W1',
			title: 't',
			spec: 's',
			priority: 1,
			status: 'ready',
			tags: [],
			acceptanceCriteria: ['C1', 'C2'],
			blockedBy: [],
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		};
		const criteria: AcceptanceCriterion[] = [
			{id: 'C1', workItemId: 'W1', statement: 'c1', kind: 'test_passes', verificationIds: []},
			{id: 'C2', workItemId: 'W1', statement: 'c2', kind: 'test_passes', verificationIds: []},
		];
		const verifications: Verification[] = [
			{id: 'V1', criterionId: 'C1', verifier: 'vitest', outcome: 'pass', freshness: 'fresh', checkedAt: '2026-01-01T00:00:00.000Z'},
		];
		const res = completionCheck(wi, criteria, verifications);
		expect(res.complete).toBe(false);
		expect(res.missing).toContain('C2');
	});

	it('done when all criteria fresh pass', () => {
		const wi: WorkItem = {
			id: 'W1',
			ref: 'W1',
			title: 't',
			spec: 's',
			priority: 1,
			status: 'ready',
			tags: [],
			acceptanceCriteria: ['C1'],
			blockedBy: [],
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
		};
		const criteria: AcceptanceCriterion[] = [
			{id: 'C1', workItemId: 'W1', statement: 'c1', kind: 'test_passes', verificationIds: []},
		];
		const verifications: Verification[] = [
			{id: 'V1', criterionId: 'C1', verifier: 'vitest', outcome: 'pass', freshness: 'fresh', checkedAt: '2026-01-01T00:00:00.000Z'},
		];
		const res = completionCheck(wi, criteria, verifications);
		expect(res.complete).toBe(true);
	});
});