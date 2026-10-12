// How a phone or another machine reaches the board, after Oh-My-Pocket: an
// access mode that decides where the server listens, an owner token that signs
// a browser in for a year, and short pairing codes a signed-in device can show
// as a QR so the next one never has to type the token.
//
// A request from this machine to a loopback name is the board's own browser and
// needs none of it, as before. Anything else — another device on the network,
// or a proxy in front such as `tailscale serve` — must carry the token.
import {spawn, type ChildProcess} from 'node:child_process';
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import {networkInterfaces} from 'node:os';
import path from 'node:path';
import {createInterface} from 'node:readline';
import qrcode from 'qrcode-generator';
import {getGlobalConfigDir} from '../../../lib/storage/global-config-dir.js';

export type AccessMode = 'local' | 'lan' | 'tailscale' | 'cloudflare';
export const ACCESS_MODES: readonly AccessMode[] = [
	'local',
	'lan',
	'tailscale',
	'cloudflare',
];

export const ACCESS_LABELS: Record<AccessMode, string> = {
	local: 'This device only',
	lan: 'Local network',
	tailscale: 'Tailscale',
	cloudflare: 'Cloudflare Tunnel',
};

export const isAccessMode = (value: unknown): value is AccessMode =>
	typeof value === 'string' &&
	(ACCESS_MODES as readonly string[]).includes(value);

export const COOKIE = 'ome_auth';
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;
export const PAIRING_MINUTES = 15;
const ACCESS_FILE = 'gui-access.json';

// The names a browser on this machine reaches the server by.
export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
	'127.0.0.1',
	'[::1]',
	'::1',
	'localhost',
	'ome.localhost',
]);

// ─── Addresses ──────────────────────────────────────────────────────────

/** Tailscale hands out addresses in 100.64.0.0/10. */
const isTailscaleAddress = (address: string): boolean => {
	const [first, second] = address.split('.').map(Number);

	return first === 100 && second !== undefined && second >= 64 && second <= 127;
};

const ipv4Addresses = (): {name: string; address: string}[] =>
	Object.entries(networkInterfaces()).flatMap(([name, list]) =>
		(list ?? [])
			.filter(net => net.family === 'IPv4' && !net.internal)
			.map(net => ({name, address: net.address})),
	);

/** This machine's addresses on the local network, Tailscale's excluded. */
export const lanAddresses = (): string[] =>
	ipv4Addresses()
		.filter(each => !isTailscaleAddress(each.address))
		.map(each => each.address);

export const tailscaleAddress = (): string | undefined => {
	const candidates = ipv4Addresses().filter(each =>
		isTailscaleAddress(each.address),
	);

	return (
		candidates.find(each => /tailscale|utun|tun/i.test(each.name)) ??
		candidates[0]
	)?.address;
};

/**
 * Where the server listens. Never every interface: the local network mode takes
 * the machine's own LAN address, and Tailscale its tailnet address, so each
 * mode opens exactly the one network it names. A tunnel reaches the server on
 * this machine, so it stays on loopback.
 */
export const bindHost = (mode: AccessMode): string => {
	if (mode === 'lan') return lanAddresses()[0] ?? '127.0.0.1';
	if (mode === 'tailscale') return tailscaleAddress() ?? '127.0.0.1';

	return '127.0.0.1';
};

// ─── The token and pairing codes ────────────────────────────────────────

const hash = (value: string): Buffer =>
	createHash('sha256').update(value).digest();

const newToken = (): string => randomBytes(32).toString('base64url');

// Unambiguous characters, easy to type on a phone: no 0/o, 1/l/i.
const PAIRING_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const PAIRING_CODE = /^[a-z0-9]{10}$/;

const newPairingCode = (): string =>
	Array.from(
		randomBytes(10),
		byte => PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length],
	).join('');

export class AccessStore {
	readonly #file: string;
	#ownerTokenHash: Buffer;
	#ownerToken: string;
	// In memory only: a code lasts a quarter of an hour, and a restart taking
	// the open ones with it costs a tap on "Add a device".
	readonly #pairings = new Map<string, number>();

	constructor(file: string, ownerToken: string) {
		this.#file = file;
		this.#ownerToken = ownerToken;
		this.#ownerTokenHash = hash(ownerToken);
	}

	/**
	 * The owner token from `<global dir>/gui-access.json`, created on first use
	 * with mode 600 — it is a password for the whole board. `rotate` replaces it,
	 * which signs every device out.
	 */
	static open(options: {rotate?: boolean; dir?: string} = {}): AccessStore {
		const dir = options.dir ?? getGlobalConfigDir();
		const file = path.join(dir, ACCESS_FILE);
		let token: string | undefined;

		if (!options.rotate) {
			try {
				const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
					ownerToken?: unknown;
				};
				if (
					typeof parsed.ownerToken === 'string' &&
					parsed.ownerToken.length >= 32
				) {
					token = parsed.ownerToken;
				}
			} catch {
				// Absent or unreadable: a new one below.
			}
		}

		const store = new AccessStore(file, token ?? newToken());

		if (!token) store.#write();

		return store;
	}

	#write(): void {
		fs.mkdirSync(path.dirname(this.#file), {recursive: true, mode: 0o700});
		const temp = `${this.#file}.${process.pid}.tmp`;
		fs.writeFileSync(
			temp,
			`${JSON.stringify({ownerToken: this.#ownerToken}, null, 2)}\n`,
			{mode: 0o600},
		);
		fs.renameSync(temp, this.#file);
		fs.chmodSync(this.#file, 0o600);
	}

	get ownerToken(): string {
		return this.#ownerToken;
	}

	isOwnerToken(candidate: string | undefined): boolean {
		if (!candidate) return false;

		return timingSafeEqual(hash(candidate), this.#ownerTokenHash);
	}

	/** A single-use code that signs one more device in, for 15 minutes. */
	createPairing(now = Date.now()): {code: string; expiresAt: number} {
		this.#prune(now);
		const code = newPairingCode();
		const expiresAt = now + PAIRING_MINUTES * 60_000;

		this.#pairings.set(hash(code).toString('hex'), expiresAt);

		return {code, expiresAt};
	}

	/** True once for a live code, which is then spent. */
	redeemPairing(code: string, now = Date.now()): boolean {
		this.#prune(now);
		const key = hash(code.toLowerCase().replace(/\s+/g, '')).toString('hex');
		const expiresAt = this.#pairings.get(key);

		if (expiresAt === undefined) return false;

		this.#pairings.delete(key);

		return expiresAt > now;
	}

	#prune(now: number): void {
		for (const [key, expiresAt] of this.#pairings) {
			if (expiresAt <= now) this.#pairings.delete(key);
		}
	}
}

// ─── Requests ───────────────────────────────────────────────────────────

export const parseCookies = (
	header: string | undefined,
): Record<string, string> => {
	const out: Record<string, string> = {};

	for (const part of (header ?? '').split(';')) {
		const index = part.indexOf('=');
		if (index <= 0) continue;

		const key = part.slice(0, index).trim();
		const value = part.slice(index + 1).trim();

		try {
			out[key] = decodeURIComponent(value);
		} catch {
			out[key] = value;
		}
	}

	return out;
};

const firstHeader = (value: string | string[] | undefined): string =>
	((Array.isArray(value) ? value[0] : value) ?? '').split(',')[0]?.trim() ?? '';

/** https when TLS ended here or at a proxy in front, such as `tailscale serve`. */
export const isHttps = (req: http.IncomingMessage): boolean =>
	firstHeader(req.headers['x-forwarded-proto']) === 'https' ||
	(req.socket as {encrypted?: boolean}).encrypted === true;

/** The host the browser asked for, port included when it gave one. */
export const requestHost = (req: http.IncomingMessage): string =>
	(
		firstHeader(req.headers['x-forwarded-host']) ||
		firstHeader(req.headers.host)
	).toLowerCase();

export const hostnameOf = (host: string): string => {
	if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);

	return host.replace(/:\d+$/, '');
};

const isLoopbackAddress = (address: string | undefined): boolean =>
	address === '127.0.0.1' ||
	address === '::1' ||
	address === '::ffff:127.0.0.1';

/**
 * The board's own browser on this machine: a loopback socket, a loopback name,
 * and nothing in front of it. A proxy on this machine arrives over loopback
 * too, which is why the forwarding headers count — `tailscale serve` sets them
 * and a tailnet visitor is not this machine's user.
 */
// Any one of these says something stood between the browser and this server.
// A tunnel that rewrites Host to a loopback name — cloudflared can — still adds
// its own, so a visitor from the internet never passes for this machine.
const FORWARDING_HEADERS = [
	'forwarded',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
	'x-real-ip',
	'cf-connecting-ip',
	'tailscale-user-login',
] as const;

export const isLoopbackRequest = (req: http.IncomingMessage): boolean =>
	isLoopbackAddress(req.socket.remoteAddress) &&
	LOOPBACK_HOSTS.has(hostnameOf(requestHost(req))) &&
	FORWARDING_HEADERS.every(name => req.headers[name] === undefined);

export type RemoteAccess = {
	mode: AccessMode;
	store: AccessStore;
	// Hostnames besides loopback a browser may name: the address the server
	// bound, every `--allow-host`, a tunnel's name once it is known.
	allowedHostnames: Set<string>;
	// Exact origins vouched for, from an `--allow-host` given as a URL. What a
	// proxy that drops the port from Host needs, and what links and QR codes
	// are built on.
	publicOrigins: string[];
};

/**
 * `--allow-host` takes a bare name (`aphotic.example.ts.net`) or the URL a
 * browser will open (`https://aphotic.example.ts.net:3710`). A URL also
 * becomes a public origin, which links are built on.
 */
export const createRemoteAccess = (input: {
	mode: AccessMode;
	store: AccessStore;
	allowHosts?: readonly string[];
	boundHost?: string;
}): RemoteAccess => {
	const allowedHostnames = new Set<string>();
	const publicOrigins: string[] = [];

	for (const raw of input.allowHosts ?? []) {
		const value = raw.trim().toLowerCase();
		if (!value) continue;

		if (/^https?:\/\//.test(value)) {
			try {
				const url = new URL(value);
				allowedHostnames.add(url.hostname);
				publicOrigins.push(url.origin);
			} catch {
				// Not a URL after all; ignored rather than allowing a garbled name.
			}
		} else {
			allowedHostnames.add(hostnameOf(value));
		}
	}

	if (input.boundHost && !LOOPBACK_HOSTS.has(input.boundHost)) {
		allowedHostnames.add(input.boundHost);
	}

	return {
		mode: input.mode,
		store: input.store,
		allowedHostnames,
		publicOrigins,
	};
};

/**
 * A name this server answers to. Anything else is refused before it reaches a
 * route: a page that rebinds its own name to this machine's address arrives
 * under that name, and must find nothing here.
 */
export const isAllowedHost = (
	req: http.IncomingMessage,
	access: RemoteAccess,
): boolean => {
	const hostname = hostnameOf(requestHost(req));

	return LOOPBACK_HOSTS.has(hostname) || access.allowedHostnames.has(hostname);
};

export const requestToken = (req: http.IncomingMessage): string | undefined => {
	const cookie = parseCookies(req.headers.cookie)[COOKIE];
	if (cookie) return cookie;

	const bearer = String(req.headers.authorization ?? '');

	return bearer.startsWith('Bearer ') ? bearer.slice(7).trim() : undefined;
};

/** 'local' for this machine's own browser, 'token' for a signed-in device. */
export const authorize = (
	req: http.IncomingMessage,
	access: RemoteAccess,
): 'local' | 'token' | null => {
	if (isLoopbackRequest(req)) return 'local';

	return access.store.isOwnerToken(requestToken(req)) ? 'token' : null;
};

/**
 * Whether a page at `origin` is one this server served, for the CSRF and
 * WebSocket guards. Loopback keeps the old rule — plain http on the bound port.
 * A remote name must be allowed, and either a vouched-for origin or the very
 * host the request was sent to, so a page on another port of the same machine
 * (same site, so it carries the cookie) is still foreign.
 */
export const isOwnRemoteOrigin = (
	origin: URL,
	req: http.IncomingMessage,
	access: RemoteAccess,
): boolean => {
	if (origin.protocol !== 'http:' && origin.protocol !== 'https:') return false;
	if (!access.allowedHostnames.has(origin.hostname)) return false;

	return (
		access.publicOrigins.includes(origin.origin) ||
		origin.host === requestHost(req)
	);
};

export const setAuthCookie = (
	req: http.IncomingMessage,
	res: http.ServerResponse,
	token: string,
): void => {
	res.setHeader(
		'set-cookie',
		[
			`${COOKIE}=${encodeURIComponent(token)}`,
			'Path=/',
			'HttpOnly',
			'SameSite=Lax',
			`Max-Age=${COOKIE_MAX_AGE_S}`,
			...(isHttps(req) ? ['Secure'] : []),
		].join('; '),
	);
};

export const clearAuthCookie = (res: http.ServerResponse): void => {
	res.setHeader(
		'set-cookie',
		`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
	);
};

/** The origin a browser reached this request on. */
export const requestOrigin = (req: http.IncomingMessage): string =>
	`${isHttps(req) ? 'https' : 'http'}://${requestHost(req) || 'localhost'}`;

// ─── Sign-in pages ──────────────────────────────────────────────────────

const escapeHtml = (value: string): string =>
	value.replace(
		/[&<>"']/g,
		char =>
			({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[
				char
			] ?? char),
	);

export const signInPage = (message?: string): string =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="color-scheme" content="dark"><meta name="theme-color" content="var(--o-bg, #13141c)"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="referrer" content="no-referrer"><title>Sign in · OME</title><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/ome.css"></head><body class="plain-page"><main class="signin"><div class="signin-mark" aria-hidden="true">:ome</div><h1>Sign in to OME</h1>${
		message ? `<p class="notice err">${escapeHtml(message)}</p>` : ''
	}<p class="muted">Scan the QR code from <b>Devices</b> on a signed-in board, or open the sign-in link <code>ome gui</code> printed when it started. You can also paste the link, the token or a pairing code here.</p><form method="get" action="/login" class="row"><input name="token" placeholder="Link, token or code" autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false" autofocus><button class="button primary" type="submit">Sign in</button></form></main></body></html>`;

/** What somebody pasted: a sign-in link, a pairing link, a token or a code. */
export const readSignInInput = (
	raw: string,
): {token: string} | {code: string} | null => {
	const text = raw.trim();
	if (!text) return null;

	try {
		const url = new URL(text);
		const token = url.searchParams.get('token');
		if (token) return readSignInInput(token);

		const join = /^\/join\/([^/]+)$/.exec(url.pathname);
		if (join?.[1]) return {code: join[1]};
	} catch {
		// Not a URL.
	}

	// Phones capitalise the first letter typed, and the sheet shows a code in
	// two groups, so case and spaces are not part of it.
	const code = text.toLowerCase().replace(/\s+/g, '');
	if (PAIRING_CODE.test(code)) return {code};

	return {token: text};
};

/** Where to go once signed in: a path on this server, never `//host`. */
const localPath = (next: string | null): string =>
	next !== null && /^\/(?![/\\])/.test(next) ? next : '/';

const sendHtml = (
	res: http.ServerResponse,
	status: number,
	html: string,
): void => {
	res.writeHead(status, {
		'content-type': 'text/html; charset=utf-8',
		'cache-control': 'no-store',
		'referrer-policy': 'no-referrer',
	});
	res.end(html);
};

/**
 * `/login?token=` and `/join/<code>`. GET only, so the sign-in form needs no
 * script and no exemption from the JSON-only rule on writes. Returns false for
 * any other path.
 */
export const handleSignInRoute = (
	req: http.IncomingMessage,
	res: http.ServerResponse,
	url: URL,
	access: RemoteAccess,
): boolean => {
	if (req.method !== 'GET' && req.method !== 'HEAD') return false;

	const join = /^\/join\/([^/]+)$/.exec(url.pathname);
	const input =
		url.pathname === '/login'
			? readSignInInput(url.searchParams.get('token') ?? '')
			: join?.[1]
			? {code: join[1]}
			: undefined;

	if (input === undefined) {
		if (url.pathname === '/signin') {
			sendHtml(res, 200, signInPage());
			return true;
		}

		return false;
	}

	const signedIn =
		input !== null &&
		('token' in input
			? access.store.isOwnerToken(input.token)
			: access.store.redeemPairing(input.code));

	if (!signedIn) {
		sendHtml(
			res,
			401,
			signInPage(
				input && 'code' in input
					? 'That pairing code has expired or was already used. Make a new one from Devices.'
					: 'That sign-in link is not valid. It may have been rotated.',
			),
		);
		return true;
	}

	setAuthCookie(req, res, access.store.ownerToken);
	res.writeHead(303, {
		location: localPath(url.searchParams.get('next')),
		'referrer-policy': 'no-referrer',
	});
	res.end();

	return true;
};

// ─── QR codes ───────────────────────────────────────────────────────────

const qrMatrix = (text: string): boolean[][] => {
	const qr = qrcode(0, 'M');
	qr.addData(text);
	qr.make();
	const size = qr.getModuleCount();

	return Array.from({length: size}, (_, row) =>
		Array.from({length: size}, (_, col) => qr.isDark(row, col)),
	);
};

/** Half-block QR for a terminal: two rows per line, a quiet zone around it. */
export const qrTerminalLines = (text: string): string[] => {
	const matrix = qrMatrix(text);
	const size = matrix.length;
	const quiet = 2;
	const at = (row: number, col: number) =>
		row >= 0 && row < size && col >= 0 && col < size
			? matrix[row]![col]!
			: false;
	const lines: string[] = [];

	for (let row = -quiet; row < size + quiet; row += 2) {
		let line = '';

		for (let col = -quiet; col < size + quiet; col++) {
			const top = at(row, col);
			const bottom = at(row + 1, col);
			// Light modules drawn, dark left as the terminal's ground: reads on a
			// dark terminal, which is what scanners need.
			line += top ? (bottom ? ' ' : '▄') : bottom ? '▀' : '█';
		}

		lines.push(line);
	}

	return lines;
};

/** A self-contained SVG, dark modules on white, for the Devices sheet. */
export const qrSvg = (text: string): string => {
	const matrix = qrMatrix(text);
	const size = matrix.length;
	const quiet = 4;
	const total = size + quiet * 2;
	let pathData = '';

	for (const [row, cells] of matrix.entries()) {
		for (const [col, dark] of cells.entries()) {
			if (dark) pathData += `M${col + quiet} ${row + quiet}h1v1h-1z`;
		}
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${pathData}" fill="#000"/></svg>`;
};

// ─── Cloudflare quick tunnel ────────────────────────────────────────────

/**
 * `cloudflared tunnel --url`, from PATH only: OME does not download binaries.
 * Resolves with the public `trycloudflare.com` origin once cloudflared prints
 * it. The tunnel is public — anyone with the URL reaches the sign-in page, and
 * the token is all that stands behind it.
 */
export const startQuickTunnel = (
	port: number,
): Promise<{origin: string; process: ChildProcess}> =>
	new Promise((resolve, reject) => {
		const child = spawn(
			'cloudflared',
			['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`],
			{stdio: ['ignore', 'ignore', 'pipe']},
		);
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error('cloudflared did not report a tunnel URL in 60s'));
		}, 60_000);

		child.once('error', error => {
			clearTimeout(timer);
			reject(
				new Error(
					`cloudflared is not available (${error.message}); install it or pick another --access`,
				),
			);
		});

		createInterface({input: child.stderr!}).on('line', line => {
			const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(line);

			if (match) {
				clearTimeout(timer);
				resolve({origin: match[0], process: child});
			}
		});
	});
