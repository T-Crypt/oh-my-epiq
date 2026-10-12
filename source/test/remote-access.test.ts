import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type http from 'node:http';
import {afterEach, describe, expect, it} from 'vitest';
import {isForeignOrigin} from '../gui/api/lib/origin-guard.js';
import {
	AccessStore,
	authorize,
	createRemoteAccess,
	isAllowedHost,
	isLoopbackRequest,
	qrTerminalLines,
	readSignInInput,
} from '../gui/api/lib/remote-access.js';

const dirs: string[] = [];

const tempDir = () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ome-access-'));
	dirs.push(dir);

	return dir;
};

afterEach(() => {
	for (const dir of dirs.splice(0))
		fs.rmSync(dir, {recursive: true, force: true});
});

// What a request looks like to the guards: its socket's peer and its headers.
const request = (
	headers: Record<string, string>,
	remoteAddress = '127.0.0.1',
): http.IncomingMessage =>
	({headers, socket: {remoteAddress}} as unknown as http.IncomingMessage);

const access = (dir = tempDir()) =>
	createRemoteAccess({
		mode: 'local',
		store: AccessStore.open({dir}),
		allowHosts: ['https://board.example.ts.net', 'phone.lan'],
	});

describe('AccessStore', () => {
	it('keeps one owner token across opens, in a file only the owner reads', () => {
		const dir = tempDir();
		const first = AccessStore.open({dir});
		const second = AccessStore.open({dir});

		expect(second.ownerToken).toBe(first.ownerToken);
		expect(second.isOwnerToken(first.ownerToken)).toBe(true);
		expect(second.isOwnerToken('guess')).toBe(false);
		expect(second.isOwnerToken(undefined)).toBe(false);
		expect(fs.statSync(path.join(dir, 'gui-access.json')).mode & 0o777).toBe(
			0o600,
		);
	});

	it('rotating signs every device out', () => {
		const dir = tempDir();
		const before = AccessStore.open({dir}).ownerToken;
		const after = AccessStore.open({dir, rotate: true});

		expect(after.ownerToken).not.toBe(before);
		expect(after.isOwnerToken(before)).toBe(false);
	});

	it('a pairing code works once, and not after it expires', () => {
		const store = AccessStore.open({dir: tempDir()});
		const now = 1_000_000;
		const {code} = store.createPairing(now);

		expect(code).toMatch(/^[a-z0-9]{10}$/);
		// Typed on a phone: capitalised, with the space the sheet shows.
		expect(
			store.redeemPairing(
				`${code.slice(0, 5).toUpperCase()} ${code.slice(5)}`,
				now,
			),
		).toBe(true);
		expect(store.redeemPairing(code, now)).toBe(false);

		const late = store.createPairing(now);
		expect(store.redeemPairing(late.code, now + 16 * 60_000)).toBe(false);
	});
});

describe('who is let in', () => {
	it('lets this machine’s own browser in without a token, as before', () => {
		const remote = access();

		expect(authorize(request({host: '127.0.0.1:3710'}), remote)).toBe('local');
		expect(authorize(request({host: 'ome.localhost:3710'}), remote)).toBe(
			'local',
		);
	});

	it('asks a proxied request for the token, even over loopback', () => {
		const remote = access();
		const proxied = request({
			host: 'board.example.ts.net',
			'x-forwarded-for': '100.101.102.103',
		});

		expect(isLoopbackRequest(proxied)).toBe(false);
		expect(authorize(proxied, remote)).toBeNull();
		// A loopback name is not enough when something forwarded it.
		expect(
			authorize(
				request({host: '127.0.0.1:3710', 'x-forwarded-for': '100.64.0.9'}),
				remote,
			),
		).toBeNull();
	});

	it.each([
		'cf-connecting-ip',
		'forwarded',
		'x-real-ip',
		'tailscale-user-login',
	])('treats a loopback request carrying %s as forwarded', header => {
		expect(
			isLoopbackRequest(request({host: '127.0.0.1:3710', [header]: 'x'})),
		).toBe(false);
	});

	it('takes the token as a cookie or a bearer header', () => {
		const remote = access();
		const token = remote.store.ownerToken;

		expect(
			authorize(
				request(
					{host: 'phone.lan:3710', cookie: `ome_auth=${token}`},
					'10.0.0.9',
				),
				remote,
			),
		).toBe('token');
		expect(
			authorize(
				request(
					{host: 'phone.lan:3710', authorization: `Bearer ${token}`},
					'10.0.0.9',
				),
				remote,
			),
		).toBe('token');
	});

	it('refuses a name it was not told it answers to', () => {
		const remote = access();

		expect(isAllowedHost(request({host: 'board.example.ts.net'}), remote)).toBe(
			true,
		);
		expect(isAllowedHost(request({host: 'phone.lan:3710'}), remote)).toBe(true);
		expect(
			isAllowedHost(request({host: 'rebound.evil.example:3710'}), remote),
		).toBe(false);
	});
});

describe('isForeignOrigin, for a board reached remotely', () => {
	const remote = access();
	const via = (host: string) => ({req: request({host}), access: remote});

	it('accepts the origin a public URL vouches for, port dropped by the proxy', () => {
		expect(
			isForeignOrigin(
				'https://board.example.ts.net',
				3710,
				via('board.example.ts.net'),
			),
		).toBe(false);
	});

	it('accepts an allowed host when it is the host the request went to', () => {
		expect(
			isForeignOrigin('http://phone.lan:3710', 3710, via('phone.lan:3710')),
		).toBe(false);
	});

	it('rejects another port on an allowed host: same site, so it has the cookie', () => {
		expect(
			isForeignOrigin('http://phone.lan:8795', 3710, via('phone.lan:3710')),
		).toBe(true);
	});

	it('rejects a host nobody allowed', () => {
		expect(
			isForeignOrigin(
				'https://evil.example',
				3710,
				via('board.example.ts.net'),
			),
		).toBe(true);
	});

	it('keeps the loopback rule unchanged', () => {
		expect(
			isForeignOrigin('http://127.0.0.1:3710', 3710, via('127.0.0.1:3710')),
		).toBe(false);
		expect(
			isForeignOrigin('https://127.0.0.1:3710', 3710, via('127.0.0.1:3710')),
		).toBe(true);
	});
});

describe('readSignInInput', () => {
	it('reads a sign-in link, a pairing link, a code or a bare token', () => {
		expect(readSignInInput('https://b.example/login?token=abc')).toEqual({
			token: 'abc',
		});
		expect(readSignInInput('https://b.example/join/abcde23456')).toEqual({
			code: 'abcde23456',
		});
		expect(readSignInInput('Abcde 23456')).toEqual({code: 'abcde23456'});
		expect(readSignInInput('x'.repeat(43))).toEqual({token: 'x'.repeat(43)});
		expect(readSignInInput('   ')).toBeNull();
	});
});

describe('qrTerminalLines', () => {
	it('draws a square code with a quiet zone', () => {
		const lines = qrTerminalLines(
			'https://board.example.ts.net/join/abcde23456',
		);

		expect(lines.length).toBeGreaterThan(10);
		expect(new Set(lines.map(line => line.length)).size).toBe(1);
		expect(lines[0]).toMatch(/^█+$/);
	});
});
