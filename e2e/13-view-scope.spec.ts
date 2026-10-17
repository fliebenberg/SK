import { test, expect } from '@playwright/test';
import { ORG, USERS, signIn } from './support';

/**
 * Mine / My organisation / All inside a tournament (2026-10-17): Kwaggafontein's admin, with no team
 * of their own, in *Test Saturday Fixtures*, which Kwaggafontein accepted. They get My organisation /
 * All, start on All as an admin, and the choice follows them to a division, the Schedule and the Standings.
 */
const SATURDAY = `/admin/${ORG.ksc}/events/fx-tour-saturday`;
const KSC_TEAMS = "Showing Test Kwaggafontein Sports Club's teams";

test.describe.serial('one view choice across a tournament', () => {
  test('the tournament page, then a division and the Schedule, follow My organisation — and the Standings @phone', async ({ page }) => {
    await signIn(page, USERS.kscAdmin);
    await page.goto(SATURDAY);
    await expect(page.getByText('Showing the whole tournament')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mine', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'My organisation', exact: true }).click();
    await expect(page.getByText(KSC_TEAMS)).toBeVisible();

    await page.goto(`${SATURDAY}/divisions/fx-div-saturday-netball-u14`);
    await expect(page.getByText(KSC_TEAMS)).toBeVisible();

    await page.goto(`${SATURDAY}?tab=schedule`);
    await expect(page.getByText(KSC_TEAMS)).toBeVisible();

    // Standings: the divisions it is in — not the 1st XV — and every division on All.
    await page.goto(`${SATURDAY}?tab=standings`);
    await expect(page.getByText(KSC_TEAMS)).toBeVisible();
    await expect(page.getByText('1st XV', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByText('Showing every division')).toBeVisible();
    await expect(page.getByText('1st XV', { exact: true })).toBeVisible();

    // All, chosen there, is the Schedule's too.
    await page.goto(`${SATURDAY}?tab=schedule`);
    await expect(page.getByText('Showing the whole schedule')).toBeVisible();
  });
});
