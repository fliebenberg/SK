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

A shortcut worth adding to your `~/.bashrc`, so `pm2 ls`, `pm2 logs` and the rest work as you:
```bash
alias pm2='sudo -u sk -H pm2'
```

## Updating the server

After changes to `server/` or `shared/` are pushed to `main`:
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
password was generated when the server was set up and is not in this repo.

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

Email goes out through Google Workspace SMTP (`smtp.gmail.com`), set by the `SMTP_*` lines in
`server/.env`. Until `SMTP_PASS` is set, emails are not sent: they are written to the server log
(password reset) or sent to a fake Ethereal inbox (invitations).

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

## Before production

- **Player profiles are public** until `PEOPLE-4` is done. The test server only holds made-up
  people. Production must not open before `PEOPLE-4`.
- **Requests from any website are accepted** (`cors()` and the socket's `origin: "*"` in
  [index.ts](../server/src/index.ts)). Limit them to the app's own address.
- **Backups** need history and a copy off the machine.
- **Email** needs a proper sending service (TODO.md, Pending Tasks).
- The one-off steps for a first production server: `EXPO_PUBLIC_WEB_URL` in the app build, a
  MaxMind `GeoLite2-City.mmdb` with `GEOIP_CITY_DB` (and a way to keep it current), Google Maps and
  Places keys allowed for the production address, with daily caps.
- A server with more memory than this one if many people use it at once.
