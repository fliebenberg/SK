import { test, expect, Page } from '@playwright/test';
import { USERS, signIn } from './support';

/**
 * Home (`HOME-1`, docs/home.md, option B on `mockups/home-near-you.html`): the same page for
 * everyone. Logged out it leads with the hero; signed in with *My games*, when they have any. Both have
 * the one search, the location and what is near there.
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
    await expect(visible(page, 'Set my location')).toBeVisible();
    await expect(page.getByText('My organisations & teams', { exact: true })).toHaveCount(0);
  });

  test('one search finds a team by its organisation and age group, and opens its page @phone', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Search organisations, teams and sites').fill('doringkloof u14');
    await expect(visible(page, 'Results')).toBeVisible();
    await visible(page, 'U14 A').click();
    await expect(page).toHaveURL(/\/teams\/fx-team-dkl-/);
  });

  test('Set my location offers the device, or a town or suburb from our own place list', async ({ page }) => {
    await page.goto('/');
    await visible(page, 'Set my location').click();
    await expect(visible(page, 'Use my location')).toBeVisible();
    await page.getByPlaceholder('Type a town or suburb').fill('doringk');
    await expect(visible(page, 'Centurion, Gauteng')).toBeVisible();
    await visible(page, 'Doringkloof').click();
    await expect(visible(page, 'Near Doringkloof')).toBeVisible();
    await expect(visible(page, 'Change location')).toBeVisible();
  });
});

test.describe('Home, with location allowed', () => {
  test.use({ geolocation: NEAR_DORINGKLOOF, permissions: ['geolocation'] });

  test('looks where the device is and lists the organisations near it, closest first @phone', async ({ page }) => {
    await page.goto('/');
    await expect(visible(page, 'Change location')).toBeVisible();
    // Named from the server's place list, on web as on the phones.
    await expect(visible(page, /^Near .+, Centurion$/)).toBeVisible();
    await expect(visible(page, 'Organisations near you')).toBeVisible();
    await expect(visible(page, 'Test Hoërskool Doringkloof')).toBeVisible();
    // Riverbend is in Pietermaritzburg, far outside 25 km.
    await expect(page.getByText('Test Riverbend High School', { exact: true })).toHaveCount(0);
  });
});

test.describe('Home, on a touch tablet', () => {
  test.use({ viewport: { width: 900, height: 1200 }, hasTouch: true, isMobile: true });

  test('the collapsed sidebar opens from its menu button, which has no hover to rely on', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Open menu').tap();
    await visible(page, 'Organisations').tap();
    await expect(page).toHaveURL(/\/organizations/);
  });
});

test.describe('Home, signed in', () => {
  test('has no hero, and no list of their organisations', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    // Through the app rather than a second page load, which costs the dev bundle all over again.
    await visible(page, 'Home').click();
    await expect(page.getByText('My organisations & teams', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Create an account', { exact: true })).toHaveCount(0);
    await expect(visible(page, 'Set my location')).toBeVisible();
  });
});
