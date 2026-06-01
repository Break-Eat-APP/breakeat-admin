# BRAT EAT Engineering Manual

Version: living developer handbook

## Purpose

This document is the technical notice for BRAT EAT.

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
- pnpm workspaces : toujours installer les dépendances depuis la racine (`pnpm add <pkg> --filter @brat-eat/backend`)

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

Les Events sont le contexte d'activation de toute la logique métier de BRAT EAT. Sans Venue + Event + Supplier + PickupPoint, Phase 4 (produits) et Phase 5 (checkout) n'ont pas de contexte pour fonctionner. Le statut machine de l'event protège les transitions et interdit les modifications sur ENDED/CANCELLED.

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

Sans paiement, l'application n'a pas de revenu. Sans Order, pas d'audit, pas de dashboard, pas d'historique. Sans Stripe Connect, le marketplace n'est pas légal (les fonds ne peuvent pas être encaissés par BRAT EAT puis redistribués sans agrément financier). Connect transfère directement aux suppliers, BRAT EAT prélève une commission via `application_fee_amount`.

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
→ BRAT EAT (plateforme) reçoit 0.80 € comme application fee
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

- Repo initialisé en local (branche `main`), commit initial `fbf6147`. **Aucun remote, aucun push** — le product owner crée le repo GitHub puis on push (prérequis import Vercel/Railway).
- `.gitattributes` force `eol=lf` pour le texte (les builds tournent sur Linux Railway/Vercel) et marque `binary` les `.docx/.pdf/.png/.p8/.p12/.keystore`. Les copies de travail Windows peuvent rester en CRLF.



