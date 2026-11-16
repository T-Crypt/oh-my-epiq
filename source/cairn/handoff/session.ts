// Session continuity. Pure logic, no I/O.

import {Ulid, Timestamp} from '../model/entities.js';

export interface SessionRecord {
	id: Ulid;
	workItemId?: Ulid;
	actorId: string;
	runtime: string;
	contextCapsuleId?: Ulid;
	startedAt: Timestamp;
	endedAt?: Timestamp;
	exitReason?: string;
}

export function buildSession(
	workItemId: Ulid | undefined,
	actorId: string,
	runtime: string,
): SessionRecord {
	return {
		id: crypto.randomUUID(),
		workItemId,
		actorId,
		runtime,
		startedAt: new Date().toISOString(),
	};
}

export function closeSession(
	record: SessionRecord,
	exitReason: string,
): SessionRecord {
	return {
		...record,
		endedAt: new Date().toISOString(),
		exitReason,
	};
}

export function canResume(session: SessionRecord, handoff: {workItemId: Ulid}): boolean {
	return session.workItemId === handoff.workItemId;
}
