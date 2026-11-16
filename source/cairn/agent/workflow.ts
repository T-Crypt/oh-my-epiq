// Agent workflow orchestration. Pure state transitions, no I/O.

import {WorkItem, Lease, Execution, Verification, Ulid} from '../model/entities.js';
import {createLeaseState, claim, release} from '../lease/lease.js';
import {buildHandoff, HandoffRecord, resumeFromHandoff, ResumeResult} from '../handoff/handoff.js';

export interface ClaimWorkResult {
	success: boolean;
	workItem?: WorkItem;
	lease?: Lease;
	conflict?: {holder: string; fencingToken: number; expiresAt: string};
}

export interface ReleaseWorkResult {
	success: boolean;
	workItem?: WorkItem;
	error?: string;
}

export interface ReviewResult {
	success: boolean;
	workItem?: WorkItem;
	error?: string;
}

export interface AcceptResult {
	success: boolean;
	workItem?: WorkItem;
	error?: string;
}

export interface RejectResult {
	success: boolean;
	workItem?: WorkItem;
}

export interface HandoffResult {
	success: boolean;
	handoff?: HandoffRecord;
	workItem?: WorkItem;
	error?: string;
}

function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}

function nowIso(): string {
	return new Date().toISOString();
}

function isClaimed(wi: WorkItem): boolean {
	return wi.status === 'claimed' && !!wi.leaseId;
}

export function claimWork(
	workItem: WorkItem,
	actor: string,
	leasePolicy: 'exclusive' | 'shared' = 'exclusive',
	options?: {leases?: Lease[]; now?: string; ttlMs?: number; requestId?: string},
): ClaimWorkResult {
	const now = options?.now ?? nowIso();
	const ttl = options?.ttlMs ?? 60000;
	const leases = options?.leases ?? [];

	if (isClaimed(workItem)) {
		const holder = workItem.assignee ?? 'unknown';
		return {
			success: false,
			conflict: {holder, fencingToken: 0, expiresAt: ''},
		};
	}

	const state = createLeaseState([workItem], leases);
	const reqPolicy = leasePolicy === 'shared' ? 'shared' : 'exclusive';
	const res = claim(state, {
		requestId: options?.requestId ?? `req-${workItem.id}-${actor}`,
		workItemId: workItem.id,
		holderActorId: actor,
		now,
		ttlMs: ttl,
		policy: reqPolicy,
	});

	if (res.result.kind === 'conflict') {
		return {
			success: false,
			conflict: {
				holder: res.result.holder,
				fencingToken: res.result.fencingToken,
				expiresAt: res.result.expiresAt,
			},
		};
	}
	if (res.result.kind === 'claimed' || res.result.kind === 'idempotent') {
		const lease = res.result.lease;
		const updated = res.state.workItems.find(w => w.id === workItem.id);
		return {success: true, workItem: updated ? clone(updated) : clone(workItem), lease: clone(lease)};
	}
	return {success: false};
}

export function releaseWork(
	workItem: WorkItem,
	lease: Lease,
	actor: string,
	options?: {now?: string; requestId?: string},
): ReleaseWorkResult {
	const now = options?.now ?? nowIso();
	const state = createLeaseState([workItem], [lease]);
	const res = release(state, {
		requestId: options?.requestId,
		leaseId: lease.id,
		holderActorId: actor,
		fencingToken: lease.fencingToken,
		now,
	});
	if (res.result.kind === 'released' || res.result.kind === 'idempotent') {
		const updated = res.state.workItems.find(w => w.id === workItem.id);
		return {success: true, workItem: updated ? clone(updated) : clone(workItem)};
	}
	return {success: false, error: res.result.kind};
}

export function requestReview(
	workItem: WorkItem,
	execution: Execution,
	evidence: unknown[],
): ReviewResult {
	if (workItem.status !== 'claimed' && workItem.status !== 'in_progress') {
		return {success: false};
	}
	if (!evidence || evidence.length === 0) {
		return {success: false, error: 'evidence required'};
	}
	const updated: WorkItem = clone(workItem);
	updated.status = 'in_review';
	updated.updatedAt = nowIso();
	void execution;
	return {success: true, workItem: updated};
}

export function acceptWork(
	workItem: WorkItem,
	reviewer: string,
	verification: Verification,
	options?: {lease?: Lease; leases?: Lease[]; actor?: string; now?: string},
): AcceptResult {
	if (verification.outcome !== 'pass' || verification.freshness !== 'fresh') {
		return {success: false, error: 'verification not fresh/passing'};
	}

	// lease enforcement when lease context is provided
	const actor = options?.actor ?? reviewer;
	if (options?.lease) {
		const l = options.lease;
		if (
			l.state !== 'active' ||
			l.workItemId !== workItem.id ||
			l.holderActorId !== actor
		) {
			return {success: false, error: 'no active lease held by actor'};
		}
	} else if (options?.leases) {
		const active = options.leases.find(
			l => l.workItemId === workItem.id && l.state === 'active' && l.holderActorId === actor,
		);
		if (!active) {
			return {success: false, error: 'no active lease held by actor'};
		}
	}

	const updated: WorkItem = clone(workItem);
	updated.status = 'done';
	updated.updatedAt = options?.now ?? nowIso();
	updated.verification = clone(verification);
	updated.verificationId = verification.id;
	updated.verificationIds = [...(updated.verificationIds ?? []), verification.id];
	updated.verifications = [...(updated.verifications ?? []), clone(verification)];
	return {success: true, workItem: updated};
}

export function rejectWork(
	workItem: WorkItem,
	reviewer: string,
	reason: string,
): RejectResult {
	void reviewer;
	const updated: WorkItem = clone(workItem);
	updated.status = 'ready';
	updated.leaseId = undefined;
	updated.updatedAt = nowIso();
	// attach reason via? no field; ignore
	void reason;
	return {success: true, workItem: updated};
}

export function handoffWork(
	workItem: WorkItem,
	from: string,
	to: string,
	capsule: unknown,
	questions: string[],
	options?: {releaseLease?: boolean},
): HandoffResult {
	if (from === to) {
		return {success: false, error: 'from and to must differ'};
	}
	let capsuleId: Ulid;
	if (typeof capsule === 'string') capsuleId = capsule;
	else if (capsule && typeof capsule === 'object' && 'id' in (capsule as Record<string, unknown>)) {
		capsuleId = String((capsule as {id: unknown}).id);
	} else {
		capsuleId = crypto.randomUUID();
	}
	const releaseLease = options?.releaseLease ?? true;
	const record = buildHandoff(workItem.id, from, to, capsuleId, questions, releaseLease);
	const updated: WorkItem = clone(workItem);
	updated.handedOff = true;
	if (updated.status === 'ready' || updated.status === 'draft') {
		updated.status = 'claimed';
	}
	updated.updatedAt = nowIso();
	return {success: true, handoff: record, workItem: updated};
}

export function resumeWork(handoff: HandoffRecord, capsule: unknown): ResumeResult {
	return resumeFromHandoff(handoff, capsule);
}