# Monorepo Mimari Şablonu — Tropiq

> Bu doküman, bu repodaki mimariyi **başka projelere taşınabilir bir şablon** olarak belgeler. Amaç iki kat: (1) sen yeni bir projeye başlarken buraya bakıp neyi neden nasıl kurduğunu hatırlaman, (2) bir AI ajanının bu dosyayı okuyarak aynı mimariyi sıfırdan başka bir repoda kurabilmesi. Her bölüm "bu ne", "neden böyle", "nasıl taşınır" sorularını cevaplar.

## İçindekiler

1. [Genel Bakış](#1-genel-bakış)
2. [Üst Seviye Klasör Haritası](#2-üst-seviye-klasör-haritası)
3. [core/ vs services/ Ayrımı](#3-core-vs-services-ayrımı)
4. [packages/ — Paylaşılan Kütüphaneler](#4-packages--paylaşılan-kütüphaneler)
5. [tropiq-web-gateway — Sınır Katmanı](#5-tropiq-web-gateway--sınır-katmanı)
6. [db-schemas/ — core/ Şema İlişkisi](#6-db-schemas--core-şema-ilişkisi)
7. [Servis Kabuğu Standart Dosyaları](#7-servis-kabuğu-standart-dosyaları)
   - 7.1 [Deploy Script Mimarisi (deploy.sh)](#71-deploy-script-mimarisi-deploysh)
8. [docker-compose.e2e.yml — Orkestrasyon](#8-docker-composee2eyml--orkestrasyon)
9. [Test Stratejisi](#9-test-stratejisi)
10. [tropiq-web-app — Frontend Mimarisi](#10-tropiq-web-app--frontend-mimarisi)
11. [.wolf/ — AI/OpenWolf Katmanı](#11-wolf--aiopenwolf-katmanı)
12. [Yeni Bir Projede Kurma Rehberi](#12-yeni-bir-projede-kurma-rehberi)

---

## 1. Genel Bakış

Bu repo, tek bir monorepo içinde **çok-servisli bir backend** (10 mikroservis + 1 API gateway), **tek bir React frontend** ve **AI-destekli geliştirme iş akışını** yöneten bir katman (`.wolf/`) barındırıyor. Üç problemi aynı anda çözüyor:

- **Servisler arası kod paylaşımı**: Her mikroservis benzer altyapı ihtiyaçları duyar (config okuma, DB bağlantısı, hata işleme, middleware'ler). Bunlar `packages/` altında merkezi npm paketleri olarak modellenmiş, her serviste kopyalanmamış.
- **İş mantığının framework'ten izolasyonu**: `core/` klasörü, hiçbir HTTP/Express/framework detayı bilmeyen saf iş mantığını barındırır; `services/` bu mantığı çalıştıran ince kabuklardır. Bu ayrım olmasaydı, framework değişikliği veya test yazımı domain kodunu kirletirdi.
- **AI ajanlarının (Claude Code, Cursor) tutarlı ve verimli çalışması**: `.wolf/` klasörü ve `.cursor/rules/` dosyaları, AI'nın her oturumda sıfırdan keşif yapmak yerine önceki oturumlardan öğrendiklerini (konvansiyonlar, hatalar, dosya haritası) hafızada tutmasını sağlar.

Bu üç prensip, aşağıdaki tüm klasör kararlarının temelini oluşturur.

---

## 2. Üst Seviye Klasör Haritası

```
tropiq-mono-repo/
├── core/               # Framework-bağımsız iş mantığı (domain + application + infrastructure)
├── services/           # Çalıştırılabilir servis kabukları (main.js, boot, config, ldeploy)
├── packages/           # Servisler arası paylaşılan npm paketleri
├── db-schemas/         # PostgreSQL şema tanımları (SQL) + migration'lar
├── test/               # Jest: unit/integration/e2e/custom testleri, servis bazlı
├── e2e/                # Playwright: tarayıcı üzerinden uçtan uca UI testleri
├── tropiq-web-app/     # React frontend (ana uygulama)
├── tropiq-landing-app/ # Astro tabanlı pazarlama/landing sitesi
├── scripts/            # Repo geneli yardımcı scriptler (schema build, seed, validate)
├── docs/               # Proje dokümantasyonu (bu dosya dahil)
├── .wolf/              # AI/OpenWolf: context, hafıza, hook, bug takibi
├── .claude/             # Claude Code ayarları (hooks, permissions)
├── .codegraph/          # Kod grafiği indeksleme aracı config'i
├── docker-compose.e2e.yml  # E2E ortamı orkestrasyonu (14 servis)
└── package.json         # Kök workspace: lint/format/test script'leri
```

**Neden bu ayrım**: `core/services/packages` üçlüsü klasik hexagonal/clean architecture'ın monorepo'ya uyarlanmış hali. `test/` ile `e2e/` bilinçli olarak ayrı: biri servis-seviyesinde Jest ile çalışırken diğeri gerçek tarayıcıda Playwright ile çalışır (bkz. Bölüm 9). `tropiq-web-app` ile `tropiq-landing-app` ayrı çünkü teknoloji yığınları farklı (React SPA vs. Astro statik site) ve dağıtım döngüleri bağımsız.

---

## 3. core/ vs services/ Ayrımı

Bu, tüm backend mimarisinin en kritik kararı. Örnek olarak `service-rfq` üzerinden anlatılıyor.

### 3.1 core/service-rfq — Framework'ten bağımsız iş mantığı

```
core/service-rfq/
├── definitions/          # OpenAPI/REST API şema tanımları (paylaşılan kısım)
├── routes/                # REST route tanımları (paylaşılan kısım)
├── package.json
└── src/
    ├── domain/            # Entity'ler, domain hataları, iş kuralları
    │   └── errors/
    ├── application/       # Use-case'ler (iş akışlarının orkestrasyonu)
    │   └── use-cases/
    ├── infrastructure/    # DB erişimi, repository implementasyonları
    │   └── persistence/
    │       ├── repositories/
    │       └── schemas/   # table-definitions.js (JS tablo şeması)
    └── interfaces/        # Dış dünyaya bakan adaptörler
        └── http/          # HTTP'ye özel çeviri katmanı
```

**Katman sorumlulukları ve bağımlılık yönü** (dıştan içe, klasik clean architecture):

- **domain/**: En içteki katman. Hiçbir dış bağımlılığı olmayan saf iş kuralları ve hata tipleri (`domain/errors/`). Örn: "bir teklif sadece açık bir ihaleye verilebilir" kuralı burada yaşar, bir Express request/response nesnesi asla buraya sızmaz.
- **application/**: Use-case'ler — "bir teklif gönder", "ihaleyi kapat" gibi iş akışlarının adım adım orkestrasyonu. Repository *arayüzlerini* kullanır ama *implementasyonlarını* bilmez (dependency inversion). `application/use-cases/rfq/create-rfq.use-case.js` gibi dosyalar `make*` fonksiyonu export eder (bkz. 3.2).
- **infrastructure/**: Dış dünyayla gerçek temas noktası — PostgreSQL sorguları, repository implementasyonları, tablo şemaları. Application katmanının ihtiyaç duyduğu arayüzleri somutlaştırır.
- **interfaces/http/**: HTTP'ye özel adaptör. `translate-domain-error.js` domain hatalarını (örn. `TenderClosedError`) HTTP status kodlarına ve JSON hata gövdelerine çevirir. Bu sayede domain katmanı "404" ya da "409" gibi HTTP kavramlarını hiç bilmez.

**Neden bu ayrım var**: Framework (Express, Fastify, vs.) değişse bile `domain/` ve `application/` hiç dokunulmadan kalır. Use-case'ler HTTP'siz, DB'siz, saf JS fonksiyonlarıyla test edilebilir (bkz. `core/service-rfq/test/`). Bu, "önce testleri hızlı ve izole yazabilmek", "iş mantığını framework kilitlenmesinden korumak" hedeflerinin doğrudan sonucu.

### 3.2 Composition Root Deseni — Class yok, factory fonksiyonları var

`services/*/src/container.js` her servisin **composition root**'udur — tüm use-case'lerin, repository'lerin somut implementasyonlarla "elle" bağlandığı tek yer.

```js
// services/tropiq-service-rfq/src/container.js (özet)
import { makeAuditLogRepository } from './infrastructure/persistence/repositories/audit-log.repository.js';
import { makeCreateRfq } from './application/use-cases/rfq/create-rfq.use-case.js';
// ...

export const buildContainer = ({ rawQueryFn = rawQuery, fetchFn, identityBaseUrl, translateHttpErrors = true } = {}) => {
  const repos = {
    auditLogRepo: makeAuditLogRepository({ rawQuery: rawQueryFn }),
  };
  const wrap = translateHttpErrors ? wrapWithHttpTranslation : (fn) => fn;
  // use-case'ler repos ile burada "make" edilir ve wrap ile HTTP hata çevirisine sarılır
  ...
};
```

**Neden class/DI-framework değil de factory fonksiyonu (`make*`)**: Bu proje bilinçli olarak hiçbir DI container kütüphanesi (InversifyJS, Awilix, vb.) kullanmıyor. Her `make*` fonksiyonu, bağımlılıklarını parametre olarak alan saf bir closure factory'dir (`makeCreateRfq({ rfqRepo, auditLogRepo }) => (input) => {...}`). Bu:

- Bağımlılık grafiğinin tamamen `container.js`'te elle görülebilir olmasını sağlar — "büyü" yok, hangi use-case hangi repo'ya bağlı, tek dosyada okunabilir.
- Testte gerçek repo yerine sahte (fake/stub) obje geçmeyi trivial yapar — class instantiate etmeye, mock kütüphanesine gerek yok.
- `translateHttpErrors` gibi parametrelerle test/prod davranışının container seviyesinde değişebilmesini sağlar (örn. testte HTTP çevirisini kapatıp saf domain hatasını görmek).

### 3.3 services/tropiq-service-rfq — Çalıştırılabilir kabuk

```
services/tropiq-service-rfq/
├── configs/               # app-config.js, datasource-config.js — env okuma
├── definitions/            # (core'daki ile aynı/genişletilmiş REST API tanımı)
├── deploy.sh               # Deploy scripti
├── ecosystem.config.js     # PM2 process yönetimi config'i
├── main.js                 # Process giriş noktası
├── middlewares/
├── package.json            # core/service-rfq'ya bağımlı
├── routes/
└── src/
    ├── boot.js              # HTTP server'ı ayağa kaldırma
    ├── container.js         # Composition root (bkz. 3.2)
    ├── application/         # core'dakinin üstüne servis-özel use-case'ler
    ├── domain/
    ├── infrastructure/
    └── shared/
```

`services/tropiq-service-rfq`, `core/service-rfq`'yu **çalıştıran** kabuktur: `main.js` → `boot.js` → `container.js` zinciriyle process'i ayağa kaldırır, env config okur (`configs/`), route'ları bağlar, deploy/process-yönetim dosyalarını taşır. İş mantığının önemli bir kısmı `core/`'da yaşasa da, servise özel ek use-case'ler ve genişletmeler `services/*/src/` altında da bulunabilir — `core/` "paylaşılabilir çekirdek", `services/*` ise "bu çekirdeği çalıştıran + servise özel uzantılar" anlamına gelir.

**Neden iki ayrı klasör (core/ ve services/) — tek bir klasörde birleştirilmedi**: Çalıştırma kabuğu (process yönetimi, env config, deploy) ile iş mantığının yaşam döngüleri farklıdır. `core/` içeriği birden fazla çalıştırma bağlamında (örn. bir CLI aracı, bir arka plan worker'ı, testler) tekrar kullanılabilir olması hedeflenerek ayrılmıştır; `services/` katmanı ise tek bir çalışma şekline (uzun yaşayan HTTP process'i) kilitlidir.

---

## 4. packages/ — Paylaşılan Kütüphaneler

```
packages/
├── modules/                  # Küçük, tek-amaçlı yardımcı npm paketleri
│   ├── config/                # Env/config okuma
│   ├── datasource/             # DB connector'ları
│   ├── entity-factory/          # Generic CRUD controller+repository üretici
│   ├── errors/                  # Hata sınıfları + handleErrors + response şablonları
│   ├── example-builder/
│   ├── helper/                  # Genel yardımcılar + log
│   ├── language/                 # i18n modülleri
│   ├── middlewares/               # body-parser, compression, helmet, log, swagger middleware'leri
│   ├── service-discovery/          # Redis tabanlı servis keşif mekanizması (bkz. 4.1)
│   └── shared/                      # api/auth gibi ortak yardımcılar
├── persistence-utils/         # DB sorgu/persistence yardımcıları
└── query-builder/              # SQL query builder
```

**Neden her biri ayrı bir npm paketi (klasör) olarak modellendi, tek bir "utils" klasöründe değil**: Her `packages/modules/*` kendi `package.json`'ına sahip, yani bağımsız bir birim olarak import edilir (`import ... from 'app-shared'` gibi). Bu, her paketin sınırının (ne export ettiğinin) net olmasını, bir pakete bakmadan diğerini anlayabilmeyi ve gerekirse bağımsız versiyonlanabilmeyi sağlar. Tek bir "utils" klasörü olsaydı, sınırlar bulanıklaşır, "bu fonksiyon nereden geliyor" sorusu zorlaşırdı.

### 4.1 Service Discovery — Servisler birbirini nasıl buluyor

`packages/modules/service-discovery`, mikroservislerin birbirini bulmasını sağlayan Redis tabanlı bir mekanizmadır:

- Her servis açılışta kendi OpenAPI tanımını (`definitions/rest-api-definition.js`) `service-discovery/index.js` → `createOpenApiDoc` ile zenginleştirir (`serviceName`, `rootUrl`, `basePath`, `basePathPrefix` bilgileriyle) ve bunu **Redis'e** kaydeder.
- Bir servis yeniden başladığında `app.fct.servicerestarted` Redis pub/sub kanalına bir mesaj yayınlanır; bunu dinleyen taraflar (öncelikle gateway) route tablolarını günceller.
- `tropiq-web-gateway`, bu Redis kaydından hangi servisin hangi path'i sunduğunu okuyup gelen istekleri doğru servise proxy'ler.

**Neden statik bir config dosyası yerine Redis tabanlı dinamik keşif**: Servis sayısı arttıkça ve servisler bağımsız deploy edildikçe (farklı zamanlarda restart), gateway'in "hangi servis hangi path'i sunuyor" bilgisini elle güncellenen bir dosyada tutması kırılgan olurdu. Redis pub/sub, bir servis her restart olduğunda gateway'in bunu otomatik öğrenmesini sağlar — manuel config senkronizasyonu gerektirmez.

---

## 5. tropiq-web-gateway — Sınır Katmanı

`services/tropiq-web-gateway`, diğer servislerden **kategorik olarak farklı** bir sorumluluğa sahiptir: sadece bir reverse-proxy değil, sistemin **güvenlik sınırıdır**.

```
services/tropiq-web-gateway/src/
├── auth/
│   ├── jwt.js              # Access token verify/sign
│   ├── cookies.js           # Auth cookie set/clear (ACCESS_COOKIE, REFRESH_COOKIE)
│   └── session.js            # Session rotate/revoke, blacklist kontrolü
├── middlewares/
│   ├── csrf-middleware.js     # CSRF token üretimi + koşullu koruma
│   └── security-middleware.js  # Rate limiting (strictAuthLimiter)
├── modules/
├── constants/
├── gateway-handlers.js        # /api/gateway/* endpoint handler'ları
├── route.js
└── boot.js
```

Gateway'in üstlendiği sorumluluklar:

- **Authentication**: JWT access/refresh token doğrulama ve yenileme (`/api/gateway/refresh`), signed cookie üzerinden token taşınması.
- **Session yönetimi**: `/api/gateway/logout`, `/api/gateway/logout-all`, `/api/gateway/sessions/revoke-by-role` (superadmin) — session'ların merkezi olarak iptal edilebilmesi.
- **CSRF koruması**: `conditionalCsrfProtection` middleware'i + XSRF cookie üretimi.
- **Rate limiting**: Auth endpoint'lerine özel sıkı rate limiter (`strictAuthLimiter`) — brute-force koruması.
- **`/api/gateway/me`**: Frontend'in oturum açan kullanıcının profil/organizasyon/izin bilgisini tek çağrıda alabildiği endpoint.

**Neden bu sorumluluklar her serviste tekrarlanmıyor, tek bir gateway'de toplanıyor**: Auth/session/CSRF mantığı güvenlik açısından kritik ve tutarlılık gerektirir — her serviste ayrı ayrı implemente edilseydi, bir tanesinde yapılan hata tüm sistemi zayıflatırdı. Gateway'i tek "giriş kapısı" yaparak, arkadaki servisler zaten doğrulanmış bir isteğin geldiğini varsayabilir, kendi auth mantığını tekrar yazmak zorunda kalmaz.

---

## 6. db-schemas/ — core/ Şema İlişkisi

```
db-schemas/
├── 00-enums-schema.sql
├── 01-identity-schema.sql
├── 02-rfq-schema.sql
├── ... (her domain için bir SQL dosyası)
├── 10-seed-data.sql
├── 11-timescale-performance.sql
├── combined-schema.sql         # Tüm şemaların birleşimi (üretilmiş dosya)
└── migrations/                  # Tarihli, tekil migration dosyaları
```

Her domain (`identity`, `rfq`, `bidding`, `shipment`, `document`, `billing`, `notification`, `analytics-audit`, `reference`) kendi numaralı SQL dosyasında yaşar — dosya adındaki numara, uygulama sırasını (bağımlılık sırasını) belirtir.

Bu SQL şemaların **JS karşılığı**, ilgili `core/service-*/src/infrastructure/persistence/schemas/table-definitions.js` dosyasındadır. `scripts/build-schema.js`, bu JS tanımlarını okuyup `combined-schema.sql`'i (ve/veya tersini) üretmekten sorumludur — yani tek gerçek kaynak (source of truth) JS tanımları, SQL ise ondan türetilir (ya da senkron tutulması gereken paralel bir temsildir; hangi yönde üretim yapıldığı `scripts/build-schema.js` içinde tanımlıdır).

**Neden SQL dosyaları hâlâ elle tutuluyor, sadece JS'ten üretilmiyor**: Veritabanı migration'ları (`migrations/`) ve ilk kurulum şemaları (`db-schemas/*.sql`) DBA/ops tarafından doğrudan okunabilir, gözden geçirilebilir olmalı — saf JS obje tanımından okumak bu amaca hizmet etmez. Bu yüzden iki temsil bilinçli olarak paralel tutuluyor ve `build-schema.js` bunları senkron tutan araçtır.

---

## 7. Servis Kabuğu Standart Dosyaları

Her `services/*` klasöründe neredeyse birebir aynı iskelet dosyalar tekrarlanır:

| Dosya                                                       | Amaç                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `main.js`                                                 | Process giriş noktası                                                         |
| `src/boot.js`                                             | HTTP server'ı ayağa kaldırma, middleware zincirini kurma                     |
| `src/container.js`                                        | Composition root (bkz. 3.2)                                                     |
| `configs/app-config.js`, `configs/datasource-config.js` | Env değişkenlerinden config okuma                                             |
| `ecosystem.config.js`                                     | PM2 process yönetimi tanımı (prod'da servisin nasıl çalıştırılacağı) |
| `deploy.sh`                                               | Deploy scripti                                                                  |
| `commit-and-tag.js` (veya `commit-and-tag-temp.js`)     | Versiyon bump + git tag otomasyonu                                              |
| `*.postman_collection.json`                               | Manuel/keşif amaçlı API test koleksiyonu                                     |

**Neden bu şablon tekrarlanıyor, ortak bir "servis başlatıcı" paketine çıkarılmadı**: Her servisin process yaşam döngüsü (port, PM2 instance sayısı, env dosyası) birbirinden bağımsız ve servis-özel karar gerektirir (örn. bir servis daha fazla worker instance'ı isteyebilir). Bu dosyaları paylaşılan bir pakete taşımak, her servisin kendi deploy/process davranışını override etme esnekliğini kaybettirirdi. Bunun yerine "kopyala-yapıştır bir şablon" bilinçli bir tercih: her servis kendi kabuğunun tam sahibi.

### 7.1 Deploy Script Mimarisi (`deploy.sh`)

Monorepo mimarisinde canlı sunucuya (Production / Staging) kod dağıtımı iki seviyede ele alınır: **Kök (Monorepo) Deploy Scripti** ve **Servis Bazlı Deploy Scripti**. Her iki script de PM2'nin `reload` (kesintisiz / zero-downtime) yeteneğinden faydalanarak uygulamanın hiç kesintiye uğramadan güncellenmesini sağlar.

#### 7.1.1 Servis Bazlı Deploy Scripti (`services/<service-name>/deploy.sh`)

Sadece tek bir mikroserviste değişiklik yapıldığında tüm projeyi rebuild etmek yerine yalnızca ilgili servisin güncellenmesini ve PM2 ile yeniden başlatılmasını sağlar.

```bash
#!/usr/bin/env bash
set -e

# SERVİS BAZLI DEPLOY SCRİPTİ (Örn: services/pdf-service-identity/deploy.sh)
SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SERVICE_DIR/../.." && pwd)"

echo "🚀 [DEPLOY] Servis Dağıtımı Başlatılıyor: $(basename "$SERVICE_DIR")..."
cd "$ROOT_DIR"

# 1. Monorepo kod senkronizasyonu
BRANCH="${1:-main}"
git fetch origin
git pull origin "$BRANCH"

# 2. Servis bağımlılıkları ve izole kontroller
cd "$SERVICE_DIR"
npm ci --prefer-offline --no-audit

# 3. PM2 Zero-Downtime Reload
if command -v pm2 &> /dev/null; then
  pm2 reload ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production
  pm2 save
  pm2 status "$(basename "$SERVICE_DIR")"
fi

echo "✅ [SUCCESS] Servis başarıyla güncellendi!"
```

#### 7.1.2 Kök Monorepo Deploy Scripti (`scripts/deploy.sh`)

Tüm repoyu, veritabanı şemalarını, React frontend uygulamasını ve arkadaki tüm servis kabuklarını tek adımla güncellemek için kullanılan ana scripttir.

```bash
#!/usr/bin/env bash
set -e

# KÖK MONOREPO DEPLOY SCRİPTİ (scripts/deploy.sh)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🚀 [DEPLOY] Monorepo Dağıtım İşlemi Başlatılıyor..."

# 1. Git Güncellemesi
BRANCH="${1:-main}"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# 2. Monorepo Bağımlılıkları
npm ci --prefer-offline --no-audit

# 3. Veritabanı Şemaları & Migration Build
if [ -f "scripts/build-schema.js" ]; then
  node scripts/build-schema.js
fi

# 4. Frontend Build (React SPA / Astro)
if [ -d "pdf-web-app" ]; then
  (cd pdf-web-app && npm run build)
fi

# 5. Tüm Servislerin PM2 ile Kesintisiz Restart Edilmesi
if command -v pm2 &> /dev/null; then
  for service_dir in services/*/; do
    if [ -f "${service_dir}ecosystem.config.js" ]; then
      (cd "$service_dir" && pm2 reload ecosystem.config.js --env production || pm2 start ecosystem.config.js --env production)
    fi
  done
  pm2 save
  pm2 status
fi

echo "✅ [SUCCESS] Tüm monorepo başarıyla canlıya alındı!"
```

#### 7.1.3 Dağıtım Kuralları & İpuçları
- **NPM Script Kısayolu**: Kök `package.json` ve servis `package.json` dosyalarına `"deploy"` scripti eklenmiştir. Tek bir `npm run deploy` komutu ile tüm dağıtım süreci tetiklenebilir.
- **İzin Yönetimi**: Script'lerin çalıştırılabilir olması için repo içinde `chmod +x scripts/deploy.sh` ve `chmod +x services/*/deploy.sh` yapılmalıdır.
- **Sunucu & Cloudflare Entegrasyonu**: Sunucuda Cloudflare Tunnel / Nginx arkasında çalışan PM2 süreçleri `pm2 reload` komutuyla Socket/HTTP bağlantılarını düşürmeden sırayla yeni koda geçer.
- **CI/CD Entegrasyonu**: GitHub Actions veya GitLab CI uzerinden sunucuya SSH bağlantısı ile `npm run deploy` veya `bash scripts/deploy.sh main` tetiklenebilir.

---

## 8. docker-compose.e2e.yml — Orkestrasyon

`docker-compose.e2e.yml`, e2e test ortamı için **14 servisi** (PostgreSQL, Redis, 10 mikroservis + gateway) tek komutla ayağa kaldırır. Bu, prod'daki PM2 tabanlı çalıştırma (`ecosystem.config.js`) modelinden farklıdır:

- **Prod**: Her servis kendi sunucusunda/container'ında PM2 ile process olarak yönetilir, `deploy.sh` ile dağıtılır.
- **E2E**: Tüm sistem (DB + Redis + tüm servisler + gateway) tek bir Docker Compose ağı içinde, izole ve tekrar üretilebilir şekilde ayağa kalkar — testler gerçek servisler arası HTTP/Redis iletişimini kullanır, mock'lanmaz.

`Dockerfile.e2e` bu imajın nasıl build edildiğini tanımlar; `.dockerignore` host'taki `node_modules`'ın (native modüller macOS/Linux uyumsuzluğu yaratabileceği için) image'a girmesini engeller.

**Neden e2e için ayrı bir orkestrasyon dosyası, prod config'i yeniden kullanılmıyor**: E2E ortamının amacı "gerçek sisteme en yakın ama tamamen izole ve sıfırdan kurulabilir" bir ortam olmaktır — CI'da veya yerelde sıfırdan `docker compose up` ile aynı sonucu almak. Prod'un PM2/sunucu bağımlılıkları bu tekrar-üretilebilirliği bozardı.

---

## 9. Test Stratejisi

İki paralel test sistemi var, farklı amaçlarla:

### 9.1 `test/` — Jest, servis-seviyesi

```
test/
├── config/                    # db-client, db-setup/teardown, test-server — paylaşılan test altyapısı
└── services/
    └── service-<X>/
        ├── unit/                # Framework'süz, saf fonksiyon testleri (domain/application katmanı)
        ├── integration/          # Gerçek DB'ye karşı test (repository katmanı)
        ├── e2e/                  # Servisin kendi HTTP arayüzünü uçtan uca test etme (ama tarayıcısız)
        ├── custom/                # Servise özel, standart kategorilere uymayan testler
        └── configs/
```

Kök `package.json`'daki script'ler bu ayrımı yansıtır: `test:unit`, `test:integration`, `test:e2e` (hepsi `test/services/*/...` pattern'iyle Jest'i hedefler), `test:packages` (paylaşılan paketlerin kendi `__tests__`'leri).

**Neden unit/integration/e2e üç ayrı klasör**: Her kategori farklı hızda çalışır ve farklı sıklıkta koşulur — unit testler DB'siz saniyeler içinde koşar (her commit'te), integration testler gerçek DB ister (daha yavaş), servis-e2e testleri tüm HTTP zincirini test eder. Bu ayrım, "hızlı geri bildirim" ile "gerçekçilik" arasındaki tradeoff'u açıkça yönetir.

### 9.2 `e2e/` — Playwright, tarayıcı-üzerinden UI akışları

```
e2e/
├── playwright.config.js
├── run.js                      # Docker imajı kontrolü, gateway'i bekleme, ana çalıştırıcı
├── fixtures/                    # Örnek dosyalar (SAMPLE_PDF vb.)
├── helpers/                      # api-client, setup-user, ui-* (RFQ, bid, award, document, comparison...)
└── tests/                         # *.spec.js — her biri bir kullanıcı akışı
```

`e2e/` klasörü, `tropiq-web-app` (gerçek React uygulaması) üzerinden gerçek bir tarayıcıda (Playwright) uçtan uca kullanıcı akışlarını test eder — "RFQ oluştur → teklif ver → karşılaştır → ödül ver → kabul et" gibi çok-aktörlü senaryolar. `test/services/*/e2e` servis HTTP arayüzünü test ederken, kök `e2e/` **tarayıcıda gerçek kullanıcı deneyimini** test eder.

**Neden bu ikisi ayrı, birleştirilmedi**: Amaçları farklı katmanları doğrulamak. `test/services/*/e2e` "bu servisin API'si doğru çalışıyor mu" sorusuna cevap verirken, kök `e2e/` "gerçek kullanıcı bu akışı tarayıcıda sorunsuz tamamlayabiliyor mu" sorusuna cevap verir (frontend state yönetimi, form validasyonu, UI geri bildirimleri dahil). `docker-compose.e2e.yml` bu iki test tipinin de aynı altyapı üzerinde çalışmasını sağlar.

---

## 10. tropiq-web-app — Frontend Mimarisi

### 10.1 Teknoloji yığını ve neden seçildi

React 19 + Vite (SWC derleyici), **saf JavaScript/JSX — TypeScript kasıtlı olarak kullanılmıyor**. React Router v7 (client-side routing). State yönetimi ikiye bölünmüş: Zustand (client/UI state) + React Query v5 (server state) — bu ayrım aşağıda detaylandırılıyor. MUI v7, ama doğrudan değil bir wrapper katmanı üzerinden. SCSS Modules (component-scoped stil). react-i18next (EN+TR). React Hook Form. AG Grid Enterprise (veri tabloları) ve ECharts (grafikler). Axios, token-refresh interceptor'larıyla.

### 10.2 Dizin yapısı ve sorumluluklar

```
src/
├── api/            # Her backend servisi için bir API modülü (entity, iam, rfq, bid, award, ...)
├── components/     # Global, tekrar kullanılabilir MUI wrapper componentleri (MuiButton, MuiSelect, ...)
├── container/      # App seviyesi Provider ağacı kurulumu
├── features/       # Domain modülleri: rfq, bid, award, document, iam, entity, meter, subscription, ...
│   └── <domain>/
│       ├── components/  # O domain'e özel UI
│       ├── forms/         # React Hook Form şemaları + sabitler
│       ├── hooks/          # React Query hook'ları (useGetX, usePostX, ...)
│       ├── store/           # Domain'e özel Zustand store (varsa)
│       └── utils/            # Domain'e özel saf yardımcı fonksiyonlar
├── hooks/          # Global custom hook'lar (useApiMutation, useCountdown, ...)
├── layouts/        # Sayfa iskeletleri (Main, Page)
├── pages/          # Route-seviyesi, ince "sayfa" component'leri
├── router/
│   ├── routes/       # public/protected/error route tanımları
│   └── routeUtils/    # ProtectedRoute, RoleProtectedRoute, PermissionProtectedRoute, RoleHomeRedirect
├── shared/
│   ├── auth/          # permissions, route-permissions
│   ├── axios/          # Refresh interceptor'lı axios instance
│   ├── constant/        # API path'leri, route path'leri, query key'ler
│   ├── providers/        # QueryProvider, ThemeProvider, NotificationProvider
│   ├── translation/       # i18n setup + locale dosyaları
│   └── utils/              # Genel saf yardımcılar
├── store/          # Global Zustand store'lar (auth, theme, app, ui, grid, modal, graph)
└── styles/         # Global SCSS: tokens, reset, mixin, utility
```

**Neden `pages/` ile `features/*/components/` ayrı**: `pages/` route'un karşılık geldiği en üst seviye component'tir ve genellikle ince kalır (layout + feature component'lerini bir araya getirir). Asıl iş mantığı ve UI detayı `features/<domain>/` altında yaşar. Bu ayrım, bir "sayfayı" değiştirmeden bir "özelliği" başka bir sayfada tekrar kullanabilmeyi sağlar (örn. `RfqWizard` component'i hem `pages/rfq` hem farklı bir akışta kullanılabilir).

### 10.3 Dinamik registry deseni

`components/index.jsx` ve `api/index.jsx`, Vite'ın `import.meta.glob()` özelliğiyle klasörlerindeki tüm modülleri otomatik olarak tek bir obje altında toplar:

```js
const modules = import.meta.glob('./**/*.{js,jsx}', { eager: true });
// her dosya adını key, default export'u value yapan bir registry obje üretir
```

Kullanım kuralı: birden fazla shared component gerektiğinde registry (`import Components from '@components'; const { MuiButton, MuiSelect } = Components;`), sadece 1-2 component gerektiğinde direkt import (`import MuiButton from '@components/MuiButton/MuiButton'`) tercih edilir.

**Neden iki farklı import stili bir arada var, tek bir stile zorlanmadı**: Registry, çok sayıda shared component kullanan dosyalarda import bloğunu kısaltır ve okunabilirliği artırır; ama tree-shaking'i zorlaştırır ve tek component ihtiyacında gereksiz bir dolaylama katmanı ekler. İkisinin bir arada var olması bilinçli bir "duruma göre seç" kararı — `.cursor/rules/components-registry-vs-direct-imports.mdc` bu kararı AI ajanlarına da açıkça belirtir.

### 10.4 State yönetimi: Zustand (client) + React Query (server)

- **Zustand store'ları** (`store/`): `useAuthStore`, `useThemeStore` (localStorage'a persist edilir), `useAppStore` (slice pattern — `userSlice`, `refreshSlice` gibi parçalardan `create()` ile birleştirilir), `useUiStore`, `useGridStore`, `useModalStore`, `useGraphStore`. Bunlar sadece **client/UI state**'i tutar — sunucudan gelen veri burada tutulmaz.
- **React Query** (`features/*/hooks/`): Tüm sunucu verisi (API'den gelen liste/detay/mutation sonucu) React Query üzerinden yönetilir. `QueryProvider` varsayılanları: `retry: false`, `refetchOnWindowFocus: false`. Query key'ler stabil array formatında (`['feature', 'action', params]`).

**Neden bu ikili ayrım, hepsi tek bir state yönetimine (örn. sadece Redux ya da sadece Zustand) toplanmadı**: Sunucu verisi ile client state'in yaşam döngüleri temelde farklıdır — sunucu verisi cache/invalidation/refetch ister (React Query'nin tam olarak çözdüğü problem), client state (tema, modal açık/kapalı, seçili grid satırı) böyle bir ihtiyaç duymaz. İkisini aynı store'da yönetmek, React Query'nin sağladığı cache/senkronizasyon avantajlarını manuel olarak yeniden yazmaya zorlardı.

Selector zorunluluğu: `useAuthStore((state) => state.isLoggedIn)` — tüm store'u değil sadece ihtiyaç duyulan alanı seçmek gereksiz re-render'ları önler. React dışından erişim gerektiğinde (örn. axios interceptor içinde) `useXStore.getState()` kullanılır.

### 10.5 Container/Bootstrap deseni

`container/Container.jsx`, tüm Provider'ları belirli bir sırayla iç içe geçirir:

```
ThemeProvider → NotificationProvider → QueryProvider → BrowserRouter → AuthBootstrap → children
```

`container/AuthBootstrap.jsx`, uygulama açılışında **hydration-then-verify** deseni uygular: Zustand'ın persist edilmiş auth state'i localStorage'dan yüklenmesini (`hydration`) bekler, sonra `/me` endpoint'ine giderek bu state'in hâlâ geçerli (cookie/session hâlâ aktif) olduğunu doğrular. 8 saniyelik bir timeout, ağ yavaşsa veya gateway çökmüşse kullanıcıyı sonsuza kadar bloklamadan `unauthenticated` durumuna düşürür.

**Neden bu sıralama ve bu timeout mantığı**: Persist edilmiş state'e körü körüne güvenmek (doğrulamadan) güvenlik açığı olurdu (cookie süresi dolmuş olabilir); doğrulamayı beklemeden UI'ı bloklamak da kötü UX olurdu. Hydration-then-verify + timeout-fallback, "hızlı ilk render" ile "güvenlik doğrulaması" arasındaki tradeoff'u yönetir.

### 10.6 Routing ve RBAC

`router/routes/{public,protected,error}Routes.jsx` route tanımlarını tutar; `router/routeUtils/` altında `ProtectedRoute` (sadece `isLoggedIn` kontrolü), `RoleProtectedRoute` (rol bazlı erişim), `PermissionProtectedRoute` (ince taneli izin kontrolü) ve `RoleHomeRedirect` (kullanıcı rolüne göre ana sayfaya yönlendirme) bulunur. Route path sabitleri `shared/constant/route-paths.js`'te merkezi tutulur.

**Neden üç farklı "Protected" route bileşeni var, tek bir generic'e indirgenmedi**: Yetkilendirme üç farklı granülaritede kontrol gerektirir — "giriş yapmış mı", "belirli bir rolde mi", "belirli bir izne sahip mi". Bunları tek bir bileşende birleştirmek, her route'un ihtiyaç duyduğu kontrol seviyesini prop'larla karmaşıklaştırırdı; ayrı bileşenler her kullanım noktasında niyeti (intent) daha açık okunur kılar.

### 10.7 Path alias sistemi

`jsconfig.json`, `@api`, `@components`, `@features`, `@hooks`, `@layouts`, `@pages`, `@router`, `@shared`, `@store`, `@styles`, `@assets`, `@container` alias'larını tanımlar. Import sırası konvansiyonu: 1) third-party paketler, 2) `@alias` importları, 3) relative importlar, 4) stil dosyaları (en son).

**Neden relative path yerine alias**: `../../../shared/utils/common` gibi derin relative path'ler, bir dosya taşındığında kırılgandır ve okunması zordur. Alias'lar dosyanın nerede olduğundan bağımsız, kararlı bir import yolu sağlar.

### 10.8 Styling stratejisi

Component-seviyesi stil her zaman `ComponentName.module.scss` olarak component'in yanında yaşar, `styles` adıyla import edilir. Global SCSS sadece `src/styles/` altında (`_colors`, `_typography`, `_spacing`, `_mixins`, `_shadows`, `_animations`, `_utilities`, `_ui`, `globalStyles.css`, `index.scss`) ve sadece token/reset/utility/kütüphane-override amaçlı — tek bir component için yeni bir global stylesheet açılmaz. Koşullu class birleştirme için `classnames` paketi kullanılır.

MUI wrapper zorunluluğu: Ham `<Button>` yerine her zaman `<MuiButton>` (ve benzerleri `MuiSelect`, `MuiTextInput`, `MuiCheckbox`, `MuiSwitch`, `MuiComboBox`, vb.) kullanılır. Bu wrapper'lar stil ve prop tutarlılığını (`size: lg|md|sm|xs`, `variant`, `infoLabel`, ikon prop'ları) merkezi tutar.

**Neden ham MUI değil wrapper**: Ham MUI component'lerini her yerde doğrudan kullanmak, stil/davranış tutarlılığını her kullanım noktasına dağıtır — bir tasarım kararı değiştiğinde (örn. tüm butonların köşe yuvarlaklığı) yüzlerce yeri değil, tek bir wrapper dosyasını değiştirmek yeterli olur.

### 10.9 i18n zorunluluğu

Tüm kullanıcıya görünen metin `useTranslation()` üzerinden `t('key')` ile çağrılır, hiçbir UI string'i hardcode edilmez. Locale dosyaları `shared/translation/locales.js` ve `shared/translation/keys/` altında EN+TR olarak tutulur.

### 10.10 `.cursor/rules/*.mdc` — AI-ajanı davranış kuralları katmanı

Bu, `.wolf/cerebrum.md`'nin (bkz. Bölüm 11) **Cursor editörü için paralel karşılığıdır**. Her `.mdc` dosyası, belirli bir glob pattern'inde otomatik olarak Cursor'a enjekte edilen bir kural setidir:

| Dosya                                         | Kapsam                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core-js-formatting.mdc`                    | JS-only zorunluluğu (TS yasak), Prettier hizası (tek tırnak, noktalı virgül)                                                                                               |
| `imports-aliases-order.mdc`                 | Alias tercihi + import gruplama sırası                                                                                                                                        |
| `components-registry-vs-direct-imports.mdc` | Registry vs. direkt import ne zaman kullanılır (bkz. 10.3)                                                                                                                    |
| `react-components-default-export.mdc`       | Function component + default export konvansiyonu                                                                                                                                |
| `mui-wrapper-components.mdc`                | Ham MUI yerine wrapper zorunluluğu (bkz. 10.8)                                                                                                                                 |
| `zustand-store-patterns.mdc`                | Selector zorunluluğu, slice pattern,`getState()` kullanımı (bkz. 10.4)                                                                                                     |
| `react-query-patterns.mdc`                  | QueryProvider varsayılanları, query key formatı, mutation+invalidation                                                                                                       |
| `scss-modules-conventions.mdc`              | SCSS module tercihi, global stil sınırları (bkz. 10.8)                                                                                                                       |
| `i18n-translation-usage.mdc`                | `t()` zorunluluğu (bkz. 10.9)                                                                                                                                                |
| `karpathy-guidelines.mdc`                   | LLM'lerin genel davranış kalıpları: aşırı mühendislik yapmama, cerrahi (minimal) değişiklik, varsayım yerine soru sorma, doğrulanabilir başarı kriteri tanımlama |
| `js-scss-modules.mdc`                       | Deprecated — yukarıdaki dört kurala bölündüğü için sadece referans kırılmasın diye tutulan boş yönlendirme dosyası                                               |

**Neden proje-özel `CLAUDE.md` yanında ayrı `.mdc` dosyaları var, tek bir dosyada birleştirilmedi**: Cursor editörü glob-bazlı otomatik kural enjeksiyonu yapar (bir dosya açıldığında sadece o dosya tipine uyan `.mdc` kuralları context'e eklenir), Claude Code ise `CLAUDE.md`'yi bütün olarak okur. İki farklı AI aracının farklı yükleme mekanizmaları olduğu için, aynı konvansiyon bilgisi iki paralel formatta tutulur — biri "tamamı her zaman yüklü" (`CLAUDE.md`), diğeri "sadece ilgili dosya tipinde yüklü" (`.mdc` + glob).

### 10.11 Alt-proje seviyesinde kendi `CLAUDE.md`'si

`tropiq-web-app/CLAUDE.md`, kök `CLAUDE.md`'nin (OpenWolf yönlendirmesi) yanında, bu alt-uygulamaya özel derinlemesine bir referans içerir: komutlar, teknoloji yığını, dizin yapısı, state/routing/styling konvansiyonları — tam olarak bu bölümün (10) özet hali. **Neden**: Kök `CLAUDE.md` tüm monorepo için genel kalmalı; her alt-uygulamanın (frontend, her servis) kendi teknoloji yığınına özel derin bilgiyi kendi `CLAUDE.md`'sinde tutması, AI ajanının o alt-projede çalışırken sadece ilgili bağlamı okumasını sağlar — kök dosyayı şişirmez.

---

## 11. .wolf/ — AI/OpenWolf Katmanı

`.wolf/`, bu projede AI ajanlarının (özellikle Claude Code) oturumlar arası **kalıcı hafıza ve otomatik davranış** katmanıdır. Statik bir dosya deposu değil — `.claude/settings.json`'a bağlı hook'larla **aktif olarak** çalışan bir sistemdir.

### 11.1 Dosyaların amacı

| Dosya/Klasör                                                       | Amaç                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENWOLF.md`                                                     | Operasyon protokolü — her oturumda AI'nın uyması gereken kurallar (dosya okumadan önce anatomy kontrolü, kod yazmadan önce cerebrum kontrolü, bug logging eşiği, vb.). Kök`CLAUDE.md`'den `@.wolf/OPENWOLF.md` ile import edilir.     |
| `anatomy.md`                                                      | Projedeki her dosya için 2-3 satırlık açıklama + tahmini token maliyeti. AI, bir dosyayı tam okumadan önce buradaki özetin yeterli olup olmadığına bakar — yeterliyse dosyayı hiç okumaz.                                              |
| `cerebrum.md`                                                     | Oturumlar arası öğrenilen kalıcı bilgi:`User Preferences` (kullanıcının tarzı/tercihleri), `Key Learnings` (proje konvansiyonları), `Do-Not-Repeat` (tarihli, geçmiş hatalar), `Decision Log` (mimari kararlar ve gerekçeleri). |
| `buglog.json`                                                     | Yapılandırılmış (JSON) hata/düzeltme geçmişi — her girişte`error_message`, `root_cause`, `fix`, `tags`, `occurrences` alanları. JSON olması, otomatik arama/eşleştirme (bkz. 11.2) ve script'lerle işlenebilirlik için.    |
| `memory.md`                                                       | Oturum bazlı, insan-okunur eylem günlüğü (`                                                                                                                                                                                                     |
| `config.json`                                                     | OpenWolf'un tüm alt-sistemlerinin ayarları: anatomy tarama sıklığı/hariç-tutma pattern'leri, token audit eşikleri, cron ayarları, cerebrum max-token limiti, dashboard/daemon portları, designqc viewport'ları.                           |
| `cron-manifest.json` / `cron-state.json`                        | Zamanlanmış bakım görevleri (örn.`anatomy-rescan` — 6 saatte bir tam anatomy taraması) ve bunların çalışma durumu.                                                                                                                      |
| `token-ledger.json`                                               | Oturum başına ve yaşam boyu token kullanım/tasarruf istatistikleri (anatomy hit/miss, tekrar-okuma engelleme sayısı, tahmini tasarruf).                                                                                                        |
| `designqc-report.json`                                            | `openwolf designqc` komutunun ürettiği UI/tasarım denetim raporu.                                                                                                                                                                               |
| `reframe-frameworks.md`                                           | UI framework değiştirme/seçme kararları için bilgi tabanı ve karar soruları.                                                                                                                                                                  |
| `hooks/`                                                          | Claude Code'un tool çağrılarına otomatik müdahale eden çalıştırılabilir script'ler — bkz. 11.2.                                                                                                                                           |
| `identity.md`, `backups/`, `suggestions.json`, `daemon.log` | Yardımcı/ikincil dosyalar: proje kimliği notu, anatomy/cerebrum'un otomatik yedekleri, AI'nın kendine ürettiği öneriler, arka plan daemon log'u.                                                                                              |

### 11.2 Hook mekanizması — `.wolf/`'u pasif değil aktif yapan katman

`.claude/settings.json`, Claude Code'un yerleşik hook sistemine (`SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`) `.wolf/hooks/*.js` script'lerini bağlar:

```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "", "hooks": [{ "command": "node \"$CLAUDE_PROJECT_DIR/.wolf/hooks/session-start.js\"" }] }],
    "PreToolUse": [
      { "matcher": "Read", "hooks": [{ "command": "node .../pre-read.js" }] },
      { "matcher": "Write|Edit|MultiEdit", "hooks": [{ "command": "node .../pre-write.js" }] }
    ],
    "PostToolUse": [
      { "matcher": "Read", "hooks": [{ "command": "node .../post-read.js" }] },
      { "matcher": "Write|Edit|MultiEdit", "hooks": [{ "command": "node .../post-write.js" }] }
    ],
    "Stop": [{ "matcher": "", "hooks": [{ "command": "node .../stop.js" }] }]
  }
}
```

Her script, Claude Code'dan stdin üzerinden JSON olarak tool girdisini alır ve stderr'e yazdığı mesajlar Claude'un bir sonraki turda görebileceği bir uyarı/bilgi haline gelir. Script'ler şunları yapar:

- **`session-start.js`**: Oturum başında `.wolf/*.tmp` artık dosyalarını temizler, taze bir `_session.json` oturum state'i oluşturur, `memory.md`'ye yeni bir oturum başlığı ekler. `cerebrum.md`'de 3'ten az kayıt varsa ya da 3+ gündür güncellenmemişse, `buglog.json` boşsa — bunları Claude'a stderr üzerinden hatırlatır. `token-ledger.json`'daki `total_sessions` sayacını artırır.
- **`pre-read.js`**: Bir `Read` çağrısından hemen önce çalışır. Dosya bu oturumda zaten okunduysa ("tekrar okumayı" önlemek için) uyarır. `anatomy.md`'de bu dosya için bir açıklama varsa onu stderr'e basar (böylece Claude tam dosyayı okumadan özeti görür). `.wolf/` içi dosyalar bu takipten muaf (kendi kendine referans döngüsünü önlemek için).
- **`post-read.js`**: Okuma sonrası, okunan dosyanın gerçek token maliyetini oturum state'ine kaydeder.
- **`pre-write.js`**: Bir `Write`/`Edit`/`MultiEdit`'ten hemen önce çalışır, iki kontrol yapar: (1) **Cerebrum Do-Not-Repeat taraması** — `cerebrum.md`'deki `Do-Not-Repeat` bölümünden çıkarılan yasaklı pattern'leri (tırnak içi ifadeler veya "never use X" kalıpları) yazılacak içerikte arar, eşleşirse uyarır; (2) **Buglog eşleştirmesi** — aynı dosya adına ait geçmiş bug kayıtlarını, edit içeriğiyle kelime/etiket örtüşmesine göre filtreleyip (en az 3 anlamlı kelime örtüşmesi ya da tag eşleşmesi) ilgili olanları "bilgi amaçlı, körü körüne uygulama" notuyla gösterir.
- **`post-write.js`**: Bir yazma işleminden hemen sonra çalışır, dört şey yapar: (1) `anatomy.md`'yi **atomically** (geçici dosya + rename) günceller — yeni/değişen dosya için açıklama ve tahmini token sayısı ekler; (2) `memory.md`'ye zengin bir satır ekler — `summarizeEdit()` fonksiyonu diff'i analiz edip "hata yönetimi eklendi", "3 sayısı → 5 oldu", "import eklendi", "CSS: color, padding" gibi insan-okunur bir özet üretir; (3) oturum state'inde dosya bazlı edit sayacı tutar, **aynı dosya 3+ kez edit edilirse** stderr'e "muhtemelen bug fix, buglog'a logla" uyarısı basar; (4) `detectFixPattern()` ile diff'i otomatik sınıflandırıp (`error-handling`, `null-safety`, `guard-clause`, `wrong-value`, `wrong-reference`, `logic-fix`, `operator-fix`, `missing-import`, `return-value`, `async-fix`, `type-fix`, `style-fix`, `refactor` kategorileri) eşleşen bir pattern varsa **`buglog.json`'a otomatik bir kayıt ekler** — Claude'un elle loglamayı unuttuğu durumlar için bir güvenlik ağı. `.env` dosyaları asla anatomy'ye işlenmez (secret koruması); `.wolf/` içi dosyalar bu hook'tan muaf.
- **`stop.js`**: Oturum sona ererken çalışır. O oturumda 3+ kez edit edilmiş ama `buglog.json`'a hiç yazılmamışsa uyarır; `cerebrum.md` 24+ saattir güncellenmemiş ve o oturumda 3+ yazma olmuşsa güncellemeyi hatırlatır; oturumun tam özetini (`reads`, `writes`, tahmini token toplamları, anatomy hit/miss, engellenen tekrar-okuma sayısı) `token-ledger.json`'a bir `sessions[]` girişi olarak ekler ve `memory.md`'ye kısa bir kapanış satırı yazar.

**Neden bu kadar ayrıntılı bir otomasyon, sadece `CLAUDE.md` talimatlarına güvenilmedi**: Salt talimat-tabanlı yaklaşımda ("her zaman anatomy'ye bak", "her bug'ı logla") AI'nın bu adımları unutması ya da atlaması mümkündür — talimatlar hatırlatma, hook'lar ise **zorunlu kılma**dır. Hook'lar Claude'un kendisinden bağımsız çalışan bir dış süreç olduğu için, disiplin AI'nın hafızasına değil, deterministik koda bağlanmış olur.

### 11.3 Bu hook mekanizmasının başka bir projeye taşınması

Bu otomasyonu yeni bir projede kurmak için sadece `.wolf/` klasörünü kopyalamak yetmez, iki parça birlikte taşınmalıdır:

1. `.wolf/hooks/*.js` script dosyaları (ve ortak yardımcı fonksiyonları barındıran `shared.js` — `getWolfDir`, `readJSON`/`writeJSON`, `parseAnatomy`/`serializeAnatomy`, `estimateTokens`, `readStdin`, `normalizePath` gibi fonksiyonlar).
2. `.claude/settings.json` içindeki `hooks` bloğunun (`SessionStart`/`PreToolUse`/`PostToolUse`/`Stop` eşlemeleri) hedef projeye kopyalanması — bu blok olmadan `.wolf/hooks/*.js` dosyaları hiçbir zaman tetiklenmez, sadece atıl script olarak kalır.

Ayrıca `.wolf/config.json`, `anatomy.md`'nin `exclude_patterns` listesini (node_modules, dist, build vb.) hedef projenin build çıktı klasörlerine göre güncellemek gerekir.

---

## 12. Yeni Bir Projede Kurma Rehberi

Bu bölüm, bir AI ajanının (veya senin) bu mimariyi sıfırdan başka bir repoda kurması için adım adım rehberdir.

### 12.1 Tam (çok-servisli) kurulum

1. Kök klasörleri oluştur: `core/`, `services/`, `packages/modules/`, `db-schemas/`, `test/`, `e2e/`, `docs/`.
2. `packages/modules/` altına en az şu paketleri kur: `config`, `errors`, `middlewares`, `helper` — bunlar her servisin ilk gün ihtiyaç duyacağı asgari altyapı.
3. Her yeni domain için: `core/service-<X>/src/{domain,application,infrastructure,interfaces}` iskeletini oluştur, ardından `services/tropiq-service-<X>/` altında `main.js → src/boot.js → src/container.js` üçlüsünü kur (bkz. Bölüm 3).
4. Servisler arası iletişim gerekiyorsa `packages/modules/service-discovery`'yi kur ve Redis'i orkestrasyona ekle (bkz. 4.1).
5. Birden fazla servisi tek bir giriş noktasından sunmak gerekiyorsa bir `*-gateway` servisi kur ve auth/session/CSRF sorumluluklarını **sadece orada** topla (bkz. Bölüm 5).
6. `db-schemas/` altında domain-başına numaralı SQL dosyaları + `migrations/` + bir `build-schema.js` scripti kur (bkz. Bölüm 6).
7. `test/services/<X>/{unit,integration,e2e}` iskeletini her servis için tekrarla (bkz. 9.1).
8. Frontend için Bölüm 10'daki dizin yapısını ve konvansiyonları uygula; alt-projeye özel bir `CLAUDE.md` yaz.
9. `docker-compose.e2e.yml` ile tüm servisleri + DB + Redis'i tek komutla ayağa kaldıran bir e2e orkestrasyonu kur.
10. Dağıtım otomasyonu için kök `scripts/deploy.sh` ve servis bazlı `services/*/deploy.sh` script'lerini kur, `chmod +x` yetkisi ver (bkz. Bölüm 7.1).
11. `.wolf/` klasörünü ve `.claude/settings.json` hook bloğunu taşı (bkz. 11.3), `config.json`'daki `exclude_patterns`'i projeye göre güncelle, boş `anatomy.md`/`cerebrum.md`/`buglog.json`/`memory.md` ile başlat.

### 12.2 Tek-servisli sadeleştirilmiş varyant

Eğer proje tek bir backend serviosiyle başlıyorsa (mikroservis mimarisi gerekmiyorsa):

- `core/` ve `services/` ayrımını **yine de koru** — tek servis olsa bile domain mantığını framework kabuğundan ayırmanın test edilebilirlik faydası kaybolmaz.
- `packages/modules/service-discovery`'yi **atla** — tek servis kendi kendini keşfetmez, gateway'e de gerek yoktur (servis doğrudan dışa açılabilir).
- Gateway'in auth/session/CSRF sorumluluklarını doğrudan tek servisin kendisine taşı.
- `db-schemas/` yine de tek bir servis için numaralı dosyalar halinde tutulabilir (gelecekte bölünme ihtimaline karşı) ya da tek bir `schema.sql` yeterli olabilir.
- `.wolf/` katmanı ölçekten bağımsız olarak aynı şekilde kurulur — AI-destekli geliştirme faydası proje büyüklüğüne bakmaksızın geçerlidir.

### 12.3 "AI klasörü" olarak `.wolf/` — minimum vs. tam kurulum

- **Minimum**: `OPENWOLF.md` (protokol) + `anatomy.md` + `cerebrum.md` + `buglog.json` + `memory.md`, kök `CLAUDE.md`'den `@.wolf/OPENWOLF.md` ile import edilsin. Hook'suz, sadece talimat-tabanlı — AI bu dosyaları kendi inisiyatifiyle günceller.
- **Tam**: Yukarıdakine ek olarak `hooks/` + `.claude/settings.json` hook bağlantısı + `config.json` + `cron-manifest.json` — otomatik/zorunlu kılınan bir sistem (bkz. 11.2-11.3).

Yeni bir projede önce minimum kurulumla başlamak, hook script'lerinin (özellikle `post-write.js`'teki `detectFixPattern` sezgisellerinin) zaman içinde projeye özel ihtiyaçlara göre ayarlanmasını beklemek makul bir yol olabilir; hook'lar jenerik oldukları için doğrudan taşınabilir, ama incelikleri (örn. hangi dosya uzantılarının "code" sayılacağı) hedef projenin diline göre gözden geçirilmelidir.
