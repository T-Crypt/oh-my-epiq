// MCP tool definitions as a typed registry. Pure logic, no I/O.

export interface ToolParam {
	name: string;
	type: string;
	required?: boolean;
	description?: string;
}

export interface ToolDef {
	name: string;
	group: string;
	oneLiner: string;
	description: string;
	params: ToolParam[];
	returns: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

const TOOLS: ToolDef[] = [
	// Identity
	{
		name: 'assume_actor',
		group: 'identity',
		oneLiner: 'Assume an actor identity before writing.',
		description: 'Set the active actor (provider/label@machine). Must be called before the first write.',
		params: [
			{name: 'provider', type: 'string', required: true},
			{name: 'label', type: 'string', required: true},
			{name: 'machine', type: 'string', required: true},
		],
		returns: 'actor identity',
	},
	// Work
	{
		name: 'work_list',
		group: 'work',
		oneLiner: 'List work items with optional DQL query.',
		description: 'List work items. Accepts a DQL-style query string.',
		params: [{name: 'query', type: 'string', required: false}],
		returns: 'list of work items',
	},
	{
		name: 'work_get',
		group: 'work',
		oneLiner: 'Get a work item by id or ref.',
		description: 'Fetch a single work item.',
		params: [{name: 'id', type: 'string', required: true}],
		returns: 'work item',
	},
	{
		name: 'work_create',
		group: 'work',
		oneLiner: 'Create a new work item.',
		description: 'Create a work item with intent and acceptance criteria.',
		params: [
			{name: 'title', type: 'string', required: true},
			{name: 'spec', type: 'string', required: true},
		],
		returns: 'work item',
	},
	{
		name: 'work_update',
		group: 'work',
		oneLiner: 'Update a work item.',
		description: 'Update fields of a work item.',
		params: [{name: 'id', type: 'string', required: true}],
		returns: 'work item',
	},
	{
		name: 'work_ready',
		group: 'work',
		oneLiner: 'List ready work items.',
		description: 'Named first-class tool returning ready work.',
		params: [],
		returns: 'list of work items',
	},
	{
		name: 'work_block',
		group: 'work',
		oneLiner: 'Block a work item.',
		description: 'Mark a work item as blocked by another.',
		params: [
			{name: 'id', type: 'string', required: true},
			{name: 'blockerId', type: 'string', required: true},
		],
		returns: 'work item',
	},
	{
		name: 'work_unblock',
		group: 'work',
		oneLiner: 'Unblock a work item.',
		description: 'Remove a blocker from a work item.',
		params: [
			{name: 'id', type: 'string', required: true},
			{name: 'blockerId', type: 'string', required: true},
		],
		returns: 'work item',
	},
	{
		name: 'work_cancel',
		group: 'work',
		oneLiner: 'Cancel a work item.',
		description: 'Cancel a work item.',
		params: [{name: 'id', type: 'string', required: true}],
		returns: 'work item',
	},
	// Leases
	{
		name: 'work_claim',
		group: 'leases',
		oneLiner: 'Claim a work item lease.',
		description: 'Atomically acquire a lease on a work item.',
		params: [
			{name: 'workItemId', type: 'string', required: true},
			{name: 'actor', type: 'string', required: true},
		],
		returns: 'lease',
	},
	{
		name: 'work_release',
		group: 'leases',
		oneLiner: 'Release a work item lease.',
		description: 'Release a held lease.',
		params: [
			{name: 'leaseId', type: 'string', required: true},
			{name: 'actor', type: 'string', required: true},
		],
		returns: 'lease',
	},
	{
		name: 'work_handoff',
		group: 'leases',
		oneLiner: 'Hand off a work item to another actor.',
		description: 'Create a handoff record with capsule and questions.',
		params: [
			{name: 'workItemId', type: 'string', required: true},
			{name: 'to', type: 'string', required: true},
		],
		returns: 'handoff',
	},
	{
		name: 'lease_show',
		group: 'leases',
		oneLiner: 'Show lease details.',
		description: 'Display a lease.',
		params: [{name: 'leaseId', type: 'string', required: true}],
		returns: 'lease',
	},
	// Ledger
	{
		name: 'ledger_show',
		group: 'ledger',
		oneLiner: 'Show the execution ledger.',
		description: 'Display ledger entries for a work item.',
		params: [{name: 'workItemId', type: 'string', required: false}],
		returns: 'ledger entries',
	},
	{
		name: 'ledger_record',
		group: 'ledger',
		oneLiner: 'Record a ledger entry.',
		description: 'Append an execution record.',
		params: [{name: 'workItemId', type: 'string', required: true}],
		returns: 'ledger entry',
	},
	{
		name: 'capsule',
		group: 'ledger',
		oneLiner: 'Assemble a context capsule.',
		description: 'Build a context capsule for a work item.',
		params: [{name: 'workItemId', type: 'string', required: true}],
		returns: 'capsule',
	},
	// Evidence
	{
		name: 'evidence_show',
		group: 'evidence',
		oneLiner: 'Show evidence for a work item.',
		description: 'Display evidence records.',
		params: [{name: 'workItemId', type: 'string', required: false}],
		returns: 'evidence',
	},
	{
		name: 'verify',
		group: 'evidence',
		oneLiner: 'Run verification against criteria.',
		description: 'Verify acceptance criteria.',
		params: [{name: 'workItemId', type: 'string', required: true}],
		returns: 'verification result',
	},
	// Decisions
	{
		name: 'decision_add',
		group: 'decisions',
		oneLiner: 'Add a decision.',
		description: 'Record a decision.',
		params: [{name: 'title', type: 'string', required: true}],
		returns: 'decision',
	},
	{
		name: 'constraint_add',
		group: 'decisions',
		oneLiner: 'Add a constraint.',
		description: 'Record a constraint.',
		params: [{name: 'statement', type: 'string', required: true}],
		returns: 'constraint',
	},
	// Objectives
	{
		name: 'objective_list',
		group: 'objectives',
		oneLiner: 'List objectives.',
		description: 'List objectives.',
		params: [],
		returns: 'list of objectives',
	},
	{
		name: 'objective_get',
		group: 'objectives',
		oneLiner: 'Get an objective.',
		description: 'Fetch an objective.',
		params: [{name: 'id', type: 'string', required: true}],
		returns: 'objective',
	},
	{
		name: 'objective_create',
		group: 'objectives',
		oneLiner: 'Create an objective.',
		description: 'Create an objective.',
		params: [{name: 'title', type: 'string', required: true}],
		returns: 'objective',
	},
	// Sync
	{
		name: 'sync',
		group: 'sync',
		oneLiner: 'Sync state.',
		description: 'Sync the state branch.',
		params: [],
		returns: 'sync result',
	},
	{
		name: 'doctor',
		group: 'sync',
		oneLiner: 'Run diagnostics.',
		description: 'Run doctor checks.',
		params: [],
		returns: 'diagnostics',
	},
	// Discovery
	{
		name: 'discover',
		group: 'discovery',
		oneLiner: 'Discover available tools.',
		description: 'List tool names and one-liners.',
		params: [],
		returns: 'tool list',
	},
	{
		name: 'get_info',
		group: 'discovery',
		oneLiner: 'Get full info for a tool.',
		description: 'Full parameter detail for one tool.',
		params: [{name: 'name', type: 'string', required: true}],
		returns: 'tool definition',
	},
	{
		name: 'skill_install',
		group: 'discovery',
		oneLiner: 'Install a skill.',
		description: 'Install a skill.',
		params: [{name: 'name', type: 'string', required: true}],
		returns: 'result',
	},
];

export function toolDefs(): ToolDef[] {
	return TOOLS.map(t => ({...t, params: t.params.map(p => ({...p}))}));
}

export function toolNames(): string[] {
	return TOOLS.map(t => t.name).sort();
}

export function getTool(name: string): ToolDef | undefined {
	return TOOLS.find(t => t.name === name);
}

function typeMatches(value: unknown, type: string): boolean {
	if (type === 'string') return typeof value === 'string';
	if (type === 'number') return typeof value === 'number';
	if (type === 'boolean') return typeof value === 'boolean';
	if (type === 'array') return Array.isArray(value);
	if (type === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
	return true;
}

export function validateToolCall(name: string, args: unknown): ValidationResult {
	const errors: string[] = [];
	const tool = getTool(name);
	if (!tool) {
		return {valid: false, errors: [`unknown tool: ${name}`]};
	}
	if (args === null || args === undefined) args = {};
	if (typeof args !== 'object' || Array.isArray(args)) {
		return {valid: false, errors: ['args must be an object']};
	}
	const a = args as Record<string, unknown>;
	for (const p of tool.params) {
		if (p.required && (a[p.name] === undefined || a[p.name] === null)) {
			errors.push(`missing required param: ${p.name}`);
		}
		if (a[p.name] !== undefined && a[p.name] !== null && p.type) {
			if (!typeMatches(a[p.name], p.type)) {
				errors.push(`param ${p.name} must be ${p.type}`);
			}
		}
	}
	return {valid: errors.length === 0, errors};
}