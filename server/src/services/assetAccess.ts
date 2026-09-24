import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import type { Request, Response, NextFunction } from 'express';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * The asset token: how a signed-in user proves they may fetch images from `secure/` (MEDIA-1).
 *
 * Images live in two areas. `public/` (org, league and season logos) is served to anyone.
 * `secure/` (people's photos) is served only with a valid token in the `t` query parameter. The
 * token goes in the URL, not a header, because a web `<img>` cannot send headers.
 *
 * The token proves only that the holder is signed in. Which images they may see is decided by
 * which image names the server sends them, and names are unguessable (see ImageService). An image
 * fetch therefore needs both a session and a name the server chose to share.
 *
 * Checking a token needs only the secret — no database — so a CDN edge function can do the same
 * check once the images move off this server.
 *
 * Tokens are issued per 12-hour window and stay valid for 24–36 hours. Every request in the same
 * window gets the same token, so image URLs are stable and caches keep working.
 */

const WINDOW_MS = 12 * 60 * 60 * 1000;
const VERSION = 'v1';

function secret(): string {
  return process.env.ASSET_TOKEN_SECRET
    || process.env.JWT_SECRET
    || 'sk-jwt-secret-key-2026-secure-development-only';
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export interface AssetToken {
  token: string;
  /** Epoch milliseconds. Clients renew well before this. */
  expiresAt: number;
}

export function issueAssetToken(userId: string, now = Date.now()): AssetToken {
  const expiresAt = (Math.floor(now / WINDOW_MS) + 3) * WINDOW_MS;
  const payload = `${VERSION}.${expiresAt}.${Buffer.from(userId).toString('base64url')}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

/** The user the token was issued to, or null when it is malformed, forged or expired. */
export function verifyAssetToken(token: unknown, now = Date.now()): string | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [, expires, user, signature] = parts;

  const expected = Buffer.from(sign(`${VERSION}.${expires}.${user}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  if (!(Number(expires) > now)) return null;
  return Buffer.from(user, 'base64url').toString();
}

/** Express guard for `secure/`: refuses any request without a valid token. */
export function requireAssetToken(req: Request, res: Response, next: NextFunction) {
  if (!verifyAssetToken(req.query.t)) {
    return res.status(401).send('A valid asset token is required.');
  }
  // The URL carries a per-user token, so no shared cache may keep the response.
  res.setHeader('Cache-Control', 'private, max-age=86400');
  next();
}
