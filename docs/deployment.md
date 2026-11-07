# Deployment: the test server

How the test server at **https://test.scorekeeper.live** is put together, and how to update it,
reset its data, read its logs and restore it. It is for whoever runs the server: you will need an
SSH login on it and to be in the `sk-operators` group (see [Access](#access)).

There is no production server yet. [Before production](#before-production) lists what must change
when there is.

## What runs where

One Ubuntu 26.04 LTS machine (`102.68.97.242`; 1 CPU, 1 GB memory, 2 GB swap).

| Part | What it is | Where |
| --- | --- | --- |
| Caddy | Web server on ports 80/443. Gets and renews the HTTPS certificate itself. Sends `/api`, `/auth`, `/socket.io` and `/uploads` to the Node server, and serves the web app for everything else. | Config: `/etc/caddy/Caddyfile`, a copy of [deploy/Caddyfile](../deploy/Caddyfile) |
| Node server | `server/`, run by PM2 as the `sk` user, on `127.0.0.1:3001`. Not reachable from outside; the firewall allows only SSH, 80 and 443. | Code: `/srv/sk/SK` (a clone of this repo). Settings: `/srv/sk/SK/server/.env` |
| PM2 | Keeps the server running and restarts it if it crashes. Started at boot by the `pm2-sk` systemd service. | Process file: [server/pm2.config.js](../server/pm2.config.js) |
| PostgreSQL 18 | Database `sk`, owner `sk_admin`. Listens on localhost only. | |
| Web app | `expo-app/` exported as a single-page web app. Built on a PC, not on the server (the server has too little memory to bundle it). | `/var/www/scorekeeper/current`, a link to the newest folder in `releases/` |
| Uploaded images | Logos and profile pictures. | `/srv/sk/SK/server/public/uploads` |
| Backups | One copy of the database and the uploads, made nightly. | `/srv/sk/backups` |

The server's code, settings, database dump and uploads all belong to the `sk` user, which has no
password and cannot log in. People log in as themselves and act as `sk` through sudo.

## Access

- **Logging in:** SSH with a key only. Root login and password login are turned off
  (`/etc/ssh/sshd_config.d/00-hardening.conf`).
- **Acting as `sk`:** members of the `sk-operators` group may run any command as `sk` without a
  password, and nothing else (`/etc/sudoers.d/sk-operators`). That covers everything in this
  document except changing Caddy, the firewall or system packages, which needs full `sudo` and its
  password.
- **Adding someone who runs the app:** an admin with full sudo creates their user, adds their SSH
  public key to `~/.ssh/authorized_keys`, and adds them to the group:
  ```bash
  sudo adduser --disabled-password <name>
  sudo usermod -aG sk-operators <name>
  ```
  Give full sudo (`usermod -aG sudo`) only to someone who has to manage the machine itself.

Shortcuts worth adding to your `~/.bashrc`: the first makes `pm2 ls`, `pm2 logs` and the rest work
as you, the second updates the server in one word ([below](#updating-the-server)):
```bash
alias pm2='sudo -u sk -H pm2'
alias update_server='sudo -u sk -H sh /srv/sk/SK/deploy/update-server.sh'
```

## Updating the server

After changes to `server/` or `shared/` are pushed to `main`, run `update_server` (the alias above),
or in full:
```bash
sudo -u sk -H sh /srv/sk/SK/deploy/update-server.sh
```
[update-server.sh](../deploy/update-server.sh) pulls, rebuilds `shared/` and `server/`, runs new
database migrations (`npm run db:migrate`), and reloads PM2. It stops at the first failure, and the
running server is untouched until the reload. If `server/.env` needs a new setting, add it first:
```bash
sudo -u sk -H nano /srv/sk/SK/server/.env
```

## Updating the web app

After changes to `expo-app/` (or `shared/`), on a PC with the repo and its packages installed, in
Git Bash from `expo-app/`:
```bash
rm -rf dist-web
EXPO_WEB_OUTPUT=single \
EXPO_PUBLIC_API_URL=https://test.scorekeeper.live \
EXPO_PUBLIC_WS_URL=https://test.scorekeeper.live \
EXPO_PUBLIC_WEB_URL=https://test.scorekeeper.live \
NODE_ENV=production npx expo export --platform web --output-dir dist-web
tar -czf web-dist.tgz -C dist-web .
scp web-dist.tgz <you>@102.68.97.242:/tmp/
ssh <you>@102.68.97.242 "sudo -u sk -H sh /srv/sk/SK/deploy/install-web.sh /tmp/web-dist.tgz && rm /tmp/web-dist.tgz"
```
- The addresses are set for this build only, which leaves your local `.env` alone. The Google Maps
  web key still comes from `expo-app/.env`, and must allow `https://test.scorekeeper.live/*`.
- `EXPO_WEB_OUTPUT=single` builds one `index.html` for every page
  ([app.config.js](../expo-app/app.config.js)). The default `static` output writes a file per route
  named after its parameters (`organizations/[orgId].html`), which a plain web server cannot match
  to an address.
- [install-web.sh](../deploy/install-web.sh) unpacks the build into a new `releases/` folder,
  switches `current` to it and keeps the previous one. To go back:
  `sudo -u sk ln -sfn /var/www/scorekeeper/releases/<older> /var/www/scorekeeper/current`.
- `dist-web/` and `web-dist.tgz` are build output: delete them, don't commit them.

## Resetting the test data

The test organisations ([fixtures/testOrgs.ts](../server/src/scripts/setup/fixtures/testOrgs.ts),
described in the [setup README](../server/src/scripts/setup/README.md)) are refused when
`NODE_ENV=production`, which the server runs with. Set it to `development` for the reset command
only:
```bash
sudo -u sk -H bash -c 'cd /srv/sk/SK/server && NODE_ENV=development npm run db:test-orgs && pm2 restart scorekeeper'
```
That puts the test organisations back as the fixtures describe them and leaves everything else.
Every test account's password is `Test1234!`. The app admin is `appadmin@scorekeeper.live`; its
password was generated when the server was set up and is not in this repo. It is kept, with the
database password, in `~/secrets.env` in the `fred` login on the server, readable only by that
login.

## Logs

| What | Command |
| --- | --- |
| Is it running? | `pm2 ls` (with the alias above) |
| Live server log | `pm2 logs scorekeeper` |
| Last 200 lines | `pm2 logs scorekeeper --lines 200 --nostream` |
| The server's own log files | `/srv/sk/SK/server/logs/` |
| Requests reaching the site | `/var/log/caddy/test.scorekeeper.live.log` |
| Caddy itself (certificates) | `journalctl -u caddy` |

PM2's logs are in `/srv/sk/.pm2/logs`, rotated by `pm2-logrotate` (10 MB, 14 kept).

## Backups

[deploy/backup.sh](../deploy/backup.sh) runs at 02:30 (SAST) from the `sk` user's crontab and keeps
**one** copy: `sk.dump` (the database) and `uploads.tgz` (the images) in `/srv/sk/backups`. The
last run's output is in `backup.log` there. One copy is enough while the data is test data that is
reset often.

Restore, overwriting the current database:
```bash
sudo -u sk -H bash -c '
  cd /srv/sk/SK/server && set -a && . ./.env && set +a &&
  pm2 stop scorekeeper &&
  PGPASSWORD="$DB_PASSWORD" pg_restore -h "$DB_HOST" -U "$DB_USERNAME" -d "$DB_NAME" --clean --if-exists /srv/sk/backups/sk.dump &&
  tar -xzf /srv/sk/backups/uploads.tgz -C public &&
  pm2 start scorekeeper'
```

## Email

Every email goes through one sender, [mailer.ts](../server/src/services/mailer.ts), which explains
the settings. On the test server it uses **Google Workspace's SMTP relay**:
```
SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
MAIL_FROM=ScoreKeeper <noreply@scorekeeper.live>
```
There is no login and no password: the relay accepts mail because it comes from this server's IP
address. `noreply@scorekeeper.live` is an alias of a Workspace user, which the relay allows as a
sender because it is on our domain. If email stops working, look for `[Mail]` in
`pm2 logs scorekeeper`: at startup the server says how email is set up and whether the relay
answered, and every failed send says why.

**What the relay needs**, in the Workspace Admin console (admin.google.com, Apps → Google Workspace
→ Gmail → Routing → **SMTP relay service**), one entry per server:

| Setting | Value |
| --- | --- |
| Allowed senders | Only addresses in my domains |
| Authentication | Only accept mail from the specified IP addresses: the server's public IP |
| Require SMTP Authentication | off |
| Encryption | Require TLS encryption |

A new server, or a new IP address for this one, needs its address added there, or its email is
refused.

**What the domain needs**, so that mail from it is not marked as spam (set up for `scorekeeper.live`
on 2026-11-07, in Squarespace's DNS):

| Record | Name | Value |
| --- | --- | --- |
| TXT (SPF) | `@` | `v=spf1 include:_spf.google.com ~all` |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:fred@scorekeeper.live` |
| TXT (DKIM) | `google._domainkey` | from Admin console → Gmail → Authenticate email, which must say "Authenticating email with DKIM" |

When email is not set up (no `SMTP_HOST`), a server refuses to send, so nobody is told an email went
when it did not; in development the email is written to the log instead.

## Setting up a server from nothing

The order this one was built in, for a second server or a rebuild:

1. Ubuntu LTS; a personal user with sudo; SSH keys; `00-hardening.conf` (no root, no passwords);
   `ufw` allowing OpenSSH, 80 and 443; `unattended-upgrades` and `fail2ban`.
2. Node 24 (NodeSource), PostgreSQL, Caddy, git, build-essential, fontconfig and fonts-dejavu-core
   (image processing warns without fonts); `npm i -g pm2`, then as `sk`
   `pm2 install pm2-logrotate`.
3. The `sk` system user (`adduser --system --group --home /srv/sk --shell /usr/sbin/nologin sk`),
   the `sk-operators` group and its sudoers rule (`%sk-operators ALL=(sk) NOPASSWD: ALL`), and a
   swap file if memory is small.
4. Database: `CREATE USER sk_admin WITH PASSWORD '…'; CREATE DATABASE sk OWNER sk_admin;`
5. A read-only GitHub deploy key for `sk`, then clone into `/srv/sk/SK`.
6. `server/.env`, owned by `sk` and mode 600: copy the keys from
   [.env.example](../server/.env.example) and set `NODE_ENV=production`, `GET_DATA_ENFORCE=true`,
   `APP_URL`, the database password, new random `JWT_SECRET` and `ASSET_TOKEN_SECRET`
   (`openssl rand -hex 32`, different from each other) and the initial admin.
7. Build `shared/` and `server/`; `npm run db:init`; then `npm run db:seed` (with
   `NODE_ENV=development` for the test organisations, or `db:seed:core` for production).
8. As `sk`, from `server/`: `pm2 start pm2.config.js && pm2 save`. Then, with full sudo,
   `pm2 startup systemd -u sk --hp /srv/sk`.
9. `/var/www/scorekeeper` owned by `sk`; [deploy/Caddyfile](../deploy/Caddyfile) into
   `/etc/caddy/Caddyfile`; a DNS A record for the name; then build and install the web app.
10. The backup line in `sk`'s crontab (see the top of [backup.sh](../deploy/backup.sh)).
11. Email: add the server's IP address to the Workspace SMTP relay, put the `SMTP_HOST`,
    `SMTP_PORT` and `MAIL_FROM` lines from [Email](#email) in `.env`, restart, and check the `[Mail]`
    lines in the log. The domain's SPF, DMARC and DKIM records are already there for
    `scorekeeper.live`; a new domain needs its own.

## Before production

- **Player profiles are public** until `PEOPLE-4` is done. The test server only holds made-up
  people. Production must not open before `PEOPLE-4`.
- **Which websites may call the server** from a browser: `APP_URL`, plus `CORS_ORIGINS` for any
  other address the web app is served from (e.g. `https://scorekeeper.live` and
  `https://www.scorekeeper.live`); see [allowedOrigins.ts](../server/src/services/allowedOrigins.ts).
  The server logs the list at startup (`[CORS]`).
- **Backups** need history and a copy off the machine.
- **Email:** add the production server's IP address to the Workspace SMTP relay ([Email](#email)).
  The relay has daily sending limits, so a dedicated mail service may be needed as use grows
  (TODO.md, Pending Tasks).
- The one-off steps for a first production server: `EXPO_PUBLIC_WEB_URL` in the app build, a
  MaxMind `GeoLite2-City.mmdb` with `GEOIP_CITY_DB` (and a way to keep it current), Google Maps and
  Places keys allowed for the production address, with daily caps.
- A server with more memory than this one if many people use it at once.
