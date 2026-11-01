import { test, expect } from '@playwright/test';
import { ORG, USERS, signIn, tournamentUrl } from './support';

/**
 * Registering an organisation is asked about duplicates as adding one is (`ORG-15`, 2026-11-01), and
 * the pickers before it find near matches. Nothing here saves, so no other spec sees a difference.
 */
test.describe('registering an organisation that may already exist', () => {
  test('a game: the picker finds a near match, and a match in the dialog is used instead @phone', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(`/admin/${ORG.dkl}/events/create`);
    const search = page.getByPlaceholder('Search For Team 2 Organisation');

    // A typing slip, which the search once could not find.
    await search.fill('Test Unclaimd');
    await expect(page.getByText('Test Unclaimed Cricket Club', { exact: true }).filter({ visible: true })).toBeVisible();

    await search.fill('Test Unclaimd Cricket');
    await page.getByText('Register "Test Unclaimd Cricket"').click();
    const matches = page.getByTestId('possible-duplicate-orgs');
    await matches.getByRole('button', { name: 'Use this: Test Unclaimed Cricket Club' }).click();

    await expect(matches).toHaveCount(0);
    // On the form, not just in the prompt to nominate an admin, which goes once the club is claimed.
    await expect(page.getByText('Test Unclaimed Cricket Club (UCC)').filter({ visible: true }).first()).toBeVisible();
    await expect(search).toHaveCount(0);
  });

  test('a tournament: one already taking part says so, and a new one needs the tick @phone', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(`${tournamentUrl(ORG.dkl)}/organisations`);
    await page.getByRole('button', { name: '＋ Add organisation' }).click();
    await page.getByLabel('Search organisations').fill('Test Riverbend');
    await page.getByText('Register “Test Riverbend”').click();

    const matches = page.getByTestId('possible-duplicate-orgs');
    await expect(matches).toContainText('Test Riverbend High School');
    await expect(matches).toContainText('Taking part');
    const register = page.getByRole('button', { name: 'Register', exact: true });
    await expect(register).toBeDisabled();
    await page.getByRole('checkbox', { name: /None of these/ }).click();
    await expect(register).toBeEnabled();
  });
});
