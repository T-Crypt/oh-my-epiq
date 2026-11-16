// Autonomy boundary enforcement. Pure logic.

function isPerson(actor: unknown): boolean {
	if (typeof actor === 'string') {
		return actor === 'human' || actor === 'person';
	}
	if (actor && typeof actor === 'object') {
		const a = actor as Record<string, unknown>;
		const kind = a['kind'] ?? a['type'] ?? a['role'];
		return kind === 'person' || kind === 'human';
	}
	return false;
}

function isAgent(actor: unknown): boolean {
	if (typeof actor === 'string') {
		return actor === 'agent';
	}
	if (actor && typeof actor === 'object') {
		const a = actor as Record<string, unknown>;
		const kind = a['kind'] ?? a['type'] ?? a['role'];
		return kind === 'agent';
	}
	return false;
}

const HUMAN_REQUIRED_ACTIONS: string[] = [
	'promote_to_constraint_user',
	'accept_work',
	'set_user_constraint',
	'change_lease_policy',
	'delete_history',
	'migrate_data',
	'promote_inference_to_constraint',
];

export function canPromoteToConstraint(actor: unknown, origin: string): boolean {
	if (origin !== 'user') return true;
	return isPerson(actor);
}

export function canSetDone(actor: unknown): boolean {
	if (isAgent(actor)) return false;
	return true;
}

export function canDeleteHistory(actor: unknown): boolean {
	return isPerson(actor);
}

export function requiresHuman(action: string): boolean {
	return HUMAN_REQUIRED_ACTIONS.includes(action);
}

export function humanRequiredActions(): string[] {
	return [...HUMAN_REQUIRED_ACTIONS];
}