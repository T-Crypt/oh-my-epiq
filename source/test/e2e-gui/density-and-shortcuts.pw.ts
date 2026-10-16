import type {Page} from '@playwright/test';
import {expect, test} from './fixtures.js';
import {addTicket} from './ticket.js';

// A window wide enough for the rail and the whole topbar: the density control
// and the rail's own buttons both live in the chrome, and which of them is
// drawn depends on the width.
test.use({viewport: {width: 1440, height: 900}});

const card = (page: Page, title: string) =>
	page.locator('[draggable="true"]').filter({hasText: title});

// Computed styles, as strings: the DOM globals inside a page.evaluate are the
// browser's, and the root tsconfig has no lib for them.
const cardMetrics = (page: Page, title: string) =>
	page.evaluate<{padding: string; title: string}>(
		`
		(() => {
			const card = [...document.querySelectorAll('[draggable="true"]')]
				.find(node => node.textContent.includes(${JSON.stringify(title)}));
			const heading = card.querySelector('[data-testid="ticket-title"]');
			return {
				padding: getComputedStyle(card).paddingTop,
				title: getComputedStyle(heading).fontSize,
			};
		})()
	`,
	);

const addTag = async (page: Page, name: string) => {
	await page
		.locator('aside')
		.getByRole('button', {name: '+', exact: true})
		.first()
		.click();
	await page.getByPlaceholder('tag name').fill(name);
	await page.getByPlaceholder('tag name').press('Enter');
	await expect(page.locator('aside')).toContainText(name);
};

test('the density control tightens the board, and the choice outlives the page', async ({
	page,
	appUrl,
	pageErrors,
}) => {
	await page.goto(appUrl);
	await expect(page.getByTestId('board-switcher')).toContainText('Default');

	const title = `Dense ${Date.now()}`;
	await addTicket(page, title);
	await page.getByRole('button', {name: 'Close', exact: true}).click();

	// Comfortable unless somebody has said otherwise, and the card is drawn at
	// the roomy padding the board has always had.
	await expect(page.getByTestId('board-density-comfortable')).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	const comfortable = await cardMetrics(page, title);
	expect(comfortable.padding).toBe('12px');
	expect(parseFloat(comfortable.title)).toBe(15);

	await page.getByTestId('board-density-compact').click();
	await expect(page.getByTestId('board-density-compact')).toHaveAttribute(
		'aria-pressed',
		'true',
	);

	const compact = await cardMetrics(page, title);
	expect(parseFloat(compact.padding)).toBeLessThan(
		parseFloat(comfortable.padding),
	);
	expect(parseFloat(compact.title)).toBeLessThan(parseFloat(comfortable.title));

	// The same client-side store every other choice on the board uses.
	await page.reload();
	await expect(page.getByTestId('board-density-compact')).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	expect((await cardMetrics(page, title)).padding).toBe(compact.padding);

	// And back: comfortable is a place somebody can return to, not the absence
	// of the other one.
	await page.getByTestId('board-density-comfortable').click();
	expect((await cardMetrics(page, title)).padding).toBe(comfortable.padding);

	expect(pageErrors).toEqual([]);
});

test('a card wears two of its tags as chips, and counts the rest', async ({
	page,
	appUrl,
	pageErrors,
}) => {
	await page.goto(appUrl);
	await expect(page.getByTestId('board-switcher')).toContainText('Default');

	const stamp = Date.now();
	const title = `Tagged ${stamp}`;
	await addTicket(page, title);

	for (const name of [`a${stamp}`, `b${stamp}`, `c${stamp}`]) {
		await addTag(page, name);
	}
	await page.getByRole('button', {name: 'Close', exact: true}).click();

	const row = card(page, title).getByTestId('card-tag');
	await expect(row).toBeVisible();
	await expect(row.getByTestId('ticket-tag')).toHaveCount(2);
	await expect(row).toContainText(`+1`);

	// The dot is painted from one of the theme's own accents rather than from a
	// hex of the chip's own, which is what makes it repaint with the theme.
	const dot = await page.evaluate<string>(`
		(() => {
			const mark = document.querySelector('[data-testid="card-tag"] button span');
			return getComputedStyle(mark).backgroundColor;
		})()
	`);
	expect(dot).toMatch(/^rgb\(/);

	expect(pageErrors).toEqual([]);
});

test('the ? key opens the shortcut list, and the rail opens it too', async ({
	page,
	appUrl,
	pageErrors,
}) => {
	await page.goto(appUrl);
	await expect(page.getByTestId('board-switcher')).toContainText('Default');

	const sheet = page.getByTestId('shortcut-sheet');
	await page.keyboard.press('?');
	await expect(sheet).toBeVisible();
	await expect(sheet).toContainText('Command palette');
	await expect(sheet).toContainText('Play the board back');

	// Escape closes it, as the sheet pattern does everywhere.
	await page.keyboard.press('Escape');
	await expect(sheet).toHaveCount(0);

	// And it is reachable without knowing the key.
	await page.getByTestId('rail-shortcuts').click();
	await expect(sheet).toBeVisible();

	// A click past it closes it too — the scrim is the overlay, the sheet is
	// what stops the click.
	await page.getByTestId('shortcuts-sheet').click({position: {x: 4, y: 4}});
	await expect(sheet).toHaveCount(0);

	expect(pageErrors).toEqual([]);
});
