import { test, expect, Page } from '@playwright/test';
import { ORG, USERS, signIn } from './support';

/**
 * The team page in tabs (`mockups/team-tabs.html`, option A, 2026-10-22; docs/teams.md): a season
 * picker in the banner, then Overview, Games, Results, Players and Competitions. The season is a
 * calendar year for now. Player statistics come from the fixtures' team sheets and match events on
 * DKL U16 A's first league rounds: Dian Ferreira scores four tries, Kagiso Sithole kicks eight
 * conversions and misses two — a miss is not a score.
 */
const TEAM = `/admin/${ORG.dkl}/teams/fx-team-dkl-rugby-u16a`;

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text, typeof text === 'string' ? { exact: true } : undefined).filter({ visible: true }).first();

test.describe('the team page', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.hostAdmin);
  });

  test('opens on Overview with the season in the banner @phone', async ({ page }) => {
    await page.goto(TEAM);
    await expect(visible(page, '2026 season').first()).toBeVisible();
    await expect(visible(page, 'Last result')).toBeVisible();
    await expect(visible(page, 'Squad')).toBeVisible();
  });

  test('Results leads with the season statistics, from team sheets and match events', async ({ page }) => {
    await page.goto(`${TEAM}?tab=results`);
    await expect(visible(page, 'Statistics')).toBeVisible();
    await expect(visible(page, 'Top try scorer')).toBeVisible();
    await expect(visible(page, 'Dian Ferreira · 4')).toBeVisible();
    await expect(visible(page, /^Scorers from 3 of \d+ games with match events/)).toBeVisible();
  });

  test('Players shows each player\'s number, position and season', async ({ page }) => {
    await page.goto(`${TEAM}?tab=players`);
    await expect(visible(page, '#11 · Left Wing · 4 games · 4 tries')).toBeVisible();
    await expect(visible(page, '#10 · Fly-half · 4 games · 8 conversions')).toBeVisible();
    await expect(visible(page, '#7 · Openside Flanker · 4 games · 1 card')).toBeVisible();
  });
});
