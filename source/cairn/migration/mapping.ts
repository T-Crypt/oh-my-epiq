// Pure data transformation from OME-shaped records into the new model.
// No I/O, no commits.

import {WorkItem, Tag, Contributor, Objective, Artifact} from '../model/entities.js';
import {LedgerRecord} from '../ledger/records.js';
import {buildAttempted, buildChanged, buildDiscovered} from '../ledger/records.js';

// --- OME-shaped input types ---

export interface OmeTicket {
	id: string;
	title: string;
	description?: string;
	ref?: string;
	assignees?: string[];
	tags?: string[];
	closed?: boolean;
	createdAt?: string;
	updatedAt?: string;
	repository?: string;
}

export interface OmeTag {
	id: string;
	name: string;
	color?: string;
	tombstoned?: boolean;
}

export interface OmeContributor {
	id: string;
	name: string;
	kind?: 'person' | 'agent';
	tombstoned?: boolean;
}

export interface OmeComment {
	id: string;
	issue: string;
	author: string;
	md: string;
	createdAt?: string;
	repository?: string;
	envFingerprint?: string;
	inputDigest?: string;
}

export interface OmeNote {
	id: string;
	issue: string;
	author: string;
	md: string;
	factual?: boolean;
	createdAt?: string;
	repository?: string;
	envFingerprint?: string;
	inputDigest?: string;
}

export interface OmeCommitLink {
	id: string;
	issue: string;
	sha: string;
	digest?: string;
	createdAt?: string;
	repository?: string;
	envFingerprint?: string;
	inputDigest?: string;
}

export interface OmeAttachment {
	id: string;
	issue: string;
	author: string;
	hash: string;
	ext: string;
	name: string;
	bytes: number;
}

export interface OmeGoal {
	id: string;
	title: string;
	description?: string;
	owner?: string;
	successMeasure?: string;
	status?: Objective['status'];
	createdAt?: string;
	updatedAt?: string;
}

export interface OmeConnectedRepo {
	repository: string;
	branch: string;
	baseSha?: string;
}

export interface OmeEvent {
	id: string;
	[key: string]: unknown;
}

// --- helpers ---

const CRITERIA_LABEL = /^(#{1,6}\s*)?(acceptance criteria|acceptance criterion|criteria|ac)\s*:?\s*$/i;
const CHECKBOX = /^\s*[-*]\s*\[[ xX]\]\s*.+/;

function splitCriteria(description: string): {spec: string; criteria: string[]} {
	const lines = description.split(/\r?\n/);
	const criteria: string[] = [];
	const specLines: string[] = [];
	let inCriteria = false;
	for (const line of lines) {
		if (CRITERIA_LABEL.test(line.trim())) {
			inCriteria = true;
			continue;
		}
		if (inCriteria) {
			const trimmed = line.trim();
			if (trimmed === '') {
				inCriteria = false;
				specLines.push(line);
				continue;
			}
			criteria.push(trimmed.replace(/^[-*]\s*/, ''));
			continue;
		}
		if (CHECKBOX.test(line)) {
			criteria.push(line.trim().replace(/^\s*[-*]\s*\[[ xX]\]\s*/, ''));
			continue;
		}
		specLines.push(line);
	}
	if (criteria.length === 0) {
		return {spec: description, criteria: []};
	}
	const spec = specLines.join('\n').trim();
	return {spec: spec.length > 0 ? spec : description, criteria};
}

function hasCriteriaMarkers(description: string): boolean {
	const lines = description.split(/\r?\n/);
	return lines.some(l => CRITERIA_LABEL.test(l.trim()) || CHECKBOX.test(l));
}

// --- mappers ---

export function mapTicketToWorkItem(omeTicket: OmeTicket): WorkItem {
	const now = omeTicket.createdAt ?? '';
	const description = omeTicket.description ?? '';
	let spec = description;
	let criteriaFound = false;
	if (hasCriteriaMarkers(description)) {
		const result = splitCriteria(description);
		if (result.criteria.length > 0) {
			spec = result.spec;
			criteriaFound = true;
		}
	}
	// criteria split tracked via fidelity; acceptanceCriteria ids left empty
	// (criteria entities are created by a separate pass).
	void criteriaFound;
	const ref = omeTicket.ref ?? omeTicket.id.slice(-7).toUpperCase();
	const status: WorkItem['status'] = omeTicket.closed ? 'cancelled' : 'ready';
	return {
		id: omeTicket.id,
		ref,
		title: omeTicket.title,
		spec,
		priority: 0,
		status,
		tags: omeTicket.tags ?? [],
		acceptanceCriteria: [],
		blockedBy: [],
		createdAt: now,
		updatedAt: omeTicket.updatedAt ?? now,
	};
}

export function mapTagToTag(omeTag: OmeTag): Tag {
	return {
		id: omeTag.id,
		name: omeTag.name,
		color: omeTag.color ?? '',
	};
}

export function mapContributorToContributor(omeContributor: OmeContributor): Contributor {
	return {
		id: omeContributor.id,
		name: omeContributor.name,
		kind: omeContributor.kind ?? 'person',
	};
}

function baseLedgerFields(ome: {repository?: string; envFingerprint?: string; inputDigest?: string; createdAt?: string}) {
	const ts = ome.createdAt ?? '';
	return {
		repository: ome.repository ?? '',
		envFingerprint: ome.envFingerprint ?? '',
		inputDigest: ome.inputDigest ?? '',
		startedAt: ts,
		endedAt: ts,
	};
}

export function mapCommentToLedgerRecord(omeComment: OmeComment): LedgerRecord {
	const base = baseLedgerFields(omeComment);
	return buildAttempted({
		id: omeComment.id,
		actorId: omeComment.author,
		repository: base.repository,
		startedAt: base.startedAt,
		endedAt: base.endedAt,
		envFingerprint: base.envFingerprint,
		inputDigest: base.inputDigest,
		workItemId: omeComment.issue,
		provenance: 'inferred',
		confidence: 0.5,
	});
}

export function mapNoteToLedgerRecord(omeNote: OmeNote): LedgerRecord {
	const base = baseLedgerFields(omeNote);
	if (omeNote.factual) {
		return buildDiscovered({
			id: omeNote.id,
			actorId: omeNote.author,
			repository: base.repository,
			startedAt: base.startedAt,
			endedAt: base.endedAt,
			envFingerprint: base.envFingerprint,
			inputDigest: base.inputDigest,
			workItemId: omeNote.issue,
			provenance: 'inferred',
			confidence: 0.5,
		});
	}
	return buildAttempted({
		id: omeNote.id,
		actorId: omeNote.author,
		repository: base.repository,
		startedAt: base.startedAt,
		endedAt: base.endedAt,
		envFingerprint: base.envFingerprint,
		inputDigest: base.inputDigest,
		workItemId: omeNote.issue,
		provenance: 'inferred',
		confidence: 0.5,
	});
}

export function mapCommitLinkToLedgerRecord(omeCommitLink: OmeCommitLink): LedgerRecord {
	const base = baseLedgerFields(omeCommitLink);
	return buildChanged({
		id: omeCommitLink.id,
		actorId: '',
		repository: base.repository,
		startedAt: base.startedAt,
		endedAt: base.endedAt,
		envFingerprint: base.envFingerprint,
		inputDigest: base.inputDigest,
		baseSha: omeCommitLink.sha,
		outputDigest: omeCommitLink.digest,
		workItemId: omeCommitLink.issue,
		provenance: 'observed',
		command: 'git commit',
	});
}

export function mapAttachmentToArtifact(omeAttachment: OmeAttachment): Artifact {
	return {
		id: omeAttachment.id,
		kind: omeAttachment.ext,
		location: omeAttachment.hash,
		digest: omeAttachment.hash,
		sizeBytes: omeAttachment.bytes,
		retention: 'keep',
	};
}

export function mapGoalToObjective(omeGoal: OmeGoal): Objective {
	const now = omeGoal.createdAt ?? '';
	return {
		id: omeGoal.id,
		title: omeGoal.title,
		description: omeGoal.description ?? '',
		owner: omeGoal.owner ?? '',
		successMeasure: omeGoal.successMeasure ?? '',
		status: omeGoal.status ?? 'proposed',
		createdAt: now,
		updatedAt: omeGoal.updatedAt ?? now,
	};
}

export function mapConnectedRepoToProjectRemote(omeRepo: OmeConnectedRepo): {repository: string; branch: string; baseSha: string} {
	return {
		repository: omeRepo.repository,
		branch: omeRepo.branch,
		baseSha: omeRepo.baseSha ?? '',
	};
}

export function dedupeEventsById(events: OmeEvent[]): OmeEvent[] {
	const seen = new Set<string>();
	const out: OmeEvent[] = [];
	for (const e of events) {
		if (seen.has(e.id)) continue;
		seen.add(e.id);
		out.push(e);
	}
	return out;
}

// helper exported for fidelity counting
export function ticketHadCriteriaSplit(omeTicket: OmeTicket): boolean {
	const description = omeTicket.description ?? '';
	if (!hasCriteriaMarkers(description)) return false;
	return splitCriteria(description).criteria.length > 0;
}
