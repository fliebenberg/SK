/**
 * Which websites may call the API and open the live socket from a browser (`DEPLOY-1`).
 *
 * - On a server (`NODE_ENV=production`): the app's own address, `APP_URL`, plus any in
 *   `CORS_ORIGINS` (comma-separated, e.g. `https://scorekeeper.live,https://www.scorekeeper.live`).
 * - In development: every origin, so Expo on localhost:8081, a phone on the network and the e2e
 *   tests all work.
 *
 * A request with no Origin header is always allowed: the phone apps, scripts and same-page loads
 * send none, and a browser always sends one on the cross-site requests this is here to stop.
 * Sign-in travels as a Bearer token, never a cookie, so this is a second line rather than the only
 * one: another site cannot act as a signed-in user either way.
 */

const normalise = (origin: string) => origin.trim().replace(/\/+$/, '').toLowerCase();

function originList(): string[] | null {
    if (process.env.NODE_ENV !== 'production') return null;
    const list = [process.env.APP_URL || '', ...(process.env.CORS_ORIGINS || '').split(',')]
        .map(normalise)
        .filter(Boolean);
    if (!list.length) {
        console.error('[CORS] Neither APP_URL nor CORS_ORIGINS is set: no website may call this server from a browser.');
    }
    return list;
}

const allowed = originList();

/** Whether a request from this Origin header (or none) may go ahead. */
export function isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin || allowed === null) return true;
    return allowed.includes(normalise(origin));
}

/** For the `cors` middleware and Socket.IO's `cors` option. */
export function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
    callback(null, isAllowedOrigin(origin));
}

/** One line at startup saying what is allowed. */
export function describeAllowedOrigins(): string {
    return allowed === null ? 'any website (development)' : (allowed.join(', ') || 'none');
}
