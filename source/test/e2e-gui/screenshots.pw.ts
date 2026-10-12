import {expect, test} from './fixtures.js';
import {addTicket} from './ticket.js';

// Screenshots for the README, retaken from the running GUI. Gated on SHOOT so
// ordinary runs never pay for them: SHOOT=1 npx playwright test screenshots.
test.skip(!process.env['SHOOT'], 'screenshots on demand only');

const desktop = {
	viewport: {width: 1600, height: 960},
	deviceScaleFactor: 2,
};

test.use(desktop);

test('desktop board with tabs', async ({page, appUrl}) => {
	await page.goto(appUrl);
	await expect(page.getByTestId('board-switcher')).toContainText('Default');
	await expect(page.getByTestId('board-tabs')).toContainText('Ideas');

	await addTicket(page, 'Ship the launch');
	await addTicket(page, 'Polish the screenshots');

	await page
		.getByTestId('board-tabs')
		.getByRole('button', {name: 'Ideas'})
		.click();
	await expect(page.getByTestId('board-switcher')).toContainText('Ideas');

	await page.screenshot({path: 'source/assets/gui-desktop.png'});
});

test('devices sheet with a pairing code', async ({page, appUrl}) => {
	await page.goto(appUrl);
	await expect(page.getByTestId('board-switcher')).toContainText('Default');

	await page.getByTestId('rail-devices').click();
	await page.getByRole('button', {name: 'Show a pairing code'}).click();
	await expect(page.getByText('signs one phone or browser in')).toBeVisible();

	await page.screenshot({path: 'source/assets/gui-devices.png'});
});

test.describe('phone', () => {
	test.use({
		viewport: {width: 393, height: 659},
		deviceScaleFactor: 3,
		hasTouch: true,
	});

	test('board tab', async ({page, appUrl}) => {
		await page.goto(appUrl);
		await expect(page.getByTestId('board-switcher')).toContainText('Default');

		await addTicket(page, 'Ship the launch');

		await page.screenshot({path: 'source/assets/phone-board.png'});
	});

	test('ticket sheet', async ({page, appUrl}) => {
		await page.goto(appUrl);
		await expect(page.getByTestId('board-switcher')).toContainText('Default');

		// Adding opens the ticket, which fills a phone screen as a sheet.
		await addTicket(page, 'Ship the launch');

		await page.screenshot({path: 'source/assets/phone-ticket.png'});
	});

	test('activity tab', async ({page, appUrl}) => {
		await page.goto(appUrl);
		await expect(page.getByTestId('board-switcher')).toContainText('Default');

		await page.getByRole('button', {name: 'Activity'}).click();
		await expect(page.getByTestId('event-log')).toBeVisible();

		await page.screenshot({path: 'source/assets/phone-activity.png'});
	});

	test('me tab with pairing', async ({page, appUrl}) => {
		await page.goto(appUrl);
		await expect(page.getByTestId('board-switcher')).toContainText('Default');

		await page.getByRole('button', {name: 'Me', exact: true}).click();
		await expect(page.getByText('Devices')).toBeVisible();

		await page.screenshot({path: 'source/assets/phone-signin.png'});
	});
});
