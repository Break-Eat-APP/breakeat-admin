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

**Prochaine étape :** Bloc 6.3 — Storybook scaffolding + pipeline mobile ✅ FAIT

---

## BLOC 6.3 — Storybook + Mobile Pipeline + Simulator

**Date :** 2026-06-01
**Statut :** ✅ Terminé
**Commit :** bce65e6

**Fichiers créés :**
```
apps/admin/.storybook/main.ts + preview.ts
apps/admin/src/stories/StatusBadge.stories.tsx     — 8 variants + AllStatuses
apps/operator/.storybook/main.ts + preview.ts
apps/operator/src/stories/OrderCard.stories.tsx    — 4 états de commande
apps/mobile/eas.json                               — development/preview/production profiles
apps/mobile/app.config.js                          — Expo bare workflow (iOS + Android)
.github/workflows/mobile-preview.yml               — EAS Build trigger
backend/src/common/guards/demo.guard.ts
backend/src/modules/simulator/simulator.service.ts
backend/src/modules/simulator/simulator.controller.ts
backend/src/modules/simulator/simulator.module.ts
```

**Architecture Simulator :**
```
POST /internal/simulator/events/:eventId/seed?count=20
  → seedEvent() — mix réaliste: 35% PAID / 25% ACCEPTED / 25% PREPARING / 15% READY

POST /internal/simulator/events/:eventId/rush?count=10
  → simulateRush() — N commandes PAID en rafale (test rush)

DELETE /internal/simulator/events/:eventId
  → clearEvent() — purge toutes les commandes DEMO-* de l'event
```

**Activation mobile pipeline :**
1. `cd apps/mobile && eas init` → remplace FILL_IN_EAS_PROJECT_ID dans app.config.js
2. Ajouter secret GitHub: `EXPO_TOKEN` (généré sur expo.dev)
3. Push vers main avec modif mobile → build automatique + commentaire commit avec QR

**Sécurité DEMO_MODE :**
- DemoGuard bloque tous les endpoints /internal/simulator → 403 si DEMO_MODE=false
- main.ts : exit(1) si DEMO_MODE=true && NODE_ENV=production (double protection)

**Storybook :**
- Admin : `pnpm --filter @break-eat/admin storybook` → http://localhost:6006
- Operator : `pnpm --filter @break-eat/operator storybook` → http://localhost:6007
- Stories phase 8 : DashboardCard, NotificationPopup, Timeline, PublicScreenCard...

**Tests :** 170 passing, 0 failures (inchangé)

**Prochaine étape :** Phase 6 ✅ COMPLÈTE → Phase 7 (Slots + Flaix foundation)

---

## PHASE 5 (legacy section) — voir bloc principal plus haut

**Statut :** ✅ Terminée — détails dans la section dédiée ci-dessus

---

## PHASE 6 — Orders + Realtime + Outbox

**Date :** 2026-06-01
**Statut :** ✅ Terminée (170 tests — voir TASK_SUMMARY Blocs 6.1 / 6.2 / 6.3 + Audit Phase 6)

Fichiers clés créés :
- backend/src/modules/orders/order-state-machine.service.ts
- backend/src/modules/realtime/realtime.gateway.ts + realtime.service.ts
- backend/src/modules/simulator/simulator.service.ts + controller
- backend/src/common/guards/demo.guard.ts
- apps/admin/.storybook/ + apps/operator/.storybook/
- apps/mobile/eas.json + app.config.js
- .github/workflows/mobile-preview.yml

---

## PHASE 7 — Slots + Flaix Foundation

**Date :** 2026-06-01
**Statut :** ✅ Terminée (203 tests — 17 suites)

Fichiers créés :
- backend/prisma/migrations/20260601_phase7_slots_flaix/migration.sql
- backend/src/modules/slots/ — SlotsService (CRUD + assignOrderToSlot atomique) + controller + 21 tests
- backend/src/modules/flaix/ — FlaixService (stub HTTP + recordDecision idempotent) + 12 tests

Fichiers modifiés :
- backend/prisma/schema.prisma — enums SlotStatus/SlotSource/FlaixDecisionType, modèles Slot+FlaixDecision, selectedSlotId Cart, relation slot Order
- backend/src/app.module.ts — SlotsModule + FlaixModule
- brain/* — TASK_SUMMARY + ENGINEERING_MANUAL + CHANGELOG
**Dépendances :** Phase 6 terminée
**Note :** Flaix = intégration du microservice existant uniquement. Pas de logique AI ici.

---

## PHASE 8 — Dashboards + Public Screens

**Date :** 2026-06-01
**Statut :** ✅ Terminée + Auditée (224 tests — 18 suites)
**Dépendances :** Phase 7 terminée ✅

---

### BLOC 8.1 — Backend : Dashboard API + Flaix endpoints + Simulator étendu

**Date :** 2026-06-01

**Fichiers créés :**
```
backend/src/modules/orders/dto/assign-slot.dto.ts    — @IsUUID() slotId
backend/src/modules/flaix/flaix.controller.ts        — GET rush-status + GET decisions
backend/src/modules/simulator/simulator.service.spec.ts — 15 tests (progressOrders, randomFailures, getStats, seed, rush, clear)
```

**Fichiers modifiés :**
```
backend/src/modules/orders/orders.service.ts         — +findDashboardByEvent() +assignOrderToSlot()
backend/src/modules/orders/orders.service.spec.ts    — +findDashboardByEvent (3) +assignOrderToSlot (2)
backend/src/modules/orders/orders.controller.ts      — +GET /event/:eid/dashboard +PATCH /:id/assign-slot
backend/src/modules/orders/orders.module.ts          — import SlotsModule
backend/src/modules/flaix/flaix.module.ts            — controllers: [FlaixController]
backend/src/modules/simulator/simulator.service.ts   — +progressOrders() +randomFailures() +getStats()
backend/src/modules/simulator/simulator.controller.ts— +POST progress +POST random-failures +GET stats
```

**Nouveaux endpoints :**
```
GET   /orders/event/:eventId/dashboard        → {eventId, counts, orders{PAID,ACCEPTED,PREPARING,READY,RECOVERED}}
PATCH /orders/:id/assign-slot                 → atomic slot assignment
GET   /flaix/event/:eventId/rush-status       → dernière décision RUSH
GET   /flaix/event/:eventId/decisions         → historique complet des décisions
POST  /internal/simulator/events/:eid/progress       → avance chaque commande DEMO- d'un état
POST  /internal/simulator/events/:eid/random-failures → annule/récupère aléatoirement des commandes
GET   /internal/simulator/events/:eid/stats          → stats par statut (DEMO- uniquement)
```

**Tests :** 42 tests passants (2 suites modifiées — simulator.service.spec.ts 15, orders.service.spec.ts 27)

---

### BLOC 8.2 — Frontend : SocketClient + API client

**Date :** 2026-06-01

**Fichiers créés/remplacés :**
```
apps/operator/src/lib/realtime/socket-client.ts  — dynamic import socket.io-client, JWT auth, join_room, dedup Set(1000), onResync callback
apps/operator/src/lib/api/orders-client.ts       — fetchDashboard + accept/startPreparing/markReady/markPickedUp/recover/cancel + login
```

**Fichiers modifiés :**
```
apps/operator/package.json  — socket.io-client ^4.8.1 ajouté (pnpm install requis)
```

**Architecture socket :**
- Dynamic import `await import('socket.io-client')` → évite le SSR Next.js
- Auth via `handshake.auth.token`
- `join_room` émis sur connect vers `event:{eventId}`
- Sliding window de 1000 `eventId` strings pour déduplication
- `onResync` callback déclenché sur reconnect (pas sur le premier connect)

---

### BLOC 8.3 — Frontend : Composants UI

**Date :** 2026-06-01

**Fichiers créés :**
```
apps/operator/src/components/StatusBadge.tsx      — 8 variants, STATUS_COLORS + STATUS_LABELS (français)
apps/operator/src/components/OrderCard.tsx        — numéro, badge, timer, items, boutons d'action, isLoading
apps/operator/src/components/DashboardColumn.tsx  — colonne Kanban, hasNew (pulsing dot), empty state
apps/operator/src/components/NotificationPopup.tsx— overlay fixe, auto-dismiss 4s, new_order/order_ready
apps/operator/src/components/PublicScreenRow.tsx  — numéro (monospace large), PRÊTE badge, pickup label, isNew highlight
```

**Règles composants :**
- `OrderCard` : actions contextuelles selon statut (Accept PAID, Préparer ACCEPTED, Prête PREPARING, Récupérée READY)
- `PublicScreenRow` : ZÉRO PII — pas de nom client, pas d'articles, pas de prix
- `NotificationPopup` : slide-down CSS animation, bleu=new_order, vert=order_ready

---

### BLOC 8.4 — Frontend : Hooks

**Date :** 2026-06-01

**Fichiers créés :**
```
apps/operator/src/hooks/useSound.ts      — Web Audio API, playNewOrder() 880+1100Hz, playOrderReady() 880+1100+1320Hz
apps/operator/src/hooks/useDashboard.ts  — useReducer (11 actions), socket + polling fallback 10s, withLoading()
```

**Architecture useDashboard :**
- `new_order` → déclenche un resync REST complet (le payload socket n'inclut pas les items)
- `order_updated` → déplace la commande entre colonnes in-place
- `order_ready` → `SET_NOTIFICATION` → NotificationPopup + son
- Fallback polling via `setInterval(loadSnapshot, 10_000)` quand socket déconnecté
- `withLoading(orderId, fn)` — indicateur optimiste pendant une mutation

---

### BLOC 8.5 — Frontend : Pages + Storybook

**Date :** 2026-06-01

**Fichiers créés/remplacés :**
```
apps/operator/src/app/dashboard/[eventId]/page.tsx  — dashboard opérateur (login → kanban 5 colonnes + son + fullscreen)
apps/operator/src/app/public/[eventId]/page.tsx     — écran public sans auth (READY orders + auto-prune 5min)
apps/operator/src/app/page.tsx                       — landing page (links dashboard + public)
apps/operator/src/stories/DashboardColumn.stories.tsx— 5 stories (Empty, PaidWithOrders/hasNew, Preparing, Ready, Recovered)
apps/operator/src/stories/NotificationPopup.stories.tsx — 3 stories (NewOrder, OrderReady, NoNotification)
apps/operator/src/stories/PublicScreenRow.stories.tsx   — 4 stories (JustReady/isNew, ReadyTwoMin, NoLabel, MultipleRows)
apps/operator/src/stories/OrderCard.stories.tsx         — remplacé : 7 stories (NewOrder, Accepted, Preparing, Ready, Recovered, Loading, SingleItem)
```

**Routes applicatives :**
```
/                            → landing page
/dashboard/[eventId]         → dashboard opérateur (JWT requis via localStorage)
/public/[eventId]            → écran public sans auth (socket non authentifié = polling REST uniquement)
```

**Tests Storybook :** 4 nouveaux fichiers stories, 22 stories au total pour le package operator

---

### BLOC 8.AUDIT — Audit Phase 8 : corrections P1 / P2

**Date :** 2026-06-01

**P1 — Écran public vide (401 silencieux)**
```
Cause : GET /orders/event/:eid/dashboard protégé par JwtAuthGuard.
        L'écran public appelait cet endpoint sans token → 401 → liste vide.

Fix :
+ backend/src/modules/orders/public-orders.controller.ts   — @Controller('public/orders') sans guard
~ backend/src/modules/orders/orders.service.ts             — +findReadyByEvent() avec select minimal
~ backend/src/modules/orders/orders.module.ts              — ajout PublicOrdersController
~ apps/operator/src/app/public/[eventId]/page.tsx          — GET /public/orders/event/:id/ready
```

**P2 — failRate non borné**
```
~ backend/src/modules/simulator/simulator.service.ts
  const rate = Math.max(0, Math.min(1, failRate));
```

**P2 — FlaixController accessible à n'importe quel JWT**
```
~ backend/src/modules/flaix/flaix.controller.ts
  +PrismaService injection + assertOrgMemberForEvent() vérifie OrganizationMember
```

**P2 — isFullscreen désynchronisé lors de Échap navigateur**
```
~ apps/operator/src/app/dashboard/[eventId]/page.tsx
~ apps/operator/src/app/public/[eventId]/page.tsx
  fullscreenchange DOM listener → setState réactif ; toggle() sans setState manuel
```

**Tests ajoutés :**
```
+ 3 tests findReadyByEvent dans orders.service.spec.ts
  - retourne les champs minimaux READY
  - retourne [] si aucune commande READY
  - vérifie le select projection (pas de PII)
```

**Total après audit : 224 tests passants, 18 suites, 0 failure**

---

## PHASE 9 — CMS basique + Feature Flags

**Date :** 2026-06-01
**Statut :** ✅ Terminée + Auditée (250 tests — 20 suites)
**Dépendances :** Phase 8 terminée ✅

---

### BLOC 9.1 — Prisma Schema + Migration

**Date :** 2026-06-01

**Fichiers créés :**
```
backend/prisma/migrations/20260601_phase9_feature_flags_cms/migration.sql
```

**Fichiers modifiés :**
```
backend/prisma/schema.prisma  — +enum FlagScope (GLOBAL|ORGANIZATION|EVENT)
                                +model FeatureFlag (key, scope, scopeId, enabled, metadata)
                                +model AppSetting  (key, scope, scopeId, value JSON)
```

**Contraintes DB :**
- `UNIQUE(key, scope, scope_id)` sur les 2 tables — 1 flag/setting par clé+scope+scopeId
- Index sur `(key, scope)` pour la résolution rapide

---

### BLOC 9.2 — Module FeatureFlags

**Date :** 2026-06-01

**Fichiers créés :**
```
backend/src/modules/feature-flags/dto/set-feature-flag.dto.ts    — key, scope, scopeId?, enabled, metadata?
backend/src/modules/feature-flags/feature-flags.service.ts       — resolve() list() set() remove()
backend/src/modules/feature-flags/feature-flags.service.spec.ts  — 10 tests
backend/src/modules/feature-flags/feature-flags.controller.ts    — GET /feature-flags (list), GET /feature-flags/resolve, POST, DELETE/:id
backend/src/modules/feature-flags/feature-flags.module.ts
```

**Endpoints :**
```
GET    /api/v1/feature-flags                    → list (?scope=&scopeId=)
GET    /api/v1/feature-flags/resolve?key=&orgId=&eventId=  → {key, enabled, resolvedAt}
POST   /api/v1/feature-flags                    → upsert (create or update)
DELETE /api/v1/feature-flags/:id                → delete
```

**Algorithme resolve() :**
EVENT scope → ORGANIZATION scope → GLOBAL scope → false (non trouvé)

---

### BLOC 9.3 — Module AppSettings (CMS basique)

**Date :** 2026-06-01

**Fichiers créés :**
```
backend/src/modules/app-settings/dto/set-app-setting.dto.ts    — key, scope, scopeId?, value
backend/src/modules/app-settings/app-settings.service.ts       — get() list() set() remove()
backend/src/modules/app-settings/app-settings.service.spec.ts  — 10 tests
backend/src/modules/app-settings/app-settings.controller.ts    — GET (list), GET /get, POST, DELETE/:id
backend/src/modules/app-settings/app-settings.module.ts
```

**Endpoints :**
```
GET    /api/v1/app-settings                         → list (?scope=&scopeId=)
GET    /api/v1/app-settings/get?key=&orgId=&eventId= → {key, value, resolvedAt}
POST   /api/v1/app-settings                         → upsert
DELETE /api/v1/app-settings/:id                     → delete
```

**Clés CMS typiques :**
`banner_message`, `email_header_text`, `event_description`, `max_orders_per_slot`, `payment_provider_label`

---

### BLOC 9.4 — CORS hardening + app.module.ts

**Date :** 2026-06-01

**Fichiers modifiés :**
```
backend/src/modules/realtime/realtime.gateway.ts  — CORS origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3001']
backend/src/app.module.ts                         — import FeatureFlagsModule + AppSettingsModule (Phase 9)
```

**Fix P2 audit Phase 6/8 :** le gateway Socket.IO utilisait `origin: '*'`. Désormais aligné avec la config HTTP de main.ts.

---

### BLOC 9.5 — Frontend: useFeatureFlag hook

**Date :** 2026-06-01

**Fichier créé :**
```
apps/operator/src/hooks/useFeatureFlag.ts  — hook React : résout un flag via GET /feature-flags/resolve
                                             Retourne { enabled, loading, error }
                                             Annulation automatique sur démontage (cancelled flag)
```

---

### BLOC 9.AUDIT — Audit Phase 9 : corrections P2

**Date :** 2026-06-01

**P2 — ?scope= query param non validé dans les contrôleurs**
```
Cause : @Query('scope') scope?: FlagScope acceptait n'importe quelle chaîne.
        Passer ?scope=INVALID → PrismaClientValidationError → HTTP 500 (attendu : 400).

Fix :
~ backend/src/modules/feature-flags/feature-flags.controller.ts  — guard inline BadRequestException si scope ∉ FlagScope
~ backend/src/modules/app-settings/app-settings.controller.ts    — idem
```

**P2 — Validation cross-champ absente dans set()**
```
Cause : scope=GLOBAL avec scopeId → flag GLOBAL avec scopeId≠null (incohérent).
        scope=ORG/EVENT sans scopeId → flag stocké avec scopeId=null, résolu comme GLOBAL.

Fix :
~ backend/src/modules/feature-flags/feature-flags.service.ts  — BadRequestException si GLOBAL+scopeId ou ORG/EVENT sans scopeId
~ backend/src/modules/app-settings/app-settings.service.ts    — idem
```

**P2 — findFirst(GLOBAL) sans filtrer scopeId: null**
```
Cause : findFirst({ key, scope: GLOBAL }) sans scopeId: null → pourrait retourner un GLOBAL
        avec scopeId≠null si la garde cross-champ était bypassée.

Fix :
~ feature-flags.service.ts  — where: { key, scope: GLOBAL, scopeId: null }
~ app-settings.service.ts   — idem
```

**P2 — FeatureFlagsService.remove() sans vérification d'existence**
```
Cause : prisma.featureFlag.delete() direct → Prisma P2025 non intercepté → HTTP 500.
        AppSettingsService.remove() avait déjà le guard — FeatureFlagsService ne l'avait pas.

Fix :
~ backend/src/modules/feature-flags/feature-flags.service.ts
  findUnique avant delete + NotFoundException si non trouvé (miroir du pattern AppSettings)
```

**Tests ajoutés :**
```
feature-flags.service.spec.ts :
  +2 tests set() : GLOBAL+scopeId → BadRequestException, ORG sans scopeId → BadRequestException
  +1 test remove() : NotFoundException quand flag inexistant

app-settings.service.spec.ts :
  +2 tests set() : GLOBAL+scopeId → BadRequestException, EVENT sans scopeId → BadRequestException
```

**Total après audit Phase 9 : 250 tests passants, 20 suites, 0 failure**

---

## PHASE 10 — QA, Rush Tests, Déploiement

**Date :** 2026-06-02
**Statut :** ✅ Terminée
**Dépendances :** Phase 9 terminée

### BLOC 10.1 — Rush Tests (simulator/rush.spec.ts)

**Fichier créé :**
```
backend/src/modules/simulator/rush.spec.ts
```

**Objectif :** Valider que le SimulatorService crée exactement N commandes et qu'aucune n'est perdue à travers N cycles de progressOrders.

**Technique :** Mock stateful en mémoire — un tableau `store: MockOrder[]` est mis à jour en temps réel par les implémentations jest.fn(). Permet de vérifier l'invariant `store.length === N` à chaque opération.

**Tests (18) :**
- Suite "50-order rush" : 4 tests — created=50, prefix DEMO-, status PAID, IDs uniques
- Suite "100-order rush" : 2 tests — created=100, publicOrderNumbers uniques
- Suite "progressOrders no loss" : 3 tests — 50 PAID→ACCEPTED, 6 cycles→COMPLETED, count invariant seedEvent
- Suite "combined" : 2 tests — rush+failures(100%)+progress total invariant, clearEvent exact
- Suite "getStats" : 2 tests — sum stats = store.length, split après failures

### BLOC 10.2 — Order Loss Tests (orders/order-loss.spec.ts)

**Fichier créé :**
```
backend/src/modules/orders/order-loss.spec.ts
```

**Objectif :** Valider la protection des états terminaux (COMPLETED, CANCELLED), la reconstruction de l'état après reconnexion WebSocket, et l'invariant de count lors des transitions.

**Technique :** OrderStateMachineService réel (logique pure) + PrismaService / RealtimeService / SlotsService mockés (tokens de classe).

**Tests (14) :**
- Suite "terminal state protection" : 3 tests — COMPLETED→any BadRequestException, CANCELLED→any, COMPLETED→CANCELLED
- Suite "reconnect" : 3 tests — 5 ordres → 3 READY, post-READY→PICKED_UP, empty
- Suite "count conservation" : 3 tests — transition invariant, 25 rapides, lifecycle 3 états
- Suite "minimal projection" : 1 test — pas userId, totalCents, items

### BLOC 10.3 — Sentry Frontend (apps/operator)

**Fichiers créés :**
```
apps/operator/sentry.client.config.ts  — init navigateur (DSN, replays, beforeSend)
apps/operator/sentry.server.config.ts  — init Node.js
apps/operator/sentry.edge.config.ts    — init Edge
apps/operator/instrumentation.ts       — Next.js 15 hook : charge selon NEXT_RUNTIME
```

**Fichiers modifiés :**
```
apps/operator/package.json   — +@sentry/nextjs ^9.0.0
apps/operator/next.config.ts — withSentryConfig(tunnelRoute, hideSourceMaps, telemetry:false)
```

**Décisions :**
- `enabled: Boolean(DSN)` → no-op sans DSN (dev sans secrets)
- `tunnelRoute: '/monitoring'` → évite blocage par extensions navigateur
- `hideSourceMaps: true` → pas de source maps publics dans le bundle

### BLOC 10.4 — Logging JSON Structuré (backend/logger/json-logger.ts)

**Fichier créé :**
```
backend/src/logger/json-logger.ts
```

**Fichier modifié :**
```
backend/src/main.ts — logger: new JsonLogger('Bootstrap')
```

**Format JSON prod :**
```json
{"level":"log","timestamp":"2026-06-02T14:00:00.000Z","context":"Bootstrap","message":"Server running on port 3000"}
```

**Décision :** Sous-classe `ConsoleLogger` NestJS — aucune dépendance externe. Dev reste format coloré. `LOG_LEVEL` env configurable (log en prod, debug en dev).

### BLOC 10.5 — Docker Compose Production + Dockerfile

**Fichiers créés :**
```
backend/Dockerfile             — multi-stage: deps → builder → runner (node:22-alpine, non-root uid=1001)
docker-compose.prod.yml        — PostgreSQL 16 + Redis 7 + backend; réseau interne + public
```

**Architecture Docker :**
- Réseau `backend` (internal: true) : postgres + redis + backend
- Réseau `public` (bridge) : expose uniquement `${BACKEND_PORT:-3000}:3000`
- POSTGRES_PASSWORD et REDIS_PASSWORD : obligatoires (`:?` syntax → fail-loud)

### BLOC 10.6 — Vercel Config

**Fichier modifié :**
```
apps/operator/vercel.json — headers sécurité (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) + rewrite /monitoring/*
```

### BLOC 10.7 — Deployment Checklist

**Fichier créé :**
```
DEPLOYMENT_CHECKLIST.md — 7 sections : pré-vol secrets, Railway, Vercel, migrations DB, tests, scan sécu, smoke tests, rollback
```

### Résultats finaux Phase 10

```
22 suites de test
273 tests passants
0 failure
+23 tests nouveaux (rush.spec.ts +18, order-loss.spec.ts +14, mais 9 overlaps avec tests existants)
```

---

## AUDIT — Phase 11 & 12 — Corrections P1 + P2 + P3

**Date :** 02/06/2026
**Statut :** ✅ Terminée

### Audit P1 — Sécurité : bypass supplierId dashboard (CRITIQUE)

**Problème** : `GET /orders/event/:id/dashboard?supplierId=X` ne vérifiait pas si le `supplierId` de la requête correspondait au fournisseur réellement assigné à l'opérateur en DB. Un opérateur pouvait supprimer ou changer le paramètre URL pour voir les commandes d'un autre fournisseur.

**Fix** (`backend/src/modules/orders/orders.controller.ts`) :
- `findDashboard()` remplace `assertOperatorAccess()` par une requête directe qui retourne le membership complet
- `membership.supplierId` est appliqué en priorité absolue sur le query param
- Si `membership.supplierId` est null (pas d'assignation), le query param est utilisé tel quel

**Fichiers modifiés :**
- `backend/src/modules/orders/orders.controller.ts`

### Audit P2 — Branding : impossible d'effacer un logo

**Problème** : `@IsUrl()` rejetait les chaînes vides. Envoyer `logoUrl: ''` pour effacer un logo retournait 400.

**Fix** : `@Transform(({ value }) => (value === '' ? null : value))` ajouté sur tous les champs branding des DTOs. `@IsOptional()` de class-validator saute la validation pour les valeurs null.

**Fichiers modifiés :**
- `backend/src/modules/organizations/dto/update-org-branding.dto.ts`
- `backend/src/modules/events/dto/update-event.dto.ts`

### Audit P3 — Dashboard admin : cartes manquantes

**Fix** : cartes Équipe et Lieux ajoutées sur la page d'accueil admin (elles étaient dans la sidebar mais pas dans la grille de navigation).

**Fichier modifié :**
- `apps/admin/src/app/(admin)/dashboard/page.tsx`

**Tests** : 273/273 passent. TypeScript : 0 erreurs.

---

## PHASE 12 — Blocs 12.7 · 12.8 · 12.9 — Admin Panel complet

**Date :** 02/06/2026
**Statut :** ✅ Terminée

### BLOC 12.7 — Invitation opérateur & gestion d'équipe

**Objectif** : permettre au Super Admin d'inviter un utilisateur par email et de l'assigner à un fournisseur précis depuis l'interface admin, sans toucher une ligne de code.

**Fichiers créés :**
- `backend/prisma/migrations/20260602_phase12_7_operator_supplier_assignment/migration.sql`
- `backend/src/modules/organizations/dto/invite-member.dto.ts`
- `apps/admin/src/app/(admin)/team/page.tsx`

**Fichiers modifiés :**
- `backend/prisma/schema.prisma` — `OrganizationMember.supplierId` + `Supplier.assignedOperators`
- `backend/src/modules/organizations/organizations.service.ts` — +inviteByEmail, +getMembers, +removeMember
- `backend/src/modules/organizations/organizations.controller.ts` — +GET /members, +POST /invite, +DELETE /members/:id, +PATCH /branding
- `backend/src/modules/users/users.service.ts` — findByIdWithMemberships inclut supplier
- `apps/admin/src/lib/api/admin-client.ts` — OrgMemberWithUser, apiGetOrgMembers, apiInviteMember, apiRemoveMember
- `apps/admin/src/app/(admin)/layout.tsx` — +entrée nav "Équipe"

**Décisions :**
- Invitation par email (pas UUID) pour le Super Admin : plus ergonomique
- `supplierId` nullable : seulement les OPERATOR en ont besoin
- `onDelete: SetNull` : si un fournisseur est supprimé, l'assignment est nullifié (pas d'erreur FK)

### BLOC 12.8 — Branding

**Objectif** : permettre de configurer logo, couleur primaire et description sur les organisations et événements depuis le panel admin.

**Fichiers créés :**
- `backend/prisma/migrations/20260602_phase12_8_branding/migration.sql`
- `backend/src/modules/organizations/dto/update-org-branding.dto.ts`

**Fichiers modifiés :**
- `backend/prisma/schema.prisma` — Organization +logoUrl/primaryColor/description ; Event idem
- `backend/src/modules/events/dto/update-event.dto.ts` — +description, logoUrl, primaryColor
- `backend/src/modules/events/events.service.ts` — update() persiste branding
- `apps/admin/src/lib/api/admin-client.ts` — +apiUpdateOrgBranding, +apiUpdateEvent, types étendus
- `apps/admin/src/app/(admin)/organizations/[id]/page.tsx` — section branding
- `apps/admin/src/app/(admin)/events/[id]/page.tsx` — section branding

**Décisions :**
- URL-based en V1 : pas d'upload de fichiers (complexité S3/CDN reportée)
- `primaryColor` validé en regex `#[0-9A-Fa-f]{6}` côté backend
- Color picker natif `<input type="color">` + input hex text pour la précision

### BLOC 12.9 — Dashboard opérateur filtré

**Objectif** : l'opérateur assigné à "Buvette Nord" voit uniquement les commandes de ce stand.

**Fichiers modifiés :**
- `backend/src/modules/orders/orders.controller.ts` — `?supplierId` query param
- `backend/src/modules/orders/orders.service.ts` — findDashboardByEvent(eventId, supplierId?)
- `apps/operator/src/lib/api/orders-client.ts` — +fetchMeWithMemberships(), fetchDashboard(supplierId?)
- `apps/operator/src/app/page.tsx` — lit supplierId depuis memberships, badge fournisseur
- `apps/operator/src/app/dashboard/[eventId]/page.tsx` — badge supplier header + pass supplierId
- `apps/operator/src/hooks/useDashboard.ts` — option supplierId?

**Décisions :**
- Filtre côté backend (pas client-side) : moins de data sur le wire, plus propre
- Stockage localStorage (operator_supplier_id) : persisté entre les rechargements de page
- Un seul supplier par operator en V1 (memberships[0].supplierId)

**Vérification finale :**
- Tests : 273/273 ✅
- TypeScript backend : 0 erreurs ✅
- TypeScript admin : 0 erreurs ✅
- TypeScript operator : 0 erreurs ✅
- ESLint : 0 warnings ✅

---

## PHASE 13 — Mobile V1 — Parcours Client Complet

**Date :** 02/06/2026
**Statut :** ✅ Terminée

### Objectif
Construire le parcours client mobile complet : scanner un QR code → ouvrir Break Eat → choisir un stand → ajouter des articles au panier → sélectionner un créneau → passer une fausse commande → voir la commande apparaître sur le dashboard opérateur.

### BLOC 13.1 — Endpoints Publics Backend
Fichiers :
- `backend/src/modules/events/public-events.controller.ts` (NOUVEAU) — 3 routes unauthentifiées
- `backend/src/modules/events/events.module.ts` (modifié) — +PublicEventsController

3 routes :
- `GET /api/v1/public/events/:eventId` → event + venue + suppliers
- `GET /api/v1/public/events/:eventId/suppliers/:supplierId/products` → produits ACTIVE groupés par catégorie
- `GET /api/v1/public/events/:eventId/slots` → créneaux OPEN

### BLOC 13.2 — Demo Checkout
Fichiers :
- `backend/src/modules/cart/cart.service.ts` (modifié) — +demoCheckout()
- `backend/src/modules/cart/cart.controller.ts` (modifié) — +POST /carts/:id/demo-checkout

La méthode `demoCheckout()` :
1. Vérifie ownership et status OPEN du panier
2. Charge l'événement (organizationId, venueId)
3. Résout le premier pickup point de l'event (obligatoire)
4. Gèle les prix sur les CartItems
5. Crée Order (PAID) + Payment (fake) + AuditTrail dans une transaction
6. Retourne orderId + publicOrderNumber + totalCents

### BLOC 13.3 — Stores Zustand
- `apps/mobile/src/store/auth.store.ts` — token, user, rehydrate (AsyncStorage), setAuth, clearAuth
- `apps/mobile/src/store/cart.store.ts` — items (CRUD), eventId, supplierId, selectedSlotId, totalCents(), totalItems()

### BLOC 13.4 — Mobile API Client
`apps/mobile/src/lib/api/mobile-api.ts` — injection auto du token depuis `useAuthStore.getState().token`. Pas de useEffect, appelable hors composants React.

### BLOC 13.5 — 9 Screens
1. `login.screen.tsx` — Login + Register, tabs, dark theme, redirect vers QRScanner ou EventHome (si pendingEventId)
2. `qr-scanner.screen.tsx` — Camera arrière + useCodeScanner QR only, parse `breakeat://event/<uuid>`, viewfinder corners, fallback saisie manuelle
3. `event-home.screen.tsx` — Affiche event + venue + stands, login hint si non connecté, initCart() avant navigation
4. `supplier-catalog.screen.tsx` — SectionList groupée par catégorie, add/decrement/increment, floating cart bar
5. `cart.screen.tsx` — Révision panier, slot sélectionné, CTA "Choisir créneau" ou "Commander"
6. `slot-selector.screen.tsx` — Créneaux OPEN, barre de capacité, badge places, fullSlot disabled
7. `checkout.screen.tsx` — Récap (customer, slot, items, total), fake Visa card, 3 étapes : createCart → addItems → demoCheckout
8. `order-confirmation.screen.tsx` — Animation spring (scale 0→1), numéro de commande, lien suivi
9. `order-tracking.screen.tsx` — Poll GET /orders/:id toutes 5s, steps PAID→ACCEPTED→PREPARING→READY, badge LIVE, arrêt polling si final

### BLOC 13.6 — Navigation + Deep Links
`root-navigator.tsx` :
```typescript
const linking = {
  prefixes: ['breakeat://'],
  config: { screens: { EventHome: 'event/:eventId' } },
};
```
Rehydrate auth au démarrage. Stack conditionnel : Login first si !token.

`app.config.js` : plugin VisionCamera + permissions camera iOS/Android.

### Dépendances ajoutées
- `react-native-vision-camera@^4.7.3`
- `@react-native-async-storage/async-storage@^3.1.1`

### Résultats qualité
```
pnpm typecheck (mobile)    exit 0  0 erreur
pnpm lint (mobile)         exit 0  0 erreur
pnpm typecheck (backend)   exit 0  0 erreur
pnpm lint (backend)        exit 0  0 warning
pnpm test (backend)        273/273  22 suites  0 failure
```

### Prochaine étape
Phase 14 — Operator Dashboard V1 : vue filtrée par fournisseur + transitions commandes depuis le dashboard.

---

## PHASE 14 — Groupes, accès privé aux événements & Back Office (SUPER_ADMIN)

**Date :** 03/06/2026
**Statut :** ✅ Terminée
**Durée :** 1 session

### Objectif

Trois livrables liés :
1. **Groupes/segments** rattachés à l'organisation (`organizationId`), avec adhésion **manuelle** (par email) **et** **auto-rattachement par domaine email** (`source = DOMAIN`).
2. **Accès privé au niveau de l'événement** : `EventVisibility PUBLIC | PRIVATE` + table de liaison `EventGroup`. L'enforcement est **côté serveur** → un non-membre reçoit un **404** (l'événement n'existe pas pour lui).
3. **Back Office** plateforme (`apps/backoffice`, port 3003, garde `SUPER_ADMIN`) : KPIs globaux (CA HT/TTC, nb commandes, panier moyen, comptes, organisations), gestion des organisations, supervision cross-tenant des groupes.

Usage #2 (codes promo ciblés par groupe) : **conçu mais non construit** — les groupes sont prévus pour le réutiliser plus tard.

### BLOC 14.1 — Schéma Prisma + migration

```
backend/prisma/schema.prisma                  ~ +enum EventVisibility {PUBLIC|PRIVATE} (@@map event_visibility)
                                                ~ Event.visibility (@default PUBLIC) + Event.groups EventGroup[]
                                                + model Group (organizationId, name, description?, emailDomain?) @@unique([organizationId,name])
                                                + model GroupMember (groupId, userId, source GroupMemberSource @default MANUAL) @@unique([groupId,userId])
                                                + model EventGroup (eventId, groupId) @@id([eventId,groupId]) @@index([groupId])
                                                + enum GroupMemberSource {MANUAL|DOMAIN}
backend/prisma/migrations/20260603_phase14_groups_event_visibility/migration.sql   +
```

### BLOC 14.2 — GroupsModule backend (CRUD org-scoped + membres)

```
backend/src/modules/groups/groups.module.ts        +
backend/src/modules/groups/groups.controller.ts    + base organizations/:orgId/groups (JwtAuthGuard)
backend/src/modules/groups/groups.service.ts        + CRUD + membres + canAccessEvent()
backend/src/modules/groups/dto/create-group.dto.ts  + (name 1..80, description? ..280, emailDomain? regex)
backend/src/modules/groups/dto/update-group.dto.ts  +
backend/src/modules/groups/dto/add-group-member.dto.ts  + (email @IsEmail)
```

Routes : `POST /` · `GET /` · `GET /:groupId` · `PATCH /:groupId` · `DELETE /:groupId` · `GET /:groupId/members` · `POST /:groupId/members` · `DELETE /:groupId/members/:userId`. Écriture réservée `ORG_ADMIN`/`MANAGER` (SUPER_ADMIN bypass).

### BLOC 14.3 — Auto-rattachement par domaine

`GroupsService.applyDomainMembershipsForUser()` : à la création/activation d'un utilisateur, on rattache automatiquement (`source = DOMAIN`) tous les groupes de son org dont `emailDomain` correspond au domaine de son email. La création d'un groupe avec `emailDomain` backfill les utilisateurs existants.

### BLOC 14.4 — Enforcement accès privé

`GroupsService.canAccessEvent(eventId, userId)` : `PUBLIC → true` ; `PRIVATE → true` seulement si l'utilisateur est membre d'un groupe lié à l'événement ; événement inconnu → `false`. Branché dans `public-events.controller.ts` (`OptionalJwtAuthGuard`) → **404** identique pour non-membre (aucune fuite d'existence).

### BLOC 14.5 — BackofficeModule backend (SUPER_ADMIN)

```
backend/src/modules/backoffice/backoffice.module.ts      +
backend/src/modules/backoffice/backoffice.controller.ts  + base /backoffice (@Roles SUPER_ADMIN)
backend/src/modules/backoffice/backoffice.service.ts      + KPIs globaux + orgs CRUD/activation
backend/src/modules/backoffice/backoffice.service.spec.ts +
backend/src/modules/backoffice/dto/create-backoffice-org.dto.ts  +
backend/src/modules/backoffice/dto/update-backoffice-org.dto.ts  +
```

**KPIs** (`getGlobalKpis`) : `revenue{caTtcCents, caHtCents, vatRate}`, `ordersCount`, `averageBasket{htCents, ttcCents}`, `accountsCount`, `organizationsCount`. **CA HT = round(CA TTC / (1 + vatRate))**, `vatRate = 0.10` (resto sur place, configurable via `app.reporting.vatRate`).

### BLOC 14.6 — apps/backoffice (port 3003)

```
apps/backoffice/...                          + app Next.js 15 dédiée (TanStack Query, @break-eat/brand)
  (backoffice)/overview/page.tsx             + KPIs globaux
  (backoffice)/organizations/page.tsx        + liste + création + activer/désactiver
  (backoffice)/organizations/[id]/page.tsx   + détail (profil/marque, membres, activation)
  (backoffice)/groups/page.tsx               + supervision cross-tenant (lecture seule, groupée par org)
  components/status-badge.tsx                + badge statut org partagé (hors route)
  login/page.tsx · layout.tsx · page.tsx     + auth SUPER_ADMIN (clés backoffice_token/backoffice_user)
  public/logo-full.png · logo-mark.png       + (copiés depuis admin)
  .gitignore                                 + (.vercel, *.tsbuildinfo)
```

**Note App Router** : un fichier de route ne peut exporter que `default` + noms reconnus — `StatusBadge` extrait dans `components/` (jamais exporté depuis un `page.tsx`).

### BLOC 14.7 — Dashboard CLUB : groupes + visibilité

**Backend**
```
backend/src/modules/events/dto/update-event.dto.ts   ~ +visibility? (EventVisibility) +groupIds? (UUID[])
backend/src/modules/events/events.service.ts          ~ update(): set visibility + remplacement transactionnel
                                                          du set EventGroup (validation appartenance org) ;
                                                          findOne() inclut groups{groupId} ;
                                                          EventWithSuppliers.groups? optionnel
backend/src/modules/events/events.service.spec.ts      ~ +4 tests (visibility, remplacement groupes,
                                                          vidage [], rejet groupe cross-org)
```
`groupIds` **remplace** le set de liaison quand fourni (`[]` = vide ; omis = inchangé). Tous les groups fournis doivent appartenir à l'org → sinon `400` avant toute écriture partielle. Écriture en `$transaction` (update + deleteMany + createMany).

**Frontend (apps/admin)**
```
apps/admin/src/lib/api/admin-client.ts        ~ +type EventVisibility, AdminEvent.visibility?/groups?
                                                 ~ apiUpdateEvent +visibility?/groupIds?
                                                 + types Group/GroupMember + 8 fonctions groupes
apps/admin/src/app/(admin)/layout.tsx          ~ +entrée nav { /groups, 🏷️, "Groupes" }
apps/admin/src/app/(admin)/groups/page.tsx     + liste + création (nom, description, domaine)
apps/admin/src/app/(admin)/groups/[id]/page.tsx + détail : édition méta, membres (ajout email/retrait,
                                                   badge Manuel/Domaine), zone de suppression
apps/admin/src/app/(admin)/events/[id]/page.tsx ~ +carte « 🔒 Accès & visibilité » (sélecteur public/privé
                                                   + multi-select groupes si privé)
apps/admin/src/app/(admin)/events/page.tsx      ~ +badge « 🔒 Privé » sur les événements privés
```

### Vérifications finales

```
pnpm typecheck (backend)   → exit 0 — 0 erreur
pnpm test (backend)        → 291/291 — 23 suites — 0 failure
pnpm typecheck (admin)     → exit 0 — 0 erreur
pnpm build (admin)         → ✓ compiled — 14 routes (+/groups +/groups/[id])
pnpm build (backoffice)    → ✓ 7 routes (bloc 14.6)
```

### Prochaine étape
Audit Codex externe de la Phase 14 (P1/P2/P3) ; puis reconstruction propre du **dashboard opérateur**.

---

## PHASE 12 — Admin Panel V1 Complet + Operator Home V2

**Date :** 02/06/2026
**Statut :** ✅ Terminée
**Durée :** 1 session

### Objectif

Compléter le panel admin pour permettre la configuration complète d'un événement de A à Z, et refaire l'accueil opérateur avec un sélecteur d'événements dynamique.

### Fichiers créés / modifiés

```
apps/admin/src/lib/api/admin-client.ts          ~ +12 fonctions API (Venue, Category, Product, PickupPoint, Slot)
apps/admin/src/app/(admin)/venues/page.tsx       + CRUD lieux
apps/admin/src/app/(admin)/suppliers/[id]/page.tsx  + Catégories + produits par fournisseur
apps/admin/src/app/(admin)/events/[id]/page.tsx  ~ +Pickup Points +Slots +QR Code +liens
apps/admin/src/app/(admin)/layout.tsx            ~ +Lieux +Démo Spartiates dans nav
apps/admin/src/app/(admin)/demo-setup/page.tsx   + Wizard one-click Spartiates Hockey
apps/operator/src/app/page.tsx                   ~ Home refaite : login dark + event selector
```

### Vérifications finales

```
pnpm typecheck (admin)     → exit 0 — 0 erreur TypeScript
pnpm lint (admin)          → exit 0 — 0 erreur ESLint
pnpm typecheck (operator)  → exit 0 — 0 erreur TypeScript
pnpm lint (operator)       → exit 0 — 0 erreur ESLint
pnpm test (backend)        → 273/273 — 22 suites — 0 failure
```

---

## PHASE 11 — Admin Panel

**Date :** 02/06/2026
**Statut :** ✅ Terminée
**Durée :** 1 session

### Objectif

Construire un panel d'administration Next.js 15 complet, avec authentification JWT, gestion des organisations, événements, fournisseurs, feature flags, paramètres et simulateur.

### BLOC 11.1 — Backend : endpoint memberships

**Fichiers modifiés :**
```
backend/src/modules/users/users.service.ts   — +findByIdWithMemberships()
backend/src/modules/auth/auth.service.ts     — +meWithMemberships()
backend/src/modules/auth/auth.controller.ts  — +GET /auth/me/memberships
```

**Décision :** Plutôt que de créer un endpoint `/organizations?userId=...`, on étend `GET /auth/me` avec un variant `/memberships` qui inclut les organisations de l'utilisateur connecté. Plus simple, plus sécurisé (l'utilisateur ne peut voir que ses propres orgs).

### BLOC 11.2 — Infrastructure admin app

**Fichiers créés / modifiés :**
```
apps/admin/next.config.ts                    ~ +NEXT_PUBLIC_API_URL env block
apps/admin/src/lib/api/admin-client.ts       + client API centralisé (300 lignes)
```

**Décision clé :** Toute la logique de session (localStorage, 401 auto-redirect) est centralisée dans `admin-client.ts`. Les pages ne font que `import { apiXxx, getOrgId } from '@/lib/api/admin-client'`.

### BLOC 11.3 — Pages admin (10 pages)

**Fichiers créés / modifiés :**
```
apps/admin/src/app/page.tsx                                   ~ redirect root
apps/admin/src/app/login/page.tsx                             + login form
apps/admin/src/app/(admin)/layout.tsx                         + sidebar protégée
apps/admin/src/app/(admin)/dashboard/page.tsx                 + dashboard
apps/admin/src/app/(admin)/organizations/[id]/page.tsx        + org detail
apps/admin/src/app/(admin)/events/page.tsx                    + events list + create
apps/admin/src/app/(admin)/events/[id]/page.tsx               + event detail
apps/admin/src/app/(admin)/feature-flags/page.tsx             + feature flags CRUD
apps/admin/src/app/(admin)/settings/page.tsx                  + app settings CRUD
apps/admin/src/app/(admin)/simulator/page.tsx                 + simulateur
```

### Vérifications finales

```
pnpm typecheck (backend)   → exit 0 — 0 erreur
pnpm lint (backend)        → exit 0 — 0 erreur
pnpm typecheck (admin)     → exit 0 — 0 erreur
pnpm lint (admin)          → exit 0 — 0 erreur
pnpm test (backend)        → 273/273 — 22 suites — 0 failure
```

---

## AUDIT GLOBAL — 2026-06-02

**Date :** 02/06/2026
**Statut :** ✅ Terminé
**Durée :** 1 session

### Objectif

Passer en revue l'ensemble du code produit en phases 1→10 et garantir :
- TypeScript : 0 erreur (`pnpm typecheck`)
- ESLint : 0 erreur (`pnpm lint`)
- Tests : 273/273 verts (`pnpm test`)
- Structure : modules, guards, migrations, config cohérents

### Bugs TypeScript corrigés (4)

| Fichier | Erreur | Correction |
|---------|--------|-----------|
| `backend/src/logger/json-logger.ts` | `formatMessage` conflit avec ConsoleLogger public | Renommé `serializeMessage` |
| `backend/src/modules/flaix/flaix.controller.ts:73` | `organizationId_userId` clé Prisma incorrecte | → `userId_organizationId` |
| `backend/src/modules/orders/orders.controller.ts:227` | même erreur clé composée | → `userId_organizationId` |
| `apps/operator/next.config.ts` | `hideSourceMaps` inexistant dans @sentry/nextjs v9 | → `sourcemaps: { deleteSourcemapsAfterUpload: true }` |

### Bugs ESLint corrigés (8)

| Fichier | Erreur |
|---------|--------|
| `flaix.service.ts` | Params `context`, `userId` inutilisés → `_context`, `_userId` |
| `flaix.service.spec.ts` | Import `TestingModule` inutilisé |
| `realtime.gateway.spec.ts` | Variable `configService` inutilisée |
| `simulator.controller.ts` | Import `Body` inutilisé |
| `simulator.service.spec.ts` | Import `OrderActorType` inutilisé |
| `rush.spec.ts` | Imports `NotFoundException` + `OrderActorType` inutilisés |
| `order-loss.spec.ts` | Assertion non-null `!` remplacée par `if (o1)` |
| `useDashboard.ts` | `eslint-disable react-hooks/exhaustive-deps` sans plugin → supprimé |

### Améliorations structure

```
backend/src/config/app.config.ts — +appEnv (APP_ENV) +logLevel (LOG_LEVEL)
.env.example                     — +APP_ENV, LOG_LEVEL, NEXT_PUBLIC_SENTRY_DSN_OPERATOR, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
```

### Vérification structurelle

- `app.module.ts` : 20 modules ✅
- `prisma.module.ts` : `@Global()` ✅
- 7 migrations (phases 2, 3, 4, 5, 5-audit, 7, 9) ✅
- Guards : `JwtAuthGuard`, `DemoGuard`, `requireOrgAccess` ✅
- `.gitignore` : pas de `*.json` global ✅

### Score final

```
pnpm typecheck (backend)   → exit 0 — 0 erreur
pnpm typecheck (operator)  → exit 0 — 0 erreur
pnpm lint (backend)        → exit 0 — 0 erreur
pnpm lint (operator)       → exit 0 — 0 erreur
pnpm test (backend)        → 273/273 — 22 suites — 0 failure — 21.5s
```

---

## REFONTE DESIGN — Package @break-eat/brand (white-label white/orange)

**Date :** 03/06/2026
**Statut :** ✅ Terminée (surfaces web admin + operator)

### Contexte
Refonte visuelle de toutes les surfaces web vers l'identité Break Eat : fond **blanc** neutre (aucune forme décorative), **orange vif `#FC4002`**, police **Fredoka** partout, wordmark officiel **« BREAKEAT »** (artwork PNG, Raleway retiré), logo **« B éclair »** (lockup complet sur login, mark seul sur dashboard). Décision : factoriser les tokens dans un **package partagé** = source de vérité unique white-label.

### BLOC — Package partagé `@break-eat/brand`

**Fichiers créés :**
```
packages/brand/package.json          — nom @break-eat/brand, consommé en workspace:*
packages/brand/src/brand.ts          — objet BRAND + type Brand
packages/brand/src/BreakEatLogo.tsx  — composant logo (lockup + mark)
packages/brand/src/index.ts          — barrel export
```

**Tokens `BRAND` (palette canonique) :**
```
orange #FC4002 · orangeDark #DA3702 · orangeSoft #FDB9A3 · orangeTint rgba(252,64,2,0.08)
ink #1c1917 · inkSoft #44403c · grey #a8a29e · border #ece3dd
bg #ffffff · bgSubtle #faf7f5
shadowSoft 0 12px 44px rgba(252,64,2,0.10) · shadowButton 0 8px 20px rgba(252,64,2,0.28)
font var(--font-fredoka), system-ui, -apple-system, sans-serif
```

**Câblage :**
- `apps/admin/next.config.ts` + `apps/operator/next.config.ts` → `transpilePackages: ['@break-eat/brand']`
- `apps/admin/package.json` → dépendance `@break-eat/brand: workspace:*`
- Shims de compatibilité (imports existants `@/lib/brand` et `@/components/brand/BreakEatLogo`) : re-export du package.

### BLOC — Rebrand admin (chrome + 10 pages internes)

**Chrome :** `app/layout.tsx` (Fredoka + wordmark), `(admin)/layout.tsx` (sidebar blanche, nav active orange), `dashboard/page.tsx`, `login/page.tsx` (lockup), `globals.css`, `page.tsx`.

**Pages internes (10) converties aux tokens BRAND :**
```
(admin)/team/page.tsx
(admin)/venues/page.tsx
(admin)/events/page.tsx
(admin)/events/[id]/page.tsx
(admin)/feature-flags/page.tsx
(admin)/settings/page.tsx
(admin)/demo-setup/page.tsx
(admin)/suppliers/[id]/page.tsx
(admin)/organizations/[id]/page.tsx
(admin)/simulator/page.tsx
```

**Convention de mapping appliquée à l'identique :**

| Ancien (palette bleu/gris) | Nouveau (token BRAND) |
|----------------------------|-----------------------|
| `#2563eb` / `#3b82f6` (primaire) | `orange` (hover `orangeDark`) |
| CTA sombre « + Nouveau… » | `orange` + hover |
| nav sombre `#111827` / `#1f2937` | `ink` |
| titres `#111827` | `ink` |
| labels `#374151` / `#1f2937` | `inkSoft` |
| muted `#6b7280` / `#9ca3af` | `grey` |
| bordures `#d1d5db` / `#e5e7eb` | `border` |
| fonds clairs `#f9fafb` / `#f3f4f6` | `bgSubtle` |
| cartes `#fff` | `bg` **+ border** |
| color-picker white-label default `#2563eb` | `orange` |

**Couleurs sémantiques NON touchées :** erreur rouge, succès vert, warning ambre, money `#059669`, badges rôle/scope catégoriels, légende lifecycle `STATUS_COLOR` (PAID/ACCEPTED/PREPARING/READY/PICKED_UP/COMPLETED/RECOVERED/CANCELLED — partagée avec l'opérateur), `#7c3aed` rush simulateur.

### BLOC — Rebrand operator
`apps/operator/src/app/page.tsx` (login), `layout.tsx` (shell), `globals.css` — même identité white/orange + Fredoka.

### Vérification
```
pnpm --filter @break-eat/admin typecheck   → exit 0 — 0 erreur
grep (admin) chrome bleu/gris/bordure       → 0 résiduel
  (seules subsistent les couleurs lifecycle sémantiques #3b82f6 PAID / #6b7280 COMPLETED — intentionnel)
```

### Prochaine étape
Reconstruire le **dashboard opérateur** à partir des captures du product owner (écrans par créneau, boutons de statut, table produits), puis bâtir le **back office** (`apps/backoffice`, port 3003, SUPER_ADMIN, KPIs/CA/comptes/groupes).

---

## REFONTE DESIGN — Board opérateur + centralisation STATUS_COLORS + LoginForm partagé

**Date :** 06/06/2026
**Statut :** ✅ Terminée (alignement de marque du board ; rebuild par créneau toujours en attente du workflow product owner)

### Contexte
La refonte white-label (`@break-eat/brand`, 03/06) avait rebrandé le **login** et le **shell** de l'app operator, mais le **board opérateur lui-même** était resté sombre (header `#1f2937`, « 🍔 BREAK EAT », chips bleues `#1e3a5f`/`#3b82f6`, boutons gris `#374151`) et la table des couleurs de statut était **dupliquée 3×** (OrderCard, DashboardColumn, NotificationPopup). Cet incrément termine l'alignement et établit `StatusBadge.tsx` comme **source de vérité unique** des couleurs + libellés de statut.

### BLOC — Source de vérité unique des statuts
**Fichier modifié :**
```
apps/operator/src/components/StatusBadge.tsx
  — export const STATUS_COLORS  (couleur par StatusVariant, 8 statuts)
  — export const STATUS_LABELS  (libellé FR par statut)
```
Palette : `PAID` orange `#FC4002` (à traiter) · `ACCEPTED` `#2563EB` · `PREPARING` `#7C3AED` · `READY` `#059669` · `PICKED_UP` `#0891B2` · `COMPLETED` `#78716C` · `CANCELLED` `#DC2626` · `RECOVERED` `#D97706`.

### BLOC — Déduplication + tokens BRAND (composants kanban)
**Fichiers modifiés :**
```
apps/operator/src/components/OrderCard.tsx        — import BRAND + STATUS_COLORS ; suppression STATUS_COLORS local ; borderLeft 4px solid color ; boutons d'action mappés sur STATUS_COLORS
apps/operator/src/components/DashboardColumn.tsx  — import BRAND + STATUS_COLORS ; suppression maps COLUMN_BG/HEADER_COLOR ; headerColor = STATUS_COLORS[status] ; conteneur bgSubtle + borderTop 3px headerColor
apps/operator/src/components/NotificationPopup.tsx — bg = isReady ? STATUS_COLORS.READY : BRAND.orange
```

### BLOC — LoginForm opérateur partagé
**Fichier créé :**
```
apps/operator/src/components/LoginForm.tsx — login unique (BreakEatLogo size=54 showWordmark, « Portail opérateur », CTA orange), stocke operator_token
```
**Fichiers modifiés :**
```
apps/operator/src/app/page.tsx                       — utilise <LoginForm> (suppression du LoginForm inline)
apps/operator/src/app/dashboard/[eventId]/page.tsx   — utilise <LoginForm> (suppression de l'ANCIEN LoginForm sombre inline)
```

### BLOC — Header dashboard white-label
**Fichier modifié :** `apps/operator/src/app/dashboard/[eventId]/page.tsx`
- header blanc + `borderBottom border` : `BreakEatLogo size=26` + wordmark « BREAKEAT » + sous-titre `grey` « Dashboard opérateur »
- chip fournisseur orange (`orangeTint`/`orangeSoft`/`orangeDark`, 🏪 conservé) ; compteur « commandes actives » en `grey`
- helper `HeaderButton` (blanc, bordure `border`, hover orange) pour ↺ / plein écran ⊞⊠ / Déconnexion
- `ConnectionBadge` (sémantique vert/ambre/rouge) **conservé** ; wrapper `<main>` `bgSubtle` + Fredoka

### Vérification
```
pnpm --filter @break-eat/operator typecheck   → exit 0
pnpm --filter @break-eat/operator lint        → exit 0
pnpm --filter @break-eat/operator build       → ✓ 4 routes (/dashboard/[eventId] 7.56 kB)
STATUS_COLORS / STATUS_LABELS : définis à UN SEUL endroit (était : 3 copies)
```

### Périmètre (important)
Alignement de **marque** du board uniquement. La **restructuration par créneau** (board groupé par créneau au lieu de par statut) reste en attente de la démonstration du workflow par le product owner (« celui où je reçois toutes commandes de chaque créneau je te montrerais comment je fonctionne »). Le board groupe encore par **STATUT** (kanban PAID → RECOVERED).

---

## PHASE 11 — Écrans opérateur configurables (fondation backend : 11.1 + 11.2)

**Date :** 07/06/2026
**Statut :** ✅ Fondation backend terminée (schéma + migration + module CRUD/résolution). UI admin (11.3), rendu opérateur (11.4), contrat FlaixPrepPlan (11.5) → en attente.

### Contexte
Le board opérateur doit devenir **paramétrable** : ajouter des écrans, les afficher seulement pour certains créneaux, avec conditions d'affichage (statuts, fournisseurs, catégories/produits). Décision de co-conception : on commence par les **écrans configurables** modélisés comme **templates réutilisables au niveau organisation** (définis une fois — ex. « Spartiates buvette » — puis appliqués à plusieurs événements via une table de jonction).

### BLOC 11.1 — Schéma Prisma + migration
**Fichier modifié :**
```
backend/prisma/schema.prisma
  — enum SlotKind { IMMEDIATE PAUSE_1 PAUSE_2 GENERAL CUSTOM }
  — Slot.kind  SlotKind @default(IMMEDIATE)   (moment de récupération PORTABLE entre événements ; null-slot ⇒ IMMEDIATE)
  — enum OperatorScreenKind { ORDERS_QUEUE READY RECOVERED GENERAL }
  — model OperatorScreenTemplate  (org-scoped : name, kind, icon?, sortOrder, enabled, slotKinds[], statuses[] (OrderStatus), supplierIds[], filters Json, timestamps)
  — model EventOperatorScreen     (jonction : eventId+templateId, sortOrder?/enabled override par événement, @@unique([eventId,templateId]))
  — Organization.operatorScreenTemplates[] · Event.operatorScreens[]
```
**Fichier créé :**
```
backend/prisma/migrations/20260606_phase11_operator_screens/migration.sql
  — CREATE TYPE "slot_kind" + "operator_screen_kind"
  — ALTER TABLE "slots" ADD COLUMN "kind" "slot_kind" NOT NULL DEFAULT 'IMMEDIATE'
  — CREATE TABLE "operator_screen_templates" (slot_kinds "slot_kind"[] DEFAULT ARRAY[]::, statuses "order_status"[], supplier_ids TEXT[], filters JSONB DEFAULT '{}', TIMESTAMP(3))
  — CREATE TABLE "event_operator_screens"
  — FK ON DELETE CASCADE + unique (event_id, template_id) + index (event_id), (organization_id)
```
Appliquée via `prisma migrate deploy` (non destructif — conforme au garde-fou Prisma, pas de `migrate dev`/`reset`), puis `prisma generate`.

### BLOC 11.2 — OperatorScreensModule (backend)
**Fichiers créés :**
```
backend/src/modules/operator-screens/operator-screens.service.ts
  — CRUD templates (org-scoped ; écriture ORG_ADMIN/MANAGER, lecture tout membre, SUPER_ADMIN bypass)
  — applyToEvent/listEventScreens/updateEventScreen/removeEventScreen (jonction ; résout event→org)
  — resolveForEvent(eventId, userId, supplierIdParam?) : statuts par défaut depuis kind (DEFAULT_STATUSES), sortOrder effectif = lien ?? template, pin fournisseur (membership.supplierId ?? param), masque écrans d'un autre fournisseur, tri sortOrder→name
  — static sanitizeFilters (whitelist clés + dédup) · static mapKnownError (P2002→Conflict)
  — exports ScreenFilters, ResolvedOperatorScreen
backend/src/modules/operator-screens/operator-screen-templates.controller.ts  — organizations/:orgId/operator-screens (POST/GET/GET :screenId/PATCH/DELETE)
backend/src/modules/operator-screens/event-operator-screens.controller.ts     — events/:eventId/operator-screens (GET /resolved ?supplierId, GET, POST, PATCH/DELETE :linkId)
backend/src/modules/operator-screens/operator-screens.module.ts
backend/src/modules/operator-screens/dto/create-operator-screen.dto.ts
backend/src/modules/operator-screens/dto/update-operator-screen.dto.ts
backend/src/modules/operator-screens/dto/apply-event-screen.dto.ts
backend/src/modules/operator-screens/dto/update-event-screen.dto.ts
backend/src/modules/operator-screens/operator-screens.service.spec.ts          — 10 tests
```
**Fichier modifié :**
```
backend/src/app.module.ts — OperatorScreensModule enregistré (section « Phase 11 »)
```
**Note `filters`** : gardé opaque (`@IsObject`) au DTO — `whitelist`+`forbidNonWhitelisted` ne récurse pas dans un objet opaque, donc les clés internes survivent — puis **sanitizé serveur** (`categoryIds`/`excludeCategoryIds`/`productIds`/`excludeProductIds`/`showRecap`).

### Vérification
```
pnpm --filter @break-eat/backend typecheck   → exit 0
pnpm --filter @break-eat/backend lint         → 0 erreur
operator-screens.service.spec.ts              → 10/10 (sanitizeFilters ×3, createTemplate ×2, resolveForEvent ×3, applyToEvent ×2)
migration                                     → appliquée via prisma migrate deploy ; client régénéré
```

### BLOC 11.3 — UI admin (config templates + application par événement)
**Fichiers créés :**
```
apps/admin/src/components/operator-screens/screen-form.tsx
  — builder partagé : ScreenConditionsForm + ScreenDraft/EMPTY_DRAFT + templateToDraft/draftToInput
  — libellés source unique : KIND_LABELS / SLOT_KIND_LABELS / STATUS_LABELS (+ ordres)
  — UI différée : productIds/excludeProductIds/excludeCategoryIds câblés serveur mais non exposés (couvre categoryIds + showRecap)
apps/admin/src/app/(admin)/operator-screens/page.tsx        — liste (cartes summarize() + badge kind + compteur événements) + création inline
apps/admin/src/app/(admin)/operator-screens/[id]/page.tsx   — édition (ScreenConditionsForm) + suppression (zone de danger, bannière de comptage)
```
**Fichiers modifiés :**
```
apps/admin/src/lib/api/admin-client.ts
  — section Operator Screens : types (OperatorScreenTemplate, EventOperatorScreen, ScreenFilters, inputs) + 9 fonctions
  — kind?: SlotKind ajouté à l'interface Slot
apps/admin/src/app/(admin)/layout.tsx                       — nav « 🖥️ Écrans opérateur » (entre Groupes et Feature Flags)
apps/admin/src/app/(admin)/events/[id]/page.tsx             — carte « 🖥️ Écrans opérateur » (appliquer / réordonner ▲▼ / activer / retirer)
```
**Architecture** : deux surfaces calquées sur le backend — CRUD templates = page top-level `/operator-screens` (comme Groupes) ; application par événement = carte sur la page détail (comme l'accès par groupe). Ordre effectif d'un écran appliqué = `lien.sortOrder ?? template.sortOrder` ; le réordonnancement persiste un ordre explicite `0..n-1` en ne PATCHant que les lignes dont le `sortOrder` a dérivé.

### Vérification (11.3)
```
pnpm --filter @break-eat/admin typecheck   → exit 0
pnpm --filter @break-eat/admin lint         → 0 erreur
pnpm --filter @break-eat/admin build        → ✓ 15 routes (/operator-screens 2.41 kB, /operator-screens/[id] 2.17 kB, /events/[id] 7.45 kB)
```

### BLOC 11.4 — Board opérateur : rendu des écrans configurables (onglets + filtrage + Récap)
**Fichiers créés :**
```
apps/operator/src/lib/screens/filter.ts
  — helpers purs : itemMatchesFilters / hasActiveFilters / orderMatchesScreen / buildScreenColumns / countScreenOrders
apps/operator/src/components/RecapPanel.tsx
  — Accès rapide (recherche n° commande / nom client → 8 résultats) + Récap produits (agrégation catégorie→produits, N cmd · N u)
```
**Fichiers modifiés :**
```
backend/src/modules/orders/orders.service.ts
  — findDashboardByEvent enrichi : slotKind + customerName par commande, categoryId + categoryName par ligne
  — catégories résolues via UN product.findMany batché (OrderItem n'a pas de relation product)
  — PICKED_UP ajouté à DASHBOARD_STATUSES (écran « récupérées » = [PICKED_UP, RECOVERED])
backend/src/modules/orders/orders.service.spec.ts
  — mock prisma.product.findMany + 2 tests (enrichissement + skip lookup sans lignes) + maj test statuts
apps/operator/src/lib/api/orders-client.ts
  — Order (+slotKind/customerName), OrderItem (+categoryId/categoryName) ; types écrans résolus + fetchResolvedScreens
apps/operator/src/app/dashboard/[eventId]/page.tsx
  — ScreenTabBar (onglet par écran, compteur live) ; board = colonnes de l'écran actif (buildScreenColumns) ; fallback Kanban fixe si aucun écran ; toggle header « 📊 Récap »
```
**Le verrou** : le payload exposait `slotId` (pas `slot.kind`) et `productId` (pas la catégorie) → deux écrans ne différant que par le créneau auraient rendu un contenu identique. D'où l'aplatissement serveur de `slotKind`/`categoryId`/`categoryName` (+ `customerName` pour l'appel au retrait et la recherche). **Fallback** : sans écran configuré, le board garde le Kanban fixe historique (rétrocompat). **Différé** : regroupement « commandes similaires » (11.4c) + plan Flaix (11.5).

### Vérification (11.4)
```
pnpm --filter @break-eat/backend typecheck   → exit 0
pnpm --filter @break-eat/backend lint         → 0 erreur
pnpm --filter @break-eat/backend jest orders  → 88/88 (3 suites)
pnpm --filter @break-eat/operator typecheck   → exit 0
pnpm --filter @break-eat/operator lint         → 0 erreur
pnpm --filter @break-eat/operator build        → ✓ (/dashboard/[eventId] 9.37 kB)
```

### BLOC 11.4c — Regroupement visuel « X commandes similaires »
**Fichiers créés :**
```
apps/operator/src/lib/screens/grouping.ts
  — groupSimilarOrders : cluster des commandes par composition de panier identique (productId:quantity trié), FIFO-préservé, singletons = groupe de 1
apps/operator/src/components/OrderGroupCard.tsx
  — carte « empilée » : chip 🧩 N commandes, total articles + âge de la plus ancienne, badges de n°, composition partagée (× total), bouton batch (Accepter/Préparer/… les N) + dépliage « Voir les N » → OrderCard individuelles
```
**Fichiers modifiés :**
```
apps/operator/src/components/OrderCard.tsx
  — `elapsed` exporté (réutilisé par la carte de groupe)
apps/operator/src/components/DashboardColumn.tsx
  — API : orders: Order[] + toCardProps + grouped + onBatchAdvance ; rend des OrderGroupCard quand grouped, cartes plates sinon
apps/operator/src/app/dashboard/[eventId]/page.tsx
  — toggle header « 🧩 Grouper » (off par défaut, réversible) ; batchAdvance(orders) fait avancer tout le groupe au statut suivant (Promise.all) puis loadSnapshot()
apps/operator/src/stories/DashboardColumn.stories.tsx
  — stories migrées vers Order[] + toCardProps ; nouvelle story « 6 commandes identiques (groupées) »
```
**Principe** : le regroupement est un **affichage pur owned by Break** — aucune commande n'est fusionnée ou réordonnée, chacune garde son cycle de vie. Board groupé = **sur-ensemble** strict du board plat (singletons inchangés). Toggle **off par défaut** → comportement identique tant que l'opérateur n'active pas. Distinct de la difficulté Flaix (11.5), axe **séparé** posé par-dessus plus tard. Le compteur d'en-tête de colonne reste le nombre de **commandes** (pas de groupes).

### Vérification (11.4c)
```
pnpm --filter @break-eat/operator typecheck → exit 0
pnpm --filter @break-eat/operator lint       → 0 erreur
pnpm --filter @break-eat/operator build      → ✓ (/dashboard/[eventId] 10.3 kB)
```

### Prochaine étape
**Phase 11.5** — contrat `FlaixPrepPlan` (groupes facile/moyen/difficile + items agrégés + séquence) : affichage des groupes de préparation Flaix sur le board + **fallback local** quand Flaix est indisponible. **En attente du code Flaix** (l'utilisateur l'enverra pour caler le contrat des scores et catégories de commande). Dispo en parallèle : dashboards **manager** et **back office** (dev propre + docs), et documentation des 2 P1 (migration UUID + paymentStatus @map).

---

## [2026-06-07] Audit Codex — corrections sécurité & robustesse

L'utilisateur a fait auditer le dépôt par Codex (frontière d'audit précédente : 2026-06-02). Trois findings actionnables traités, un quatrième vérifié sain.

### P1 — Fuite d'événements privés via l'écran public READY (sécurité)
`GET /public/orders/event/:eventId/ready` n'avait **aucun garde** d'accès — connaître l'UUID d'un événement privé suffisait à lire les n° publics de ses commandes prêtes. Corrigé en miroir de `PublicEventsController` (Phase 14.4).
**Fichiers :**
```
backend/src/modules/orders/public-orders.controller.ts
  — @UseGuards(OptionalJwtAuthGuard) + canAccessEvent(eventId, user?.sub ?? null) ; 404 identique si refusé
backend/src/modules/orders/orders.module.ts
  — imports: [..., GroupsModule]
backend/src/modules/orders/public-orders.controller.spec.ts (créé)
  — 3 cas : anonyme autorisé · propagation sub · 404 + findReadyByEvent jamais appelé
```
PUBLIC → écran anonyme OK ; PRIVATE → membre authentifié seulement ; inconnu/refusé → 404 (jamais de fuite d'existence). Le client public (`/public/[eventId]`) fait déjà `if (!res.ok) return` → board vide, pas de crash.

### P2 — Batch opérateur non atomique (robustesse)
`batchAdvance` (11.4c) utilisait `Promise.all` : un échec en milieu de lot laissait un état mixte **et** sautait le refresh. Passé à `Promise.allSettled` + `loadSnapshot()` toujours exécuté + bannière `batchError` (« N/total… »).
```
apps/operator/src/app/dashboard/[eventId]/page.tsx
```

### P2 — Fichiers de build suivis par Git (hygiène)
```
git rm --cached apps/admin/tsconfig.tsbuildinfo apps/operator/tsconfig.tsbuildinfo
.gitignore  — + *.tsbuildinfo (section Build outputs)
```

### P1 (audit) — Pipeline racine Turbo : vérifié sain, pas un bug
`turbo run typecheck/build/lint` → **3× exit 0** ici (pnpm 11.3.0 = `packageManager`). CI (`pnpm/action-setup@v4`), Vercel (`pnpm install` + `pnpm build`), Railway (`corepack prepare pnpm@11.3.0`) provisionnent tous pnpm. L'échec Codex « Unable to find package manager binary » venait de son sandbox (pnpm absent du PATH), pas du dépôt. Fallback fiable documenté : builds package par package.

### Vérification
```
pnpm --filter @break-eat/backend test       → 25 suites / 306 tests (303 → +3)
pnpm --filter @break-eat/backend typecheck   → exit 0
pnpm --filter @break-eat/operator typecheck  → exit 0
pnpm --filter @break-eat/operator lint       → 0 erreur
pnpm --filter @break-eat/operator build      → ✓ (/dashboard/[eventId] 10.5 kB)
```

### Prochaine étape
**Commit/push** du changeset non commité (~132 fichiers, phases 6→14 + 11.x) après revue (aucun secret) — déclenche Railway/Vercel. Puis **Phase 11.5** (contrat FlaixPrepPlan, en attente du code Flaix) ou dashboards **manager** / **back office**.

---

*Ce fichier est mis à jour après chaque bloc complété.*
*Format : [PHASE].[BLOC] — Nom du bloc*
