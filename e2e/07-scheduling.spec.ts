import { test, expect } from '@playwright/test';
import { ORG, USERS, signIn, tournamentUrl } from './support';

/**
 * Running the scheduler (tournaments Phase 7): a division's state says where its scheduling stands,
 * *Schedule all* places what has no time — first pick of shared facilities by order — a division can
 * be scheduled again, and the draw can schedule straight away. On *Test Saturday Fixtures*, loaded
 * scheduled by the server's own planner: Netball U16 with one fixture left without a time, and the
 * 1st XV with one past the second Saturday's end.
 */
const SATURDAY = '/admin/fx-org-dkl/events/fx-tour-saturday';
const division = (key: string) => `${SATURDAY}/divisions/fx-div-saturday-${key}`;

test.describe('scheduling, as the host', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
  });

  test('a division says where its scheduling stands @phone', async ({ page }) => {
    await page.goto(division('netball-u16'));
    await expect(page.getByText('1 fixture without a time').first()).toBeVisible();
    await page.goto(division('rugby-1stxv'));
    await expect(page.getByText('1 after the day ends').first()).toBeVisible();
    await expect(page.getByText(/1 fixture runs past the division's day end on its last day/)).toBeVisible();
  });

  test('the 1st XV says why it ran over, and its strip leads to its When', async ({ page }) => {
    await page.goto(division('rugby-1stxv'));
    await page.getByRole('button', { name: 'When', exact: true }).click();
    await expect(page.getByText('When — 1st XV')).toBeVisible();
  });

  test('Schedule all places only what has no time, and says what it did', async ({ page }) => {
    await page.goto(SATURDAY);
    await expect(page.getByText(/1 drawn division with fixtures that have no time yet/)).toBeVisible();
    await page.getByRole('button', { name: 'Schedule all', exact: true }).first().click();
    await expect(page.getByText('Schedule all divisions')).toBeVisible();
    await expect(page.getByText('Netball U16', { exact: true }).last()).toBeVisible();
    await expect(page.getByText(/1 of 6 fixtures to place · the rest stay/)).toBeVisible();
    await page.getByRole('button', { name: 'Schedule 1 division' }).click();
    await expect(page.getByText('Divisions scheduled')).toBeVisible();
    await expect(page.getByText('Placed 1 fixture.')).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.goto(division('netball-u16'));
    await expect(page.getByText('Time to be set')).toBeHidden();
    await expect(page.getByText('1 fixture without a time')).toBeHidden();
  });

  test('a division is scheduled again, keeping what was placed by hand', async ({ page }) => {
    await page.goto(division('rugby-u16'));
    await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Schedule again' }).click();
    await expect(page.getByText('Schedule U16 again?')).toBeVisible();
    await expect(page.getByText(/Field A1, Field A2/).last()).toBeVisible();
    await expect(page.getByText(/90 min \(Rugby's\), then 5 min before the next/)).toBeVisible();
    await page.getByRole('button', { name: 'Schedule again', exact: true }).last().click();
    await expect(page.getByText(/Placed 6 fixtures\./)).toBeVisible();
  });

  test("the Spring Festival's Netball U14 was scheduled straight away with its draw", async ({ page }) => {
    // 02-division makes this draw; the draw dialog's "Schedule them straight away" is ticked by default.
    await page.goto(`${tournamentUrl(ORG.dkl)}/divisions/fx-div-spring-netball-u14`);
    await expect(page.getByText(/Netball Court \d/).first()).toBeVisible();
    await expect(page.getByText('Draw made · not scheduled')).toBeHidden();
  });
});
