/**
 * Binding to loopback is not a security boundary in a browser. Any page the
 * user happens to have open can POST to `http://127.0.0.1:<port>`, and a
 * WebSocket handshake is exempt from the same-origin policy altogether — so
 * without this, a drive-by page could drive the whole board and `git push` the
 * damage.
 *
 * A browser always sends `Origin` on a WebSocket handshake and on any
 * state-changing method, so "present and not ours" is the whole attack. A
 * request with no `Origin` is not coming from a page and has nothing to spoof;
 * it is left alone so curl and the test harness keep working.
 */
import type http from 'node:http';
import {isOwnRemoteOrigin, type RemoteAccess} from './remote-access.js';

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
	'127.0.0.1',
	'[::1]',
	'localhost',
	// What `startGuiServer` advertises.
	'ome.localhost',
]);

// The request the Origin came with, and the names the server was told to
// answer to. Absent, only the loopback rule below applies.
export type RemoteOriginContext = {
	req: http.IncomingMessage;
	access: RemoteAccess;
};

export const isForeignOrigin = (
	origin: string | undefined,
	port: number,
	remote?: RemoteOriginContext,
): boolean => {
	if (!origin) return false;

	// A sandboxed iframe or a `file://` page. Opaque, so never ours.
	if (origin === 'null') return true;

	let url: URL;
	try {
		url = new URL(origin);
	} catch {
		return true;
	}

	// A phone on the tailnet, behind `tailscale serve` or on the LAN address:
	// see `isOwnRemoteOrigin` for why the host has to match the request's.
	if (
		remote &&
		!LOOPBACK_HOSTS.has(url.hostname) &&
		isOwnRemoteOrigin(url, remote.req, remote.access)
	) {
		return false;
	}

	if (url.protocol !== 'http:') return true;
	if (url.port !== String(port)) return true;

	return !LOOPBACK_HOSTS.has(url.hostname);
};

/**
 * Two independent gates, because either alone leaves a hole: `Origin` catches
 * a cross-origin request that carries one, and requiring JSON forces
 * everything else into a preflight this server never answers. Without the
 * second, a `text/plain` POST is a CORS *simple request* — no preflight, so
 * any page the user has open could write to the board.
 *
 * Returns the refusal to send, or null to let the request through.
 */
export const refuseCrossSiteRequest = (
	request: {
		method: string | undefined;
		origin: string | undefined;
		contentType: string | undefined;
	},
	port: number,
	remote?: RemoteOriginContext,
): {status: number; message: string} | null => {
	if (request.method === 'GET' || request.method === 'HEAD') return null;

	if (isForeignOrigin(request.origin, port, remote)) {
		return {status: 403, message: 'Cross-origin request'};
	}

	if (
		request.method === 'POST' &&
		!(request.contentType ?? '').toLowerCase().startsWith('application/json')
	) {
		return {status: 415, message: 'Expected content-type: application/json'};
	}

	return null;
};
