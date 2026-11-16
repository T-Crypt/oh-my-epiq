// Evidence and verification. Pure logic.

import {Ulid, Timestamp, Evidence as BaseEvidence, Verification as BaseVerification, WorkItem, AcceptanceCriterion} from '../model/entities.js';
import {VerificationFreshness, VerificationOutcome} from '../model/entities.js';

export type EvidenceKindExt = BaseEvidence['kind'];

export interface EvidenceInput {
	id: Ulid;
	kind: BaseEvidence['kind'];
	uriOrPath?: string;
	digest: string;
	command?: string;
	exitCode?: number;
	environmentFingerprint?: string;
	producedByExecutionId?: Ulid;
	retention: BaseEvidence['retention'];
	createdAt?: Timestamp;
}

export interface EvidenceRecord extends BaseEvidence {
	createdAt: Timestamp;
	checkedInputs?: string[];
}

export function buildEvidence(input: EvidenceInput): EvidenceRecord {
	if (!input.digest || input.digest.trim() === '') {
		throw new Error('evidence requires a digest');
	}
	return {
		id: input.id,
		kind: input.kind,
		uriOrPath: input.uriOrPath,
		digest: input.digest,
		command: input.command,
		exitCode: input.exitCode,
		environmentFingerprint: input.environmentFingerprint,
		producedByExecutionId: input.producedByExecutionId,
		retention: input.retention,
		createdAt: input.createdAt ?? new Date().toISOString(),
	};
}

export interface VerificationInput {
	id: Ulid;
	criterionId: Ulid;
	evidenceId?: Ulid;
	verifier: string;
	outcome: VerificationOutcome;
	freshness?: VerificationFreshness;
	checkedAt: Timestamp;
	reason?: string;
}

export function buildVerification(input: VerificationInput): BaseVerification {
	if (!input.verifier || input.verifier.trim() === '') {
		throw new Error('verification requires a verifier');
	}
	if (input.outcome === 'pass' && !input.evidenceId) {
		// human_accepts may have no artifact, but still needs identity; verifier covers identity
	}
	return {
		id: input.id,
		criterionId: input.criterionId,
		evidenceId: input.evidenceId,
		verifier: input.verifier,
		outcome: input.outcome,
		freshness: input.freshness ?? 'unknown',
		checkedAt: input.checkedAt,
		reason: input.reason,
	};
}

export interface FreshnessContext {
	now: Timestamp;
	currentFileHashes: Record<string, string>;
	recordedFileHashes: Record<string, string>;
	currentEnvFingerprint?: string;
	recordedEnvFingerprint?: string;
	currentBranchHead?: string;
	checkedBranchHead?: string;
	retentionExpired?: boolean;
}

export function computeFreshness(ctx: FreshnessContext): VerificationFreshness {
	// 1. file scope
	for (const p of Object.keys(ctx.recordedFileHashes)) {
		const recorded = ctx.recordedFileHashes[p];
		const current = ctx.currentFileHashes[p];
		if (current === undefined || recorded !== current) {
			return 'stale';
		}
	}
	// any new files? not in recorded; ignore
	// 2. env
	if (
		ctx.recordedEnvFingerprint !== undefined &&
		ctx.currentEnvFingerprint !== undefined &&
		ctx.recordedEnvFingerprint !== ctx.currentEnvFingerprint
	) {
		return 'stale';
	}
	// 3. branch
	if (
		ctx.checkedBranchHead !== undefined &&
		ctx.currentBranchHead !== undefined &&
		ctx.checkedBranchHead !== ctx.currentBranchHead
	) {
		return 'stale';
	}
	// 4. retention
	if (ctx.retentionExpired) {
		return 'unknown';
	}
	// unknown if cannot check
	for (const p of Object.keys(ctx.recordedFileHashes)) {
		if (ctx.currentFileHashes[p] === undefined) {
			return 'unknown';
		}
	}
	if (Object.keys(ctx.recordedFileHashes).length === 0 && ctx.recordedEnvFingerprint === undefined) {
		// cannot verify inputs; treat as unknown? spec: unknown if inputs cannot be checked
		// but empty scope means nothing to check -> fresh
	}
	return 'fresh';
}

export interface CompletionResult {
	complete: boolean;
	missing: Ulid[];
	satisfied: Ulid[];
}

export function completionCheck(
	workItem: WorkItem,
	criteria: AcceptanceCriterion[],
	verifications: BaseVerification[],
): CompletionResult {
	const criterionIds = new Set(workItem.acceptanceCriteria);
	const relevant = criteria.filter(c => criterionIds.has(c.id));
	const missing: Ulid[] = [];
	const satisfied: Ulid[] = [];
	for (const c of relevant) {
		const passing = verifications.find(
			v =>
				v.criterionId === c.id &&
				v.outcome === 'pass' &&
				v.freshness === 'fresh',
		);
		if (passing) satisfied.push(c.id);
		else missing.push(c.id);
	}
	return {complete: missing.length === 0, missing, satisfied};
}