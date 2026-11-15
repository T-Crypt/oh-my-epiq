/* eslint-disable */ // standalone node benchmark script, not app code
// Phase 0 baseline: MCP stdio handshake latency (time to initialize response).
// Usage: node research/benchmarks/scripts/p0-mcp-handshake.mjs <mcp-js>
import {spawn} from 'node:child_process';

const [bin] = process.argv.slice(2);
if (!bin) {
	console.error('usage: p0-mcp-handshake.mjs <mcp-js>');
	process.exit(2);
}

const runs = [];
for (let i = 0; i < 3; i++) {
	const t0 = process.hrtime.bigint();
	const child = spawn(process.execPath, [bin], {
		stdio: ['pipe', 'pipe', 'ignore'],
	});
	let buf = '';
	const timer = setTimeout(() => {
		console.error('timeout waiting for initialize response');
		child.kill();
		process.exit(1);
	}, 15000);
	child.stdout.on('data', d => {
		buf += d.toString();
		const idx = buf.indexOf('\n');
		if (idx === -1) return;
		clearTimeout(timer);
		const ms = Number(process.hrtime.bigint() - t0) / 1e6;
		const msg = JSON.parse(buf.slice(0, idx));
		if (msg.id === 1 && msg.result) {
			runs.push(ms);
			console.log(
				`run ${i + 1}: ${ms.toFixed(1)} ms, server ${
					msg.result.serverInfo.name
				} ${msg.result.serverInfo.version}`,
			);
		}
		child.kill();
	});
	child.stdin.write(
		'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"bench","version":"0"}}}\n',
	);
}
if (runs.length) {
	console.log(
		`median handshake: ${runs
			.sort((a, b) => a - b)
			[Math.floor(runs.length / 2)].toFixed(1)} ms (n=${runs.length})`,
	);
}
