import { test, expect, Page } from '@playwright/test';
import { ORG, USERS, signIn, tournamentUrl } from './support';

/**
 * A read that fails is not an empty answer (`SYNC-9`, the action-replies skill). Three places where
 * reading it as one would do harm: a good invitation called expired, a duplicate organisation created,
 * and a team sheet saved over the real one. Each forces no answer to one read, sees what the screen says,
 * then lets the read through and presses *Try again*, which shows the failure was not the real answer.
 *
 * Nothing here saves, and each test fails its own read, so no other spec sees a difference, and none of
 * them needs another spec to have run. Each failure takes about 16 seconds, as the app waits 7 for an
 * answer and asks once more, so they run on the desktop only.
 */

/** Socket.io's engine packets on a polling request are joined by this character. */
const PACKET_SEPARATOR = '\x1e';

/**
 * The server never hears the named `get_data` reads, as though the answer were lost, while everything
 * else carries on. A read goes over HTTP polling or the WebSocket, depending on how far socket.io has
 * got with upgrading, so both are routed through the test. Also keeps what the app reports to the
 * failures log, which goes by the same way.
 */
async function loseReads(page: Page, ...types: string[]) {
  let losing = true;
  const reported: string[] = [];
  const isLost = (packet: string) => {
    if (packet.includes('client_failures')) reported.push(packet);
    return losing && packet.includes('"get_data"') && types.some(type => packet.includes(`"type":"${type}"`));
  };

  await page.routeWebSocket(/socket\.io/, ws => {
    const server = ws.connectToServer();
    // Passing on what the page sends is now up to this; what the server sends still goes straight through.
    ws.onMessage(message => {
      if (typeof message !== 'string' || !isLost(message)) server.send(message);
    });
  });

  await page.route(/socket\.io.*transport=polling/, async route => {
    const body = route.request().method() === 'POST' ? route.request().postData() : null;
    if (!body) return route.continue();
    const packets = body.split(PACKET_SEPARATOR);
    const kept = packets.filter(packet => !isLost(packet));
    if (kept.length === packets.length) return route.continue();
    // The socket.io server answers a polling POST with `ok`, so the client sees nothing amiss.
    if (!kept.length) return route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
    return route.continue({ postData: kept.join(PACKET_SEPARATOR) });
  });

  return { letThrough: () => { losing = false; }, reported };
}

test.describe('a read that fails', () => {
  test('a claim link says it could not be checked, not that it has expired', async ({ page }) => {
    const reads = await loseReads(page, 'claim_info');
    await page.goto('/claim?token=e2e-no-such-token');

    await expect(page.getByText('This invitation could not be checked.', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/invalid or has expired/)).toHaveCount(0);
    // We hear about it too, by the read's type and without its token.
    await expect.poll(() => reads.reported.join(), { timeout: 15_000 }).toContain('get_data:claim_info');
    expect(reads.reported.join()).not.toContain('e2e-no-such-token');

    // The server's own answer, which for this made-up token is that it is no good.
    reads.letThrough();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText(/invalid or has expired/)).toBeVisible();
    await expect(page.getByTestId('read-failure')).toHaveCount(0);
  });

  test('the duplicate check blocks registering an organisation until it has worked', async ({ page }) => {
    const reads = await loseReads(page, 'possible_duplicate_orgs');
    await signIn(page, USERS.hostAdmin);
    await page.goto(`${tournamentUrl(ORG.dkl)}/organisations`);
    await page.getByRole('button', { name: '＋ Add organisation' }).click();
    await page.getByLabel('Search organisations').fill('Test Riverbend');
    await page.getByText('Register “Test Riverbend”').click();

    const register = page.getByRole('button', { name: 'Register', exact: true });
    await expect(page.getByText(/Could not check whether this organisation is already on ScoreKeeper/)).toBeVisible({ timeout: 30_000 });
    await expect(register).toBeDisabled();
    await expect(page.getByTestId('possible-duplicate-orgs')).toHaveCount(0);

    // Riverbend really is on ScoreKeeper, which is what the failed check would have let through.
    reads.letThrough();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('possible-duplicate-orgs')).toContainText('Test Riverbend High School');
    await expect(page.getByTestId('read-failure')).toHaveCount(0);
    await expect(register).toBeDisabled();
    await page.getByRole('checkbox', { name: /None of these/ }).click();
    await expect(register).toBeEnabled();
  });

  test('a team sheet that did not load cannot be edited or saved over the real one', async ({ page }) => {
    const reads = await loseReads(page, 'game_roster');
    await signIn(page, USERS.hostAdmin);
    await page.goto('/admin/fx-org-dkl/events/fx-tour-saturday/games/fx-game-saturday-rugby-u16-1/selection');

    const failure = page.getByTestId('read-failure').filter({ visible: true }).first();
    await expect(failure).toContainText('team sheet', { timeout: 30_000 });
    // No sheet to change, so nothing to save: the save bar only comes with a change.
    await expect(page.getByText(/^Save/).filter({ visible: true })).toHaveCount(0);

    reads.letThrough();
    await failure.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByTestId('read-failure').filter({ visible: true })).toHaveCount(0);
  });
});
