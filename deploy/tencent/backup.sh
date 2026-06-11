#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/zhixiao-ai"
BACKUP_DIR="$APP_ROOT/shared/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/zhixiao-data-$STAMP.tar.gz" \
  -C "$APP_ROOT/shared" data uploads

find "$BACKUP_DIR" -type f -name 'zhixiao-data-*.tar.gz' -mtime +14 -delete
