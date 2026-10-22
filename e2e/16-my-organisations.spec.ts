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
});
