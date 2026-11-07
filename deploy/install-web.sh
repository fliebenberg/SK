#!/bin/sh
# Installs a web build that was uploaded as a .tgz, and switches the site to it. Runs ON the server,
# as sk:
#   sudo -u sk -H sh /srv/sk/SK/deploy/install-web.sh /tmp/web-dist.tgz
# Each build goes into its own folder under releases/; Caddy serves whatever `current` points at.
# The two newest releases are kept, so going back is: ln -sfn releases/<older> current
# Building and uploading happen on a PC (docs/deployment.md).
set -eu

TGZ=${1:?"usage: install-web.sh <web-dist.tgz>"}
WEB=/var/www/scorekeeper
NEW="$WEB/releases/$(date +%Y%m%d-%H%M%S)"

mkdir -p "$NEW"
tar -xzf "$TGZ" -C "$NEW"
[ -f "$NEW/index.html" ] || { echo "No index.html in $TGZ; not switching." >&2; rm -rf "$NEW"; exit 1; }
chmod -R a+rX "$NEW"

ln -sfn "$NEW" "$WEB/current.tmp"
mv -T "$WEB/current.tmp" "$WEB/current"
echo "Now serving $NEW"

# Keep the two newest releases.
ls -1d "$WEB"/releases/* | sort | head -n -2 | while read -r old; do rm -rf "$old"; echo "Removed $old"; done
