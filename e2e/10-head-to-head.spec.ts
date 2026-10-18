import { test, expect } from '@playwright/test';
import { USERS, signIn } from './support';

/**
 * Head to Head (`H2H-1`, agreed on `mockups/head-to-head.html`).
 *
 * The first tests make one from the events list — Doringkloof against St Aldric's, with Rugby and
 * Netball — and run it: its divisions come from Doringkloof's own age groups (Rugby U16 and U19,
 * Netball U14, U16 and U19), *Pair all* puts each team against St Aldric's team of the same age,
 * a division's games are changed in its two columns, and St Aldric's accepts the invitation. They run
 * in order, each from where the last left it; the reset at the start of the run takes the event away.
 *
 * The last reads *Test Head to Head* (`fx-tour-h2h`), played with one of every result, from both sides.
 */
test.describe.configure({ mode: 'serial' });

const H2H = 'fx-tour-h2h';
/** The Head to Head the first test makes, by its id. */
let made = '';

test.describe('a Head to Head, as the host', () => {
  test('is made from the events list, its divisions come from our age groups, and Pair all pairs them', async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
    await page.goto('/admin/fx-org-dkl/events');

    // Head to Head is the second of the three kinds, before Tournament.
    await page.getByRole('button', { name: 'New event' }).click();
    const kinds = page.getByRole('button', { name: /One game between two teams|Your teams against one other|A festival, league or knockout/ });
    await expect(kinds).toHaveText([/^.?Match/, /^.?Head to Head/, /^.?Tournament/]);
    await page.getByRole('button', { name: /Head to Head.*Your teams against one other/ }).click();

    // Who we are playing names the event until it is changed.
    await page.getByLabel('Playing against').fill('St Ald');
    await page.getByText("Test St Aldric's College", { exact: true }).last().click();
    await expect(page.getByLabel('Name')).toHaveValue("Test Hoërskool Doringkloof v Test St Aldric's College");
    await page.getByRole('button', { name: 'Create' }).click();

    // The page is the tournament page, under its own name, with Results for Standings.
    await expect(page).toHaveURL(/\/events\/event-/);
    made = page.url().match(/\/events\/(event-[^/?#]+)/)![1];
    await expect(page.getByText('Head to Head', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Results', { exact: true })).toBeVisible();
    await expect(page.getByText('Rules & scoring')).toHaveCount(0);
    await expect(page.getByText('Playing against').filter({ visible: true }).first()).toBeVisible();

    // Each sport gets a division for every age group Doringkloof has teams in for it.
    await page.getByText('＋ Add a sport').first().click();
    // Each tick saves; the next waits for the divisions it made, counted on the chip.
    await page.getByRole('checkbox', { name: /Rugby/ }).click();
    await expect(page.getByRole('checkbox', { name: /Rugby/ })).toContainText('2');
    await page.getByRole('checkbox', { name: /Netball/ }).click();
    await expect(page.getByRole('checkbox', { name: /Netball/ })).toContainText('3');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Pairings').filter({ visible: true }).first()).toBeVisible();
    for (const division of ['Rugby U16', 'Rugby U19', 'Netball U14', 'Netball U16', 'Netball U19']) {
      await expect(page.getByText(division, { exact: true }).filter({ visible: true })).toBeVisible();
    }

    // Pair all: A v A in every division, and the team with no counterpart said so.
    await page.getByRole('button', { name: 'Pair all automatically' }).click();
    await expect(page.getByText('4 games', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/Test Hoërskool Doringkloof U19 A without a game/).filter({ visible: true })).toBeVisible();

    // The division page: two columns, St Aldric's team invited until its organisation answers.
    await page.getByText('Netball U16', { exact: true }).filter({ visible: true }).click();
    await expect(page.getByText('Pair again automatically')).toBeVisible();
    await expect(page.getByRole('button', { name: /U16 A, Test Hoërskool Doringkloof side of game 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /U16 A, Test St Aldric's College side of game 1/ })).toBeVisible();
    await expect(page.getByText("How it's played")).toHaveCount(0);
  });

  test("a division's games change in its two columns: a game removed, an opponent chosen, a team left out", async ({ page }) => {
    test.skip(!made, 'Needs the Head to Head made above');
    await signIn(page, USERS.hostAdmin);
    const divisions = `/admin/fx-org-dkl/events/${made}`;
    await page.goto(divisions);
    await page.getByText('Netball U16', { exact: true }).filter({ visible: true }).click();

    // Removing the game leaves both teams in the division, each with Choose opponent.
    await page.getByRole('button', { name: 'Game 1 actions' }).click();
    await page.getByText('Remove game', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Choose an opponent for U16 A' })).toHaveCount(2);

    // Choosing an opponent pairs them again.
    await page.getByRole('button', { name: 'Choose an opponent for U16 A' }).first().click();
    await page.getByText('U16 A', { exact: true }).filter({ visible: true }).last().click();
    await expect(page.getByRole('button', { name: /U16 A, Test Hoërskool Doringkloof side of game 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose an opponent for U16 A' })).toHaveCount(0);

    // Netball U19: St Aldric's has no team for Doringkloof's, which is left out of the day.
    await page.goto(divisions);
    await page.getByText('Netball U19', { exact: true }).filter({ visible: true }).click();
    await page.getByRole('button', { name: 'Choose an opponent for U19 A' }).click();
    await page.getByText('Leave out of the day', { exact: true }).click();
    await page.getByText('Leave out', { exact: true }).last().click();
    await expect(page.getByRole('button', { name: 'Choose an opponent for U19 A' })).toHaveCount(0);

    // With every team paired or left out, nothing is said to be without a game, and Pair all —
    // which would enter the team left out again — has nothing to pair.
    await page.goto(divisions);
    await expect(page.getByText(/without a game/).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByText('No games — every team left out').filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pair all automatically' })).toHaveCount(0);
  });

  test('is invited, and St Aldric’s accepts it and its teams', async ({ page, browser }) => {
    test.skip(!made, 'Needs the Head to Head made above');
    await signIn(page, USERS.hostAdmin);
    await page.goto(`/admin/fx-org-dkl/events/${made}`);
    await expect(page.getByText("Test St Aldric's College is not invited yet").filter({ visible: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Invite', exact: true }).filter({ visible: true }).first().click();
    await page.getByText('Invite', { exact: true }).filter({ visible: true }).last().click();
    await expect(page.getByText("Test St Aldric's College has not answered its invitation.").filter({ visible: true }).first()).toBeVisible();

    // St Aldric's, in its own workspace.
    const guest = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await signIn(guest, USERS.sacAdmin);
    await guest.goto(`/admin/fx-org-sac/events/${made}`);
    await expect(guest.getByText('Test Hoërskool Doringkloof has invited you')).toBeVisible();
    // Its four teams wait for an answer too — more than three, so one line with Accept all (FIX-24);
    // the first Accept is the invitation's.
    await expect(guest.getByTestId(/^todo-answers-/)).toBeVisible();
    await expect(guest.getByTestId(/^team-invite-/)).toHaveCount(4);
    await guest.getByRole('button', { name: '✓ Accept' }).first().click();
    await guest.getByText('✓ Accept', { exact: true }).last().click();
    await expect(guest.getByText('Test Hoërskool Doringkloof has invited you')).toHaveCount(0);
    // Accepting for all invited teams, the default, answers for the teams too.
    await expect(guest.getByTestId(/^team-invite-/)).toHaveCount(0);
    // To them it is one of two organisations taking part; the pairings are the organisers'.
    await expect(guest.getByText('Taking part', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Pair all automatically' })).toHaveCount(0);

    // Back with the organisers: Playing against is done, and its team accepted.
    await page.reload();
    await expect(page.getByText(/has not answered its invitation/).filter({ visible: true })).toHaveCount(0);
    await page.getByText('Netball U16', { exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('button', { name: /U16 A, Test St Aldric's College side of game 1/ })).not.toContainText('Invited');
  });
});

test.describe('a Head to Head that has been played', () => {
  for (const side of [
    { who: 'the host', user: USERS.hostAdmin, org: 'fx-org-dkl' },
    { who: 'St Aldric’s', user: USERS.sacAdmin, org: 'fx-org-sac' },
  ]) {
    test(`shows the same results to ${side.who} @phone`, async ({ page }) => {
      await signIn(page, side.user);
      await page.goto(`/admin/${side.org}/events/${H2H}?tab=standings`);
      // A win each and a draw, of four games: the U16 netball is still to play.
      await expect(page.getByText('The day', { exact: true })).toBeVisible();
      await expect(page.getByText('Games won · 3 of 4 played')).toBeVisible();
      await expect(page.getByText('drawn', { exact: true })).toBeVisible();

      // A division opens to its games and scores, the host's first.
      await page.getByRole('button', { name: /^Rugby U16:/ }).click();
      await expect(page.getByText('24–10', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /^Rugby U19:/ }).click();
      await expect(page.getByText('12–17', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /^Netball U19:/ }).click();
      await expect(page.getByText('Test Hoërskool Doringkloof U19 A had no game')).toBeVisible();
    });
  }
});
