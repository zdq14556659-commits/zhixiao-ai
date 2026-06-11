#!/usr/bin/env bash
set -euo pipefail

SERVER_NAME="${1:-_}"
APP_ROOT="/opt/zhixiao-ai"
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl nginx certbot python3-certbot-nginx tar

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! id zhixiao >/dev/null 2>&1; then
  useradd --system --home "$APP_ROOT" --shell /usr/sbin/nologin zhixiao
fi

mkdir -p "$APP_ROOT/releases" "$APP_ROOT/shared/data" "$APP_ROOT/shared/uploads" "$APP_ROOT/shared/backups"
chown -R zhixiao:zhixiao "$APP_ROOT"

if [ ! -f /etc/zhixiao-ai.env ]; then
  cat >/etc/zhixiao-ai.env <<'EOF'
PORT=8787
NODE_ENV=production
DATA_DIR=/opt/zhixiao-ai/shared/data
UPLOAD_DIR=/opt/zhixiao-ai/shared/uploads
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_API_KEY=
EOF
  chmod 600 /etc/zhixiao-ai.env
fi

install -m 0644 "$DEPLOY_DIR/zhixiao-ai.service" /etc/systemd/system/zhixiao-ai.service
sed "s/__SERVER_NAME__/$SERVER_NAME/g" "$DEPLOY_DIR/nginx.conf" >/etc/nginx/sites-available/zhixiao-ai
ln -sfn /etc/nginx/sites-available/zhixiao-ai /etc/nginx/sites-enabled/zhixiao-ai
rm -f /etc/nginx/sites-enabled/default
install -m 0755 "$DEPLOY_DIR/release.sh" /usr/local/sbin/zhixiao-release
install -m 0755 "$DEPLOY_DIR/backup.sh" /usr/local/sbin/zhixiao-backup

cat >/etc/cron.d/zhixiao-ai-backup <<'EOF'
15 3 * * * root /usr/local/sbin/zhixiao-backup >/var/log/zhixiao-backup.log 2>&1
EOF

systemctl daemon-reload
systemctl enable zhixiao-ai
nginx -t
systemctl enable --now nginx

echo "Tencent Cloud server initialized for Zhixiao AI"
echo "Persistent data: $APP_ROOT/shared/data"
echo "Persistent uploads: $APP_ROOT/shared/uploads"
