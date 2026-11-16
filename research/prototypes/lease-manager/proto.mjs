// Lease manager spike: CAS claim + fencing token + expiry + recovery + stale-owner prevention.
// Usage: node research/prototypes/lease-manager/proto.mjs
// No external deps. Pure Node.
import { performance } from 'node:perf_hooks';
import os from 'node:os';

const DEFAULT_TTL = 50; // ms
let leaseCounter = 0;
function newLeaseId() { return 'L' + String(++leaseCounter).padStart(8, '0'); }
function now() { return Date.now(); }

// ---------- lease manager factory ----------
function createManager(workItemSeeds, initialLog = []) {
  const workItems = new Map();   // id -> {id, status, leaseId, leasePolicy}
  for (const s of workItemSeeds) {
    workItems.set(s.id, { id: s.id, status: 'ready', leaseId: null, leasePolicy: s.policy || 'exclusive' });
  }
  const leases = new Map();      // leaseId -> Lease
  const fencingTokens = new Map(); // workItemId -> number
  const requestLog = new Map();   // requestId -> result
  const log = initialLog;        // shared durable log (append-only)

  function sweep(nowTs) {
    for (const lease of leases.values()) {
      if (lease.state === 'active' && lease.expiresAt <= nowTs) {
        lease.state = 'expired';
        const wi = workItems.get(lease.workItemId);
        if (wi && wi.leaseId === lease.id) {
          wi.leaseId = null;
          wi.status = 'ready';
        }
        log.push({ type: 'lease.expired', leaseId: lease.id, workItemId: lease.workItemId, at: nowTs });
      }
    }
  }

  function claim(workItemId, holderActorId, requestId, nowTs = now(), ttl = DEFAULT_TTL) {
    // idempotency
    if (requestId && requestLog.has(requestId)) {
      return requestLog.get(requestId);
    }
    const wi = workItems.get(workItemId);
    if (!wi) {
      const r = { ok: false, error: 'unknown_work_item' };
      if (requestId) requestLog.set(requestId, r);
      return r;
    }
    sweep(nowTs);
    const shared = wi.leasePolicy === 'shared';
    const existingLease = wi.leaseId ? leases.get(wi.leaseId) : null;
    const active = existingLease && existingLease.state === 'active' && existingLease.expiresAt > nowTs;
    if (!shared && active) {
      const r = {
        ok: false,
        conflict: {
          holder: existingLease.holderActorId,
          token: existingLease.fencingToken,
          expiry: existingLease.expiresAt,
        },
      };
      if (requestId) requestLog.set(requestId, r);
      return r;
    }
    // create lease
    const token = (fencingTokens.get(workItemId) || 0) + 1;
    fencingTokens.set(workItemId, token);
    const leaseId = newLeaseId();
    const lease = {
      id: leaseId,
      workItemId,
      holderActorId: holderActorId,
      fencingToken: token,
      acquiredAt: nowTs,
      expiresAt: nowTs + ttl,
      lastHeartbeatAt: nowTs,
      state: 'active',
      releasedAt: null,
    };
    leases.set(leaseId, lease);
    wi.leaseId = leaseId;
    wi.status = 'claimed';
    const r = { ok: true, leaseId, fencingToken: token, expiresAt: nowTs + ttl };
    log.push({ type: 'lease.claimed', leaseId, workItemId, holder: holderActorId, token, acquiredAt: nowTs, expiresAt: nowTs + ttl, requestId: requestId || null, result: r });
    if (requestId) requestLog.set(requestId, r);
    return r;
  }

  function release(leaseId, fencingToken, requestId, nowTs = now()) {
    if (requestId && requestLog.has(requestId)) return requestLog.get(requestId);
    const lease = leases.get(leaseId);
    if (!lease) {
      const r = { ok: false, error: 'lease_not_found' };
      if (requestId) requestLog.set(requestId, r);
      return r;
    }
    const currentToken = fencingTokens.get(lease.workItemId) || 0;
    if (fencingToken < currentToken) {
      const curLeaseId = workItems.get(lease.workItemId)?.leaseId;
      const holder = curLeaseId ? leases.get(curLeaseId)?.holderActorId : null;
      const r = { ok: false, error: 'stale_token', currentHolder: holder, currentToken, currentLeaseId: curLeaseId };
      if (requestId) requestLog.set(requestId, r);
      return r;
    }
    if (lease.state !== 'active') {
      const r = { ok: false, error: 'not_active', state: lease.state };
      if (requestId) requestLog.set(requestId, r);
      return r;
    }
    lease.state = 'released';
    lease.releasedAt = nowTs;
    const wi = workItems.get(lease.workItemId);
    if (wi && wi.leaseId === lease.id) {
      wi.leaseId = null;
      wi.status = 'ready';
    }
    const r = { ok: true, released: leaseId };
    log.push({ type: 'lease.released', leaseId, workItemId: lease.workItemId, token: fencingToken, at: nowTs, requestId: requestId || null, result: r });
    if (requestId) requestLog.set(requestId, r);
    return r;
  }

  function heartbeat(leaseId, fencingToken, nowTs = now(), ttl = DEFAULT_TTL) {
    const lease = leases.get(leaseId);
    if (!lease || lease.state !== 'active') return { ok: false, error: 'not_active' };
    const currentToken = fencingTokens.get(lease.workItemId) || 0;
    if (fencingToken < currentToken) {
      const curLeaseId = workItems.get(lease.workItemId)?.leaseId;
      const holder = curLeaseId ? leases.get(curLeaseId)?.holderActorId : null;
      return { ok: false, error: 'stale_token', currentHolder: holder, currentToken };
    }
    lease.lastHeartbeatAt = nowTs;
    lease.expiresAt = nowTs + ttl;
    log.push({ type: 'lease.heartbeat', leaseId, token: fencingToken, expiresAt: lease.expiresAt, at: nowTs });
    return { ok: true, expiresAt: lease.expiresAt };
  }

  function write(workItemId, leaseId, fencingToken, payload) {
    const wi = workItems.get(workItemId);
    if (!wi) return { ok: false, error: 'unknown_work_item' };
    const currentToken = fencingTokens.get(workItemId) || 0;
    if (fencingToken < currentToken) {
      const curLeaseId = wi.leaseId;
      const holder = curLeaseId ? leases.get(curLeaseId)?.holderActorId : null;
      return { ok: false, rejected: 'stale_token', currentHolder: holder, currentToken, currentLeaseId: curLeaseId };
    }
    if (leaseId !== wi.leaseId) {
      return { ok: false, rejected: 'lease_mismatch', currentLeaseId: wi.leaseId };
    }
    const lease = leases.get(leaseId);
    if (!lease || lease.state !== 'active') {
      return { ok: false, rejected: 'lease_not_active', state: lease?.state };
    }
    log.push({ type: 'work.write', workItemId, leaseId, fencingToken, payload, at: now() });
    return { ok: true, accepted: true };
  }

  function getLease(leaseId) { return leases.get(leaseId); }
  function getWorkItem(id) { return workItems.get(id); }

  return { workItems, leases, fencingTokens, requestLog, log, sweep, claim, release, heartbeat, write, getLease, getWorkItem };
}

// ---------- recovery rebuild from log ----------
function rebuildFromLog(workItemSeeds, log, nowTs = Date.now()) {
  const workItems = new Map();
  for (const s of workItemSeeds) {
    workItems.set(s.id, { id: s.id, status: 'ready', leaseId: null, leasePolicy: s.policy || 'exclusive' });
  }
  const leases = new Map();
  const fencingTokens = new Map();
  const requestLog = new Map();
  for (const e of log) {
    if (e.type === 'lease.claimed') {
      if (!leases.has(e.leaseId)) {
        leases.set(e.leaseId, {
          id: e.leaseId,
          workItemId: e.workItemId,
          holderActorId: e.holder,
          fencingToken: e.token,
          acquiredAt: e.acquiredAt,
          expiresAt: e.expiresAt,
          lastHeartbeatAt: e.acquiredAt,
          state: 'active',
          releasedAt: null,
        });
      }
      const cur = fencingTokens.get(e.workItemId) || 0;
      if (e.token > cur) fencingTokens.set(e.workItemId, e.token);
      const wi = workItems.get(e.workItemId);
      if (wi) { wi.leaseId = e.leaseId; wi.status = 'claimed'; }
      if (e.requestId) requestLog.set(e.requestId, e.result);
    } else if (e.type === 'lease.released') {
      const l = leases.get(e.leaseId);
      if (l) { l.state = 'released'; l.releasedAt = e.at; }
      const wi = workItems.get(e.workItemId);
      if (wi && wi.leaseId === e.leaseId) { wi.leaseId = null; wi.status = 'ready'; }
      if (e.requestId) requestLog.set(e.requestId, e.result);
    } else if (e.type === 'lease.heartbeat') {
      const l = leases.get(e.leaseId);
      if (l) { l.expiresAt = e.expiresAt; l.lastHeartbeatAt = e.at; }
    } else if (e.type === 'lease.expired') {
      const l = leases.get(e.leaseId);
      if (l) l.state = 'expired';
      const wi = workItems.get(l?.workItemId);
      if (wi && wi.leaseId === l?.id) { wi.leaseId = null; wi.status = 'ready'; }
    }
  }
  // sweep expired based on now
  for (const l of leases.values()) {
    if (l.state === 'active' && l.expiresAt <= nowTs) {
      l.state = 'expired';
      const wi = workItems.get(l.workItemId);
      if (wi && wi.leaseId === l.id) { wi.leaseId = null; wi.status = 'ready'; }
      log.push({ type: 'lease.expired', leaseId: l.id, workItemId: l.workItemId, at: nowTs });
    }
  }
  return { workItems, leases, fencingTokens, requestLog, log };
}

// ---------- assertions ----------
let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS:', msg); }
  else { fail++; console.log('  FAIL:', msg); }
}

// ============================================================
// Test 1: concurrency — 100 simultaneous claims, same work item
// ============================================================
console.log('=== Test B: concurrency (100 simultaneous claims) ===');
const seeds = [{ id: 'wi1', policy: 'exclusive' }];
const log1 = [];
const mgr = createManager(seeds, log1);
const claims = [];
for (let i = 0; i < 100; i++) {
  claims.push(Promise.resolve().then(() => mgr.claim('wi1', `holder-${i}`, `req-c-${i}`)));
}
const results = await Promise.all(claims);
const wins = results.filter(r => r.ok === true);
const conflicts = results.filter(r => r.ok === false && r.conflict);
console.log(`  winners: ${wins.length}, conflicts: ${conflicts.length}`);
assert(wins.length === 1, 'exactly one claim wins');
assert(conflicts.length === 99, '99 claims get structured conflicts');
// conflicts name the holder
const holderName = wins[0] && (mgr.getLease(wins[0].leaseId)?.holderActorId);
const allNameHolder = conflicts.every(c => c.conflict.holder === holderName);
assert(allNameHolder, 'all 99 conflicts name the winning holder (' + holderName + ')');
// conflict has token and expiry
assert(conflicts[0].conflict.token === wins[0].fencingToken, 'conflict carries fencing token');
assert(typeof conflicts[0].conflict.expiry === 'number', 'conflict carries expiry');

// ============================================================
// Test 2: stale-owner rejection
// ============================================================
console.log('\n=== Test C: stale-owner rejection ===');
const seeds2 = [{ id: 'wi2', policy: 'exclusive' }];
const log2 = [];
const mgr2 = createManager(seeds2, log2);
const t0 = 1000;
const a = mgr2.claim('wi2', 'holder-A', 'req-a', t0, 10); // ttl 10ms
console.log('  A claims:', JSON.stringify(a));
assert(a.ok === true, 'A claims successfully');
// wait for expiry
const waitUntil = t0 + 20;
while (Date.now() < waitUntil) { /* busy wait small */ }
// Actually use deterministic time: sweep at t0+20
mgr2.sweep(t0 + 20);
const b = mgr2.claim('wi2', 'holder-B', 'req-b', t0 + 20, 50);
console.log('  B claims after expiry:', JSON.stringify(b));
assert(b.ok === true, 'B claims after A expired');
// A's late write with old token
const writeRes = mgr2.write('wi2', a.leaseId, a.fencingToken, { data: 'late' });
console.log('  A late write:', JSON.stringify(writeRes));
assert(writeRes.ok === false, 'A late write rejected');
assert(writeRes.rejected === 'stale_token', 'rejection reason is stale_token');
assert(writeRes.currentHolder === 'holder-B', 'rejection names current holder B');

// ============================================================
// Test 3: idempotency
// ============================================================
console.log('\n=== Test D: idempotency ===');
const seeds3 = [{ id: 'wi3', policy: 'exclusive' }];
const log3 = [];
const mgr3 = createManager(seeds3, log3);
const logLenBefore = log3.length;
const r1 = mgr3.claim('wi3', 'holder-X', 'req-idem');
const r2 = mgr3.claim('wi3', 'holder-X', 'req-idem'); // retry same request id
console.log('  first:', JSON.stringify(r1));
console.log('  retry:', JSON.stringify(r2));
assert(JSON.stringify(r1) === JSON.stringify(r2), 'retry returns identical result');
assert(log3.length === logLenBefore + 1, 'retry wrote nothing (log length unchanged)');
// lease count unchanged
assert(mgr3.leases.size === 1, 'only one lease created');

// ============================================================
// Test 4: recovery — crash, rebuild from log
// ============================================================
console.log('\n=== Test E: recovery ===');
const seeds4 = [{ id: 'wi4', policy: 'exclusive' }];
const log4 = [];
const mgr4 = createManager(seeds4, log4);
const c = mgr4.claim('wi4', 'holder-Z', 'req-z', 5000, 10); // expires at 5010
console.log('  claim:', JSON.stringify(c));
// expire it
mgr4.sweep(5020);
console.log('  after sweep, lease state:', mgr4.getLease(c.leaseId).state, 'workitem status:', mgr4.getWorkItem('wi4').status);
assert(mgr4.getLease(c.leaseId).state === 'expired', 'lease marked expired');
assert(mgr4.getWorkItem('wi4').status === 'ready', 'work item returns to ready');
// simulate crash: drop in-memory state, keep log
const survivingLog = log4.slice();
// rebuild
const rebuilt = rebuildFromLog(seeds4, survivingLog, 5020);
console.log('  rebuilt lease state:', rebuilt.leases.get(c.leaseId).state, 'workitem status:', rebuilt.workItems.get('wi4').status);
assert(rebuilt.leases.get(c.leaseId).state === 'expired', 'rebuilt: lease expired');
assert(rebuilt.workItems.get('wi4').status === 'ready', 'rebuilt: work item ready');
assert(rebuilt.fencingTokens.get('wi4') === c.fencingToken, 'rebuilt: fencing token preserved');

// ============================================================
// Test 5: shared lease policy
// ============================================================
console.log('\n=== Test F: shared lease policy ===');
const seeds5 = [{ id: 'wi5', policy: 'shared' }];
const log5 = [];
const mgr5 = createManager(seeds5, log5);
const s1 = mgr5.claim('wi5', 'agent-1', 'rs1');
const s2 = mgr5.claim('wi5', 'agent-2', 'rs2');
console.log('  shared claim 1:', JSON.stringify(s1));
console.log('  shared claim 2:', JSON.stringify(s2));
assert(s1.ok === true && s2.ok === true, 'shared policy allows multiple claims');

// ============================================================
// Benchmark: 10,000 claim/release cycles
// ============================================================
console.log('\n=== Benchmark: 10,000 claim/release cycles ===');
const seedsB = [{ id: 'wib', policy: 'exclusive' }];
const logB = [];
const mgrB = createManager(seedsB, logB);
const BENCH_N = 10000;
const b0 = performance.now();
for (let i = 0; i < BENCH_N; i++) {
  const cl = mgrB.claim('wib', 'bench-holder', `b-claim-${i}`);
  if (!cl.ok) { console.log('  unexpected claim fail at', i); break; }
  const rl = mgrB.release(cl.leaseId, cl.fencingToken, `b-rel-${i}`);
  if (!rl.ok) { console.log('  unexpected release fail at', i, rl); break; }
}
const b1 = performance.now();
const totalMs = b1 - b0;
const msPerCycle = totalMs / BENCH_N;
console.log(`  cycles: ${BENCH_N}`);
console.log(`  total:  ${totalMs.toFixed(2)} ms`);
console.log(`  ms/cycle: ${msPerCycle.toFixed(4)}`);
console.log(`  cycles/sec: ${(1000 / msPerCycle).toFixed(0)}`);

// ============================================================
// Summary
// ============================================================
console.log('\n=== SUMMARY ===');
console.log('Node:', process.version);
console.log('Platform:', os.platform(), os.arch(), os.cpus()[0]?.model);
console.log('Tests passed:', pass, 'failed:', fail);
console.log('Overall:', fail === 0 ? 'PASS' : 'FAIL');
console.log(JSON.stringify({ node: process.version, platform: os.platform(), arch: os.arch(), pass, fail, msPerCycle: +msPerCycle.toFixed(4), totalMs: +totalMs.toFixed(2) }));
