import { test, expect } from '@playwright/test';
import { ORG, USERS, signIn, tournamentUrl } from './support';

/**
 * The tournament page as its host sees it (FIX-28, FIX-31, FIX-33): its cards, a sport's organisers in
 * a dialog, Lock all on Fixtures, and the setting that lets organisations add their own teams.
 */
test.describe('the tournament page, as the host', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(tournamentUrl(ORG.dkl));
    await expect(page.getByText('Test Spring Festival').first()).toBeVisible();
  });

  test('shows its sections, with entries open and Lock all on Fixtures @phone', async ({ page }) => {
    await expect(page.getByText('Sports & divisions').first()).toBeVisible();
    await expect(page.getByText('Organisations & teams').first()).toBeVisible();
    await expect(page.getByText(/Entries open · 2/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Lock all/ })).toBeVisible();
  });

  test('Lock all says which divisions stay open, and why', async ({ page }) => {
    await page.getByRole('button', { name: /Lock all/ }).click();
    await expect(page.getByText('No division can be locked yet')).toBeVisible();
    await expect(page.getByText('Stays open')).toBeVisible();
    await expect(page.getByText(/Rugby U16: .*still to answer/)).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  });

  test("a sport's organisers are appointed in a dialog (FIX-28)", async ({ page }) => {
    await page.getByRole('button', { name: 'Rugby actions' }).first().click();
    await page.getByText('Sport organisers', { exact: true }).click();
    await expect(page.getByText('Rugby organisers').first()).toBeVisible();
  });

  test('organisations may add their own teams — the tournament setting, followed by its divisions (FIX-33)', async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Organisations can add their own teams' });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    // A division that has not chosen follows it.
    await page.goto(`${tournamentUrl(ORG.dkl)}/divisions/fx-div-spring-rugby-u16`);
    await expect(page.getByText('Same as the tournament: off')).toBeVisible();
    await page.goto(tournamentUrl(ORG.dkl));
    const again = page.getByRole('switch', { name: 'Organisations can add their own teams' });
    await again.click();
    await expect(again).toBeChecked();
  });
});
