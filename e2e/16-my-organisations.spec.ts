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

  // Each role opens its part of the workspace (PERM-4): a coach their teams and fixtures, not the org's.
  test("a coach's workspace is their teams and fixtures, not the organisation's settings", async ({ page }) => {
    await signIn(page, USERS.kscCoach);
    await page.goto(`/admin/${ORG.ksc}`);
    await expect(page.getByText('Teams & Divisions').first()).toBeVisible();
    await expect(page.getByText('People & Roles')).toHaveCount(0);
    // A page it does not open goes back to the Control Panel.
    await page.goto(`/admin/${ORG.ksc}/settings`);
    await expect(page).toHaveURL(new RegExp(`/admin/${ORG.ksc}$`));
    await expect(page.getByText('Timezone')).toHaveCount(0);
  });

  // The Teams tab lists the teams they coach, each opening its team page in the workspace (PERM-5).
  test('the Teams tab lists the teams a coach coaches, and Manage Team opens one', async ({ page }) => {
    await signIn(page, USERS.kscCoach);
    await page.goto('/teams');
    await expect(page.getByText('My Coached Teams')).toBeVisible();
    await page.getByRole('button', { name: 'Manage Team' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/admin/${ORG.ksc}/teams/`));
  });

  // Only an organisation's admins change its profile (ORG-13); staff read it with no Edit links.
  test('staff read the profile, with nothing to edit; the admin edits it', async ({ page }) => {
    await signIn(page, USERS.sacStaff);
    await page.goto(`/admin/${ORG.sac}/profile`);
    await expect(page.getByText('Address', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Edit$/ })).toHaveCount(0);
  });

  test('the admin sees Edit on the profile', async ({ page }) => {
    await signIn(page, USERS.sacAdmin);
    await page.goto(`/admin/${ORG.sac}/profile`);
    await expect(page.getByRole('button', { name: /Edit$/ }).first()).toBeVisible();
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

  // Whoever adds an organisation runs it: its workspace opens, and it is theirs, under My Organisations, as its Admin. The
  // dialog once dropped `creatorId`, and the org was created unclaimed with nobody in it (2026-10-31).
  // The reset removes it again: its creator is a test account.
  test('an organisation you add opens in its workspace, and is yours, under My Organisations, as its Admin', async ({ page }) => {
    await signIn(page, USERS.sacStaff);
    await page.goto('/organizations');
    await page.getByRole('button', { name: 'Add organisation' }).click();
    await page.getByPlaceholder('e.g. Springvale High').fill('Test Added Club');
    await page.getByRole('button', { name: /^Organisation type/ }).click();
    await page.getByText('Sports Club', { exact: true }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    // Setting it up is what comes next: its workspace opens.
    await expect(page).toHaveURL(/\/admin\/org-/);
    await expect(page.getByText('Test Added Club').filter({ visible: true }).first()).toBeVisible();
    await page.goto('/organizations');
    const mine = page.locator('[data-testid^="my-org-"]').filter({ hasText: /Test Added Club/i });
    await expect(mine).toBeVisible();
    await expect(mine).toContainText(/Admin/i);
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
