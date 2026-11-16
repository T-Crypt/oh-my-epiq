// Execution ledger records. Pure types and builders; no I/O.

import {Ulid, Timestamp} from '../model/entities.js';
import {ValidityState} from '../model/validity.js';

export type LedgerAction =
	| 'exec.observed'
	| 'exec.ran'
	| 'exec.changed'
	| 'exec.attempted'
	| 'exec.discovered'
	| 'exec.verified';

export type Provenance = 'observed' | 'derived' | 'inferred';

export interface LedgerRecord {
	id: Ulid;
	kind: LedgerAction;
	actorId: string;
	sessionId?: Ulid;
	workspaceId?: Ulid;
	repository: string;
	branch?: string;
	baseSha?: string;
	startedAt: Timestamp;
	endedAt: Timestamp;
	exitCode?: number;
	command?: string;
	args?: string;
	envFingerprint: string;
	inputDigest: string;
	outputDigest?: string;
	files: string[];
	symbols: string[];
	scope?: string;
	workItemId?: Ulid;
	criterionId?: Ulid;
	provenance: Provenance;
	confidence?: number;
	derivedInputs?: Ulid[];
	validity: ValidityState;
}

export interface RecordInput {
	id: Ulid;
	actorId: string;
	sessionId?: Ulid;
	workspaceId?: Ulid;
	repository: string;
	branch?: string;
	baseSha?: string;
	startedAt: Timestamp;
	endedAt: Timestamp;
	exitCode?: number;
	command?: string;
	args?: string;
	envFingerprint: string;
	inputDigest: string;
	outputDigest?: string;
	files?: string[];
	symbols?: string[];
	scope?: string;
	workItemId?: Ulid;
	criterionId?: Ulid;
	provenance: Provenance;
	confidence?: number;
	derivedInputs?: Ulid[];
}

const PROVENANCE_RANK: Record<Provenance, number> = {
	observed: 3,
	derived: 2,
	inferred: 1,
};

export function provenanceRank(p: Provenance): number {
	return PROVENANCE_RANK[p];
}

export function validateProvenance(
	kind: LedgerAction,
	input: RecordInput,
): string[] {
	const errors: string[] = [];
	if (input.provenance !== 'observed' && input.confidence === undefined) {
		errors.push('confidence required when provenance is not observed');
	}
	if (
		input.provenance !== 'observed' &&
		(input.confidence === undefined ||
			input.confidence < 0 ||
			input.confidence > 1)
	) {
		errors.push('confidence must be between 0 and 1');
	}
	if (input.provenance === 'derived') {
		if (!input.derivedInputs || input.derivedInputs.length === 0) {
			errors.push('derived records must name their inputs by id');
		}
	}
	if (input.provenance === 'observed') {
		const hasRead =
			(input.command !== undefined && input.command.trim() !== '') ||
			(input.files !== undefined && input.files.length > 0);
		if (!hasRead) {
			errors.push('observed provenance requires a real command or read');
		}
	}
	if (kind === 'exec.observed') {
		const hasRead =
			(input.command !== undefined && input.command.trim() !== '') ||
			(input.files !== undefined && input.files.length > 0);
		if (!hasRead) {
			errors.push('exec.observed requires a command or files read');
		}
	}
	if (input.startedAt > input.endedAt) {
		errors.push('startedAt must not be after endedAt');
	}
	return errors;
}

export function buildRecord(
	kind: LedgerAction,
	input: RecordInput,
): LedgerRecord {
	const errors = validateProvenance(kind, input);
	if (errors.length > 0) {
		throw new Error(errors.join('; '));
	}
	return {
		id: input.id,
		kind,
		actorId: input.actorId,
		sessionId: input.sessionId,
		workspaceId: input.workspaceId,
		repository: input.repository,
		branch: input.branch,
		baseSha: input.baseSha,
		startedAt: input.startedAt,
		endedAt: input.endedAt,
		exitCode: input.exitCode,
		command: input.command,
		args: input.args,
		envFingerprint: input.envFingerprint,
		inputDigest: input.inputDigest,
		outputDigest: input.outputDigest,
		files: input.files ?? [],
		symbols: input.symbols ?? [],
		scope: input.scope,
		workItemId: input.workItemId,
		criterionId: input.criterionId,
		provenance: input.provenance,
		confidence: input.confidence,
		derivedInputs: input.derivedInputs,
		validity: 'unverified',
	};
}

export function buildObserved(input: RecordInput): LedgerRecord {
	return buildRecord('exec.observed', input);
}

export function buildRan(input: RecordInput): LedgerRecord {
	return buildRecord('exec.ran', input);
}

export function buildChanged(input: RecordInput): LedgerRecord {
	return buildRecord('exec.changed', input);
}

export function buildAttempted(input: RecordInput): LedgerRecord {
	return buildRecord('exec.attempted', input);
}

export function buildDiscovered(input: RecordInput): LedgerRecord {
	return buildRecord('exec.discovered', input);
}

export function buildVerified(input: RecordInput): LedgerRecord {
	return buildRecord('exec.verified', input);
}

export const LEDGER_BUILDERS = {
	'exec.observed': buildObserved,
	'exec.ran': buildRan,
	'exec.changed': buildChanged,
	'exec.attempted': buildAttempted,
	'exec.discovered': buildDiscovered,
	'exec.verified': buildVerified,
} as const;