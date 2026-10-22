import { test, expect, Page } from '@playwright/test';
import { USERS, signIn } from './support';

/**
 * A tournament as the public sees it (`FIX-25`, agreed on `mockups/tournament-public.html`, option A;
 * docs/events.md §11): the same pages, read-only, outside every workspace, at `/events/[eventId]`,
 * with no account needed. *Test Autumn Festival* is under way with results in; Kwaggafontein's U16
 * Comets withdrew from its Netball U16 after the draw.
 */
const AUTUMN = '/events/fx-tour-autumn';

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text, typeof text === 'string' ? { exact: true } : undefined).filter({ visible: true }).first();

test.describe('the public tournament page, logged out', () => {
  test('leads with the leaderboard once there are results, with Share and nothing to do @phone', async ({ page }) => {
    await page.goto(AUTUMN);
    await expect(visible(page, 'Leaderboard')).toBeVisible();
    await expect(visible(page, 'Share')).toBeVisible();
    // Taking part counts the teams the public sees; nothing only those taking part see.
    await expect(visible(page, 'Taking part')).toBeVisible();
    await expect(page.getByText('To do', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Event actions' })).toHaveCount(0);
    // Still on the public side: the login screen was not asked for.
    await expect(page).toHaveURL(/\/events\/fx-tour-autumn$/);
  });

  test('an organisation opens its results, still on the public side', async ({ page }) => {
    await page.goto(AUTUMN);
    await visible(page, 'Test Hoërskool Doringkloof').click();
    await expect(page).toHaveURL(/\/events\/fx-tour-autumn\/standings\/organisations\/fx-org-dkl$/);
    await expect(visible(page, /of 4 · 15 points · 3 teams/)).toBeVisible();
  });

  test('the Schedule is a list of every day, with scores, and narrows to an organisation', async ({ page }) => {
    await page.goto(`${AUTUMN}?tab=schedule`);
    // The list, not the organisers' grid, on a wide screen too: every day unless one is picked.
    await expect(page.getByRole('button', { name: /^Day: All days/ })).toBeVisible();
    await expect(visible(page, 'Sat 3 Oct')).toBeVisible();
    await expect(visible(page, '12 – 8')).toBeVisible();
    await page.getByRole('button', { name: /^Organisation:/ }).click();
    await page.getByRole('button', { name: 'Test Riverbend High School', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Organisation: Test Riverbend High School/ })).toBeVisible();
    // Doringkloof against Kwaggafontein is not one of Riverbend's games.
    await expect(page.getByText('12 – 8', { exact: true }).filter({ visible: true })).toHaveCount(0);
  });

  test('a withdrawn team stays in its division, counted out @phone', async ({ page }) => {
    await page.goto(`${AUTUMN}/divisions/fx-div-autumn-netball-u16`);
    await expect(visible(page, /3 teams/)).toBeVisible();
    // Its fixtures, on the division's Schedule tab (FIX-40), keep it — marked withdrawn.
    await page.goto(`${AUTUMN}/divisions/fx-div-autumn-netball-u16?tab=schedule`);
    await expect(visible(page, '(withdrawn)')).toBeVisible();
  });

  test('a game shows its teams and offers nothing to do @phone', async ({ page }) => {
    await page.goto(`${AUTUMN}/games/fx-game-autumn-netball-u14-1`);
    await expect(visible(page, '12 – 8')).toBeVisible();
    await expect(visible(page, 'No team sheet')).toBeVisible();
    await expect(page.getByText('Pick team', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Game actions' })).toHaveCount(0);
  });
});

test.describe('the public tournament page, signed in', () => {
  test('is the same read-only page for an organiser, who edits in their workspace @phone', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(AUTUMN);
    await expect(visible(page, 'Leaderboard')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Event actions' })).toHaveCount(0);
    await expect(page.getByText('My organisation', { exact: true })).toHaveCount(0);
  });
});
