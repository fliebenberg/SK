import { test, expect, Page } from '@playwright/test';
import { ORG, USERS, signIn, tournamentUrl } from './support';

/**
 * Setting a tournament up to be scheduled (tournaments Phase 7, agreed on
 * `mockups/tournament-schedule.html`): the tournament's playing days and hours under **When**, the
 * scheduling gaps at the foot of **Fixtures**, and a division's own **Where**, **When** and gaps.
 * *Test Saturday Fixtures* is drawn and scheduled, on two Saturdays a week apart; *Test Spring
 * Festival* has days and no draw, and is the one changed here.
 */
const SATURDAY = '/admin/fx-org-dkl/events/fx-tour-saturday';
const U16_NETBALL = `${SATURDAY}/divisions/fx-div-saturday-netball-u16`;

/**
 * A section's Edit: the first Edit inside the nearest block holding both its heading and an Edit.
 * The *last* match of the heading, since the tournament banner's progress bar names each section too.
 */
async function editSection(page: Page, heading: string) {
  await page.getByText(heading, { exact: true }).last().locator('xpath=ancestor::div[.//*[text()="Edit"]][1]').getByText('Edit').first().click();
}
async function editGaps(page: Page) {
  await page.getByText(/^Between games/).first().locator('xpath=../..').getByText('Edit').click();
}

test.describe('scheduling setup, as the host', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
  });

  test('on a phone, the banner gives the span and When, being done, folds to its summary @phone', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'Folding is the phone\'s');
    await page.goto(SATURDAY);
    await expect(page.getByText('28 Nov – 5 Dec 2026', { exact: true })).toBeVisible();
    await expect(page.getByText('2 days · 28 Nov – 5 Dec 2026')).toBeVisible();
  });

  test('When lists each playing day, the banner only the span, and the gaps sit under Fixtures', async ({ page }) => {
    await page.goto(SATURDAY);
    await expect(page.getByText('Test Saturday Fixtures').first()).toBeVisible();
    await expect(page.getByText('28 Nov – 5 Dec 2026', { exact: true })).toBeVisible();
    await expect(page.getByText('Sat 28 Nov')).toBeVisible();
    await expect(page.getByText('08:00 – 13:00')).toBeVisible();
    await expect(page.getByText('Sat 5 Dec')).toBeVisible();
    await expect(page.getByText('08:00 – 12:00')).toBeVisible();
    await expect(page.getByText('Between games 5 min · Minimum team break 10 min').first()).toBeVisible();
  });

  test('a playing day is ticked on the calendar, and the first day\'s times are copied to every day', async ({ page }) => {
    await page.goto(tournamentUrl(ORG.dkl));
    await expect(page.getByText('Sat 21 Nov')).toBeVisible();
    await editSection(page, 'When');
    await expect(page.getByText("When it's played")).toBeVisible();
    // A third day, a week later: it need not follow the others.
    await page.getByRole('checkbox', { name: 'Sat 28 Nov' }).click();
    await page.getByLabel('Sat 21 Nov, day starts').fill('09:00');
    await page.getByLabel('Sat 21 Nov, day ends').fill('15:00');
    await page.getByRole('button', { name: 'Copy these times to every day' }).click();
    await expect(page.getByLabel('Sun 22 Nov, day ends')).toHaveValue('15:00');
    await expect(page.getByLabel('Sat 28 Nov, day starts')).toHaveValue('09:00');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText("When it's played")).toBeHidden();
    await expect(page.getByText('Sat 28 Nov')).toBeVisible();
    await expect(page.getByText('09:00 – 15:00').first()).toBeVisible();
    // The banner follows the days.
    await expect(page.getByText('21–28 Nov 2026')).toBeVisible();
  });

  test('a day that ends before it starts cannot be saved', async ({ page }) => {
    await page.goto(tournamentUrl(ORG.dkl));
    await editSection(page, 'When');
    await page.getByLabel('Sat 21 Nov, day ends').fill('07:00');
    await expect(page.getByText('The day must end after it starts.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  });

  test('the tournament\'s gaps: a team break of 0 reads as no minimum', async ({ page }) => {
    await page.goto(tournamentUrl(ORG.dkl));
    await editGaps(page);
    await page.getByLabel('Minimum team break, minutes').fill('0');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Scheduling', { exact: true }).locator('xpath=ancestor::*[@role="dialog"]')).toHaveCount(0);
    await expect(page.getByText('Between games 5 min · No minimum team break').first()).toBeVisible();
  });

  test('the banner\'s Edit shows the dates as the playing days\', changed under When', async ({ page }) => {
    await page.goto(SATURDAY);
    await page.getByText('Test Saturday Fixtures').first().locator('xpath=ancestor::div[.//*[text()="Edit"]][1]').getByText('Edit').first().click();
    await expect(page.getByText('From its playing days. Change them under When.')).toBeVisible();
  });

  test('a division shows Where, When — with its calculated ends — and Organisers @phone', async ({ page }) => {
    await page.goto(U16_NETBALL);
    await expect(page.getByText('Courts', { exact: true })).toBeVisible();
    await expect(page.getByText('Netball Court 3', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Sat 28 Nov')).toBeVisible();
    await expect(page.getByText('· calculated').first()).toBeVisible();
    await expect(page.getByText('Organisers', { exact: true })).toBeVisible();
    await expect(page.getByText("Scheduling · the tournament's")).toBeVisible();
  });

  test("a division's own days: not playing one, its own start, and a warning outside the tournament's hours", async ({ page }) => {
    await page.goto(U16_NETBALL);
    await editSection(page, 'When');
    await page.getByRole('button', { name: 'Not playing on Sat 5 Dec' }).click();
    await page.getByLabel('Sat 28 Nov, first game start').fill('07:30');
    await expect(page.getByText(/Starts before the tournament's day starts on Sat 28 Nov/)).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('When — U16')).toBeHidden();
    await expect(page.getByText('Not playing')).toBeVisible();
    await expect(page.getByText(/^07:30 – /)).toBeVisible();
  });

  test("a division's own gaps, then back to the tournament's", async ({ page }) => {
    await page.goto(U16_NETBALL);
    await editGaps(page);
    await page.getByLabel('Between games, minutes').fill('10');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Scheduling — U16')).toBeHidden();
    await expect(page.getByText('Between games 10 min · Minimum team break 10 min')).toBeVisible();
    await expect(page.getByText("Scheduling · the tournament's")).toBeHidden();
    await editGaps(page);
    await page.getByLabel('Between games, minutes').fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Scheduling — U16')).toBeHidden();
    await expect(page.getByText("Scheduling · the tournament's")).toBeVisible();
  });
});
