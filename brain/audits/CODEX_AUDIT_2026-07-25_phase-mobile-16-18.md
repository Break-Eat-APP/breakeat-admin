# À ENVOYER À CODEX — Audit phase mobile 16→18 (2026-07-25)

> Copie tout le bloc ``` ci-dessous et envoie-le à Codex.
> Archive ensuite son rapport dans ce même dossier `/brain/audits/`.

```
Tu es Codex, auditeur technique du projet BREAK EAT.

## Contexte projet

BREAK EAT est une plateforme de click & collect en temps réel pour stades et entreprises.
Stack : NestJS 11 + TypeScript strict + Prisma 6 + PostgreSQL + React Native 0.79 (Expo SDK 53, bare) + Next.js 15.
Monorepo pnpm workspaces. Apps : backend, apps/admin, apps/backoffice, apps/operator, apps/mobile ; packages/brand.

Fichiers de référence dans /brain :
- ARCHITECTURE.md — règles d'architecture, modules autorisés
- DOMAIN_MODEL.md — entités, relations, règles métier
- ENGINEERING_MANUAL.md — notice technique avec références de code
- TASK_SUMMARY.md — résumé de chaque phase (voir l'entrée 2026-07-25 en tête)
- CHANGELOG.md (racine) — fichiers créés/modifiés par phase
- REPRISE.md (racine) — état courant + dette technique + pièges (À LIRE : section « Entrées de build » et « Dette technique »)

## ⚠️ Deux contraintes de cet audit

1. **Backend hors ligne** : l'essai Railway a expiré, le backend est en pause. Tu ne peux PAS lancer `pnpm start`/tester les endpoints live. Fais un audit STATIQUE (types, lint, logique, sécurité, cohérence schéma Prisma). Tu peux lancer `pnpm typecheck`, `pnpm lint`, `pnpm test` (backend) en local si l'environnement le permet.
2. **Entrée de build mobile** : le bundle livré (web Vercel ET natif iOS EAS) est `apps/mobile/index.expo.js` → `App.expo.tsx` (champ package.json `main`). `App.tsx`/`root-navigator.tsx` sont du CODE MORT non livré. Dans `App.expo.tsx`, EventHome/OrderTracking/QRScanner sont des stubs. N'audite pas `App.tsx` comme s'il était livré.

## Phase auditée

Phase mobile 16→18 — découverte des lieux (géoloc), back office SUPER_ADMIN, hébergement Vercel, build iOS interne (EAS) + résolution des crashs, plan des buvettes par lieu.

## Fichiers modifiés dans cette phase

### [0.41.0] Phase 18 — Plan des buvettes
+ backend/prisma/migrations/20260725_phase18_venue_buvette_plan/migration.sql
~ backend/prisma/schema.prisma (Venue.buvettePlanUrl)
~ backend/src/modules/venues/dto/create-venue.dto.ts, update-venue.dto.ts
~ backend/src/modules/venues/venues.service.ts
~ backend/src/modules/venues/public-venues.controller.ts
~ backend/src/modules/events/public-events.controller.ts (venue.buvettePlanUrl)
~ apps/admin/src/lib/api/admin-client.ts (Venue/VenueInput + buvettePlanUrl)
~ apps/admin/src/app/(admin)/organizations/[id]/page.tsx (champ URL du plan)
+ apps/mobile/src/components/buvette-plan-viewer.tsx (Modal plein écran, pinch-zoom iOS)
~ apps/mobile/src/lib/api/mobile-api.ts (PublicVenue.buvettePlanUrl + PublicEvent.venue.buvettePlanUrl)
~ apps/mobile/src/screens/venue-discovery.screen.tsx (CTA plan + cartes égales + cœur = favori, "Gérer" retiré)
~ apps/mobile/src/screens/order-confirmation.screen.tsx (bouton plan)
~ apps/mobile/src/store/cart.store.ts (venueBuvettePlanUrl)
~ apps/mobile/src/screens/checkout.screen.tsx, event-home.screen.tsx
~ apps/mobile/src/navigation/root-navigator.tsx (param OrderConfirmation.buvettePlanUrl)

### [0.40.0] Build iOS interne (EAS) + résolution des crashs
~ apps/mobile/metro.config.js (resolveRequest : react/react-dom/react-native singletons — FIX PRINCIPAL du crash "useState of null")
~ apps/mobile/index.expo.js, index.js (registerRootComponent + garde-fou)
+ apps/mobile/src/components/crash-guard.tsx (ErrorBoundary + handler ErrorUtils global)
~ apps/mobile/src/instrument.ts (Sentry.init en try/catch)
~ apps/mobile/src/navigation/root-navigator.tsx (QRScanner lazy via getComponent)
~ apps/mobile/package.json (deps alignées Expo SDK 53 ; expo.install.exclude = @types/react)
~ apps/mobile/app.config.js, eas.json (profil preview interne, EAS projectId, appleTeamId)

### [0.39.0] Hébergement Vercel + typographie Raleway
+ apps/mobile/vercel.json (SPA rewrites)
~ apps/mobile/scripts/fix-web-assets.cjs (assets .pnpm → /vendor)
~ apps/mobile/src/lib/theme.ts (HEAD Raleway, BLOC Oswald)
~ apps/mobile/App.expo.tsx, App.tsx (polices + défaut Raleway)
~ tous les écrans mobile (FONT.* → HEAD.*)
~ backend .env / main.ts (CORS + URL Vercel)

### [0.38.0] Phases 16-17 (détail : git d70c463 → 984218a)
~ backend/prisma/schema.prisma + migrations 20260624_phase16_venue_geo, 20260628_phase16_2_venue_search_terms, 20260628_phase16_3_venue_flaix, 20260628_phase17_scheduled_push_backoffice
+ backend/src/modules/venues/public-venues.controller.ts (GET /public/venues, Haversine, lieux privés masqués)
~ apps/mobile/src/screens/venue-discovery.screen.tsx, src/lib/hooks/use-user-location.ts, src/lib/api/mobile-api.ts
~ apps/backoffice/** (clubs, users/groups CRUD, notifications programmées, parser GPS DMS)

## Ta mission

Lis d'abord /brain (ARCHITECTURE, DOMAIN_MODEL, ENGINEERING_MANUAL, TASK_SUMMARY) + REPRISE.md, puis audite les fichiers listés. Concentre-toi sur :

1. **TypeScript & lint** : `pnpm typecheck` / `pnpm lint` à 0 sur les 4 packages. `any`/`as unknown as X`/`!` suspects.
2. **Sécurité** : routes de mutation gardées (JWT) ? Vérif d'appartenance org systématique ? Fuite de données sensibles ? DTOs (class-validator) + ParseUUIDPipe ? Le champ buvettePlanUrl (URL libre) est-il correctement borné/validé ?
3. **Cohérence schéma Prisma** : `@@map` snake_case, `onDelete` explicites, migration cohérente (buvette_plan_url).
4. **Robustesse mobile** : le fix metro.config.js (singletons React) est-il correct et sans effet de bord ? Le crash-guard n'avale-t-il pas des erreurs qu'il faudrait voir ? Les stubs de App.expo.tsx sont-ils cohérents ?
5. **Logique métier** : controllers minces, pas de process.env direct hors ENV/ConfigService, transactions là où l'atomicité est requise.
6. **Tests** : `pnpm test` (backend) passe ? Cas succès ET erreur pour les méthodes venues touchées ?

## Format de réponse attendu

## AUDIT — Phase mobile 16→18
### ✅ Points corrects
### ⚠️ Avertissements (non bloquants) — avec fichier:ligne
### ❌ Problèmes critiques — avec fichier:ligne + correction recommandée
### 🔧 Corrections suggérées (fichier / ligne / problème / correction)
### 📋 Commandes de vérification à relancer
### ✅/❌ Verdict global — [APPROUVÉ] ou [BLOQUÉ]

Commence par lire les fichiers /brain + REPRISE.md avant d'auditer le code.
```
