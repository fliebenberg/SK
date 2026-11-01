import { test, expect } from '@playwright/test';
import { ORG, USERS, signIn } from './support';

/**
 * The public Teams tab (`UI-33`, docs/teams.md §8): every team, filtered and paged on the server. A
 * card has no buttons: it opens the team in the workspace for someone who runs it, and otherwise its
 * public page. Fixture teams are too few to show the pager, which test-private-orgs.ts covers on the
 * server.
 */
const LIONS = 'team-card-fx-team-ksc-rugby-u16';
const DKL_RUGBY = 'team-card-fx-team-dkl-rugby-u16a';
const DKL_NETBALL_U14 = 'team-card-fx-team-dkl-netball-u14a';
const PARENT = 'busisiwe.mkhize@example.test';

test.describe('the Teams tab', () => {
  test('someone signed out sees every team with no tabs, and a card opens its public page', async ({ page }) => {
    await page.goto('/teams');
    await expect(page.getByTestId(DKL_RUGBY)).toBeVisible();
    await expect(page.getByTestId(LIONS)).toBeVisible();
    await expect(page.getByRole('tab', { name: 'My Teams' })).toHaveCount(0);

    await page.getByTestId(DKL_RUGBY).click();
    await expect(page).toHaveURL(/\/teams\/fx-team-dkl-rugby-u16a$/);
  });

  test('search runs on the server, and every word has to match', async ({ page }) => {
    await page.goto('/teams');
    await page.getByLabel('Search teams').fill('doringkloof netball u14');
    await expect(page.getByTestId(DKL_NETBALL_U14)).toBeVisible();
    await expect(page.getByTestId(DKL_RUGBY)).toHaveCount(0);
    await expect(page.getByTestId(LIONS)).toHaveCount(0);

    await page.getByLabel('Search teams').fill('zzz no such team');
    await expect(page.getByText('No matching teams')).toBeVisible();
  });

  test('a coach starts on My Teams, with their role, and their card opens the workspace', async ({ page }) => {
    await signIn(page, USERS.kscCoach);
    await page.goto('/teams');
    await expect(page.getByTestId(LIONS)).toBeVisible();
    await expect(page.getByTestId(LIONS).getByText('Coach')).toBeVisible();
    await expect(page.getByTestId(DKL_RUGBY)).toHaveCount(0);

    await page.getByTestId(LIONS).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${ORG.ksc}/teams/fx-team-ksc-rugby-u16$`));
  });

  test("a parent's My Teams is their child's team, and it opens the public page", async ({ page }) => {
    await signIn(page, PARENT);
    await page.goto('/teams');
    await expect(page.getByTestId(DKL_NETBALL_U14).getByText("Zanele’s team")).toBeVisible();
    await expect(page.getByTestId(DKL_RUGBY)).toHaveCount(0);

    await page.getByTestId(DKL_NETBALL_U14).click();
    await expect(page).toHaveURL(/\/teams\/fx-team-dkl-netball-u14a$/);
  });

  test("an admin's own teams open in the workspace, other organisations' on the public page", async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto('/teams');
    await page.getByRole('tab', { name: 'All Teams' }).click();
    await expect(page.getByTestId(DKL_RUGBY).getByText('Admin')).toBeVisible();
    await expect(page.getByTestId(LIONS).getByText('Admin')).toHaveCount(0);

    await page.getByTestId(LIONS).click();
    await expect(page).toHaveURL(/\/teams\/fx-team-ksc-rugby-u16$/);
    await page.goto('/teams');
    await page.getByTestId(DKL_RUGBY).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${ORG.dkl}/teams/fx-team-dkl-rugby-u16a$`));

    // Those who run it can still see what everyone else sees.
    await page.getByRole('button', { name: 'Public page' }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/teams\/fx-team-dkl-rugby-u16a$/);
  });
});
