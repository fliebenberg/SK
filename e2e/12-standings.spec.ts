import { test, expect } from '@playwright/test';
import { USERS, signIn } from './support';

/**
 * The Standings tab (events stage 4; agreed on `mockups/standings-read-first.html`, option A): the
 * leaderboard by organisation first, the divisions beside it, and a page for each organisation and
 * team. *Test Autumn Festival* has its Netball U14 finished, its Rugby U16 half played and its
 * Netball U16 not started; Doringkloof won every game it played.
 */
const STANDINGS = '/admin/fx-org-dkl/events/fx-tour-autumn?tab=standings';
const STANDINGS_AS_SAC = '/admin/fx-org-sac/events/fx-tour-autumn?tab=standings';

const visible = (page: import('@playwright/test').Page, text: string | RegExp) =>
  page.getByText(text, typeof text === 'string' ? { exact: true } : undefined).filter({ visible: true }).first();

test.describe('the Standings tab', () => {
  test('the leaderboard first, then each division with its leader @phone', async ({ page }, info) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(STANDINGS);
    await expect(visible(page, 'Leaderboard')).toBeVisible();
    await expect(visible(page, '9 of 18 fixtures played')).toBeVisible();
    // A phone names organisations by their short names.
    await expect(visible(page, info.project.name === 'phone' ? 'DKL' : 'Test Hoërskool Doringkloof')).toBeVisible();
    await expect(visible(page, 'Won by DKL U14 A')).toBeVisible();
    await expect(visible(page, 'Led by DKL U16 A')).toBeVisible();
    await expect(visible(page, '3 of 6 played')).toBeVisible();
    await expect(visible(page, 'Round robin')).toBeVisible();
    // The division tabs are gone.
    await expect(page.getByText('All divisions', { exact: true })).toHaveCount(0);
  });

  test('another organisation taking part sees the same standings @phone', async ({ page }) => {
    await signIn(page, USERS.sacAdmin);
    await page.goto(STANDINGS_AS_SAC);
    await expect(visible(page, 'Leaderboard')).toBeVisible();
    await expect(visible(page, 'Won by DKL U14 A')).toBeVisible();
  });

  test('an organisation opens its results, a team its own page, and Full table its division', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(STANDINGS);
    await visible(page, 'Test Hoërskool Doringkloof').click();
    await expect(page).toHaveURL(/\/standings\/organisations\/fx-org-dkl$/);
    await expect(visible(page, /of 4 · 15 points · 3 teams/)).toBeVisible();
    await expect(visible(page, 'U14 · 1st of 4')).toBeVisible();
    await expect(visible(page, 'The leaderboard adds up the points these teams earn in their divisions.')).toBeVisible();

    await visible(page, 'U14 · 1st of 4').click();
    await expect(page).toHaveURL(/\/standings\/teams\/[^/]+$/);
    await expect(visible(page, /in Netball U14 · 9 points/)).toBeVisible();
    await expect(visible(page, '12 – 8')).toBeVisible();
    await expect(visible(page, 'Team page ›')).toBeVisible();

    await visible(page, 'Full table ›').click();
    // Straight to the division's Standings tab (FIX-40).
    await expect(page).toHaveURL(/\/divisions\/fx-div-autumn-netball-u14\?tab=standings$/);
    await expect(visible(page, 'Standings')).toBeVisible();
  });

  test('a division opens its own page', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(STANDINGS);
    await visible(page, 'Led by DKL U16 A').click();
    await expect(page).toHaveURL(/\/divisions\/fx-div-autumn-rugby-u16\?tab=standings$/);
  });

  // Last, because it changes the tournament's scoring; it puts back the 3 / 1 / 0 it started from.
  test('a tournament scored on wins, draws and losses shows no points (SCORE-18)', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    const openScoring = async () => {
      await page.goto('/admin/fx-org-dkl/events/fx-tour-autumn');
      await page.getByText('Rules & scoring', { exact: true }).last().locator('xpath=ancestor::div[.//*[text()="Edit"]][1]').getByText('Edit').first().click();
    };

    await openScoring();
    await page.getByText('Wins / draws / losses', { exact: true }).first().click();
    await expect(visible(page, 'No points. Every table in this tournament ranks by wins, then draws, then the tiebreakers.')).toBeVisible();
    await page.getByRole('button', { name: 'Save and confirm' }).click();
    await expect(visible(page, 'No points. The tables rank by wins, then draws.')).toBeVisible();

    await page.goto(STANDINGS);
    await expect(visible(page, 'Leaderboard')).toBeVisible();
    await expect(page.getByText('Pts', { exact: true }).filter({ visible: true })).toHaveCount(0);
    await visible(page, 'Test Hoërskool Doringkloof').click();
    await expect(visible(page, /of 4 · 5 wins, 0 draws, 0 losses · 3 teams/)).toBeVisible();
    await expect(visible(page, 'The leaderboard adds up the wins and draws these teams earn in their divisions.')).toBeVisible();
    await visible(page, 'U14 · 1st of 4').click();
    await expect(visible(page, /in Netball U14 · 3 wins, 0 draws, 0 losses/)).toBeVisible();

    await openScoring();
    await page.getByText('Simple points', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('No points. The tables rank by wins, then draws.', { exact: true })).toHaveCount(0);
  });
});
