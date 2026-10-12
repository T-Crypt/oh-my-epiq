import {expect, test} from './fixtures.js';

test('switches boards through the tab strip', async ({
	page,
	appUrl,
	pageErrors,
}) => {
	await page.goto(appUrl);
	await expect(page.getByTestId('board-switcher')).toContainText('Default');

	const tabs = page.getByTestId('board-tabs');
	await expect(tabs).toBeVisible();
	await expect(tabs).toContainText('Default');
	await expect(tabs).toContainText('Closed');

	await tabs.getByRole('button', {name: 'Closed'}).click();
	await expect(page.getByTestId('board-switcher')).toContainText('Closed');

	await tabs.getByRole('button', {name: 'Default'}).click();
	await expect(page.getByTestId('board-switcher')).toContainText('Default');
	expect(pageErrors).toEqual([]);
});
