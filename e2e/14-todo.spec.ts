import { test, expect } from '@playwright/test';
import { ORG, USERS, signIn, tournamentUrl } from './support';

/**
 * To do (FIX-24, 2026-10-18): what a taking-part organisation still owes a tournament, on the
 * Overview under the banner and on a page of its own. Riverbend's admin, invited to *Test Spring
 * Festival* with two teams to answer: the card keeps today's title while answers are all it holds,
 * and the page lists them with a sport filter. Read-only — nothing is answered here — and on the phone
 * only: by the desktop run the coach's test (03) has answered for Riverbend's rugby team.
 */
const RBH_RUGBY = 'fx-ent-spring-rugby-u16-rbh-rugby-u16a';
const RBH_NETBALL = 'fx-ent-spring-netball-u16-rbh-netball-u16a';

test.describe('To do', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'phone', 'Needs the fixture data as loaded; the desktop run changes it first'));

  test('the card on the Overview holds the teams to answer @phone', async ({ page }) => {
    await signIn(page, USERS.rbhAdmin);
    await page.goto(tournamentUrl(ORG.rbh));
    const card = page.getByTestId('todo-card');
    await expect(card).toContainText('Your teams are invited');
    await expect(card.getByTestId(`team-invite-${RBH_RUGBY}`)).toBeVisible();
    await expect(card.getByTestId(`team-invite-${RBH_NETBALL}`)).toBeVisible();
    // Two fit on the card, so there is no See all.
    await expect(card.getByText(/^See all/)).toHaveCount(0);
  });

  test('the To do page lists them, and narrows by sport @phone', async ({ page }) => {
    await signIn(page, USERS.rbhAdmin);
    await page.goto(`${tournamentUrl(ORG.rbh)}/todo`);
    await expect(page.getByText('2 of 2')).toBeVisible();
    await expect(page.getByTestId(`team-invite-${RBH_RUGBY}`)).toBeVisible();
    await page.getByLabel('Sport').click();
    await page.getByText('Netball', { exact: true }).last().click();
    await expect(page.getByText('1 of 2')).toBeVisible();
    await expect(page.getByTestId(`team-invite-${RBH_NETBALL}`)).toBeVisible();
    await expect(page.getByTestId(`team-invite-${RBH_RUGBY}`)).toHaveCount(0);
  });
});
