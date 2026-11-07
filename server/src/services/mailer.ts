import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

/**
 * The one way the server sends email (`DEPLOY-2`). What an email says lives with the feature —
 * password reset in EmailService.ts, invitations and applications in MailManager.ts — and every one
 * of them goes out through `sendMail`.
 *
 * Settings, from `server/.env`:
 * - `SMTP_HOST` — set means email is set up. Unset: in development the email is written to the
 *   log, so its links can be followed; on a server (`NODE_ENV=production`) sending fails, so
 *   nobody is told an email went that did not.
 * - `SMTP_PORT` (default 587) and `SMTP_SECURE` (`true`/`false`; default: true on port 465).
 * - `SMTP_USER` / `SMTP_PASS` — leave both unset for a relay that trusts the server's address
 *   (Google Workspace's SMTP relay, as on the test server).
 * - `MAIL_FROM` — who the email is from, e.g. `ScoreKeeper <noreply@scorekeeper.live>`. Unset, it
 *   is the SMTP login.
 */

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface OutgoingMail {
    to: string | string[];
    subject: string;
    text: string;
    html?: string;
}

let transporter: nodemailer.Transporter | null = null;

function settings() {
    const host = process.env.SMTP_HOST || '';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const from = process.env.MAIL_FROM || (user ? `ScoreKeeper <${user}>` : '');
    return { host, port, secure, user, pass, from };
}

function getTransporter(): nodemailer.Transporter {
    if (!transporter) {
        const s = settings();
        transporter = nodemailer.createTransport({
            host: s.host,
            port: s.port,
            secure: s.secure,
            ...(s.user && s.pass ? { auth: { user: s.user, pass: s.pass } } : {}),
        });
    }
    return transporter;
}

/** Sends one email, or throws saying why it could not. */
export async function sendMail(mail: OutgoingMail): Promise<void> {
    const s = settings();
    const to = Array.isArray(mail.to) ? mail.to.join(', ') : mail.to;

    if (!s.host) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Email is not set up on this server (SMTP_HOST is not set).');
        }
        console.log(
            `[Mail] Not sent: email is not set up (no SMTP_HOST). This is what would have gone:\n` +
            `  To: ${to}\n  Subject: ${mail.subject}\n${mail.text.replace(/^/gm, '  | ')}`
        );
        return;
    }
    if (!s.from) {
        throw new Error('Email has no From address: set MAIL_FROM (or SMTP_USER).');
    }

    await getTransporter().sendMail({ from: s.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    console.log(`[Mail] Sent "${mail.subject}" to ${to}`);
}

/**
 * Logs how email is set up, and checks the mail server answers. Called once at startup; never
 * throws, because a mail server that is down must not stop the app.
 */
export function reportMailSetup(): void {
    const s = settings();
    if (!s.host) {
        console.log(process.env.NODE_ENV === 'production'
            ? '[Mail] Email is NOT set up (no SMTP_HOST): every email will fail to send.'
            : '[Mail] Email is not set up (no SMTP_HOST): emails are written to this log instead.');
        return;
    }
    console.log(`[Mail] Sending through ${s.host}:${s.port}${s.secure ? ' (TLS)' : ''}${s.user ? ` as ${s.user}` : ' without a login'}, from ${s.from || '(no From address!)'}`);
    getTransporter().verify()
        .then(() => console.log('[Mail] The mail server answered; email is ready.'))
        .catch((err: unknown) => console.error('[Mail] The mail server did not accept the connection:', err));
}
