import {Lease, WorkItem} from '../model/entities.js';

export interface LeaseState {
	leases: Lease[];
	workItems: WorkItem[];
	maxFencingToken: Record<string, number>;
	idempotency: Record<string, ClaimResult | ReleaseResult | HeartbeatResult>;
}

export type ClaimResult =
	| {kind: 'claimed'; lease: Lease}
	| {kind: 'conflict'; holder: string; fencingToken: number; expiresAt: string}
	| {kind: 'idempotent'; lease: Lease};

export interface ClaimRequest {
	requestId: string;
	workItemId: string;
	holderActorId: string;
	now: string;
	ttlMs: number;
	policy?: 'exclusive' | 'shared';
}

export type ReleaseResult =
	| {kind: 'released'; lease: Lease}
	| {kind: 'not_found'}
	| {kind: 'stale_owner'}
	| {kind: 'idempotent'; lease: Lease};

export interface ReleaseRequest {
	requestId?: string;
	leaseId: string;
	holderActorId: string;
	fencingToken: number;
	now: string;
}

export type HeartbeatResult =
	| {kind: 'ok'; lease: Lease}
	| {kind: 'not_found'}
	| {kind: 'stale'}
	| {kind: 'expired'};

export interface HeartbeatRequest {
	leaseId: string;
	fencingToken: number;
	now: string;
	ttlMs: number;
}

function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}

function nowMs(ts: string): number {
	return Date.parse(ts);
}

function addMs(ts: string, ms: number): string {
	return new Date(Date.parse(ts) + ms).toISOString();
}

export function createLeaseState(
	workItems: WorkItem[] = [],
	leases: Lease[] = [],
): LeaseState {
	const max: Record<string, number> = {};
	for (const l of leases) {
		const cur = max[l.workItemId] ?? 0;
		if (l.fencingToken > cur) max[l.workItemId] = l.fencingToken;
	}
	return {leases: clone(leases), workItems: clone(workItems), maxFencingToken: max, idempotency: {}};
}

export function claim(state: LeaseState, req: ClaimRequest): {state: LeaseState; result: ClaimResult} {
	const s = clone(state);

	if (req.requestId && s.idempotency[req.requestId]) {
		const cached = s.idempotency[req.requestId] as ClaimResult;
		if (cached.kind === 'claimed') {
			return {state: s, result: {kind: 'idempotent', lease: cached.lease}};
		}
		return {state: s, result: cached};
	}

	// expire stale leases first
	s.leases = s.leases.map(l => {
		if (l.workItemId === req.workItemId && l.state === 'active' && nowMs(l.expiresAt) <= nowMs(req.now)) {
			return {...l, state: 'expired'};
		}
		return l;
	});

	const activeLeases = s.leases.filter(
		l => l.workItemId === req.workItemId && l.state === 'active',
	);
	const policy = req.policy ?? 'exclusive';

	let conflictLease: Lease | undefined;
	if (policy === 'exclusive' && activeLeases.length > 0) {
		conflictLease = activeLeases[0];
	}

	if (conflictLease) {
		const result: ClaimResult = {
			kind: 'conflict',
			holder: conflictLease.holderActorId,
			fencingToken: conflictLease.fencingToken,
			expiresAt: conflictLease.expiresAt,
		};
		if (req.requestId) s.idempotency[req.requestId] = result;
		return {state: s, result};
	}

	const currentMax = s.maxFencingToken[req.workItemId] ?? 0;
	const token = currentMax + 1;
	s.maxFencingToken[req.workItemId] = token;

	const lease: Lease = {
		id: `${req.workItemId}-${token}`,
		workItemId: req.workItemId,
		holderActorId: req.holderActorId,
		fencingToken: token,
		acquiredAt: req.now,
		expiresAt: addMs(req.now, req.ttlMs),
		lastHeartbeatAt: req.now,
		state: 'active',
	};

	s.leases.push(lease);

	// update work item
	const wi = s.workItems.find(w => w.id === req.workItemId);
	if (wi) {
		wi.leaseId = lease.id;
		if (wi.status === 'draft' || wi.status === 'ready') wi.status = 'claimed';
		wi.updatedAt = req.now;
	}

	const result: ClaimResult = {kind: 'claimed', lease};
	if (req.requestId) s.idempotency[req.requestId] = result;
	return {state: s, result};
}

export function release(state: LeaseState, req: ReleaseRequest): {state: LeaseState; result: ReleaseResult} {
	const s = clone(state);

	if (req.requestId && s.idempotency[req.requestId]) {
		const cached = s.idempotency[req.requestId] as ReleaseResult;
		return {state: s, result: cached};
	}

	const lease = s.leases.find(l => l.id === req.leaseId);
	if (!lease) {
		const result: ReleaseResult = {kind: 'not_found'};
		if (req.requestId) s.idempotency[req.requestId] = result;
		return {state: s, result};
	}

	// stale owner check: token must be the latest for this work item
	const maxToken = Math.max(
		...s.leases.filter(l => l.workItemId === lease.workItemId).map(l => l.fencingToken),
		lease.fencingToken,
	);
	if (req.fencingToken < maxToken || lease.state !== 'active') {
		const result: ReleaseResult = {kind: 'stale_owner'};
		if (req.requestId) s.idempotency[req.requestId] = result;
		return {state: s, result};
	}
	if (lease.holderActorId !== req.holderActorId) {
		const result: ReleaseResult = {kind: 'stale_owner'};
		if (req.requestId) s.idempotency[req.requestId] = result;
		return {state: s, result};
	}

	lease.state = 'released';
	lease.releasedAt = req.now;

	const wi = s.workItems.find(w => w.id === lease.workItemId);
	if (wi && wi.leaseId === lease.id) {
		wi.leaseId = undefined;
		if (wi.status === 'claimed' || wi.status === 'in_progress') wi.status = 'ready';
		wi.updatedAt = req.now;
	}

	const result: ReleaseResult = {kind: 'released', lease};
	if (req.requestId) s.idempotency[req.requestId] = result;
	return {state: s, result};
}

export function heartbeat(state: LeaseState, req: HeartbeatRequest): {state: LeaseState; result: HeartbeatResult} {
	const s = clone(state);
	const lease = s.leases.find(l => l.id === req.leaseId);
	if (!lease) {
		return {state: s, result: {kind: 'not_found'}};
	}
	if (lease.fencingToken !== req.fencingToken) {
		return {state: s, result: {kind: 'stale'}};
	}
	if (lease.state !== 'active') {
		return {state: s, result: {kind: 'expired'}};
	}
	if (nowMs(lease.expiresAt) <= nowMs(req.now)) {
		lease.state = 'expired';
		return {state: s, result: {kind: 'expired'}};
	}
	lease.expiresAt = addMs(req.now, req.ttlMs);
	lease.lastHeartbeatAt = req.now;
	return {state: s, result: {kind: 'ok', lease}};
}

export function expireStaleLeases(state: LeaseState, now: string): LeaseState {
	const s = clone(state);
	s.leases = s.leases.map(l => {
		if (l.state === 'active' && nowMs(l.expiresAt) <= nowMs(now)) {
			return {...l, state: 'expired'};
		}
		return l;
	});
	// recovery: work items with expired leases return to ready
	for (const l of s.leases) {
		if (l.state === 'expired') {
			const wi = s.workItems.find(w => w.id === l.workItemId && w.leaseId === l.id);
			if (wi) {
				wi.leaseId = undefined;
				if (wi.status === 'claimed' || wi.status === 'in_progress') wi.status = 'ready';
				wi.updatedAt = now;
			}
		}
	}
	return s;
}

export function isStaleOwner(
	state: LeaseState,
	workItemId: string,
	providedToken: number,
): boolean {
	const leases = state.leases.filter(l => l.workItemId === workItemId);
	if (leases.length === 0) return false;
	const maxToken = Math.max(...leases.map(l => l.fencingToken));
	return providedToken < maxToken;
}

export function sharedLeaseAllowed(policy?: string): boolean {
	return policy === 'shared';
}