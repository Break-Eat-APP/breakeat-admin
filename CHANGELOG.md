# CHANGELOG — BREAK EAT

Chaque entrée correspond à une session de travail ou une phase.
Format : fichiers créés (`+`), modifiés (`~`), supprimés (`-`).

---

## [0.10.3] — 2026-06-01 — Codex Audit Phase 5 (2e passe) : 3 P1 + 2 P2 fixes

### Contexte
Deuxième audit Codex après les corrections [0.10.2]. Les gros correctifs Phase 5 sont validés ; 3 P1 + 2 P2 bloquaient le passage à l'étape infra/design. Tout est corrigé ci-dessous.

### Modifié (P1 fixes)
~ backend/src/modules/cart/cart.service.ts :
    - **P1 #1 (snapshot prix écrit trop tôt)** — le freeze des prix se fait MAINTENANT après le succès Stripe, dans UNE transaction unique avec la bascule CHECKOUT_PENDING. Un échec Stripe laisse donc le cart OPEN, sans snapshot.
    - computeView() : garde défensive — tant que status === OPEN, on lit TOUJOURS le prix live (un snapshot résiduel ne peut plus fausser le total au retry).
~ backend/src/modules/cart/cart.service.spec.ts :
    - test renommé "freezes prices + transitions ONLY after Stripe succeeds"
    - + nouveau test "does NOT freeze/transition when Stripe fails" (régression P1 #1)
~ package.json :
    - **P1 #2 (pipeline cassé via corepack)** — build/lint/typecheck/test → `turbo run X`. turbo est dans node_modules/.bin (donc résolvable par corepack/pnpm), alors que `pnpm -r` appelé depuis un script ne l'était pas → c'était LA cause racine.
    - build:turbo supprimé (redondant), clean → `turbo run clean`
~ backend/package.json :
    - **P1 #2** — jest `maxWorkers: 1` → tests déterministes, plus de flakiness en parallèle, plus besoin de `--runInBand`
~ .gitignore :
    - **P1 #3 (sécurité)** — ignore explicite : firebase-app-distribution-key.json, firebase-adminsdk-*.json, **/google-services.json, **/GoogleService-Info.plist, service-account*.json, gcp-*.json, *.p8, *.p12, *.mobileprovision, *.cer, *.certSigningRequest, *.keystore, *.jks
    - PAS de `*.json` en bloc (package.json / tsconfig.json / vercel.json préservés)
    - + .claude/settings.local.json (config locale machine, ne doit pas être partagée)
~ BLOC_6_0_SETUP_GUIDE.md :
    - ligne 168 : fausse affirmation "`*.json` protège la clé Firebase" corrigée (la vérité : ignore nominatif + patterns ciblés, vérifier via `git status`)
    - **P2 (contradiction Vercel)** — build/install/output : source de vérité unique = `apps/*/vercel.json` ; le dashboard Vercel reste vide

### Ajouté
+ .gitattributes (normalisation LF pour les builds Linux Railway/Vercel ; binaires .docx/.pdf/.p8/etc. marqués binary)
+ **Repo git initialisé en local** (branche `main`) + commit initial `fbf6147` (P2 "pas de repo") — AUCUN remote, AUCUN push (attend que le product owner crée le repo GitHub)

### Vérifications
- **95 tests backend ✅** (12 suites, séquentiel ~16s, 0 flaky)
- `corepack pnpm typecheck` + `corepack pnpm lint` → **VERTS via les scripts** (la commande exacte que Codex disait cassée passe maintenant)
- turbo run typecheck/lint : 4/4 packages OK
- .gitignore vérifié via `git check-ignore` : 10 chemins sensibles ignorés, 0 fichier de config ignoré par erreur ; seul `.env.example` (placeholders) serait suivi

### Reste (hors P1, acté avec le product owner)
- P2 : push GitHub à faire (créer le repo distant, puis `git remote add` + push) avant import Vercel/Railway
- P2 : Phase 6 métier (OrderStatus state machine, realtime) pas commencée — vient après Bloc 6.0

---

## [0.10.2] — 2026-06-01 — Codex Audit Phase 5 : P1/P2/P3 fixes

### Ajouté
+ backend/prisma/migrations/20260601_phase5_codex_audit/migration.sql (cart_items.price_snapshot_cents + CHECK)
+ phases de DEV/PHASE_4_PRODUCTS_CATEGORIES_STOCK.docx
+ phases de DEV/PHASE_5_CART_CHECKOUT_STRIPE_ORDERS.docx
+ phases de DEV/generate_phase4.js
+ phases de DEV/generate_phase5.js

### Modifié (P1 fixes)
~ backend/prisma/schema.prisma (CartItem.priceSnapshotCents ajouté)
~ backend/src/modules/cart/cart.service.ts (freeze prix au checkout + use snapshot in computeView)
~ backend/src/modules/cart/cart.service.spec.ts (test "freezes prices on every CartItem" ajouté)
~ backend/src/modules/orders/orders.service.ts :
    - utilise priceSnapshotCents pour les snapshots OrderItem (P1 #2)
    - vérification défensive subtotal === intent.amount (P1 #2)
    - décrémentation atomique tx.stock.updateMany WHERE quantity >= item.quantity (P1 #1)
    - tx.payment.upsert au lieu de create (P1 #3 retry après FAILED)
~ backend/src/modules/orders/orders.service.spec.ts (+4 tests audit guards : no-snapshot, divergence, oversell, upsert)
~ backend/src/modules/payments/stripe.service.ts (P3 #7 — commentaire destination charges corrigé)
~ package.json (build: turbo → pnpm -r run, build:turbo conservé en backup)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md
~ CHANGELOG.md

### Résultat
- 94 tests backend ✅ (+5 nouveaux audit guards)
- Pipeline racine : typecheck + lint + build TOUS verts (4 packages chacun)
- 5 DOCX phases livrés (1, 2, 3, 4, 5)

---

## [0.10.1] — 2026-05-28 — Bloc 6.0 scaffolding (infrastructure)

### Ajouté
+ BLOC_6_0_SETUP_GUIDE.md (guide pas-à-pas pour le product owner : Vercel + Railway + Firebase + GitHub Secrets)
+ apps/admin/vercel.json (config monorepo Vercel)
+ apps/operator/vercel.json (config monorepo Vercel)
+ backend/railway.json (config Railway + healthcheck /health)
+ .github/workflows/deploy-frontends.yml (CI auto-deploy Vercel sur push main)
+ .github/workflows/mobile-preview.yml (placeholder Fastlane + Firebase, activé quand iOS/Android natifs initialisés)

### Modifié
~ backend/src/config/app.config.ts (demoMode + stagingToken)
~ .env.example (DEMO_MODE + STAGING_ONLY_TOKEN)
~ brain/REMINDERS.md (décisions infra actées : Vercel + Railway + Firebase + Fastlane)

### À faire (côté product owner — voir BLOC_6_0_SETUP_GUIDE.md)
- Étape 1 : créer projets Vercel admin + operator
- Étape 2 : créer projet Railway avec PostgreSQL + Redis
- Étape 3 : créer projet Firebase + App Distribution
- Étape 4 : configurer GitHub Secrets
- Étape 5 (optionnelle) : domaines custom

---

## [0.10.0] — 2026-05-28 — Process update: Visual Validation Contract

### Ajouté
+ brain/PRODUCT_VALIDATION.md (contrat v1.0.0 : visual validation, Storybook, preview builds, staging, fake data, demo mode, QR codes, approval flow)
+ brain/REMINDERS.md (notes internes assistant : Cursor timing, design inputs, infra à prévoir)

### Modifié
~ brain/ROADMAP.md (Visual Validation Rule ajoutée + deliverables Phase 6 + Phase 8 enrichis)
~ brain/TASK_SUMMARY.md (entrée process update)
~ CHANGELOG.md (cette entrée)

### Impact
- À partir de Phase 6 : tout deliverable frontend doit inclure screenshots + preview build + QR code
- Phase 6 enrichie : ajoute setup staging + Storybook + EAS Build + simulateur fake data
- Phases 1-5 exemptes (backend-only) — validation technique acceptée

---

## [0.9.0] — 2026-05-27 — Phase 5: Cart, Checkout, Stripe Connect, Orders

### Ajouté
+ backend/prisma/migrations/20260527_phase5_stripe_connect/migration.sql
+ backend/src/modules/payments/stripe.service.ts
+ backend/src/modules/payments/payments.module.ts
+ backend/src/modules/suppliers/dto/create-onboarding-link.dto.ts
+ backend/src/modules/cart/dto/create-cart.dto.ts
+ backend/src/modules/cart/dto/update-cart.dto.ts
+ backend/src/modules/cart/dto/add-cart-item.dto.ts
+ backend/src/modules/cart/dto/update-cart-item.dto.ts
+ backend/src/modules/cart/cart.service.ts
+ backend/src/modules/cart/cart.service.spec.ts (12 tests)
+ backend/src/modules/cart/cart.controller.ts
+ backend/src/modules/cart/cart.module.ts
+ backend/src/modules/orders/orders.service.ts
+ backend/src/modules/orders/orders.service.spec.ts (5 tests)
+ backend/src/modules/orders/orders.controller.ts
+ backend/src/modules/orders/orders.module.ts
+ backend/src/modules/webhooks/stripe-webhooks.controller.ts
+ backend/src/modules/webhooks/stripe-webhooks.service.ts
+ backend/src/modules/webhooks/stripe-webhooks.service.spec.ts (4 tests)
+ backend/src/modules/webhooks/webhooks.module.ts

### Modifié
~ backend/package.json (+stripe 17.7.0)
~ backend/prisma/schema.prisma (StripeAccountStatus, CartStatus, OrderStatus, PaymentStatus, OrderActorType enums; Cart, CartItem, Order, OrderItem, Payment, OrderAuditTrail, WebhookEvent models; Supplier extended with stripeAccountStatus + mirrors)
~ backend/src/main.ts (raw body for /webhooks/stripe; bodyParser disabled; prefix exclude webhooks)
~ backend/src/config/app.config.ts (stripe.apiVersion, platformFeeBps, connect.returnUrl/refreshUrl)
~ backend/src/app.module.ts (PaymentsModule, CartModule, OrdersModule, WebhooksModule)
~ backend/src/modules/suppliers/suppliers.service.ts (Stripe Connect onboarding + status refresh)
~ backend/src/modules/suppliers/suppliers.controller.ts (POST /stripe/onboarding-link, GET /stripe/status)
~ .env.example (STRIPE_API_VERSION, STRIPE_PLATFORM_FEE_BPS, STRIPE_CONNECT_RETURN_URL, STRIPE_CONNECT_REFRESH_URL)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md
~ CHANGELOG.md

---

## [0.8.0] — 2026-05-26 — Codex Audit Phase 4 : P1/P2/P3

### Ajouté
+ backend/src/modules/categories/categories.service.spec.ts (8 tests)

### Modifié
~ backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql (TEXT → UUID sur tous les IDs et FKs)
~ backend/src/modules/stock/stock.service.ts (BadRequestException import ; requirePickupPointInOrg vérifie supplier)
~ backend/src/modules/stock/stock.service.spec.ts (test cross-supplier pickup point ajouté)
~ backend/src/modules/products/products.service.ts (validateDateWindow() : availableUntil > availableFrom)
~ backend/src/modules/products/products.service.spec.ts (test date window invalide ajouté)
~ package.json (typecheck/lint : turbo → pnpm -r run)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ CHANGELOG.md

---

## [0.7.0] — 2026-05-26 — Codex Audit P1: globalRole + corepack

### Ajouté
+ .npmrc (package-manager-strict=false)

### Modifié
~ backend/src/modules/auth/strategies/jwt.strategy.ts (globalRole dans select + return { ...payload, globalRole: user.globalRole })
~ backend/src/modules/auth/strategies/jwt.strategy.spec.ts (test: DB globalRole écrase le JWT globalRole)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ CHANGELOG.md

---

## [0.6.0] — 2026-05-26 — Phase 4: Products, Categories, Stock

### Ajouté
+ backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql
+ backend/src/modules/categories/dto/create-category.dto.ts
+ backend/src/modules/categories/dto/update-category.dto.ts
+ backend/src/modules/categories/categories.service.ts
+ backend/src/modules/categories/categories.controller.ts
+ backend/src/modules/categories/categories.module.ts
+ backend/src/modules/products/dto/create-product.dto.ts
+ backend/src/modules/products/dto/update-product.dto.ts
+ backend/src/modules/products/products.service.ts
+ backend/src/modules/products/products.service.spec.ts
+ backend/src/modules/products/products.controller.ts
+ backend/src/modules/products/products.module.ts
+ backend/src/modules/stock/dto/create-stock.dto.ts
+ backend/src/modules/stock/dto/update-stock.dto.ts
+ backend/src/modules/stock/dto/update-stock-availability.dto.ts
+ backend/src/modules/stock/stock.service.ts
+ backend/src/modules/stock/stock.service.spec.ts
+ backend/src/modules/stock/stock.controller.ts
+ backend/src/modules/stock/stock.module.ts

### Modifié
~ backend/prisma/schema.prisma (enums CategoryStatus, ProductStatus ; modèles Category, Product, Stock ; relations Supplier + PickupPoint)
~ backend/src/app.module.ts (ajout CategoriesModule, ProductsModule, StockModule)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ CHANGELOG.md

---

## [0.5.0] — 2026-05-26 — Codex Audit Phase 2/3

### Ajouté
+ backend/src/modules/auth/strategies/jwt.strategy.spec.ts
+ backend/src/modules/organizations/organizations.service.spec.ts
+ backend/src/modules/pickup-points/pickup-points.service.spec.ts

### Modifié
~ turbo.json (test.dependsOn: [] — indépendant du build)
~ apps/mobile/package.json (lint: eslint src/, build: tsc --noEmit)
~ backend/src/common/helpers/require-org-access.ts (SUPER_ADMIN DB bypass)
~ backend/src/modules/organizations/organizations.service.ts (SUPER_ADMIN + NotFoundException targetUser)
~ backend/src/modules/organizations/organizations.controller.ts (user.globalRole passé)
~ backend/src/modules/auth/strategies/jwt.strategy.ts (async validate + isActive DB check)
~ backend/src/modules/pickup-points/pickup-points.service.ts (venueId === event.venueId)
~ backend/src/modules/suppliers/suppliers.service.ts (OrgRole.OPERATOR)
~ backend/src/modules/events/events.service.spec.ts (user mock ajouté)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md

---

## [0.4.0] — 2026-05-25 — Phase 3: Events, Venues, Suppliers

### Ajouté
+ backend/prisma/schema.prisma (enums: VenueStatus, EventStatus, SupplierStatus, PickupPointStatus ; modèles: Venue, Event, EventSupplier, Supplier, PickupPoint)
+ backend/prisma/migrations/20260525_phase3_events_venues_suppliers/migration.sql
+ backend/src/common/helpers/require-org-access.ts
+ backend/src/modules/venues/dto/create-venue.dto.ts
+ backend/src/modules/venues/dto/update-venue.dto.ts
+ backend/src/modules/venues/venues.service.ts
+ backend/src/modules/venues/venues.controller.ts
+ backend/src/modules/venues/venues.module.ts
+ backend/src/modules/suppliers/dto/create-supplier.dto.ts
+ backend/src/modules/suppliers/dto/update-supplier.dto.ts
+ backend/src/modules/suppliers/dto/update-supplier-status.dto.ts
+ backend/src/modules/suppliers/suppliers.service.ts
+ backend/src/modules/suppliers/suppliers.controller.ts
+ backend/src/modules/suppliers/suppliers.module.ts
+ backend/src/modules/events/dto/create-event.dto.ts
+ backend/src/modules/events/dto/update-event.dto.ts
+ backend/src/modules/events/dto/update-event-status.dto.ts
+ backend/src/modules/events/dto/attach-supplier.dto.ts
+ backend/src/modules/events/events.service.ts
+ backend/src/modules/events/events.service.spec.ts
+ backend/src/modules/events/events.controller.ts
+ backend/src/modules/events/events.module.ts
+ backend/src/modules/pickup-points/dto/create-pickup-point.dto.ts
+ backend/src/modules/pickup-points/dto/update-pickup-point.dto.ts
+ backend/src/modules/pickup-points/pickup-points.service.ts
+ backend/src/modules/pickup-points/pickup-points.controller.ts
+ backend/src/modules/pickup-points/pickup-points.module.ts

### Modifié
~ backend/src/app.module.ts (ajout VenuesModule, SuppliersModule, EventsModule, PickupPointsModule)
~ brain/ENGINEERING_MANUAL.md (section Phase 3 ajoutée)
~ brain/TASK_SUMMARY.md (entrée Phase 3 ajoutée)
~ DEVELOPMENT_LOG.md (Phase 3 marquée terminée)
~ CHANGELOG.md (cette entrée)

---

## [0.3.0] — 2026-05-25 — Codex Audit Corrections

### Ajouté
+ apps/mobile/src/lib/config/env.ts
+ apps/mobile/src/types/globals.d.ts

### Modifié
~ apps/mobile/src/instrument.ts (process.env → ENV.*)
~ apps/mobile/src/lib/api/api-client.ts (process.env.API_URL → ENV.API_URL)
~ apps/admin/package.json (lint: next lint → eslint src/)
~ apps/operator/package.json (lint: next lint → eslint src/)
~ backend/src/modules/auth/auth.service.ts (import argon2 supprimé — unused)
~ backend/src/modules/organizations/dto/add-member.dto.ts (import IsString supprimé — unused)
~ backend/src/main.ts (setGlobalPrefix exclude health)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md

---

## [0.2.0] — 2026-05-25 — Phase 2: Auth + Organizations

### Ajouté
+ backend/prisma/schema.prisma (User, Organization, OrganizationMember, RefreshToken)
+ backend/prisma/migrations/20260525_phase2_auth_organizations/migration.sql
+ backend/src/database/prisma.service.ts
+ backend/src/database/prisma.module.ts
+ backend/src/common/enums/role.enum.ts
+ backend/src/common/decorators/current-user.decorator.ts
+ backend/src/common/decorators/roles.decorator.ts
+ backend/src/common/guards/jwt-auth.guard.ts
+ backend/src/common/guards/roles.guard.ts
+ backend/src/modules/users/users.service.ts
+ backend/src/modules/users/users.module.ts
+ backend/src/modules/auth/dto/register.dto.ts
+ backend/src/modules/auth/dto/login.dto.ts
+ backend/src/modules/auth/dto/refresh.dto.ts
+ backend/src/modules/auth/strategies/jwt.strategy.ts
+ backend/src/modules/auth/auth.service.ts
+ backend/src/modules/auth/auth.controller.ts
+ backend/src/modules/auth/auth.module.ts
+ backend/src/modules/auth/auth.service.spec.ts
+ backend/src/modules/organizations/dto/create-organization.dto.ts
+ backend/src/modules/organizations/dto/add-member.dto.ts
+ backend/src/modules/organizations/organizations.service.ts
+ backend/src/modules/organizations/organizations.controller.ts
+ backend/src/modules/organizations/organizations.module.ts

### Modifié
~ backend/package.json
~ backend/src/app.module.ts
~ pnpm-workspace.yaml
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md

---

## [0.1.0] — 2026-05-25 — Phase 1: Foundation

### Ajouté
+ package.json
+ pnpm-workspace.yaml
+ turbo.json
+ .prettierrc / .prettierignore
+ eslint.config.mjs
+ .gitignore
+ .env.example
+ docker-compose.yml
+ .github/workflows/ci.yml
+ DEVELOPMENT_LOG.md
+ backend/package.json + tsconfig + nest-cli.json
+ backend/src/main.ts
+ backend/src/instrument.ts
+ backend/src/app.module.ts
+ backend/src/config/app.config.ts
+ backend/src/health/health.module.ts
+ backend/src/health/health.controller.ts
+ backend/src/health/health.controller.spec.ts
+ apps/admin/ (Next.js 15 shell)
+ apps/operator/ (Next.js 15 shell + WebSocket stub)
+ apps/mobile/ (React Native CLI shell)
+ brain/ENGINEERING_MANUAL.md
+ brain/TASK_SUMMARY.md
