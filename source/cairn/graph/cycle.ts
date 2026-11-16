import {Edge, EdgeType} from '../model/edges.js';

const CYCLABLE: Set<EdgeType> = new Set([
	'depends_on',
	'blocks',
	'parent_of',
	'supersedes',
]);

export interface CycleResult {
	cycle: boolean;
	path?: string[];
}

export function wouldCreateCycle(edges: Edge[], newEdge: Edge): CycleResult {
	if (!CYCLABLE.has(newEdge.type)) {
		return {cycle: false};
	}

	// adjacency for this edge type only
	const adj = new Map<string, string[]>();
	const add = (from: string, to: string) => {
		const list = adj.get(from) ?? [];
		list.push(to);
		adj.set(from, list);
	};

	for (const e of edges) {
		if (e.type === newEdge.type) {
			add(e.from.id, e.to.id);
		}
	}
	add(newEdge.from.id, newEdge.to.id);

	// DFS from newEdge.to to see if it reaches newEdge.from
	const target = newEdge.from.id;
	const start = newEdge.to.id;
	const visited = new Set<string>();
	const path: string[] = [];

	const dfs = (node: string): boolean => {
		if (node === target) return true;
		if (visited.has(node)) return false;
		visited.add(node);
		path.push(node);
		for (const next of adj.get(node) ?? []) {
			if (dfs(next)) {
				return true;
			}
		}
		path.pop();
		return false;
	};

	if (newEdge.from.id === newEdge.to.id) {
		return {cycle: true, path: [newEdge.from.id, newEdge.to.id]};
	}

	if (dfs(start)) {
		return {cycle: true, path: [newEdge.from.id, ...path]};
	}
	return {cycle: false};
}