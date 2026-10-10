import { test, expect, Page } from '@playwright/test';
import { DIVISION, ORG, USERS, divisionUrl, signIn } from './support';

/**
 * A division's page as the tournament's organisers see it (FIX-27, FIX-31, FIX-33): each team's
 * answer, the team's menu, requests waiting, the lock, the draw, its details and its adding setting.
 * Runs in order: later steps start from what earlier ones did.
 */
const ent = (division: string, org: string, team: string) => `entrant-fx-ent-spring-${division}-${org}-${team}`;
const req = (division: string, org: string, team: string) => `request-fx-ent-spring-${division}-${org}-${team}`;

async function open(page: Page, divisionId: string) {
  await signIn(page, USERS.hostAdmin);
  await page.goto(divisionUrl(ORG.dkl, divisionId));
  await expect(page.getByText('Teams').first()).toBeVisible();
}

test.describe.serial('a division, as the organisers', () => {
  test('Rugby U16 shows each team as the organisers see it, and cannot lock yet @phone', async ({ page }) => {
    await open(page, DIVISION.rugbyU16);
    await expect(page.getByTestId(ent('rugby-u16', 'ksc', 'rugby-u16'))).toContainText('Not invited yet');
    await expect(page.getByTestId(ent('rugby-u16', 'rbh', 'rugby-u16a'))).toContainText('Invited');
    await expect(page.getByTestId(ent('rugby-u16', 'sac', 'rugby-u16a'))).toContainText('Accepted');
    await expect(page.getByTestId(req('rugby-u16', 'sac', 'rugby-1stxv'))).toContainText('Asks to enter');
    await expect(page.getByTestId(req('rugby-u16', 'sac', 'rugby-1stxv'))).toContainText('would like a run before the season');
    await expect(page.getByRole('button', { name: /Lock entries/ })).toBeDisabled();
  });

  test("a team can't be marked accepted before its organisation accepts, but can be declined", async ({ page }) => {
    await open(page, DIVISION.rugbyU16);
    // Kwaggafontein's team: its organisation is not even invited yet. (Riverbend's is the coach's, later.)
    const row = page.getByTestId(ent('rugby-u16', 'ksc', 'rugby-u16'));
    await row.getByRole('button', { name: /actions/ }).click();
    await expect(page.getByText(/Once Test Kwaggafontein Sports Club has accepted/)).toBeVisible();
    await page.getByText('Mark as declined', { exact: true }).click();
    await expect(page.getByText("Decline Test Kwaggafontein Sports Club's U16 Lions?", { exact: false })).toBeVisible();
    // Found 2026-10-10: a confirmation opened from a ⋯ menu is hidden from the accessibility tree
    // (UI-30), so it is clicked by its text.
    await page.getByText('✕ Decline', { exact: true }).last().click();
    await expect(row).toContainText('Declined');
    await expect(page.getByText('Not taking part')).toBeVisible();
  });

  test('a team added by an organisation is accepted', async ({ page }) => {
    await open(page, DIVISION.rugbyU16);
    await page.getByTestId(req('rugby-u16', 'sac', 'rugby-1stxv')).getByRole('button', { name: '✓ Accept' }).click();
    await expect(page.getByTestId(ent('rugby-u16', 'sac', 'rugby-1stxv'))).toContainText('Accepted');
  });

  test('Netball U14, locked: a withdrawal kept in, a late request turned down, then the draw', async ({ page }) => {
    await open(page, DIVISION.netballU14);
    await expect(page.getByText('🔒 Entries locked').first()).toBeVisible();
    await page.getByTestId(req('netball-u14', 'sac', 'netball-u14a')).getByRole('button', { name: 'Keep them in' }).click();
    await expect(page.getByTestId(ent('netball-u14', 'sac', 'netball-u14a'))).toBeVisible();
    await page.getByTestId(req('netball-u14', 'sac', 'netball-u16a')).getByRole('button', { name: 'Turn down' }).click();
    await page.getByText('Turn down', { exact: true }).last().click();
    await expect(page.getByTestId(ent('netball-u14', 'sac', 'netball-u16a'))).toContainText('Turned down');

    await page.getByRole('button', { name: 'Make the draw' }).first().click();
    await expect(page.getByText('Make the draw?')).toBeVisible();
    await page.getByRole('button', { name: 'Make the draw' }).last().click();
    await expect(page.getByText('Draw made').first()).toBeVisible();
  });

  test('the details dialog saves a name, and an emptied name goes back to the automatic one', async ({ page }) => {
    await open(page, DIVISION.netballU16);
    await page.getByRole('button', { name: /Edit/ }).first().click();
    const name = page.getByLabel('Division name');
    await name.fill('U16 Girls');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('U16 Girls').first()).toBeVisible();

    await page.getByRole('button', { name: /Edit/ }).first().click();
    await page.getByLabel('Division name').fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('U16 Girls')).toHaveCount(0);
  });

  test("How it's played saves, and changes what the card says", async ({ page }) => {
    await open(page, DIVISION.rugbyU16);
    await page.getByRole('button', { name: /Edit/ }).nth(1).click();
    await expect(page.getByText("How it's played").last()).toBeVisible();
    await page.getByRole('button', { name: 'Twice (home and away)' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Everyone plays everyone twice/)).toBeVisible();
  });

  test('Add teams enters another team, which starts invited', async ({ page }) => {
    await open(page, DIVISION.netballU16);
    await expect(page.getByTestId(ent('netball-u16', 'dkl', 'netball-u16a'))).toBeVisible();
    const before = await page.locator('[data-testid^="entrant-"]').count();
    await page.getByRole('button', { name: '＋ Add team' }).click();
    await expect(page.getByText('Add teams to U16')).toBeVisible();
    await page.getByRole('checkbox').first().click();
    await page.getByRole('button', { name: 'Add team', exact: true }).last().click();
    await expect(page.locator('[data-testid^="entrant-"]')).toHaveCount(before + 1);
  });

  test("a division's own adding setting, and back to the tournament's (FIX-33)", async ({ page }) => {
    await open(page, DIVISION.netballU16);
    await expect(page.getByText(/Off for this division/)).toBeVisible();
    await page.getByText(/Use the tournament's setting/).click();
    await expect(page.getByText('Same as the tournament: on')).toBeVisible();
    await page.getByRole('switch', { name: 'Organisations can add their own teams' }).click();
    await expect(page.getByText(/Off for this division/)).toBeVisible();
  });
});
