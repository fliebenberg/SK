#!/bin/sh
# Brings the server up to the latest commit on main and reloads it. Runs ON the server, as sk:
#   sudo -u sk -H sh /srv/sk/SK/deploy/update-server.sh
# Pulls, rebuilds shared/ and server/, runs any new database migrations, then reloads PM2.
# Stops at the first step that fails, so a broken build never replaces the running server.
# The web app is built on a PC and installed with install-web.sh (docs/deployment.md).
set -eu

REPO=/srv/sk/SK
cd "$REPO"

echo "== Pulling"
git pull --ff-only
git log -1 --oneline

echo "== shared/"
cd "$REPO/shared"
npm ci --no-audit --no-fund
npm run build

echo "== server/"
cd "$REPO/server"
npm ci --no-audit --no-fund
npm run build

echo "== Database migrations"
npm run db:migrate

echo "== Reloading"
pm2 reload pm2.config.js --update-env
pm2 save
pm2 ls
