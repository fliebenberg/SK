import { test } from '@playwright/test';
import { DIVISION, ORG, USERS, divisionUrl, orgPageUrl, signIn, tournamentUrl } from '../support';

/** Screenshots of every screen FIX-31 touched, as each kind of user — for looking at, not asserting. */
const shots = [
  { who: USERS.hostAdmin, name: 'host-overview', url: tournamentUrl(ORG.dkl) },
  { who: USERS.hostAdmin, name: 'host-division-rugby-u16', url: divisionUrl(ORG.dkl, DIVISION.rugbyU16) },
  { who: USERS.hostAdmin, name: 'host-division-netball-u14-locked', url: divisionUrl(ORG.dkl, DIVISION.netballU14) },
  { who: USERS.hostAdmin, name: 'host-org-sac', url: orgPageUrl(ORG.dkl, ORG.sac) },
  { who: USERS.sacAdmin, name: 'sac-admin-org-page', url: orgPageUrl(ORG.sac, ORG.sac) },
  { who: USERS.sacAdmin, name: 'sac-admin-events', url: `/admin/${ORG.sac}/events` },
  { who: USERS.rbhAdmin, name: 'rbh-admin-org-page', url: orgPageUrl(ORG.rbh, ORG.rbh) },
  { who: USERS.rbhCoach, name: 'rbh-coach-tournament', url: tournamentUrl(ORG.rbh) },
  { who: USERS.rbhCoach, name: 'rbh-coach-team', url: `/admin/${ORG.rbh}/teams/fx-team-rbh-rugby-u16a` },
  { who: USERS.rbhCoach, name: 'rbh-coach-events', url: `/admin/${ORG.rbh}/events` },
];

for (const shot of shots) {
  test(shot.name, async ({ page }, info) => {
    await signIn(page, shot.who);
    await page.goto(shot.url);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `e2e/shots/${info.project.name}-${shot.name}.png`, fullPage: true });
  });
}
