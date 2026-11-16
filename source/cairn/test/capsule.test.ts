import {describe, expect, it} from 'vitest';
import {assembleCapsule} from '../capsule/capsule.js';
import {WorkItem, Constraint, AcceptanceCriterion, Decision, Discovery, Execution, Evidence} from '../model/entities.js';

function wi(): WorkItem {
	return {
		id: 'W1',
		ref: 'W1',
		title: 'title',
		spec: 'spec text',
		priority: 1,
		status: 'ready',
		tags: [],
		acceptanceCriteria: ['C1'],
		blockedBy: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	};
}

function baseInput(budget: number) {
	const constraint: Constraint = {
		id: 'K1',
		statement: 'do not delete data',
		origin: 'user',
		scope: ['W1'],
		criticality: 'blocking',
	};
	const criterion: AcceptanceCriterion = {
		id: 'C1',
		workItemId: 'W1',
		statement: 'tests pass',
		kind: 'test_passes',
		verificationIds: [],
	};
	return {
		workItem: wi(),
		constraints: [constraint],
		criteria: [criterion],
		dependencies: {blockedBy: [], blocks: []},
		decisions: [] as Decision[],
		evidence: [] as Evidence[],
		verifications: [],
		attempts: [] as Execution[],
		openQuestions: [] as Discovery[],
		tokenBudget: budget,
	};
}

describe('capsule', () => {
	it('deterministic same bytes', () => {
		const a = assembleCapsule(baseInput(10000));
		const b = assembleCapsule(baseInput(10000));
		expect(a.text).toBe(b.text);
	});

	it('preserves blocking user constraint verbatim', () => {
		const r = assembleCapsule(baseInput(10000));
		expect(r.text).toContain('VERBATIM: do not delete data');
	});

	it('omission manifest when budget exceeded', () => {
		// add many attempts
		const input = baseInput(200);
		const attempts: Execution[] = [];
		for (let i = 0; i < 5; i++) {
			attempts.push({
				id: `E${i}`,
				workItemId: 'W1',
				actorId: 'a',
				startedAt: '2026-01-01T00:00:00.000Z',
				endedAt: '2026-01-01T00:00:01.000Z',
				outcome: 'succeeded',
				summary: 'did something long enough to take space',
			});
		}
		input.attempts = attempts;
		input.tokenBudget = 300;
		const r = assembleCapsule(input);
		expect(r.omitted.length).toBeGreaterThan(0);
	});

	it('constraint never dropped even under small budget', () => {
		const input = baseInput(10000);
		const r = assembleCapsule({...input, tokenBudget: 50});
		// minimum size reported, but text still contains constraint
		expect(r.text).toContain('VERBATIM: do not delete data');
	});

	it('minimumSize reported when budget too small', () => {
		const input = baseInput(10);
		const r = assembleCapsule(input);
		expect(r.minimumSize).toBeDefined();
	});
});