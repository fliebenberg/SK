import { test, expect, Page } from '@playwright/test';
import { USERS, signIn } from './support';

/**
 * The Schedule tab (tournaments Phase 7, agreed on `mockups/tournament-schedule.html`): a grid by
 * facility on a wide screen and a list by start time on a phone, filtered by day, division and
 * facility; fixtures moved by the sheet or dragged, never blocked, with the clashes they cause; and
 * what has no time yet. On *Test Saturday Fixtures*, after `07-scheduling` has placed its one
 * fixture without a time — so the second Saturday's 1st XV, past the day's end, is the clash there.
 */
const SATURDAY = '/admin/fx-org-dkl/events/fx-tour-saturday';

async function openSchedule(page: Page) {
  await page.goto(SATURDAY);
  await expect(page.getByText('Test Saturday Fixtures').first()).toBeVisible();
  await page.getByText('Schedule', { exact: true }).first().click();
  await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
}
async function choose(page: Page, control: 'Day' | 'Division' | 'Facility', option: string) {
  await page.getByRole('button', { name: new RegExp(`^${control}:`) }).click();
  await page.getByRole('button', { name: option, exact: true }).click();
}

test.describe('the Schedule tab, as the host', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await openSchedule(page);
  });

  test('a phone lists the day by start time, each fixture with its division and facility @phone', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'The list is the phone\'s; a wide screen has the grid');
    await expect(page.getByText('08:00', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Netball U14 · Netball Court 1').first()).toBeVisible();
  });

  test('the grid shows the day by facility, and a division narrows it to its own and their shared ground', async ({ page }) => {
    for (const name of ['A Field', 'Field A1', 'Field A2', 'Netball Court 1', 'Netball Court 3']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
    await choose(page, 'Division', 'Rugby U16');
    await expect(page.getByText('Field A1', { exact: true }).first()).toBeVisible();
    // A Field shares ground with the minis, so it shows with them.
    await expect(page.getByText('A Field', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Netball Court 1', { exact: true })).toHaveCount(0);
  });

  test("the second Saturday shows the 1st XV past the day's end, among the day's clashes", async ({ page }) => {
    await choose(page, 'Day', 'Sat 5 Dec');
    await expect(page.getByText(/Clashes on Sat/)).toBeVisible();
    await expect(page.getByText("Rugby 1st XV runs past the day's end")).toBeVisible();
  });

  test('a fixture moved onto a booked court warns, is moved anyway, and can be undone', async ({ page }) => {
    // Earlier files may leave other clashes on the day (06 takes Netball U16 off the second
    // Saturday, so 07's Schedule all runs it past Saturday's end) — this checks its own.
    await expect(page.getByText(/Netball Court 3 is booked twice/)).toHaveCount(0);
    // Netball U14's 09:20 on Court 1, opened by its block.
    await page.getByText(/^09:20 U14 R2/).first().click();
    // Court 3 is not one of Netball U14's own: it is behind Other….
    await page.getByRole('radio', { name: 'Other…' }).click();
    await page.getByRole('radio', { name: 'Netball Court 3' }).click();
    await page.getByLabel('Starts').fill('09:15');
    await expect(page.getByText(/Netball Court 3 is booked twice\. You can still move it\./)).toBeVisible();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await expect(page.getByText(/Moved to Netball Court 3/)).toBeVisible();
    await expect(page.getByText(/moved anyway/)).toBeVisible();
    await expect(page.getByText(/Netball Court 3 is booked twice/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByText(/Netball Court 3 is booked twice/)).toHaveCount(0);
  });

  test('a fixture dragged onto the grid lands where its top edge is, and back to the tray loses its time', async ({ page }) => {
    // Free a fixture first, by the sheet, so there is one to drag.
    await page.getByText(/^08:00 U14 R1/).first().click();
    await page.getByRole('button', { name: 'Take its time away' }).click();
    await expect(page.getByText('Without a time', { exact: true })).toBeVisible();
    await expect(page.getByText('It has no time now.')).toBeVisible();
    const chip = page.locator('[data-testid^="schedule-tray-fx-game-saturday-netball-u14"]').first();
    // Court 2 at 12:00, free after Netball U14's last game: the 12:00 line on the time axis, measured
    // against the column. A tray fixture is held by its top, so its top edge lands on the line.
    const column = page.getByTestId('schedule-column-fx-fac-dkl-court-2');
    const col = await column.boundingBox();
    const noon = await page.getByText('12:00', { exact: true }).first().boundingBox();
    if (!col || !noon) throw new Error('No Court 2 column or 12:00 line');
    const y = noon.y + noon.height / 2 - col.y;
    // The first native drag of a session sometimes does not start in the test browser; try twice.
    for (let attempt = 0; attempt < 2; attempt++) {
      await chip.dragTo(column, { targetPosition: { x: col.width / 2, y } });
      if (await page.getByText(/Moved to Netball Court 2/).isVisible()) break;
    }
    await expect(page.getByText('Moved to Netball Court 2, Sat 28 Nov 12:00.')).toBeVisible();
  });
});
