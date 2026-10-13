import {expect, test} from './fixtures.js';

test('opens the picker from the board and names the current project', async ({
	page,
	appUrl,
	repoRoot,
	pageErrors,
}) => {
	await page.goto(appUrl);
	await expect(page.getByTestId('board-switcher')).toContainText('Default');

	await page.getByTestId('project-switcher').click();

	const picker = page.getByTestId('project-picker');
	await expect(picker).toBeVisible();
	// The picker names the project behind the board; the seeded root is the
	// current one, so the known list holds nobody else to offer.
	const name = repoRoot.split('/').pop() as string;
	await expect(picker).toContainText(name);
	await expect(picker.getByTestId('project-picker-path')).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(picker).toHaveCount(0);
	expect(pageErrors).toEqual([]);
});

test('typing a bare directory lands on the init screen', async ({
	page,
	appUrl,
	repoRoot,
	bareRepoRoot,
	pageErrors,
}) => {
	await page.goto(appUrl);
	await expect(page.getByTestId('board-switcher')).toContainText('Default');

	await page.getByTestId('project-switcher').click();
	await page.getByTestId('project-picker-path').fill(bareRepoRoot);
	await page.getByTestId('project-picker-open-path').click();

	const screen = page.getByTestId('init-project-screen');
	await expect(screen).toBeVisible();
	await expect(screen).toContainText(bareRepoRoot);

	// The worker's server is shared by every file that runs after this one:
	// leave it on the seeded project, not the bare directory just opened.
	const recent = page.getByTestId('recent-project').filter({hasText: repoRoot});
	await expect(recent).toHaveCount(1);
	await recent.getByTestId('open-recent-project').click();
	await expect(page.getByTestId('board-switcher')).toContainText('Default');
	await expect(screen).toHaveCount(0);
	expect(pageErrors).toEqual([]);
});
