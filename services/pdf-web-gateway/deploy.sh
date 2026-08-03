#!/usr/bin/env bash
set -e

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SERVICE_DIR/../.." && pwd)"

echo "🚀 [DEPLOY] Servis Dağıtımı Başlatılıyor: pdf-web-gateway..."
cd "$ROOT_DIR"

BRANCH="${1:-main}"
git fetch origin
git pull origin "$BRANCH"

cd "$SERVICE_DIR"
npm ci --prefer-offline --no-audit

if command -v pm2 &> /dev/null; then
  pm2 reload ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production
  pm2 save
  pm2 status pdf-web-gateway
else
  echo "⚠️ [PM2] pm2 bulunamadı!"
fi

echo "✅ [SUCCESS] pdf-web-gateway servisi başarıyla güncellendi!"
