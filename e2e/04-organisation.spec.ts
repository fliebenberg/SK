import { test, expect } from '@playwright/test';
import { DIVISION, ORG, USERS, divisionUrl, orgPageUrl, signIn } from './support';

/**
 * An organisation answers on its own page in the tournament (FIX-30, FIX-31, FIX-33): team cards with
 * their buttons, the Outstanding filter, Accept with its teams, a team declined and accepted again, a
 * locked team asked to withdraw, a team added for approval — and staff, who answer for nothing.
 * Runs after the coach (03), who accepted Riverbend's U16 A rugby team.
 */
const card = (division: string, org: string, team: string) => `team-card-fx-ent-spring-${division}-${org}-${team}`;

test.describe.serial("an organisation's own page", () => {
  test('staff see the teams and answer for none @phone', async ({ page }) => {
    await signIn(page, USERS.sacStaff);
    await page.goto(orgPageUrl(ORG.sac, ORG.sac));
    await expect(page.getByTestId(card('rugby-u16', 'sac', 'rugby-u16a'))).toBeVisible();
    await expect(page.getByRole('button', { name: '✓ Accept' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '✕ Decline' })).toHaveCount(0);
  });

  test('Riverbend: Outstanding narrows to the teams to answer, then Accept takes its invited teams with it', async ({ page }) => {
    await signIn(page, USERS.rbhAdmin);
    await page.goto(orgPageUrl(ORG.rbh, ORG.rbh));
    await expect(page.getByText(/Outstanding responses 1/)).toBeVisible();
    await page.getByRole('button', { name: 'Outstanding, 1' }).click();
    await expect(page.getByTestId(card('netball-u16', 'rbh', 'netball-u16a'))).toBeVisible();
    await expect(page.getByTestId(card('rugby-u16', 'rbh', 'rugby-u16a'))).toHaveCount(0);

    await page.getByRole('button', { name: '✓ Accept' }).first().click(); // the organisation's
    await expect(page.getByText('Accept for all invited teams')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Accept for all invited teams' })).toBeChecked();
    await page.getByRole('button', { name: '✓ Accept' }).last().click();
    await expect(page.getByText(/Accepted by you/)).toBeVisible();
    // Nothing is outstanding now, so the filter is gone and every team shows.
    await expect(page.getByTestId(card('netball-u16', 'rbh', 'netball-u16a'))).toContainText('Accepted');
    await expect(page.getByTestId(card('rugby-u16', 'rbh', 'rugby-u16a'))).toContainText('Accepted');
  });

  test('…and the organisers now see the coach’s accept (rule 5)', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(divisionUrl(ORG.dkl, DIVISION.rugbyU16));
    await expect(page.getByTestId('entrant-fx-ent-spring-rugby-u16-rbh-rugby-u16a')).toContainText('Accepted');
  });

  test("St Aldric's: a team its coach accepted is declined, then accepted again", async ({ page }) => {
    await signIn(page, USERS.sacAdmin);
    await page.goto(orgPageUrl(ORG.sac, ORG.sac));
    const team = page.getByTestId(card('rugby-u16', 'sac', 'rugby-u16a'));
    await team.getByRole('button', { name: '✕ Decline' }).click();
    await expect(page.getByText(/was accepted by Brendan O'Neill/)).toBeVisible();
    await page.getByRole('button', { name: '✕ Decline' }).last().click();
    await expect(team).toContainText('Declined');

    await team.getByRole('button', { name: '✓ Accept' }).click();
    await expect(page.getByText(/was declined by/)).toBeVisible();
    await page.getByRole('button', { name: '✓ Accept' }).last().click();
    await expect(team).toContainText('Accepted');
  });

  test("St Aldric's: a team in a locked division is asked to withdraw, then the request cancelled", async ({ page }) => {
    await signIn(page, USERS.sacAdmin);
    await page.goto(orgPageUrl(ORG.sac, ORG.sac));
    const team = page.getByTestId(card('netball-u14', 'sac', 'netball-u14a'));
    await team.getByRole('button', { name: 'Withdraw' }).click();
    await page.getByLabel('Why are you withdrawing it?').fill('Injuries in the squad.');
    await page.getByRole('button', { name: 'Ask to withdraw' }).click();
    await expect(team).toContainText('Withdrawal pending');
    await team.getByRole('button', { name: 'Cancel request' }).click();
    await expect(team).toContainText('Accepted');
  });

  test('Riverbend adds a team where the division allows it, then cancels it (FIX-33)', async ({ page }) => {
    await signIn(page, USERS.rbhAdmin);
    await page.goto(orgPageUrl(ORG.rbh, ORG.rbh));
    await page.getByTestId(`division-${DIVISION.rugbyU16}`).getByText('＋ Add a team').click();
    await page.getByText('1st XV', { exact: true }).click();
    await page.getByRole('button', { name: 'Add team' }).click();
    const added = page.getByTestId(`division-${DIVISION.rugbyU16}`).getByText('Asks to enter');
    await expect(added).toBeVisible();
    await page.getByTestId(`division-${DIVISION.rugbyU16}`).getByRole('button', { name: 'Cancel request' }).click();
    await expect(added).toHaveCount(0);
  });
});
