import {describe, expect, it} from 'vitest';
import {buildRan} from '../ledger/records.js';
import {mayReuse} from '../ledger/reuse.js';

describe('reuse', () => {
	it('rejects stale record', () => {
		const r = buildRan({
			id: 'R1',
			actorId: 'a',
			repository: 'repo',
			startedAt: '2026-01-01T00:00:00.000Z',
			endedAt: '2026-01-01T00:00:01.000Z',
			envFingerprint: 'env1',
			inputDigest: 'd1',
			scope: 'scope1',
			provenance: 'observed',
			command: 'test',
		});
		r.validity = 'stale';
		const res = mayReuse(r, 'scope1', ['d1']);
		expect(res.reuse).toBe(false);
		expect(res.reason).toContain('stale');
	});

	it('allows valid in-scope matching', () => {
		const r = buildRan({
			id: 'R1',
			actorId: 'a',
			repository: 'repo',
			startedAt: '2026-01-01T00:00:00.000Z',
			endedAt: '2026-01-01T00:00:01.000Z',
			envFingerprint: 'env1',
			inputDigest: 'd1',
			scope: 'scope1',
			provenance: 'observed',
			command: 'test',
		});
		r.validity = 'valid';
		const res = mayReuse(r, 'scope1', ['d1']);
		expect(res.reuse).toBe(true);
	});

	it('rejects input mismatch', () => {
		const r = buildRan({
			id: 'R1',
			actorId: 'a',
			repository: 'repo',
			startedAt: '2026-01-01T00:00:00.000Z',
			endedAt: '2026-01-01T00:00:01.000Z',
			envFingerprint: 'env1',
			inputDigest: 'd1',
			scope: 'scope1',
			provenance: 'observed',
			command: 'test',
		});
		r.validity = 'valid';
		const res = mayReuse(r, 'scope1', ['d2']);
		expect(res.reuse).toBe(false);
	});
});