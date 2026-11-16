import {describe, expect, it} from 'vitest';
import {toolDefs, toolNames, validateToolCall} from '../agent/tools.js';

describe('agent tools registry', () => {
	it('has about 24 tools', () => {
		expect(toolDefs().length).toBeGreaterThanOrEqual(24);
	});
	it('all names unique', () => {
		const names = toolDefs().map(t => t.name);
		expect(new Set(names).size).toBe(names.length);
	});
	it('toolNames sorted', () => {
		const names = toolNames();
		const sorted = [...names].sort();
		expect(names).toEqual(sorted);
	});
	it('groups correct', () => {
		const groups = new Set(toolDefs().map(t => t.group));
		for (const g of ['identity', 'work', 'leases', 'ledger', 'evidence', 'decisions', 'objectives', 'sync', 'discovery']) {
			expect(groups.has(g)).toBe(true);
		}
	});
	it('validateToolCall valid', () => {
		const r = validateToolCall('work_get', {id: 'abc'});
		expect(r.valid).toBe(true);
		expect(r.errors).toEqual([]);
	});
	it('validateToolCall missing required', () => {
		const r = validateToolCall('work_get', {});
		expect(r.valid).toBe(false);
		expect(r.errors.length).toBeGreaterThan(0);
	});
	it('validateToolCall unknown tool', () => {
		const r = validateToolCall('nope', {});
		expect(r.valid).toBe(false);
	});
});