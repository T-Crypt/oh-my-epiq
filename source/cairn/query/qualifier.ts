// DQL-shaped qualifier parser for the rebuild. Pure logic, no I/O.

export type SortField = 'created' | 'updated' | 'priority' | 'title';
export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
	field: SortField;
	direction: SortDirection;
}

export interface QualifierFilters {
	status?: string;
	tag?: string;
	assignee?: string;
	lane?: string;
	objective?: string;
	priority?: number;
	query?: string;
}

export interface ParsedQuery {
	filters: QualifierFilters;
	sort: SortSpec | null;
	limit?: number;
	offset?: number;
	errors: string[];
}

const KNOWN = new Set([
	'status',
	'tag',
	'assignee',
	'lane',
	'objective',
	'priority',
	'query',
	'sort',
	'limit',
	'offset',
]);

const SORT_FIELDS = new Set<SortField>(['created', 'updated', 'priority', 'title']);

function tokenize(input: string): string[] {
	const tokens: string[] = [];
	let i = 0;
	const n = input.length;
	while (i < n) {
		while (i < n && /\s/.test(input[i]!)) i++;
		if (i >= n) break;
		let buf = '';
		let inQuote = false;
		let quoteChar = '';
		while (i < n) {
			const c = input[i];
			if (inQuote) {
				if (c === quoteChar) {
					inQuote = false;
					i++;
					continue;
				}
				buf += c;
				i++;
				continue;
			}
			if (c === '"' || c === "'") {
				inQuote = true;
				quoteChar = c;
				i++;
				continue;
			}
			if (/\s/.test(c!)) break;
			buf += c;
			i++;
		}
		if (buf.length > 0) tokens.push(buf);
	}
	return tokens;
}

function parseNumber(raw: string): number | null {
	const n = Number(raw);
	if (!Number.isFinite(n)) return null;
	return n;
}

export function parseQualifier(input: string): ParsedQuery {
	const result: ParsedQuery = {filters: {}, sort: null, errors: []};
	const tokens = tokenize(input);
	const freeText: string[] = [];

	for (const tok of tokens) {
		const colonIdx = tok.indexOf(':');
		if (colonIdx === -1) {
			freeText.push(tok);
			continue;
		}
		const key = tok.slice(0, colonIdx).trim().toLowerCase();
		const value = tok.slice(colonIdx + 1).trim();

		if (!KNOWN.has(key)) {
			result.errors.push(`Unknown qualifier: ${key}`);
			continue;
		}

		switch (key) {
			case 'status':
				result.filters.status = value.toLowerCase();
				break;
			case 'tag':
				result.filters.tag = value;
				break;
			case 'assignee':
				result.filters.assignee = value;
				break;
			case 'lane':
				result.filters.lane = value;
				break;
			case 'objective':
				result.filters.objective = value;
				break;
			case 'priority': {
				const n = parseNumber(value);
				if (n === null) {
					result.errors.push(`Invalid priority: ${value}`);
					break;
				}
				result.filters.priority = n;
				break;
			}
			case 'query':
				result.filters.query = result.filters.query
					? `${result.filters.query} ${value}`
					: value;
				break;
			case 'sort': {
				let fieldRaw = value;
				let dirRaw = '';
				const dirIdx = value.indexOf(':');
				if (dirIdx !== -1) {
					fieldRaw = value.slice(0, dirIdx);
					dirRaw = value.slice(dirIdx + 1);
				}
				const field = fieldRaw.toLowerCase() as SortField;
				if (!SORT_FIELDS.has(field)) {
					result.errors.push(`Invalid sort field: ${fieldRaw}`);
					break;
				}
				const direction: SortDirection =
					dirRaw.toLowerCase() === 'desc' ? 'desc' : 'asc';
				result.sort = {field, direction};
				break;
			}
			case 'limit': {
				const n = parseNumber(value);
				if (n === null || n < 0) {
					result.errors.push(`Invalid limit: ${value}`);
					break;
				}
				result.limit = n;
				break;
			}
			case 'offset': {
				const n = parseNumber(value);
				if (n === null || n < 0) {
					result.errors.push(`Invalid offset: ${value}`);
					break;
				}
				result.offset = n;
				break;
			}
		}
	}

	if (freeText.length > 0) {
		const joined = freeText.join(' ');
		result.filters.query = result.filters.query
			? `${result.filters.query} ${joined}`
			: joined;
	}

	return result;
}
