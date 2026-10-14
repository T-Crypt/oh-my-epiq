import {expect, test} from './fixtures.js';

// The rail's theme button only set state; nothing mounted ThemeSheet in the
// desktop tree, so clicking it changed nothing on screen.
test('the rail opens the theme sheet on desktop', async ({
	page,
	appUrl,
	pageErrors,
}) => {
	await page.goto(appUrl);
	await expect(page.getByTestId('board-switcher')).toContainText('Default');

	await page.locator('.rail button[title="Theme"]').click();

	const sheet = page.getByRole('dialog', {name: 'Theme'});
	await expect(sheet).toBeVisible();
	await expect(sheet).toContainText('Tokyo Night');

	// A card switches the theme without a reload.
	await sheet.getByRole('button', {name: 'Catppuccin Latte'}).click();
	await expect
		.poll(() =>
			page.evaluate(() =>
				document.documentElement.style.getPropertyValue('--o-bg').trim(),
			),
		)
		.toBe('#eff1f5');

	expect(pageErrors).toEqual([]);
});
