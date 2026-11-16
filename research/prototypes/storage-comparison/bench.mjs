// Storage comparison spike: log replay vs SQLite projection at 400k events.
// Usage: node research/prototypes/storage-comparison/bench.mjs
// No external deps; uses node:sqlite (built-in).
import { writeFileSync, readFileSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const EVENT_COUNT = 400000;
const WI_COUNT = 80000;
const STATUSES = ['draft', 'ready', 'claimed', 'in_progress', 'in_review', 'done', 'cancelled'];
const TAGS = ['core', 'ui', 'infra', 'docs', 'perf', 'bug'];
const DIR = new URL('.', import.meta.url).pathname;
const LOG_FILE = join(DIR, 'generated-events.jsonl');
const DB_FILE = join(DIR, 'projection.db');

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function encodeTime(ms, len) {
	let out = '';
	for (let i = len - 1; i >= 0; i--) {
		out = CROCKFORD[ms % 32] + out;
		ms = Math.floor(ms / 32);
	}
	return out;
}
function encodeRandom(len) {
	let out = '';
	for (let i = 0; i < len; i++) out += CROCKFORD[Math.floor(Math.random() * 32)];
	return out;
}
let ulidCounter = 0;
function ulid(tsOffset = 0) {
	const ts = 1700000000000 + (ulidCounter++ + tsOffset);
	return encodeTime(ts, 10) + encodeRandom(16);
}

function hr() { return process.hrtime.bigint(); }
function msBetween(a, b) { return Number(b - a) / 1e6; }

// ---------- generate ----------
const workItemIds = Array.from({ length: WI_COUNT }, () => ulid());

const events = [];
let ei = 0;
function pushEvent(actionKey, payload, refId = null) {
	const id = [ulid(), refId];
	events.push({ v: 1, id, [actionKey]: payload });
}

// 80k creates
for (let i = 0; i < WI_COUNT; i++) {
	pushEvent('create.work_item', { workItemId: workItemIds[i], title: `wi-${i}`, status: 'draft', tags: [] });
}
// 80k add tag
for (let i = 0; i < WI_COUNT; i++) {
	pushEvent('add.tag', { workItemId: workItemIds[i % WI_COUNT], tag: TAGS[i % TAGS.length] });
}
// 80k set status
for (let i = 0; i < WI_COUNT; i++) {
	pushEvent('set.status', { workItemId: workItemIds[i % WI_COUNT], status: STATUSES[i % STATUSES.length] });
}
// 80k add edge (depends_on), avoid self
for (let i = 0; i < WI_COUNT; i++) {
	const from = workItemIds[i % WI_COUNT];
	let to = workItemIds[(i + 7) % WI_COUNT];
	if (to === from) to = workItemIds[(i + 11) % WI_COUNT];
	pushEvent('add.edge', { fromId: from, toId: to, type: 'depends_on' });
}
// 80k observations
for (let i = 0; i < WI_COUNT; i++) {
	pushEvent('record.observation', { id: ulid(), workItemId: workItemIds[i % WI_COUNT], statement: `obs-${i}`, validity: 'valid', kind: 'note' });
}

// write log file
const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
writeFileSync(LOG_FILE, lines);

// ---------- replay measurement ----------
let peakRss = process.memoryUsage().rss;
const sampler = setInterval(() => {
	const r = process.memoryUsage().rss;
	if (r > peakRss) peakRss = r;
}, 50);

const t0 = hr();
const raw = readFileSync(LOG_FILE, 'utf8');
const parsed = [];
for (const line of raw.split('\n')) {
	if (line.length === 0) continue;
	parsed.push(JSON.parse(line));
}
const t1 = hr();

// sort by eventId
parsed.sort((a, b) => {
	const ae = a.id[0], be = b.id[0];
	if (ae < be) return -1;
	if (ae > be) return 1;
	return 0;
});
// dedupe by eventId
const seen = new Set();
const unique = [];
for (const e of parsed) {
	const key = e.id[0];
	if (seen.has(key)) continue;
	seen.add(key);
	unique.push(e);
}
const t2 = hr();
clearInterval(sampler);

const parseMs = msBetween(t0, t1);
const sortMs = msBetween(t1, t2);
const totalMs = msBetween(t0, t2);
const rssMb = process.memoryUsage().rss / 1048576;
const peakRssMb = peakRss / 1048576;

// ---------- build projection ----------
if (existsSync(DB_FILE)) unlinkSync(DB_FILE);
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec(`CREATE TABLE work_items (id TEXT PRIMARY KEY, ref TEXT, status TEXT, title TEXT)`);
db.exec(`CREATE TABLE work_item_tags (workItemId TEXT, tag TEXT)`);
db.exec(`CREATE INDEX idx_wit_tag ON work_item_tags(tag)`);
db.exec(`CREATE TABLE edges (fromId TEXT, type TEXT, toId TEXT)`);
db.exec(`CREATE INDEX idx_edges_from ON edges(fromId, type)`);
db.exec(`CREATE INDEX idx_edges_to ON edges(toId, type)`);
db.exec(`CREATE TABLE observations (id TEXT PRIMARY KEY, workItemId TEXT, kind TEXT, validity TEXT, statement TEXT)`);
db.exec(`CREATE INDEX idx_obs_wkv ON observations(workItemId, kind, validity)`);
db.exec(`CREATE INDEX idx_wi_status ON work_items(status)`);

const insWi = db.prepare('INSERT INTO work_items (id, ref, status, title) VALUES (?,?,?,?)');
const insTag = db.prepare('INSERT INTO work_item_tags (workItemId, tag) VALUES (?,?)');
const updStatus = db.prepare('UPDATE work_items SET status=? WHERE id=?');
const insEdge = db.prepare('INSERT INTO edges (fromId, type, toId) VALUES (?,?,?)');
const insObs = db.prepare('INSERT INTO observations (id, workItemId, kind, validity, statement) VALUES (?,?,?,?,?)');

const b0 = hr();
db.exec('BEGIN');
for (const e of unique) {
	const p = e['create.work_item'];
	if (p) {
		insWi.run(p.workItemId, p.workItemId.slice(-7), 'draft', p.title);
		continue;
	}
	const t = e['add.tag'];
	if (t) { insTag.run(t.workItemId, t.tag); continue; }
	const s = e['set.status'];
	if (s) { updStatus.run(s.status, s.workItemId); continue; }
	const ed = e['add.edge'];
	if (ed) { insEdge.run(ed.fromId, ed.type, ed.toId); continue; }
	const o = e['record.observation'];
	if (o) { insObs.run(o.id, o.workItemId, o.kind, o.validity, o.statement); continue; }
}
db.exec('COMMIT');
const b1 = hr();
const buildMs = msBetween(b0, b1);

const dbSize = statSync(DB_FILE).size;

// ---------- queries ----------
function timeQuery(fn) {
	const s = hr();
	const rows = fn();
	const e = hr();
	return { ms: msBetween(s, e), rows: Array.isArray(rows) ? rows.length : rows };
}

// (i) short-ref lookup by suffix
const suffix = workItemIds[0].slice(-7);
const q1 = timeQuery(() => db.prepare('SELECT * FROM work_items WHERE id LIKE ?').all('%' + suffix));
// (ii) qualifier filter
const q2 = timeQuery(() => db.prepare("SELECT w.* FROM work_items w JOIN work_item_tags t ON w.id=t.workItemId WHERE w.status='ready' AND t.tag='core'").all());
// (iii) readiness-style: work items whose deps are all done
const q3 = timeQuery(() => db.prepare("SELECT w.* FROM work_items w WHERE NOT EXISTS (SELECT 1 FROM edges e JOIN work_items d ON d.id=e.toId WHERE e.fromId=w.id AND e.type='depends_on' AND d.status!='done')").all());
// (iv) ledger lookup for one work item
const q4 = timeQuery(() => db.prepare('SELECT * FROM observations WHERE workItemId=? AND kind=? AND validity=?').all(workItemIds[0], 'note', 'valid'));

db.close();

// ---------- output ----------
const bar = 2000;
function pf(ms) { return ms < bar ? 'PASS' : 'FAIL'; }
console.log('Storage comparison spike (400k events)');
console.log('Node', process.version);
console.log('Events generated:', events.length);
console.log('Lines parsed:', parsed.length);
console.log('Unique ids:', unique.length);
console.log('');
console.log('Log replay:');
console.log(`  parse ms:  ${parseMs.toFixed(2)}  ${pf(parseMs)}`);
console.log(`  sort ms:   ${sortMs.toFixed(2)}  ${pf(sortMs)}`);
console.log(`  total ms:  ${totalMs.toFixed(2)}  ${pf(totalMs)}`);
console.log(`  peak RSS:  ${peakRssMb.toFixed(1)} MB`);
console.log(`  RSS now:   ${rssMb.toFixed(1)} MB`);
console.log('');
console.log('Projection build:');
console.log(`  build ms:  ${buildMs.toFixed(2)}`);
console.log(`  db size:  ${(dbSize / 1048576).toFixed(2)} MB`);
console.log('');
console.log('Projection queries:');
console.log(`  (i)  short-ref suffix lookup: ${q1.ms.toFixed(2)} ms, ${q1.rows} rows  ${pf(q1.ms)}`);
console.log(`  (ii) qualifier filter ready+tag: ${q2.ms.toFixed(2)} ms, ${q2.rows} rows  ${pf(q2.ms)}`);
console.log(`  (iii) readiness (deps all done): ${q3.ms.toFixed(2)} ms, ${q3.rows} rows  ${pf(q3.ms)}`);
console.log(`  (iv) ledger lookup one wi: ${q4.ms.toFixed(2)} ms, ${q4.rows} rows  ${pf(q4.ms)}`);
console.log('');
console.log('Bar: read < 2000 ms at 400k events.');
console.log(JSON.stringify({
	node: process.version,
	events: events.length,
	linesParsed: parsed.length,
	uniqueIds: unique.length,
	parseMs: +parseMs.toFixed(2),
	sortMs: +sortMs.toFixed(2),
	totalMs: +totalMs.toFixed(2),
	peakRssMb: +peakRssMb.toFixed(1),
	buildMs: +buildMs.toFixed(2),
	dbSizeMb: +(dbSize / 1048576).toFixed(2),
	q1SuffixMs: +q1.ms.toFixed(2), q1Rows: q1.rows,
	q2QualifierMs: +q2.ms.toFixed(2), q2Rows: q2.rows,
	q3ReadinessMs: +q3.ms.toFixed(2), q3Rows: q3.rows,
	q4LedgerMs: +q4.ms.toFixed(2), q4Rows: q4.rows,
}));
