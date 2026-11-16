import {describe, expect, it} from 'vitest';
import {buildRan} from '../ledger/records.js';
import {computeValidity} from '../ledger/validity.js';

describe('validity', () => {
	it('valid when everything matches', () => {
		const r = buildRan({
			id: 'R1',
			actorId: 'a',
			repository: 'repo',
			startedAt: '2026-01-01T00:00:00.000Z',
			endedAt: '2026-01-01T00:00:01.000Z',
			envFingerprint: 'env1',
			inputDigest: 'd1',
			files: ['a.ts'],
			provenance: 'observed',
			command: 'test',
			baseSha: 'sha1',
		});
		const res = computeValidity(r, {
			now: '2026-01-02T00:00:00.000Z',
			currentFileHashes: {'a.ts': 'h1'},
			recordedFileHashes: {'a.ts': 'h1'},
			currentEnvFingerprint: 'env1',
			currentBranchHead: 'sha1',
			retentionDays: 30,
		});
		expect(res.state).toBe('valid');
	});

	it('stale when file changes', () => {
		const r = buildRan({
			id: 'R1',
			actorId: 'a',
			repository: 'repo',
			startedAt: '2026-01-01T00:00:00.000Z',
			endedAt: '2026-01-01T00:00:01.000Z',
			envFingerprint: 'env1',
			inputDigest: 'd1',
			files: ['a.ts'],
			provenance: 'observed',
			command: 'test',
		});
		const res = computeValidity(r, {
			now: '2026-01-02T00:00:00.000Z',
			currentFileHashes: {'a.ts': 'h2'},
			recordedFileHashes: {'a.ts': 'h1'},
			currentEnvFingerprint: 'env1',
		});
		expect(res.state).toBe('stale');
		expect(res.changedPaths).toContain('a.ts');
	});

	it('stale when env changes', () => {
		const r = buildRan({
			id: 'R1',
			actorId: 'a',
			repository: 'repo',
			startedAt: '2026-01-01T00:00:00.000Z',
			endedAt: '2026-01-01T00:00:01.000Z',
			envFingerprint: 'env1',
			inputDigest: 'd1',
			files: [],
			provenance: 'observed',
			command: 'test',
		});
		const res = computeValidity(r, {
			now: '2026-01-02T00:00:00.000Z',
			currentFileHashes: {},
			recordedFileHashes: {},
			currentEnvFingerprint: 'env2',
		});
		expect(res.state).toBe('stale');
	});

	it('unknown when retention expired', () => {
		const r = buildRan({
			id: 'R1',
			actorId: 'a',
			repository: 'repo',
			startedAt: '2026-01-01T00:00:00.000Z',
			endedAt: '2026-01-01T00:00:01.000Z',
			envFingerprint: 'env1',
			inputDigest: 'd1',
			files: [],
			provenance: 'observed',
			command: 'test',
		});
		const res = computeValidity(r, {
			now: '2026-03-01T00:00:00.000Z',
			currentFileHashes: {},
			recordedFileHashes: {},
			currentEnvFingerprint: 'env1',
			retentionDays: 1,
		});
		expect(res.state).toBe('unknown');
	});
});