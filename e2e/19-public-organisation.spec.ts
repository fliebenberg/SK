import { test, expect, Page } from '@playwright/test';
import { ORG } from './support';

/**
 * An organisation as anyone sees it, from the Orgs tab (`UI-34`, agreed on
 * `mockups/org-public-page.html`, option A; docs/events.md §11): the Profile's banner, then tabs —
 * Overview with On now & next, Teams with their coaches, Fixtures as the read-only events list.
 */
const DKL = `/organizations/${ORG.dkl}`;

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text, typeof text === 'string' ? { exact: true } : undefined).filter({ visible: true }).first();

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
});
