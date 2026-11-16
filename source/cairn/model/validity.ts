export type ValidityState =
	| 'valid'
	| 'stale'
	| 'superseded'
	| 'contradicted'
	| 'unknown'
	| 'unverified';

const TRANSITIONS: Record<ValidityState, ValidityState[]> = {
	valid: ['stale', 'superseded', 'contradicted', 'unknown'],
	stale: ['valid', 'superseded', 'contradicted', 'unknown'],
	superseded: [],
	contradicted: [],
	unknown: ['valid', 'unverified'],
	unverified: ['valid', 'unknown'],
};

export function canTransitionValidity(
	from: ValidityState,
	to: ValidityState,
): boolean {
	if (from === to) return true;
	return TRANSITIONS[from].includes(to);
}

export function validityTransitionReason(
	from: ValidityState,
	to: ValidityState,
): string | null {
	if (canTransitionValidity(from, to)) return null;
	return `transition from ${from} to ${to} is not allowed`;
}