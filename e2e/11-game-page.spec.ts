import { test, expect } from '@playwright/test';
import { USERS, signIn } from './support';

/**
 * The game page (events redesign stage 3, `FIX-21` and `FIX-23`; agreed on
 * `mockups/game-read-first.html`, option B revised): one page in place of View and Edit.
 *
 * A single match edits everything in one dialog, teams included, and warns of clashes; a tournament
 * fixture has no team pickers — it is moved with the Schedule's sheet, and *Who played* covers a
 * different team turning up. Edit and ⋯ are for whoever may edit; a coach picks and scores; and a
 * game that has started cannot be deleted or cancelled.
 */
const MATCH = '/admin/fx-org-dkl/events/fx-event-dkl-u16a-r6/games/fx-game-dkl-u16a-r6';
const MATCH_AS_SAC = '/admin/fx-org-sac/events/fx-event-dkl-u16a-r6/games/fx-game-dkl-u16a-r6';
const FIXTURE = '/admin/fx-org-dkl/events/fx-tour-saturday/games/fx-game-saturday-rugby-u16-1';
const PLAYED = '/admin/fx-org-dkl/events/fx-tour-saturday/games/fx-game-saturday-netball-u14-1';

const visible = (page: import('@playwright/test').Page, text: string | RegExp) =>
  page.getByText(text, typeof text === 'string' ? { exact: true } : undefined).filter({ visible: true }).first();

test.describe('the game page', () => {
  test('on a phone: the scoreboard, its buttons on one line, and tabs @phone', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'The tabs are the phone layout');
    await signIn(page, USERS.hostAdmin);
    await page.goto(FIXTURE);
    await expect(visible(page, 'Test Saturday Fixtures')).toBeVisible();
    for (const label of ['Pick team', 'Start scoring', 'Record result']) await expect(visible(page, label)).toBeVisible();
    await expect(visible(page, 'Overview')).toBeVisible();
    await visible(page, 'Teams').click();
    await expect(visible(page, 'Who played')).toBeVisible();
  });

  test('a tournament fixture: no team pickers, moved with the Schedule sheet, and Who played', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'Wide: no tabs');
    await signIn(page, USERS.hostAdmin);
    await page.goto(FIXTURE);
    await expect(visible(page, 'Test Saturday Fixtures')).toBeVisible();
    await expect(visible(page, 'Rugby U16')).toBeVisible();
    // The next step is highlighted, and the old switcher is gone.
    await expect(visible(page, 'Pick team')).toBeVisible();
    await expect(page.getByText('Lineup', { exact: true })).toHaveCount(0);

    // When & where is the Schedule's sheet: no team pickers, the clearer link, and no "no clash" line.
    await visible(page, 'Edit').click();
    await expect(visible(page, 'Remove time and court')).toBeVisible();
    await expect(page.getByText('No clash at this time.')).toHaveCount(0);
    await expect(page.getByLabel('Team 1')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).filter({ visible: true }).first().click();

    // Who played: this game only, and Replace is on the division.
    await visible(page, 'Who played').click();
    await expect(visible(page, /Only this game changes/)).toBeVisible();
    await expect(visible(page, /replace it on/)).toBeVisible();
    await page.getByText('Cancel', { exact: true }).filter({ visible: true }).last().click();

    // The ⋯: moving, Who played, cancelling and deleting — before the game starts.
    await page.getByLabel('Game actions').click();
    for (const label of ['When & where', 'Who played', 'Cancel fixture', 'Delete fixture']) await expect(visible(page, label)).toBeVisible();
  });

  test('a game that has started is corrected, not cancelled or deleted', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'Once is enough');
    await signIn(page, USERS.hostAdmin);
    await page.goto(PLAYED);
    await expect(visible(page, 'Full time')).toBeVisible();
    await expect(visible(page, 'Correct result')).toBeVisible();
    await expect(page.getByText('Pick team', { exact: true })).toHaveCount(0);
    await page.getByLabel('Game actions').click();
    await expect(page.getByText('Not once it has started').filter({ visible: true })).toHaveCount(2);
  });

  test('a single match: one dialog with Teams, not Home and Away, and a clash warned', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'Once is enough');
    await signIn(page, USERS.hostAdmin);
    await page.goto(MATCH);
    // Home comes from the venue: Doringkloof's own field.
    await expect(visible(page, 'Home')).toBeVisible();
    await visible(page, 'Edit').click();
    await expect(visible(page, 'Edit match')).toBeVisible();
    await expect(visible(page, 'Teams')).toBeVisible();
    await expect(page.getByText('Away', { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByLabel(/^Team 1: /)).toBeVisible();
    // 09:00 on A Field clashes with Test Head to Head's U16 game, with both teams in it.
    await page.getByLabel('Kick-off').fill('09:00');
    await expect(visible(page, /A Field has .* from 09:00 to 10:30, with both teams in it too\. You can still save it\./)).toBeVisible({ timeout: 10000 });
    await page.getByLabel('Kick-off').fill('15:00');
    await expect(page.getByText(/You can still save it/)).toHaveCount(0, { timeout: 10000 });
  });

  test('is cancelled and reinstated from the ⋯', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'Once is enough');
    await signIn(page, USERS.hostAdmin);
    await page.goto(MATCH);
    await page.getByLabel('Game actions').click();
    await visible(page, 'Cancel match').click();
    await visible(page, 'Cancel match').click();
    await expect(visible(page, 'Cancelled')).toBeVisible();
    await expect(page.getByText('Pick team', { exact: true })).toHaveCount(0);
    await visible(page, 'Reinstate').click();
    await page.getByText('Reinstate', { exact: true }).filter({ visible: true }).last().click();
    await expect(visible(page, 'Not started')).toBeVisible();
  });

  test("as the other side's coach: picks and scores their own team, edits nothing", async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'Once is enough');
    await signIn(page, USERS.sacCoach);
    await page.goto(MATCH_AS_SAC);
    await expect(visible(page, 'Pick team')).toBeVisible();
    await expect(visible(page, 'Start scoring')).toBeVisible();
    await expect(page.getByLabel('Game actions')).toHaveCount(0);
    await expect(page.getByText('Edit', { exact: true }).filter({ visible: true })).toHaveCount(0);
  });

  test("the division's Schedule tab adds a fixture with the Schedule's sheet, sides from the division (FIX-36, FIX-40)", async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'Once is enough');
    await signIn(page, USERS.hostAdmin);
    await page.goto('/admin/fx-org-dkl/events/fx-tour-saturday/divisions/fx-div-saturday-netball-u16?tab=schedule');
    await visible(page, '＋ Add a fixture').click();
    await expect(page.getByRole('radio', { name: 'Not yet' })).toBeChecked();
    await page.locator('[data-testid^="add-fixture-home-"]').first().click();
    await page.locator('[data-testid^="add-fixture-away-"]').nth(1).click();
    await page.getByRole('button', { name: 'Add it', exact: true }).click();
    await expect(page.getByText(/^.+ v .+ is under Without a time.*, to place later\.$/)).toBeVisible();
  });
});
