#!/usr/bin/env bash
set -e

# ==============================================================================
# MONOREPO KÖK DEPLOY SCRİPTİ (Root Deploy Script)
# Projedeki tüm servisleri, DB migration'ları ve Frontend'i günceller.
# ==============================================================================

echo "🚀 [DEPLOY] Monorepo Dağıtım İşlemi Başlatılıyor..."

# 1. Dizin Doğrulama
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "📂 [DIR] Çalışma dizini: $ROOT_DIR"

# 2. Git Kod Güncellemesi
BRANCH="${1:-main}"
echo "📥 [GIT] Kodlar '$BRANCH' dalından çekiliyor..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# 3. Bağımlılıkların Kurulması (Monorepo Kök)
echo "📦 [NPM] Bağımlılıklar yükleniyor..."
npm ci --prefer-offline --no-audit

# 4. Şema Build & Database Migration (Varsa)
if [ -f "scripts/build-schema.js" ]; then
  echo "🗄️ [DB] Veritabanı şemaları build ediliyor..."
  node scripts/build-schema.js
fi

# 5. Frontend App Build (Varsa)
if [ -d "pdf-web-app" ]; then
  echo "🏗️ [FRONTEND] Web uygulaması build ediliyor..."
  (cd pdf-web-app && npm run build)
fi

# 6. PM2 Servislerinin Kesintisiz (Zero-Downtime Reload) Başlatılması
echo "🔄 [PM2] Mikroservisler yeniden başlatılıyor (reload)..."
if command -v pm2 &> /dev/null; then
  if [ -f "ecosystem.config.cjs" ]; then
    pm2 reload ecosystem.config.cjs --env production || pm2 start ecosystem.config.cjs --env production
  else
    for service_dir in services/*/; do
      if [ -f "${service_dir}ecosystem.config.cjs" ]; then
        service_name=$(basename "$service_dir")
        echo "   -> Reloader: ${service_name}"
        (cd "$service_dir" && pm2 reload ecosystem.config.cjs --env production || pm2 start ecosystem.config.cjs --env production)
      fi
    done
  fi
  pm2 save
else
  echo "⚠️ [PM2] pm2 komutu bulunamadı. Servisler PM2 ile yeniden başlatılamadı."
fi

# 7. Durum Kontrolü
echo "🩺 [HEALTH-CHECK] Servis durumları:"
if command -v pm2 &> /dev/null; then
  pm2 status
fi

echo "✅ [SUCCESS] Deploy işlemi başarıyla tamamlandı!"
