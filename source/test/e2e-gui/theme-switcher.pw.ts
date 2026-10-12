import {expect, test} from './fixtures.js';

test('switching the theme repaints a JavaScript-sourced scrim without reload', async ({
	page,
	appUrl,
	pageErrors,
}) => {
	await page.goto(appUrl);

	// Wait for the board to load.
	await expect(page.getByTestId('board-switcher')).toContainText('Default');

	// Open the command palette; its backdrop is drawn from GUI_THEME.scrim.
	await page.keyboard.press('Control+k');
	const palette = page.getByTestId('command-palette');
	await expect(palette).toBeVisible();
	const before = await palette.evaluate(
		el => getComputedStyle(el).backgroundColor,
	);
	await page.keyboard.press('Escape');
	await expect(palette).toHaveCount(0);

	// Switch to a light theme via the same API the theme sheet uses.
	await page.waitForFunction(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const w = window as any;
		return typeof w.__omeApplyTheme === 'function';
	});
	await page.evaluate(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const w = window as any;
		w.__omeApplyTheme('catppuccin-latte');
	});

	// Re-open the command palette and read the scrim again.
	await page.keyboard.press('Control+k');
	await expect(palette).toBeVisible();
	const after = await palette.evaluate(
		el => getComputedStyle(el).backgroundColor,
	);
	await page.keyboard.press('Escape');

	// The JavaScript-sourced scrim must have changed to match the new theme.
	expect(after).not.toBe(before);
	expect(pageErrors).toEqual([]);
});
