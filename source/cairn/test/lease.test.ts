import {describe, expect, it} from 'vitest';
import {WorkItem} from '../model/entities.js';
import {
	ClaimResult,
	createLeaseState,
	claim,
	release,
	expireStaleLeases,
} from '../lease/lease.js';

function wi(id: string): WorkItem {
	return {
		id,
		ref: id.slice(-7).toUpperCase(),
		title: 't',
		spec: 'spec',
		priority: 1,
		status: 'ready',
		tags: [],
		acceptanceCriteria: [],
		blockedBy: [],
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	};
}

describe('lease', () => {
	it('one winner in concurrency', () => {
		const state = createLeaseState([wi('01WWWWWWWWWWWWW')]);
		const r1 = claim(state, {
			requestId: 'r1',
			workItemId: '01WWWWWWWWWWWWW',
			holderActorId: 'a1',
			now: '2026-01-01T00:00:00.000Z',
			ttlMs: 60000,
		});
		const r2 = claim(r1.state, {
			requestId: 'r2',
			workItemId: '01WWWWWWWWWWWWW',
			holderActorId: 'a2',
			now: '2026-01-01T00:00:00.000Z',
			ttlMs: 60000,
		});
		expect(r1.result.kind).toBe('claimed');
		expect(r2.result.kind).toBe('conflict');
	});

	it('stale owner rejected', () => {
		const state = createLeaseState([wi('01WWWWWWWWWWWWW')]);
		const r1 = claim(state, {
			requestId: 'r1',
			workItemId: '01WWWWWWWWWWWWW',
			holderActorId: 'a1',
			now: '2026-01-01T00:00:00.000Z',
			ttlMs: 60000,
		});
		// second claim after expiry
		const expired = expireStaleLeases(r1.state, '2026-01-01T00:02:00.000Z');
		const r2 = claim(expired, {
			requestId: 'r2',
			workItemId: '01WWWWWWWWWWWWW',
			holderActorId: 'a2',
			now: '2026-01-01T00:02:00.000Z',
			ttlMs: 60000,
		});
		expect(r2.result.kind).toBe('claimed');
		// old owner tries to release with old token
		const oldLease = (r1.result as Extract<ClaimResult, {kind: 'claimed'}>).lease;
		const rel = release(r2.state, {
			leaseId: oldLease.id,
			holderActorId: 'a1',
			fencingToken: oldLease.fencingToken,
			now: '2026-01-01T00:02:00.000Z',
		});
		expect(rel.result.kind).toBe('stale_owner');
	});

	it('idempotency returns original', () => {
		const state = createLeaseState([wi('01WWWWWWWWWWWWW')]);
		const r1 = claim(state, {
			requestId: 'same',
			workItemId: '01WWWWWWWWWWWWW',
			holderActorId: 'a1',
			now: '2026-01-01T00:00:00.000Z',
			ttlMs: 60000,
		});
		const r2 = claim(r1.state, {
			requestId: 'same',
			workItemId: '01WWWWWWWWWWWWW',
			holderActorId: 'a1',
			now: '2026-01-01T00:00:00.000Z',
			ttlMs: 60000,
		});
		expect(r2.result.kind).toBe('idempotent');
	});

	it('expiry recovery returns work item to ready', () => {
		const state = createLeaseState([wi('01WWWWWWWWWWWWW')]);
		const r1 = claim(state, {
			requestId: 'r1',
			workItemId: '01WWWWWWWWWWWWW',
			holderActorId: 'a1',
			now: '2026-01-01T00:00:00.000Z',
			ttlMs: 1000,
		});
		const expired = expireStaleLeases(r1.state, '2026-01-01T00:01:00.000Z');
		const wi2 = expired.workItems.find(w => w.id === '01WWWWWWWWWWWWW')!;
		expect(wi2.status).toBe('ready');
		expect(wi2.leaseId).toBeUndefined();
	});
});