# BREAK EAT — Development Log

> Fichier de référence chronologique.
> Chaque phase, chaque bloc, chaque fichier important — dans l'ordre exact de création.
> Un développeur qui reprend le projet doit pouvoir lire ce fichier de haut en bas et comprendre l'ordre de construction complet.

---

## Comment lire ce fichier

- **Bloc** = unité de travail atomique (ex : "monorepo root", "backend NestJS", "mobile shell")
- **Phase** = ensemble de blocs qui livrent une fonctionnalité cohérente
- Chaque entrée contient : date, statut, fichiers créés, décisions prises, prochaine étape

---

## PHASE 0 — Source of Truth `/brain`

**Date :** 25/05/2026
**Statut :** ✅ Terminée

**Fichiers créés (manuellement par le product owner) :**
```
brain/PRODUCT_VISION.md
brain/ARCHITECTURE.md
brain/AGENTS.md
brain/DESIGN_SYSTEM.md
brain/DOMAIN_MODEL.md
brain/ORDER_STATE_MACHINE.md
brain/REALTIME_CONTRACTS.md
brain/FLAIX_CONTRACT.md
brain/ROADMAP.md
brain/TESTING_STRATEGY.md
brain/ENGINEERING_MANUAL.md
brain/TASK_SUMMARY.md
```

**Décision clé :** Tout le travail de code ne commence qu'après que ces fichiers existent et sont validés.

---

## PHASE 1 — Foundation

**Date de début :** 25/05/2026
**Statut :** ✅ Terminée
**Durée réelle :** 1 session

---

### BLOC 1.1 — Racine du monorepo

**Date :** 25/05/2026

**Décisions :**
- Turborepo pour l'orchestration des builds
- pnpm workspaces pour la gestion des dépendances
- ESLint flat config (eslint 9+)
- Prettier avec LF, single quotes, trailing commas

**Fichiers créés :**
```
package.json                  ← root workspace, scripts turbo
pnpm-workspace.yaml           ← déclare backend/ et apps/*
turbo.json                    ← pipeline build/dev/lint/typecheck/test
.prettierrc                   ← config formatage
.prettierignore
eslint.config.mjs             ← config lint TypeScript strict
.gitignore                    ← node_modules, dist, .env, RN builds
.env.example                  ← toutes les variables attendues documentées
```

---

### BLOC 1.2 — Backend NestJS

**Date :** 25/05/2026

**Décisions :**
- NestJS 11, TypeScript strict, `emitDecoratorMetadata: true`
- ConfigModule global — aucun module ne lit `process.env` directement
- Sentry importé en premier dans `main.ts` via `instrument.ts`
- Health endpoint sur `/health` (hors prefix `/api/v1`) — pas d'auth
- Validation pipe global préconfiguré pour les phases suivantes
- CORS configuré via variable d'environnement

**Fichiers créés :**
```
backend/package.json
backend/tsconfig.json          ← strict: true, paths @modules/@config/@common
backend/tsconfig.build.json
backend/nest-cli.json
backend/src/main.ts            ← bootstrap, CORS, ValidationPipe, prefix /api/v1
backend/src/instrument.ts      ← Sentry init (no-op si DSN absent)
backend/src/app.module.ts      ← imports ConfigModule + HealthModule
backend/src/config/app.config.ts  ← registerAs('app', ...) — toutes les vars
backend/src/health/health.module.ts
backend/src/health/health.controller.ts   ← GET /health → { status, timestamp, env, version }
backend/src/health/health.controller.spec.ts  ← 3 tests unitaires
```

**Point d'entrée :** `backend/src/main.ts:1`
**Health route :** `backend/src/health/health.controller.ts:26` (méthode `check()`)
**Config centralisée :** `backend/src/config/app.config.ts`

---

### BLOC 1.3 — App Admin (Next.js)

**Date :** 25/05/2026

**Décisions :**
- Next.js 15, App Router, TypeScript strict
- Port 3001 (backend = 3000, admin = 3001, operator = 3002)
- TanStack Query v5 avec QueryClient par session (SSR-safe)
- React Query Devtools en développement uniquement
- Shell vide — aucune page fonctionnelle

**Fichiers créés :**
```
apps/admin/package.json
apps/admin/tsconfig.json        ← strict, paths @/*
apps/admin/next.config.ts
apps/admin/src/app/layout.tsx   ← QueryProvider wrapping
apps/admin/src/app/page.tsx     ← placeholder
apps/admin/src/app/globals.css  ← reset minimal
apps/admin/src/providers/query-provider.tsx  ← QueryClient + Devtools
```

---

### BLOC 1.4 — App Operator (Next.js + WebSocket stub)

**Date :** 25/05/2026

**Décisions :**
- Même structure que admin, port 3002
- WebSocket client stub créé dès Phase 1 pour stabiliser le chemin d'import
- `SocketClient` définit le contrat (types, interface) — implémentation en Phase 6
- staleTime réduit à 10s (opérateur = plus sensible à la fraîcheur des données)

**Fichiers créés :**
```
apps/operator/package.json
apps/operator/tsconfig.json
apps/operator/next.config.ts
apps/operator/src/app/layout.tsx
apps/operator/src/app/page.tsx
apps/operator/src/app/globals.css
apps/operator/src/providers/query-provider.tsx
apps/operator/src/lib/realtime/socket-client.ts  ← stub Phase 6
```

**Contrat WebSocket (à implémenter Phase 6) :**
`apps/operator/src/lib/realtime/socket-client.ts` — types `SocketStatus`, `RealtimeEvent`, classe `SocketClient`

---

### BLOC 1.5 — App Mobile (React Native CLI)

**Date :** 25/05/2026

**Décisions :**
- React Native 0.79.2, TypeScript strict
- React Navigation Native Stack (pas Expo Router)
- Zustand v5 — store par slice, pas de logique métier dans les stores
- TanStack Query avec `refetchOnWindowFocus: false` (pas pertinent mobile)
- Retry delay exponentiel (max 30s) pour réseau mobile instable
- Sentry importé en premier dans `App.tsx` via `src/instrument.ts`
- API client centralisé dans `src/lib/api/api-client.ts`

**Fichiers créés :**
```
apps/mobile/package.json
apps/mobile/tsconfig.json       ← paths @navigation/@screens/@store/@lib/@components
apps/mobile/babel.config.js
apps/mobile/app.json            ← name: BratEat
apps/mobile/index.js            ← AppRegistry
apps/mobile/App.tsx             ← QueryClientProvider + RootNavigator
apps/mobile/src/instrument.ts   ← Sentry init mobile
apps/mobile/src/navigation/root-navigator.tsx  ← NavigationContainer + Stack vide
apps/mobile/src/screens/placeholder.screen.tsx
apps/mobile/src/store/index.ts
apps/mobile/src/store/app.store.ts    ← isReady: boolean
apps/mobile/src/lib/query/query-client.ts  ← QueryClient configuré mobile
apps/mobile/src/lib/api/api-client.ts      ← fetch wrapper typé
```

**Note importante :** `android/` et `ios/` existent en tant que dossiers vides.
La génération des fichiers natifs nécessite l'exécution de `npx react-native init BratEat` localement avec les SDK Android/iOS installés. Ces dossiers seront peuplés lors du premier setup local.

---

### BLOC 1.6 — Infrastructure (Docker + CI)

**Date :** 25/05/2026

**Décisions :**
- PostgreSQL 16 Alpine (léger, stable)
- Redis 7 Alpine avec `--appendonly yes` (persistence des données entre restarts)
- Healthchecks Docker sur les deux services
- Volumes nommés (données persistent entre `docker-compose down/up`)
- CI GitHub Actions : lint → typecheck → test → build (séquencé avec `needs`)
- pnpm cache via `actions/setup-node` pour accélérer les runs

**Fichiers créés :**
```
docker-compose.yml              ← postgres:16 + redis:7, healthchecks, volumes
.github/workflows/ci.yml        ← lint / typecheck / test / build
```

**Ports locaux :**
| Service | Port |
|---|---|
| Backend NestJS | 3000 |
| Admin Next.js | 3001 |
| Operator Next.js | 3002 |
| PostgreSQL | 5432 |
| Redis | 6379 |

---

## PHASE 2 — Auth + Organizations

**Date :** 25/05/2026
**Statut :** ✅ Terminée
**Durée réelle :** 1 session

---

### BLOC 2.1 — Dépendances + Prisma schema

**Date :** 25/05/2026

**Décisions :**
- ORM : Prisma 6 (meilleure DX, migrations SQL explicites, type-safety totale)
- Hachage password : argon2 (plus sécurisé que bcrypt, résistant aux GPU attacks)
- Refresh tokens : stockés en DB sous forme hachée (SHA-256), rotation à chaque usage
- Access token : 15 min (court pour limiter l'exposition)
- Refresh token : 7 jours (confort mobile)

**Fichiers créés :**
```
backend/prisma/schema.prisma         ← User, Organization, OrganizationMember, RefreshToken
backend/prisma/migrations/20260525_phase2_auth_organizations/migration.sql
```

**Entités créées :**
- `users` : id, email (unique), password_hash, display_name, phone?, global_role, is_active
- `organizations` : id, name, slug (unique), status, settings (JSONB)
- `organization_members` : userId + organizationId (unique pair) + orgRole
- `refresh_tokens` : userId, token_hash, expires_at

---

### BLOC 2.2 — PrismaService + Database module

**Date :** 25/05/2026

**Décisions :**
- `PrismaModule` est `@Global()` — PrismaService injecté partout sans re-import
- Connexion + déconnexion gérées par les hooks NestJS OnModuleInit/OnModuleDestroy

**Fichiers créés :**
```
backend/src/database/prisma.service.ts   ← étend PrismaClient, hooks NestJS
backend/src/database/prisma.module.ts    ← @Global(), exporte PrismaService
```

---

### BLOC 2.3 — Common (enums, guards, decorators)

**Date :** 25/05/2026

**Fichiers créés :**
```
backend/src/common/enums/role.enum.ts              ← GlobalRole + OrgRole (miroir Prisma)
backend/src/common/decorators/current-user.decorator.ts  ← @CurrentUser() → JwtPayload
backend/src/common/decorators/roles.decorator.ts   ← @Roles(GlobalRole.SUPER_ADMIN)
backend/src/common/guards/jwt-auth.guard.ts        ← étend AuthGuard('jwt')
backend/src/common/guards/roles.guard.ts           ← vérifie GlobalRole depuis le token
```

**Combinaison standard pour une route protégée :**
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.SUPER_ADMIN)
```

---

### BLOC 2.4 — Users module

**Date :** 25/05/2026

**Décisions :**
- `passwordHash` jamais retourné hors du service (méthode `toSafeUser()`)
- `findByEmailWithPassword()` retourne null (pas d'exception) — AuthService gère la logique
- Validation password déléguée à `argon2.verify()`

**Fichiers créés :**
```
backend/src/modules/users/users.service.ts   ← create, findById, findByEmailWithPassword, validatePassword
backend/src/modules/users/users.module.ts
```

---

### BLOC 2.5 — Auth module

**Date :** 25/05/2026

**Endpoints créés :**
- `POST /api/v1/auth/register` → { user, accessToken, refreshToken }
- `POST /api/v1/auth/login`    → { user, accessToken, refreshToken }
- `POST /api/v1/auth/refresh`  → { accessToken, refreshToken }
- `POST /api/v1/auth/logout`   → 204 No Content
- `GET  /api/v1/auth/me`       → SafeUser (JWT requis)

**Sécurité :**
- Login : même erreur "Invalid credentials" pour email inconnu ET mauvais mot de passe
- Refresh token : rotation systématique (ancien supprimé, nouveau émis)
- Logout : idempotent (pas d'erreur si token introuvable)

**Fichiers créés :**
```
backend/src/modules/auth/dto/register.dto.ts
backend/src/modules/auth/dto/login.dto.ts
backend/src/modules/auth/dto/refresh.dto.ts
backend/src/modules/auth/strategies/jwt.strategy.ts  ← ExtractJwt.fromAuthHeaderAsBearerToken
backend/src/modules/auth/auth.service.ts              ← register, login, refresh, logout, me
backend/src/modules/auth/auth.controller.ts
backend/src/modules/auth/auth.module.ts
backend/src/modules/auth/auth.service.spec.ts         ← 6 tests unitaires
```

**Référence code critique :**
- `auth.service.ts:94` → méthode `login()` — flux principal d'authentification
- `auth.service.ts:148` → méthode `generateTokens()` — création access + refresh token
- `auth.service.ts:160` → hashage du refresh token avant stockage DB

---

### BLOC 2.6 — Organizations module

**Date :** 25/05/2026

**Endpoints créés :**
- `POST /api/v1/organizations`                → crée une org + créateur devient ORG_ADMIN (transaction)
- `GET  /api/v1/organizations/:id`            → détail org (membres uniquement)
- `POST /api/v1/organizations/:id/members`    → ajoute un membre (ORG_ADMIN uniquement)

**Décisions :**
- Création dans une transaction Prisma : org + membership atomiques
- Vérification membership faite dans le service (pas le controller)
- Slug : lettres minuscules, chiffres, tirets uniquement

**Fichiers créés :**
```
backend/src/modules/organizations/dto/create-organization.dto.ts
backend/src/modules/organizations/dto/add-member.dto.ts
backend/src/modules/organizations/organizations.service.ts
backend/src/modules/organizations/organizations.controller.ts
backend/src/modules/organizations/organizations.module.ts
```

---

### BLOC 2.7 — Mise à jour AppModule

**Date :** 25/05/2026

**Modifications :**
```
backend/src/app.module.ts  ← ajout PrismaModule, UsersModule, AuthModule, OrganizationsModule
```

---

## Codex Audit Corrections

**Date :** 25/05/2026
**Statut :** ✅ Terminée

Corrections appliquées avant Phase 3 :

| Fix | Fichier(s) | Résultat |
|-----|-----------|---------|
| Mobile config typée | `apps/mobile/src/lib/config/env.ts` + `src/types/globals.d.ts` | typecheck ✓ |
| Health route exclusion | `backend/src/main.ts:27` | `/health` hors prefix ✓ |
| corepack + pnpm racine | Documenté ENGINEERING_MANUAL | setup docs ✓ |
| next lint → eslint src/ | `apps/admin/package.json` + `apps/operator/package.json` | lint ✓ |
| Builds vérifiés | Tous packages | 4/4 ✓ |
| Lint backend | `auth.service.ts` + `add-member.dto.ts` | 0 erreur ✓ |

**Résultat global :** `pnpm typecheck` → 4 packages, 0 erreur | `pnpm lint` → 4 packages, 0 erreur | 11 tests backend ✓

---

## PHASE 3 — Events, Venues, Suppliers

**Date :** 25/05/2026
**Statut :** ✅ Terminée
**Durée réelle :** 1 session

---

### BLOC 3.1 — Schéma Prisma Phase 3

**Date :** 25/05/2026

**Décisions :**
- EventStatus machine : DRAFT → ACTIVE | CANCELLED, ACTIVE → PAUSED | ENDED | CANCELLED, etc.
- SupplierStatus : OPEN / CLOSED / PAUSED / OFFLINE (indépendant du statut event)
- EventSupplier = table de jonction many-to-many avec @@unique([eventId, supplierId])
- PickupPoint peut être scoped à venue + event + supplier (tout optionnel sauf venue)
- stripeAccountId nullable — sera rempli Phase 5

**Fichiers créés :**
```
backend/prisma/schema.prisma         ← +4 enums, +5 modèles, Organization.relations mises à jour
backend/prisma/migrations/20260525_phase3_events_venues_suppliers/migration.sql
```

---

### BLOC 3.2 — Helper commun requireOrgAccess

**Date :** 25/05/2026

**Décisions :**
- Fonction standalone (pas un service) pour éviter les dépendances circulaires
- MANAGE_ROLES = [ORG_ADMIN, MANAGER] pour create/update
- ALL_ORG_ROLES = tous les rôles pour les lectures

**Fichiers créés :**
```
backend/src/common/helpers/require-org-access.ts
```

---

### BLOC 3.3 — VenuesModule

Routes : `GET/POST /organizations/:orgId/venues`, `GET/PATCH /organizations/:orgId/venues/:id`

```
backend/src/modules/venues/dto/create-venue.dto.ts
backend/src/modules/venues/dto/update-venue.dto.ts
backend/src/modules/venues/venues.service.ts
backend/src/modules/venues/venues.controller.ts
backend/src/modules/venues/venues.module.ts
```

---

### BLOC 3.4 — SuppliersModule

Routes : CRUD + `PATCH /suppliers/:id/status` (accessible OPERATOR aussi)

```
backend/src/modules/suppliers/dto/create-supplier.dto.ts
backend/src/modules/suppliers/dto/update-supplier.dto.ts
backend/src/modules/suppliers/dto/update-supplier-status.dto.ts
backend/src/modules/suppliers/suppliers.service.ts
backend/src/modules/suppliers/suppliers.controller.ts
backend/src/modules/suppliers/suppliers.module.ts
```

---

### BLOC 3.5 — EventsModule

Routes : CRUD + `PATCH /status` + `POST|DELETE /suppliers`

**Règles implémentées :**
- Venue doit appartenir à la même org
- endAt > startAt obligatoire
- guardFinalized() bloque ENDED/CANCELLED
- validateTransition() — matrice explicite des transitions

```
backend/src/modules/events/dto/*.ts (4 DTOs)
backend/src/modules/events/events.service.ts
backend/src/modules/events/events.service.spec.ts    ← 9 tests
backend/src/modules/events/events.controller.ts
backend/src/modules/events/events.module.ts
```

---

### BLOC 3.6 — PickupPointsModule

Routes : `GET/POST /organizations/:orgId/pickup-points` (filtres: venueId, eventId, supplierId), `PATCH /:id`

```
backend/src/modules/pickup-points/dto/create-pickup-point.dto.ts
backend/src/modules/pickup-points/dto/update-pickup-point.dto.ts
backend/src/modules/pickup-points/pickup-points.service.ts
backend/src/modules/pickup-points/pickup-points.controller.ts
backend/src/modules/pickup-points/pickup-points.module.ts
```

---

### BLOC 3.7 — AppModule + Docs

```
backend/src/app.module.ts  ← +VenuesModule, SuppliersModule, EventsModule, PickupPointsModule
CHANGELOG.md               ← créé (tracking modifications par session)
brain/ENGINEERING_MANUAL.md
brain/TASK_SUMMARY.md
```

**Résultat :** `pnpm test` → 20 tests | `pnpm build` → ✅ | `pnpm lint` → 4 packages ✅

---

## Codex Audit Corrections — Phase 2 & 3

**Date :** 25/05/2026
**Statut :** ✅ Terminée

Corrections de 6 problèmes de sécurité/robustesse identifiés après Phase 3 :

| Fix | Fichier(s) modifié(s) | Résultat |
|-----|----------------------|---------|
| Mobile lint `--ext` ESLint 9 + turbo test deps | `apps/mobile/package.json`, `turbo.json` | lint + test ✓ |
| SUPER_ADMIN bypass dans `requireOrgAccess` | `require-org-access.ts` | DB-checked bypass ✓ |
| SUPER_ADMIN dans `OrganizationsService` + NotFoundException targetUser | `organizations.service.ts`, `organizations.controller.ts` | tests 9/9 ✓ |
| JwtStrategy async + vérif `isActive` en DB | `jwt.strategy.ts` | 401 sur compte désactivé ✓ |
| PickupPoint : `event.venueId === dto.venueId` | `pickup-points.service.ts` | cohérence venue ✓ |
| `OrgRole.OPERATOR` (plus de cast string) | `suppliers.service.ts` | type-safe ✓ |

**Nouveaux fichiers de test :**
```
backend/src/modules/auth/strategies/jwt.strategy.spec.ts       ← 4 tests
backend/src/modules/organizations/organizations.service.spec.ts ← 9 tests
backend/src/modules/pickup-points/pickup-points.service.spec.ts ← 5 tests
```

**Résultat global :** 36 tests | 0 erreur typecheck | 0 erreur lint

---

## PHASE 4 — Products, Categories, Stock

**Date :** 26/05/2026
**Statut :** ✅ Terminée
**Durée réelle :** 1 session

---

### BLOC 4.1 — Schéma Prisma Phase 4

**Décisions :**
- Prix stocké en centimes (Int) — jamais Float pour l'argent. CHECK `price >= 0` en DB.
- Stock : deux types d'entrées via index partiels PostgreSQL (stock global = NULL pickup, stock par point)
- ON DELETE RESTRICT sur `products.category_id` — empêche la suppression d'une catégorie non vide
- ON DELETE CASCADE Product → Stock (un stock sans produit n'a aucun sens)

```
backend/prisma/schema.prisma  ← +enums CategoryStatus, ProductStatus ; +modèles Category, Product, Stock
backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql
```

---

### BLOC 4.2 — CategoriesModule

Routes : `GET/POST /organizations/:orgId/suppliers/:supplierId/categories`, `GET/PATCH/DELETE /:id`

```
backend/src/modules/categories/dto/create-category.dto.ts
backend/src/modules/categories/dto/update-category.dto.ts
backend/src/modules/categories/categories.service.ts
backend/src/modules/categories/categories.controller.ts
backend/src/modules/categories/categories.module.ts
```

---

### BLOC 4.3 — ProductsModule

Routes : `GET/POST /organizations/:orgId/suppliers/:supplierId/products`, `GET/PATCH/DELETE /:id`

Règle critique : `requireCategoryForSupplier()` — la category doit appartenir au même supplier que le produit.

```
backend/src/modules/products/dto/create-product.dto.ts
backend/src/modules/products/dto/update-product.dto.ts
backend/src/modules/products/products.service.ts
backend/src/modules/products/products.service.spec.ts   ← 8 tests
backend/src/modules/products/products.controller.ts
backend/src/modules/products/products.module.ts
```

---

### BLOC 4.4 — StockModule

Routes : `GET/POST /organizations/:orgId/stock`, `PATCH /:id`, `PATCH /:id/availability`

Règles critiques :
- quantity → 0 : `isAvailable` forcé à `false` automatiquement
- OPERATOR peut toggle `isAvailable` mais ne peut pas forcer `true` si `quantity = 0`

```
backend/src/modules/stock/dto/create-stock.dto.ts
backend/src/modules/stock/dto/update-stock.dto.ts
backend/src/modules/stock/dto/update-stock-availability.dto.ts
backend/src/modules/stock/stock.service.ts
backend/src/modules/stock/stock.service.spec.ts   ← 9 tests
backend/src/modules/stock/stock.controller.ts
backend/src/modules/stock/stock.module.ts
```

---

### BLOC 4.5 — AppModule + Docs

```
backend/src/app.module.ts  ← +CategoriesModule, ProductsModule, StockModule
brain/ENGINEERING_MANUAL.md
brain/TASK_SUMMARY.md
CHANGELOG.md
```

**Résultat :** `pnpm test` → 57 tests ✅ | `pnpm typecheck` → 0 erreur ✅ | `pnpm lint` → 0 erreur ✅

---

## Codex Audit Phase 5 — P1/P2/P3 Fixes (01/06/2026)

**Statut :** ✅ Terminée

| Fix | Fichier(s) | Impact |
|-----|-----------|--------|
| P1 #1 — Stock oversell | `orders.service.ts` (updateMany + gte) | Race-safe : rollback transaction si stock insuffisant |
| P1 #2 — Payment/Order amount divergence | `cart.service.ts` (priceSnapshotCents) + `orders.service.ts` (use snapshot + defensive check) | Order.totalCents = Payment.amountCents garanti |
| P1 #3 — Failed→Succeeded crash | `orders.service.ts` (Payment.upsert) | Retry après FAILED webhook fonctionne |
| P1 #4 — Pipeline corepack cassé | `package.json` (build → pnpm -r run) | typecheck + lint + build OK via corepack |
| P3 #7 — Stripe doc comment | `stripe.service.ts` | Commentaire reflète le code |
| P2 — DOCX manquants | `phases de DEV/PHASE_4*.docx`, `PHASE_5*.docx` | Brief technique livré |

**Tests :** 94 backend (89 + 5 audit-guards) ✅
**Pipeline :** typecheck + lint + build → 4 packages chacun ✅
**Migration :** `20260601_phase5_codex_audit` ajoute `cart_items.price_snapshot_cents` + CHECK

---

## Process Update — Visual Validation Contract (28/05/2026)

**Statut :** ✅ Intégré au /brain

Nouvelles règles produit obligatoires à partir de **Phase 6** :
- Validation visuelle de chaque feature (screenshots, previews iOS + Android, états loading/empty/error)
- Storybook obligatoire pour composants réutilisables
- Preview builds mobile (QR code) après chaque major implementation
- Environnement staging avec dashboards publics
- Simulateur fake data (rush, orders, suppliers)
- Demo mode pour investisseurs / clubs (Stadium, Hockey, Corporate, Festival)
- Product owner approval flow

**Documents créés :**
```
brain/PRODUCT_VALIDATION.md   ← contrat v1.0.0 (mandatory from Phase 6)
brain/REMINDERS.md            ← notes assistant (Cursor timing, infra checkpoints)
```

**Phases 1-5 :** exemptes (backend only, validation technique acceptée)

---

## PHASE 5 — Cart, Checkout, Stripe Connect, Orders

**Date :** 27/05/2026
**Statut :** ✅ Terminée
**Durée réelle :** 1 session

---

### BLOC 5.1 — Stripe SDK + StripeService

**Décisions :**
- `stripe` 17.7.0 ajouté en dépendance backend
- API version pinnée via `STRIPE_API_VERSION` env (default 2024-12-18.acacia)
- StripeService = wrapper unique du SDK Stripe — aucun autre service n'instancie `new Stripe(...)`
- PaymentsModule = `@Global()` pour injecter StripeService partout sans re-import

**Fichiers créés :**
```
backend/src/modules/payments/stripe.service.ts
backend/src/modules/payments/payments.module.ts
```

---

### BLOC 5.2 — Supplier Stripe Connect onboarding

**Décisions :**
- Stripe Connect Standard accounts (le supplier gère son propre dashboard Stripe)
- Onboarding via `accountLinks.create` — URL one-shot, court terme, re-generable
- Mirrors stockés sur Supplier (`stripeChargesEnabled`, `stripePayoutsEnabled`) → évite un round-trip Stripe à chaque checkout

**Modifié :**
```
backend/prisma/schema.prisma (StripeAccountStatus enum + 4 nouvelles colonnes sur Supplier)
backend/src/modules/suppliers/suppliers.service.ts (createOnboardingLink, refreshStripeStatus)
backend/src/modules/suppliers/suppliers.controller.ts (2 nouvelles routes)
backend/src/modules/suppliers/dto/create-onboarding-link.dto.ts
```

---

### BLOC 5.3 — Cart module

**Décisions :**
- V1 = single-vendor : 1 cart = 1 supplier dans 1 event
- Cart items ne stockent PAS de snapshot prix — Product.price lu à chaque computeView
- Stock NON décrémenté au cart — uniquement à Order creation
- TTL cart = 30 min (sweeper en Phase 9)
- Validation cumulée du stock après upsert (cap automatique à stock.quantity si dépassement)

**Fichiers créés :**
```
backend/src/modules/cart/dto/{create-cart,update-cart,add-cart-item,update-cart-item}.dto.ts
backend/src/modules/cart/cart.service.ts
backend/src/modules/cart/cart.controller.ts
backend/src/modules/cart/cart.module.ts
```

---

### BLOC 5.4 — Checkout / PaymentIntent

**Décisions :**
- Stripe idempotencyKey = `cart_${cartId}` — double-call retourne le MÊME PaymentIntent
- `transfer_data.destination` + `application_fee_amount` (basis points) pour split marketplace
- Cart transitionne OPEN → CHECKOUT_PENDING APRÈS succès Stripe
- Re-validation complète des items (stock, statut, fenêtre) avant création PaymentIntent

**Modifié :**
```
backend/src/modules/cart/cart.service.ts (méthode checkout + interface CheckoutResponse)
backend/src/modules/cart/cart.controller.ts (POST /carts/:id/checkout)
```

---

### BLOC 5.5 — Webhook Stripe handler

**Décisions :**
- Route `/webhooks/stripe` HORS prefix `/api/v1` (URL stable pour Stripe)
- Middleware `express.raw({type:'application/json'})` AVANT le JSON parser (signature verification needs raw bytes)
- `bodyParser: false` dans NestFactory pour reprendre la main sur le parsing
- Idempotency via table `webhook_events` (UNIQUE stripe_event_id) — duplicates skipped
- Handlers : `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`
- Re-throw sur erreur handler → Stripe retry automatique

**Fichiers créés :**
```
backend/src/modules/webhooks/stripe-webhooks.controller.ts
backend/src/modules/webhooks/stripe-webhooks.service.ts
backend/src/modules/webhooks/webhooks.module.ts
```

**Modifié :**
```
backend/src/main.ts (raw body middleware + setGlobalPrefix exclude webhooks)
```

---

### BLOC 5.6 — Order creation transactionnelle

**Décisions :**
- Order créé UNIQUEMENT sur `payment_intent.succeeded` (jamais avant)
- Transaction unique : Cart→CONVERTED + Order + OrderItems (snapshots) + Payment + AuditTrail + Stock decrement
- Public order number via PostgreSQL sequence `order_public_seq` formaté "BE-XXXXXXXX"
- AuditTrail append-only : première entrée `null → PAID` avec actor=SYSTEM
- Idempotency : Payment.stripePaymentIntentId UNIQUE — second call retourne l'Order existant

**Fichiers créés :**
```
backend/src/modules/orders/orders.service.ts
backend/src/modules/orders/orders.controller.ts (GET /orders/:id, ownership check)
backend/src/modules/orders/orders.module.ts
```

**Modifié :**
```
backend/prisma/schema.prisma (Order, OrderItem, Payment, OrderAuditTrail, WebhookEvent + 3 enums)
backend/prisma/migrations/20260527_phase5_stripe_connect/migration.sql (étendu avec orders + sequence)
```

---

### BLOC 5.7 — Tests + Docs

**Tests ajoutés (21) :**
- `cart.service.spec.ts` : 12 tests (create, addItem, checkout, idempotency, ownership)
- `orders.service.spec.ts` : 5 tests (createFromPaymentIntent + idempotency + recordFailedPayment)
- `stripe-webhooks.service.spec.ts` : 4 tests (dispatch, idempotency, account.updated)

**Résultat global Phase 5 :**
```
pnpm test --runInBand     → 89 tests ✅ (68 + 21 new)
pnpm typecheck (root)     → 4 packages 0 erreur
pnpm lint (root)          → 4 packages 0 erreur
prisma validate           → schéma OK
```

---

## Codex Audit Phase 4 — P1/P2/P3

**Date :** 26/05/2026
**Statut :** ✅ Terminée

| Fix | Fichier(s) | Impact |
|-----|-----------|--------|
| P1 — Migration UUID (TEXT → UUID sur tous IDs/FKs Phase 4) | `migration.sql` Phase 4 | `db:migrate` fonctionnel sur PostgreSQL |
| P1 — Pipeline `pnpm -r run` (turbo → pnpm recursion) | `package.json` | `pnpm typecheck/lint` sans dépendance corepack |
| P2 — Stock pickup point supplier mismatch → BadRequestException | `stock.service.ts` | Intégrité cross-supplier |
| P2 — Product availableUntil > availableFrom | `products.service.ts` | Fenêtres temporelles cohérentes |
| P3 — categories.service.spec.ts créé | `categories.service.spec.ts` | 8 tests CRUD + P2003 |

**Résultat :** 67 tests | `pnpm typecheck` ✅ | `pnpm lint` ✅ | migration Phase 4 exécutable

---

## Codex Audit P1 — JwtStrategy globalRole + Pipeline corepack

**Date :** 26/05/2026
**Statut :** ✅ Terminée

| Fix | Fichier(s) modifié(s) | Impact |
|-----|----------------------|--------|
| `globalRole` rechargé depuis DB dans `validate()` | `jwt.strategy.ts`, `jwt.strategy.spec.ts` | Révocation de rôle effective immédiatement |
| `.npmrc` `package-manager-strict=false` | `.npmrc` (créé) | Turbo résout le binaire pnpm sur Windows |

**Résultat :** `request.user.globalRole` = toujours la valeur live en base | Pipeline `pnpm typecheck/lint` fonctionnel

---

## Codex Audit Phase 5 (2e passe) — Snapshot timing + Pipeline turbo + Sécurité .gitignore + Git init

**Date :** 01/06/2026
**Statut :** ✅ Terminée

| Fix | Fichier(s) modifié(s) | Impact |
|-----|----------------------|--------|
| **P1 #1** — Freeze prix déplacé APRÈS succès Stripe, dans la transaction unique CHECKOUT_PENDING ; `computeView()` lit le prix live tant que `status===OPEN` | `cart.service.ts`, `cart.service.spec.ts` | Un échec Stripe ne laisse plus de prix figé sur un cart OPEN → plus de prix obsolète au retry |
| **P1 #2** — Scripts racine → `turbo run` (turbo est dans node_modules/.bin, `pnpm` non) ; jest `maxWorkers:1` | `package.json`, `backend/package.json` | `corepack pnpm typecheck/lint/build` VERTS via les scripts ; tests déterministes (plus de `--runInBand`) |
| **P1 #3** — `.gitignore` ignore nominativement clés/secrets (firebase key, google-services, GoogleService-Info.plist, `.p8`/`.p12`, keystores…) **sans** bloquer `*.json` | `.gitignore`, `BLOC_6_0_SETUP_GUIDE.md` | Aucune clé ne peut être committée ; fausse affirmation L168 corrigée |
| **P2** — Source de vérité unique build Vercel = `apps/*/vercel.json` | `BLOC_6_0_SETUP_GUIDE.md` | Plus de contradiction guide ↔ config |
| **P2** — Repo git initialisé (local, branche `main`) + commit initial `fbf6147` | `.gitattributes` (créé), `.git/` | Base prête pour push GitHub → import Vercel/Railway |

**Vérifications :** 95 tests backend ✅ (12 suites, séquentiel ~16s, 0 flaky) | `corepack pnpm typecheck` + `corepack pnpm lint` verts via les scripts | `git check-ignore` : 10 chemins sensibles ignorés, 0 config ignorée par erreur ; seul `.env.example` (placeholders) suivi

**Reste (product owner) :** ✅ FAIT — repo GitHub `Break-Eat-APP/breakeat-admin` créé + pushé. Bloc 6.0 infra terminé.

---

## BLOC 6.0 — Infrastructure Staging

**Date :** 2026-06-01
**Statut :** ✅ Terminé

**Services déployés :**
```
Vercel admin    → https://breakeat-admin-admin.vercel.app
Vercel operator → https://breakeat-operator-git-main-breakeatapp-1555s-projects.vercel.app
Railway backend → https://breakeat-admin-production.up.railway.app
Railway Postgres → connecté via ${{Postgres.DATABASE_URL}}
Railway Redis   → connecté via ${{Redis.REDIS_URL}}
GET /health     → {"status":"ok","environment":"staging"} ✅
```

**Fichiers créés :**
```
nixpacks.toml   — build Railway (corepack fix + pnpm --filter @break-eat/backend)
railway.json    — builder NIXPACKS + healthcheck /health
```

**Fichiers modifiés :**
```
apps/admin/vercel.json       — installCommand/buildCommand propres
apps/operator/vercel.json    — idem
apps/*/src/app/layout.tsx    — titre BREAK EAT (corrigé depuis BRAT EAT)
apps/*/src/app/page.tsx      — idem
backend/package.json         — express ajouté en dep directe
pnpm-lock.yaml               — mis à jour
```

**Problèmes résolus (dans l'ordre) :**
1. 44 erreurs TypeScript CI → `prisma generate` ajouté dans build script
2. `pnpm: command not found` Railway → corepack + COREPACK_INTEGRITY_KEYS=''
3. `pnpm-lock.yaml` introuvable → Root Directory Railway = vide
4. Railway Settings Build Command écrasait nixpacks.toml → champs vidés
5. `Cannot find module 'express'` → express manquait comme dep directe (pnpm strict)

**GitHub Secrets configurés :**
VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID_ADMIN, VERCEL_PROJECT_ID_OPERATOR, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

**Prochaine étape :** Bloc 6.1 — OrderStatus state machine + UI temps réel ✅ FAIT

---

## BLOC 6.1 — Order State Machine + Audit Trail

**Date :** 2026-06-01
**Statut :** ✅ Terminé
**Commit :** 4cf5426

**Fichiers créés :**
```
backend/src/modules/orders/order-state-machine.service.ts
backend/src/modules/orders/order-state-machine.service.spec.ts
backend/src/modules/orders/dto/transition-order.dto.ts
```

**Fichiers modifiés :**
```
backend/src/modules/orders/orders.service.ts       — +transition(), +findActiveByEvent(), +findAuditTrail()
backend/src/modules/orders/orders.service.spec.ts  — +35 tests (transition, find*)
backend/src/modules/orders/orders.controller.ts    — réécriture complète (6 PATCH + 3 GET)
backend/src/modules/orders/orders.module.ts        — OrderStateMachineService providers/exports
```

**Architecture Order State Machine :**
```
PAID ──────────────────────── → ACCEPTED (opérateur accepte)
PAID / ACCEPTED / PREPARING── → CANCELLED (opérateur annule)
PAID / ACCEPTED / PREPARING / READY → RECOVERED (récupération manuelle)
ACCEPTED → PREPARING → READY → PICKED_UP → COMPLETED
RECOVERED → ACCEPTED | PREPARING | READY (re-entrée à n'importe quel point)
```
- **15 transitions** autorisées au total (READY ne peut pas être annulé)
- assertTransition() tire **avant** tout écrit DB → BadRequestException si illégale
- transition() : un seul `$transaction([order.update, audit.create])` → atomique
- TODO Phase 6.2 : emit realtime event après commit (outbox pattern)

**Endpoints opérateur :**
```
PATCH /orders/:id/accept           PAID → ACCEPTED
PATCH /orders/:id/start-preparing  ACCEPTED → PREPARING
PATCH /orders/:id/mark-ready       PREPARING → READY
PATCH /orders/:id/mark-picked-up   READY → PICKED_UP
PATCH /orders/:id/recover          any → RECOVERED
PATCH /orders/:id/cancel           PAID/ACCEPTED/PREPARING → CANCELLED
GET   /orders/event/:eventId/active  snapshot dashboard (exclut COMPLETED + CANCELLED)
GET   /orders/:id                  vue client (ownership check)
GET   /orders/:id/audit            audit trail client (ownership check)
```

**Fixes apportés :**
- orderBy `occurredAt` → `createdAt` (le champ Prisma réel dans OrderAuditTrail)
- Commentaire "17 transitions" corrigé → 15

**Tests :** 151 passing, 0 failures (13 suites, +65 nouveaux tests)

**Prochaine étape :** Bloc 6.2 — Socket.IO + Outbox realtime ✅ FAIT

---

## BLOC 6.2 — Socket.IO Gateway + Outbox Realtime

**Date :** 2026-06-01
**Statut :** ✅ Terminé
**Commit :** 49d0f2e

**Fichiers créés :**
```
backend/src/modules/realtime/realtime.gateway.ts
backend/src/modules/realtime/realtime.service.ts
backend/src/modules/realtime/realtime.module.ts
backend/src/modules/realtime/dto/join-room.dto.ts
backend/src/modules/realtime/realtime.gateway.spec.ts
backend/src/modules/realtime/realtime.service.spec.ts
```

**Fichiers modifiés :**
```
backend/src/modules/orders/orders.service.ts   — inject RealtimeService + emit outbox
backend/src/modules/orders/orders.service.spec.ts — mock + assertions outbox
backend/src/modules/orders/orders.module.ts    — import RealtimeModule
backend/src/app.module.ts                      — import RealtimeModule Phase 6
backend/package.json + pnpm-lock.yaml          — socket.io packages
```

**Architecture réalisée :**
```
Client ──WS connect + JWT──→ RealtimeGateway
  handleConnection: vérifie JWT, stocke payload dans client.data.user
  join_room:  client.join(room) — rooms: organization/event/supplier/pickup-point/order/{uuid}
  leave_room: client.leave(room)

OrdersService
  createFromPaymentIntent → realtimeService.emitNewOrder()  ← APRÈS $transaction commit
  transition              → realtimeService.emitOrderUpdated() ← APRÈS $transaction commit
                          → realtimeService.emitOrderReady()   ← seulement si to===READY
```

**Outbox rule :**
```
guard assertTransition() → AVANT $transaction (annule si illégal)
$transaction([update, audit]) → commit
realtimeService.emit*() → APRÈS commit (jamais avant)
```

**Fix nommage :**
- `eventId` dans le payload realtime = UUID de déduplication côté client
- L'identifiant du concert (Prisma `eventId`) ne figure pas dans le payload (les clients savent déjà via la room `event:{id}` à laquelle ils sont abonnés)

**Tests :** 170 passing, 0 failures (15 suites, +19 nouveaux tests)

**Prochaine étape :** Bloc 6.3 — Storybook scaffolding + pipeline mobile

---

## PHASE 5 (legacy section) — voir bloc principal plus haut

**Statut :** ✅ Terminée — détails dans la section dédiée ci-dessus

---

## PHASE 6 — Orders + Realtime + Outbox

**Statut :** ⏳ Non commencée
**Dépendances :** Phase 5 terminée

---

## PHASE 7 — Slots + Flaix Foundation

**Statut :** ⏳ Non commencée
**Dépendances :** Phase 6 terminée
**Note :** Flaix = intégration du microservice existant uniquement. Pas de logique AI ici.

---

## PHASE 8 — Dashboards + Public Screens

**Statut :** ⏳ Non commencée
**Dépendances :** Phase 7 terminée

---

## PHASE 9 — CMS basique + Feature Flags

**Statut :** ⏳ Non commencée
**Dépendances :** Phase 8 terminée
**Note :** CMS = templates fixes + configuration JSON. Pas de page builder.

---

## PHASE 10 — QA, Rush tests, Déploiement

**Statut :** ⏳ Non commencée
**Dépendances :** Phase 9 terminée

---

*Ce fichier est mis à jour après chaque bloc complété.*
*Format : [PHASE].[BLOC] — Nom du bloc*
