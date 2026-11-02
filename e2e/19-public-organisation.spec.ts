import { test, expect, Page } from '@playwright/test';
import { ORG, USERS, signIn } from './support';

/**
 * An organisation as anyone sees it, from the Orgs tab (`UI-34`, agreed on
 * `mockups/org-public-page.html`, option A; docs/events.md §11): the Profile's banner, then tabs —
 * Overview with On now & next, Teams with their coaches, Fixtures as the read-only events list.
 */
const DKL = `/organizations/${ORG.dkl}`;

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text, typeof text === 'string' ? { exact: true } : undefined).filter({ visible: true }).first();

// The page it came from stays mounted underneath with its own Back; the current page's comes last.
const back = (page: Page) => page.getByTestId('screen-back').filter({ visible: true }).last();

test.describe('the public organisation page, logged out', () => {
  test('leads with its banner and On now & next, and nothing made up @phone', async ({ page }) => {
    await page.goto(DKL);
    await expect(visible(page, 'Test Hoërskool Doringkloof')).toBeVisible();
    await expect(visible(page, 'On now & next')).toBeVisible();
    await expect(visible(page, 'All fixtures ›')).toBeVisible();
    await expect(page.getByText(/Registration|Inquire/)).toHaveCount(0);
    await expect(page.getByText(/Workspace/)).toHaveCount(0);
  });

  test('its teams name their coach @phone', async ({ page }) => {
    await page.goto(`${DKL}?tab=teams`);
    await expect(visible(page, 'Coach Hennie Steyn')).toBeVisible();
    await expect(visible(page, 'No coach yet')).toBeVisible();
  });

  test('Fixtures is the events list without Mine, and a tournament opens its public page', async ({ page }) => {
    await page.goto(DKL);
    await visible(page, 'All fixtures ›').click();
    await expect(page.getByLabel('Search events')).toBeVisible();
    await expect(page.getByText('Mine', { exact: true })).toHaveCount(0);
    await expect(page.getByText('New event', { exact: true })).toHaveCount(0);
    await visible(page, 'Test Saturday Fixtures').click();
    await expect(page).toHaveURL(/\/events\/fx-tour-saturday$/);
  });
});

test.describe('a team and a site, logged out', () => {
  test('a team row opens the public team page, read-only, with its players @phone', async ({ page }) => {
    await page.goto(`${DKL}?tab=teams`);
    await visible(page, 'Coach Pieter Joubert').click();
    await expect(page).toHaveURL(/\/teams\/fx-team-dkl-rugby-u16a$/);
    await expect(visible(page, 'U16 A')).toBeVisible();
    await expect(visible(page, 'Last result')).toBeVisible();
    await expect(page.getByText('Edit', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/permission/i)).toHaveCount(0);
  });

  test('its Players tab names the squad, with no org IDs or tags', async ({ page }) => {
    await page.goto('/teams/fx-team-dkl-rugby-u16a?tab=players');
    await expect(visible(page, '#11 · Left Wing · 4 games · 4 tries')).toBeVisible();
    await expect(visible(page, 'Coach')).toBeVisible();
    await expect(page.getByText(/^DKL\d+$/)).toHaveCount(0);
    await expect(page.getByText('Minor', { exact: true })).toHaveCount(0);
  });

  test('its Competitions are the tournaments it has a place in, nothing to answer', async ({ page }) => {
    await page.goto('/teams/fx-team-dkl-rugby-u16a?tab=competitions');
    await expect(visible(page, 'Test Autumn Festival')).toBeVisible();
    await expect(page.getByRole('button', { name: '✓ Accept' })).toHaveCount(0);
  });

  test('a site row opens the public site page, with directions and no inactive facility @phone', async ({ page }) => {
    await page.goto(`${DKL}?tab=sites`);
    await visible(page, 'Main Campus').click();
    await expect(page).toHaveURL(/\/sites\/fx-site-dkl$/);
    await expect(visible(page, 'Directions')).toBeVisible();
    await expect(visible(page, 'Copy address')).toBeVisible();
    await expect(page.getByText('Add facility', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Netball Court 4', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/permission/i)).toHaveCount(0);
  });

  test('Back from a site returns to the organisation, whichever site was opened last @phone', async ({ page }) => {
    await page.goto(`${DKL}?tab=sites`);
    await visible(page, 'Main Campus').click();
    await expect(page).toHaveURL(/\/sites\/fx-site-dkl$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/organizations\/fx-org-dkl/);
    await visible(page, 'Sports Club Grounds').click();
    await expect(page).toHaveURL(/\/sites\/fx-site-dkl-club$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/organizations\/fx-org-dkl/);
  });

  test('Back from a team returns to the organisation, whichever team was opened last @phone', async ({ page }) => {
    await page.goto(`${DKL}?tab=teams`);
    await visible(page, 'U14 A').click();
    await expect(page).toHaveURL(/\/teams\/fx-team-dkl-netball-u14a$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/organizations\/fx-org-dkl/);
    await visible(page, 'U19 A').click();
    await expect(page).toHaveURL(/\/teams\/fx-team-dkl-netball-u19a$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/organizations\/fx-org-dkl/);
  });

  test('Back from a team opened from the Teams list returns to the list @phone', async ({ page }) => {
    await page.goto('/teams');
    await page.locator('[data-testid^="team-card-"]').filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/teams\/[^/]+$/);
    await back(page).click();
    await expect(page).toHaveURL(/\/teams$/);
  });

  test('there is no list of all sites: the old address goes to Organisations', async ({ page }) => {
    await page.goto('/sites');
    await expect(page).toHaveURL(/\/organizations$/);
  });
});

/**
 * An organisation nobody runs yet says so under its banner, to everyone, with the way to claim it or
 * nominate someone (`UnclaimedOrgStrip`, 2026-10-31). A visitor is asked to sign in first; signed in,
 * anyone may take the role of one with no members, and the strip goes once they have.
 */
test.describe('an organisation nobody runs yet', () => {
  const UCC = `/organizations/${ORG.ucc}`;

  test('says so to a visitor, who is asked to sign in to claim it @phone', async ({ page }) => {
    await page.goto(UCC);
    await expect(visible(page, 'Test Unclaimed Cricket Club has no administrator yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Claim or nominate' }).click();
    await expect(visible(page, 'Sign in to claim Test Unclaimed Cricket Club')).toBeVisible();
  });

  test('signed in, anyone may take it on, and the strip goes', async ({ page }) => {
    await signIn(page, USERS.sacStaff);
    await page.goto(UCC);
    await page.getByRole('button', { name: 'Claim or nominate' }).click();
    await page.getByText("It's me: take on the admin role", { exact: true }).click();
    await page.getByText('Take on the admin role', { exact: true }).last().click();
    await expect(page.getByText(/You are now the administrator of/)).toBeVisible();
    await page.getByText('Done', { exact: true }).click();
    await expect(page.getByText('Test Unclaimed Cricket Club has no administrator yet.')).toHaveCount(0);
    await expect(visible(page, /^Manage Workspace/)).toBeVisible();
  });
});
