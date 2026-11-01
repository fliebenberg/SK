import { test, expect, Page } from '@playwright/test';
import { ORG, USERS, signIn } from './support';

/**
 * Asking to join an organisation (MEMBER-1, docs/people.md §7). Kwaggafontein takes applications;
 * St Aldric's is invite only, as every organisation is until its admin says otherwise.
 *
 * In order, one after another: each builds on the application the one before left waiting.
 */
const CHILD = 'Dirk Kotze'; // On Kwaggafontein's records already, so approving asks about him.

async function applyForChild(page: Page, name: string) {
  await page.goto(`/organizations/${ORG.ksc}`);
  await page.getByRole('button', { name: 'Apply to join' }).click();
  await page.getByText('My child', { exact: true }).click();
  await page.getByLabel('Child’s full name').fill(name);
  await page.getByLabel('Date of birth').fill('2012-05-14');
  await page.getByLabel('Your cellphone').fill('082 555 0123');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('your-applications')).toContainText(name);
}

test.describe.serial('applying to join an organisation', () => {
  test('an invite-only organisation shows a flag and no button, and says why @phone', async ({ page }) => {
    await signIn(page, USERS.kscCoach);
    await page.goto(`/organizations/${ORG.sac}`);
    const flag = page.getByRole('button', { name: 'Invite only. Why?' });
    await expect(flag).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply to join' })).toHaveCount(0);
    await flag.click();
    await expect(page.getByText('Membership is by invitation', { exact: false }).filter({ visible: true })).toBeVisible();
  });

  test('a visitor is offered Apply to join, and told to sign in @phone', async ({ page }) => {
    await page.goto(`/organizations/${ORG.ksc}`);
    await page.getByRole('button', { name: 'Apply to join' }).click();
    await expect(page.getByText('Sign in to apply to', { exact: false })).toBeVisible();
  });

  test('on a phone the button is on a line below the banner, not in it @phone', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 1280) >= 768, 'Phone layout');
    await page.goto(`/organizations/${ORG.ksc}`);
    const button = await page.getByRole('button', { name: 'Apply to join' }).boundingBox();
    const name = await page.getByText('Test Kwaggafontein Sports Club', { exact: false }).first().boundingBox();
    expect(button!.y).toBeGreaterThan(name!.y + name!.height);
  });

  test('applying for yourself asks for your date of birth, and refuses someone too young', async ({ page }) => {
    await signIn(page, USERS.sacStaff);
    await page.goto(`/organizations/${ORG.ksc}`);
    await page.getByRole('button', { name: 'Apply to join' }).click();
    await expect(page.getByText('not shown publicly', { exact: false })).toBeVisible();
    await page.getByLabel('Date of birth').fill('2014-01-01');
    await expect(page.getByText('a parent or guardian applies for anyone under', { exact: false })).toBeVisible();
    await page.getByLabel('Cellphone').fill('082 555 0123');
    await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  });

  test('a parent applies for their child, keeps Apply to join, and can withdraw', async ({ page }) => {
    await signIn(page, USERS.sacStaff);
    await applyForChild(page, 'Test Withdrawn Child');
    await expect(page.getByRole('button', { name: 'Apply to join' })).toBeVisible();
    await page.getByRole('button', { name: 'Withdraw the application for Test Withdrawn Child' }).click();
    await expect(page.getByText('Test Withdrawn Child')).toHaveCount(0);
    await applyForChild(page, CHILD);
    await applyForChild(page, 'Test New Child');
  });

  test('staff see it waiting: counted on the Control Panel, and listed on People', async ({ page }) => {
    await signIn(page, USERS.kscAdmin);
    await page.goto(`/admin/${ORG.ksc}`);
    await expect(page.getByTestId('applications-count')).toContainText('2 waiting');
    await page.goto(`/admin/${ORG.ksc}/people`);
    const list = page.getByTestId('org-applications');
    await expect(list).toContainText('Applications to join · 2');
    await expect(list).toContainText(CHILD);
  });

  test('a person with a similar name is asked about first, and is who gets approved', async ({ page }) => {
    await signIn(page, USERS.kscAdmin);
    await page.goto(`/admin/${ORG.ksc}/people`);
    await page.getByRole('button', { name: `Review ${CHILD}` }).click();
    const approve = page.getByRole('button', { name: 'Approve as Member' });
    await expect(page.getByTestId('application-matches')).toContainText(CHILD);
    await expect(approve).toBeDisabled();
    await page.getByTestId('application-matches').getByRole('radio', { name: CHILD }).click();
    await approve.click();
    await expect(page.getByRole('button', { name: `Review ${CHILD}` })).toHaveCount(0);
  });

  test('declining says what happens', async ({ page }) => {
    await signIn(page, USERS.kscAdmin);
    await page.goto(`/admin/${ORG.ksc}/people`);
    await page.getByRole('button', { name: 'Review Test New Child' }).click();
    await page.getByText('Decline', { exact: true }).click();
    await expect(page.getByText('can apply again after 30 days', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Decline', exact: true }).click();
    await expect(page.getByTestId('org-applications')).toHaveCount(0);
  });

  test('the applicant is told when they can apply again', async ({ page }) => {
    await signIn(page, USERS.sacStaff);
    await page.goto(`/organizations/${ORG.ksc}`);
    await expect(page.getByTestId('your-applications')).toContainText('Not accepted');
    await expect(page.getByTestId('your-applications')).toContainText('You can apply again from');
  });

  test('the admin chooses how people join, in Settings', async ({ page }) => {
    await signIn(page, USERS.sacAdmin);
    await page.goto(`/admin/${ORG.sac}/settings`);
    await page.getByText('Anyone can apply', { exact: true }).click();
    await page.goto(`/organizations/${ORG.sac}`);
    await expect(page.getByRole('button', { name: 'Open Workspace' }).or(page.getByRole('link', { name: /Workspace/ }))).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply to join' })).toBeVisible();
    await page.goto(`/admin/${ORG.sac}/settings`);
    await page.getByText('Invite only', { exact: true }).click();
  });
});
