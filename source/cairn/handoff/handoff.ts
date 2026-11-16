// Handoff protocol. Pure logic, no I/O.

import {Ulid, Timestamp} from '../model/entities.js';

export type HandoffState = 'pending' | 'accepted' | 'rejected';

export interface HandoffRecord {
	id: Ulid;
	workItemId: Ulid;
	fromActorId: string;
	toActorId: string;
	capsuleId: Ulid;
	unresolvedQuestions: string[];
	releaseLease: boolean;
	createdAt: Timestamp;
	acceptedAt?: Timestamp;
	state: HandoffState;
	reason?: string;
	rejectionReason?: string;
}

export function buildHandoff(
	workItemId: Ulid,
	from: string,
	to: string,
	capsuleId: Ulid,
	questions: string[],
	releaseLease: boolean,
): HandoffRecord {
	return {
		id: crypto.randomUUID(),
		workItemId,
		fromActorId: from,
		toActorId: to,
		capsuleId,
		unresolvedQuestions: [...questions],
		releaseLease,
		createdAt: new Date().toISOString(),
		state: 'pending',
	};
}

export function acceptHandoff(
	record: HandoffRecord,
	receiverActorId: string,
): HandoffRecord {
	if (receiverActorId !== record.toActorId) {
		throw new Error(
			`receiver ${receiverActorId} does not match handoff target ${record.toActorId}`,
		);
	}
	return {
		...record,
		state: 'accepted',
		acceptedAt: new Date().toISOString(),
	};
}

export function rejectHandoff(
	record: HandoffRecord,
	reason: string,
): HandoffRecord {
	return {
		...record,
		state: 'rejected',
		reason,
		rejectionReason: reason,
	};
}

export interface ResumeResult {
	workItemId: Ulid;
	capsule: unknown;
	openQuestions: string[];
	leaseReleased: boolean;
}

export function resumeFromHandoff(
	record: HandoffRecord,
	capsule: unknown,
): ResumeResult {
	return {
		workItemId: record.workItemId,
		capsule,
		openQuestions: [...record.unresolvedQuestions],
		leaseReleased: record.releaseLease,
	};
}
