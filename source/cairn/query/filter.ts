import {WorkItem} from '../model/entities.js';
import {
	ParsedQuery,
	QualifierFilters,
	SortSpec,
	SortField,
} from './qualifier.js';

type AnyFilter = Partial<QualifierFilters> & {
	filters?: QualifierFilters;
	sort?: SortSpec | null;
	limit?: number;
	offset?: number;
};

function normalize(input: AnyFilter | ParsedQuery | null | undefined): {
	filters: QualifierFilters;
	sort: SortSpec | null;
	limit?: number;
	offset?: number;
} {
	const src = (input ?? {}) as AnyFilter;
	const filters = (src as {filters?: QualifierFilters}).filters ?? (src as QualifierFilters);
	const {sort, limit, offset} = src as AnyFilter;
	const {
		filters: _f,
		sort: _s,
		limit: _l,
		offset: _o,
		...rest
	} = src as Record<string, unknown>;
	const merged: QualifierFilters = {...(rest as QualifierFilters), ...(filters ?? {})};
	return {filters: merged, sort: sort ?? null, limit, offset};
}

function sortValue(item: WorkItem, field: SortField): string | number {
	switch (field) {
		case 'created':
			return item.createdAt;
		case 'updated':
			return item.updatedAt;
		case 'priority':
			return item.priority;
		case 'title':
			return item.title;
	}
}

function matches(item: WorkItem, f: QualifierFilters): boolean {
	if (f.status !== undefined && item.status.toLowerCase() !== f.status.toLowerCase()) {
		return false;
	}
	if (f.tag !== undefined && !item.tags.includes(f.tag)) {
		return false;
	}
	if (f.assignee !== undefined && item.assignee !== f.assignee) {
		return false;
	}
	if (f.lane !== undefined && item.lane !== f.lane) {
		return false;
	}
	if (f.objective !== undefined && item.objectiveId !== f.objective) {
		return false;
	}
	if (f.priority !== undefined && item.priority !== f.priority) {
		return false;
	}
	if (f.query !== undefined && f.query.trim() !== '') {
		const q = f.query.toLowerCase();
		const hay = `${item.ref} ${item.title} ${item.spec}`.toLowerCase();
		if (!hay.includes(q)) return false;
	}
	return true;
}

export function filterWorkItems(
	items: WorkItem[],
	filter: AnyFilter | ParsedQuery | null | undefined,
): WorkItem[] {
	const {filters, sort, limit, offset} = normalize(filter);
	let result = items.filter((item) => matches(item, filters));

	if (sort) {
		const dir = sort.direction === 'desc' ? -1 : 1;
		result = [...result].sort((a, b) => {
			const va = sortValue(a, sort.field);
			const vb = sortValue(b, sort.field);
			if (va < vb) return -1 * dir;
			if (va > vb) return 1 * dir;
			return 0;
		});
	}

	const off = offset ?? 0;
	if (off > 0) result = result.slice(off);
	if (limit !== undefined) result = result.slice(0, limit);
	return result;
}
