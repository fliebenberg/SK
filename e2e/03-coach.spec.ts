import { test, expect } from '@playwright/test';
import { DIVISION, ORG, USERS, divisionUrl, signIn, tournamentUrl } from './support';

/**
 * A coach answers for their own team (FIX-31): Riverbend's U16 A rugby coach, while Riverbend has not
 * answered the invitation itself. The invitations box names the team; the tournament page has Mine /
 * My organisation / All and the team's invitation; the team's own page has its Events card. The organisers see the
 * coach's accept as Invited until Riverbend accepts (rule 5).
 */
const RBH_RUGBY = 'fx-ent-spring-rugby-u16-rbh-rugby-u16a';

test.describe.serial('a coach answers for their team', () => {
  test('the events list names the team still to answer @phone', async ({ page }) => {
    await signIn(page, USERS.rbhCoach);
    await page.goto(`/admin/${ORG.rbh}/events`);
    await expect(page.getByText('1 invitation to answer')).toBeVisible();
    await expect(page.getByText(/for U16 A/)).toBeVisible();
  });

  test('the tournament page: their team’s invitation, and Mine / All @phone', async ({ page }) => {
    await signIn(page, USERS.rbhCoach);
    await page.goto(tournamentUrl(ORG.rbh));
    await expect(page.getByText('Your team is invited')).toBeVisible();
    await expect(page.getByTestId(`team-invite-${RBH_RUGBY}`)).toBeVisible();
    await expect(page.getByText('Showing U16 A')).toBeVisible();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByText('Showing the whole tournament')).toBeVisible();
    await page.getByRole('button', { name: 'My organisation', exact: true }).click();
    await expect(page.getByText("Showing Test Riverbend High School's teams")).toBeVisible();
    await page.getByRole('button', { name: 'Mine', exact: true }).click();
    await expect(page.getByText('Showing U16 A')).toBeVisible();
  });

  test('one choice everywhere: All on the events list is My organisation for a coach @phone', async ({ page }) => {
    await signIn(page, USERS.rbhCoach);
    await page.goto(`/admin/${ORG.rbh}/events`);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.goto(tournamentUrl(ORG.rbh));
    await expect(page.getByText("Showing Test Riverbend High School's teams")).toBeVisible();
    await page.getByRole('button', { name: 'Mine', exact: true }).click();
    await expect(page.getByText('Showing U16 A')).toBeVisible();
  });

  test('the team page: the coach accepts from its Events card', async ({ page }) => {
    await signIn(page, USERS.rbhCoach);
    await page.goto(`/admin/${ORG.rbh}/teams/fx-team-rbh-rugby-u16a`);
    await expect(page.getByText('1 invitation to answer')).toBeVisible();
    const row = page.getByTestId(`team-entry-${RBH_RUGBY}`);
    await row.getByRole('button', { name: '✓ Accept' }).click();
    await expect(row).toContainText('Accepted');
    await expect(page.getByText('1 invitation to answer')).toHaveCount(0);
  });

  test('the organisers still see it as Invited until Riverbend accepts (rule 5)', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(divisionUrl(ORG.dkl, DIVISION.rugbyU16));
    await expect(page.getByTestId(`entrant-${RBH_RUGBY}`)).toContainText('Invited');
  });
});
