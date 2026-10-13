import { test, expect } from '@playwright/test';
import { USERS, signIn } from './support';

/**
 * Head to Head (`H2H-1`, agreed on `mockups/head-to-head.html`): Doringkloof against St Aldric's,
 * made from the events list, with Rugby and Netball. The divisions come from Doringkloof's own age
 * groups — Rugby U16 and U19, Netball U14, U16 and U19 — and *Pair all* puts each of its teams against
 * St Aldric's team of the same age: four games, and Netball U19 with Doringkloof's team alone, since
 * St Aldric's has none. The reset at the start of the run takes the event away again.
 */
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
});
