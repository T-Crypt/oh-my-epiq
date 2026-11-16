export interface ToolParam {
	name: string;
	type?: string;
	required?: boolean;
	description?: string;
}

export interface ToolInfo {
	name: string;
	oneLiner?: string;
	description: string;
	params: ToolParam[];
}

interface ToolDef {
	name: string;
	oneLiner: string;
	description: string;
	params: ToolParam[];
}

const TOOLS: ToolDef[] = [
	{
		name: 'assume_actor',
		oneLiner: 'Assume an actor identity for writes.',
		description: 'Set the active actor (provider/label@machine) before the first write.',
		params: [
			{name: 'provider', type: 'string', required: true},
			{name: 'label', type: 'string', required: true},
			{name: 'machine', type: 'string', required: true},
		],
	},
	{
		name: 'work_list',
		oneLiner: 'List work items with DQL qualifiers.',
		description: 'List work items filtered by a DQL query string.',
		params: [{name: 'query', type: 'string', required: false}],
	},
	{
		name: 'work_get',
		oneLiner: 'Get one work item.',
		description: 'Fetch a single work item by id or ref.',
		params: [{name: 'ref', type: 'string', required: true}],
	},
	{
		name: 'work_create',
		oneLiner: 'Create a work item.',
		description: 'Create a new work item.',
		params: [
			{name: 'title', type: 'string', required: true},
			{name: 'spec', type: 'string', required: false},
		],
	},
	{
		name: 'work_update',
		oneLiner: 'Update fields on a work item.',
		description: 'Update fields on an existing work item.',
		params: [{name: 'ref', type: 'string', required: true}],
	},
	{
		name: 'work_ready',
		oneLiner: 'List ready work items.',
		description: 'List work items in ready state.',
		params: [{name: 'assignee', type: 'string', required: false}],
	},
	{
		name: 'work_block',
		oneLiner: 'Mark a work item blocked by another.',
		description: 'Add a depends_on edge between two work items.',
		params: [
			{name: 'ref', type: 'string', required: true},
			{name: 'blocker', type: 'string', required: true},
		],
	},
	{
		name: 'work_unblock',
		oneLiner: 'Remove a block edge.',
		description: 'Remove a depends_on edge between two work items.',
		params: [
			{name: 'ref', type: 'string', required: true},
			{name: 'blocker', type: 'string', required: true},
		],
	},
	{
		name: 'work_cancel',
		oneLiner: 'Cancel a work item.',
		description: 'Cancel a work item with an optional reason.',
		params: [
			{name: 'ref', type: 'string', required: true},
			{name: 'reason', type: 'string', required: false},
		],
	},
	{
		name: 'work_claim',
		oneLiner: 'Claim a work item lease.',
		description: 'Claim a lease on a work item.',
		params: [{name: 'ref', type: 'string', required: true}],
	},
	{
		name: 'work_release',
		oneLiner: 'Release a work item lease.',
		description: 'Release a lease on a work item.',
		params: [{name: 'ref', type: 'string', required: true}],
	},
	{
		name: 'work_handoff',
		oneLiner: 'Hand off a work item to another actor.',
		description: 'Hand off a work item lease to another actor.',
		params: [
			{name: 'ref', type: 'string', required: true},
			{name: 'to', type: 'string', required: true},
		],
	},
	{
		name: 'lease_show',
		oneLiner: 'Show a lease.',
		description: 'Show lease details for a work item.',
		params: [{name: 'ref', type: 'string', required: true}],
	},
	{
		name: 'ledger_show',
		oneLiner: 'Show ledger observations.',
		description: 'Show observations for a work item.',
		params: [{name: 'ref', type: 'string', required: true}],
	},
	{
		name: 'ledger_record',
		oneLiner: 'Record a ledger observation.',
		description: 'Record a new observation in the ledger.',
		params: [{name: 'kind', type: 'string', required: true}],
	},
	{
		name: 'capsule',
		oneLiner: 'Assemble a context capsule.',
		description: 'Assemble a context capsule for a work item.',
		params: [
			{name: 'ref', type: 'string', required: true},
			{name: 'budget', type: 'number', required: true},
		],
	},
	{
		name: 'evidence_show',
		oneLiner: 'Show evidence.',
		description: 'Show an evidence record by id.',
		params: [{name: 'id', type: 'string', required: true}],
	},
	{
		name: 'verify',
		oneLiner: 'Verify a criterion.',
		description: 'Verify an acceptance criterion with evidence.',
		params: [
			{name: 'ref', type: 'string', required: true},
			{name: 'criterion', type: 'string', required: true},
		],
	},
	{
		name: 'decision_add',
		oneLiner: 'Add a decision.',
		description: 'Add a decision record.',
		params: [{name: 'title', type: 'string', required: true}],
	},
	{
		name: 'constraint_add',
		oneLiner: 'Add a constraint.',
		description: 'Add a constraint record.',
		params: [{name: 'statement', type: 'string', required: true}],
	},
	{
		name: 'objective_list',
		oneLiner: 'List objectives.',
		description: 'List all objectives.',
		params: [],
	},
	{
		name: 'objective_get',
		oneLiner: 'Get an objective.',
		description: 'Fetch an objective by id or ref.',
		params: [{name: 'ref', type: 'string', required: true}],
	},
	{
		name: 'objective_create',
		oneLiner: 'Create an objective.',
		description: 'Create a new objective.',
		params: [{name: 'title', type: 'string', required: true}],
	},
	{
		name: 'sync',
		oneLiner: 'Sync with remote.',
		description: 'Sync state with the remote.',
		params: [{name: 'dryRun', type: 'boolean', required: false}],
	},
	{
		name: 'doctor',
		oneLiner: 'Run diagnostics.',
		description: 'Run diagnostic checks on the board.',
		params: [],
	},
	{
		name: 'discover',
		oneLiner: 'Discover available tools.',
		description: 'List tool names with one-liners.',
		params: [],
	},
	{
		name: 'get_info',
		oneLiner: 'Get full tool info.',
		description: 'Get full parameter detail for one tool.',
		params: [{name: 'name', type: 'string', required: true}],
	},
	{
		name: 'skill_install',
		oneLiner: 'Install a skill.',
		description: 'Install a skill into the client.',
		params: [],
	},
];

export function discoverTools(): {name: string; oneLiner: string}[] {
	return TOOLS.map((t) => ({name: t.name, oneLiner: t.oneLiner}));
}

export function getToolInfo(name: string): ToolInfo | null {
	const t = TOOLS.find((x) => x.name === name);
	if (!t) return null;
	return {name: t.name, oneLiner: t.oneLiner, description: t.description, params: t.params};
}
