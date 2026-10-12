import {resolveEnvActor} from '../lib/config/actor-env.js';
import {loadSettingsFromConfig} from '../lib/config/user-config.js';
import {
	isFail,
	isSuccess,
	Result,
	succeeded,
	failed,
} from '../lib/model/result-types.js';
import {patchSettingsState} from '../lib/state/settings.state.js';
import {OME_VERSION} from '../version.js';
import {launchBanner} from './launch-banner.js';
import {canOpenBrowser, openBrowser} from './open-browser.js';
import {startGuiServer} from './api/api-server.js';
import {
	canonicalRepoRoot,
	PREFERRED_GUI_PORT,
	probeGuiInstance,
} from './api/instance.js';
import {
	AccessMode,
	AccessStore,
	ACCESS_LABELS,
	bindHost,
	createRemoteAccess,
	qrTerminalLines,
	startQuickTunnel,
} from './api/lib/remote-access.js';

export const startGui = async (input: {
	repoRoot: string;
	// False for `--no-open`.
	open?: boolean;
	// Who else can reach the board; see lib/remote-access.
	access?: AccessMode;
	allowHosts?: readonly string[];
	rotateToken?: boolean;
}): Promise<Result<{url: string}>> => {
	const mode = input.access ?? 'local';
	const store = AccessStore.open({rotate: input.rotateToken});

	if (input.rotateToken) {
		console.log(
			'Rotated the owner token; every signed-in device is signed out.',
		);
	}

	const open = (url: string) => {
		if (input.open !== false && canOpenBrowser()) openBrowser(url);
	};

	// The GUI server process has its own settings singleton; without this it never
	// picks up the user's config and silently falls back to $VISUAL/$EDITOR.
	// Same as the TUI: an unresolvable environment actor is fatal, because
	// carrying on means serving the board as the configured user instead.
	const envActor = resolveEnvActor({});
	if (isFail(envActor)) return failed(envActor.message);

	const settings = loadSettingsFromConfig();
	if (isSuccess(settings)) patchSettingsState(settings.value);

	// An ome already serving this project on the usual port is the one to open,
	// not something to start a rival to. A second server would land on an
	// ephemeral port, and since browser storage is scoped to the whole origin —
	// port included — that new origin arrives with none of the panel widths,
	// board selection or lane state the first one has been keeping.
	//
	// Only this exact case is reused. A different project, or anything that
	// isn't ome, falls through to the existing fallback: taking a port from
	// either of them is a decision for TYR7186, not a side effect of booting.
	const running = await probeGuiInstance(PREFERRED_GUI_PORT);

	if (
		mode === 'local' &&
		running &&
		running.repoRoot === canonicalRepoRoot(input.repoRoot)
	) {
		const url = `http://127.0.0.1:${PREFERRED_GUI_PORT}`;

		console.log(
			launchBanner({
				url,
				repoRoot: input.repoRoot,
				version: OME_VERSION,
				reused: true,
			}),
		);

		open(url);

		return succeeded('Reused running GUI', {url});
	}

	const host = bindHost(mode);
	const access = createRemoteAccess({
		mode,
		store,
		allowHosts: input.allowHosts,
		boundHost: host,
	});

	const serverResult = await startGuiServer({
		repoRoot: input.repoRoot,
		boardId: '',
		host,
		access,
	});

	if (isFail(serverResult)) return serverResult;

	const {url, server} = serverResult.value;
	const port = Number(new URL(url).port);

	// A direct listener on the LAN or tailnet address is reached over plain
	// http on that address; a proxy or tunnel says its own origin.
	if (host !== '127.0.0.1') access.publicOrigins.push(`http://${host}:${port}`);

	if (mode === 'cloudflare') {
		try {
			const tunnel = await startQuickTunnel(port);
			access.allowedHostnames.add(new URL(tunnel.origin).hostname);
			access.publicOrigins.unshift(tunnel.origin);
			server?.on('close', () => tunnel.process.kill());
			process.on('exit', () => tunnel.process.kill());
		} catch (error) {
			server?.close();
			return failed(error instanceof Error ? error.message : String(error));
		}
	}

	const remote =
		mode === 'local' && access.publicOrigins.length === 0
			? undefined
			: (() => {
					const origin = access.publicOrigins[0];
					const signIn = origin
						? `${origin}/login?token=${encodeURIComponent(store.ownerToken)}`
						: null;

					return {
						access: `${ACCESS_LABELS[mode]}${
							access.publicOrigins.length
								? ` · ${access.publicOrigins.join(', ')}`
								: ''
						}`,
						signIn,
						qr: signIn ? qrTerminalLines(signIn) : [],
					};
			  })();

	console.log(
		launchBanner({
			url,
			repoRoot: input.repoRoot,
			version: OME_VERSION,
			reused: false,
			remote,
		}),
	);

	open(url);

	return succeeded('Started GUI', {url});
};
