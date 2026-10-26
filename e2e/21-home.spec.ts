import { test, expect, Page } from '@playwright/test';
import { USERS, signIn } from './support';

/**
 * Home (`HOME-1`, docs/home.md, option B on `mockups/home-near-you.html`): the same page for
 * everyone. Logged out it leads with the hero; signed in with *My organisations & teams*. Both have
 * the one search, *Your location* and what is near there.
 */
const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text, typeof text === 'string' ? { exact: true } : undefined).filter({ visible: true }).first();

/** A position a kilometre or two from Doringkloof, the fixture school in Pretoria East. */
const NEAR_DORINGKLOOF = { latitude: -25.853, longitude: 28.196 };

test.describe('Home, logged out', () => {
  test('leads with what ScoreKeeper is and the way in @phone', async ({ page }) => {
    await page.goto('/');
    await expect(visible(page, 'Create an account')).toBeVisible();
    await expect(visible(page, 'Log in')).toBeVisible();
    await expect(visible(page, 'What is ScoreKeeper? ›')).toBeVisible();
    await expect(visible(page, 'Your location')).toBeVisible();
    await expect(page.getByText('My organisations & teams', { exact: true })).toHaveCount(0);
  });

  test('one search finds a team by its organisation and age group, and opens its page @phone', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Search organisations, teams and sites').fill('doringkloof u14');
    await expect(visible(page, 'Results')).toBeVisible();
    await visible(page, 'U14 A').click();
    await expect(page).toHaveURL(/\/teams\/fx-team-dkl-/);
  });

  test('Set my location offers the device or a typed place', async ({ page }) => {
    await page.goto('/');
    await visible(page, 'Set my location').click();
    await expect(visible(page, 'Use my location')).toBeVisible();
    await expect(page.getByPlaceholder('Type a town or address')).toBeVisible();
  });
});

test.describe('Home, with location allowed', () => {
  test.use({ geolocation: NEAR_DORINGKLOOF, permissions: ['geolocation'] });

  test('looks where the device is and lists the organisations near it, closest first @phone', async ({ page }) => {
    await page.goto('/');
    await expect(visible(page, 'From this device · within 25 km')).toBeVisible();
    await expect(visible(page, 'Organisations near you')).toBeVisible();
    await expect(visible(page, 'Test Hoërskool Doringkloof')).toBeVisible();
    // Riverbend is in Pietermaritzburg, far outside 25 km.
    await expect(page.getByText('Test Riverbend High School', { exact: true })).toHaveCount(0);
  });
});

test.describe('Home, signed in', () => {
  test('leads with my organisations and teams, and no hero', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    // Through the app rather than a second page load, which costs the dev bundle all over again.
    await visible(page, 'Home').click();
    await expect(visible(page, 'My organisations & teams')).toBeVisible();
    await expect(visible(page, 'Admin')).toBeVisible();
    await expect(page.getByText('Create an account', { exact: true })).toHaveCount(0);
    await expect(visible(page, 'Your location')).toBeVisible();
  });
});
