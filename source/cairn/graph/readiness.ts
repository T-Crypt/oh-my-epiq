import {Edge} from '../model/edges.js';
import {Verification} from '../model/entities.js';
import {WorkItem} from '../model/entities.js';

export interface ReadinessResult {
	ready: boolean;
	reasons: string[];
}

export interface ReadinessInput {
	workItem: WorkItem;
	allWorkItems: WorkItem[];
	allEdges: Edge[];
	allVerifications: Verification[];
	resolvedReferences?: Set<string>;
	accessibleRepos?: Set<string>;
}

export function readiness(input: ReadinessInput): ReadinessResult {
	const {workItem, allWorkItems, allEdges, allVerifications} = input;
	const reasons: string[] = [];
	const byId = new Map(allWorkItems.map(w => [w.id, w]));

	// 1. spec or draft exemption
	if (!workItem.spec || workItem.spec.trim() === '') {
		if (!workItem.draftExemption) {
			reasons.push('missing spec');
		}
	}

	// 2. depends_on targets done (or waived)
	const deps = allEdges.filter(
		e => e.type === 'depends_on' && e.from.id === workItem.id,
	);
	for (const dep of deps) {
		const target = byId.get(dep.to.id);
		const waived = !!dep.reason && dep.reason.trim() !== '';
		if (!target) {
			reasons.push(`missing dependency ${dep.to.id}`);
			continue;
		}
		if (target.status !== 'done' && !waived) {
			reasons.push(`dependency ${target.ref ?? target.id} not done`);
		}
	}

	// 3. no open blocker edge points at it
	const blockers = allEdges.filter(
		e => e.type === 'blocks' && e.to.id === workItem.id,
	);
	for (const b of blockers) {
		const source = byId.get(b.from.id);
		const open = !source || (source.status !== 'done' && source.status !== 'cancelled');
		if (open) {
			reasons.push(`blocked by ${b.from.id}`);
		}
	}

	// 4. referenced constraints resolve (constrained_by targets existence unknown; skip if not in work items)
	// Required context: parent exists if set
	if (workItem.parentId && !byId.has(workItem.parentId)) {
		reasons.push(`missing parent ${workItem.parentId}`);
	}

	// objective exists if set? not in allWorkItems; skip

	// 7. no contradictory verification: failing fresh verification
	const criterionIds = new Set(workItem.acceptanceCriteria);
	const verifications = allVerifications.filter(v => criterionIds.has(v.criterionId));
	for (const v of verifications) {
		if (v.outcome === 'fail' && v.freshness === 'fresh') {
			reasons.push(`failing fresh verification ${v.id}`);
		}
	}

	// status cancelled
	if (workItem.status === 'cancelled') {
		reasons.push('work item cancelled');
	}

	// 6. lease policy: if claimed/in_progress must have leaseId
	if ((workItem.status === 'claimed' || workItem.status === 'in_progress') && !workItem.leaseId) {
		reasons.push('missing lease');
	}

	// 4. referenced files/decisions/constraints resolve (constrained_by targets)
	if (input.resolvedReferences) {
		const constrained = allEdges.filter(
			e => e.type === 'constrained_by' && e.from.id === workItem.id,
		);
		for (const c of constrained) {
			if (!input.resolvedReferences.has(c.to.id)) {
				reasons.push(`unresolved reference ${c.to.id}`);
			}
		}
	}

	// 5. repository access/fetchability
	if (input.accessibleRepos && workItem.repository) {
		if (!input.accessibleRepos.has(workItem.repository)) {
			reasons.push(`repository not accessible: ${workItem.repository}`);
		}
	}

	// handed off work items are not ready
	if (workItem.handedOff) {
		reasons.push('work item handed off');
	}

	return {ready: reasons.length === 0, reasons};
}