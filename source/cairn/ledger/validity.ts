// Validity computation for ledger records. Pure functions.

import {LedgerRecord, provenanceRank} from './records.js';
import {ValidityState} from '../model/validity.js';
import {Timestamp} from '../model/entities.js';

export interface ValidityContext {
	now: Timestamp;
	currentFileHashes: Record<string, string>;
	recordedFileHashes: Record<string, string>;
	currentEnvFingerprint: string;
	currentBranchHead?: string;
	otherRecords?: LedgerRecord[];
	retentionDays?: number;
}

export interface ValidityResult {
	state: ValidityState;
	reason: string;
	changedPaths?: string[];
}

const MS_PER_DAY = 86400000;

function parseTime(ts: string): number {
	const n = Date.parse(ts);
	return Number.isNaN(n) ? 0 : n;
}

function newerRecord(a: LedgerRecord, b: LedgerRecord): boolean {
	return parseTime(a.endedAt) > parseTime(b.endedAt);
}

function inputsSuperset(candidate: LedgerRecord, base: LedgerRecord): boolean {
	// candidate has superset of files/symbols of base
	const baseFiles = new Set(base.files);
	const candFiles = new Set(candidate.files);
	for (const f of baseFiles) if (!candFiles.has(f)) return false;
	const baseSyms = new Set(base.symbols);
	const candSyms = new Set(candidate.symbols);
	for (const s of baseSyms) if (!candSyms.has(s)) return false;
	return true;
}

export function computeValidity(
	record: LedgerRecord,
	ctx: ValidityContext,
): ValidityResult {
	const other = ctx.otherRecords ?? [];

	// 1. File scope
	const changedPaths: string[] = [];
	for (const p of record.files) {
		const recorded = ctx.recordedFileHashes[p];
		const current = ctx.currentFileHashes[p];
		if (recorded !== undefined && current !== undefined && recorded !== current) {
			changedPaths.push(p);
		}
		if (recorded !== undefined && current === undefined) {
			changedPaths.push(p);
		}
	}
	if (changedPaths.length > 0) {
		return {state: 'stale', reason: `file changed: ${changedPaths.join(', ')}`, changedPaths};
	}

	// 2. Environment
	if (ctx.currentEnvFingerprint !== record.envFingerprint) {
		return {state: 'stale', reason: 'environment fingerprint changed'};
	}

	// 3. Revision
	if (record.baseSha && ctx.currentBranchHead && ctx.currentBranchHead !== record.baseSha) {
		// superseded if a newer record exists at the new SHA
		const successor = other.find(
			r =>
				r.id !== record.id &&
				r.scope === record.scope &&
				r.kind === record.kind &&
				r.baseSha === ctx.currentBranchHead &&
				newerRecord(r, record) &&
				provenanceRank(r.provenance) >= provenanceRank(record.provenance),
		);
		if (successor) {
			return {state: 'superseded', reason: `superseded by ${successor.id}`};
		}
		return {state: 'stale', reason: 'branch advanced past baseSha'};
	}

	// 4. Contradiction
	const contradictor = other.find(r => {
		if (r.id === record.id) return false;
		if (r.kind !== record.kind) return false;
		if (r.scope !== record.scope) return false;
		if (!newerRecord(r, record)) return false;
		if (provenanceRank(r.provenance) < provenanceRank(record.provenance)) return false;
		// conflicting result: different output digest
		if (r.outputDigest === undefined || record.outputDigest === undefined) return false;
		return r.outputDigest !== record.outputDigest;
	});
	if (contradictor) {
		return {state: 'contradicted', reason: `contradicted by ${contradictor.id}`};
	}

	// 5. Supersession
	const superseder = other.find(r => {
		if (r.id === record.id) return false;
		if (r.scope !== record.scope) return false;
		if (!newerRecord(r, record)) return false;
		if (provenanceRank(r.provenance) < provenanceRank(record.provenance)) return false;
		return inputsSuperset(r, record);
	});
	if (superseder) {
		return {state: 'superseded', reason: `superseded by ${superseder.id}`};
	}

	// 6. Retention
	if (ctx.retentionDays !== undefined) {
		const ageMs = parseTime(ctx.now) - parseTime(record.endedAt);
		if (ageMs > ctx.retentionDays * MS_PER_DAY) {
			return {state: 'unknown', reason: 'retention expired'};
		}
	}

	// unknown if inputs cannot be checked: missing file hashes for recorded files
	for (const p of record.files) {
		if (ctx.recordedFileHashes[p] === undefined || ctx.currentFileHashes[p] === undefined) {
			return {state: 'unknown', reason: `cannot check file ${p}`};
		}
	}

	return {state: 'valid', reason: 'all checks passed'};
}

export function isReusableState(state: ValidityState): boolean {
	return state === 'valid';
}