// The height the phone shell fills, taken from the viewport a person can actually see.
//
// `100dvh` is the layout viewport. On a phone that is usually the visible one, and the shell fills it, with the tab bar
// pinned to its bottom edge. An installed web app on iOS 26 draws a top bar and a bottom toolbar over the page and
// reports neither as a safe-area inset, so the layout viewport is taller than what is on screen: the shell's last
// strip, the tab bar's padding and the lower half of its labels, is painted under that toolbar and clipped. No env()
// or dvh value describes it. The visual viewport does, so this module reads it and hands the shell a height.

/** A covered strip this share of the layout viewport or more is not chrome: it is the keyboard. */
const KEYBOARD_SHARE = 0.3;

/** Sub-pixel difference between the two viewports: rounding, not something drawn over the app. */
const ROUNDING_SLACK = 1;

export type ViewportReading = {
	/** What `100dvh` resolves to, measured. */
	layoutHeight: number;
	/** What the platform says is visible (the visual viewport). */
	visibleHeight: number;
	/** The home-indicator inset, resolved to a length. */
	safeBottom: number;
	/** A text field holds focus, so a shorter visual viewport is the keyboard rather than chrome. */
	typing: boolean;
};

export type ViewportFix = {
	/** Height for the phone shell: the visible viewport, not the layout one. */
	appHeight: number;
	/** What the tab bar still keeps clear at the bottom: the inset, less what the chrome already covers. */
	padBottom: number;
};

/**
 * Where the page runs. Only an installed web app draws chrome over the page that no inset describes; a browser
 * tab reports honestly (`100dvh` already follows its toolbar), so a covered strip there is transient — a toolbar
 * mid-flight, a pinch zoom — and shrinking the shell to it floats the tab bar above a gap.
 */
export type ViewportContext = {
	/** `display-mode: standalone` matches, or the legacy iOS `navigator.standalone` flag is set. */
	standalone: boolean;
};

/**
 * Whether this page runs as an installed web app: the only place platform chrome can sit over the page without an
 * inset describing it.
 */
export const isStandaloneApp = (win: Window = window): boolean =>
	win.matchMedia('(display-mode: standalone)').matches ||
	(win.navigator as {standalone?: boolean}).standalone === true;

/**
 * The correction to apply, or null to leave the stylesheet in charge. Null is the answer everywhere the platform
 * tells the truth: `100dvh` is then both correct and cheaper than a value re-measured on every toolbar change.
 */
export const resolveViewportFix = (
	reading: ViewportReading,
	context: ViewportContext = {standalone: false},
): ViewportFix | null => {
	// A browser tab is left to the stylesheet: any covered strip there is transient, and a shell shrunk to it
	// stays shrunk (and the tab bar floats) until the next viewport event. Only an installed web app keeps
	// chrome drawn over the page.
	if (!context.standalone) return null;
	const {layoutHeight, visibleHeight, safeBottom, typing} = reading;
	if (typing) return null;
	if (!Number.isFinite(layoutHeight) || !Number.isFinite(visibleHeight))
		return null;
	if (layoutHeight <= 0 || visibleHeight <= 0) return null;

	const covered = layoutHeight - visibleHeight;
	if (covered <= ROUNDING_SLACK) return null;
	if (covered >= layoutHeight * KEYBOARD_SHARE) return null;

	const safe = Number.isFinite(safeBottom) ? Math.max(0, safeBottom) : 0;

	return {appHeight: visibleHeight, padBottom: Math.max(0, safe - covered)};
};

/** A field with the keyboard up, a picker open, or a comment box focused. */
const isTyping = (element: Element | null): boolean =>
	element instanceof HTMLElement &&
	(element.isContentEditable ||
		element.tagName === 'INPUT' ||
		element.tagName === 'TEXTAREA' ||
		element.tagName === 'SELECT');

/**
 * The element both measurements are read off. `100dvh` and `env(safe-area-inset-bottom)` are resolved by CSS, not by
 * JavaScript, so the values have to be asked of something that uses them.
 */
export const addViewportProbe = (doc: Document): HTMLElement => {
	const probe = doc.createElement('div');
	probe.dataset['omeProbe'] = 'viewport';
	probe.style.cssText = [
		'position:fixed',
		'top:0',
		'left:0',
		'width:0',
		'pointer-events:none',
		'visibility:hidden',
		'box-sizing:border-box',
		'height:100dvh',
		'padding-bottom:var(--safe-bottom)',
	].join(';');
	doc.body.appendChild(probe);

	return probe;
};

export const readViewport = (probe: HTMLElement): ViewportReading => ({
	layoutHeight: probe.getBoundingClientRect().height,
	visibleHeight: window.visualViewport?.height ?? window.innerHeight,
	safeBottom: Number.parseFloat(getComputedStyle(probe).paddingBottom),
	typing: isTyping(document.activeElement),
});

/** `?probe=1`: the numbers themselves, on the phone, while a platform draws chrome no inset describes. */
const showReadout = (doc: Document, probe: HTMLElement): void => {
	const box = doc.createElement('pre');
	box.style.cssText = [
		'position:fixed',
		'top:0',
		'left:0',
		'right:0',
		'z-index:10000',
		'margin:0',
		'padding:8px 10px',
		'font:11px/1.5 ui-monospace,monospace',
		'white-space:pre-wrap',
		'color:#fff',
		'background:rgba(0,0,0,.85)',
		'pointer-events:none',
	].join(';');

	const line = (name: string, value: unknown) => `${name}: ${String(value)}`;
	const draw = (): void => {
		const visual = window.visualViewport;
		const fix = resolveViewportFix(readViewport(probe), {
			standalone: isStandaloneApp(),
		});
		const modes = ['standalone', 'fullscreen', 'minimal-ui', 'browser'].filter(
			mode => window.matchMedia(`(display-mode: ${mode})`).matches,
		);
		box.textContent = [
			line('display-mode', modes.join(',') || 'none'),
			line(
				'standalone',
				String((window.navigator as {standalone?: boolean}).standalone),
			),
			line('screen', `${window.screen.width}x${window.screen.height}`),
			line('layout 100dvh', readViewport(probe).layoutHeight),
			line('innerHeight', window.innerHeight),
			line(
				'visual',
				visual
					? `${visual.height} @${visual.offsetTop} x${visual.scale}`
					: 'none',
			),
			line('safe bottom', getComputedStyle(probe).paddingBottom),
			line('fix', fix ? `h ${fix.appHeight} pad ${fix.padBottom}` : 'none'),
		].join('\n');
	};

	const run = (): void => {
		requestAnimationFrame(draw);
	};
	for (const event of ['resize', 'scroll', 'orientationchange'] as const) {
		window.addEventListener(event, run, {passive: true});
	}
	window.visualViewport?.addEventListener('resize', run);
	doc.body.appendChild(box);
	draw();
};

/**
 * Keep `--app-h` and `--pad-bottom` on the root in step with the platform, and return the way to stop. Called once at
 * boot. Both properties are absent wherever the stylesheet is already right, so a browser that reports honestly spends
 * nothing on this.
 */
export const installViewportHeight = (
	doc: Document = document,
	win: Window = window,
): (() => void) => {
	const root = doc.documentElement;
	const probe = addViewportProbe(doc);

	if (new URLSearchParams(win.location.search).get('probe') !== null) {
		showReadout(doc, probe);
	}

	const apply = (): void => {
		const fix = resolveViewportFix(readViewport(probe), {
			standalone: isStandaloneApp(win),
		});

		if (!fix) {
			root.style.removeProperty('--app-h');
			root.style.removeProperty('--pad-bottom');
			return;
		}

		root.style.setProperty('--app-h', `${fix.appHeight}px`);
		root.style.setProperty('--pad-bottom', `${fix.padBottom}px`);
	};

	let queued = false;
	const schedule = (): void => {
		if (queued) return;
		queued = true;
		win.requestAnimationFrame(() => {
			queued = false;
			apply();
		});
	};

	for (const event of [
		'resize',
		'orientationchange',
		'focusin',
		'focusout',
		'pageshow',
	] as const) {
		win.addEventListener(event, schedule);
	}
	// A toolbar that slides away without a window resize still moves the visual viewport.
	win.visualViewport?.addEventListener('resize', schedule);
	win.visualViewport?.addEventListener('scroll', schedule);

	apply();

	return () => {
		for (const event of [
			'resize',
			'orientationchange',
			'focusin',
			'focusout',
			'pageshow',
		] as const) {
			win.removeEventListener(event, schedule);
		}
		win.visualViewport?.removeEventListener('resize', schedule);
		win.visualViewport?.removeEventListener('scroll', schedule);
		probe.remove();
	};
};
