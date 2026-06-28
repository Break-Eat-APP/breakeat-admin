# 🔖 POINT DE REPRISE — Break Eat

> Ouvre ce fichier en premier dans une nouvelle session. Tout l'état utile est ici + dans les 4 docs (`CHANGELOG.md`, `DEVELOPMENT_LOG.md`, `brain/ENGINEERING_MANUAL.md`, `brain/TASK_SUMMARY.md`) + le git.

_Dernière mise à jour : 2026-06-23_

## 🚨 NOUVELLE DIRECTION (2026-06-23) — pivot app mobile
L'app Break Eat devient la **porte d'entrée du click-and-collect Flaix** (Flaix gère la config + le parcours commande). Rôle de l'app Break Eat :
1. Téléchargement + inscription (peut-être différée au paiement).
2. **Découverte des lieux** : recherche + géolocalisation.
3. Choix du lieu → **Flaix prend le dessus**.
4. **Profil classique** (compte, historique).

Dashboards manager / back office **en pause** (on y reviendra). Priorité = app mobile.

### Décisions d'archi (confirmées 2026-06-23)
- **Flaix = intégration API**. Le client reste dans l'app Break Eat (ne voit rien) ; Flaix « prend le dessus » au moment de **choisir son emplacement** (appels API en arrière-plan, l'UI reste Break Eat).
- **Lieux = backend Break Eat** (table `venues` existante). Flaix ne sert qu'à la commande/emplacement.
- **Auth = optionnelle**. Navigation libre des lieux ; profil/historique seulement si connecté ; connexion jamais bloquante avant Flaix.

### Plan de build app mobile
1. **Découverte des lieux** : écran liste + recherche (nom/ville) + tri par géolocalisation. ⚠️ Backend : ajouter `latitude`/`longitude` à `venues` + endpoint public de recherche (`GET /public/venues?q=&lat=&lng=`).
2. **Auth optionnelle** : navigation libre ; écran login/signup atteignable mais non bloquant (auth.store existe déjà).
3. **Profil classique** : compte + historique de commandes (si connecté).
4. **Handoff Flaix** : à la sélection d'un lieu/emplacement → appel API Flaix. ⚠️ **Bloqué** sur le contrat d'API Flaix (FLAIX_CONTRACT.md non écrit, Phase 11.5). En attendant : écran placeholder « emplacement / Flaix » câblé mais stubbé.

Dépendance externe : **spec/clé API Flaix** nécessaire pour le point 4.

## Où on en est (dashboards — état figé)
- **Branche git** : `feat/dashboard-config-blocs-abc` (poussée sur `origin`). PR à créer :
  https://github.com/Break-Eat-APP/breakeat-admin/pull/new/feat/dashboard-config-blocs-abc
- **9 commits** propres par domaine (deps, design, operator, backend, admin, mobile, docs, cors).
- Working tree **clean** au moment de l'écriture.

## ✅ Livré
- **Refonte v3** « chaleureux premium » (Inter + Jost, Lucide, tokens `packages/brand`).
- **Comptabilité** (`/accounting`) : CA TTC/HT, TVA 10 %, détail par événement.
- **Buvettes** (`/suppliers` + détail) : images produits, zone de prépa retirée de l'UI.
- **Exploitant externe / parrainage** : `Supplier.isExternal` + `referralCode` (`BE-XXXXXX`).
- **Apparence de l'app** (`/appearance`) : cartes (texte/icône/image), **pages multiples**, liens externes (Instagram/YouTube), action `page`, toggle Flaix, aperçu live. Rendu mobile + navigation multi-pages.
- **Points de retrait** : 1–4 par buvette (cap backend + suppression).
- **Créneaux** : générateur en lot + ajout unitaire (illimité).
- **Opérateur** : résumé des produits à préparer par colonne.
- **Notifications C1** (`/notifications`) : modèle push par étape de commande, hook dans `OrdersService.transition`.
- **Campagnes & push C2/C3** (`/campaigns`) : push programmés (cron `@nestjs/schedule`) + campagne `DISCOUNT_CAMPAIGN` (annonce auto).
- **Fondation push Expo** : `backend/src/modules/notifications/` (`ExpoPushService`, `PushTokensService`, registre tokens, `ScheduledPush`).
- **Fix CORS** : `.env` + `main.ts` autorisent 3001/3002/3003 (réglait le « Failed to fetch » du back office).

## ⏳ Reste à faire
1. **Remise C3 au checkout** : appliquer le `discountPercent` au panier. ⚠️ Sensible — le prix est figé au checkout (`cartItem.priceSnapshotCents` == montant Stripe) ; la remise doit se brancher dans `cart.service` (création du PaymentIntent), pas à la création de commande.
2. **Setup natif Expo mobile** (côté user) : app = bare RN. Installer modules Expo + `expo-notifications` + FCM/APNs + rebuild, puis créer `apps/mobile/src/lib/push.ts` (`registerForPush`) et l'appeler post-login. Les méthodes API (`apiRegisterPushToken`) existent déjà.
3. **Audit Codex** de la branche.

## ⚠️ Dette technique connue (à signaler à Codex)
- ~~Migrations en SQL direct manquantes pour `push_tokens`, `scheduled_pushes`, `suppliers.referral_code/is_external`.~~ **Résolu (2026-06-24)** : migration versionnée `backend/prisma/migrations/20260607_phase15_notifications_referral` créée + `migration_lock.toml` ajouté (était absent → bloquait `migrate deploy`). Une base neuve (Railway) crée désormais ces objets via `prisma migrate deploy`.
  - ⏳ **Étape restante (DB dev allumée)** : marquer la migration comme déjà appliquée pour ne pas la rejouer sur dev (objets créés jadis en SQL direct) :
    `corepack pnpm --filter @break-eat/backend exec prisma migrate resolve --applied 20260607_phase15_notifications_referral`
  - Le drift PK historique demeure (`gen_random_uuid()` en DB vs `@default(uuid())` au schéma) mais est bénin : `migrate deploy` ne vérifie pas le drift (seul `migrate dev` le ferait).
- **Pipeline racine** : scripts repassés à **`pnpm -r --if-present run`** (au lieu de `turbo run`) — `corepack pnpm typecheck/lint/test` passent sans pré-requis (plus de « Unable to find package manager binary »). Résolu audit round 3 (2026-06-25).
- Après tout changement de schéma : **arrêter le backend** (DLL Windows verrouillé) → `prisma generate` → relancer.

## 🚀 Lancer l'environnement (Windows)
`pnpm` n'est pas dans le PATH → utiliser **corepack** (Node est OK) :
```
corepack pnpm --filter @break-eat/backend start:dev    # port 3000
corepack pnpm --filter @break-eat/admin dev            # port 3001
corepack pnpm --filter @break-eat/backoffice dev       # port 3003
corepack pnpm --filter @break-eat/operator dev         # port 3002
```
Docker (Postgres/Redis) doit tourner. DB = `breakeat_dev`.

## 🔑 Connexion (dev)
- URL : http://localhost:3001 (manager) · http://localhost:3003 (back office)
- `admin@breakeat.test` / `BreakEat2026!` (SUPER_ADMIN)
