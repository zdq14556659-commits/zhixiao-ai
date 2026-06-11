#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:?release archive is required}"
APP_ROOT="/opt/zhixiao-ai"
RELEASES="$APP_ROOT/releases"
SHARED="$APP_ROOT/shared"
STAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE="$RELEASES/$STAMP"

mkdir -p "$RELEASES" "$SHARED/data" "$SHARED/uploads" "$SHARED/backups"

if [ -f "$SHARED/data/db.json" ]; then
  /usr/local/sbin/zhixiao-backup
fi

mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"

cd "$RELEASE"
npm install --omit=dev

if [ ! -f "$SHARED/data/seed.json" ]; then
  cp "$RELEASE/backend/data/seed.json" "$SHARED/data/seed.json"
fi
if [ ! -f "$SHARED/data/db.json" ]; then
  cp "$SHARED/data/seed.json" "$SHARED/data/db.json"
fi

chown -R zhixiao:zhixiao "$RELEASE" "$SHARED"
ln -sfn "$RELEASE" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"

systemctl restart zhixiao-ai

for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:8787/api/health >/dev/null; then
    nginx -t
    systemctl reload nginx
    ls -1dt "$RELEASES"/* 2>/dev/null | tail -n +6 | xargs -r rm -rf
    rm -f "$ARCHIVE"
    echo "Zhixiao AI deployed: $RELEASE"
    exit 0
  fi
  sleep 1
done

echo "Zhixiao AI health check failed" >&2
journalctl -u zhixiao-ai -n 80 --no-pager >&2
exit 1
