// Typed edges. No generic edge type.

export type EntityType =
	| 'Objective'
	| 'WorkItem'
	| 'AcceptanceCriterion'
	| 'Decision'
	| 'Constraint'
	| 'Discovery'
	| 'Observation'
	| 'Execution'
	| 'Evidence'
	| 'Verification'
	| 'Artifact'
	| 'AgentIdentity'
	| 'Session'
	| 'Workspace'
	| 'Lease'
	| 'Project'
	| 'Tag'
	| 'Contributor'
	| 'file'
	| 'symbol';

export type EdgeType =
	| 'depends_on'
	| 'blocks'
	| 'parent_of'
	| 'implements'
	| 'supersedes'
	| 'constrained_by'
	| 'satisfies'
	| 'produced_by'
	| 'observed_in'
	| 'claimed_by'
	| 'handed_off_to'
	| 'reviewed_by'
	| 'touches';

export interface NodeRef {
	type: EntityType;
	id: string;
}

export interface Edge {
	from: NodeRef;
	to: NodeRef;
	type: EdgeType;
	author: string;
	timestamp: string;
	reason?: string;
}

export interface EdgeEndpointRule {
	from: EntityType[];
	to: EntityType[];
}

export const EDGE_RULES: Record<EdgeType, EdgeEndpointRule> = {
	depends_on: {from: ['WorkItem'], to: ['WorkItem']},
	blocks: {from: ['WorkItem'], to: ['WorkItem']},
	parent_of: {from: ['WorkItem'], to: ['WorkItem']},
	implements: {from: ['WorkItem'], to: ['Objective']},
	supersedes: {from: ['Decision'], to: ['Decision']},
	constrained_by: {from: ['WorkItem'], to: ['Constraint']},
	satisfies: {from: ['Verification'], to: ['AcceptanceCriterion']},
	produced_by: {from: ['Evidence'], to: ['Execution']},
	observed_in: {from: ['Observation'], to: ['WorkItem']},
	claimed_by: {from: ['WorkItem'], to: ['Lease']},
	handed_off_to: {from: ['WorkItem'], to: ['AgentIdentity']},
	reviewed_by: {from: ['WorkItem'], to: ['Contributor']},
	touches: {from: ['Execution'], to: ['file', 'symbol']},
};

export function validateEdge(edge: Edge): {valid: boolean; reason?: string} {
	const rule = EDGE_RULES[edge.type];
	if (!rule) {
		return {valid: false, reason: `unknown edge type ${edge.type}`};
	}
	if (!rule.from.includes(edge.from.type)) {
		return {
			valid: false,
			reason: `${edge.type} cannot originate from ${edge.from.type}`,
		};
	}
	if (!rule.to.includes(edge.to.type)) {
		return {
			valid: false,
			reason: `${edge.type} cannot target ${edge.to.type}`,
		};
	}
	if (!edge.author) {
		return {valid: false, reason: 'edge requires an author'};
	}
	if (!edge.timestamp) {
		return {valid: false, reason: 'edge requires a timestamp'};
	}
	return {valid: true};
}