import {spawn} from 'node:child_process';
import process from 'node:process';

// Opening a window is a convenience for a person at a terminal. A pipe, a script
// or an agent has no tty and must not take the operator's desktop, so the tty is
// the default signal. One env switch says never, for a harness the pty has handed
// a tty; the other says a no-terminal launcher, a keybind, meant it.
export const canOpenBrowser = (
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
	interactive: boolean = Boolean(process.stdout.isTTY),
): boolean =>
	(interactive || env['OME_GUI_OPEN'] !== undefined) &&
	env['OME_GUI_NO_OPEN'] === undefined &&
	// Elsewhere xdg-open needs a display, or a $BROWSER to hand the URL to (how
	// WSL opens the Windows one). With neither, the banner's URL is the way in.
	(platform === 'darwin' ||
		platform === 'win32' ||
		Boolean(env['DISPLAY'] || env['WAYLAND_DISPLAY'] || env['BROWSER']));

// Best-effort: a missing opener (a slim container has no xdg-open) must not take
// the server down with it.
export const openBrowser = (url: string) => {
	const command =
		process.platform === 'darwin'
			? 'open'
			: process.platform === 'win32'
			? 'cmd'
			: 'xdg-open';

	const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];

	try {
		const child = spawn(command, args, {
			detached: true,
			stdio: 'ignore',
		});

		child.on('error', error => {
			logger.info(`[gui] could not open a browser: ${error.message}`);
		});
		child.unref();
	} catch (error) {
		logger.info(`[gui] could not open a browser: ${String(error)}`);
	}
};
