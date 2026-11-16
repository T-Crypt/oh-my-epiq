// Reuse contract. Pure.

import {LedgerRecord} from './records.js';

export interface ReuseResult {
	reuse: boolean;
	reason: string;
	bestRecord?: LedgerRecord;
}

export function mayReuse(
	record: LedgerRecord,
	question: string,
	inputs: string[],
): ReuseResult {
	if (record.validity !== 'valid') {
		return {
			reuse: false,
			reason: `record is ${record.validity}, not valid`,
			bestRecord: record,
		};
	}
	if (record.scope === undefined || record.scope === '') {
		return {
			reuse: false,
			reason: 'record has no scope',
			bestRecord: record,
		};
	}
	const scopeMatch =
		record.scope === question ||
		record.scope === '*' ||
		question.includes(record.scope);
	if (!scopeMatch) {
		return {
			reuse: false,
			reason: `question outside record scope (${record.scope})`,
			bestRecord: record,
		};
	}
	if (!inputs.includes(record.inputDigest)) {
		return {
			reuse: false,
			reason: 'input digest does not match',
			bestRecord: record,
		};
	}
	return {reuse: true, reason: 'valid, in scope, inputs match', bestRecord: record};
}