// Pure helpers for bulk multi-ticket actions: each one fans out per issue,
// so the server needs no bulk API.

export const toggleIdInList = (ids: readonly string[], id: string): string[] =>
	ids.includes(id) ? ids.filter(current => current !== id) : [...ids, id];

// What an appended bulk description is joined with. Visible in the text, so a
// reader can tell where the old description ends and the bulk note begins.
export const DESCRIPTION_SEPARATOR = '\n\n---\n\n';

export const appendToDescription = (
	current: string,
	addition: string,
): string => {
	const extra = addition.trim();
	if (!extra) return current;
	if (!current.trim()) return extra;

	return `${current.replace(/\s+$/, '')}${DESCRIPTION_SEPARATOR}${extra}`;
};

// Closing an already-closed ticket would write a second "Closed" event, so
// the bulk close skips them — and the confirm modal counts only these.
export const bulkCloseTargets = <T extends {id: string; isClosed: boolean}>(
	issues: readonly T[],
): string[] => issues.filter(issue => !issue.isClosed).map(issue => issue.id);

export const bulkReopenTargets = <T extends {id: string; isClosed: boolean}>(
	issues: readonly T[],
): string[] => issues.filter(issue => issue.isClosed).map(issue => issue.id);
