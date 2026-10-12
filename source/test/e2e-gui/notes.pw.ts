import type {Page} from '@playwright/test';
import {expect, test} from './fixtures.js';
import {addTicket} from './ticket.js';

const postNote = async (page: Page, text: string) => {
	await page.getByPlaceholder('write a note').fill(text);
	await page.getByRole('button', {name: 'note', exact: true}).click();
	await expect(page.locator('aside').getByText(text)).toBeVisible();
};

test.beforeEach(async ({page, appUrl}) => {
	await page.goto(appUrl);
	await expect(page.getByTestId('board-switcher')).toContainText('Default');
});

test('your own note can be edited and deleted', async ({page, pageErrors}) => {
	await addTicket(page, `Own note ${Date.now()}`);

	// Click the Notes tab and wait for the textarea to appear.
	// This proves the tab switch worked and the content pane rendered.
	await page.getByRole('button', {name: /^Notes/}).click();

	// The Notes tab content renders the IssueNotes component which has a textarea
	// with placeholder "write a note". Wait for it to be visible.
	const textarea = page.getByPlaceholder('write a note');
	await expect(textarea).toBeVisible({timeout: 15000});

	await postNote(page, 'first draft');
	await expect(page.getByRole('button', {name: 'Notes (1)'})).toBeVisible();

	// Edit: the body is prefilled, Escape backs out untouched.
	await page.getByTestId('edit-note').click();
	const editor = page.locator('aside textarea').first();
	await expect(editor).toHaveValue('first draft');
	await editor.press('Escape');
	await expect(page.locator('aside').getByText('first draft')).toBeVisible();

	await page.getByTestId('edit-note').click();
	await editor.fill('second draft');
	await page.getByRole('button', {name: 'save'}).click();
	await expect(page.locator('aside').getByText('second draft')).toBeVisible();
	await expect(page.locator('aside').getByText('first draft')).toHaveCount(0);

	// Survives a reload: it reached the log, not just the screen.
	await page.reload();
	await expect(page.locator('aside').getByText('second draft')).toBeVisible();

	// Delete.
	await page.getByTestId('delete-note').click();
	await expect(page.locator('aside').getByText('second draft')).toHaveCount(0);
	await expect(page.getByRole('button', {name: 'Notes (0)'})).toBeVisible();
	await page.reload();
	await expect(page.getByRole('button', {name: 'Notes (0)'})).toBeVisible();

	expect(pageErrors).toEqual([]);
});
