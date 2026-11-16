// Graph model spike: typed work graph with cycle detection and readiness.
// Usage: node research/prototypes/graph-model/proto.mjs
// No external deps. Pure Node.
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';

const CYCLIC = new Set(['depends_on', 'blocks', 'parent_of', 'supersedes']);
const STATUSES = ['draft', 'ready', 'claimed', 'in_progress', 'in_review', 'done', 'cancelled'];
const N = 10000;
const DEPS_PER_ITEM = 3;

// ---------- seeded rng ----------
let seed = 42;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; }
function rndInt(n) { return Math.floor(rnd() * n); }
function ulid(i) { return '01' + String(i).padStart(24, '0'); }

// ---------- graph state ----------
const items = new Map();          // id -> WorkItem
const outEdges = new Map();       // id -> Map<type, Set<to>>
const inEdges = new Map();        // id -> Map<type, Set<from>>
const edgeRecords = [];           // array of {from,to,type,author,timestamp}

function ensureAdj(m, id) { if (!m.has(id)) m.set(id, new Map()); return m.get(id); }

function hasPath(type, start, target) {
  const visited = new Set();
  const stack = [start];
  while (stack.length) {
    const n = stack.pop();
    if (n === target) return true;
    if (visited.has(n)) continue;
    visited.add(n);
    const outs = outEdges.get(n)?.get(type);
    if (outs) for (const t of outs) if (!visited.has(t)) stack.push(t);
  }
  return false;
}

function findPath(type, start, target) {
  // returns array from start to target inclusive, or null
  const visited = new Set([start]);
  const queue = [[start]];
  while (queue.length) {
    const path = queue.shift();
    const n = path[path.length - 1];
    if (n === target) return path;
    const outs = outEdges.get(n)?.get(type);
    if (outs) for (const t of outs) {
      if (!visited.has(t)) {
        visited.add(t);
        queue.push(path.concat(t));
      }
    }
  }
  return null;
}

function addEdge({ from, to, type, author, timestamp }) {
  const t0 = performance.now();
  if (CYCLIC.has(type)) {
    if (hasPath(type, to, from)) {
      const p = findPath(type, to, from);
      const cycle = p ? [from].concat(p) : [from, to, from];
      const dt = performance.now() - t0;
      return { ok: false, cycle, ms: dt };
    }
  }
  // apply
  const o = ensureAdj(outEdges, from);
  if (!o.has(type)) o.set(type, new Set());
  o.get(type).add(to);
  const i = ensureAdj(inEdges, to);
  if (!i.has(type)) i.set(type, new Set());
  i.get(type).add(from);
  edgeRecords.push({ from, to, type, author, timestamp });
  const dt = performance.now() - t0;
  return { ok: true, ms: dt };
}

// ---------- generate work items ----------
const OBJECTIVES = 100;
const CONSTRAINTS = 50;
const fileSet = new Set(Array.from({ length: 200 }, (_, i) => `file-${i}.ts`));
const objectives = Array.from({ length: OBJECTIVES }, (_, i) => `obj-${i}`);
const constraints = Array.from({ length: CONSTRAINTS }, (_, i) => `cst-${i}`);

for (let i = 0; i < N; i++) {
  const id = ulid(i);
  const hasSpec = rnd() > 0.15;
  const draftExempt = !hasSpec && rnd() > 0.7;
  items.set(id, {
    id,
    ref: id.slice(-7).toUpperCase(),
    status: STATUSES[rndInt(STATUSES.length)],
    spec: hasSpec ? `spec for ${id}` : null,
    draftExemption: draftExempt,
    requiredFiles: rnd() > 0.8 ? [`file-${rndInt(200)}.ts`, `file-${rndInt(200)}.ts`] : [],
    requiredDecisions: [],
    requiredConstraints: rnd() > 0.9 ? [`cst-${rndInt(CONSTRAINTS)}`] : [],
    contextResolves: rnd() > 0.05,
    repoAccess: rnd() > 0.02,
    lease: rnd() > 0.85 ? { state: rnd() > 0.5 ? 'active' : 'expired', expired: rnd() > 0.5, shared: false } : null,
    leasePolicyShared: false,
    verifications: rnd() > 0.7 ? [{ outcome: rnd() > 0.85 ? 'fail' : 'pass', freshness: 'fresh' }] : [],
    hasContradictoryVerification: rnd() > 0.97,
    waivedDeps: new Set(),
    parent: null,
    objectiveId: objectives[rndInt(OBJECTIVES)],
  });
}

const itemIds = [...items.keys()];

// helper to attach edges
function attach(from, to, type) {
  if (from === to) return null;
  return addEdge({ from, to, type, author: 'proto', timestamp: Date.now() });
}

// ---------- generate depends_on edges: ~3 per item ----------
const detTimes = [];
let edgesAccepted = 0;
let edgesRejected = 0;
let cycleExamples = 0;
for (let i = 0; i < N; i++) {
  for (let k = 0; k < DEPS_PER_ITEM; k++) {
    const from = itemIds[i];
    const to = itemIds[rndInt(N)];
    if (to === from) continue;
    const r = attach(from, to, 'depends_on');
    if (!r) continue;
    detTimes.push(r.ms);
    if (r.ok) edgesAccepted++; else { edgesRejected++; if (cycleExamples < 3) { console.log('cycle:', r.cycle.join(' -> ')); cycleExamples++; } }
  }
}

// ---------- blocks edges: ~0.3 per item ----------
for (let i = 0; i < Math.floor(N * 0.3); i++) {
  const from = itemIds[rndInt(N)];
  const to = itemIds[rndInt(N)];
  if (from === to) continue;
  const r = attach(from, to, 'blocks');
  if (r) { detTimes.push(r.ms); if (r.ok) edgesAccepted++; else edgesRejected++; }
}

// ---------- parent_of: tree-ish, lower index parent ----------
for (let i = 1; i < N; i++) {
  if (rnd() > 0.7) continue;
  const child = itemIds[i];
  const parent = itemIds[rndInt(i)]; // lower index -> acyclic
  const r = attach(parent, child, 'parent_of');
  if (r) { detTimes.push(r.ms); if (r.ok) { edgesAccepted++; items.get(child).parent = parent; } else edgesRejected++; }
}

// ---------- implements: work item -> objective (use constrained_by? actually implements edge to objective not node)
// We don't have objective nodes; skip graph edge for implements (n/a cycle). Record as property already.

// ---------- supersedes: decision chain not modeled; skip nodes. Add a few among items? spec says Decision->Decision.
// Skip for graph of work items.

// ---------- constrained_by: work item -> constraint (not cyclic, not a work item node). Track as property.
for (let i = 0; i < N; i++) {
  if (rnd() > 0.4) continue;
  const wi = itemIds[i];
  const c = constraints[rndInt(CONSTRAINTS)];
  // store on item
  const it = items.get(wi);
  if (!it.requiredConstraints.includes(c)) it.requiredConstraints.push(c);
  // edge record (non-cyclic)
  edgeRecords.push({ from: wi, to: c, type: 'constrained_by', author: 'proto', timestamp: Date.now() });
  edgesAccepted++;
}

// ---------- readiness function ----------
function isReady(item) {
  if (!item.spec && !item.draftExemption) return false;
  // depends_on all done or waived
  const deps = outEdges.get(item.id)?.get('depends_on');
  if (deps) for (const to of deps) {
    if (item.waivedDeps.has(to)) continue;
    const t = items.get(to);
    if (!t || t.status !== 'done') return false;
  }
  // no open blockers
  const blockers = inEdges.get(item.id)?.get('blocks');
  if (blockers) for (const from of blockers) {
    const b = items.get(from);
    if (b && b.status !== 'done' && b.status !== 'cancelled') return false;
  }
  // required context resolves
  if (!item.contextResolves) return false;
  for (const f of item.requiredFiles) if (!fileSet.has(f)) return false;
  for (const c of item.requiredConstraints) if (!constraints.includes(c)) return false;
  // access
  if (!item.repoAccess) return false;
  // lease policy
  if (item.lease && item.lease.state === 'active' && !item.lease.expired && !item.leasePolicyShared) return false;
  // contradictory verification
  if (item.hasContradictoryVerification) return false;
  for (const v of item.verifications) if (v.outcome === 'fail' && v.freshness === 'fresh') return false;
  return true;
}

// ---------- benchmark readiness sweep ----------
const rs0 = performance.now();
let readyCount = 0;
for (const it of items.values()) if (isReady(it)) readyCount++;
const rs1 = performance.now();
const readinessSweepMs = rs1 - rs0;

// ---------- cycle detection stats ----------
const avgDetMs = detTimes.reduce((a, b) => a + b, 0) / detTimes.length;
const maxDetMs = Math.max(...detTimes);
const detCount = detTimes.length;

// ---------- memory ----------
const mem = process.memoryUsage();

// ---------- output ----------
const result = {
  node: process.version,
  items: N,
  edgesTotal: edgeRecords.length,
  edgesAccepted,
  edgesRejected,
  cycleDetectionEdgesMeasured: detCount,
  cycleDetectionAvgMs: +avgDetMs.toFixed(4),
  cycleDetectionMaxMs: +maxDetMs.toFixed(4),
  cycleDetectionTargetMs: 1,
  cycleDetectionPass: avgDetMs < 1,
  readinessSweepMs: +readinessSweepMs.toFixed(2),
  readinessTargetMs: 500,
  readinessPass: readinessSweepMs < 500,
  readyCount,
  rssMb: +(mem.rss / 1048576).toFixed(1),
  heapUsedMb: +(mem.heapUsed / 1048576).toFixed(1),
};

console.log('Graph model spike');
console.log('Node', process.version);
console.log('Items:', N);
console.log('Edges total:', edgeRecords.length, '(accepted', edgesAccepted, 'rejected', edgesRejected + ')');
console.log('');
console.log('Cycle detection (per edge):');
console.log(`  edges measured: ${detCount}`);
console.log(`  avg ms/edge:   ${avgDetMs.toFixed(4)}  ${avgDetMs < 1 ? 'PASS' : 'FAIL'} (target < 1 ms)`);
console.log(`  max ms/edge:   ${maxDetMs.toFixed(4)}`);
console.log('');
console.log('Readiness sweep (full set):');
console.log(`  ${readinessSweepMs.toFixed(2)} ms  ${readinessSweepMs < 500 ? 'PASS' : 'FAIL'} (target < 500 ms)`);
console.log(`  ready items: ${readyCount} / ${N}`);
console.log('');
console.log('Memory:');
console.log(`  RSS:        ${mem.rss / 1048576} MB -> ${ (mem.rss/1048576).toFixed(1)} MB`);
console.log(`  heap used:  ${(mem.heapUsed/1048576).toFixed(1)} MB`);
console.log('');
console.log('Overall:', (avgDetMs < 1 && readinessSweepMs < 500) ? 'PASS' : 'FAIL');
console.log(JSON.stringify(result));
