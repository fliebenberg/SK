import { test, expect } from '@playwright/test';
import { ORG, USERS, orgPageUrl, signIn, tournamentUrl } from './support';

/**
 * An organisation's invitation (FIX-26, FIX-30, FIX-31): the host invites Kwaggafontein, which
 * declines — final for it, its team declined as the record; the organisers enter a team into a locked
 * division, where it goes straight in as accepted; and St Aldric's asks to withdraw, which the
 * organisers confirm. Runs last: it takes organisations out of the tournament.
 */
const card = (division: string, org: string, team: string) => `team-card-fx-ent-spring-${division}-${org}-${team}`;

test.describe.serial('invitations and entering teams', () => {
  test('the host invites Kwaggafontein', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(tournamentUrl(ORG.dkl));
    await page.getByRole('button', { name: 'Invite', exact: true }).first().click();
    await expect(page.getByText('Invite 1 organisation?')).toBeVisible();
    await page.getByRole('button', { name: 'Invite', exact: true }).last().click();
    await expect(page.getByText(/not invited yet/i)).toHaveCount(0);
  });

  test('Kwaggafontein declines: final for it, and its team is declined as the record', async ({ page }) => {
    await signIn(page, USERS.kscAdmin);
    await page.goto(orgPageUrl(ORG.ksc, ORG.ksc));
    await page.getByRole('button', { name: '✕ Decline' }).first().click();
    await expect(page.getByText('You cannot change your answer afterwards — only the organisers can.')).toBeVisible();
    await page.getByRole('button', { name: '✕ Decline' }).last().click();
    await expect(page.getByText('To change this, contact the organisers.')).toBeVisible();
    await expect(page.getByTestId(card('rugby-u16', 'ksc', 'rugby-u16'))).toContainText('Declined');
  });

  test('the organisers enter a team into a locked division: it goes straight in, accepted (FIX-26, FIX-31)', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(orgPageUrl(ORG.dkl, ORG.rbh));
    await page.getByRole('checkbox', { name: /U14 A/ }).first().click();
    // The save bar's label has no button role, so it is found by its words.
    await page.getByText(/^save$/i).last().click();
    await expect(page.getByRole('checkbox', { name: /U14 A/ }).first()).toContainText('Accepted');
  });

  test("St Aldric's asks to withdraw from the tournament, and the organisers confirm it", async ({ page }) => {
    await signIn(page, USERS.sacAdmin);
    await page.goto(orgPageUrl(ORG.sac, ORG.sac));
    await page.getByText('Withdraw from the tournament').click();
    await page.getByLabel('Why are you withdrawing?').fill('Our bus is not available that weekend.');
    await page.getByRole('button', { name: 'Ask to withdraw' }).click();
    await expect(page.getByText('Withdrawal requested')).toBeVisible();

    await signIn(page, USERS.hostAdmin);
    await page.goto(orgPageUrl(ORG.dkl, ORG.sac));
    await expect(page.getByText('Our bus is not available that weekend.')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm withdrawal' }).click();
    await expect(page.getByText(/Withdrawn/).first()).toBeVisible();
  });
});
