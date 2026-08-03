#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/zhixiao-ai"
BACKUP_DIR="$APP_ROOT/shared/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
set +e
tar -czf "$BACKUP_DIR/zhixiao-data-$STAMP.tar.gz" \
  --warning=no-file-changed \
  -C "$APP_ROOT/shared" data uploads
TAR_STATUS=$?
set -e

if [ "$TAR_STATUS" -gt 1 ]; then
  echo "Backup failed with tar exit code $TAR_STATUS" >&2
  exit "$TAR_STATUS"
fi

if [ "$TAR_STATUS" -eq 1 ]; then
  echo "Backup completed with live-file-change warnings; continuing deploy."
fi

find "$BACKUP_DIR" -type f -name 'zhixiao-data-*.tar.gz' -mtime +14 -delete
