import { test, expect } from '@playwright/test';
import { USERS, signIn } from './support';

/**
 * A result entered offline (tournaments Phase 7, U20): kept on the device, shown as waiting to
 * send, and sent when the connection is back; one entered over a result somebody has changed since
 * is refused rather than overwrite it, and stays on the match as not sent, to discard.
 */
const GAME = '/admin/fx-org-dkl/events/fx-tour-saturday/games/fx-game-saturday-netball-u14-1/view';
const OTHER_GAME = '/admin/fx-org-dkl/events/fx-tour-saturday/games/fx-game-saturday-netball-u14-2/view';

/**
 * The app's connection, cut and restored by the test. Playwright's offline mode stops the HTTP
 * polling socket.io reconnects with, but leaves an open WebSocket alone — so the socket is routed
 * through the test too, which closes it and refuses new ones while cut.
 */
async function controllableConnection(page: import('@playwright/test').Page) {
  let offline = false;
  const open = new Set<import('@playwright/test').WebSocketRoute>();
  await page.routeWebSocket(/socket\.io/, ws => {
    if (offline) { ws.close(); return; }
    ws.connectToServer();
    open.add(ws);
    ws.onClose(() => open.delete(ws));
  });
  return {
    cut: async () => { offline = true; await page.context().setOffline(true); for (const ws of [...open]) await ws.close(); },
    restore: async () => { offline = false; await page.context().setOffline(false); },
  };
}

async function enterResult(page: import('@playwright/test').Page, home: string, away: string) {
  await page.getByText(/^(Record|Correct) Result$/).first().click();
  const boxes = page.getByLabel(/^Score for/);
  await boxes.nth(0).fill(home);
  await boxes.nth(1).fill(away);
  await page.getByText('Save Result', { exact: true }).click();
}

test.describe('a result entered offline', () => {
  test('waits on the device and is sent when the connection is back', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'Once is enough: the queue is not about the screen size');
    const connection = await controllableConnection(page);
    await signIn(page, USERS.hostAdmin);
    await page.goto(GAME);
    await expect(page.getByText(/^(Record|Correct) Result$/).first()).toBeVisible();
    await connection.cut();
    await expect(page.getByText(/No connection/)).toBeVisible({ timeout: 30000 });
    await enterResult(page, '12', '7');
    await expect(page.getByText('Result waiting to send', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/1 result waiting to send/)).toBeVisible();
    await connection.restore();
    await expect(page.getByText('Result sent', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Result waiting to send', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Correct Result', { exact: true })).toBeVisible();
  });

  test('is not sent over a result somebody changed meanwhile, and can be discarded', async ({ page, browser }, info) => {
    test.skip(info.project.name === 'phone', 'Once is enough: the queue is not about the screen size');
    const connection = await controllableConnection(page);
    await signIn(page, USERS.hostAdmin);
    await page.goto(OTHER_GAME);
    await expect(page.getByText(/^(Record|Correct) Result$/).first()).toBeVisible();
    await connection.cut();
    await expect(page.getByText(/No connection/)).toBeVisible({ timeout: 30000 });
    await enterResult(page, '20', '5');
    await expect(page.getByText('Result waiting to send', { exact: true }).first()).toBeVisible();

    // Meanwhile, somebody else records another result.
    const other = await browser.newContext();
    const theirs = await other.newPage();
    await signIn(theirs, USERS.hostAdmin);
    await theirs.goto(OTHER_GAME);
    await enterResult(theirs, '9', '9');
    await expect(theirs.getByText('Correct Result', { exact: true })).toBeVisible();
    await other.close();

    await connection.restore();
    await expect(page.getByText('Your result was not sent', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/changed by someone else/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(page.getByText('Your result was not sent', { exact: true })).toHaveCount(0);
  });
});
