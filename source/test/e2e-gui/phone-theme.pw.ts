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
