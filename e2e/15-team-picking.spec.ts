import { test, expect } from '@playwright/test';
import { ORG, USERS, signIn } from './support';

/**
 * A team per game, with proposed teams (FIX-32 part 2, 2026-10-22), in *Test Saturday Fixtures*:
 * Kwaggafontein's U16 Lions have their team picked for their first game, so their next two games
 * propose it. Their coach, Dewald Nel, sees "2 games with a proposed team" in To do; Kwaggafontein's
 * admin sees only that its coaches have things to do, and on the To do page whose they are. On the
 * desktop the coach confirms one game's proposed team from its page.
 */
const SATURDAY = `/admin/${ORG.ksc}/events/fx-tour-saturday`;
const LIONS = 'fx-team-ksc-rugby-u16';

test.describe('proposed teams, as loaded', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'phone', 'Needs the fixture data as loaded; the desktop run changes it'));

  test("the coach's To do: two games with a proposed team @phone", async ({ page }) => {
    await signIn(page, USERS.kscCoach);
    await page.goto(SATURDAY);
    await expect(page.getByTestId(`todo-confirm-${LIONS}`)).toContainText('2 games with a proposed team');
  });

  test("the admin's To do: its coaches' tasks counted on the card, named on the page @phone", async ({ page }) => {
    await signIn(page, USERS.kscAdmin);
    await page.goto(SATURDAY);
    const card = page.getByTestId('todo-card');
    await expect(card).toContainText('more for coaches');
    await expect(card.getByTestId(`todo-confirm-${LIONS}`)).toHaveCount(0);
    await page.goto(`${SATURDAY}/todo`);
    await expect(page.getByTestId(`todo-confirm-${LIONS}`)).toContainText('Dewald Nel');
  });
});

test.describe.serial('confirming a proposed team', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name === 'phone', 'Changes the data'));

  test('the coach confirms the next game from its page', async ({ page }) => {
    await signIn(page, USERS.kscCoach);
    await page.goto(SATURDAY);
    await page.getByTestId(`todo-confirm-${LIONS}`).getByRole('button', { name: 'Review' }).click();
    await expect(page.getByTestId(/^proposed-/).filter({ visible: true }).first()).toContainText('Proposed: the team from v');
    await page.getByRole('button', { name: 'Confirm team' }).filter({ visible: true }).first().click();
    await expect(page.getByTestId(/^proposed-/).filter({ visible: true })).toHaveCount(0);
    await page.goto(SATURDAY);
    await expect(page.getByTestId(`todo-confirm-${LIONS}`)).toContainText('1 game with a proposed team');
  });
});
