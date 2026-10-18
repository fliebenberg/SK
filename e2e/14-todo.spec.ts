import { test, expect } from '@playwright/test';
import { DIVISION, ORG, USERS, divisionUrl, signIn, tournamentUrl } from './support';

/**
 * To do (FIX-24, 2026-10-18): what a taking-part organisation still owes a tournament, on the
 * Overview under the banner and on a page of its own. Riverbend's admin, invited to *Test Spring
 * Festival*: two teams to answer, and a place the organisers kept for its second rugby team to name
 * (FIX-32). On the phone, read-only — the card and the page, with its sport filter — since by the
 * desktop run the coach's test (03) has answered for Riverbend's rugby team. On the desktop, last of
 * the suite, Riverbend names the place, and the organisers see the team in it.
 */
const RBH_RUGBY = 'fx-ent-spring-rugby-u16-rbh-rugby-u16a';
const RBH_NETBALL = 'fx-ent-spring-netball-u16-rbh-netball-u16a';
const RBH_PLACE = 'fx-ent-spring-rugby-u16-rbh-tbc';

test.describe('To do, as loaded', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'phone', 'Needs the fixture data as loaded; the desktop run changes it first'));

  test('the card on the Overview holds the teams to answer and the place to name @phone', async ({ page }) => {
    await signIn(page, USERS.rbhAdmin);
    await page.goto(tournamentUrl(ORG.rbh));
    const card = page.getByTestId('todo-card');
    // More than teams to answer, so it is To do rather than today's "Your teams are invited".
    await expect(card).toContainText('To do');
    await expect(card.getByTestId(`team-invite-${RBH_RUGBY}`)).toBeVisible();
    await expect(card.getByTestId(`team-invite-${RBH_NETBALL}`)).toBeVisible();
    await expect(card.getByTestId(`todo-name-${RBH_PLACE}`)).toContainText('Riverbend second team, TBC');
    // Three fit on the card, so there is no See all.
    await expect(card.getByText(/^See all/)).toHaveCount(0);
  });

  test('the To do page lists them, and narrows by sport @phone', async ({ page }) => {
    await signIn(page, USERS.rbhAdmin);
    await page.goto(`${tournamentUrl(ORG.rbh)}/todo`);
    await expect(page.getByText('3 of 3')).toBeVisible();
    await page.getByLabel('Sport').click();
    await page.getByText('Netball', { exact: true }).last().click();
    await expect(page.getByText('1 of 3')).toBeVisible();
    await expect(page.getByTestId(`team-invite-${RBH_NETBALL}`)).toBeVisible();
    await expect(page.getByTestId(`team-invite-${RBH_RUGBY}`)).toHaveCount(0);
  });
});

test.describe.serial('naming a place kept for the organisation (FIX-32)', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name === 'phone', 'Changes the data'));

  test('Riverbend names its place with its 1st XV', async ({ page }) => {
    await signIn(page, USERS.rbhAdmin);
    await page.goto(tournamentUrl(ORG.rbh));
    const row = page.getByTestId(`todo-name-${RBH_PLACE}`);
    await row.getByRole('button', { name: 'Name the team' }).click();
    // Its U16 A is already in the tournament, so it cannot take the place.
    await expect(page.getByRole('radio', { name: /U16 A/ })).toBeDisabled();
    await page.getByRole('radio', { name: /1st XV/ }).click();
    await page.getByRole('button', { name: 'Name the team' }).last().click();
    await expect(row).toHaveCount(0);
  });

  test('the organisers see the team in the place', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto(divisionUrl(ORG.dkl, DIVISION.rugbyU16));
    await expect(page.getByTestId(`entrant-${RBH_PLACE}`)).toContainText('1st XV');
  });
});
