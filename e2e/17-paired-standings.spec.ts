import { test, expect, Page } from '@playwright/test';
import { USERS, signIn } from './support';

/**
 * Divisions of paired games rank organisations, and the Standings tab narrows by sport (`SCORE-23`,
 * agreed 2026-10-22; docs/events.md §10).
 *
 * *Test Netball Pairs Day* (`fx-tour-pairs`) has one division set by hand, its games paired by level
 * across four organisations — U14 against U14, U16 against U16 — all played: Doringkloof wins it on
 * 7 points, Kwaggafontein has 6, Riverbend 3 and St Aldric's 1. *Test Head to Head* has a table of two
 * in each division; *Test Autumn Festival* has two sports.
 */
const PAIRS = '/admin/fx-org-dkl/events/fx-tour-pairs';
const OPEN = `${PAIRS}/divisions/fx-div-pairs-netball-open`;

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text, typeof text === 'string' ? { exact: true } : undefined).filter({ visible: true }).first();

test.describe('a division of paired games', () => {
  test('is won by an organisation on the Standings tab @phone', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(`${PAIRS}?tab=standings`);
    await expect(visible(page, 'Leaderboard')).toBeVisible();
    await expect(visible(page, 'Won by DKL')).toBeVisible();
    // One sport: nothing to narrow.
    await expect(page.getByRole('button', { name: /^Sport:/ })).toHaveCount(0);
  });

  test('ranks organisations on its page, with their teams counted @phone', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(OPEN);
    const card = page.getByText('Standings', { exact: true }).filter({ visible: true }).first();
    await expect(card).toBeVisible();
    await expect(visible(page, 'Organisation')).toBeVisible();
    // No table of teams: its rows are organisations.
    await expect(visible(page, 'Team')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('paired-division.png'), fullPage: true });
  });

  test("a Head to Head division's results lead with its table of two", async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto('/admin/fx-org-dkl/events/fx-tour-h2h?tab=standings');
    await page.getByRole('button', { name: /^Rugby U16:/ }).click();
    await expect(visible(page, 'Organisation')).toBeVisible();
    await expect(visible(page, '24–10')).toBeVisible();
    // Won by games: no points column.
    await expect(page.getByText('Pts', { exact: true }).filter({ visible: true })).toHaveCount(0);
  });
});

test.describe('the Standings tab by sport', () => {
  test('narrows the divisions and makes the leaderboard that sport’s @phone', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto('/admin/fx-org-dkl/events/fx-tour-autumn?tab=standings');
    await expect(visible(page, '9 of 18 fixtures played')).toBeVisible();
    await expect(visible(page, 'Led by DKL U16 A')).toBeVisible();

    await page.getByRole('button', { name: /^Sport:/ }).click();
    await page.getByRole('button', { name: 'Netball', exact: true }).click();
    // Only the netball: its twelve fixtures, six played; the rugby division goes.
    await expect(visible(page, '6 of 12 fixtures played')).toBeVisible();
    await expect(visible(page, 'Won by DKL U14 A')).toBeVisible();
    await expect(page.getByText('Led by DKL U16 A', { exact: true }).filter({ visible: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('standings-netball.png'), fullPage: true });
  });
});
