import {describe, expect, it} from 'vitest';
import {Edge} from '../model/edges.js';
import {wouldCreateCycle} from '../graph/cycle.js';

function edge(from: string, to: string, type: Edge['type'] = 'depends_on'): Edge {
	return {
		from: {type: 'WorkItem', id: from},
		to: {type: 'WorkItem', id: to},
		type,
		author: 'tester',
		timestamp: '2026-01-01T00:00:00.000Z',
	};
}

describe('cycle detection', () => {
	it('allows a simple edge with no cycle', () => {
		const edges = [edge('a', 'b')];
		const res = wouldCreateCycle(edges, edge('b', 'c'));
		expect(res.cycle).toBe(false);
	});

	it('detects a direct self-loop', () => {
		const res = wouldCreateCycle([], edge('a', 'a'));
		expect(res.cycle).toBe(true);
	});

	it('detects an indirect cycle', () => {
		const edges = [edge('a', 'b'), edge('b', 'c')];
		const res = wouldCreateCycle(edges, edge('c', 'a'));
		expect(res.cycle).toBe(true);
		expect(res.path).toBeDefined();
	});

	it('does not flag unrelated edges', () => {
		const edges = [edge('a', 'b'), edge('c', 'd')];
		const res = wouldCreateCycle(edges, edge('b', 'c'));
		expect(res.cycle).toBe(false);
	});

	it('ignores non-cyclable edge types', () => {
		const edges: Edge[] = [];
		const e: Edge = {
			from: {type: 'WorkItem', id: 'a'},
			to: {type: 'Objective', id: 'o'},
			type: 'implements',
			author: 'tester',
			timestamp: '2026-01-01T00:00:00.000Z',
		};
		const res = wouldCreateCycle(edges, e);
		expect(res.cycle).toBe(false);
	});
});