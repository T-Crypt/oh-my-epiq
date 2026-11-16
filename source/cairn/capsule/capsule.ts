// Context capsule assembler. Pure, deterministic.

import {
	Ulid,
	WorkItem,
	Objective,
	Constraint,
	AcceptanceCriterion,
	Decision,
	Discovery,
	Execution,
	Evidence,
	Verification,
} from '../model/entities.js';

export interface CapsuleDependencySummary {
	blockedBy: WorkItem[];
	blocks: WorkItem[];
}

export interface CapsuleInput {
	workItem: WorkItem;
	objective?: Objective;
	constraints: Constraint[];
	criteria: AcceptanceCriterion[];
	dependencies: CapsuleDependencySummary;
	decisions: Decision[];
	evidence: Evidence[];
	verifications: Verification[];
	attempts: Execution[];
	openQuestions: Discovery[];
	tokenBudget: number; // in characters (bytes-ish)
}

export interface CapsuleResult {
	text: string;
	bytes: number;
	omitted: string[];
	minimumSize?: number;
}

interface Section {
	name: string;
	lines: string[];
	// whether each line is "essential" (never dropped)
	essential?: boolean[];
}

function refOf(entity: {id: Ulid; ref?: string}): string {
	return (entity as {ref?: string}).ref ?? entity.id;
}

function buildSections(input: CapsuleInput): {sections: Section[]; verdictByCriterion: Map<Ulid, string>} {
	const wi = input.workItem;
	const verdictByCriterion = new Map<Ulid, string>();
	for (const c of input.criteria) {
		if (!wi.acceptanceCriteria.includes(c.id)) continue;
		const v = input.verifications.find(
			vv => vv.criterionId === c.id && vv.outcome === 'pass' && vv.freshness === 'fresh',
		);
		verdictByCriterion.set(c.id, v ? 'pass/fresh' : 'not satisfied');
	}

	// 1 Header
	const headerLines: string[] = [];
	headerLines.push(`work ref: ${wi.ref}  id: ${wi.id}`);
	headerLines.push(`title: ${wi.title}`);
	headerLines.push(`status: ${wi.status}`);
	if (input.objective) {
		headerLines.push(`objective ref: ${refOf(input.objective)}  ${input.objective.title}`);
	}
	// source refs on each line? add trailing source
	headerLines[0] = `${headerLines[0]}  [source: WorkItem:${wi.id}]`;
	// We'll append source refs uniformly below by reformatting? Instead, embed in lines now.
	// Redo cleanly:
	const h: string[] = [];
	h.push(`work ref: ${wi.ref}  id: ${wi.id}  [WorkItem:${wi.id}]`);
	h.push(`title: ${wi.title}  [WorkItem:${wi.id}]`);
	h.push(`status: ${wi.status}  [WorkItem:${wi.id}]`);
	if (input.objective) {
		h.push(`objective ref: ${input.objective.id} ${input.objective.title}  [Objective:${input.objective.id}]`);
	}

	// 2 Intent
	const intent: string[] = [];
	intent.push(`spec: ${wi.spec}  [WorkItem:${wi.id}]`);
	if (input.objective) {
		intent.push(`success measure: ${input.objective.successMeasure}  [Objective:${input.objective.id}]`);
	}

	// 3 Constraints: blocking first then advisory, each with origin
	const sortedConstraints = [...input.constraints].sort((a, b) => {
		const crit = (x: Constraint) => (x.criticality === 'blocking' ? 0 : 1);
		if (crit(a) !== crit(b)) return crit(a) - crit(b);
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
	const constraints: string[] = [];
	for (const c of sortedConstraints) {
		const isBlocking = c.criticality === 'blocking';
		const isUserOrSec = c.origin === 'user' || c.origin === 'security_policy';
		let text = c.statement;
		if (isUserOrSec) {
			text = `VERBATIM: ${c.statement}`;
		}
		constraints.push(`[${c.criticality}] ${c.origin}: ${text}  [Constraint:${c.id}]`);
		// mark essential for blocking
		void isBlocking;
	}

	// 4 Criteria
	const criteriaLines: string[] = [];
	const sortedCriteria = [...input.criteria]
		.filter(c => wi.acceptanceCriteria.includes(c.id))
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	for (const c of sortedCriteria) {
		const verdict = verdictByCriterion.get(c.id) ?? 'not satisfied';
		criteriaLines.push(`${c.statement}  -> ${verdict}  [AcceptanceCriterion:${c.id}]`);
	}

	// 5 Dependencies
	const deps: string[] = [];
	const blockedBy = [...input.dependencies.blockedBy].sort((a, b) => (a.id < b.id ? -1 : 1));
	const blocks = [...input.dependencies.blocks].sort((a, b) => (a.id < b.id ? -1 : 1));
	for (const w of blockedBy) {
		deps.push(`blocked-by: ${w.ref} ${w.title} (${w.status})  [WorkItem:${w.id}]`);
	}
	for (const w of blocks) {
		deps.push(`blocks: ${w.ref} ${w.title} (${w.status})  [WorkItem:${w.id}]`);
	}

	// 6 Decisions: accepted and superseded, one line each
	const decisionsSorted = [...input.decisions].sort((a, b) => {
		// accepted first then superseded; by id
		const rank = (d: Decision) => (d.status === 'accepted' ? 0 : d.status === 'superseded' ? 1 : 2);
		if (rank(a) !== rank(b)) return rank(a) - rank(b);
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
	const decisions: string[] = [];
	for (const d of decisionsSorted) {
		if (d.status !== 'accepted' && d.status !== 'superseded') continue;
		decisions.push(`${d.status}: ${d.title}  [Decision:${d.id}]`);
	}

	// 7 Evidence: valid only, newest first, with digest
	const evidenceSorted = [...input.evidence].sort((a, b) => {
		// newest first by createdAt? Evidence has no createdAt in base; use id? Use digest/id. We'll sort by id desc as proxy.
		return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
	});
	const evidenceLines: string[] = [];
	for (const e of evidenceSorted) {
		evidenceLines.push(`${e.kind} digest=${e.digest}  [Evidence:${e.id}]`);
	}

	// 8 Attempts: prior executions, outcome, what established
	const attemptsSorted = [...input.attempts].sort((a, b) => {
		// newest first by endedAt then id
		const ae = a.endedAt ?? '';
		const be = b.endedAt ?? '';
		if (ae !== be) return ae < be ? 1 : -1;
		return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
	});
	const attemptsLines: string[] = [];
	for (const ex of attemptsSorted) {
		attemptsLines.push(`${ex.outcome}: ${ex.summary ?? ''}  [Execution:${ex.id}]`.trim());
	}

	// 9 Open: unresolved questions and risks
	const openLines: string[] = [];
	const openSorted = [...input.openQuestions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	for (const q of openSorted) {
		openLines.push(`${q.statement}  [Discovery:${q.id}]`);
	}

	// 10 Next: suggested action, verification command (inference)
	const nextLines: string[] = [];
	nextLines.push(`suggested next action (inference): review criteria and run verification  [WorkItem:${wi.id}]`);

	const sections: Section[] = [
		{name: '1. Header', lines: h, essential: h.map(() => true)},
		{name: '2. Intent', lines: intent, essential: intent.map(() => true)},
		{name: '3. Constraints', lines: constraints, essential: constraints.map((_, i) => {
			// blocking constraints essential
			const c = sortedConstraints[i];
			return c ? c.criticality === 'blocking' : false;
		})},
		{name: '4. Criteria', lines: criteriaLines, essential: criteriaLines.map(() => true)},
		{name: '5. Dependencies', lines: deps, essential: deps.map(l => l.startsWith('blocked-by'))},
		{name: '6. Decisions', lines: decisions, essential: decisions.map(() => false)},
		{name: '7. Evidence', lines: evidenceLines, essential: evidenceLines.map(() => false)},
		{name: '8. Attempts', lines: attemptsLines, essential: attemptsLines.map(() => false)},
		{name: '9. Open', lines: openLines, essential: openLines.map(() => false)},
		{name: '10. Next', lines: nextLines, essential: nextLines.map(() => true)},
	];

	return {sections, verdictByCriterion};
}

function renderSections(sections: Section[]): string {
	const out: string[] = [];
	for (const s of sections) {
		out.push(`## ${s.name}`);
		for (const l of s.lines) out.push(l);
		out.push('');
	}
	return out.join('\n').trimEnd() + '\n';
}

function sizeOf(text: string): number {
	return text.length;
}

export function assembleCapsule(input: CapsuleInput): CapsuleResult {
	const {sections} = buildSections(input);
	const omitted: string[] = [];

	// minimum viable: header + intent + blocking constraints + criteria + active blockers + next
	const minSections: Section[] = sections.map(s => {
		if (s.name === '3. Constraints') {
			const idx = sections.indexOf(s);
			const orig = sections[idx];
			const essentialLines = (orig?.lines ?? []).filter((_, i) => orig?.essential?.[i]);
			return {...s, lines: essentialLines};
		}
		if (s.name === '5. Dependencies') {
			const essentialLines = (s.essential ? s.lines.filter((_, i) => s.essential?.[i]) : s.lines);
			return {...s, lines: essentialLines};
		}
		if (s.name === '1. Header' || s.name === '2. Intent' || s.name === '4. Criteria' || s.name === '10. Next') {
			return {...s};
		}
		return {...s, lines: []};
	});

	const minText = renderSections(minSections);
	const minSize = sizeOf(minText);

	if (input.tokenBudget < minSize) {
		return {text: minText, bytes: minSize, omitted: ['budget too small; minimum size reported'], minimumSize: minSize};
	}

	// Start with full
	let current = sections.map(s => ({...s, lines: [...s.lines], essential: s.essential ? [...s.essential] : undefined}));
	let text = renderSections(current);
	if (sizeOf(text) <= input.tokenBudget) {
		return {text, bytes: sizeOf(text), omitted};
	}

	// Omission steps in order (last dropped first):
	// 1. attempts beyond most recent two
	// 2. evidence detail below digests
	// 3. decisions superseded long ago
	// 4. non-blocking discoveries
	// 5. dependency chains beyond depth 1 (already depth 1)

	// Step 1: trim attempts to 2
	const attemptsSection = current.find(s => s.name === '8. Attempts')!;
	if (attemptsSection.lines.length > 2) {
		const dropped = attemptsSection.lines.length - 2;
		attemptsSection.lines = attemptsSection.lines.slice(0, 2);
		omitted.push(`attempts beyond most recent two (${dropped})`);
		text = renderSections(current);
		if (sizeOf(text) <= input.tokenBudget) return {text, bytes: sizeOf(text), omitted};
	}

	// Step 2: evidence detail below digests -> keep digest only (already digest-only; drop all evidence lines except? keep digests minimal: keep first? We'll drop evidence lines beyond 3)
	const evSection = current.find(s => s.name === '7. Evidence')!;
	if (evSection.lines.length > 0) {
		// compress: keep only digests (already) but drop to at most 3
		if (evSection.lines.length > 3) {
			const dropped = evSection.lines.length - 3;
			evSection.lines = evSection.lines.slice(0, 3);
			omitted.push(`evidence detail below digests (${dropped})`);
			text = renderSections(current);
			if (sizeOf(text) <= input.tokenBudget) return {text, bytes: sizeOf(text), omitted};
		}
	}

	// Step 3: decisions superseded long ago -> drop superseded
	const decSection = current.find(s => s.name === '6. Decisions')!;
	const beforeDec = decSection.lines.length;
	decSection.lines = decSection.lines.filter(l => !l.startsWith('superseded:'));
	if (decSection.lines.length < beforeDec) {
		omitted.push('decisions superseded long ago');
		text = renderSections(current);
		if (sizeOf(text) <= input.tokenBudget) return {text, bytes: sizeOf(text), omitted};
	}

	// Step 4: non-blocking discoveries -> drop non-blocking (all open lines that are not risks? We'll drop all open lines beyond 0? Keep none if needed)
	const openSection = current.find(s => s.name === '9. Open')!;
	if (openSection.lines.length > 0) {
		const dropped = openSection.lines.length;
		openSection.lines = [];
		omitted.push(`non-blocking discoveries (${dropped})`);
		text = renderSections(current);
		if (sizeOf(text) <= input.tokenBudget) return {text, bytes: sizeOf(text), omitted};
	}

	// Step 5: dependency chains beyond depth 1 already depth1; nothing.

	// If still over budget, drop non-essential lines from stable sections? But never drop blocking constraints/criteria/active blockers.
	// Drop advisory constraints
	const consSection = current.find(s => s.name === '3. Constraints')!;
	const advisoryIdx: number[] = [];
	consSection.lines.forEach((l, i) => {
		if (l.includes('[advisory]')) advisoryIdx.push(i);
	});
	if (advisoryIdx.length > 0) {
		// remove advisory lines
		consSection.lines = consSection.lines.filter(l => !l.includes('[advisory]'));
		omitted.push('advisory constraints');
		text = renderSections(current);
		if (sizeOf(text) <= input.tokenBudget) return {text, bytes: sizeOf(text), omitted};
	}

	// Last resort: report minimum size
	return {text: minText, bytes: minSize, omitted: [...omitted, 'budget insufficient; minimum size reported'], minimumSize: minSize};
}