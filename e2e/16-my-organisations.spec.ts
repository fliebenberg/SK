import { test, expect } from '@playwright/test';
import { ORG, USERS, signIn } from './support';

/**
 * My Organisations lists every organisation you hold a role in, not only the ones you manage
 * (2026-10-22). Kwaggafontein's U16 Lions coach, Dewald Nel, is an org Member there: he sees it, with
 * Open Workspace; St Aldric's staff, who coach nothing, see their own with Manage Workspace.
 */
test.describe('My Organisations', () => {
  test("a coach sees the organisation they coach for, and opens its workspace @phone", async ({ page }) => {
    await signIn(page, USERS.kscCoach);
    await page.goto('/organizations');
    const card = page.getByTestId(`my-org-${ORG.ksc}`);
    await expect(card).toContainText('Member');
    await expect(page.getByTestId(`my-org-${ORG.dkl}`)).toHaveCount(0);
    await card.getByText('Open Workspace').click();
    await expect(page).toHaveURL(new RegExp(`/admin/${ORG.ksc}`));
  });

  test("the organisation's own page offers the coach its workspace too @phone", async ({ page }) => {
    await signIn(page, USERS.kscCoach);
    await page.goto(`/organizations/${ORG.ksc}`);
    await expect(page.getByText('Open Workspace')).toBeVisible();
  });

  test('staff who coach nothing see their organisation, to manage @phone', async ({ page }) => {
    await signIn(page, USERS.sacStaff);
    await page.goto('/organizations');
    await expect(page.getByTestId(`my-org-${ORG.sac}`)).toContainText('Manage Workspace');
  });

  // The page's add action is in its header, as on every list page, so a long list cannot bury it (2026-10-31).
  test('Add organisation is in the header, on phone and desktop alike @phone', async ({ page }) => {
    await signIn(page, USERS.sacStaff);
    await page.goto('/organizations');
    const add = page.getByRole('button', { name: 'Add organisation' });
    await expect(add).toBeVisible();
    await expect(add).toBeInViewport();
    await add.click();
    await expect(page.getByPlaceholder('e.g. Springvale High')).toBeVisible();
  });

  // Shown, not hidden, to a visitor, so they learn it is there; pressing it says to sign in (2026-10-31).
  test('a visitor who is not signed in is offered Add organisation, and told to sign in @phone', async ({ page }) => {
    await page.goto('/organizations');
    await expect(page.getByTestId(`org-${ORG.sac}`)).toBeVisible();
    await page.getByRole('button', { name: 'Add organisation' }).click();
    await expect(page.getByText('Sign in to add an organisation')).toBeVisible();
    await page.getByText('Sign in', { exact: true }).click();
    await expect(page).toHaveURL(/\/login\?redirect=%2Forganizations/);
  });
});
