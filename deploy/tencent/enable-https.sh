#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:?domain is required}"
EMAIL="${2:?email is required}"

certbot --nginx \
  --non-interactive \
  --agree-tos \
  --redirect \
  --email "$EMAIL" \
  -d "$DOMAIN"

systemctl reload nginx
echo "HTTPS enabled: https://$DOMAIN"
