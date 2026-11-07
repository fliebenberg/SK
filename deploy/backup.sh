#!/bin/sh
# Nightly backup for the test server: the database and the uploaded images, ONE copy of each.
# Test data is reset to the fixtures often, so older copies are not worth keeping; production will
# need a proper backup with history and an off-server copy (docs/deployment.md).
#
# Runs as the sk user from its crontab:
#   30 2 * * * sh /srv/sk/SK/deploy/backup.sh > /srv/sk/backups/backup.log 2>&1
# Each file is written beside the old one and only replaces it once complete, so a failed run
# leaves the previous backup in place.
set -eu

SERVER_DIR=/srv/sk/SK/server
OUT=/srv/sk/backups
mkdir -p "$OUT"
chmod 700 "$OUT"

# The database settings, from the server's own .env.
set -a
. "$SERVER_DIR/.env"
set +a

echo "Backup started $(date -Is)"

PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -Fc "$DB_NAME" > "$OUT/sk.dump.tmp"
mv "$OUT/sk.dump.tmp" "$OUT/sk.dump"
echo "Database: $(du -h "$OUT/sk.dump" | cut -f1)"

if [ -d "$SERVER_DIR/public/uploads" ]; then
    tar -czf "$OUT/uploads.tgz.tmp" -C "$SERVER_DIR/public" uploads
    mv "$OUT/uploads.tgz.tmp" "$OUT/uploads.tgz"
    echo "Uploads: $(du -h "$OUT/uploads.tgz" | cut -f1)"
fi

echo "Backup finished $(date -Is)"
