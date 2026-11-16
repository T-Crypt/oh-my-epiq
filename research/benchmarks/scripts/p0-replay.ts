// Phase 0 baseline: event-log parse + sort cost, read-only.
// Usage: npx tsx research/benchmarks/scripts/p0-replay.ts <events-dir> <label>
import {readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {
	clearParseCache,
	parsePersistedEventsFile,
	sortEvents,
} from '../../../source/lib/event/event-load.js';

const [dir, label] = process.argv.slice(2);
if (!dir || !label) {
	console.error('usage: p0-replay <events-dir> <label>');
	process.exit(2);
}

const ms = (a: bigint, b: bigint) => Number(b - a) / 1e6;

const files = readdirSync(dir)
	.filter(f => f.endsWith('.jsonl'))
	.map(f => join(dir, f));
let bytes = 0;
for (const f of files) bytes += statSync(f).size;

clearParseCache();
const t0 = process.hrtime.bigint();
const events: unknown[] = [];
for (const f of files) {
	const res = parsePersistedEventsFile(f);
	if (res.status === 'success' && res.value) events.push(...res.value);
	else console.error('parse problem:', f, res.message);
}
const t1 = process.hrtime.bigint();
const genesis = (events as {id?: [string, string | null]}[]).find(
	e => e.id && e.id[1] == null,
)?.id?.[0];
if (!genesis) {
	console.error('no genesis event found');
	process.exit(1);
}
const sorted = sortEvents(events as never, genesis);
const t2 = process.hrtime.bigint();
const rssMb = process.memoryUsage().rss / 1048576;
const peakMb = process.memoryUsage().heapUsed / 1048576;

console.log(
	JSON.stringify({
		label,
		files: files.length,
		events: events.length,
		sorted: sorted.length,
		bytes,
		parseMs: +ms(t0, t1).toFixed(2),
		sortMs: +ms(t1, t2).toFixed(2),
		totalMs: +ms(t0, t2).toFixed(2),
		heapUsedMb: +peakMb.toFixed(1),
		rssMb: +rssMb.toFixed(1),
	}),
);
