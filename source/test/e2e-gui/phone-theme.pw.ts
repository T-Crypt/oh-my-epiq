import {expect, test} from './fixtures.js';

// The rail carries the theme switcher on desktop. On a phone there is no
// rail, so the Me tab's Appearance tile opens the same sheet.
test.describe('phone', () => {
	test.use({viewport: {width: 393, height: 659}, hasTouch: true});

	test('opens the theme switcher from the Me tab', async ({
		page,
		appUrl,
		pageErrors,
	}) => {
		await page.goto(appUrl);
		await expect(page.getByTestId('board-switcher')).toContainText('Default');

		await page.getByRole('button', {name: 'Me', exact: true}).click();
		await page.getByTestId('open-theme-sheet').click();

		await expect(page.getByText('Tokyo Night').first()).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('project-picker')).toHaveCount(0);
		expect(pageErrors).toEqual([]);
	});

	test('pins the tab bar to the viewport bottom with no sideways overflow', async ({
		page,
		appUrl,
		pageErrors,
	}) => {
		await page.goto(appUrl);
		await expect(page.getByTestId('board-switcher')).toContainText('Default');

		const metrics = await page.evaluate(() => ({
			innerWidth: window.innerWidth,
			innerHeight: window.innerHeight,
			scrollWidth: document.documentElement.scrollWidth,
			tabbarBottom: document.querySelector('.tabbar')?.getBoundingClientRect()
				.bottom,
			safeLeft: getComputedStyle(document.documentElement).getPropertyValue(
				'--safe-left',
			),
			safeRight: getComputedStyle(document.documentElement).getPropertyValue(
				'--safe-right',
			),
		}));
		expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
		expect(metrics.tabbarBottom).toBeLessThanOrEqual(metrics.innerHeight + 1);
		expect(metrics.tabbarBottom).toBeGreaterThan(metrics.innerHeight - 2);
		expect(metrics.safeLeft).not.toBe('');
		expect(metrics.safeRight).not.toBe('');
		expect(pageErrors).toEqual([]);
	});

	// An installed web app on iOS 26 draws its own toolbar over the page and reports no inset for it, so the layout
	// viewport is taller than what a person can see. The shell has to take the visible one, or the last strip of the
	// tab bar is painted under that toolbar.
	test('sizes the shell to the visible viewport when chrome covers the bottom', async ({
		page,
		appUrl,
		pageErrors,
	}) => {
		const chrome = 49;
		await page.addInitScript((covered: number) => {
			const fake = {
				width: window.innerWidth,
				height: window.innerHeight - covered,
				offsetTop: 0,
				offsetLeft: 0,
				pageTop: 0,
				pageLeft: 0,
				scale: 1,
				addEventListener: () => undefined,
				removeEventListener: () => undefined,
			};
			Object.defineProperty(window, 'visualViewport', {
				value: fake,
				configurable: true,
			});
		}, chrome);

		await page.goto(appUrl);
		await expect(page.getByTestId('board-switcher')).toContainText('Default');

		const metrics = await page.evaluate(() => {
			const bar = document.querySelector('.tabbar')?.getBoundingClientRect();
			const tabs = Array.from(document.querySelectorAll('.tab')).map(
				tab => tab.getBoundingClientRect().bottom,
			);

			return {
				appHeight: getComputedStyle(document.documentElement)
					.getPropertyValue('--app-h')
					.trim(),
				innerHeight: window.innerHeight,
				barBottom: bar?.bottom ?? 0,
				barHeight: bar?.height ?? 0,
				lastLabelBottom: Math.max(...tabs),
			};
		});

		const visible = metrics.innerHeight - chrome;
		expect(metrics.appHeight).toBe(`${visible}px`);
		expect(metrics.barBottom).toBeLessThanOrEqual(visible + 1);
		expect(metrics.barBottom).toBeGreaterThan(visible - 2);
		// The inset is 0 under emulation, so nothing is left for the bar to keep clear.
		expect(metrics.barHeight).toBe(56);
		expect(metrics.lastLabelBottom).toBeLessThanOrEqual(visible);
		expect(pageErrors).toEqual([]);
	});

	test('gives tabs and Me actions 44px targets', async ({
		page,
		appUrl,
		pageErrors,
	}) => {
		await page.goto(appUrl);
		await expect(page.getByTestId('board-switcher')).toContainText('Default');

		const tabHeights = await page
			.locator('.tab')
			.evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
		expect(tabHeights.length).toBe(4);
		for (const height of tabHeights) expect(height).toBeGreaterThanOrEqual(44);

		const current = await page.locator('.tab[aria-current="page"]').count();
		expect(current).toBe(1);

		await page.getByRole('button', {name: 'Me', exact: true}).click();
		const actionHeights = await page
			.locator('.phone-me .button')
			.evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
		expect(actionHeights.length).toBeGreaterThan(0);
		for (const height of actionHeights)
			expect(height).toBeGreaterThanOrEqual(44);
		expect(pageErrors).toEqual([]);
	});

	test('holds body-text contrast at AA on the default theme', async ({
		page,
		appUrl,
		pageErrors,
	}) => {
		await page.goto(appUrl);
		await expect(page.getByTestId('board-switcher')).toContainText('Default');

		// Passed as a source string, not a closure: the root tsconfig has no
		// DOM lib. Reads the live custom properties and ratios muted on bg.
		const ratio = await page.evaluate(`
			(() => {
				// Computed color-mix serializes as oklab(), and this Chromium's
				// canvas round-trips that string, so convert oklab/rgb by hand.
				const toRgb = (value) => {
					const oklab = value.match(/oklab\\(([^)]+)\\)/);
					if (oklab) {
						const [L, a, b] = oklab[1].trim().split(/\\s+/).map(Number);
						const l = L + 0.3963377774 * a + 0.2158037573 * b;
						const m = L - 0.1055613458 * a - 0.0638541728 * b;
						const q = L - 0.0894841775 * a - 1.291485548 * b;
						const lms = [l * l * l, m * m * m, q * q * q];
						const lin = [
							+4.0767416621 * lms[0] - 3.3077115913 * lms[1] +
								0.2309699292 * lms[2],
							-1.2684380046 * lms[0] + 2.6097574011 * lms[1] -
								0.3413193965 * lms[2],
							-0.0041960863 * lms[0] - 0.7034186147 * lms[1] +
								1.707614701 * lms[2],
						];
						return lin.map(v => {
							const x = Math.min(1, Math.max(0, v));
							return Math.round(
								255 *
									(x <= 0.0031308
										? 12.92 * x
										: 1.055 * Math.pow(x, 1 / 2.4) - 0.055),
							);
						});
					}
					const parts = value.match(/[\\d.]+/g) ?? [];
					return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
				};
				const parse = toRgb;
				const luminance = (rgb) => {
					const linear = rgb.map(v => {
						const s = v / 255;
						return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
					});
					return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
				};
				const probe = document.createElement('div');
				probe.style.color = 'var(--muted)';
				probe.style.background = 'var(--bg)';
				document.body.append(probe);
				const style = getComputedStyle(probe);
				const hi = luminance(parse(style.color));
				const lo = luminance(parse(style.backgroundColor));
				probe.remove();
				const [top, bottom] = hi > lo ? [hi, lo] : [lo, hi];
				return (top + 0.05) / (bottom + 0.05);
			})()
		`);
		expect(ratio).toBeGreaterThanOrEqual(4.5);
		expect(pageErrors).toEqual([]);
	});

	test('opens the project picker from the Me tab', async ({
		page,
		appUrl,
		repoRoot,
		pageErrors,
	}) => {
		await page.goto(appUrl);
		await expect(page.getByTestId('board-switcher')).toContainText('Default');

		await page.getByRole('button', {name: 'Me', exact: true}).click();
		await page.getByTestId('open-project-picker').click();

		const picker = page.getByTestId('project-picker');
		await expect(picker).toBeVisible();
		const name = repoRoot.split('/').pop() as string;
		await expect(picker).toContainText(name);
		expect(pageErrors).toEqual([]);
	});
});
