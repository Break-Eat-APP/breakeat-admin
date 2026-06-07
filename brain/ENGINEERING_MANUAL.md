# BREAK EAT Engineering Manual

Version: living developer handbook

## Purpose

This document is the technical notice for BREAK EAT.

It must explain the application as if the team had built a complex machine and a future developer needed to understand every assembled block.

The goal is not marketing documentation. The goal is operational understanding.

If a new developer joins tomorrow, this manual must let them understand:

- what was built;
- why it was built that way;
- how each block works;
- where the code lives;
- which exact files and lines matter;
- how modules connect;
- what must not be changed casually;
- how to test or debug the block.

## Mandatory Rule

Every implementation task must update this manual.

No task is complete until `ENGINEERING_MANUAL.md` references the important code that was created or modified.

## Required Entry Format

Each task must add a section using this structure:

```text
## [YYYY-MM-DD] [Module or Block Name]

### What Was Built

Explain the concrete block that was created or modified.

### Why It Was Built

Explain the product, architecture or reliability reason.

### How It Works

Explain the runtime behavior step by step.

### Code References

- path/to/file.ts:line - what this line/function/class is responsible for
- path/to/other-file.ts:line - why this matters

### Data Flow

Explain how data enters the block, how it changes, and where it exits.

### Dependencies

List internal modules and external packages used by this block.

### Tests and Verification

List tests added and manual checks performed.

### Risks and Safe Change Rules

Explain what future developers must be careful with.

### Debugging Notes

Explain how to inspect logs, reproduce issues or validate behavior.
```

## Code Reference Rules

- References must point to real files.
- References must include line numbers once code exists.
- Do not reference generated files vaguely.
- Do not write "see module" without pointing to the exact file.
- For critical flows, reference the entry point and the persistence point.
- For realtime flows, reference the persistence point and the event emission point.
- For order flows, reference the state transition validation and audit trail write.

## Critical Blocks That Must Be Documented

The following blocks require detailed manual entries:

- project foundation;
- authentication;
- organizations and permissions;
- events and venues;
- suppliers and pickup points;
- products, categories and stock;
- cart;
- Stripe payment;
- order creation;
- order state machine;
- order audit trail;
- realtime outbox;
- dashboard snapshot;
- WebSocket reconnect behavior;
- slot allocation;
- Flaix decision application;
- feature flags;
- operator dashboard;
- public ready screen;
- deployment and monitoring.

## Documentation Quality Bar

A manual entry is acceptable only if another developer can answer:

- what changed?
- why was this decision made?
- where is the code?
- what line starts the flow?
- where is data persisted?
- where are events emitted?
- what tests protect it?
- what can break if it is changed?

If these questions cannot be answered, the implementation task is not finished.

---

## [2026-05-25] Phase 1 — Project Foundation

### What Was Built

Monorepo Turborepo + pnpm avec 4 packages : `backend` (NestJS), `apps/admin` (Next.js), `apps/operator` (Next.js), `apps/mobile` (React Native CLI). Infrastructure Docker locale (PostgreSQL 16 + Redis 7). CI GitHub Actions. Fichiers de config racine (ESLint, Prettier, gitignore, env.example).

### Why It Was Built

Aucune logique métier ne peut être développée sans une base technique stable. Cette phase garantit que TypeScript strict est actif partout, que tous les packages démarrent, que le CI est opérationnel, et que les conventions (formatage, lint, paths d'import) sont fixées une fois pour toutes.

### How It Works

**Démarrage local (ordre) :**
1. `docker-compose up -d` → PostgreSQL sur :5432, Redis sur :6379
2. `cp .env.example .env` → remplir les valeurs
3. `pnpm install` à la racine → installe tous les packages via workspaces
4. `cd backend && pnpm start:dev` → NestJS démarre sur :3000
5. `GET http://localhost:3000/health` → `{ status: "ok", timestamp: "...", environment: "development", version: "0.1.0" }`
6. `cd apps/admin && pnpm dev` → Next.js admin sur :3001
7. `cd apps/operator && pnpm dev` → Next.js operator sur :3002
8. `cd apps/mobile && pnpm start` → Metro bundler (Android/iOS setup requis séparément)

**Pipeline Turborepo :**
- `pnpm turbo lint` → ESLint sur tous les packages en parallèle
- `pnpm turbo typecheck` → tsc --noEmit sur tous les packages
- `pnpm turbo build` → build séquencé (dépendances d'abord via `dependsOn: ["^build"]`)
- Cache Turborepo dans `.turbo/` — un package non modifié n'est pas recompilé

**NestJS bootstrap :**
- `backend/src/main.ts:1` → `import './instrument'` — Sentry chargé en premier absolu
- `backend/src/main.ts:9` → `NestFactory.create(AppModule)` — création de l'application
- `backend/src/main.ts:18` → `ValidationPipe` global — actif pour toutes les routes dès Phase 2
- `backend/src/main.ts:25` → CORS configuré via `CORS_ORIGINS` env
- `backend/src/main.ts:29` → prefix global `/api/v1`

**Health check :**
- `backend/src/health/health.controller.ts:26` → méthode `check()` — retourne `HealthResponse`
- Route : `GET /health` (sans prefix `/api/v1` car configuré sur le controller directement)
- Doit répondre sans authentification — jamais ajouter de guard sur ce controller

**Configuration centralisée :**
- `backend/src/config/app.config.ts` → `registerAs('app', () => ({ ... }))` — toutes les env vars
- Pour lire une config dans un service : `constructor(private config: ConfigService) {}` puis `this.config.get('app.stripe.secretKey')`
- Jamais utiliser `process.env` directement dans un module métier

**WebSocket stub :**
- `apps/operator/src/lib/realtime/socket-client.ts:1` → définit les types `SocketStatus`, `RealtimeEvent`, la classe `SocketClient`
- Implémentation réelle en Phase 6
- Le chemin d'import est stable dès maintenant — les composants Phase 6 importeront depuis ce fichier

**Zustand store mobile :**
- `apps/mobile/src/store/app.store.ts` → `useAppStore` — état global minimal (`isReady`)
- Pattern pour les stores suivants : `create<InterfaceState>((set) => ({ ... }))` — pas de logique métier

**API client mobile :**
- `apps/mobile/src/lib/api/api-client.ts:1` → wrapper fetch typé avec `ApiError`
- `BASE_URL` = `process.env.API_URL ?? 'http://localhost:3000/api/v1'`
- Phase 2 ajoutera l'injection du JWT token dans les headers

### Code References

- `backend/src/main.ts:1` — import Sentry (doit rester en première ligne)
- `backend/src/main.ts:26` — port d'écoute depuis `process.env.PORT`
- `backend/src/health/health.controller.ts:26` — méthode `check()`, entrée du health check
- `backend/src/config/app.config.ts:1` — source de vérité de toutes les variables d'environnement
- `backend/src/app.module.ts:7` — imports du module racine (ajouter les nouveaux modules ici)
- `apps/operator/src/lib/realtime/socket-client.ts:42` — classe `SocketClient` stub
- `apps/mobile/src/store/app.store.ts:1` — premier store Zustand, modèle pour les suivants
- `apps/mobile/src/lib/api/api-client.ts:15` — classe `ApiError` avec status HTTP
- `apps/mobile/src/lib/query/query-client.ts:1` — QueryClient mobile avec retry exponentiel
- `apps/mobile/App.tsx:1` — import Sentry en premier, point d'entrée React Native

### Data Flow

Requête HTTP entrante → `main.ts` (bootstrap, middleware) → `AppModule` → `HealthModule` → `HealthController.check()` → retourne `HealthResponse` JSON.

Variables d'environnement → `.env` → `ConfigModule.forRoot({ load: [appConfig] })` → `ConfigService` injecté dans n'importe quel service.

### Dependencies

Externes : `@nestjs/*`, `@sentry/nestjs`, `@tanstack/react-query`, `zustand`, `@react-navigation/*`, `react-native`
Internes : aucune dépendance inter-packages en Phase 1

### Tests and Verification

Tests automatiques :
- `backend/src/health/health.controller.spec.ts` — 3 tests : status='ok', timestamp ISO valide, environment défini
- Lancer : `cd backend && pnpm test`

Vérification manuelle :
- `docker-compose up -d` → healthchecks passent (`docker ps` → status healthy)
- `pnpm start:dev` → `GET http://localhost:3000/health` → 200 OK
- `pnpm turbo typecheck` → 0 erreur TypeScript
- `pnpm turbo lint` → 0 erreur ESLint

### Risks and Safe Change Rules

**Ne pas modifier :**
- L'ordre des imports dans `main.ts` — Sentry doit rester en premier
- Le path `/health` dans `HealthController` — utilisé par Docker healthcheck et monitoring
- `ConfigModule.forRoot({ isGlobal: true })` dans `AppModule` — le retirer casserait tous les services qui injectent `ConfigService`

**Attention :**
- `apps/mobile/android/` et `ios/` sont vides — ne pas tenter de lancer l'app mobile sans avoir exécuté `npx react-native init` ou configuré les SDK natifs localement
- pnpm workspaces : toujours installer les dépendances depuis la racine (`pnpm add <pkg> --filter @break-eat/backend`)

### Debugging Notes

**Backend ne démarre pas :**
- Vérifier que `.env` existe et contient `DATABASE_URL` et `REDIS_URL`
- Vérifier que Docker est lancé : `docker-compose ps`

**Health check échoue :**
- `curl http://localhost:3000/health` — vérifier le port
- Vérifier que le prefix `/api/v1` n'est pas appliqué au health controller

**TypeScript error :**
- `cd backend && npx tsc --noEmit` pour voir les erreurs détaillées
- Vérifier que `emitDecoratorMetadata: true` est dans `tsconfig.json`

**Turbo cache stale :**
- `pnpm turbo clean` puis relancer

---

## [2026-05-25] Phase 2 — Auth + Organizations

### What Was Built

Système d'authentification JWT complet (register, login, refresh, logout, me) + module Organizations avec rôles. Prisma ORM avec 4 tables : `users`, `organizations`, `organization_members`, `refresh_tokens`. Guards et décorateurs réutilisables pour toutes les phases suivantes.

### Why It Was Built

Aucune fonctionnalité n'est accessible sans auth. Les guards créés ici (`JwtAuthGuard`, `RolesGuard`) protègent toutes les routes des phases 3 à 10. Les organisations sont la racine du modèle multi-tenant.

### How It Works

**Flux register :**
1. `POST /api/v1/auth/register` → `AuthController.register()` → `AuthService.register()`
2. `UsersService.create()` → vérifie email unique → hash argon2 → `prisma.user.create()`
3. `AuthService.generateTokens()` → signe JWT (15min) + génère refresh token aléatoire (64 bytes hex)
4. Refresh token haché SHA-256 → `prisma.refreshToken.create()`
5. Retourne `{ user, accessToken, refreshToken }`

**Flux login :**
1. `POST /api/v1/auth/login` → `AuthService.login()`
2. `UsersService.findByEmailWithPassword()` → null si inexistant (pas d'exception)
3. `argon2.verify(hash, plainPassword)` → false si mauvais mot de passe
4. Même erreur "Invalid credentials" dans les deux cas (sécurité : no email enumeration)
5. Génère tokens identiquement à register

**Flux refresh :**
1. `POST /api/v1/auth/refresh` → `AuthService.refresh(rawToken)`
2. SHA-256 du token reçu → cherche en DB → vérifie expiration
3. Supprime l'ancien token (rotation) → génère nouveaux tokens
4. Si token expiré : supprime + 401

**Flux logout :**
1. `POST /api/v1/auth/logout` → `prisma.refreshToken.deleteMany({ where: { tokenHash } })`
2. Idempotent — pas d'erreur si token inexistant

**Flux GET /auth/me :**
1. Bearer token extrait → `JwtStrategy.validate()` → payload attaché à `request.user`
2. `AuthService.me(userId)` → `UsersService.findById()` → retourne `SafeUser`

**Flux createOrganization :**
1. `POST /api/v1/organizations` (JWT requis) → `OrganizationsService.create()`
2. Vérifie slug unique → `prisma.$transaction()` : crée org + crée OrganizationMember (ORG_ADMIN)
3. Transaction garantit atomicité — impossibilité d'avoir une org sans admin

**Guards en action :**
```typescript
@UseGuards(JwtAuthGuard)           // vérifie et décode le JWT
@UseGuards(JwtAuthGuard, RolesGuard) // + vérifie GlobalRole
@Roles(GlobalRole.SUPER_ADMIN)      // route accessible uniquement aux super admins
```

### Code References

- `backend/src/modules/auth/auth.service.ts:94` — méthode `login()` entrée principale
- `backend/src/modules/auth/auth.service.ts:148` — méthode `generateTokens()` — génère access + refresh
- `backend/src/modules/auth/auth.service.ts:160` — hashage SHA-256 du refresh token
- `backend/src/modules/auth/strategies/jwt.strategy.ts:22` — `PassportStrategy` config (secret, extraction)
- `backend/src/modules/users/users.service.ts:52` — méthode `toSafeUser()` — exclut passwordHash
- `backend/src/modules/users/users.service.ts:36` — méthode `create()` — hash argon2 + persistence
- `backend/src/database/prisma.service.ts:14` — `onModuleInit` — connexion DB
- `backend/src/common/guards/roles.guard.ts:30` — lecture du metadata @Roles()
- `backend/src/modules/organizations/organizations.service.ts:48` — transaction création org + membership
- `backend/prisma/schema.prisma:1` — source de vérité du schéma DB

### Data Flow

**Auth tokens :**
Client → `POST /auth/login` → `AuthService` → `UsersService` (validation) → `JwtService.sign()` → access token → `prisma.refreshToken.create()` → response `{ user, accessToken, refreshToken }`

**Route protégée :**
Client `Authorization: Bearer <token>` → `JwtAuthGuard` → `JwtStrategy.validate()` → payload dans `request.user` → `@CurrentUser()` décore le paramètre → controller reçoit `JwtPayload`

### Dependencies

Externes : `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `argon2`, `@prisma/client`, `class-validator`, `class-transformer`
Internes : `PrismaService` (global), `UsersService` (exporté par UsersModule, importé par AuthModule)

### Tests and Verification

Tests automatiques :
- `backend/src/modules/auth/auth.service.spec.ts` — 8 tests couvrant register, login, logout
- Lancer : `cd backend && pnpm test`

Vérification manuelle (requiert Docker + DB) :
```bash
docker-compose up -d
cd backend && pnpm db:migrate    # applique migration Phase 2
pnpm start:dev

# Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","displayName":"Test User"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Me (remplacer TOKEN)
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer TOKEN"
```

### Risks and Safe Change Rules

**Ne pas modifier :**
- `auth.service.ts:generateTokens()` — toute modification du hashage des refresh tokens invalide les sessions actives
- `prisma.service.ts` — ne pas supprimer `onModuleDestroy` (risque de connexions non fermées)
- `toSafeUser()` dans UsersService — garantit que passwordHash ne fuite jamais

**Attention :**
- `pnpm db:migrate` doit être exécuté après le premier `docker-compose up`
- class-validator nécessite `useGlobalPipes(new ValidationPipe({ transform: true }))` dans main.ts — déjà configuré Phase 1

### Debugging Notes

**JWT invalide :**
- Vérifier que `JWT_SECRET` dans `.env` correspond à celui utilisé pour signer
- `jwt.io` pour décoder et inspecter le payload

**Migration échoue :**
- Vérifier que PostgreSQL est démarré : `docker-compose ps`
- Vérifier `DATABASE_URL` dans `.env`
- Si schéma déjà partiellement appliqué : `pnpm db:studio` pour inspecter l'état

**argon2 build error sur Windows :**
- argon2 compile du code natif — nécessite Visual Studio Build Tools
- Alternative : `pnpm approve-builds` puis `pnpm install`

---

## [2026-05-25] Phase 3 — Events, Venues, Suppliers, Pickup Points

### What Was Built

4 nouveaux modules NestJS + schéma Prisma Phase 3 : `Venue`, `Event`, `EventSupplier`, `Supplier`, `PickupPoint`. Helper commun `requireOrgAccess` partagé par tous les services. 9 endpoints de management d'event (dont transitions de statut et attach/detach supplier). 20 tests au total (dont 9 nouveaux sur EventsService).

### Why It Was Built

Les Events sont le contexte d'activation de toute la logique métier de BREAK EAT. Sans Venue + Event + Supplier + PickupPoint, Phase 4 (produits) et Phase 5 (checkout) n'ont pas de contexte pour fonctionner. Le statut machine de l'event protège les transitions et interdit les modifications sur ENDED/CANCELLED.

### How It Works

**Flux création event :**
1. `POST /api/v1/organizations/:orgId/events` → `EventsController.create()`
2. `requireOrgAccess(prisma, userId, orgId, MANAGE_ROLES)` — vérifie ORG_ADMIN ou MANAGER
3. Vérifie que `venueId` appartient à l'org
4. Valide que `endAt > startAt`
5. `prisma.event.create()` → status DRAFT par défaut

**Flux activation event :**
1. `PATCH /api/v1/organizations/:orgId/events/:id/status` → `{ status: "ACTIVE" }`
2. `guardFinalized()` — rejette si ENDED ou CANCELLED
3. `validateTransition()` — vérifie la matrice des transitions autorisées
4. `prisma.event.update({ status })` → log structuré

**Transitions autorisées :**
```
DRAFT  → ACTIVE | CANCELLED
ACTIVE → PAUSED | ENDED | CANCELLED
PAUSED → ACTIVE | ENDED | CANCELLED
ENDED  → (terminal — aucune modification possible)
CANCELLED → (terminal — aucune modification possible)
```

**Attach/Detach supplier :**
1. `POST /api/v1/organizations/:orgId/events/:id/suppliers` → `{ supplierId }`
2. Vérifie event + supplier appartiennent au même org
3. `@@unique([eventId, supplierId])` → ConflictException si déjà attaché
4. `DELETE /api/v1/organizations/:orgId/events/:id/suppliers/:supplierId` → supprime EventSupplier row

**Helper commun `requireOrgAccess` :**
- `backend/src/common/helpers/require-org-access.ts:1`
- Signature : `requireOrgAccess(prisma, userId, organizationId, allowedRoles?)`
- Constantes exportées : `MANAGE_ROLES` = [ORG_ADMIN, MANAGER], `ALL_ORG_ROLES` = tous
- Utilisé par VenuesService, SuppliersService, EventsService, PickupPointsService

### Code References

- `backend/src/common/helpers/require-org-access.ts:1` — helper partagé, toujours utiliser pour vérifier l'accès org
- `backend/src/modules/events/events.service.ts:1` — service principal Phase 3, logique de transition
- `backend/src/modules/events/events.service.ts:247` — `guardFinalized()` — bloque les modifications sur ENDED/CANCELLED
- `backend/src/modules/events/events.service.ts:257` — `validateTransition()` — matrice des transitions d'état
- `backend/src/modules/events/events.service.ts:163` — `attachSupplier()` — point d'entrée assignment supplier↔event
- `backend/src/modules/venues/venues.service.ts:1` — CRUD venues
- `backend/src/modules/suppliers/suppliers.service.ts:1` — CRUD suppliers + changement status
- `backend/src/modules/pickup-points/pickup-points.service.ts:1` — CRUD pickup points avec filtres query
- `backend/prisma/schema.prisma:1` — Venue, Event, EventSupplier, Supplier, PickupPoint ajoutés
- `backend/prisma/migrations/20260525_phase3_events_venues_suppliers/migration.sql` — migration Phase 3

### Data Flow

**Création d'un event complet :**
```
Org créée (Phase 2)
  → Venue créée (POST /venues) — lie org + adresse physique
  → Supplier créé (POST /suppliers) — opérateur de restauration
  → Event créé (POST /events, status=DRAFT) — lie org + venue + dates
  → Supplier attaché (POST /events/:id/suppliers)
  → PickupPoints créés (POST /pickup-points, venueId + eventId + supplierId)
  → Event activé (PATCH /events/:id/status, status=ACTIVE)
→ Phase 4 peut créer des produits pour ce supplier
→ Phase 5 peut ouvrir le checkout sur cet event
```

### Dependencies

Externes : `@prisma/client` (Venue, Event, Supplier, EventSupplier, PickupPoint, nouveaux enums)
Internes : `PrismaService` (global), `requireOrgAccess` helper (commun), `JwtAuthGuard`, `CurrentUser`

### Tests and Verification

Tests automatiques :
- `backend/src/modules/events/events.service.spec.ts` — 9 tests
  - create: succès, ForbiddenException, venue introuvable, endAt <= startAt
  - updateStatus: DRAFT→ACTIVE, transition invalide, event CANCELLED
  - attachSupplier: succès, ConflictException si déjà attaché
- Total backend : `pnpm test` → 20 tests ✅

Vérification manuelle (après `pnpm db:migrate`) :
```bash
# Après docker-compose up et migration Phase 2 déjà appliquée :
cd backend && pnpm db:migrate   # applique migration Phase 3
pnpm start:dev

# Créer une venue
curl -X POST http://localhost:3000/api/v1/organizations/:orgId/venues \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Stade de France","address":"ZAC du Cornillon Nord, 93216 Saint-Denis","timezone":"Europe/Paris"}'

# Créer un event
curl -X POST http://localhost:3000/api/v1/organizations/:orgId/events \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"venueId":"...","name":"Match PSG","startAt":"2026-09-15T19:00:00Z","endAt":"2026-09-15T23:00:00Z"}'

# Activer l'event
curl -X PATCH http://localhost:3000/api/v1/organizations/:orgId/events/:eventId/status \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE"}'
```

### Risks and Safe Change Rules

**Ne pas modifier :**
- `validateTransition()` dans `events.service.ts` — la matrice des transitions est la source de vérité du cycle de vie d'un event. Tout changement doit être discuté avec le product owner.
- `guardFinalized()` — les events ENDED/CANCELLED ne doivent jamais être modifiables (intégrité des audits Phase 6)
- `requireOrgAccess` dans `require-org-access.ts` — utilisé par 4 services. Un changement casse la sécurité partout.

**Attention :**
- `pnpm db:migrate` doit être exécuté après `docker-compose up` (2 migrations : Phase 2 + Phase 3)
- `pnpm db:generate` est nécessaire après tout changement de `schema.prisma` avant `pnpm typecheck`
- `stripeAccountId` sur Supplier est nullable — sera rempli en Phase 5 (Stripe Connect)

### Debugging Notes

**Event bloqué en DRAFT :**
- Vérifier que le caller a le rôle MANAGE_ROLES (ORG_ADMIN ou MANAGER)
- La transition DRAFT → ACTIVE est la seule façon d'activer un event

**ForbiddenException sur toutes les routes Phase 3 :**
- Vérifier que le JWT est valide et que l'utilisateur est membre de l'org avec le bon rôle
- `requireOrgAccess` log le userId et organizationId via PrismaService

**Supplier non trouvé lors de l'attach :**
- Le supplier DOIT appartenir à la même organisation que l'event
- Vérifier avec `GET /organizations/:orgId/suppliers` que le supplier existe bien

---

## [2026-05-26] Phase 4 — Products, Categories, Stock

### What Was Built

3 modules NestJS complets : `categories`, `products`, `stock`. Ces modules couvrent le catalogue complet d'un supplier — de la définition du menu (Category/Product) à la gestion de l'inventaire temps réel (Stock).

### Why It Was Built

Phase 6 (Cart/Orders) a besoin des entités Product et Stock pour :
- Construire un panier avec des items référençant des produits réels
- Bloquer les produits indisponibles à la commande
- Faire un snapshot de prix au moment de la commande (jamais depuis le produit mutable)

### How It Works

**Category** : appartient à un supplier. Ordonnée par `sortOrder` (drag-and-drop UX). Suppression bloquée si des produits la référencent (RESTRICT FK). Routes imbriquées sous `/suppliers/:supplierId/categories`.

**Product** : appartient à un supplier ET une category. Prix en centimes (Int) — jamais Float pour l'argent. `availableFrom`/`availableUntil` sont des fenêtres de disponibilité horaire (ex: menu petit-déjeuner). Routes imbriquées sous `/suppliers/:supplierId/products`.

**Stock** : deux types d'entrées :
1. Stock global (pas de pickupPointId) — une seule entrée par produit (index partiel DB)
2. Stock par pickup point — une entrée par (produit, pickup point) (index partiel DB)

Règle `isAvailable` :
- Quantity → 0 : service force `isAvailable = false` automatiquement
- OPERATOR peut basculer `isAvailable` (route `/availability`) mais ne peut pas forcer `true` si qty = 0
- MANAGER/ORG_ADMIN peuvent modifier la quantité (route principale PATCH)

### Code References

- `backend/src/modules/products/products.service.ts:requireCategoryForSupplier` — vérifie que categoryId appartient bien au supplier demandé (BadRequestException sinon)
- `backend/src/modules/stock/stock.service.ts:create` — gestion unicité stock global (ConflictException si doublon), auto-isAvailable=false si qty=0
- `backend/src/modules/stock/stock.service.ts:update` — force isAvailable=false si newQuantity=0
- `backend/src/modules/stock/stock.service.ts:updateAvailability` — OPERATOR allowed, guard qty=0
- `backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql` — index partiels stock, CHECK price>=0, CHECK qty>=0

### Data Flow

**Création d'un produit :**
1. `POST /organizations/:orgId/suppliers/:supplierId/products`
2. Vérifie org membership (requireOrgAccess)
3. Vérifie supplier ∈ org
4. Vérifie category.supplierId === supplierId (BadRequestException sinon)
5. `prisma.product.create()`

**Mise à jour stock (OPERATOR, 86 un article) :**
1. `PATCH /organizations/:orgId/stock/:stockId/availability`
2. Vérifie org membership (OPERATOR autorisé)
3. Vérifie stock ∈ org via `supplier.organizationId`
4. Si `stock.quantity === 0` → force `isAvailable = false` quelle que soit la valeur du DTO
5. `prisma.stock.update({ isAvailable })`

### Dependencies

- `@prisma/client` — CategoryStatus, ProductStatus, Category, Product, Stock types
- `require-org-access.ts` — helper partagé pour les vérifications d'appartenance org
- `OrgRole.OPERATOR` — rôle autorisé pour `updateAvailability` uniquement

### Tests and Verification

```bash
cd backend && pnpm test
# 57 tests, 8 suites — tous passent
# products.service.spec.ts — 8 tests
# stock.service.spec.ts — 9 tests

pnpm typecheck  # 0 erreur
pnpm lint       # 0 erreur
```

### Risks and Safe Change Rules

**Prix :**
- TOUJOURS stocker le prix en centimes (Int). Un produit à €4.50 = 450 en base.
- Ne jamais utiliser `Float` ou `Decimal` pour les prix dans ce projet.
- Le prix affiché côté client se calcule avec `price / 100`.

**Stock décrémentation :**
- `StockService.update()` est la méthode manuelle (admin/manager)
- La décrémentation automatique sur prise de commande est en **Phase 6** — ne pas implémenter ici
- Si `quantity` atteint 0, le produit est automatiquement marqué indisponible

**Suppression de Category :**
- ON DELETE RESTRICT — la suppression échoue si des produits référencent la category
- Le service intercepte l'erreur Prisma P2003 et retourne ConflictException 409 propre

### Debugging Notes

**`pnpm db:migrate` après Phase 4 :**
```bash
docker-compose up -d
cd backend && pnpm db:migrate
```

**Stock disponibilité incohérente :**
- Vérifier que `quantity > 0` ET `isAvailable = true` en base
- Si `quantity = 0` et `isAvailable = true` : c'est un état legacy à corriger via PATCH `/availability`

**availableFrom/availableUntil non appliqués :**
- Ces champs sont stockés mais non vérifiés par l'API Phase 4
- Le gate sera appliqué en Phase 6 (Cart) lors de l'ajout au panier

---

## [2026-05-25] Codex Audit Corrections — Phase 1 & 2

### What Was Built

Corrections de 6 problèmes identifiés par l'audit Codex sur les phases 1 et 2. Ces corrections garantissent que typecheck, lint, et builds passent à zéro erreur sur tous les packages.

### Why It Was Built

Avant de démarrer la Phase 3, l'audit avait détecté des régressions silencieuses (process.env non typé, health route mal documentée, lint cassé). Ces corrections protègent la base technique.

### How It Works

**Fix 1 — Mobile config typée :**
- `apps/mobile/src/lib/config/env.ts` — module centralisé pour toutes les env vars React Native
- `apps/mobile/src/types/globals.d.ts` — déclaration ambiante de `process.env` (sans @types/node)
- `apps/mobile/src/instrument.ts` — utilise `ENV.SENTRY_DSN`, `ENV.NODE_ENV`, `ENV.IS_PRODUCTION`
- `apps/mobile/src/lib/api/api-client.ts` — utilise `ENV.API_URL` au lieu de `process.env.API_URL`

**Fix 2 — Health route correctement exclue :**
- `backend/src/main.ts:27` — `app.setGlobalPrefix('api/v1', { exclude: ['health'] })`
- Route `/health` est réellement hors du prefix `/api/v1`

**Fix 3 — Turbo depuis la racine :**
- `package.json` contient `"packageManager": "pnpm@11.3.0"` — corepack le reconnaît automatiquement
- Commande de setup: `corepack enable` (une seule fois sur la machine) puis `pnpm install` depuis la racine
- `pnpm turbo lint/typecheck/build` fonctionne depuis la racine (vérifié — 4 packages, 0 erreur)

**Fix 4 — Lint compatible ESLint 9 flat config :**
- `apps/admin/package.json:9` — `"lint": "eslint src/"` (remplace `next lint`)
- `apps/operator/package.json:9` — `"lint": "eslint src/"` (remplace `next lint`)
- Pas de per-app `eslint.config.mjs` nécessaire — ESLint 9 remonte jusqu'au fichier racine

**Fix 5 — Builds vérifiés :**
- Backend : `pnpm build` → `nest build` ✓ | `pnpm test` → 11 tests ✓
- Admin : `pnpm build` → Next.js static ✓
- Operator : `pnpm build` → Next.js static ✓
- Mobile : `pnpm typecheck` → 0 erreur ✓
- Racine : `pnpm typecheck` → 4 packages, 0 erreur ✓
- Racine : `pnpm lint` → 4 packages, 0 erreur ✓

**Fix supplémentaire — Lint backend :**
- `backend/src/modules/auth/auth.service.ts:8` — import `argon2` supprimé (non utilisé — délégué à UsersService)
- `backend/src/modules/organizations/dto/add-member.dto.ts:1` — import `IsString` supprimé (non utilisé)

### Code References

- `apps/mobile/src/lib/config/env.ts:1` — source de vérité des env vars mobile, toujours importer depuis ici
- `apps/mobile/src/types/globals.d.ts:1` — déclaration `process.env` sans @types/node
- `apps/mobile/src/instrument.ts:1` — Sentry mobile, maintenant via `ENV`
- `apps/mobile/src/lib/api/api-client.ts:1` — API client, `BASE_URL` depuis `ENV.API_URL`
- `backend/src/main.ts:27` — `exclude: ['health']` — critique pour Docker healthcheck
- `apps/admin/package.json:9` — `eslint src/` compatible ESLint 9
- `apps/operator/package.json:9` — `eslint src/` compatible ESLint 9

### Data Flow

Aucun flux de données modifié. Corrections purement structurelles et de configuration.

### Dependencies

Aucune nouvelle dépendance ajoutée.

### Tests and Verification

```bash
# Vérification complète depuis la racine
pnpm typecheck   # 4 packages, 0 erreur
pnpm lint        # 4 packages, 0 erreur

# Backend
cd backend && pnpm test    # 11 tests passent
cd backend && pnpm build   # nest build OK

# Apps
cd apps/admin && pnpm build      # Next.js static OK
cd apps/operator && pnpm build   # Next.js static OK
cd apps/mobile && pnpm typecheck # 0 erreur TypeScript
```

### Risks and Safe Change Rules

**Mobile env vars :**
- Toujours ajouter une nouvelle variable d'environnement dans `apps/mobile/src/lib/config/env.ts`
- Ne jamais utiliser `process.env` directement dans le code métier mobile
- La déclaration dans `globals.d.ts` est intentionnellement minimale — ne pas ajouter d'autres types Node.js

**ESLint lint :**
- `apps/admin` et `apps/operator` utilisent la config ESLint racine via traversée de répertoire
- Si un package nécessite des règles spécifiques (ex: Next.js plugin), créer un `eslint.config.mjs` local dans ce package

### Debugging Notes

**corepack / pnpm non reconnu :**
```bash
corepack enable     # Une seule fois, active pnpm via corepack
pnpm install        # Depuis la racine du monorepo
```

**`next lint` échoue :**
- `next lint` utilise sa propre config ESLint, incompatible avec ESLint 9 flat config
- Utiliser `eslint src/` à la place (déjà corrigé dans admin et operator)

**Mobile typecheck échoue sur `process` :**
- Vérifier que `apps/mobile/src/types/globals.d.ts` existe
- Vérifier que `tsconfig.json` inclut `src/**/*` (c'est le cas)

---

## [2026-05-25] Codex Audit Corrections — Phase 2 & 3

### What Was Built

Corrections de 6 problèmes de sécurité et de robustesse identifiés par l'audit Codex sur les phases 2 et 3.

### Why It Was Built

L'audit Phase 2/3 a détecté : pipeline Turbo cassé depuis la racine (mobile `--ext` incompatible ESLint 9), absence de vérification base de données dans JwtStrategy (un compte désactivé gardait l'accès pendant 15 min), SUPER_ADMIN non implémenté dans requireOrgAccess, `addMember` ne vérifiant pas l'existence de l'utilisateur cible, incohérence de venue sur PickupPoint et un cast string dirty dans SuppliersService.

### How It Works

**Fix 1 — Turbo pipeline racine :**
- `apps/mobile/package.json` — script `lint` corrigé (`eslint src/`, suppression de `--ext` incompatible ESLint 9) + script `build` ajouté (`tsc --noEmit`)
- `turbo.json` — `test.dependsOn` : `["^build"]` → `[]` (tests indépendants du build, plus rapides et non bloqués par un échec de compilation)

**Fix 2 — SUPER_ADMIN dans requireOrgAccess :**
- `backend/src/common/helpers/require-org-access.ts` — récupère `user.globalRole` en base (pas depuis le JWT) au début du helper. Si `SUPER_ADMIN`, retour immédiat sans vérifier l'appartenance org. La vérification en base (pas JWT) garantit qu'une révocation de rôle est effective immédiatement.

**Fix 3 — SUPER_ADMIN dans OrganizationsService :**
- `organizations.service.ts:findById` — accepte `callerGlobalRole: string`, bypass le check membership si SUPER_ADMIN
- `organizations.service.ts:addMember` — accepte `callerGlobalRole: string`, bypass le check ORG_ADMIN si SUPER_ADMIN + vérifie que `targetUser` existe (NotFoundException si non)
- `organizations.controller.ts` — passe `user.globalRole` aux deux méthodes

**Fix 4 — JwtStrategy : vérification base de données (isActive) :**
- `jwt.strategy.ts` — injecte `PrismaService`, `validate()` devient `async`, requête `user.findUnique` sur `payload.sub`, lève 401 si user inexistant ou `isActive = false`. Protège contre : compte supprimé avec JWT encore valide, compte désactivé post-émission du token.
- ⚠️ À ce stade, `globalRole` n'était PAS encore rechargé depuis la base — voir section P1 ci-dessous.

**Fix 5 — PickupPoint cohérence venue :**
- `pickup-points.service.ts:create` — après avoir trouvé l'event, vérifie `event.venueId === dto.venueId`. Lève `BadRequestException` si incohérent. Garantit qu'un point de retrait ne peut pas être dans un venue différent de celui de l'event.

**Fix 6 — Cast OrgRole propre :**
- `suppliers.service.ts:updateStatus` — remplace `'OPERATOR' as const` par `OrgRole.OPERATOR`. Import `OrgRole` ajouté.

### Code References

- `backend/src/common/helpers/require-org-access.ts:36` — query `user.globalRole` + bypass SUPER_ADMIN
- `backend/src/modules/auth/strategies/jwt.strategy.ts:43` — `async validate()` avec check isActive
- `backend/src/modules/organizations/organizations.service.ts:findById` — SUPER_ADMIN bypass membership
- `backend/src/modules/organizations/organizations.service.ts:addMember` — SUPER_ADMIN + NotFoundException targetUser
- `backend/src/modules/pickup-points/pickup-points.service.ts:create` — check `event.venueId !== dto.venueId`
- `backend/src/modules/suppliers/suppliers.service.ts:105` — `OrgRole.OPERATOR` (plus de cast string)

### Data Flow

**requireOrgAccess (nouveau flux) :**
1. Query `prisma.user.findUnique(userId, select: globalRole)`
2. Si `globalRole === SUPER_ADMIN` → return (bypass)
3. Query `prisma.organizationMember.findUnique(userId, orgId)`
4. Vérification membership + role → ForbiddenException ou return

**JwtStrategy.validate (nouveau flux — voir aussi P1 ci-dessous) :**
1. Vérifie `payload.sub` présent
2. Query `prisma.user.findUnique(payload.sub, select: id, isActive)` — à ce stade, sans globalRole
3. Si null ou `isActive = false` → UnauthorizedException
4. Retourne le payload (attaché à `request.user` par Passport)

### Dependencies

Aucune nouvelle dépendance. `PrismaService` (global) injecté dans `JwtStrategy`.

### Tests and Verification

Nouveaux fichiers de test :
- `backend/src/modules/auth/strategies/jwt.strategy.spec.ts` — 4 tests : payload valide, user inexistant, user inactif, sub manquant
- `backend/src/modules/organizations/organizations.service.spec.ts` — 9 tests : findById (member, non-member, SUPER_ADMIN, 404), addMember (ORG_ADMIN, non-admin, 404 target, doublon, SUPER_ADMIN)
- `backend/src/modules/pickup-points/pickup-points.service.spec.ts` — 5 tests : create success, sans event, venue mismatch, venue 404, event 404

Fichier mis à jour :
- `backend/src/modules/events/events.service.spec.ts` — mock `user: { findUnique: jest.fn() }` ajouté (requis par requireOrgAccess)

```bash
cd backend && pnpm test    # 36 tests attendus (20 + 16 nouveaux)
pnpm lint                  # 0 erreur
pnpm typecheck             # 0 erreur
```

### Risks and Safe Change Rules

**requireOrgAccess :**
- La query `user.globalRole` est intentionnellement en base (pas depuis le JWT) — ne pas optimiser vers le JWT sans réfléchir aux implications de révocation
- Si `user` est null dans `requireOrgAccess` (userId inconnu), `user?.globalRole` est undefined ≠ SUPER_ADMIN : le check membership s'exécute normalement et échoue sur ForbiddenException

**JwtStrategy :**
- `validate()` fait maintenant 1 query DB par requête authentifiée. Pour de très hauts volumes, envisager un cache Redis court (< TTL du token) en Phase 10
- Ne jamais retourner le `passwordHash` depuis `validate()`

### Debugging Notes

**SUPER_ADMIN non bypassé :**
- Vérifier que le user a `globalRole = SUPER_ADMIN` en base (pas seulement dans le JWT)
- Rappel : requireOrgAccess lit le globalRole en base, pas depuis le payload JWT

**401 après désactivation d'un compte :**
- Comportement attendu — le token reste syntaxiquement valide mais JwtStrategy rejette à cause de `isActive = false`
- Le token doit être révoqué côté client lors de la désactivation

---

## [2026-05-26] Codex Audit P1 — JwtStrategy globalRole + Pipeline corepack

### What Was Built

Deux correctifs P1 bloquant le passage en Phase 5 :
1. `JwtStrategy.validate()` retournait le `globalRole` embarqué dans le JWT (valeur figée à l'émission du token) au lieu de la valeur live en base.
2. Le pipeline Turbo via `corepack pnpm typecheck/lint` échouait avec "Unable to find package manager binary" sur Windows selon la méthode d'installation de pnpm.

### Why It Was Built

**P1 globalRole stale :** `organizations.controller.ts` et `roles.guard.ts` lisent `request.user.globalRole`. Si un admin révoque le rôle SUPER_ADMIN d'un utilisateur, ce dernier conservait les droits élevés jusqu'à l'expiration du JWT (15 min). Ce n'est pas acceptable pour un bypass de sécurité critique.

**P1 pipeline corepack :** Turbo v2 résout le binaire `pnpm` via PATH. Quand pnpm est installé exclusivement via les shims corepack sur Windows, Turbo ne trouve pas le binaire lors de l'exécution des tâches par-package, ce qui bloque `pnpm typecheck/lint/build` depuis la racine du monorepo.

### How It Works

**Fix 1 — globalRole rechargé depuis la base :**
- `jwt.strategy.ts:validate()` — le select DB passe de `{ id, isActive }` à `{ id, isActive, globalRole }`
- La méthode retourne `{ ...payload, globalRole: user.globalRole }` au lieu de `payload` brut
- Résultat : `request.user.globalRole` reflète **toujours** l'état actuel de la base, pas le JWT émis
- La DB est déjà interrogée à chaque requête (pour le check isActive), donc le coût additionnel est nul

**Fix 2 — `.npmrc` + setup documenté :**
- `.npmrc` ajouté à la racine avec `package-manager-strict=false` — désactive l'enforcement strict de version corepack qui peut interférer avec la résolution du binaire par Turbo
- Invocation correcte : `pnpm typecheck` (pas `corepack pnpm typecheck`)
- Setup one-time requis une seule fois sur chaque machine développeur :
  ```bash
  corepack enable                             # active les shims pnpm/yarn dans PATH
  corepack prepare pnpm@11.3.0 --activate    # active la version exacte
  # OU méthode alternative (Windows recommandé si corepack pose problème) :
  npm install -g pnpm@11.3.0
  ```

### Code References

- `backend/src/modules/auth/strategies/jwt.strategy.ts:44` — `select: { id, isActive, globalRole }` — DB query complète
- `backend/src/modules/auth/strategies/jwt.strategy.ts:52` — `return { ...payload, globalRole: user.globalRole }` — globalRole frais
- `backend/src/modules/auth/strategies/jwt.strategy.spec.ts:41` — test "returns payload with globalRole refreshed from DB" — prouve que le DB globalRole écrase le JWT globalRole
- `.npmrc:6` — `package-manager-strict=false` — permet à Turbo de trouver pnpm sans corepack strict

### Data Flow

**JwtStrategy.validate() — flux corrigé :**
1. Vérifie `payload.sub` présent → sinon UnauthorizedException
2. `prisma.user.findUnique(payload.sub, select: { id, isActive, globalRole })`
3. Si null ou `isActive = false` → UnauthorizedException
4. Retourne `{ ...payload, globalRole: user.globalRole }` — `globalRole` DB, reste du payload JWT
5. Passport attache ce résultat à `request.user`
6. `@CurrentUser()` donne accès à `request.user.globalRole` **toujours à jour**

### Dependencies

Aucune nouvelle dépendance. Changement interne à `PrismaService` (sélection d'un champ supplémentaire).

### Tests and Verification

```bash
cd backend && pnpm test
# jwt.strategy.spec.ts — test "returns payload with globalRole refreshed from DB" ✅
# Scénario testé : JWT a globalRole='CUSTOMER', DB a globalRole='SUPER_ADMIN'
# → le résultat retourné doit avoir globalRole='SUPER_ADMIN'

pnpm typecheck  # 0 erreur
pnpm lint       # 0 erreur
```

**Pipeline racine :**
```bash
# Une seule fois (Windows) :
corepack enable && corepack prepare pnpm@11.3.0 --activate
# OU : npm install -g pnpm@11.3.0

# Puis depuis la racine du monorepo :
pnpm typecheck   # → turbo typecheck → tous les packages
pnpm lint        # → turbo lint → tous les packages
```

### Risks and Safe Change Rules

**Ne jamais retourner `payload` brut depuis `validate()` :**
- Si un développeur "optimise" en supprimant le spread `{ ...payload, globalRole: user.globalRole }` pour retourner `payload`, le `globalRole` JWT figé réapparaît. Le test `jwt.strategy.spec.ts` protège contre cela.

**La DB query est intentionnelle à chaque requête :**
- `validate()` fait 1 query DB par requête authentifiée (déjà le cas avant ce fix pour `isActive`)
- Ne pas déplacer vers un cache JWT sans mesurer l'impact sécurité (révocation de rôle)

### Debugging Notes

**globalRole stale malgré le fix :**
- Vérifier que `jwt.strategy.ts` retourne bien `{ ...payload, globalRole: user.globalRole }` et non `payload` seul
- Décoder le JWT sur jwt.io pour vérifier la valeur embarquée — elle doit être différente du résultat de `GET /auth/me`

**Pipeline "Unable to find package manager binary" :**
- Vérifier que `pnpm --version` fonctionne dans le terminal courant
- Si non : exécuter `corepack enable` (ou `npm i -g pnpm@11.3.0`) puis relancer
- Utiliser `pnpm typecheck` (pas `corepack pnpm typecheck`) — la double indirection cause parfois le problème
- Depuis v0.8.0 : `pnpm typecheck/lint` utilisent `pnpm -r run` directement, sans passer par Turbo → fonctionne sans configuration corepack

---

## [2026-05-26] Codex Audit Phase 4 — UUID Fix + Stock/Product validations + Categories tests

### What Was Built

Corrections de 4 problèmes (2 P1 + 2 P2 + 1 P3) détectés après Phase 4 :
1. Migration Phase 4 avait des colonnes `TEXT` au lieu de `UUID` — FK vers `suppliers.id UUID` et `pickup_points.id UUID` échouaient au `db:migrate`
2. Pipeline `pnpm typecheck/lint` depuis la racine toujours cassé — remplacé `turbo` par `pnpm -r run` dans les scripts racine
3. Stock : pickup point pouvait appartenir à un supplier différent de celui du stock
4. Products : `availableUntil` pouvait être antérieur à `availableFrom`
5. Categories : aucun test — 8 tests créés

### Why It Was Built

- P1 UUID : PostgreSQL interdit les FK entre types incompatibles. `TEXT → UUID` lève `ERROR: foreign key constraint violates type`. La migration aurait échoué sur toute vraie instance PostgreSQL.
- P1 pipeline : Turbo v2 résout le binaire pnpm via PATH ; quand pnpm n'est accessible que via corepack et que corepack enable n'a pas été exécuté, la commande échoue. `pnpm -r run` utilise directement le processus pnpm courant — aucune résolution externe.
- P2 stock supplier : un opérateur mal intentionné ou une erreur de code pourrait associer du stock du supplier A à un point de retrait réservé au supplier B — cela corrompt l'inventaire affiché aux clients.
- P2 date window : `availableUntil = 10h00, availableFrom = 12h00` crée une fenêtre impossible. Phase 6 (Cart) dépend de ces valeurs pour bloquer des produits.
- P3 categories : la logique de suppression avec détection P2003 n'était pas couverte.

### How It Works

**UUID fix :**
- Toutes les colonnes id Phase 4 : `UUID NOT NULL DEFAULT gen_random_uuid()`
- Toutes les FK vers tables Phase 3 : `UUID NOT NULL` (ou `UUID` si nullable)
- Convention du projet : `String @id @default(uuid())` dans le schéma Prisma (sans `@db.Uuid`), `UUID` dans le SQL manuel — Prisma envoie les valeurs comme strings, PostgreSQL cast implicitement.

**Pipeline fix :**
- `package.json scripts.typecheck` = `pnpm -r run typecheck` (pnpm workspace recursion)
- `package.json scripts.lint` = `pnpm -r run lint`
- `build` et `test` restent sous Turbo (bénéfice du cache)

**Stock pickup point check :**
- `requirePickupPointInOrg(pickupPointId, organizationId, stockSupplierId)`
- Si `pickupPoint.supplierId !== null && pickupPoint.supplierId !== stockSupplierId` → BadRequestException
- `supplierId = null` = point partagé → tout supplier de l'org peut y créer du stock

**Product date window :**
- Méthode `validateDateWindow(from?, until?)` — appelée dans `create()` et `update()`
- Dans `update()` : résolution des valeurs effectives avant validation (merge dto + existing) pour détecter les incohérences même si un seul des deux champs est mis à jour
- Lève BadRequestException si `until <= from`

### Code References

- `backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql` — toutes les colonnes en UUID
- `backend/src/modules/stock/stock.service.ts:requirePickupPointInOrg` — check supplier après check org
- `backend/src/modules/products/products.service.ts:validateDateWindow` — guard temporel
- `backend/src/modules/products/products.service.ts:update` — résolution effective window avant appel validateDateWindow
- `backend/src/modules/categories/categories.service.spec.ts` — 8 tests categories
- `package.json:9-10` — `pnpm -r run typecheck/lint`

### Data Flow

**db:migrate Phase 4 :**
```
PostgreSQL reçoit CREATE TABLE categories (id UUID, supplier_id UUID, ...)
                  ADD FK categories.supplier_id → suppliers.id  (UUID → UUID ✓)
PostgreSQL reçoit CREATE TABLE products (id UUID, supplier_id UUID, category_id UUID, ...)
                  ADD FK products.supplier_id → suppliers.id    (UUID → UUID ✓)
                  ADD FK products.category_id → categories.id   (UUID → UUID ✓)
PostgreSQL reçoit CREATE TABLE stock (id UUID, product_id UUID, supplier_id UUID, pickup_point_id UUID, ...)
                  ADD FK stock.product_id → products.id         (UUID → UUID ✓)
                  ADD FK stock.supplier_id → suppliers.id       (UUID → UUID ✓)
                  ADD FK stock.pickup_point_id → pickup_points.id (UUID → UUID ✓)
```

### Dependencies

Aucune nouvelle dépendance.

### Tests and Verification

```bash
cd backend && pnpm test
# categories.service.spec.ts — 8 tests ✅
# stock.service.spec.ts — 10 tests (9 + 1 nouveau) ✅
# products.service.spec.ts — 10 tests (8 + 2 nouveaux, dont date window) ✅
# Total : 67 tests attendus

pnpm typecheck  # pnpm -r run → 0 erreur ✅ (sans dépendance Turbo)
pnpm lint       # pnpm -r run → 0 erreur ✅
```

**Vérification migration après correction :**
```bash
docker-compose up -d
cd backend && pnpm db:migrate   # doit passer sans FK type error
# Si une migration partielle a été appliquée, rollback + relance
```

### Risks and Safe Change Rules

**Migration UUID :**
- Si la migration avait été appliquée partiellement avant le fix, les tables incohérentes doivent être supprimées et la migration réappliquée
- Toutes les futures migrations Phase 5+ doivent utiliser `UUID NOT NULL DEFAULT gen_random_uuid()` pour les nouvelles tables

**Pipeline pnpm -r run :**
- `pnpm -r run typecheck` et `pnpm -r run lint` n'ont pas de cache Turbo — acceptable pour le workflow dev
- Pour CI : utiliser `pnpm -r run typecheck` ou `turbo typecheck` selon l'environnement CI (turbo fonctionne si pnpm est dans PATH)

**Date window dans update() :**
- La résolution "effective from/until" fusionne `dto` + `existing` — si un test mocke `existing.availableFrom` comme `null`, `effectiveFrom` sera undefined, et la validation ne bloque pas si seul `availableUntil` est fourni (fenêtre ouverte à gauche = valide)

### Debugging Notes

**FK type error lors de db:migrate :**
- Message PostgreSQL : `ERROR: foreign key constraint X violates type constraint`
- Cause : colonne `TEXT` référence colonne `UUID`
- Fix : vérifier que toutes les colonnes FK vers Phase 3 sont `UUID` dans la migration

**Stock BadRequestException sur pickupPointId :**
- Message : "Pickup point is scoped to a different supplier"
- Vérifier que le pickup point a `supplierId = null` (partagé) ou `supplierId = votre supplierId`

---

## [2026-05-27] Phase 5 — Cart, Checkout, Stripe Connect, Orders

### What Was Built

Pipeline complet d'achat customer V1 : Cart (server-side) → Checkout (Stripe PaymentIntent) → Webhook handler → Order creation transactionnelle. Plus l'onboarding Stripe Connect des Suppliers (compte Standard, mirror status).

7 nouveaux fichiers de service, 4 nouveaux modules NestJS, 1 migration Prisma majeure (5 enums + 6 modèles), 21 nouveaux tests.

### Why It Was Built

Sans paiement, l'application n'a pas de revenu. Sans Order, pas d'audit, pas de dashboard, pas d'historique. Sans Stripe Connect, le marketplace n'est pas légal (les fonds ne peuvent pas être encaissés par BREAK EAT puis redistribués sans agrément financier). Connect transfère directement aux suppliers, BREAK EAT prélève une commission via `application_fee_amount`.

### How It Works

**Flux complet customer →  Order :**
```
1. Customer crée un Cart (POST /carts) → CartStatus.OPEN
2. Customer ajoute des items (POST /carts/:id/items)
   → Validation : product status ACTIVE, fenêtre horaire, stock dispo
3. Customer définit pickup point (PATCH /carts/:id)
4. Customer lance checkout (POST /carts/:id/checkout)
   → Re-validation totale des items
   → Stripe.paymentIntents.create avec idempotencyKey = "cart_${cartId}"
   → Cart transitionne CHECKOUT_PENDING + paymentIntentId stocké
   → Réponse: { paymentIntentId, clientSecret, amountCents }
5. Client confirme paiement avec Stripe Elements (clientSecret)
6. Stripe envoie webhook POST /webhooks/stripe → payment_intent.succeeded
7. StripeWebhooksService.handleEvent :
   → Vérifie signature
   → Insère WebhookEvent (idempotency UNIQUE)
   → Dispatch → OrdersService.createFromPaymentIntent
8. OrdersService.createFromPaymentIntent transaction :
   → Cart→CONVERTED
   → Order créé (status PAID, public_order_number BE-XXXXXXXX via sequence)
   → OrderItems créés avec SNAPSHOT (productNameSnapshot + unitPriceCentsSnapshot)
   → Payment créé (stripePaymentIntentId UNIQUE)
   → OrderAuditTrail première entrée : null → PAID, actor=SYSTEM
   → Stock décrémenté atomiquement (per-pickup-point first, fallback global)
```

**Stripe Connect onboarding supplier :**
```
1. ORG_ADMIN/MANAGER appelle POST /organizations/:orgId/suppliers/:id/stripe/onboarding-link
2. SuppliersService.createOnboardingLink :
   → Crée Stripe Account type=standard si stripeAccountId absent
   → Sauvegarde stripeAccountId + status=PENDING
   → Génère AccountLink (URL one-shot)
3. Supplier suit l'URL → onboarding Stripe (KYC, banque, etc.)
4. Stripe envoie webhook account.updated quand statut change
5. StripeWebhooksService met à jour Supplier.stripeAccountStatus + mirrors
   → ACTIVE = charges_enabled && payouts_enabled
   → RESTRICTED = details_submitted mais capabilities manquantes
   → PENDING = onboarding incomplet
```

**Idempotency à 3 niveaux :**
1. **Checkout** : Stripe `idempotencyKey = cart_${cartId}` — Stripe lui-même garantit pas de doublon PaymentIntent
2. **Webhook reception** : `webhook_events.stripeEventId` UNIQUE → duplicate delivery → skip
3. **Order creation** : `payments.stripePaymentIntentId` UNIQUE → si Payment existe avec Order lié, on retourne l'Order existant

### Code References

- `backend/src/modules/payments/stripe.service.ts:60` — `createConnectAccount` — création compte Connect Standard
- `backend/src/modules/payments/stripe.service.ts:108` — `createPaymentIntent` — calcul application_fee_amount = amount × bps / 10000
- `backend/src/modules/payments/stripe.service.ts:135` — `constructWebhookEvent` — vérification signature Stripe
- `backend/src/modules/cart/cart.service.ts:262` — `checkout` — point d'entrée Checkout
- `backend/src/modules/cart/cart.service.ts:312` — Idempotency : retourne le PaymentIntent existant si CHECKOUT_PENDING
- `backend/src/modules/orders/orders.service.ts:36` — `createFromPaymentIntent` — point d'entrée Order creation
- `backend/src/modules/orders/orders.service.ts:99` — `prisma.$transaction` — bloc transactionnel critique
- `backend/src/modules/orders/orders.service.ts:140` — Decrement stock atomique dans la transaction
- `backend/src/modules/webhooks/stripe-webhooks.service.ts:36` — `handleEvent` — dispatch + idempotency
- `backend/src/modules/suppliers/suppliers.service.ts:128` — `createOnboardingLink` — onboarding entry
- `backend/src/main.ts:18` — `app.use('/webhooks/stripe', raw(...))` — middleware raw body AVANT json parser
- `backend/prisma/migrations/20260527_phase5_stripe_connect/migration.sql` — sequence order_public_seq + toutes tables Phase 5

### Data Flow

**Argent (multi-supplier marketplace flow) :**
```
Customer paye 16.00 € (1600 cents) avec sa CB
→ Stripe charge 16.00 €
→ application_fee_amount = 1600 × 500bps / 10000 = 80 cents (5%)
→ Transfer destination = supplier.stripeAccountId
→ Supplier reçoit 15.20 € sur son compte Stripe Connect
→ BREAK EAT (plateforme) reçoit 0.80 € comme application fee
```

**Order audit (trail append-only) :**
```
Phase 5 (création) :
  audit_trail : { previous: null, next: PAID, actor: SYSTEM }
Phase 6 (operator workflow) :
  audit_trail : { previous: PAID, next: ACCEPTED, actor: OPERATOR, actorId: userId }
  audit_trail : { previous: ACCEPTED, next: PREPARING, actor: OPERATOR }
  audit_trail : { previous: PREPARING, next: READY, actor: OPERATOR }
  audit_trail : { previous: READY, next: PICKED_UP, actor: OPERATOR }
  audit_trail : { previous: PICKED_UP, next: COMPLETED, actor: SYSTEM, reason: "auto-close" }
```

### Dependencies

Nouvelles externes :
- `stripe@17.7.0` — SDK officiel Stripe

Internes :
- `PrismaService` injecté dans tous les nouveaux services
- `StripeService` exporté par `PaymentsModule` (@Global) → injectable depuis Cart, Suppliers, Webhooks
- `OrdersService` exporté par `OrdersModule` → utilisé par WebhooksModule

### Tests and Verification

```bash
cd backend && pnpm test --runInBand
# 89 tests, 12 suites — tous passent
# cart.service.spec.ts             — 12 tests
# orders.service.spec.ts           — 5 tests
# stripe-webhooks.service.spec.ts  — 4 tests

pnpm typecheck    # 4 packages, 0 erreur
pnpm lint         # 4 packages, 0 erreur
```

**Vérification manuelle (requires Docker + Stripe CLI) :**
```bash
docker-compose up -d
cd backend && pnpm db:migrate

# Terminal A : backend
pnpm start:dev

# Terminal B : Stripe CLI (forward webhooks vers localhost)
stripe listen --forward-to localhost:3000/webhooks/stripe
# Copie le whsec_ printed → ajoute dans .env STRIPE_WEBHOOK_SECRET

# Terminal C : test flow
# 1. Onboard un supplier
curl -X POST http://localhost:3000/api/v1/organizations/$ORG/suppliers/$SUP/stripe/onboarding-link \
  -H "Authorization: Bearer $TOKEN" -d '{}'
# Suivre l'URL retournée, compléter avec données test Stripe

# 2. Créer un cart + ajouter items + checkout
curl -X POST http://localhost:3000/api/v1/carts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"eventId":"...","supplierId":"...","pickupPointId":"..."}'
curl -X POST http://localhost:3000/api/v1/carts/$CART/items \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"productId":"...","quantity":2}'
curl -X POST http://localhost:3000/api/v1/carts/$CART/checkout \
  -H "Authorization: Bearer $TOKEN"
# Récupère clientSecret + amountCents

# 3. Trigger un paiement test avec Stripe CLI
stripe trigger payment_intent.succeeded
# → webhook reçu → Order créé
```

### Risks and Safe Change Rules

**Ne JAMAIS toucher sans réfléchir :**
- `cart.service.ts:checkout` idempotency block — si on supprime la check `paymentIntentId && CHECKOUT_PENDING`, un double-call crée 2 PaymentIntents
- `orders.service.ts:createFromPaymentIntent` transaction — toute opération ajoutée doit rester DANS le `$transaction` ou être idempotente
- `stripe.service.ts:platformFeeBps` — changement de fee modifie tous les futurs paiements ; coordonner avec finance
- `main.ts:app.use('/webhooks/stripe', raw(...))` — DOIT être avant `json()` sinon signature verification échoue silencieusement
- `webhook_events` table — DROP/TRUNCATE = perte de l'idempotency log → potentiel doublon d'Orders sur replay

**Attention :**
- Order JAMAIS créé avant `payment_intent.succeeded` (règle ORDER_STATE_MACHINE)
- OrderItem stocke des SNAPSHOTS — si le produit change après commande, l'Order continue à montrer les anciennes valeurs
- Cart reste en CHECKOUT_PENDING jusqu'au webhook → si Stripe webhook ne vient jamais (rare), Cart bloque ; sweeper Phase 9 ré-ouvre
- Stock decrement = pas atomique entre transactions Phase 5 et autres futures actions — pour très haute concurrence, ajouter SELECT FOR UPDATE en Phase 10

### Debugging Notes

**Order pas créé après paiement :**
1. Stripe Dashboard → webhook events : statut delivery ?
2. Backend logs : "Webhook handler error" ?
3. Table `webhook_events` : entry présente ? processedAt set ?
4. Si processedAt null → handler a thrown → check le message
5. Si processedAt set mais pas d'Order → bug logique, vérifier les conditions de retour précoce

**Double Order créé :**
- Vérifier `payments.stripePaymentIntentId` UNIQUE constraint en DB
- Vérifier `webhook_events.stripeEventId` UNIQUE
- Si les contraintes existent et qu'il y a quand même 2 Orders → race condition dans `prisma.$transaction` (rare)

**Webhook signature invalid :**
- `STRIPE_WEBHOOK_SECRET` ne correspond pas à celui du dashboard
- Body parser JSON a parsé le body avant la signature verification (vérifier ordre middleware dans main.ts)
- Reverse proxy / CDN modifie le body en transit

**Supplier reste PENDING après onboarding complet :**
- Stripe webhook `account.updated` non reçu → trigger manuel `GET /stripe/status`
- Capabilities Stripe pas encore actives (peut prendre quelques minutes)
- KYC supplémentaire requis (Stripe le signale dans `account.requirements`)

---

## [2026-06-01] Codex Audit P1/P2/P3 — Phase 5 Hardening

### What Was Built

5 corrections critiques sur le pipeline Cart → Order suite à l'audit Codex :
1. Décrémentation de stock atomique (anti-oversell)
2. Snapshots de prix figés au checkout (cohérence Payment ↔ Order)
3. Payment upsert au lieu de create (retry après FAILED)
4. Pipeline racine `pnpm build/typecheck/lint` compatible corepack
5. Documentation Stripe corrigée
6. Bonus : DOCX Phase 4 + Phase 5 livrés

### Why It Was Built

L'audit a identifié 4 P1 critiques :
- **Stock oversell** : pendant un rush, 2 commandes concurrentes pouvaient consommer la même dernière unité. Risque commercial : vendre du stock inexistant.
- **Amount divergence** : si le prix d'un produit change entre `POST /checkout` et la réception du webhook Stripe, `Payment.amountCents` (montant Stripe) et `Order.totalCents` (recalculé) divergeaient. Risque financier : comptabilité fausse.
- **Failed → Succeeded crash** : Stripe permet de reconfirmer un PaymentIntent failed. Le webhook succeeded planatait sur P2002 UNIQUE car la row Payment FAILED existait déjà. Risque opérationnel : orders perdus.
- **Pipeline cassé** : `corepack pnpm build` échouait car le script appelait Turbo qui ne trouvait pas pnpm en PATH. Bloquait l'audit automatisé.

### How It Works

**Fix #1 — Atomic stock decrement (`orders.service.ts:170+`) :**
```typescript
const decremented = await tx.stock.updateMany({
  where: { id: target.id, quantity: { gte: item.quantity } },
  data: { quantity: { decrement: item.quantity } },
});
if (decremented.count === 0) throw new ConflictException('Insufficient stock');
```
La clause `WHERE quantity >= item.quantity` rend l'opération atomique au niveau DB : deux transactions concurrentes ne peuvent pas toutes deux décrémenter en passant sous zéro. Si la condition échoue, `count = 0` et on throw → rollback complet (Order non créé, Cart non converted).

**Fix #2 — Price snapshot at checkout (`cart.service.ts:330+`) :**
```typescript
// In checkout, freeze prices on every CartItem BEFORE creating PaymentIntent
await this.prisma.$transaction(
  view.items.map((it) =>
    this.prisma.cartItem.update({
      where: { id: it.id },
      data: { priceSnapshotCents: it.unitPriceCents },
    }),
  ),
);
```
Schéma : `CartItem.priceSnapshotCents Int?` ajouté (nullable, défini au checkout). `computeView()` lit `priceSnapshotCents ?? product.price` — donc une fois checkout effectué, le prix est figé pour toujours, même si Product.price change.

Au moment du webhook, `OrdersService.createFromPaymentIntent` :
1. Lit les snapshots depuis CartItem
2. Calcule `subtotalCents` à partir des snapshots
3. **Vérification défensive** : `if (subtotalCents !== intent.amount) throw ConflictException`. Si pour une raison quelconque les montants divergent, l'Order n'est pas créé → équipe ops alertée par log Sentry.

**Fix #3 — Payment upsert (`orders.service.ts:140+`) :**
```typescript
await tx.payment.upsert({
  where: { stripePaymentIntentId: paymentIntentId },
  create: { ...orderData, status: SUCCEEDED },
  update: { orderId, status: SUCCEEDED, failureReason: null, rawStripeEvent },
});
```
Si `recordFailedPayment` a déjà créé une row Payment FAILED pour ce PaymentIntent (cas Stripe retry), l'upsert la met à jour proprement au lieu de raise P2002.

**Fix #4 — Pipeline (`package.json`) :**
```json
"build": "pnpm -r run build",
"build:turbo": "turbo build",
```
`pnpm -r run` est interprété par pnpm directement (pas de child process qui doit retrouver `pnpm` en PATH). Compatible avec `corepack pnpm <cmd>` sur tous environnements. Turbo reste disponible via `pnpm build:turbo` pour le caching local.

### Code References

- `backend/src/modules/orders/orders.service.ts:99` — defensive amount check (P1 #2)
- `backend/src/modules/orders/orders.service.ts:140` — Payment.upsert (P1 #3)
- `backend/src/modules/orders/orders.service.ts:175` — atomic stock decrement (P1 #1)
- `backend/src/modules/cart/cart.service.ts:330` — price freeze transaction (P1 #2)
- `backend/src/modules/cart/cart.service.ts:220` — computeView uses snapshot ?? live
- `backend/prisma/migrations/20260601_phase5_codex_audit/migration.sql` — schema addition
- `package.json:7` — `build: pnpm -r run build` (P1 #4)
- `backend/src/modules/payments/stripe.service.ts:14` — corrected comment (P3 #7)

### Tests and Verification

```bash
cd backend && pnpm test --runInBand
# 94 tests / 12 suites ✅
# 5 nouveaux tests audit-guards :
#   orders.service.spec.ts:
#     - refuses when CartItem has no price snapshot
#     - refuses when computed total diverges from PaymentIntent amount (P1 #2)
#     - throws ConflictException when stock is insufficient (P1 #1)
#     - upserts Payment when a FAILED row already exists (P1 #3)
#   cart.service.spec.ts:
#     - freezes prices on every CartItem before creating PaymentIntent (P1 #2)

# Pipeline root (codex perspective)
pnpm typecheck   # 4 packages ✅
pnpm lint        # 4 packages ✅
pnpm build       # 4 packages ✅
```

### Risks and Safe Change Rules

**Carts in flight (CHECKOUT_PENDING) lors du déploiement de cette fix :**
- Les carts créés avant le fix n'ont pas `priceSnapshotCents` → le guard "no price snapshot" les rejette
- Mitigation : abandonner ces carts manuellement OU script de migration qui set `priceSnapshotCents = product.price` une fois pour ces carts
- En staging actuellement (aucun cart prod) → impact nul

**Race condition lors du decrement :**
- Le fix est correct au niveau DB (PostgreSQL atomic UPDATE)
- MAIS un test de charge sera fait Phase 10 (rush testing) pour valider sous 1000+ orders/min
- Si le throughput est limité par les conflicts, on ajoutera `SELECT FOR UPDATE` explicite

**Defensive amount check :**
- Bloque la création d'Order si subtotal != intent.amount, même pour 1 cent d'écart
- Si Stripe garantit des montants exacts (ce qu'il fait — tout en intégers), aucun faux positif attendu
- Tout faux positif = bug grave → log Sentry critique

### Debugging Notes

**"CartItem has no price snapshot" en webhook :**
- Le cart a été créé/checkout avant le déploiement du fix
- Ou bug dans `cart.service.checkout` qui n'aurait pas exécuté le `$transaction` de freeze
- Vérifier en DB : `SELECT id, price_snapshot_cents FROM cart_items WHERE cart_id = ...`

**"Insufficient stock" alors qu'il y avait du stock :**
- Race condition récente — vérifier les logs Sentry pour les 2 transactions concurrentes
- Vérifier `stock.quantity` en DB après le throw — doit être < quantity demandée

**"Order total does not match PaymentIntent amount" :**
- Très grave — investigation manuelle obligatoire
- Comparer `Payment.amountCents` (Stripe), `Order.totalCents` (computed), et `CartItem.priceSnapshotCents` sum
- Probablement un bug de devise (cents vs entiers vs floats)
- En attendant le fix, l'Order n'est PAS créé → customer reçoit notification d'erreur

---

## [2026-06-01] Codex Audit Phase 5 (2e passe) — SOURCE DE VÉRITÉ pipeline + checkout

> ⚠️ **Cette section SUPERSÈDE toutes les décisions pipeline antérieures** (notamment le `pnpm -r run` de v0.8.0 / [0.10.2]). En cas de contradiction avec une section plus ancienne, c'est CELLE-CI qui fait foi.

### Pipeline racine — décision FINALE : `turbo run`

```json
"build":     "turbo run build",
"dev":       "turbo run dev",
"lint":      "turbo run lint",
"typecheck": "turbo run typecheck",
"test":      "turbo run test",
"clean":     "turbo run clean && rimraf node_modules"
```

**Pourquoi `turbo run` et pas `pnpm -r run` :**
- Historique : v0.8.0 était passé de `turbo` à `pnpm -r run` pour contourner un souci de résolution du binaire pnpm par Turbo sur Windows.
- Problème découvert par l'audit (2e passe) : `corepack pnpm typecheck` exécute le script `typecheck`, dont le corps `pnpm -r run typecheck` appelle un **`pnpm` imbriqué qui n'est PAS dans le PATH** (pnpm vit dans le cache corepack, pas dans `node_modules/.bin`) → échec.
- **Fix racine :** `turbo` EST dans `node_modules/.bin` (donc ajouté au PATH par pnpm quand il lance un script). `turbo run typecheck` se résout donc toujours. Les tâches par-package (`tsc --noEmit`, `eslint`) sont des binaires locaux que Turbo lance directement — elles n'ont jamais besoin de `pnpm`.
- **Vérifié :** `corepack pnpm typecheck` ET `corepack pnpm lint` → 4/4 packages verts, via les scripts (la commande exacte que l'audit disait cassée).

**Invocation correcte (dev, CI, et audit Codex) :**
```bash
corepack pnpm install          # une fois
corepack pnpm typecheck        # → turbo run typecheck → 4 packages
corepack pnpm lint             # → turbo run lint
corepack pnpm build            # → turbo run build (respecte ^build)
corepack pnpm test             # → turbo run test
```
Bénéfice bonus : le cache Turbo est de retour (un package non modifié = `FULL TURBO`, instantané).

### Tests déterministes (fin du flaky parallèle)

`backend/package.json` → `jest.maxWorkers: 1`. Les suites s'exécutent en série (~16s pour 95 tests), ce qui élimine la race de workers ts-jest observée en parallèle. **Plus besoin de `--runInBand`** — c'est le défaut maintenant.

### Checkout — invariant de timing du snapshot prix (P1 #1)

Règle absolue dans `cart.service.ts::checkout` :
1. Calculer la vue (prix live), capturer `frozenPrices` en mémoire.
2. **Appeler Stripe AVANT toute écriture DB.** Si Stripe jette → on s'arrête, le cart reste `OPEN`, aucun snapshot écrit.
3. **UNE seule transaction** écrit les `priceSnapshotCents` ET bascule `status → CHECKOUT_PENDING` + `paymentIntentId`. Atomique → un cart n'est JAMAIS `OPEN`-avec-snapshot.

Garde défensive dans `computeView()` : tant que `status === OPEN`, on lit **toujours** `product.price` (jamais le snapshot). Un snapshot résiduel (ancienne donnée, migration) ne peut donc pas produire un total obsolète sur un retry. Le snapshot ne devient autoritatif qu'à partir de `CHECKOUT_PENDING`/`CONVERTED`.

> Ceci corrige/remplace la note antérieure "computeView lit `priceSnapshotCents ?? product.price`" : désormais c'est `status === OPEN ? product.price : (priceSnapshotCents ?? product.price)`.

### Sécurité `.gitignore` (P1 #3) — politique

- On ignore **nominativement** les secrets, JAMAIS `*.json` en bloc (sinon package.json/tsconfig.json/vercel.json disparaîtraient) :
  `firebase-app-distribution-key.json`, `firebase-adminsdk-*.json`, `**/google-services.json`, `**/GoogleService-Info.plist`, `service-account*.json`, `gcp-*.json`, `*.p8`, `*.p12`, `*.mobileprovision`, `*.cer`, `*.certSigningRequest`, `*.keystore`, `*.jks`, `.claude/settings.local.json`.
- **Vérification obligatoire avant tout commit/push :** `git status` ne doit montrer AUCUN de ces fichiers. Contrôle ciblé : `git check-ignore <chemin-clé>` doit renvoyer le chemin.
- Seul `.env.example` (placeholders uniquement) est suivi ; tous les vrais `.env*` sont ignorés.

### Git & fins de ligne

- Repo initialisé en local (branche `main`), commit initial `fbf6147`. Remote GitHub : `Break-Eat-APP/breakeat-admin`.
- `.gitattributes` force `eol=lf` pour le texte (les builds tournent sur Linux Railway/Vercel) et marque `binary` les `.docx/.pdf/.png/.p8/.p12/.keystore`. Les copies de travail Windows peuvent rester en CRLF.

---

## [2026-06-01] Bloc 6.0 — Infrastructure Staging SOURCE DE VÉRITÉ

### URLs staging

| Service | URL |
|---|---|
| Admin (Vercel) | https://breakeat-admin-admin.vercel.app |
| Operator (Vercel) | https://breakeat-operator-git-main-breakeatapp-1555s-projects.vercel.app |
| Backend (Railway) | https://breakeat-admin-production.up.railway.app |
| Health | https://breakeat-admin-production.up.railway.app/health |
| API base | https://breakeat-admin-production.up.railway.app/api/v1 |

### Vercel — configuration correcte (monorepo)

Chaque app a son propre projet Vercel avec **Root Directory** pointant sur son dossier :
- `breakeat-admin-admin` → Root Directory = `apps/admin`
- `breakeat-operator` → Root Directory = `apps/operator`

Le `vercel.json` dans chaque app définit :
```json
{
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "buildCommand": "pnpm build",
  "framework": "nextjs",
  "outputDirectory": ".next",
  "regions": ["cdg1"]
}
```
**Règle :** les champs Build/Install/Output dans le dashboard Vercel restent **vides** — `vercel.json` est la source de vérité.

### Railway — configuration correcte (monorepo pnpm)

**Root Directory = vide** (obligatoire) — `pnpm-lock.yaml` et `pnpm-workspace.yaml` sont à la racine ; si Root Directory = `backend`, pnpm ne les trouve pas et échoue.

Build Command (Railway Settings) :
```
COREPACK_INTEGRITY_KEYS='' corepack enable && COREPACK_INTEGRITY_KEYS='' corepack prepare pnpm@11.3.0 --activate && pnpm install --frozen-lockfile && pnpm --filter @break-eat/backend build
```

Start Command (Railway Settings) :
```
COREPACK_INTEGRITY_KEYS='' corepack enable && pnpm --filter @break-eat/backend db:migrate:prod && node backend/dist/main
```

`railway.json` à la racine force le builder NIXPACKS et définit healthcheckPath `/health`.

### Pourquoi COREPACK_INTEGRITY_KEYS=''

Node.js 22.11.0 livre une version de corepack avec des clés de signature obsolètes incompatibles avec pnpm@11.3.0 (clés rotées). `COREPACK_INTEGRITY_KEYS=''` désactive la vérification des signatures — workaround documenté et sans impact sécurité en CI.

### Pourquoi express est une dépendance directe de backend

`main.ts` importe `json` et `raw` directement depuis `express` :
```typescript
import { json, raw } from 'express';
```
pnpm strict mode ne crée de symlink que pour les dépendances **directes** du package. `express` étant seulement une dep transitive de `@nestjs/platform-express`, il n'était pas accessible au runtime → `Cannot find module 'express'`. Fix : `express@^5.0.0` ajouté en dep directe dans `backend/package.json`.

### Variables d'environnement Railway (backend)

| Variable | Source |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (référence Railway) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (référence Railway) |
| `NODE_ENV` | `staging` |
| `JWT_SECRET` | secret 128 chars généré |
| `JWT_EXPIRES_IN` | `7d` |
| `STRIPE_SECRET_KEY` | `sk_test_...` depuis Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` depuis Stripe webhook |
| `STRIPE_API_VERSION` | `2024-12-18.acacia` |
| `STRIPE_PLATFORM_FEE_BPS` | `500` |
| `CORS_ORIGINS` | URLs Vercel admin + operator séparées par virgule |
| `STRIPE_CONNECT_RETURN_URL` | `https://[admin-url]/suppliers/onboarding/complete` |
| `STRIPE_CONNECT_REFRESH_URL` | `https://[admin-url]/suppliers/onboarding/refresh` |

### GitHub Secrets configurés

`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_ADMIN`, `VERCEL_PROJECT_ID_OPERATOR`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

## Bloc 6.1 — Order State Machine

### Transitions autorisées (15 au total)

| From | To (allowed) |
|---|---|
| `PAID` | `ACCEPTED`, `CANCELLED`, `RECOVERED` |
| `ACCEPTED` | `PREPARING`, `CANCELLED`, `RECOVERED` |
| `PREPARING` | `READY`, `CANCELLED`, `RECOVERED` |
| `READY` | `PICKED_UP`, `RECOVERED` |
| `PICKED_UP` | `COMPLETED` |
| `RECOVERED` | `ACCEPTED`, `PREPARING`, `READY` |
| `COMPLETED` | *(terminal — aucune sortie)* |
| `CANCELLED` | *(terminal — aucune sortie)* |

**Règle READY :** une commande en état `READY` ne peut plus être annulée directement. Elle doit passer par `RECOVERED` d'abord (le délai d'annulation est dépassé).

### Garantie d'atomicité

```typescript
// Guard AVANT toute transaction — pas d'écriture si transition illégale
this.stateMachine.assertTransition(order.status, to);   // throw BadRequestException si invalide

// Un seul $transaction pour les 2 opérations
const [updated] = await this.prisma.$transaction([
  this.prisma.order.update({ where: { id: orderId }, data: { status: to } }),
  this.prisma.orderAuditTrail.create({ data: { orderId, actorType, actorId, previousState, nextState, reason } }),
]);
```

### Outbox pattern — implémenté (Bloc 6.2)

Après le commit de la transaction, `RealtimeService` est injecté dans `OrdersService` et appelé **après** le commit :
```typescript
// ✅ orders.service.ts — emit systématique après transition()
this.realtimeService.emitOrderUpdated({
  orderId, organizationId, eventId, previousStatus: order.status, nextStatus: to, actorType, reason,
});

// ✅ emit supplémentaire uniquement quand la commande passe en READY
if (to === OrderStatus.READY) {
  this.realtimeService.emitOrderReady({
    orderId, publicOrderNumber, organizationId, eventId, pickupPointId,
  });
}
```
Règle invariante : `assertTransition()` lève une exception **avant** `$transaction` ; les emits se font **après** le commit — ne jamais inverser l'ordre. Voir section **Bloc 6.2** ci-dessous pour l'architecture complète du gateway.

### Endpoints opérateur

Tous protégés par `JwtAuthGuard` + vérification `assertOrgMember` (membre de l'organisation propriétaire de la commande) :

```
PATCH /api/v1/orders/:id/accept
PATCH /api/v1/orders/:id/start-preparing
PATCH /api/v1/orders/:id/mark-ready
PATCH /api/v1/orders/:id/mark-picked-up
PATCH /api/v1/orders/:id/recover
PATCH /api/v1/orders/:id/cancel
GET   /api/v1/orders/event/:eventId/active
```

Body (tous les PATCH) : `{ "reason": "string optionnel, max 500 chars" }`

---

## Bloc 6.3 — Storybook + Mobile Pipeline + DEMO_MODE

### Storybook

| App | Port | Script |
|---|---|---|
| admin | 6006 | `pnpm --filter @break-eat/admin storybook` |
| operator | 6007 | `pnpm --filter @break-eat/operator storybook` |

Config files: `apps/<app>/.storybook/main.ts` + `preview.ts`.
Framework: `@storybook/nextjs` + `addon-essentials`.

**Phase 8 stories à créer :** DashboardCard, NotificationPopup, OrderTimeline, PublicScreenCard, StatusBadge (full), OrderCard (full with swipe actions).

### EAS Build (mobile preview)

Fichiers clés : `apps/mobile/eas.json` + `apps/mobile/app.config.js`.

Activation :
```bash
cd apps/mobile
eas init                     # génère projectId → remplacer FILL_IN_EAS_PROJECT_ID
# puis ajouter EXPO_TOKEN dans GitHub Secrets
```

Le workflow `.github/workflows/mobile-preview.yml` se déclenche automatiquement sur push vers `main` quand `apps/mobile/**` change.

### DEMO_MODE

```
DEMO_MODE=true   → endpoints /internal/simulator/* accessibles
DEMO_MODE=false  → 403 Forbidden (DemoGuard)
DEMO_MODE=true + NODE_ENV=production → backend exits(1) au démarrage
```

**Endpoints simulateur :**
```
POST   /internal/simulator/events/:eventId/seed?count=20   — seed réaliste
POST   /internal/simulator/events/:eventId/rush?count=10   — rush N commandes PAID
DELETE /internal/simulator/events/:eventId                  — purge DEMO-* orders
```

Les commandes synthétiques ont le préfixe `DEMO-` dans `publicOrderNumber`.

### Champ orderBy dans OrderAuditTrail

Le modèle Prisma `OrderAuditTrail` expose `createdAt` (mapped `created_at`), **pas** `occurredAt`. Toujours utiliser `orderBy: { createdAt: 'asc' }` pour les requêtes d'audit trail.

---

## Bloc 6.2 — Realtime Gateway (Socket.IO)

### Architecture

```
RealtimeModule
  ├── RealtimeGateway  — WebSocket entry point, JWT auth, room management
  └── RealtimeService  — business-level emit helper (inject dans OrdersService)
```

### Auth sur connect

Le JWT est lu dans l'ordre de priorité :
1. `socket.handshake.auth.token`
2. `socket.handshake.headers.authorization` → strip `Bearer `

Si absent ou invalide → `client.disconnect(true)` immédiat. Aucun message n'est traité pour un socket non authentifié.

### Rooms

Format : `<type>:<uuid>` — types autorisés : `organization`, `event`, `supplier`, `pickup-point`, `order`, `dashboard`.

Les clients envoient `join_room` / `leave_room` avec `{ room: "organization:uuid" }`. Validation via `JoinRoomDto` (regex UUID v4).

### Outbox rule — ne jamais inverser

```typescript
// ✅ CORRECT — guard avant TX, emit après commit
this.stateMachine.assertTransition(from, to);     // 1. guard (throw si illégal)
const [updated] = await $transaction([...]);       // 2. DB commit
this.realtimeService.emitOrderUpdated({...});      // 3. emit APRÈS commit

// ❌ INCORRECT
await $transaction([...]);
this.stateMachine.assertTransition(from, to);      // trop tard
```

### Conflit de nommage `eventId`

Le champ `eventId` dans le payload realtime (REALTIME_CONTRACTS.md) est l'**UUID de déduplication du message realtime**, pas l'identifiant du concert.

L'identifiant du concert (champ `eventId` de l'ordre Prisma) n'est **jamais** inclus dans le payload — les clients savent déjà via la room `event:{id}` à laquelle ils sont abonnés.

### Événements émis

| Événement | Quand | Rooms ciblées |
|---|---|---|
| `new_order` | après `createFromPaymentIntent` | `organization:`, `event:`, `supplier:` |
| `order_updated` | après chaque `transition()` | `order:`, `organization:`, `event:` |
| `order_ready` | quand `transition()` → READY | `order:`, `pickup-point:`, `organization:`, `event:` |

---

## [2026-06-01] Phase 7 — Slots + Flaix Foundation

### What Was Built

Deux modules complémentaires :

1. **SlotsModule** — gestion des créneaux de retrait d'une commande. Un `Slot` est un créneau temporel (startAt–endAt) avec une capacité max, scopé optionnellement à un supplier ou un pickup point. Endpoints admin complets pour créer, lister, modifier et supprimer des slots. La méthode `assignOrderToSlot()` est transactionnelle et race-safe.

2. **FlaixModule** — frontière d'intégration entre BREAK EAT et le moteur AI Flaix. V1 = stub HTTP pur (retourne null si FLAIX_API_URL non configuré). Toutes les décisions appliquées sont persistées dans `flaix_decisions` avec leur payload brut.

### Why It Was Built

- **Slots** : permettent au client de choisir un créneau avant paiement (panier → `selectedSlotId`). L'opérateur voit combien de commandes arrivent dans chaque fenêtre de temps → fluidification de la préparation.
- **Flaix** : per `FLAIX_CONTRACT.md`, toutes les décisions Flaix doivent passer par un seul module. Implémenter le stub maintenant permet d'intégrer la vraie API sans toucher à OrdersService ou SlotsService.

### How It Works

**Slot capacity (race-safe) :**
```typescript
// Dans SlotsService.assignOrderToSlot(orderId, slotId, tx)
const updated = await tx.slot.updateMany({
  where: { id: slotId, currentLoad: { lt: slot.capacity }, status: { not: CLOSED } },
  data:  { currentLoad: { increment: 1 } },
});
if (updated.count === 0) throw new ConflictException('Slot full or closed concurrently');
await tx.order.update({ where: { id: orderId }, data: { slotId } });
// Auto-flip FULL quand currentLoad atteint capacity
await tx.slot.updateMany({ where: { id: slotId, currentLoad: slot.capacity }, data: { status: FULL } });
```

**Flaix decision audit (idempotent) :**
```typescript
// Dans FlaixService.recordDecision(payload, applied, affectedIds, slotId?)
await this.prisma.flaixDecision.create({ data: { decisionId, type, ... } });
// Si P2002 (UNIQUE sur decisionId) → silencieux (déjà enregistré)
```

### Code References

- `backend/src/modules/slots/slots.service.ts` — CRUD + `assignOrderToSlot()` (race-safe capacity)
- `backend/src/modules/slots/slots.controller.ts` — endpoints `POST|GET|PATCH|DELETE /events/:id/slots`
- `backend/src/modules/flaix/flaix.service.ts` — stub HTTP + `recordDecision()` + query helpers
- `backend/src/modules/flaix/flaix.module.ts` — frontière d'intégration (exports FlaixService uniquement)
- `backend/prisma/migrations/20260601_phase7_slots_flaix/migration.sql` — tables slots + flaix_decisions, FK carts.selected_slot_id, contrainte FK orders.slot_id

### Data Flow

```
Customer         SlotsController    SlotsService      DB
   |──GET slots──────────────────────────────────────→ SELECT WHERE eventId
   |←──[slot list]─────────────────────────────────────

   |──POST /checkout (cartId, selectedSlotId)
                              OrdersService
                                 ↓ assignOrderToSlot(orderId, slotId, tx)
                                 ↓ updateMany WHERE currentLoad < capacity → increment
                                 ↓ order.update → slotId
                                 ↓ updateMany WHERE currentLoad = capacity → FULL
```

### Dependencies

- Interne : `PrismaService` (@Global), `ConfigService` (FLAIX_API_URL/FLAIX_API_KEY)
- Externe Flaix : aucune en V1 — stub. URL : `FLAIX_API_URL`. Clé : `FLAIX_API_KEY`.

### Tests and Verification

- `slots.service.spec.ts` — 21 tests
- `flaix.service.spec.ts` — 12 tests
- **203 tests au total**, 17 suites, 0 failure

### Risks and Safe Change Rules

- Ne jamais appeler `assignOrderToSlot` HORS d'une `$transaction` Prisma si d'autres writes (order create, stock decrement) doivent être atomiques
- Ne pas réduire `Slot.capacity` en dessous de `currentLoad` — guard à ajouter en Phase 8
- La contrainte `CHECK (current_load <= capacity)` en DB bloquera tout incrément aberrant au niveau PostgreSQL
- Flaix doit rester dans `FlaixModule` uniquement — FLAIX_CONTRACT.md interdit les appels directs depuis d'autres modules

### Debugging Notes

- Pour voir les décisions Flaix appliquées : `SELECT * FROM flaix_decisions WHERE event_id = '...' ORDER BY created_at DESC`
- Pour voir la charge d'un slot : `SELECT id, label, current_load, capacity, status FROM slots WHERE event_id = '...'`
- Pour forcer la réouverture d'un slot FULL : `PATCH /events/:eid/slots/:id` avec `{ "status": "OPEN" }`

---

## [2026-06-01] Audit Phase 6 — Findings & Corrections

### P1 — Bugs critiques corrigés

#### SimulatorService — mauvais champs User (`firstName`/`lastName`)

**Problème :** `getOrCreateDemoUser()` utilisait `firstName: 'Demo', lastName: 'Simulator'` alors que le modèle Prisma `User` expose uniquement `displayName: String` (champ mappé `display_name`). L'appel `prisma.user.create` aurait provoqué une erreur TypeScript TS2353 à la compilation et un crash à l'exécution.

**Fix :** `firstName`/`lastName` → `displayName: 'Demo Simulator'`

Fichier : `backend/src/modules/simulator/simulator.service.ts:202`

#### SimulatorService — mauvaise relation Event→Supplier (`event.suppliers`)

**Problème :** `seedEvent()` et `simulateRush()` incluaient `suppliers: { include: { products } }` dans la requête Prisma. Le modèle `Event` n'a PAS de relation directe `suppliers Supplier[]` — il expose `eventSuppliers EventSupplier[]` via la table de jonction `event_suppliers`. L'appel provoquait une erreur TS2353 et un crash Prisma à l'exécution.

**Fix (les deux méthodes) :**
```typescript
// ❌ Avant
include: { suppliers: { include: { products: { where: { status: 'ACTIVE' } } } } }
const suppliers = event.suppliers;

// ✅ Après
include: {
  eventSuppliers: {
    include: { supplier: { include: { products: { where: { status: 'ACTIVE' } } } } },
  },
}
const suppliers = event.eventSuppliers.map((es) => es.supplier);
```

Fichier : `backend/src/modules/simulator/simulator.service.ts:36-52` (seedEvent), `116-132` (simulateRush)

### P2 — Écarts documentés (non bloquants Phase 7)

| # | Écart | Action |
|---|---|---|
| 2.1 | Gateway CORS `origin: '*'` | À restreindre via `CORS_ORIGINS` env en Phase 7 (staging) |
| 2.2 | Aucune autorisation de room (n'importe quel user auth peut rejoindre n'importe quelle room) | Limitation V1 documentée — Phase 8 ajoutera des ACL par rôle/organisation |
| 2.3 | Pas de tests pour `SimulatorService` | À ajouter en Phase 8 avec `progressOrders()` / `randomFailures()` |
| 2.4 | Endpoint de resync dashboard `GET /dashboards/:id/snapshot` non implémenté | Prévu Phase 8 pour recovery après reconnexion client |
| 2.5 | Storybook mobile (React Native) non scaffoldé | Reporté Phase 8 (ROADMAP mentionne "web + RN") |

### P3 — Reporté (phases futures)

| # | Sujet | Phase cible |
|---|---|---|
| 3.1 | Événements realtime `supplier_status_changed`, `rush_detected`, `queue_updated` non implémentés | Phase 7 (Flaix integration) |
| 3.2 | Auth `STAGING_ONLY_TOKEN` non utilisée sur les endpoints simulateur | Phase 8 (durcissement sécurité staging) |
| 3.3 | `progressOrders()` / `randomFailures()` dans SimulatorService | Phase 8 |

### Critères d'acceptance Phase 6 — statut

| Critère | Statut |
|---|---|
| Chaque transition persistée et auditée | ✅ Bloc 6.1 |
| Aucun emit avant le commit DB | ✅ Outbox rule enforced (Bloc 6.2) |
| Gateway Socket.IO opérationnel avec JWT auth | ✅ Bloc 6.2 |
| Storybook admin + operator scaffoldés | ✅ Bloc 6.3 |
| Pipeline EAS Build configuré | ✅ Bloc 6.3 (nécessite `eas init` + EXPO_TOKEN pour activer) |
| DEMO_MODE toggle opérationnel | ✅ Bloc 6.3 |
| SimulatorService seed/rush/clear | ✅ Bloc 6.3 (bugs P1 corrigés dans cet audit) |
| 170 tests passants, 0 failures | ✅ Vérifié post-correction |
| Backend staging accessible | ✅ Railway (GET /health → 200) |
| Mobile preview installable via QR | ⏳ Nécessite `eas init` + EXPO_TOKEN côté product owner |

---

## [2026-06-01] Phase 8 — Dashboards + Public Screens

### What Was Built

Deux surfaces utilisateur temps réel pour l'application Break Eat :

1. **Dashboard opérateur** (`/dashboard/[eventId]`) — tableau kanban avec 5 colonnes (PAID, ACCEPTED, PREPARING, READY, RECOVERED), mis à jour en temps réel via Socket.IO. Inclut un formulaire de connexion, des alertes sonores (Web Audio API) et un mode plein écran.

2. **Écran public** (`/public/[eventId]`) — liste des commandes prêtes à récupérer, sans authentification, sans PII. Affiché sur un écran dans le lieu.

Côté backend : endpoint de snapshot dashboard, assignation atomique de slot, endpoints Flaix, et trois nouvelles méthodes simulateur (`progressOrders`, `randomFailures`, `getStats`).

### Why It Was Built

- Le dashboard opérateur est le coeur de l'interface de production — sans lui, les opérateurs ne peuvent pas gérer les commandes en temps réel.
- L'écran public remplace les systèmes d'affichage dédiés dans les stades : les clients voient leur numéro de commande quand elle est prête, sans avoir à demander.
- Les méthodes simulateur permettent de tester des scénarios de rush et de récupération sans données réelles.

### How It Works

#### Backend — Dashboard API

```typescript
// GET /orders/event/:eventId/dashboard → OrdersService.findDashboardByEvent()
const DASHBOARD_STATUSES = [PAID, ACCEPTED, PREPARING, READY, RECOVERED];
const orders = await this.prisma.order.findMany({
  where: { eventId, status: { in: DASHBOARD_STATUSES } },
  include: { items: true },
  orderBy: { createdAt: 'asc' },
});
// Groupement en mémoire → { eventId, counts: { PAID: n, ... }, orders: { PAID: [...], ... } }
```

#### Backend — Simulator étendu

```typescript
// progressOrders() — avance chaque commande DEMO- d'un état
const NEXT_STATUS = { PAID→ACCEPTED, ACCEPTED→PREPARING, PREPARING→READY, RECOVERED→ACCEPTED };
for (const order of demoOrders) {
  const next = NEXT_STATUS[order.status];
  if (!next) continue;  // COMPLETED/CANCELLED/READY/PICKED_UP skippés
  await prisma.$transaction([order.update({ status: next }), auditTrail.create(...)]);
}

// randomFailures(failRate) — annule ou récupère des commandes actives
// 60% des affectés → CANCELLED, 40% → RECOVERED
```

#### Frontend — Socket client

```typescript
// apps/operator/src/lib/realtime/socket-client.ts
const { io } = await import('socket.io-client');  // Dynamic import (pas de SSR)
const socket = io(SOCKET_URL, { auth: { token } });
socket.on('connect', () => {
  socket.emit('join_room', { room: `event:${eventId}` });
  if (isReconnect) this.options.onResync?.();  // Déclenche resync REST
});
// Déduplication : Set<string>(1000) de eventIds de payload
```

#### Frontend — useDashboard hook

```typescript
// Reducer : 11 types d'actions
type Action =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: DashboardData }
  | { type: 'NEW_ORDER' }           // → déclenche fetchSnapshot() (payload socket sans items)
  | { type: 'ORDER_UPDATED'; payload: Order }   // → déplace la commande entre colonnes
  | { type: 'ORDER_READY'; payload: {...} }      // → notification + son
  | { type: 'SET_NOTIFICATION'; payload: ... }
  | { type: 'ORDER_LOADING'; orderId: string }
  | { type: 'ORDER_LOADED'; orderId: string }
  | { type: 'SOCKET_STATUS'; status: 'connected'|'disconnected' }
  ...

// Polling fallback
const interval = setInterval(loadSnapshot, pollInterval ?? 10_000);
// Actif seulement si socketStatus === 'disconnected'
```

#### Frontend — écran public

```typescript
// apps/operator/src/app/public/[eventId]/page.tsx
// Pas de JWT → socket.io refusé → uniquement polling REST
// useReducer:
//   ADD_ORDERS (snapshot REST) → ADD_ORDER (event socket order_ready)
//   CLEAR_NEW (après 3s — retire l'animation highlight)
//   PRUNE (toutes les 30s — retire les commandes de plus de 5 min)
```

### Code References

**Backend :**
- `backend/src/modules/orders/orders.service.ts:findDashboardByEvent` — requête Prisma + groupement mémoire
- `backend/src/modules/orders/orders.service.ts:assignOrderToSlot` — `$transaction` → SlotsService.assignOrderToSlot
- `backend/src/modules/orders/orders.controller.ts` — `GET /event/:eventId/dashboard` + `PATCH /:id/assign-slot`
- `backend/src/modules/flaix/flaix.controller.ts` — `GET /flaix/event/:eid/rush-status` + `GET decisions`
- `backend/src/modules/simulator/simulator.service.ts:progressOrders` — NEXT_STATUS map + $transaction par order
- `backend/src/modules/simulator/simulator.service.ts:randomFailures` — shuffle + failRate + $transaction

**Frontend :**
- `apps/operator/src/lib/realtime/socket-client.ts` — connexion socket.io dynamique (toute la couche WS)
- `apps/operator/src/lib/api/orders-client.ts` — REST API client (fetchDashboard + toutes les mutations)
- `apps/operator/src/hooks/useDashboard.ts` — hook principal du dashboard (reducer + socket + polling)
- `apps/operator/src/hooks/useSound.ts` — beeps Web Audio (OscillatorNode + GainNode, zéro dépendance)
- `apps/operator/src/components/OrderCard.tsx` — carte commande avec boutons d'action contextuels
- `apps/operator/src/components/DashboardColumn.tsx` — colonne kanban avec indicateur `hasNew`
- `apps/operator/src/components/NotificationPopup.tsx` — overlay notification avec auto-dismiss
- `apps/operator/src/components/PublicScreenRow.tsx` — ligne écran public (ZÉRO PII)
- `apps/operator/src/app/dashboard/[eventId]/page.tsx` — page dashboard (JWT localStorage, kanban, fullscreen)
- `apps/operator/src/app/public/[eventId]/page.tsx` — page écran public (sans auth)

### Data Flow

#### Flux temps réel — nouvelle commande

```
Stripe webhook
  → OrdersService.createFromPaymentIntent()
  → $transaction commit
  → RealtimeService.emitNewOrder()  (outbox — APRÈS commit)
        rooms: [organization:X, event:Y, supplier:Z]

Client dashboard (event:Y abonné)
  → socket event 'new_order' reçu
  → useDashboard dispatch NEW_ORDER
  → fetchSnapshot() → GET /orders/event/:eid/dashboard
  → reducer FETCH_SUCCESS → colonnes mises à jour
  → useSound.playNewOrder() (si notification active)
  → NotificationPopup 'nouvelle commande' visible 4s
```

#### Flux temps réel — commande prête

```
Operator PATCH /orders/:id/mark-ready
  → OrdersService.transition(PREPARING → READY)
  → $transaction [order.update, auditTrail.create]
  → RealtimeService.emitOrderReady()  (outbox)
        rooms: [order:X, pickup-point:Y, organization:Z, event:W]

Client dashboard (event:W abonné)
  → socket 'order_ready' → ORDER_READY action
  → NotificationPopup verte visible 4s + son

Écran public (event:W polling ou socket)
  → ADD_ORDER reducer → ligne PublicScreenRow isNew=true
  → après 3s : CLEAR_NEW (retire animation)
  → après 5min : PRUNE automatique
```

### Dependencies

- **Interne** : `RealtimeModule`, `SlotsModule`, `FlaixModule`, `PrismaService`
- **Frontend externe** : `socket.io-client ^4.8.1` (à installer via `pnpm install` dans `apps/operator`)
- **Web Audio API** : API navigateur native, zéro dépendance externe
- **Next.js App Router** : `[eventId]` dynamic segments, `'use client'` pour toutes les pages réactives

### Tests and Verification

- `simulator.service.spec.ts` — 15 tests (seed, rush, clear, progressOrders, randomFailures, getStats)
- `orders.service.spec.ts` — 5 tests ajoutés (findDashboardByEvent × 3, assignOrderToSlot × 2)
- **Total backend (Phase 8) : 221 tests passants, 18 suites, 0 failure**
- 4 fichiers Storybook stories avec 19 stories au total pour le package operator

### Audit Phase 8 — Corrections P1 / P2

**P1 — Écran public vide (401 silencieux)**
- `GET /orders/event/:eid/dashboard` est protégé par `@UseGuards(JwtAuthGuard)` au niveau du contrôleur. L'écran public `/public/[eventId]` appelait cet endpoint sans token — réponse 401 ignorée silencieusement dans le `catch {}` → liste vide affichée.
- Fix : nouveau `PublicOrdersController` (`@Controller('public/orders')`) sans guard. Nouvel endpoint `GET /public/orders/event/:eventId/ready` retourne `{id, publicOrderNumber, pickupPointId, updatedAt}` uniquement. `findReadyByEvent()` ajouté dans `OrdersService` avec `select` explicite (zéro PII). Frontend mis à jour pour appeler ce endpoint.

**P2 — failRate non borné**
- `randomFailures(eventId, failRate)` acceptait n'importe quelle valeur, y compris > 1. Un failRate > 1 aurait rendu `roll < rate * 0.6` toujours vrai → 100% des commandes annulées. Fix : `const rate = Math.max(0, Math.min(1, failRate))`.

**P2 — FlaixController sans contrôle org**
- Les endpoints `GET /flaix/event/:id/rush-status` et `GET /flaix/event/:id/decisions` vérifiaient uniquement que le token JWT était valide, pas que l'utilisateur appartient à l'organisation de l'event. Fix : injection `PrismaService` dans `FlaixController` + méthode privée `assertOrgMemberForEvent(eventId, userId)` appelée au début de chaque handler.

**P2 — isFullscreen désynchronisé**
- Le toggle fullscreen appelait `setIsFullscreen(!isFullscreen)` directement, sans écouter le navigateur. Appui sur Échap ne mettait pas à jour le state React. Fix : `useEffect` avec `document.addEventListener('fullscreenchange', () => setIsFullscreen(!!document.fullscreenElement))`. Toggle ne modifie plus le state directement.

**Tests ajoutés :** +3 dans `orders.service.spec.ts` pour `findReadyByEvent` (champs minimaux READY, tableau vide, select projection sans PII).
**Total backend après audit : 224 tests passants, 18 suites, 0 failure**

### Risks and Safe Change Rules

- **Dynamic import socket.io-client** : ne jamais importer `socket.io-client` directement au niveau module (import statique) — le SSR Next.js échouera avec `window is not defined`
- **JWT dans localStorage** : la page dashboard ne peut pas être rendue côté serveur (SSR). C'est intentionnel — ajouter `'use client'` si d'autres pages parent en avaient besoin.
- **Polling fallback** : si le socket est déconnecté pendant plus de 10s sans reconnexion, les données peuvent être décalées jusqu'à 10s. Acceptable en V1 ; à réduire à 3s si criticité augmente.
- **CORS `origin: '*'` sur le gateway** — P2 ouvert depuis Phase 6. À restreindre via `CORS_ORIGINS` env en Phase 9.
- **Écran public sans auth** : le socket.io gateway rejette la connexion sans token. L'écran public ne reçoit donc les mises à jour en temps réel que via polling REST. Une future V2 pourrait exposer une room publique sans auth pour les écrans d'affichage.

### Debugging Notes

**Dashboard ne charge pas les commandes :**
1. Vérifier `localStorage.getItem('operator_token')` dans la console navigateur
2. Vérifier que le backend répond : `GET /api/v1/orders/event/:eventId/dashboard` avec `Authorization: Bearer <token>`
3. Vérifier l'état socket dans le ConnectionBadge (rouge = déconnecté → polling actif)

**Notifications sonores silencieuses :**
- `AudioContext` est suspendu par défaut par les navigateurs tant qu'il n'y a pas eu de geste utilisateur
- `useSound` gère `context.state === 'suspended'` → `context.resume()` avant chaque beep
- Sur mobile, un premier tap sur la page est nécessaire pour déverrouiller l'audio

**Écran public ne se met pas à jour :**
1. Vérifier la console pour les erreurs de polling : `GET /api/v1/orders/event/:eventId/active`
2. L'auto-prune retire les commandes de plus de 5 min — si les commandes ont plus de 5 min, elles n'apparaissent pas
3. Le socket n'est PAS actif sur l'écran public (pas de token) — uniquement polling REST

---

## [2026-06-01] Phase 9 — CMS basique + Feature Flags

### What Was Built

1. **FeatureFlag** — activer/désactiver des fonctionnalités par scope sans redéploiement
2. **AppSetting** — stockage JSON de configuration / CMS simple par scope
3. **FlagScope** — enum partagé `GLOBAL | ORGANIZATION | EVENT`
4. **CORS hardening** — gateway Socket.IO aligné sur `CORS_ORIGINS` env
5. **useFeatureFlag** — hook React pour la résolution de flags depuis le frontend

### Why

- Permettre aux opérateurs de modifier le comportement de l'application sans redéployer (feature flags)
- Stocker des textes et configurations personnalisés par event ou organisation (CMS/AppSettings)
- Fermer le P2 CORS ouvert depuis Phase 6 : le gateway acceptait `origin: '*'`

### How It Works

#### Résolution de flag (EVENT > ORG > GLOBAL)

```
resolve(key, { orgId?, eventId? })
  1. Si eventId fourni → findUnique(key, EVENT, eventId)  → hit? retourner
  2. Si orgId fourni  → findUnique(key, ORG,   orgId)     → hit? retourner
  3.                    findFirst(key, GLOBAL)             → hit? retourner
  4. Aucun résultat   → false (désactivé par défaut)
```

La même logique s'applique à `AppSettingsService.get()`, qui retourne `null` au lieu de `false` si non trouvé.

#### Upsert (idempotent)

```sql
UNIQUE(key, scope, scope_id)
```
Un seul `upsert()` Prisma gère create et update. Pas de concurrence sur le même flag/setting.

#### CORS gateway

```typescript
// Avant (Phase 6–8) :
@WebSocketGateway({ cors: { origin: '*' } })

// Phase 9 :
@WebSocketGateway({
  cors: { origin: process.env['CORS_ORIGINS']?.split(',') ?? ['http://localhost:3001'] }
})
```

#### useFeatureFlag (frontend)

```typescript
const { enabled, loading } = useFeatureFlag('rush_mode', { eventId, token });
if (!enabled) return null; // gate the feature
```

- Fetch vers `GET /api/v1/feature-flags/resolve?key=&orgId=&eventId=`
- `enabled = false` pendant le chargement et en cas d'erreur (fail-closed)
- Cleanup via `cancelled` flag sur démontage React

### Code References

| File | Description |
|------|-------------|
| `backend/src/modules/feature-flags/feature-flags.service.ts` | Service principal — resolve(), list(), set(), remove() |
| `backend/src/modules/feature-flags/feature-flags.controller.ts` | 4 endpoints REST |
| `backend/src/modules/app-settings/app-settings.service.ts` | get(), list(), set(), remove() avec résolution scope |
| `backend/src/modules/app-settings/app-settings.controller.ts` | 4 endpoints REST |
| `backend/prisma/schema.prisma` | enum FlagScope, model FeatureFlag, model AppSetting |
| `apps/operator/src/hooks/useFeatureFlag.ts` | Hook React |

### API Endpoints

```
GET    /api/v1/feature-flags                              → liste tous les flags
GET    /api/v1/feature-flags/resolve?key=&orgId=&eventId= → {key, enabled, resolvedAt}
POST   /api/v1/feature-flags                              → upsert flag
DELETE /api/v1/feature-flags/:id                          → supprimer flag

GET    /api/v1/app-settings                               → liste tous les settings
GET    /api/v1/app-settings/get?key=&orgId=&eventId=      → {key, value, resolvedAt}
POST   /api/v1/app-settings                               → upsert setting
DELETE /api/v1/app-settings/:id                           → supprimer setting
```

### Dependencies

- **Prisma 6** : `FlagScope` enum, `FeatureFlag` + `AppSetting` models, client régénéré via `pnpm db:generate`
- **class-validator** : DTOs existants (déjà installé)

### Tests and Verification

- `feature-flags.service.spec.ts` — 10 tests (Phase 9) + 3 tests (audit) = 13 tests
- `app-settings.service.spec.ts` — 11 tests (Phase 9) + 2 tests (audit) = 13 tests
- **Total backend (Phase 9) : 245 tests passants, 20 suites, 0 failure**

### Audit Phase 9 — Corrections P2

**P2 — ?scope= non validé dans les contrôleurs (→ Prisma 500)**
- `GET /feature-flags?scope=INVALID` et `GET /app-settings?scope=INVALID` passaient la chaîne invalide directement à Prisma → `PrismaClientValidationError` → HTTP 500.
- Fix : guard inline dans `list()` de chaque contrôleur : `Object.values(FlagScope).includes(scope)` → sinon `BadRequestException` avec message clair.

**P2 — Validation cross-champ manquante dans set()**
- `scope=GLOBAL + scopeId fourni` → flag GLOBAL avec `scopeId≠null` stocké. `resolve()` ne le retrouverait pas (filtre `scopeId: null`). État incohérent silencieux.
- `scope=ORG/EVENT + scopeId absent` → flag stocké avec `scopeId=null`, mais `resolve()` le chercherait dans la bucket GLOBAL, jamais dans ORG/EVENT. Feature flag définitivement perdu.
- Fix dans `set()` des deux services :
  ```typescript
  if (scope === FlagScope.GLOBAL && scopeId) throw BadRequestException(...)
  if (scope !== FlagScope.GLOBAL && !scopeId) throw BadRequestException(...)
  ```

**P2 — findFirst(GLOBAL) sans scopeId: null**
- `findFirst({ key, scope: GLOBAL })` sans `scopeId: null` aurait pu retourner un enregistrement GLOBAL avec `scopeId≠null` (si la garde cross-champ était contournée).
- Fix : `where: { key, scope: FlagScope.GLOBAL, scopeId: null }` dans les deux services.

**P2 — FeatureFlagsService.remove() → Prisma P2025 non intercepté**
- `prisma.featureFlag.delete()` direct sans vérification préalable → `PrismaKnownRequestError P2025` non attrapée → HTTP 500.
- `AppSettingsService.remove()` avait le pattern correct (findUnique + NotFoundException). FeatureFlagsService en était dépourvu.
- Fix : miroir du pattern AppSettings.

**Tests après audit : 250 passants, 20 suites, 0 failure** (+5 tests d'audit)

### Risks and Safe Change Rules

- **Pas de contrôle de rôle en V1** : tout utilisateur JWT peut lire/écrire les flags et settings. Restreindre à SUPER_ADMIN/ORG_ADMIN en V2.
- **Pas de cache** : `resolve()` fait 1-3 requêtes DB par appel. Si appelé à haute fréquence, ajouter un cache mémoire (TTL 60s) ou Redis.
- **scopeId null** : dans Prisma, deux lignes avec `scopeId=null` et la même clé+scope n'entrent PAS en conflit de contrainte unique (PostgreSQL considère les nulls comme inégaux). Cela est intentionnel — il ne peut y avoir qu'un seul flag GLOBAL par clé (on utilise `findFirst` au lieu de `findUnique` pour GLOBAL).

### Debugging Notes

**Flag resolve() retourne toujours false :**
1. Vérifier que le flag existe : `GET /api/v1/feature-flags?scope=GLOBAL`
2. Vérifier que `enabled = true` sur le flag
3. Vérifier que `scopeId` correspond exactement à l'orgId ou eventId passé

**useFeatureFlag retourne toujours loading=false, enabled=false :**
1. Vérifier que `token` est bien passé dans les options
2. Vérifier la console réseau — l'endpoint requiert un JWT valide (401 si absent)

---

## [2026-06-02] Phase 10 — QA, Rush Tests, Déploiement

### What Was Built

Phase 10 livre la couche de validation sous charge et l'infrastructure de déploiement en production :
- **Rush tests** (BLOC 10.1) : validation que 50 / 100 commandes peuvent être créées et progressées sans perte.
- **Order-loss tests** (BLOC 10.2) : validation que les états terminaux sont protégés et que `findReadyByEvent` est cohérent après reconnexion WebSocket.
- **Sentry frontend** (BLOC 10.3) : `@sentry/nextjs` sur l'opérateur Next.js, init multi-runtime (browser / Node / Edge).
- **Logging JSON structuré** (BLOC 10.4) : `JsonLogger` sous-classe de `ConsoleLogger`, JSON one-line par ligne en production.
- **Docker Compose production** (BLOC 10.5) : Dockerfile multi-stage + `docker-compose.prod.yml` (PostgreSQL 16 + Redis 7 + backend, réseau interne).
- **Vercel config** (BLOC 10.6) : headers sécurité + tunnel Sentry dans `vercel.json`.
- **Deployment checklist** (BLOC 10.7) : `DEPLOYMENT_CHECKLIST.md` — 7 sections, 40+ items.

### Why It Was Built

- Les tests de charge sont requis avant la beta pour valider que le `SimulatorService` ne perd pas de commandes sous rush (50–100 ordres simultanés).
- Les tests d'intégrité valident le comportement des états terminaux (COMPLETED, CANCELLED) — aucune régression possible.
- Sentry est requis pour tracer les erreurs navigateur en production sans exposer le DSN via les logs.
- Le logging JSON est requis par Railway et les plateformes de log centralisées (Datadog, Papertrail).
- Docker Compose prod permet un déploiement self-hosted ou staging isolé.
- La checklist de déploiement évite les oublis critiques (secrets non réglés, DEMO_MODE activé accidentellement en prod).

### How It Works

#### BLOC 10.1 — Rush tests (rush.spec.ts)

Mock stateful en mémoire : un tableau `store: MockOrder[]` est mis à jour par les implémentations jest.fn() de Prisma :
- `order.create` → pousse dans `store`
- `order.findMany` → filtre `store` selon `where`
- `order.update` → modifie `store[].status` in-place
- `order.deleteMany` → filtre `store` pour enlever les correspondances

Invariant vérifié à chaque étape : `store.length === N` (aucune création ou suppression parasite).

Séquence de test "no loss" :
1. `simulateRush(eventId, 50)` → store = 50 ordres PAID
2. `progressOrders(eventId)` → chaque ordre avance d'un état via `NEXT_STATUS[current]`
3. Après 6 cycles (PAID→ACCEPTED→PREPARING→READY→PICKED_UP→COMPLETED) : store = 50 ordres COMPLETED

#### BLOC 10.2 — Order loss tests (order-loss.spec.ts)

Utilise la vraie `OrderStateMachineService` (logique pure, aucune dépendance) avec les mocks Prisma + RealtimeService + SlotsService.

Test "terminal state" :
- `transition('o-completed', ACCEPTED, ...)` → `stateMachine.assertTransition(COMPLETED, ACCEPTED)` → `ALLOWED_TRANSITIONS[COMPLETED] = []` → `BadRequestException`

Test "reconnect" :
- `findReadyByEvent(eventId)` appelle `prisma.order.findMany({ where: { eventId, status: READY }, select: {...} })`
- Le mock retourne uniquement les ordres READY filtrés depuis `orderStore`
- Projection vérifiée : `userId`, `totalCents`, `items` absents du résultat

#### BLOC 10.3 — Sentry frontend

Flux d'initialisation :
1. `next.config.ts` wrappé avec `withSentryConfig()` → injecte `sentry.client.config.ts` dans le bundle navigateur
2. `instrumentation.ts` chargé par Next.js 15 au démarrage du runtime :
   - `NEXT_RUNTIME === 'nodejs'` → importe `sentry.server.config.ts`
   - `NEXT_RUNTIME === 'edge'` → importe `sentry.edge.config.ts`
3. Chaque config : `enabled: Boolean(process.env.DSN)` → no-op si DSN absent

Variables d'env :
- `NEXT_PUBLIC_SENTRY_DSN_OPERATOR` — DSN public (navigateur)
- `SENTRY_DSN_OPERATOR` — DSN serveur (non exposé au client)
- `SENTRY_AUTH_TOKEN` — upload source maps (CI/Vercel uniquement)

#### BLOC 10.4 — JsonLogger

```typescript
// backend/src/logger/json-logger.ts
class JsonLogger extends ConsoleLogger {
  private isProduction = process.env.NODE_ENV === 'production';
  // En production : process.stdout.write(JSON.stringify(entry) + '\n')
  // Sinon : super.log() (format NestJS coloré)
}
```

Utilisé dans `main.ts` :
```typescript
const appLogger = new JsonLogger('Bootstrap');
const app = await NestFactory.create(AppModule, { logger: appLogger });
```

Format JSON ligne :
```json
{"level":"log","timestamp":"2026-06-02T14:00:00.000Z","context":"Bootstrap","message":"Server running on port 3000"}
```

#### BLOC 10.5 — Docker Compose production

```
docker compose -f docker-compose.prod.yml up -d
```

Réseau :
- `backend` (internal: true) : postgres + redis + service backend, inaccessible depuis l'extérieur
- `public` (bridge) : expose uniquement le backend sur `${BACKEND_PORT:-3000}:3000`

Variables obligatoires (fail-loud si absentes) :
- `POSTGRES_PASSWORD` — `${POSTGRES_PASSWORD:?...}` → Docker Compose refuse de démarrer si absent
- `REDIS_PASSWORD` — idem

Dockerfile multi-stage :
- Stage `deps` : `pnpm install --frozen-lockfile` (tous deps)
- Stage `builder` : `pnpm db:generate && pnpm build`
- Stage `runner` : `pnpm install --prod` + copie des artefacts uniquement

### Code References

- `backend/src/modules/simulator/rush.spec.ts` — tests de charge 50/100 ordres, invariant de count
- `backend/src/modules/orders/order-loss.spec.ts` — protection états terminaux, reconnect, projection
- `apps/operator/sentry.client.config.ts` — init Sentry navigateur (DSN, replays, beforeSend)
- `apps/operator/sentry.server.config.ts` — init Sentry Node.js
- `apps/operator/sentry.edge.config.ts` — init Sentry Edge
- `apps/operator/instrumentation.ts` — hook Next.js 15 (charge le bon config selon NEXT_RUNTIME)
- `apps/operator/next.config.ts` — withSentryConfig (tunnelRoute, hideSourceMaps)
- `backend/src/logger/json-logger.ts` — JsonLogger : JSON en prod, couleurs en dev
- `backend/src/main.ts:12` — `new JsonLogger('Bootstrap')` comme logger global NestJS
- `backend/Dockerfile` — multi-stage build (deps → builder → runner)
- `docker-compose.prod.yml` — stack production complète
- `apps/operator/vercel.json` — headers sécurité + rewrite Sentry tunnel
- `DEPLOYMENT_CHECKLIST.md` — 40+ items pré-déploiement

### Data Flow

**Rush load path :**
```
POST /internal/simulator/rush?count=100
  → SimulatorService.simulateRush(eventId, 100)
  → boucle 100× : nextDemoSeq() + order.create()
  → [store] 100 ordres PAID
POST /internal/simulator/progress
  → SimulatorService.progressOrders(eventId)
  → order.findMany(DEMO-, status not COMPLETED/CANCELLED)
  → pour chaque ordre : $transaction([order.update(nextStatus), orderAuditTrail.create()])
  → [store] 100 ordres ACCEPTED
```

**Log JSON path (production) :**
```
NestJS appel logger.log('msg', 'Context')
  → JsonLogger.log()
  → isProduction=true → emit('log', msg, params)
  → shouldLog('log') → true
  → JSON.stringify({level:'log', timestamp, context, message})
  → process.stdout.write(line + '\n')
  → Railway/Docker capture stdout → log aggregator
```

**Sentry error path (operator app) :**
```
Browser JS error
  → Sentry SDK intercepte (auto-instrumentation Next.js)
  → beforeSend() filtre les faux positifs
  → tunnelRoute: '/monitoring' → requête via /monitoring/* (pas bloquée par ad-blockers)
  → Sentry.io dashboard
```

### Dependencies

- `@sentry/nextjs ^9.0.0` — ajouté à `apps/operator/package.json`
- `node:22-alpine` — image Docker base
- `postgres:16-alpine` — PostgreSQL prod
- `redis:7-alpine` — Redis prod
- Aucune dépendance backend nouvelle (JsonLogger utilise uniquement `@nestjs/common`)

### Tests and Verification

**rush.spec.ts — 18 tests :**
- Suite "50-order rush" : 4 tests (created=50, prefix DEMO-, status PAID, IDs uniques)
- Suite "100-order rush" : 2 tests (created=100, numéros uniques)
- Suite "progressOrders — no loss" : 3 tests (50 PAID→ACCEPTED, 50 orders → 6 cycles → 50 COMPLETED, count invariant)
- Suite "combined rush+failures+progress" : 2 tests (total invariant, clearEvent)
- Suite "getStats consistency" : 2 tests (sum=store.length, split après failures)

**order-loss.spec.ts — 14 tests :**
- Suite "terminal state protection" : 3 tests (COMPLETED→any, CANCELLED→any, COMPLETED→CANCELLED)
- Suite "findReadyByEvent reconnect" : 3 tests (5 orders→3 READY, post-transition, empty)
- Suite "count conservation" : 3 tests (transition invariant, 25 rapides, séquence lifecycle)
- Suite "minimal projection" : 1 test (pas de PII)

**Total backend Phase 10 : 273 tests passants, 22 suites, 0 failure**

### Risks and Safe Change Rules

- **DEMO_MODE en production** : `main.ts` fait `process.exit(1)` si `DEMO_MODE=true && NODE_ENV=production`. Ne jamais contourner ce guard. Docker Compose prod force `DEMO_MODE=false`.
- **JsonLogger synchrone** : chaque appel log fait un `process.stdout.write`. Pour un volume > 10k logs/s, envisager un stream buffèrisé.
- **Sentry replays** : `replaysSessionSampleRate: 0.05` en prod capture 5% des sessions. Implique des données utilisateur dans Sentry. Désactiver si contrainte RGPD.
- **POSTGRES_PASSWORD et REDIS_PASSWORD** : Docker Compose échoue au démarrage si absents (`:?` syntax). Ne jamais les mettre dans docker-compose.prod.yml directement.
- **Source maps Sentry** : uploadés seulement si `SENTRY_AUTH_TOKEN` présent. Sans token, les stack traces Sentry ne sont pas lisibles.

### Debugging Notes

**rush.spec.ts échoue :**
- Vérifier que `prisma.$queryRaw` retourne `[{ nextval: BigInt(n) }]` — sans cela `nextDemoSeq()` retourne `BigInt(0)` et tous les ordres ont le même publicOrderNumber → conflit unique.
- Si `store.length !== N` après un cycle : vérifier que `order.findMany` mock filtre bien sur `eventId` ET `publicOrderNumber.startsWith('DEMO-')`.

**order-loss.spec.ts : "Nest can't resolve RealtimeService" :**
- Utiliser le token de classe, pas une string : `{ provide: RealtimeService, useValue: {...} }` (non `{ provide: 'RealtimeService', ... }`).

**JsonLogger ne sort pas de JSON en prod :**
- Vérifier `NODE_ENV=production` dans les variables d'environnement.
- `LOG_LEVEL` doit être `log` ou plus bas pour que les messages `log()` soient émis.

**Sentry ne reçoit pas d'erreurs :**
1. Vérifier que `NEXT_PUBLIC_SENTRY_DSN_OPERATOR` est défini (browser) et `SENTRY_DSN_OPERATOR` (server).
2. Vérifier que le tunnel `/monitoring` est bien configuré dans `vercel.json` (rewrite) et dans `next.config.ts` (`tunnelRoute`).
3. Tester avec `Sentry.captureException(new Error('test'))` dans un composant.

---

## [2026-06-02] Audit Phase 11 & 12 — P1 Security Fix + P2 Branding Fix

### What Was Built

A post-implementation audit of Phase 11 (Admin Panel Next.js 15) and Phase 12 (Admin V1 complet, blocs 12.1–12.9).
Two code fixes were applied and a P3 UX improvement.

### Audit Findings Summary

| Priority | Area | Description | Status |
|---|---|---|---|
| P1 | Security | Dashboard `supplierId` query param not enforced — operator could bypass supplier filter | FIXED |
| P2 | Branding DTO | `@IsUrl()` rejected empty string, making it impossible to clear a logo once set | FIXED |
| P3 | Admin Dashboard | Quick-nav cards missing Équipe + Lieux sections added in Phase 12 | FIXED |
| P2 | Team management | No PATCH endpoint to change a member's role or supplier assignment (remove+re-invite required) | Backlog |
| P3 | Operator app | `window.location.href` used instead of `router.push()` — causes full page reload | Backlog |

### Fix 1 — Dashboard Supplier Enforcement (P1 Security)

**File:** `backend/src/modules/orders/orders.controller.ts` — `findDashboard()`

**Before:** Only checked org membership (`assertOperatorAccess`). A malicious operator could remove `?supplierId=` from the URL to see ALL suppliers' orders.

**After:** The handler now fetches `membership.supplierId` from DB. If the membership has a supplierId, it is **always applied** (the query param is ignored). Operators without a pin can still use the query param for convenience filtering.

```typescript
const effectiveSupplierId: string | undefined =
  membership.supplierId ?? supplierId ?? undefined;
```

**Why this matters:** Phase 12.9 intended supplier-level isolation. The UI enforced this via localStorage, but the API endpoint did not — any operator could hit the API directly without the filter.

### Fix 2 — Branding DTO: Clear logoUrl / primaryColor (P2)

**Files:**
- `backend/src/modules/organizations/dto/update-org-branding.dto.ts`
- `backend/src/modules/events/dto/update-event.dto.ts`

**Before:** `@IsUrl()` rejects empty strings. Sending `logoUrl: ''` to clear a logo returned a 400 validation error.

**After:** Added `@Transform(({ value }) => (value === '' ? null : value))` before `@IsUrl()`. Empty string is converted to `null`, which `@IsOptional()` then accepts (it skips all validators for null/undefined). The DB field is set to NULL. Field types updated to `string | null`.

### Code References

- `backend/src/modules/orders/orders.controller.ts:99` — `findDashboard()` — reads membership.supplierId, applies effectiveSupplierId
- `backend/src/modules/organizations/dto/update-org-branding.dto.ts` — Transform decorator on all 3 branding fields
- `backend/src/modules/events/dto/update-event.dto.ts` — same Transform pattern
- `apps/admin/src/app/(admin)/dashboard/page.tsx` — CARDS array now includes Équipe + Lieux

### Tests and Verification

273/273 backend tests pass after fixes. TypeScript: 0 errors (`npx tsc --noEmit`).

### Risks and Safe Change Rules

- The `effectiveSupplierId` logic: if `membership.supplierId` is **null** (no pin), the query param is used as-is. Only a non-null membership supplierId overrides. Never change this precedence order.
- The `@Transform` runs before `@IsUrl` — this depends on class-transformer's decorator execution order. Do not reorder them.

---

## [2026-06-02] Phase 12 — Blocs 12.7 · 12.8 · 12.9 — Admin Panel complet

### What Was Built

Three blocs completing Phase 12 so the Super Admin can run the full demo flow without touching code.

**BLOC 12.7 — Operator invitation & team management**
- Schema: `OrganizationMember.supplierId` — optional FK to Supplier, set when `orgRole = OPERATOR`
- `OrganizationsService.inviteByEmail()` — lookup by email; clear NotFoundException if email not registered
- `OrganizationsService.getMembers()` — returns members enriched with `user.email/displayName` and `supplier.name`
- `OrganizationsService.removeMember()` — self-removal guard
- Admin panel `/team` page — full CRUD: member table with supplier badge, invite form (email + role + supplier picker)
- `UsersService.findByIdWithMemberships()` — now includes `supplier` in each membership → powers BLOC 12.9

**BLOC 12.8 — Branding**
- Schema: `Organization` + `Event` each get `logoUrl`, `primaryColor`, `description`
- `PATCH /organizations/:id/branding` — isolated endpoint for org branding
- `PATCH /organizations/:orgId/events/:id` — extended to accept branding fields
- Admin panel: org detail and event detail pages each have a Branding section (logo preview, native color picker + hex input, description textarea)

**BLOC 12.9 — Filtered operator dashboard**
- `GET /orders/event/:id/dashboard?supplierId=uuid` — optional supplierId param filters orders at DB level
- Operator app: after login, calls `/auth/me/memberships`, reads `memberships[0].supplierId`, stores to localStorage
- `useDashboard({ supplierId })` passes filter through to `fetchDashboard()`
- Dashboard and EventSelector both show a "🏪 Buvette Nord" badge when the operator has a supplier assignment

### Why It Was Built

The Phase 12 admin panel was ~40% complete. Super Admin could create orgs/events/suppliers but could not:
1. Invite operators by email and assign them to a specific supplier
2. Set branding (logo, colour, description) on orgs or events
3. Give operators a filtered view showing only their supplier's orders

These three blocs bring the admin to full self-service for the demo flow.

### How It Works

**Invite flow:**
1. Admin opens `/team`, types an email address, picks role=OPERATOR, picks supplier "Buvette Nord"
2. `POST /organizations/:id/invite` → `inviteByEmail()` → finds user by email → creates `OrganizationMember { orgRole: OPERATOR, supplierId: <buvetteNordId> }`
3. Member appears in the table with the supplier badge

**Branding flow:**
1. Admin opens `/organizations/:id`, fills logo URL + hex color + description
2. `PATCH /organizations/:id/branding` → `updateBranding()` → updates Organization row
3. Same for events via `PATCH /organizations/:orgId/events/:id`

**Filtered dashboard flow:**
1. Operator logs in to `apps/operator/`
2. `fetchMeWithMemberships()` returns `memberships[0].supplierId = "buvette-nord-id"`
3. localStorage stores `operator_supplier_id = "buvette-nord-id"`
4. `useDashboard({ supplierId: "buvette-nord-id" })` → `fetchDashboard(eventId, token, supplierId)` → `GET /orders/event/:id/dashboard?supplierId=buvette-nord-id`
5. Backend: `prisma.order.findMany({ where: { eventId, supplierId } })` → only Buvette Nord orders

### Code References

- `backend/prisma/schema.prisma` — `OrganizationMember.supplierId` field + `Supplier.assignedOperators` back-ref
- `backend/src/modules/organizations/organizations.service.ts` — `inviteByEmail()`, `getMembers()`, `removeMember()`, `updateBranding()`
- `backend/src/modules/organizations/organizations.controller.ts` — `GET /:id/members`, `POST /:id/invite`, `DELETE /:id/members/:memberId`, `PATCH /:id/branding`
- `backend/src/modules/orders/orders.service.ts` — `findDashboardByEvent(eventId, supplierId?)`
- `backend/src/modules/orders/orders.controller.ts` — `?supplierId` query param
- `apps/admin/src/app/(admin)/team/page.tsx` — team management UI
- `apps/operator/src/lib/api/orders-client.ts` — `fetchMeWithMemberships()`, `fetchDashboard(supplierId?)`
- `apps/operator/src/hooks/useDashboard.ts` — `supplierId` option
- `apps/operator/src/app/page.tsx` — supplier badge in EventSelector
- `apps/operator/src/app/dashboard/[eventId]/page.tsx` — supplier badge in header

### Data Flow

```
Admin invites operator by email
  → POST /organizations/:id/invite { email, role: OPERATOR, supplierId }
  → OrganizationMember { supplierId: "buvette-nord-id" }

Operator logs in
  → GET /auth/me/memberships
  → memberships[0].supplierId = "buvette-nord-id"
  → localStorage: operator_supplier_id = "buvette-nord-id"

Operator opens dashboard
  → GET /orders/event/:id/dashboard?supplierId=buvette-nord-id
  → OrdersService: WHERE supplierId = "buvette-nord-id"
  → Only Buvette Nord orders shown
```

### Dependencies

- Prisma 6 — schema migration, client regeneration required after schema change
- `class-validator` — `@IsEmail`, `@IsUrl`, `@Matches` on new DTOs
- No new npm packages

### Tests and Verification

- 273/273 backend tests passing
- 0 TypeScript errors across backend, admin, operator
- 0 ESLint warnings

### Risks and Safe Change Rules

- `OrganizationMember.supplierId` is nullable — only OPERATOR members need it; ORG_ADMIN/MANAGER leave it null
- If the supplier is deleted, `onDelete: SetNull` nullifies the assignment — operator will see all orders until reassigned
- `fetchMeWithMemberships` only reads `memberships[0]` — if an operator is in multiple orgs, only the first is used in V1

### Debugging Notes

```bash
# Check a member's supplier assignment
SELECT id, user_id, org_role, supplier_id FROM organization_members WHERE organization_id = '<orgId>';

# Verify filtered dashboard
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/v1/orders/event/<eventId>/dashboard?supplierId=<supplierId>
```

---

## [2026-06-02] Phase 13 — Mobile V1 — Parcours Client Complet

### What Was Built

Application mobile React Native : 9 screens, 2 stores Zustand, 1 API client dédié, navigation avec deep links. Backend : 3 endpoints publics (no auth) + endpoint demo-checkout (DemoGuard).

**Parcours complet** : QR Scan → Event Home → Catalogue → Panier → Créneau → Checkout Demo → Confirmation → Suivi temps réel.

### Why It Was Built

L'objectif Axe 1 est de pouvoir commander dans un faux événement depuis son téléphone en scannant un QR code. Phase 13 implémente ce parcours de A à Z.

### How It Works

1. L'admin génère un QR code `breakeat://event/<uuid>` dans le panel (Phase 12).
2. L'utilisateur scanne le QR avec l'app mobile → deep link → `EventHomeScreen`.
3. L'app charge l'événement via `/api/v1/public/events/:id` (pas d'auth).
4. L'utilisateur choisit un stand → `SupplierCatalogScreen` → charge les produits via `/public/events/:id/suppliers/:supplierId/products`.
5. L'utilisateur ajoute des articles au panier (state local Zustand).
6. L'utilisateur sélectionne un créneau via `/public/events/:id/slots`.
7. L'utilisateur va en checkout → l'app crée un panier backend, ajoute les articles, appelle `POST /carts/:id/demo-checkout`.
8. Le backend crée un Order avec status PAID sans Stripe (DemoGuard bloque en prod).
9. L'app navigue vers `OrderTrackingScreen` qui poll `GET /orders/:id` toutes les 5s.
10. L'opérateur accepte la commande → l'app voit le statut changer.

### Code References

Backend:
- `backend/src/modules/events/public-events.controller.ts` — 3 routes publiques sans auth
- `backend/src/modules/cart/cart.service.ts:demoCheckout()` — crée Order PAID sans Stripe, nécessite au moins 1 pickup point dans l'event
- `backend/src/modules/cart/cart.controller.ts:POST /carts/:id/demo-checkout` — DemoGuard + JwtAuthGuard

Mobile:
- `apps/mobile/src/store/auth.store.ts` — token JWT + rehydrate depuis AsyncStorage
- `apps/mobile/src/store/cart.store.ts` — state local du panier (items, slot, totals)
- `apps/mobile/src/lib/api/mobile-api.ts` — injection Bearer token auto depuis auth.store.getState()
- `apps/mobile/src/navigation/root-navigator.tsx` — deep link `breakeat://event/:eventId` → EventHomeScreen
- `apps/mobile/src/screens/qr-scanner.screen.tsx` — VisionCamera v4 useCodeScanner, parse breakeat://
- `apps/mobile/src/screens/checkout.screen.tsx` — flux en 3 étapes : createCart → addItems × N → demoCheckout

### Data Flow

```
QR Code (breakeat://event/abc) 
  → deep link → EventHomeScreen(eventId=abc)
  → GET /public/events/abc → { event, suppliers }
  → SupplierCatalogScreen(supplierId)
  → GET /public/events/abc/suppliers/xyz/products → groups[]
  → CartStore.addItem() (local)
  → SlotSelectorScreen
  → GET /public/events/abc/slots → slots[]
  → CartStore.setSlot()
  → CheckoutScreen
  → POST /carts → { id: cartId }
  → POST /carts/:cartId/items × N
  → POST /carts/:cartId/demo-checkout → { orderId, publicOrderNumber, totalCents }
  → OrderConfirmationScreen → OrderTrackingScreen
  → GET /orders/:orderId (every 5s) → order.status
```

### Dependencies

- `react-native-vision-camera@^4.7.3` — scanner QR natif
- `@react-native-async-storage/async-storage@^3.1.1` — persistance token

### Setup natif requis (à faire après `pnpm install`)

```bash
# iOS (depuis un Mac, une seule fois)
cd apps/mobile/ios && pod install

# Backend (mode démo pour demo-checkout)
# DEMO_MODE=true dans le .env ou via variable d'env
```

### Debug Commands

```bash
# Tester les endpoints publics
curl http://localhost:3000/api/v1/public/events/<eventId>
curl http://localhost:3000/api/v1/public/events/<eventId>/suppliers/<supplierId>/products
curl http://localhost:3000/api/v1/public/events/<eventId>/slots

# Tester le demo checkout (DEMO_MODE=true requis)
# 1. Login → obtenir token
# 2. POST /carts → {eventId, supplierId} → cartId
# 3. POST /carts/:cartId/items → {productId, quantity}
# 4. POST /carts/:cartId/demo-checkout → {orderId}
# 5. GET /orders/:orderId
```

---

## [2026-06-02] Phase 12 — Admin Panel V1 Complet + Operator Home V2

### What Was Built

Complétion du panel d'administration pour permettre le parcours démo end-to-end complet : gestion des lieux, catégories, produits par fournisseur, points de retrait, créneaux horaires, QR codes événement. Wizard automatisé "Spartiates Hockey" en 1 clic. Refonte de l'accueil opérateur avec sélecteur d'événements dynamique.

### Why It Was Built

Phase 11 avait créé la structure du panel admin mais laissait des lacunes critiques pour l'autonomie complète : impossible de créer un lieu, des produits, des pickup points ou des créneaux depuis l'interface. Phase 12 comble ces lacunes pour permettre à un admin de configurer un événement de A à Z sans toucher directement à la DB.

### Key Files

| Fichier | Rôle |
|---------|------|
| `apps/admin/src/lib/api/admin-client.ts` | +12 fonctions : Venue, Category, Product, PickupPoint, Slot |
| `apps/admin/src/app/(admin)/venues/page.tsx` | CRUD lieux |
| `apps/admin/src/app/(admin)/suppliers/[id]/page.tsx` | Catégories + produits par fournisseur |
| `apps/admin/src/app/(admin)/events/[id]/page.tsx` | Venue info + Pickup Points + Slots + QR Code |
| `apps/admin/src/app/(admin)/demo-setup/page.tsx` | Wizard "Spartiates Hockey" 9 étapes |
| `apps/operator/src/app/page.tsx` | Login dark + sélecteur d'événements |

### Important: QR Code

Le QR code pointe vers `breakeat://event/[id]`. Ce deep link sera géré par le mobile app (Phase 13). Pour la génération, on utilise l'API publique `api.qrserver.com` sans installation supplémentaire.

### Important: Demo Wizard Flow

Le wizard `/demo-setup` crée dans l'ordre :
1. Venue "Patinoire des Spartiates"
2. Event "Match Spartiates Hockey" (DRAFT → ACTIVE à la fin)
3. Supplier "Buvette Nord"
4. Attach supplier to event
5. Categories "Boissons" + "Snacks"
6. Products: Coca 2.50€, Bière 4€, Eau 2€, Hot-Dog 5€, Nachos 4.50€
7. Pickup points: "Comptoir Nord" + "Comptoir Est"
8. Slots: 20:00-20:20, 20:20-20:40, 20:40-21:00 (capacity 30)
9. Activate event

### How to Test

```bash
# 1. Lancer l'admin
cd apps/admin && pnpm dev   # http://localhost:3001

# 2. Aller sur /demo-setup
# Cliquer "Créer la démo Spartiates Hockey"
# Observer les 9 étapes

# 3. Scanner le QR code affiché avec le mobile
# (Phase 13 à venir)

# 4. Lancer l'opérateur
cd apps/operator && pnpm dev   # http://localhost:3002
# Login → sélectionner "Match Spartiates Hockey"
# → Dashboard en temps réel
```

---

## [2026-06-02] Phase 11 — Admin Panel (Next.js 15)

### What Was Built

Panel d'administration complet pour Break Eat, accessible uniquement aux utilisateurs ayant un rôle d'admin dans une organisation. Construit avec Next.js 15 App Router (port 3001), il couvre : authentification JWT, gestion des organisations et de leurs membres, gestion des événements et de leurs fournisseurs, feature flags, paramètres application et simulateur de données de démo.

### Why It Was Built

Les phases 1 à 10 ont construit le backend et l'app opérateur. Il manquait un outil pour : configurer les organisations avant le démarrage, gérer les feature flags en runtime, surveiller l'état des commandes et injecter des données de test. L'admin panel remplit ce rôle sans toucher directement à la base de données.

### Architecture

#### App Next.js 15 (port 3001)

```
apps/admin/
├── next.config.ts                   — NEXT_PUBLIC_API_URL env block
├── src/
│   ├── lib/api/admin-client.ts      — client API centralisé (300 lignes)
│   └── app/
│       ├── page.tsx                 — redirect root (token → /dashboard sinon /login)
│       ├── login/page.tsx           — formulaire d'authentification
│       └── (admin)/                 — route group Next.js (layout partagé, path invisible)
│           ├── layout.tsx           — layout protégé + sidebar
│           ├── dashboard/page.tsx
│           ├── organizations/[id]/page.tsx
│           ├── events/page.tsx
│           ├── events/[id]/page.tsx
│           ├── feature-flags/page.tsx
│           ├── settings/page.tsx
│           └── simulator/page.tsx
```

#### Gestion de session (localStorage)

| Clé | Valeur | Durée de vie |
|-----|--------|--------------|
| `admin_token` | JWT Bearer | Jusqu'à logout |
| `admin_user` | JSON SafeUser | Jusqu'à logout |
| `admin_org_id` | UUID organisation | Jusqu'à logout |
| `admin_org_name` | string | Jusqu'à logout |

`clearSession()` vide les 4 clés. La fonction `req<T>()` détecte automatiquement un 401 et appelle `clearSession()` + `router.replace('/login')`.

#### Endpoint backend ajouté

```
GET /auth/me/memberships   (JwtAuthGuard)
```

Retourne l'utilisateur + ses `memberships` incluant le détail de chaque organisation (`id`, `name`, `slug`, `status`). Utilisé exclusivement par le login admin pour identifier l'org à gérer.

Implémentation :
- `UsersService.findByIdWithMemberships(id)` — Prisma include imbriqué
- `AuthService.meWithMemberships(userId)` — délègue
- `AuthController` — route `GET /me/memberships`

### Key Files

| Fichier | Rôle |
|---------|------|
| `apps/admin/src/lib/api/admin-client.ts` | Toutes les fonctions API, helpers localStorage, gestion 401 |
| `apps/admin/src/app/(admin)/layout.tsx` | Protection auth, sidebar, logout |
| `apps/admin/src/app/login/page.tsx` | Flow login : JWT → memberships → localStorage → redirect |
| `apps/admin/src/app/(admin)/simulator/page.tsx` | Interface simulateur (DEMO_MODE uniquement) |
| `backend/src/modules/users/users.service.ts` | `findByIdWithMemberships` |
| `backend/src/modules/auth/auth.controller.ts` | Route `GET /me/memberships` |

### Important Constraints

- **Route group `(admin)`** — le dossier `(admin)` n'ajoute pas de segment de path. Les routes restent `/dashboard`, `/events`, etc. Il sert uniquement à partager `layout.tsx`.
- **Relation Prisma** — `User.memberships` (PAS `orgMemberships`). `OrganizationMember.orgRole` (PAS `role`).
- **Simulateur** — route backend `/api/v1/internal/simulator/events/:id/...` (préfixe global `/api/v1` appliqué). Accessible seulement si `DEMO_MODE=true`.
- **Ports** — admin: 3001, operator: 3002, backend: 3000.

### How to Test / Debug

```bash
# Lancer l'admin en dev
cd apps/admin && pnpm dev   # http://localhost:3001

# Typecheck
cd apps/admin && pnpm typecheck

# Lint
cd apps/admin && pnpm lint

# Vérifier l'endpoint memberships (backend doit tourner)
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/auth/me/memberships
```

---

## [2026-06-02] Audit Global — Phases 1→10

### What Was Built

Audit de cohérence complet de toutes les phases (1 à 10). L'objectif était une application parfaitement fonctionnelle avec zéro erreur TS, zéro erreur ESLint et 100% des tests verts.

### Why It Was Built

Après 10 phases d'implémentation accumulant chacune de la dette technique mineure (erreurs de type découvertes plus tard, imports inutilisés, noms de symboles incorrects), un audit global consolide la qualité avant la phase suivante.

### How It Works

L'audit a procédé en 3 passes :
1. **TypeScript** (`pnpm typecheck`) — 4 erreurs trouvées et corrigées
2. **ESLint** (`pnpm lint`) — 8 erreurs trouvées et corrigées
3. **Structure** — vérification manuelle de `app.module.ts` (20 modules), guards, migrations, config

### Code References

**Corrections TypeScript :**
- `backend/src/logger/json-logger.ts:132` — méthode `serializeMessage` (anciennement `formatMessage` : conflit avec `ConsoleLogger` public API)
- `backend/src/modules/flaix/flaix.controller.ts:73` — `userId_organizationId` (clé composée Prisma, ordre champs `@@unique([userId, organizationId])`)
- `backend/src/modules/orders/orders.controller.ts:227` — même clé composée
- `apps/operator/next.config.ts` — `sourcemaps: { deleteSourcemapsAfterUpload: true }` (@sentry/nextjs v9 : `hideSourceMaps` supprimé)

**Corrections ESLint :**
- `backend/src/modules/flaix/flaix.service.ts` — `_context`, `_userId` (paramètres stub non utilisés)
- `apps/operator/src/hooks/useDashboard.ts` — directive `eslint-disable react-hooks/exhaustive-deps` supprimée (plugin `eslint-plugin-react-hooks` absent)

**Améliorations config :**
- `backend/src/config/app.config.ts` — `appEnv` + `logLevel` enregistrés dans `registerAs('app', ...)` pour accès via `ConfigService`

### Data Flow

Pas de nouveau flux de données. L'audit corrige uniquement des erreurs statiques (compilation, lint) et améliore la cohérence du registre de config.

### Dependencies

Aucune dépendance ajoutée. Corrections purement internes.

### Tests and Verification

```bash
pnpm typecheck    # backend  → exit 0 — 0 erreur
pnpm typecheck    # operator → exit 0 — 0 erreur
pnpm lint         # backend  → exit 0 — 0 erreur
pnpm lint         # operator → exit 0 — 0 erreur
pnpm test         # backend  → 273/273 — 22 suites — 0 failure — 21.5s
```

### Risks and Safe Change Rules

**Clé composée Prisma :**
- `@@unique([fieldA, fieldB])` génère toujours `fieldA_fieldB` (ordre exact des champs, pas alphabétique)
- Tout `where: { fieldB_fieldA: ... }` sera une erreur TypeScript → toujours vérifier le schéma

**ConsoleLogger API NestJS :**
- `ConsoleLogger` a plusieurs méthodes publiques (`formatMessage`, `colorize`, etc.)
- Les sous-classes ne peuvent pas déclarer une méthode `private` avec le même nom qu'une méthode `public` parente
- Nommer les méthodes privées avec un préfixe distinct (ex: `serializeMessage`, `emitJson`)

**ESLint plugins manquants :**
- Un `eslint-disable-next-line plugin/rule` dans un fichier est une erreur ESLint si le plugin n'est pas configuré
- Toujours vérifier que le plugin est dans `eslint.config.mjs` avant d'utiliser ses règles en commentaire

### Debugging Notes

**Identifier toutes les erreurs d'un coup :**
```bash
cd backend && pnpm typecheck 2>&1 | grep "error TS"
cd backend && pnpm lint 2>&1 | grep "error"
```

**Vérifier une clé composée Prisma :**
```bash
# Dans schema.prisma, chercher @@unique pour l'entité concernée
grep -A2 "@@unique" backend/prisma/schema.prisma
# L'ordre des champs dans l'array → ordre dans le nom de la clé
```

---

## [2026-06-03] Refonte design — Package @break-eat/brand (white-label)

### What Was Built

Un **package partagé** `@break-eat/brand` qui centralise tous les tokens de design (couleurs, ombres, police) et le composant logo, consommé par les surfaces web (admin + operator). Toutes les surfaces ont été rebrandées vers l'identité Break Eat : fond blanc, orange `#FC4002`, police Fredoka, wordmark « BREAKEAT » (PNG) et logo « B éclair ». Objectif : **une seule source de vérité** pour le design, réutilisable et configurable (white-label).

### Why It Was Built This Way

- **Un package, pas une copie par app** : avant la refonte, chaque app dupliquait ses couleurs en dur (palette bleu/gris générique Tailwind). Pour un produit white-label multi-tenant, la palette de marque doit être unique et importable. Un workspace package `@break-eat/brand` garantit qu'un changement de token se propage partout.
- **Inline styles + objet `BRAND`** : le projet utilise des styles inline (pas de Tailwind sur ces écrans). Exposer un objet typé `BRAND` (avec `type Brand = typeof BRAND`) donne l'autocomplétion + la sécurité de type sans build CSS.
- **Shims de re-export** : les pages admin importaient déjà `@/lib/brand` et `@/components/brand/BreakEatLogo`. Plutôt que réécrire tous les imports, ces deux chemins re-exportent simplement le package → migration sans rupture.
- **`transpilePackages`** : Next.js 15 doit transpiler un package workspace TS non pré-buildé → déclaré dans `next.config.ts` des deux apps.

### Where The Code Lives

```
packages/brand/package.json          — @break-eat/brand (workspace:*)
packages/brand/src/brand.ts          — objet BRAND + type Brand (SOURCE DE VÉRITÉ)
packages/brand/src/BreakEatLogo.tsx  — logo (lockup complet login / mark seul dashboard)
packages/brand/src/index.ts          — barrel export
apps/admin/src/lib/brand.ts                       — shim re-export
apps/admin/src/components/brand/BreakEatLogo.tsx  — shim re-export
apps/admin/next.config.ts / apps/operator/next.config.ts — transpilePackages
```

**Tokens (`packages/brand/src/brand.ts`) :**
```
orange #FC4002 · orangeDark #DA3702 · orangeSoft #FDB9A3 · orangeTint rgba(252,64,2,0.08)
ink #1c1917 · inkSoft #44403c · grey #a8a29e · border #ece3dd
bg #ffffff · bgSubtle #faf7f5
shadowSoft 0 12px 44px rgba(252,64,2,0.10) · shadowButton 0 8px 20px rgba(252,64,2,0.28)
font var(--font-fredoka), system-ui, -apple-system, sans-serif
```

### How Each Block Works

**10 pages internes admin** rebrandées via une convention de mapping stricte (séparer le *chrome* de marque de la *sémantique fonctionnelle*) :

| Rôle | Ancien | Nouveau |
|------|--------|---------|
| Primaire / lien actif | `#2563eb` `#3b82f6` | `BRAND.orange` (hover `orangeDark`) |
| CTA création « + Nouveau… » | sombre | `orange` + handlers hover |
| Navigation sombre (raccourcis dashboard/simulateur) | `#111827` `#1f2937` | `BRAND.ink` |
| Titres | `#111827` | `ink` |
| Labels / corps | `#374151` `#1f2937` | `inkSoft` |
| Texte atténué | `#6b7280` `#9ca3af` | `grey` |
| Bordures | `#d1d5db` `#e5e7eb` | `border` |
| Fonds clairs / lignes | `#f9fafb` `#f3f4f6` | `bgSubtle` |
| Cartes | `#fff` | `bg` **+ `1px solid border`** |
| color-picker white-label (org + event) | default `#2563eb` | default `BRAND.orange` |

Sur chaque CTA orange : `onMouseEnter`/`onMouseLeave` bascule `orange ↔ orangeDark` + `transition: 'background 0.15s ease'` (gardé inactif quand le bouton est `disabled`). `fontFamily: BRAND.font` sur le conteneur de page ; `fontFamily: 'inherit'` sur inputs/selects/buttons/textarea.

### What Must NOT Be Changed Casually

**Les couleurs sémantiques NE sont PAS de la palette de marque** — ne pas les passer en orange :
- Erreur rouge (`#fee2e2`/`#fca5a5`/`#dc2626`/`#991b1b`), succès vert, warning ambre, money `#059669`
- Badges catégoriels rôle/scope (ORG_ADMIN ambre, MANAGER violet, MARKETING vert ; scope GLOBAL indigo / ORGANIZATION vert / EVENT jaune)
- **Légende `STATUS_COLOR` du cycle de vie commande** (PAID `#3b82f6`, ACCEPTED `#8b5cf6`, PREPARING `#f59e0b`, READY `#10b981`, PICKED_UP `#06b6d4`, COMPLETED `#6b7280`, RECOVERED `#f97316`, CANCELLED `#ef4444`) — **partagée avec les écrans opérateur**, c'est un code couleur fonctionnel, pas du branding.
- `#7c3aed` rush simulateur.

Ces couleurs subsistent volontairement après le grep de contrôle.

### How To Test / Debug

```bash
# Typecheck admin (doit être vert)
pnpm --filter @break-eat/admin typecheck      # exit 0

# Aucune couleur de chrome bleu/gris ne doit subsister dans les pages admin
#   (sauf les couleurs lifecycle sémantiques du simulateur, attendues)
grep -rnE "#2563eb|#3b82f6|#111827|#1f2937" apps/admin/src/app/\(admin\)
```

## [2026-06-03] Phase 14 — Groupes, accès privé aux événements & Back Office (SUPER_ADMIN)

### What Was Built

Trois blocs livrés ensemble :

1. **Modèle Groupes + accès privé évènement** (Prisma). Nouvelle entité `Group` rattachée à une organisation (`organizationId` FK), table de jointure `GroupMember` (membre = `userId`, avec `source` MANUAL ou DOMAIN), table de jointure `EventGroup` (PK composite `[eventId, groupId]`), enum `EventVisibility` (PUBLIC/PRIVATE) ajouté sur `Event`, enum `GroupMemberSource`.
2. **Backend Groupes & enforcement** : module `GroupsService` (CRUD groupes, membres manuels par email, auto-rattachement par domaine email, et **garde d'accès** `canAccessEvent`), plus extension de `EventsService.update()` pour piloter `visibility` + remplacer atomiquement l'ensemble des groupes liés à un évènement.
3. **Back Office V1 (SUPER_ADMIN)** : module `BackofficeService` exposant les **KPIs globaux** de l'app (CA TTC + CA HT, nombre de commandes, panier moyen HT/TTC, comptes, organisations) et la gestion des organisations ; app Next.js `apps/backoffice` (port 3003) avec overview KPIs, liste/détail organisations et écran groupes. Front admin : pages `/groups` + `/groups/[id]` (dashboard CLUB) et carte « 🔒 Accès & visibilité » sur la fiche évènement.

### Why It Was Built

- **Accès privé** : certaines organisations veulent réserver un évènement à une population précise (membres d'un club, salariés d'une entreprise via leur domaine email). Le besoin immédiat (« Usage #1 ») est le **gating d'accès au niveau évènement** ; l'usage #2 (codes promo ciblés par groupe) est conçu dans le modèle mais **pas encore construit**.
- **Auto-rattachement par domaine** : éviter la gestion manuelle membre par membre quand la cible est « tous les @entreprise.com ».
- **Back Office** : l'opérateur de la plateforme (SUPER_ADMIN) a besoin d'une vue de pilotage transverse à toutes les organisations (CA consolidé, volumétrie commandes, panier moyen) et d'un point unique pour créer/superviser les organisations et les groupes — séparé des dashboards tenant (CLUB / OPÉRATEUR).

### How It Works

**Visibilité & gating (runtime) :**
1. Un évènement porte `visibility` (défaut PUBLIC). En PUBLIC il est servi à tous ; en PRIVATE l'accès est filtré par appartenance à au moins un des groupes liés via `EventGroup`.
2. La lecture publique d'un évènement passe par `PublicEventsController`, qui appelle `GroupsService.canAccessEvent(eventId, userId|null)`. Si l'évènement est PRIVATE et que le visiteur (anonyme ⇒ `userId = null`) n'est membre d'aucun groupe lié, la garde renvoie `false` ⇒ le contrôleur lève un **404** (on ne divulgue pas l'existence d'un évènement privé).
3. Côté admin (CLUB), la carte « Accès & visibilité » bascule PUBLIC/PRIVATE et, en PRIVATE, coche les groupes autorisés. La sauvegarde envoie `{ visibility, groupIds }` à `PATCH events/:id`.

**Remplacement atomique de l'ensemble des groupes (`EventsService.update`) :**
1. Si `groupIds` est fourni et non vide, on vérifie d'abord que **tous** les groupes appartiennent à l'organisation (`group.count` filtré par `organizationId`). Si le compte ne correspond pas ⇒ `BadRequestException` (400) **avant toute écriture** (anti cross-tenant).
2. Si `groupIds` est défini, l'update évènement + `eventGroup.deleteMany({ eventId })` + `eventGroup.createMany(... skipDuplicates)` sont exécutés dans un seul `$transaction` (remplacement de l'ensemble, pas de delta).
3. En sauvegarde PUBLIC, le front envoie `groupIds: []` pour purger les liaisons (pas de restriction « zombie » si l'évènement est re-privatisé plus tard).

**Auto-rattachement par domaine (`applyDomainMembershipsForUser`) :** à la connexion/onboarding d'un utilisateur, on cherche les groupes dont `emailDomain` matche le domaine de l'email et on crée les `GroupMember` manquants avec `source = DOMAIN`. Les membres ajoutés à la main portent `source = MANUAL`. Le front distingue les deux par un badge (Manuel / Domaine) et n'autorise le retrait manuel que de façon cohérente.

**KPIs globaux (`BackofficeService.getGlobalKpis`) :** `Order.totalCents` est **TTC**. Le CA HT est dérivé : `caHtCents = round(caTtcCents / (1 + vatRate))` avec `vatRate = app.reporting.vatRate` (défaut **0.10** — resto sur place). Panier moyen calculé séparément HT et TTC (`round(ca / ordersCount)`, 0 si aucune commande). Le payload `revenue` renvoie `{ caTtcCents, caHtCents, vatRate }`.

### Code References

- `backend/prisma/schema.prisma:267` — `model Event` (+ champ `visibility EventVisibility`).
- `backend/prisma/schema.prisma:765` — `enum EventVisibility { PUBLIC PRIVATE }`.
- `backend/prisma/schema.prisma:777` / `:799` / `:816` — `model Group` / `model GroupMember` / `model EventGroup` (PK composite `[eventId, groupId]`).
- `backend/prisma/schema.prisma:756` — `enum GroupMemberSource { MANUAL DOMAIN }`.
- `backend/prisma/migrations/20260603_phase14_groups_event_visibility/` — migration (appliquée via `migrate deploy`, non destructif).
- `backend/src/modules/events/events.service.ts:106` — `update()` : garde d'appartenance org (400) + remplacement transactionnel des `EventGroup`.
- `backend/src/modules/events/events.service.ts:87` — `findOne()` : include `groups: { select: { groupId: true } }` pour préremplir la carte d'accès.
- `backend/src/modules/groups/groups.service.ts:249` — `canAccessEvent(eventId, userId)` : décision d'accès PUBLIC/PRIVATE.
- `backend/src/modules/groups/groups.service.ts:197` — `applyDomainMembershipsForUser(userId, email)` : auto-rattachement par domaine.
- `backend/src/modules/events/public-events.controller.ts:46` — point d'enforcement (404 si non-membre).
- `backend/src/modules/events/dto/update-event.dto.ts` — `visibility?` (`@IsEnum`) + `groupIds?` (`@IsArray @IsUUID('all', { each: true })`).
- `backend/src/modules/backoffice/backoffice.service.ts:69` — `getGlobalKpis()` ; `:82` calcul `caHtCents` ; `:88` shape `revenue` ; `:228` `toHtCents = round(ttc / (1 + vatRate))`.
- `apps/admin/src/lib/api/admin-client.ts` — types `EventVisibility`, `Group`, `GroupMember`, `GroupMemberSource` + 8 fonctions `apiGetGroups`/`apiCreateGroup`/… et extension `apiUpdateEvent`.
- `apps/admin/src/app/(admin)/groups/page.tsx` / `groups/[id]/page.tsx` — liste/création + détail (édition méta, membres, zone de danger).
- `apps/admin/src/app/(admin)/events/[id]/page.tsx` — carte « 🔒 Accès & visibilité » (radio PUBLIC/PRIVATE + cases groupes + `handleSaveAccess`).
- `apps/backoffice/` — app Next.js port 3003 : `(backoffice)/overview` (KPIs), `organizations` + `organizations/[id]`, `groups`.

### Data Flow

- **Admin → backend** : la fiche évènement envoie `PATCH /api/v1/organizations/:orgId/events/:eventId` avec `{ visibility, groupIds }`. Le service valide l'appartenance org puis applique le remplacement transactionnel ; `findOne` renvoie `groups: [{ groupId }]` pour réhydrater l'UI.
- **Visiteur → évènement** : `GET` évènement public ⇒ `PublicEventsController` ⇒ `canAccessEvent` ⇒ 200 (autorisé) ou 404 (privé + non-membre / anonyme).
- **Connexion utilisateur** ⇒ `applyDomainMembershipsForUser` crée les `GroupMember` source=DOMAIN ⇒ ces appartenances entrent ensuite dans la décision `canAccessEvent`.
- **Back Office** : `GET /api/v1/backoffice/kpis` ⇒ agrégation Prisma (somme `Order.totalCents`, counts) ⇒ dérivation HT ⇒ JSON `{ revenue, ordersCount, averageBasket, accountsCount, organizationsCount }` consommé par l'overview.

### Dependencies

- Internes : `PrismaService`, `EventsModule`, `GroupsModule`, `BackofficeModule`, gardes `JwtAuthGuard`/`RolesGuard` + `@Roles(GlobalRole.SUPER_ADMIN)` sur `/backoffice/*`, helper `requireOrgAccess` pour les routes groupes tenant, `ConfigService` (`app.reporting.vatRate`).
- Externes : Prisma 6.19.3 (`$transaction`, `createMany skipDuplicates`), `class-validator` (`@IsEnum`/`@IsArray`/`@IsUUID`), Next.js 15 (admin + backoffice), `@break-eat/brand`.

### Tests and Verification

- `backend pnpm typecheck` : exit 0.
- `events.service.spec.ts` : suite verte (incl. 4 tests `update` — set PRIVATE sans `$transaction`, remplacement de l'ensemble avec `$transaction` + `deleteMany`/`createMany skipDuplicates`, purge `groupIds: []` sans `group.count`, rejet cross-org ⇒ `BadRequestException` sans écriture).
- Suite backend complète : **291/291** sur 23 suites.
- `admin pnpm typecheck` : exit 0 ; `admin build` : 14 routes (nouvelles `/groups` ~4.23 kB static, `/groups/[id]` ~4.5 kB dynamic).

### Risks and Safe Change Rules

- **Ne jamais transformer le remplacement de l'ensemble en delta** : `EventsService.update` supprime puis recrée tous les `EventGroup` dans un `$transaction`. Un envoi partiel de `groupIds` purge les autres — c'est voulu (l'UI envoie toujours l'état complet).
- **La garde d'appartenance org doit rester AVANT toute écriture** : le `group.count` filtré par `organizationId` empêche un tenant de lier des groupes d'un autre tenant. Ne pas déplacer après l'update.
- **404 ≠ 403 pour un évènement privé** : on renvoie volontairement 404 pour ne pas révéler l'existence d'un évènement privé. Conserver ce comportement dans `PublicEventsController`.
- **`vatRate` = config, pas en dur** : le CA HT dépend de `app.reporting.vatRate` (défaut 0.10). Changer la TVA = changer la config, pas le calcul. `Order.totalCents` reste la source TTC de vérité.
- **`source` MANUAL vs DOMAIN** : ne pas écraser un membre MANUAL par un rattachement DOMAIN (et inversement) sans règle explicite ; le retrait manuel d'un membre DOMAIN peut être recréé à la prochaine connexion si le domaine matche toujours.
- **SUPER_ADMIN uniquement** sur `/backoffice/*` : ne pas relâcher la garde de rôle.

### Debugging Notes

- Évènement privé qui « disparaît » côté visiteur : c'est le 404 attendu si non-membre. Vérifier `EventGroup` (liaisons) et `GroupMember` (appartenance, `source`) pour l'utilisateur visé.
- Membre attendu absent : vérifier que `emailDomain` du groupe matche bien le domaine (normalisé sans `@`, en minuscules) et que `applyDomainMembershipsForUser` a tourné à la dernière connexion.
- CA HT incohérent : confirmer `app.reporting.vatRate` chargé (défaut 0.10) et que `Order.totalCents` est bien TTC ; recalcul = `round(TTC / (1 + vatRate))`.
- Sauvegarde d'accès en erreur 400 : un `groupId` n'appartient pas à l'organisation (cross-tenant) — vérifier l'`orgId` courant et les groupes cochés.

## [2026-06-06] App opérateur — Refonte design du board + centralisation des couleurs de statut + LoginForm partagé

### What Was Built

Finition de la refonte white-label sur la surface OPÉRATEUR (`apps/operator`), côté **board** (qui avait été oublié par la passe `0.23.0`, laquelle n'avait traité que le login et le shell) :

1. **Source de vérité unique des statuts** : `components/StatusBadge.tsx` exporte désormais deux maps publiques — `STATUS_COLORS` (couleur par `StatusVariant`) et `STATUS_LABELS` (libellé FR par statut), pour les 8 statuts de `OrderStatus` (PAID, ACCEPTED, PREPARING, READY, PICKED_UP, COMPLETED, CANCELLED, RECOVERED).
2. **Déduplication** : les copies locales de la table couleur dans `OrderCard.tsx`, `DashboardColumn.tsx` et `NotificationPopup.tsx` (3 duplications) sont supprimées ; ces composants importent maintenant `STATUS_COLORS` depuis `StatusBadge`.
3. **Alignement BRAND** : les 3 composants kanban + la page dashboard passent aux tokens `@break-eat/brand` (fond blanc/`bgSubtle`, bordures `border`, encres `ink`/`inkSoft`/`grey`, accent `orange`, police Fredoka).
4. **`LoginForm` partagé** : nouveau `components/LoginForm.tsx`, login opérateur unique consommé par la home (`app/page.tsx`) ET le dashboard (`app/dashboard/[eventId]/page.tsx`). Les deux LoginForm inline (dont l'ancien sombre du dashboard) sont supprimés.
5. **Header dashboard white-label** : header blanc avec `BreakEatLogo` + wordmark « BREAKEAT », chip fournisseur orange, compteur « commandes actives », et helper local `HeaderButton` (blanc, hover orange) pour les actions ↺ / plein écran / Déconnexion.

### Why It Was Built

- **Cohérence de marque** : un opérateur passe du login (déjà rebrandé blanc/orange) au board (encore sombre `#1f2937` + « 🍔 BREAK EAT ») — la rupture visuelle trahissait une refonte inachevée. Le board est l'écran que l'opérateur fixe toute la journée ; il doit porter l'identité Break Eat.
- **Une seule source de vérité** : trois copies de la même table couleur dérivaient déjà (teintes différentes par fichier). Centraliser dans `StatusBadge` garantit que badge, bordure de carte, bandeau de colonne et popup partagent exactement la même couleur par statut.
- **Anti-divergence du login** : extraire `LoginForm` empêche la home et le dashboard de re-développer deux écrans de connexion qui dérivent (le problème exact qui a produit l'ancien LoginForm sombre).

### How It Works

1. **Couleur/Libellé par statut** : tout composant qui doit colorer ou nommer un statut importe `STATUS_COLORS[status]` / `STATUS_LABELS[status]` depuis `./StatusBadge`. `DashboardColumn` en dérive sa bordure haute (`borderTop 3px solid headerColor`), `OrderCard` sa bordure gauche (`borderLeft 4px solid color`) et la couleur de ses boutons d'action, `NotificationPopup` son fond (`READY` → vert, sinon orange de marque).
2. **Login** : `LoginForm` appelle `login(email, password)` (orders-client), stocke le JWT sous `operator_token`, puis remonte le token via `onLogin(token)`. La home et le dashboard rendent `<LoginForm onLogin={setToken} />` tant que `token` est nul.
3. **Header** : `HeaderButton` est un bouton blanc bordé `BRAND.border` dont le hover bascule bordure + texte en `BRAND.orange` (transition CSS inline). Le compteur « N commandes actives » somme `data.counts`. `ConnectionBadge` (sémantique connecté/connexion/déconnecté/erreur) est volontairement conservé tel quel.

### Code References

- `apps/operator/src/components/StatusBadge.tsx` — `export const STATUS_COLORS` + `export const STATUS_LABELS` (source de vérité unique des couleurs/libellés de statut) ; `type StatusVariant`.
- `apps/operator/src/components/OrderCard.tsx` — `import { BRAND }` + `import { StatusBadge, STATUS_COLORS, type StatusVariant } from './StatusBadge'` ; carte = `border BRAND.border` + `borderLeft 4px solid color` ; `ActionButton`/`SmallButton` couleur = `STATUS_COLORS[...]`, disabled = `BRAND.bgSubtle`/`BRAND.grey`.
- `apps/operator/src/components/DashboardColumn.tsx` — `const headerColor = STATUS_COLORS[status] ?? BRAND.inkSoft` ; conteneur `background BRAND.bgSubtle` + `borderTop 3px solid headerColor` ; maps `COLUMN_BG`/`HEADER_COLOR` supprimées ; `COLUMN_HEADERS` (emojis) conservés.
- `apps/operator/src/components/NotificationPopup.tsx` — `const bg = isReady ? STATUS_COLORS.READY : BRAND.orange`.
- `apps/operator/src/components/LoginForm.tsx` (nouveau) — `export function LoginForm({ onLogin })` ; `login()` + `localStorage.setItem('operator_token', accessToken)` ; `BreakEatLogo size={54} showWordmark`.
- `apps/operator/src/app/page.tsx` — `import { LoginForm }` ; `if (!token) return <LoginForm onLogin={setToken} />` ; LoginForm inline supprimé.
- `apps/operator/src/app/dashboard/[eventId]/page.tsx` — `function HeaderButton(...)` (helper) ; `<header>` blanc (`BreakEatLogo size={26}` + « BREAKEAT » + chip fournisseur `orangeTint`/`orangeSoft`/`orangeDark`) ; `<main>` `background BRAND.bgSubtle` + `fontFamily BRAND.font` ; LoginForm sombre inline supprimé.

### Data Flow

- **Statut → couleur** : `useDashboard` fournit `data.orders[status]` ; la page mappe chaque ordre en `OrderCardProps` (avec `status: StatusVariant`) ; `OrderCard`/`DashboardColumn`/`NotificationPopup` lisent `STATUS_COLORS[status]` — aucune table couleur locale n'intervient plus.
- **Auth** : `LoginForm` → `operator_token` (localStorage) → la home lit ce token au montage et bascule sur `EventSelector` ; le dashboard lit ce token et bascule sur le board. Aucun changement de contrat API.

### Dependencies

- Internes : `@break-eat/brand` (`BRAND`, `BreakEatLogo`), `StatusBadge` (maps statut), `orders-client` (`login`), `useDashboard`/`useSound` (inchangés).
- Externes : React 19 / Next.js 15 (App Router, `'use client'`). Aucune nouvelle dépendance.

### Tests and Verification

- `pnpm --filter @break-eat/operator typecheck` → **exit 0** (le `BreakEatLogo` désormais utilisé dans le header lève l'avertissement import-inutilisé).
- `pnpm --filter @break-eat/operator lint` → **exit 0**.
- `pnpm --filter @break-eat/operator build` → **✓ compilé, 4 routes** (`/dashboard/[eventId]` 7.56 kB, `/` 3.9 kB).
- Vérification manuelle attendue (non bloquante) : login → sélection d'événement → board ; le board doit être blanc, les badges/cartes/colonnes/popup partageant la même couleur par statut.

### Risks and Safe Change Rules

- **Ne pas réintroduire de table couleur locale** : toute couleur de statut doit venir de `STATUS_COLORS` (`StatusBadge.tsx`). Ajouter un statut = l'ajouter dans `STATUS_COLORS` **et** `STATUS_LABELS` (sinon `Record<StatusVariant, …>` casse au typecheck — c'est voulu).
- **`PAID` = orange de marque** est intentionnel (nouvelle commande = action à traiter). Ne pas le repasser en gris.
- **`ConnectionBadge` reste sémantique** (vert/ambre/rouge) — ne pas le « rebrander » en orange, il signale l'état réseau.
- **`LoginForm` est partagé** : toute évolution du login opérateur se fait ici, pas en réinscrivant un formulaire inline dans une page (c'est ce qui avait causé la divergence sombre).
- **Périmètre** : ceci n'est **pas** la restructuration par créneau (#17). Le board groupe toujours par STATUT. Ne pas confondre cette finition visuelle avec le rebuild par créneau, qui attend la démonstration du workflow par le product owner.

### Debugging Notes

- Couleur de statut incohérente entre badge et carte : chercher une table couleur locale résiduelle ; tout doit pointer vers `STATUS_COLORS`.
- Erreur de typecheck « Property 'X' is missing in type Record<StatusVariant,…> » : un statut a été ajouté à `StatusVariant` sans entrée dans `STATUS_COLORS`/`STATUS_LABELS`.
- Login qui diverge entre home et dashboard : vérifier que les deux rendent bien `components/LoginForm.tsx` (pas un formulaire inline).

## [2026-06-07] Phase 11 — Écrans opérateur configurables (fondation backend : schéma + module)

### What Was Built

Fondation backend du board opérateur **paramétrable**. Deux blocs :

1. **Modèle de données (11.1)** — deux nouveaux enums et deux nouveaux modèles, plus un champ sur `Slot` :
   - `enum SlotKind { IMMEDIATE | PAUSE_1 | PAUSE_2 | GENERAL | CUSTOM }` + `Slot.kind` (@default IMMEDIATE).
   - `enum OperatorScreenKind { ORDERS_QUEUE | READY | RECOVERED | GENERAL }`.
   - `OperatorScreenTemplate` (org-scoped, **réutilisable**) : `name`, `kind`, `icon?`, `sortOrder`, `enabled`, `slotKinds[]`, `statuses[]` (`OrderStatus`), `supplierIds[]`, `filters Json`, timestamps.
   - `EventOperatorScreen` (jonction) : `eventId`+`templateId`, `sortOrder?`/`enabled` en override par événement, `@@unique([eventId,templateId])`.
2. **OperatorScreensModule (11.2)** — `OperatorScreensService` + 2 contrôleurs (templates nichés sous l'org ; jonction nichée sous l'événement) + 4 DTO + spec (10 tests). Enregistré dans `app.module.ts`.

Périmètre : **backend seul**. L'UI admin (11.3), le rendu opérateur depuis `/resolved` (11.4) et le contrat FlaixPrepPlan (11.5) restent à faire.

### Why It Was Built

- **Paramétrabilité demandée** : « chaque dashboard doit être paramétrable, ajouter des écrans seulement pour certains créneaux, condition d'affichage ». Un board codé en dur (kanban PAID→RECOVERED) ne peut pas exprimer « écran Buvette pour le créneau mi-temps avec récap produits ».
- **Templates réutilisables (décision de co-conception)** : un club rejoue la même configuration d'écrans à chaque match. Définir au niveau **organisation** puis **appliquer** par événement évite de re-saisir la config à chaque fois ; l'override `sortOrder`/`enabled` par événement permet un ajustement ponctuel sans dupliquer le template.
- **`SlotKind` plutôt que `slotId`** : les slots sont des UUID **par événement**. Un template qui stockerait des `slotId` ne serait pas portable d'un événement à l'autre. Un **kind stable** (moment de récupération) rend le ciblage par créneau réutilisable. Les commandes sans slot sont assimilées à `IMMEDIATE`.

### How It Works

1. **Accès** : `requireOrgAccess(prisma, userId, orgId, roles)` — écriture template = `MANAGE_ROLES` (ORG_ADMIN/MANAGER), lecture = `ALL_ORG_ROLES`, SUPER_ADMIN bypass (via `globalRole` en DB). Les routes jonction résolvent d'abord `event→organizationId` puis appliquent la même garde.
2. **Statuts par défaut** : si `template.statuses` est vide, `resolveForEvent` les déduit du `kind` via `DEFAULT_STATUSES` (`ORDERS_QUEUE`→PAID/ACCEPTED/PREPARING, `READY`→READY, `RECOVERED`→PICKED_UP/RECOVERED, `GENERAL`→PAID/ACCEPTED/PREPARING/READY).
3. **Ordre effectif** : `sortOrder` effectif d'un écran appliqué = `lien.sortOrder ?? template.sortOrder` ; tri final par `sortOrder` puis `name`.
4. **Épinglage fournisseur** : `effectiveSupplierId = membership.supplierId ?? supplierIdParam ?? null`. L'épingle de l'opérateur (sa `OrganizationMember.supplierId`) **l'emporte** sur le `?supplierId` du query. Quand épinglé, les écrans dont `supplierIds` cible un **autre** fournisseur sont masqués (un écran `supplierIds: []` est visible par tous).
5. **`filters` opaque + sanitize serveur** : le `ValidationPipe` global (`whitelist`+`forbidNonWhitelisted`) **ne récurse pas** dans une propriété `@IsObject()` — donc les clés internes de `filters` survivent à la validation. On les nettoie côté service avec `sanitizeFilters` (whitelist des clés connues, dédup des tableaux de strings, coercition booléenne de `showRecap`).
6. **Erreurs** : `mapKnownError` mappe Prisma `P2002` (double application d'un template au même événement) → `ConflictException` ; un template d'une autre org → `NotFoundException` (pas de fuite d'existence).

### Code References

- `backend/prisma/schema.prisma` — `enum SlotKind`, `Slot.kind`, `enum OperatorScreenKind`, `model OperatorScreenTemplate`, `model EventOperatorScreen`, relations `Organization.operatorScreenTemplates` / `Event.operatorScreens`.
- `backend/prisma/migrations/20260606_phase11_operator_screens/migration.sql` — `CREATE TYPE` (×2), `ALTER TABLE slots ADD COLUMN kind`, `CREATE TABLE operator_screen_templates` / `event_operator_screens`, FK `ON DELETE CASCADE`, unique `(event_id, template_id)`, index.
- `backend/src/modules/operator-screens/operator-screens.service.ts` — `DEFAULT_STATUSES` (Record `OperatorScreenKind`→`OrderStatus[]`) ; `createTemplate`/`listTemplates`/`getTemplate`/`updateTemplate`/`deleteTemplate` ; `applyToEvent`/`listEventScreens`/`updateEventScreen`/`removeEventScreen` ; `resolveForEvent(eventId, userId, supplierIdParam?)` ; privés `requireTemplateInOrg`/`requireLinkInEvent`/`requireEventAccess` ; statiques `normalizeScreen`/`sanitizeFilters`/`mapKnownError` ; interfaces exportées `ScreenFilters`/`ResolvedOperatorScreen`.
- `backend/src/modules/operator-screens/operator-screen-templates.controller.ts` — `@Controller('organizations/:orgId/operator-screens')`, `@UseGuards(JwtAuthGuard)`.
- `backend/src/modules/operator-screens/event-operator-screens.controller.ts` — `@Controller('events/:eventId/operator-screens')`, route `GET 'resolved'` avec `@Query('supplierId')`.
- `backend/src/modules/operator-screens/dto/*.ts` — `create`/`update`-operator-screen, `apply`/`update`-event-screen.
- `backend/src/app.module.ts` — `OperatorScreensModule` (section « Phase 11 »).

### Data Flow

- **Config (admin, à venir 11.3)** : `POST organizations/:orgId/operator-screens` crée un template → `POST events/:eventId/operator-screens {templateId}` l'applique → `PATCH :linkId` ajuste `sortOrder`/`enabled` pour cet événement.
- **Consommation (opérateur, à venir 11.4)** : `GET events/:eventId/operator-screens/resolved` → `resolveForEvent` lit les `EventOperatorScreen` activés (avec template activé), normalise (statuts/ordre), applique l'épinglage fournisseur, renvoie `{ supplierId, screens: ResolvedOperatorScreen[] }`. Le board filtrera les commandes côté client par `statuses`/`slotKinds`/`filters` de chaque écran.

### Dependencies

- Internes : `PrismaService`, `requireOrgAccess` (common), `JwtAuthGuard` + `@CurrentUser()` (`JwtPayload.sub`).
- Externes : Prisma 6.19.3, `class-validator`/`class-transformer` (DTO). Aucune dépendance nouvelle.
- Enums Prisma consommés : `OrderStatus`, `OperatorScreenKind`, `SlotKind`.

### Tests and Verification

- `pnpm --filter @break-eat/backend typecheck` → **exit 0**.
- `pnpm --filter @break-eat/backend lint` → **0 erreur**.
- `operator-screens.service.spec.ts` → **10/10** : `sanitizeFilters` (garde clés connues / drop inconnues / dédup ; `{}` pour non-objet ; omet tableaux vides + `showRecap` non booléen), `createTemplate` (persiste défauts + trim du nom ; non-membre→403), `resolveForEvent` (statuts par défaut depuis kind + tri par ordre effectif ; pin fournisseur masque les autres ; event inconnu→404), `applyToEvent` (P2002→Conflict ; template cross-org→404).
- Migration appliquée via `prisma migrate deploy` ; `prisma generate` OK.

### Risks and Safe Change Rules

- **`SlotKind`, pas `slotId`, dans un template** : ne jamais stocker d'`slotId` dans `OperatorScreenTemplate` — ce serait non portable entre événements. Le ciblage par créneau passe par `slotKinds[]`.
- **L'épingle fournisseur l'emporte** : dans `resolveForEvent`, `membership.supplierId` prime sur le query `?supplierId`. Un opérateur épinglé ne doit pas pouvoir voir les écrans d'un autre fournisseur via le param — ne pas inverser cette priorité.
- **`statuses` vide = défaut par kind** : un template avec `statuses: []` n'est pas « aucun statut » mais « défaut du kind ». Ne pas confondre tableau vide et absence de filtre dans le rendu.
- **`@@unique([eventId,templateId])`** : un template ne s'applique qu'une fois par événement ; la double application remonte `P2002`→`Conflict`. Ne pas transformer `applyToEvent` en upsert silencieux sans intention explicite.
- **`filters` reste opaque côté DTO** : ne pas le passer en classe validée champ-par-champ sans vérifier l'interaction avec `forbidNonWhitelisted` ; aujourd'hui les clés internes survivent **parce que** `@IsObject` ne récurse pas, et c'est `sanitizeFilters` qui fait foi. Toute clé de filtre nouvelle doit être ajoutée à `sanitizeFilters` **et** à `ScreenFilters`.
- **`onDelete: Cascade`** : supprimer un template purge ses `EventOperatorScreen` ; supprimer un événement purge ses liens. Voulu — ne pas relâcher en `Restrict` sans repenser l'UX de suppression.

### Debugging Notes

- Un écran appliqué n'apparaît pas dans `/resolved` : vérifier que **le lien ET le template** sont `enabled`, et que `supplierIds` ne l'exclut pas pour l'opérateur épinglé.
- Mauvais ordre des écrans : c'est l'ordre effectif `lien.sortOrder ?? template.sortOrder` puis `name` — un `sortOrder` de lien à `null` retombe sur celui du template.
- Statuts inattendus sur un écran : si `template.statuses` est vide, ils viennent de `DEFAULT_STATUSES[kind]`. Changer le `kind` change les statuts par défaut.
- `409 Conflict` à l'application : le template est déjà appliqué à cet événement (`@@unique`). Lister via `GET events/:eventId/operator-screens` avant de réappliquer.
- Clé de `filters` qui « disparaît » : elle n'est pas dans la whitelist de `sanitizeFilters` — l'ajouter là (et dans `ScreenFilters`).

---

## [2026-06-07] Phase 11.3 — UI admin : écrans opérateur configurables (templates + application par événement)

### What Was Built

L'**interface admin** (Next.js 15, app `@break-eat/admin`) pilotant les deux surfaces backend de la Phase 11 : (1) CRUD des **modèles d'écran réutilisables** au niveau organisation, (2) **application/réordonnancement/activation par événement**. Trois fichiers créés (un builder partagé + deux pages de route) et trois modifiés (client API, nav, page détail événement).

### Why

Le board opérateur doit être **paramétrable sans toucher au code** : un manager configure quels écrans existent (« File de commandes », « Prêtes », « Récupérées »…), pour quels créneaux et fournisseurs, puis choisit lesquels appliquer à chaque match. La fondation backend exposait déjà tout (templates org-scoped + jonction par événement + `resolveForEvent`) ; il manquait l'UI. On modélise l'admin en **deux surfaces** qui calquent exactement les deux surfaces de routes — c'est cohérent avec le pattern déjà établi pour les Groupes (page top-level) et l'accès privé par événement (carte sur le détail).

### How It Works

- **Builder de conditions partagé** : `ScreenConditionsForm` est rendu à l'identique par la page de création et la page d'édition. Le state vit dans une forme **plate** (`ScreenDraft` : `name`/`kind`/`icon`/`sortOrder`/`enabled`/`slotKinds[]`/`statuses[]`/`supplierIds[]`/`categoryIds[]`/`showRecap`). `draftToInput()` reconstruit le `CreateOperatorScreenInput` attendu par l'API (n'inclut `filters.categoryIds` que s'il est non vide, `filters.showRecap` que s'il est `true`) ; `templateToDraft()` fait l'inverse au chargement de l'édition.
- **Application par événement** : la carte sur `events/[id]` charge en parallèle les écrans appliqués (`apiGetEventScreens`) et le catalogue complet de templates (`apiGetOperatorScreens`). Le sélecteur n'affiche que les templates **non encore appliqués** (`availableTemplates`). La liste appliquée est triée par **ordre effectif** = `lien.sortOrder ?? template.sortOrder` puis `name`.
- **Réordonnancement** : `moveScreen()` permute deux lignes adjacentes en mémoire puis `persistScreenOrder()` PATCHe un `sortOrder` explicite `0..n-1` **uniquement** sur les lignes dont le `sortOrder` (override de lien) diffère déjà de leur nouvel index — évite les écritures inutiles et rend l'ordre déterministe même quand tous les liens retombaient initialement sur le défaut du template (`sortOrder` de lien `null`).

### Code References

- `apps/admin/src/components/operator-screens/screen-form.tsx` — `ScreenConditionsForm`, `ScreenDraft`/`EMPTY_DRAFT`, `templateToDraft`/`draftToInput`, libellés `KIND_LABELS`/`SLOT_KIND_LABELS`/`STATUS_LABELS` (source unique).
- `apps/admin/src/app/(admin)/operator-screens/page.tsx` — liste + création (`summarize()` pour la ligne de conditions).
- `apps/admin/src/app/(admin)/operator-screens/[id]/page.tsx` — édition + suppression (`useParams()` → `screenId`).
- `apps/admin/src/app/(admin)/events/[id]/page.tsx` — carte « 🖥️ Écrans opérateur » : state `eventScreens`/`orgTemplates`/`applyTemplateId` ; handlers `handleApplyScreen`/`handleToggleScreen`/`handleRemoveScreen` ; `persistScreenOrder`/`moveScreen` ; dérivés `sortedScreens`/`availableTemplates`.
- `apps/admin/src/lib/api/admin-client.ts` — section « Operator Screens (Phase 11) » : types + 9 fonctions ; `kind?: SlotKind` sur `Slot`.
- `apps/admin/src/app/(admin)/layout.tsx` — `NAV_ITEMS` : « 🖥️ Écrans opérateur ».

### Data Flow

- **Créer un modèle** : `/operator-screens` (form) → `draftToInput` → `apiCreateOperatorScreen(orgId, input)` → `POST organizations/:orgId/operator-screens`.
- **Éditer / supprimer** : `/operator-screens/:id` → `apiUpdateOperatorScreen`/`apiDeleteOperatorScreen`.
- **Appliquer à un événement** : `events/:id` (carte) → `apiApplyEventScreen(eventId, {templateId})` → `POST events/:eventId/operator-screens`. Réordonner/activer → `apiUpdateEventScreen(eventId, linkId, {sortOrder?|enabled?})`. Retirer → `apiRemoveEventScreen`.
- **Consommation opérateur** (à venir 11.4) : `GET events/:eventId/operator-screens/resolved` (déjà servi par le backend).

### Dependencies

- Internes : `admin-client.ts` (`req<T>` + `getOrgId()`), tokens `@/lib/brand`, `screen-form.tsx`.
- Conventions admin : pages `'use client'`, données via `useState`/`useEffect`/`useCallback` (pas de TanStack Query dans les pages de feature), styles inline avec tokens BRAND.
- Aucune dépendance npm nouvelle.

### Tests and Verification

- `pnpm --filter @break-eat/admin typecheck` → **exit 0**.
- `pnpm --filter @break-eat/admin lint` → **0 erreur**.
- `pnpm --filter @break-eat/admin build` → **✓ 15 routes** ; nouvelles routes `/operator-screens` (2.41 kB), `/operator-screens/[id]` (2.17 kB) ; `/events/[id]` passe à 7.45 kB.
- Pas de test unitaire frontend (l'app admin n'a pas de suite Jest) — vérification par typecheck + lint + build, conforme aux autres pages admin.

### Risks and Safe Change Rules

- **Surface UI ⊂ surface serveur** : l'UI n'expose volontairement que `categoryIds` (inclusion) + `showRecap`. `productIds`/`excludeProductIds`/`excludeCategoryIds` existent dans `ScreenFilters` et sont sanitizés serveur — si on les expose, étendre `ScreenDraft` + `draftToInput`/`templateToDraft`, **pas** seulement le formulaire.
- **Ordre effectif** : toujours trier/raisonner avec `lien.sortOrder ?? template.sortOrder`. Ne pas supposer que `lien.sortOrder` est renseigné (il est `null` tant qu'on n'a pas réordonné).
- **Réordonnancement déterministe** : `persistScreenOrder` n'écrit que les lignes modifiées ; ne pas le « simplifier » en swap de deux `sortOrder` quand les deux valent `null` (le swap serait un no-op).
- **Suppression d'un template** = cascade serveur sur tous les `EventOperatorScreen`. Le `confirm()` de la page détail prévient ; ne pas retirer ce garde-fou.
- **`draftToInput` omet les filtres vides** : ne pas envoyer `filters: { categoryIds: [] }` (bruit) — n'inclure une clé que si elle porte de l'information.

### Debugging Notes

- Un modèle n'apparaît pas dans le sélecteur « Appliquer » : il est **déjà appliqué** à cet événement (filtré par `appliedTemplateIds`) — il est alors dans la liste du dessous.
- Réordonnancement sans effet visible : vérifier que `apiUpdateEventScreen` renvoie 200 et que `load()` est rappelé ; l'ordre n'est recalculé qu'après rechargement (`sortedScreens` dérive de `eventScreens`).
- « 409 Conflict » à l'application : doublon `@@unique([eventId,templateId])` — la liste devrait déjà l'avoir masqué ; rafraîchir la page si l'état local est désynchronisé.
- Libellé de kind/statut manquant : ajouter la clé dans `KIND_LABELS`/`STATUS_LABELS` de `screen-form.tsx` (source unique, pas de map locale dans les pages).

---

## [2026-06-07] Phase 11.4 — Board opérateur : rendu des écrans configurables (onglets + filtrage + Récap produits)

### What Was Built

Le dashboard opérateur (`@break-eat/operator`, `/dashboard/[eventId]`) **rend** désormais les écrans configurés en 11.3 : une barre d'**onglets** (un par écran résolu), chacun filtrant le flux de commandes temps réel par **statut + créneau + catégorie/produit**, plus un panneau **Récap produits** (agrégation par catégorie) et un outil **Accès rapide** (recherche). Côté backend, le payload du dashboard est **enrichi** pour porter les champs dont les écrans ont besoin. Deux fichiers opérateur créés (`lib/screens/filter.ts`, `components/RecapPanel.tsx`), un service backend + son spec modifiés, le client opérateur et la page board modifiés.

### Why

La fondation (11.1/11.2) et l'UI admin (11.3) permettaient de **définir** les écrans, mais le board affichait encore un Kanban fixe à 5 colonnes ignorant la config. Le verrou : le payload `GET /orders/event/:eventId/dashboard` exposait `slotId` (un UUID **par événement**) et `productId`, alors que les écrans filtrent par `slotKinds` (moment de récupération **portable**) et `filters.categoryIds`. **Conséquence** : deux écrans ne différant que par le créneau (« Immédiat » / « 1ère mi-temps » / « 2ème mi-temps », mêmes statuts) auraient rendu un contenu **identique**. Il fallait donc aplatir côté serveur `slotKind` (par commande) et `categoryId`/`categoryName` (par ligne). On ajoute `customerName` (= `user.displayName` seulement) car l'opérateur appelle les clients au retrait et la recherche se fait par nom — c'est une donnée métier nécessaire, exposée derrière l'auth opérateur, jamais l'email/téléphone.

### How It Works

- **Enrichissement backend** (`findDashboardByEvent`) : la requête inclut `slot.kind` + `user.displayName`. Comme `OrderItem` n'a **pas** de relation `product` (le `productId` est un snapshot figé), les catégories sont résolues par **un seul** `product.findMany` batché sur les `productId` **distincts** de toutes les commandes (Map `productId → {categoryId, categoryName}`), puis appliquées en mémoire. `slotKind` retombe sur `IMMEDIATE` quand la commande n'a pas de slot. La forme de réponse `{ eventId, counts, orders }` est **inchangée** ; on n'ajoute que des champs.
- **`PICKED_UP` ajouté à `DASHBOARD_STATUSES`** : l'écran `RECOVERED` a pour statuts par défaut `[PICKED_UP, RECOVERED]` (cf. `DEFAULT_STATUSES`) ; sans `PICKED_UP` dans le payload, sa colonne « récupérées » serait toujours vide. `COMPLETED`/`CANCELLED` restent exclus (terminaux, hors board).
- **Filtrage client** (`lib/screens/filter.ts`, helpers **purs**) : `orderMatchesScreen` applique le gate créneau (`slotKinds` vide = tous) puis exige ≥1 ligne passant `itemMatchesFilters` (include/exclude catégorie + produit). `buildScreenColumns(dashboard, screen)` produit, pour l'écran actif, un mini-Kanban scoppé à ses `statuses` (un statut absent du payload → colonne vide, sans planter). `countScreenOrders` alimente le badge d'onglet.
- **Rendu** : la page fetch `fetchResolvedScreens` **une fois** (config statique), garde la liste des écrans `enabled`, et choisit `activeScreen`. Si des écrans existent → `ScreenTabBar` + colonnes de l'écran actif ; sinon → **fallback** sur le Kanban fixe historique (`FALLBACK_COLUMNS`), garantissant la rétrocompat des événements sans config. Les commandes temps réel continuent d'arriver via `useDashboard` (Socket.IO + polling) — le filtrage est purement dérivé, donc les compteurs d'onglets et le Récap se mettent à jour live.
- **RecapPanel** : `aggregate()` parcourt les commandes **visibles de l'écran actif** (`boardColumns.flatMap`), regroupe `catégorie → produit → quantité`, trie par quantité. L'Accès rapide filtre ces mêmes commandes par `publicOrderNumber` **ou** `customerName` (max 8 résultats). Le toggle « 📊 Récap » s'initialise depuis `activeScreen.filters.showRecap`.

### Code References

- `backend/src/modules/orders/orders.service.ts` — `findDashboardByEvent` : include `slot.kind`/`user.displayName`, lookup batché `product.findMany`, map d'enrichissement (`slotKind`/`customerName`/`categoryId`/`categoryName`), `DASHBOARD_STATUSES` (+`PICKED_UP`).
- `backend/src/modules/orders/orders.service.spec.ts` — mock `prisma.product.findMany` ; tests « enriches each order… » et « skips the product lookup… ».
- `apps/operator/src/lib/api/orders-client.ts` — `Order`/`OrderItem` enrichis ; `ResolvedOperatorScreen`/`ScreenFilters`/`SlotKind`/`OperatorScreenKind` ; `fetchResolvedScreens`.
- `apps/operator/src/lib/screens/filter.ts` — `orderMatchesScreen`, `itemMatchesFilters`, `buildScreenColumns`, `countScreenOrders`, `hasActiveFilters`.
- `apps/operator/src/components/RecapPanel.tsx` — `aggregate()`, Accès rapide + Récap produits.
- `apps/operator/src/app/dashboard/[eventId]/page.tsx` — `loadScreens`/`activeScreen`, `ScreenTabBar`, `toCardProps`, `boardColumns`, `useScreens`, toggle `recapOpen`.

### Data Flow

1. `useDashboard` → `GET /orders/event/:eventId/dashboard?supplierId=` → `{ counts, orders }` enrichis (slotKind/customerName/categoryId/categoryName).
2. Page mount → `fetchResolvedScreens` → `GET /events/:eventId/operator-screens/resolved?supplierId=` → écrans résolus (fournisseur épinglé appliqué serveur).
3. `activeScreen` + `data.orders` → `buildScreenColumns` → colonnes (`DashboardColumn` → `OrderCard`). `countScreenOrders` → badges d'onglets.
4. `boardColumns.flatMap` → `RecapPanel` (agrégation + recherche).

### Dependencies

- Backend : Prisma (relations `Order.slot`/`Order.user`/`Product.category` déjà présentes — **aucune migration**). `SlotKind` importé de `@prisma/client`.
- Opérateur : helpers purs (aucune dépendance npm) ; `RecapPanel` réutilise `StatusBadge` + tokens `@break-eat/brand`. `DashboardColumn`/`OrderCard` inchangés.

### Tests and Verification

- Backend : `typecheck` exit 0 · `lint` 0 · `jest orders` → **88/88** (3 suites ; 2 tests d'enrichissement ajoutés).
- Opérateur : `typecheck` exit 0 · `lint` 0 · `build` ✓ (`/dashboard/[eventId]` 9.37 kB). Pas de runner Jest dans l'app opérateur → les helpers `filter.ts` sont purs et couverts par typecheck ; la logique de données côté serveur est testée par jest.

### Risks and Safe Change Rules

- **Ne pas casser la forme `{ eventId, counts, orders }`** : les clients (opérateur board) en dépendent. On **ajoute** des champs, on ne renomme/retire jamais.
- **`OrderItem` n'a pas de relation `product`** : ne pas tenter `include: { items: { include: { product } } }` (échoue au typecheck). Toujours passer par le lookup batché `product.findMany` sur les `productId` distincts.
- **`customerName` = `displayName` uniquement** : ne **jamais** ajouter email/téléphone au payload du board (donnée partagée à l'écran). Respecte la contrainte privacy.
- **Fallback obligatoire** : si `screens.length === 0`, garder le Kanban fixe. Ne pas supposer qu'un événement a forcément des écrans configurés.
- **Filtrage = dérivé, pas de fetch par onglet** : tout l'état vient d'un seul snapshot `data.orders` ; changer d'onglet ne doit pas déclencher d'appel réseau (sinon on perd le temps réel et on multiplie la charge).
- **`buildScreenColumns` tolère les statuts absents** : un écran peut lister un statut que le dashboard ne sert pas → colonne vide, pas d'erreur. Si on ajoute un statut aux écrans, vérifier qu'il est dans `DASHBOARD_STATUSES` pour qu'il s'affiche.
- **Hors périmètre** : regroupement « commandes similaires » (11.4c) et plan de préparation Flaix (11.5) — ne pas les improviser ici ; 11.5 attend le code Flaix (frontière Flaix décide / Break affiche).

### Debugging Notes

- Onglets vides alors que des commandes existent : vérifier que l'écran a les bons `slotKinds` (un écran « 1ère mi-temps » ne montre que les commandes dont `slotKind === 'PAUSE_1'`) et que les commandes portent bien un `slotId` mappé à ce kind (sinon elles tombent en `IMMEDIATE`).
- Colonne « récupérées » vide : confirmer que `PICKED_UP` est dans `DASHBOARD_STATUSES` (sinon le payload ne les sert pas).
- Récap vide / catégorie « Autres » : `categoryName` est `null` (produit sans catégorie résolue) → tombe dans le groupe « Autres ». Vérifier que le `product.findMany` retourne bien `category.name`.
- Aucun onglet ne s'affiche : `fetchResolvedScreens` a échoué (catch → `screens=[]`) **ou** aucun écran `enabled` → fallback Kanban. Vérifier le réseau et que des écrans sont appliqués + activés pour l'événement.
- Recherche Accès rapide sans résultat : elle ne porte que sur les commandes **de l'écran actif** (volontaire) ; une commande d'un autre écran n'apparaît pas — changer d'onglet.

---

## [2026-06-07] Phase 11.4c — Board opérateur : regroupement visuel « X commandes similaires »

### What Was Built

Le board opérateur peut désormais **empiler les commandes au panier identique** d'une même colonne en une seule **carte de groupe**. Un toggle header « 🧩 Grouper » (désactivé par défaut) bascule chaque colonne entre cartes plates et cartes groupées. Une carte de groupe affiche la composition partagée **une fois**, le total d'articles, l'âge de la plus ancienne, les **badges de n°** de chaque commande, un bouton **batch** (avance tout le lot au statut suivant) et un dépliage « Voir les N » révélant les `OrderCard` individuelles. Deux fichiers opérateur créés (`lib/screens/grouping.ts`, `components/OrderGroupCard.tsx`), `DashboardColumn`/`OrderCard`/page board/stories modifiés. **Aucun changement backend.**

### Why

Réponse au workflow décrit par l'utilisateur : « les groupes de commande se préparent ensemble, et non une par une ». En rush, un même panier (« Burger + Frites ») est commandé en boucle ; les traiter carte par carte multiplie les gestes. Empiler les paniers identiques donne à l'équipe prep une vue « lot » et un bouton pour avancer tout le lot d'un coup. **Frontière respectée** : c'est de l'**affichage owned by Break**, pas de la décision. Le regroupement par **difficulté** (facile/moyen/difficile) est un axe **différent** que **Flaix** décidera (11.5) ; ici on ne regroupe que par **composition exacte**, ce qui ne dépend d'aucune IA et ne pré-empte pas le plan Flaix.

### How It Works

- **`groupSimilarOrders(orders)`** (`lib/screens/grouping.ts`, pur) : construit pour chaque commande une **signature** = ses lignes `productId:quantity` **triées** puis jointes (l'ordre des lignes n'affecte pas l'identité). Les commandes de même signature sont clusterisées dans l'ordre d'arrivée (FIFO-préservé, le snapshot étant trié `createdAt asc`). Une commande au panier unique forme un **groupe de 1** → le board groupé est un **sur-ensemble strict** du board plat : rien n'est caché, rien n'est fusionné au niveau données.
- **`OrderGroupCard`** : si `group.size === 1`, rend simplement `<OrderCard>` (zéro bruit visuel pour les commandes uniques). Sinon, la carte empilée. Le bouton batch est contextuel au statut (`BATCH_LABEL`) : `PAID→Accepter`, `ACCEPTED→Préparer`, `PREPARING→Marquer prêtes`, `READY→Récupérées`, `RECOVERED→Ré-accepter` ; un statut hors map n'affiche pas de bouton batch. Le dépliage rend chaque `OrderCard` avec ses actions par commande (récupérer/annuler), donc le contrôle individuel reste toujours possible.
- **`DashboardColumn`** : son API passe de `orders: OrderCardProps[]` à `orders: Order[]` + `toCardProps(order)` (mapping paresseux, nécessaire car le regroupement a besoin du `productId` brut, absent de `OrderCardProps`). Props ajoutées : `grouped?` et `onBatchAdvance?`. En mode groupé, la colonne appelle `groupSimilarOrders` puis rend des `OrderGroupCard` ; sinon des `OrderCard` plates. **Le compteur d'en-tête reste `orders.length`** (nombre de commandes, pas de groupes).
- **Page board** : état `grouped` (toggle header, **off par défaut**). `batchAdvance(orders)` lit le statut du premier ordre du groupe (tous partagent le statut, le regroupement étant intra-colonne), choisit la transition correspondante et la déclenche pour **toutes** les commandes en parallèle (`Promise.all`) puis `loadSnapshot()`. Le temps réel met ensuite à jour le board.

### Code References

- `apps/operator/src/lib/screens/grouping.ts` — `groupSimilarOrders`, `compositionSignature`, types `OrderGroup`/`GroupedLine`.
- `apps/operator/src/components/OrderGroupCard.tsx` — carte empilée, `BATCH_LABEL`, dépliage, `runBatch` (busy state).
- `apps/operator/src/components/DashboardColumn.tsx` — nouvelle API (`orders: Order[]` + `toCardProps` + `grouped` + `onBatchAdvance`), branche groupée/plate.
- `apps/operator/src/components/OrderCard.tsx` — `elapsed` désormais **exporté**.
- `apps/operator/src/app/dashboard/[eventId]/page.tsx` — `grouped` state, toggle « 🧩 Grouper », `batchAdvance`, appel `DashboardColumn` mis à jour.
- `apps/operator/src/stories/DashboardColumn.stories.tsx` — stories migrées + story « groupées ».

### Data Flow

1. `data.orders` (snapshot enrichi 11.4a) → `buildScreenColumns`/fallback → `boardColumns: { status, orders: Order[] }[]`.
2. `DashboardColumn` reçoit `orders: Order[]` + `grouped`. Si `grouped` → `groupSimilarOrders(orders)` → `OrderGroup[]` → `OrderGroupCard`.
3. Clic batch → `onBatchAdvance(group.orders)` → `Promise.all(transition par commande)` → `loadSnapshot()` → refetch → re-render.
4. Dépliage → `group.orders.map(toCardProps)` → `OrderCard` individuelles (actions par commande inchangées).

### Dependencies

- 100 % client opérateur, **aucune dépendance npm ajoutée**, **aucune migration**, **aucun changement backend** (le payload 11.4a fournit déjà `productId` par ligne, seule donnée nécessaire à la signature).
- Réutilise `OrderCard`/`StatusBadge` + tokens `@break-eat/brand`.

### Tests and Verification

- Opérateur : `typecheck` exit 0 · `lint` 0 · `build` ✓ (`/dashboard/[eventId]` **10.3 kB**, +~0.9 kB vs 11.4). Backend inchangé → `jest orders` reste **88/88**.
- Pas de runner Jest dans l'app opérateur → `groupSimilarOrders` est pur et déterministe (couvert par typecheck + revue) ; la story Storybook « 6 commandes identiques (groupées) » sert de vérification visuelle.

### Risks and Safe Change Rules

- **Le regroupement ne fusionne jamais les commandes** : chaque `Order` reste une entité indépendante avec son cycle de vie. Ne pas « optimiser » en fusionnant des entités côté données — c'est un pur regroupement d'affichage.
- **Signature = `productId:quantity` triés** : si on ajoute des options/variantes par ligne au modèle, **les inclure dans la signature** (sinon des paniers réellement différents seraient empilés). Aujourd'hui `OrderItem` n'a pas d'options → safe.
- **Compteur de colonne = nombre de commandes** : ne pas le remplacer par le nombre de groupes (masquerait le volume réel à préparer).
- **Toggle off par défaut** : préserver ce défaut tant qu'on n'a pas validé en service réel ; le mode groupé est additif et réversible.
- **Batch borné aux statuts avançables** : `batchAdvance` ne mappe que `PAID/ACCEPTED/PREPARING/READY/RECOVERED`. Si on étend la state machine, mettre à jour **à la fois** `BATCH_LABEL` (UI) et `advance` (page) — sinon le bouton apparaît sans action, ou inversement.
- **Distinct de Flaix (11.5)** : ne pas détourner ce regroupement pour simuler la difficulté Flaix. Quand le plan Flaix arrivera, il s'affichera comme un **axe séparé** posé par-dessus, sans remplacer le regroupement « similaires ».

### Debugging Notes

- Le toggle « 🧩 Grouper » n'apparaît pas : il est gardé par `{data && …}` dans le header — il ne s'affiche qu'une fois le premier snapshot chargé.
- Activer « Grouper » ne change rien visuellement : normal si aucune colonne n'a deux commandes au **panier strictement identique** (même produits **et** mêmes quantités). Les singletons rendent une `OrderCard` normale.
- Bouton batch absent sur une carte de groupe : le statut de la colonne n'est pas dans `BATCH_LABEL` (ex. `PICKED_UP`) — volontaire (rien à avancer).
- Le batch laisse des commandes en arrière : depuis l'audit Codex, `batchAdvance` utilise `Promise.allSettled` + `loadSnapshot()` **inconditionnel** + bannière `batchError`. Si N/total échouent, le board est tout de même rafraîchi et la bannière ambre l'indique — réessayer sur celles encore en attente (le board temps réel peut avoir bougé entre l'affichage et le clic).
- Cartes empilées qui débordent la colonne : le faux « stack » est décalé de 6px et la carte a `marginRight/Bottom: 6` — si une refonte change la largeur de colonne, garder cette marge pour éviter le rognage.

---

## [2026-06-07] Audit Codex — corrections sécurité & robustesse (post-11.4c)

### What Was Built

Trois correctifs issus de l'audit Codex (frontière d'audit : 2026-06-02) :
1. **Fuite d'événements privés via l'écran public READY** (P1, sécurité). `GET /public/orders/event/:eventId/ready` n'avait **aucun garde** : connaître l'UUID d'un événement privé suffisait à lire les numéros publics de ses commandes prêtes.
2. **Fichiers `*.tsbuildinfo` suivis par Git** (P2, hygiène). `apps/admin` et `apps/operator` traçaient leur cache de build incrémental TS → diff pollué à chaque build.
3. **Batch opérateur non atomique** (P2, robustesse UX). L'avance groupée (11.4c) utilisait `Promise.all` : un échec en milieu de lot laissait un état mixte **et** sautait le refresh (le `.then` ne se déclenchait jamais).

### Why

- **Parité de sécurité.** `PublicEventsController` gatait déjà les événements privés (Phase 14.4) ; `PublicOrdersController` était la seule route publique restée ouverte. Un écran public ne doit jamais exposer les commandes d'un événement privé à un anonyme qui devine l'UUID.
- **Propreté du dépôt / CI.** Un `.tsbuildinfo` versionné crée des conflits et du bruit de diff sans valeur (artefact machine-local).
- **Confiance opérateur en rush.** En plein coup de feu, un batch partiellement appliqué sans message ni refresh = confusion (l'opérateur ne sait pas quelles commandes ont bougé).

### How It Works

- **Garde READY** : `@UseGuards(OptionalJwtAuthGuard)` + `groupsService.canAccessEvent(eventId, user?.sub ?? null)`. PUBLIC → tout le monde (écran anonyme OK) ; PRIVATE → seulement un membre authentifié d'un groupe lié ; inconnu/refusé → `404` identique (jamais de fuite d'existence). `OrdersModule` importe désormais `GroupsModule`. Le service `findReadyByEvent` est **inchangé** (le gate vit dans le contrôleur, comme pour les events).
- **`.tsbuildinfo`** : `git rm --cached` des deux fichiers + `*.tsbuildinfo` ajouté à la section « Build outputs » du `.gitignore` racine. Les fichiers restent sur disque, simplement plus suivis.
- **Batch résilient** : `batchAdvance` passe à `Promise.allSettled`, **toujours** `await loadSnapshot()` (le board reflète l'état réel quoi qu'il arrive), puis si `rejected > 0` affiche une bannière ambre dismissible (`batchError`).

### Code References

- `backend/src/modules/orders/public-orders.controller.ts` — garde + `canAccessEvent`.
- `backend/src/modules/orders/orders.module.ts` — `imports: [..., GroupsModule]`.
- `backend/src/modules/orders/public-orders.controller.spec.ts` (créé) — 3 cas : accès anonyme autorisé, propagation du `sub`, **404 + service jamais appelé** quand refusé.
- `apps/operator/src/app/dashboard/[eventId]/page.tsx` — `batchAdvance` (allSettled), état `batchError`, bannière.
- `.gitignore` — `*.tsbuildinfo`.

### Data Flow

Écran public TV → `GET /public/orders/event/:id/ready` (sans token) → `OptionalJwtAuthGuard` (user undefined) → `canAccessEvent(id, null)` → PUBLIC `true` (liste servie) / PRIVATE `false` (`404`). Le client public (`/public/[eventId]`) fait `if (!res.ok) return` → board vide, pas de crash.

### Dependencies

- `OptionalJwtAuthGuard`, `CurrentUser`, `JwtPayload`, `GroupsService.canAccessEvent` (tous préexistants, Phase 14.4).
- Aucune nouvelle dépendance npm.

### Tests

- Backend : **25 suites / 306 tests** (303 → +3 du nouveau spec contrôleur). `typecheck` exit 0.
- Opérateur : `typecheck` exit 0 · `lint` 0 · `build` ✓ (`/dashboard/[eventId]` 10.5 kB).

### Root Turbo pipeline — mise au point (P1 audit, non-bug)

L'audit signalait `turbo run build/typecheck/lint` cassé (« Unable to find package manager binary »). **Vérifié ici : sain** (3× exit 0 en dry-run, pnpm 11.3.0 = `packageManager`). Tous les environnements réels provisionnent pnpm : CI (`.github/workflows/ci.yml` via `pnpm/action-setup@v4`), Vercel (`vercel.json` → `pnpm install` + `pnpm build`), Railway (`nixpacks.toml` → `corepack prepare pnpm@11.3.0`). L'échec Codex venait de son **sandbox** (pnpm absent du PATH là où Turbo le cherche), pas du dépôt. **Règle** : si `turbo` ne trouve pas le binaire, provisionner pnpm (`corepack enable` / `corepack prepare pnpm@11.3.0 --activate`) ; les builds **package par package** (`pnpm --filter <pkg> build`) sont le fallback fiable.

### Risks and Safe Change Rules

- **Ne jamais rouvrir une route publique sans `canAccessEvent`.** Toute nouvelle route `public/*` lisant des données d'événement doit gater PRIVATE via le même garde, sinon régression de la fuite.
- **`findReadyByEvent` reste sans gate** : le contrôle d'accès vit dans le **contrôleur**. Ne pas dupliquer (ni retirer) le gate.
- **Écran public = PUBLIC events.** Pour afficher un écran READY d'un événement **privé**, il faudra un vrai **token d'écran public** (non implémenté) — pas un retrait du garde.
- **Batch** : garder `allSettled` + reload **inconditionnel**. Un futur endpoint backend batch **transactionnel** serait l'idéal (atomicité réelle) mais reste hors périmètre V1.

### Debugging Notes

- Écran public vide pour un événement : normal si l'événement est **PRIVATE** (404 anonyme) → utiliser un événement PUBLIC ou prévoir un token d'écran. Vérifier `event.visibility`.
- `OrdersModule` ne démarre pas (DI) : vérifier que `GroupsModule` exporte bien `GroupsService` (il le fait) — pas de cycle car `GroupsModule` n'importe rien.
- Bannière batch qui persiste : cliquable pour masquer (`setBatchError(null)`) ; elle se réinitialise à chaque nouveau batch.


