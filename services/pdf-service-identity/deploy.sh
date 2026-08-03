#!/usr/bin/env bash
set -e

# ==============================================================================
# SERVİS BAZLI DEPLOY SCRİPTİ (pdf-service-identity)
# Tekil bir servisin bağımsız olarak güncellenmesi ve yeniden başlatılması için.
# ==============================================================================

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SERVICE_DIR/../.." && pwd)"

echo "🚀 [DEPLOY] Servis Dağıtımı Başlatılıyor: pdf-service-identity..."
cd "$ROOT_DIR"

# 1. Kod Güncellemesi
BRANCH="${1:-main}"
echo "📥 [GIT] Monorepo '$BRANCH' dalına senkronize ediliyor..."
git fetch origin
git pull origin "$BRANCH"

# 2. Servis Dizinine Geçiş & Paket Kurulumu
cd "$SERVICE_DIR"
echo "📦 [NPM] Servis bağımlılıkları doğrulanıyor..."
npm ci --prefer-offline --no-audit

# 3. PM2 Zero-Downtime Reload
echo "🔄 [PM2] Servis reload ediliyor..."
if command -v pm2 &> /dev/null; then
  pm2 reload ecosystem.config.cjs --env production || pm2 start ecosystem.config.cjs --env production
  pm2 save
  echo "🩺 [PM2 STATUS] Güncel servis durumu:"
  pm2 status pdf-service-identity
else
  echo "⚠️ [PM2] pm2 bulunamadı!"
fi

echo "✅ [SUCCESS] pdf-service-identity servisi başarıyla güncellendi!"
