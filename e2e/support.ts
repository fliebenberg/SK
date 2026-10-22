import { Page, expect } from '@playwright/test';

/** Every fixture account's password (`FIXTURE_PASSWORD` in server/src/scripts/setup/fixtures/testOrgs.ts). */
export const PASSWORD = 'Test1234!';

/** The fixture people the tests sign in as, and the ids they look at. */
export const USERS = {
  /** Doringkloof's admin — the tournament's host. */
  hostAdmin: 'johan.vandermerwe@doringkloof.test',
  /** St Aldric's admin — accepted. */
  sacAdmin: 'catherine.whitfield@staldrics.test',
  /** St Aldric's staff — may not answer. */
  sacStaff: 'graham.hendricks@staldrics.test',
  /** St Aldric's U16 A rugby coach. */
  sacCoach: 'brendan.oneill@staldrics.test',
  /** Riverbend's admin — invited, not answered. */
  rbhAdmin: 'sipho.dlamini@riverbend.test',
  /** Riverbend's U16 A rugby coach. */
  rbhCoach: 'themba.zulu@riverbend.test',
  /** Kwaggafontein's admin — added, not invited yet. */
  kscAdmin: 'riaan.venter@kwaggafontein.test',
  /** Kwaggafontein's U16 Lions rugby coach — in *Test Saturday Fixtures*. */
  kscCoach: 'dewald.nel@kwaggafontein.test',
};
export const ORG = { dkl: 'fx-org-dkl', sac: 'fx-org-sac', rbh: 'fx-org-rbh', ksc: 'fx-org-ksc' };
export const TOURNAMENT = 'fx-tour-spring';
export const DIVISION = { rugbyU16: 'fx-div-spring-rugby-u16', netballU14: 'fx-div-spring-netball-u14', netballU16: 'fx-div-spring-netball-u16' };

/** Signs in through the login screen, as a person would. */
export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByPlaceholder('Enter your email').fill(email);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByText('Login', { exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** A tournament page, from a workspace. */
export const tournamentUrl = (orgId: string) => `/admin/${orgId}/events/${TOURNAMENT}`;
export const divisionUrl = (orgId: string, divisionId: string) => `${tournamentUrl(orgId)}/divisions/${divisionId}`;
export const orgPageUrl = (orgId: string, participantOrgId: string) => `${tournamentUrl(orgId)}/organisations/${participantOrgId}`;
