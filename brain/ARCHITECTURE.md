# Architecture de BreakEat — l'état réel

> **Réécrit le 11/11/2026 à partir du code** (gouvernance, étape 3). La
> version précédente (01/06/2026) décrivait l'intention de départ : elle est
> dans l'historique Git. Ici, ce qui tourne vraiment. En cas de doute, **le
> code fait foi** — et ce document se corrige.
>
> Où se trouve chaque fichier : `GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md`.
> Pourquoi chaque choix : `brain/DECISIONS/` et `brain/ENGINEERING_MANUAL.md`.
> L'état du jour : `REPRISE.md`.

---

## 1. Le principe

**Un monolithe modulaire**, pas de microservices en V1 : un seul serveur
NestJS découpé en modules, une seule base PostgreSQL, quatre applications
clientes. Plus simple à déboguer, transactions cohérentes, infrastructure
légère. Les modules restent assez séparés pour être extraits un jour si
l'échelle l'exige.

**Flaix est le cerveau** quand un lieu est basculé sur lui
(`Venue.flaixEnabled`) : il encaisse, tient les créneaux de retrait et le
comptoir. BreakEat est alors la vitrine — comptes, lieux, découverte,
notifications, Live Activity — et relaie vers Flaix
([ADR-0001](DECISIONS/ADR-0001-flaix-encaisse-breakeat-vitrine.md)). Un lieu
sans Flaix garde tout le parcours BreakEat (panier, paiement, comptoir).

```
                 ┌──────────────────────────────────────────────┐
 Client  ─────►  │ apps/mobile  (Expo 57, iOS / Android / web)  │
                 └───────────────┬──────────────────────────────┘
                                 │ HTTPS /api/v1  +  Socket.IO
 Responsable ─► apps/admin ──────┤
 Super admin ─► apps/backoffice ─┤          ┌──────────────┐
 Comptoir ───► apps/operator ────┼────────► │  backend     │──► PostgreSQL
                                 │          │  NestJS 11   │──► Redis (facultatif)
 Flaix ── webhooks signés ───────┘          └──────┬───────┘
                                                   ├──► Stripe (paiement natif, Connect)
                                                   ├──► APNs (Live Activity)
                                                   ├──► Expo Push (notifications)
                                                   └──► Sentry, courriel (Brevo, à configurer)
```

---

## 2. Le dépôt

Monorepo **pnpm** (workspaces) + **Turborepo**.

| Dossier | Quoi | Technologie | Hébergement |
|---|---|---|---|
| `backend/` | L'API, le temps réel, les tâches planifiées | NestJS 11, Prisma 6, PostgreSQL, Socket.IO 4, ioredis | **Railway** (Nixpacks), déploiement auto sur `main` (`watchPatterns: /backend/**`) |
| `apps/mobile/` | L'app client (BreakEat) | Expo SDK 57, React Native 0.86, React 19.2, Zustand, TanStack Query, Sentry | **EAS** (builds iOS/Android, mises à jour à distance) ; version web sur Vercel |
| `apps/admin/` | Le tableau de bord du **lieu** (responsable ; le super admin y entre partout) | Next.js 15, React 19, TanStack Query | Vercel (intégration Git) |
| `apps/backoffice/` | Le **super admin** : créer les lieux et les accès, superviser | Next.js 15 | Vercel |
| `apps/operator/` | L'écran du **comptoir** (lieux sans Flaix) | Next.js 15, Socket.IO | Vercel |
| `packages/brand/` | Les jetons de marque (orange, typographies) partagés | TypeScript | — |
| `.github/workflows/` | CI, sauvegarde de nuit, mise à jour à distance, aperçu mobile | GitHub Actions | — |

L'**entrée réelle** de l'app mobile est `apps/mobile/App.expo.tsx`
(`"main": "index.expo.js"`) sur **toutes** les plateformes. `App.tsx` et
`root-navigator.tsx` ne sont jamais livrés.

---

## 3. Les modules du serveur (`backend/src/modules/`)

| Domaine | Modules |
|---|---|
| Comptes et accès | `auth` (e-mail + mot de passe, Apple, Google, jetons de rafraîchissement, mot de passe oublié), `users`, `organizations`, `groups`, `backoffice` (super admin), `bootstrap` |
| Lieux et programmation | `venues`, `events`, `suppliers` (buvettes), `pickup-points`, `slots` (créneaux BreakEat), `categories`, `products`, `stock` |
| Commande | `cart`, `orders` (machine à états, produits manquants), `order-splits` (« partager l'addition »), `payments` (Stripe), `webhooks` |
| Temps réel et notifications | `realtime` (Socket.IO, file `RealtimeOutbox`, adaptateur Redis), `live-activity` (APNs + webhooks Flaix), `notifications` (Expo Push, campagnes programmées, cloche) |
| Flaix | `flaix` (rapports, décisions — le « cœur décisionnel » est un stub sans appelant, voir REPRISE) |
| Club | `loyalty` (fidélité), `stats`, `frequentation` (visites de l'app), `clients`, `documents` (contenu en base), `courriel`, `app-settings`, `feature-flags` |

---

## 4. Les flux critiques

### 4.1 Une commande BreakEat (lieu sans Flaix)
Panier → paiement Stripe (feuille native) → webhook Stripe signé → commande
créée (`PAID`), stock retenu, créneau réservé → comptoir (`apps/operator`)
la fait avancer : `ACCEPTED → PREPARING → READY → PICKED_UP → COMPLETED`.
La machine à états est dans `brain/ORDER_STATE_MACHINE.md` et
`orders/order-state-machine.service.ts`.

**Chaque transition** (`orders.service.ts`, `transition`) écrit, dans **une
seule transaction** : le statut, une ligne `orderAuditTrail`, les annonces
temps réel (`RealtimeOutbox`) et, au passage à `READY`, la promesse
d'annoncer « prête » (`ready_announce_due_at`)
([ADR-0004](DECISIONS/ADR-0004-promesse-dans-la-transaction.md)).

### 4.2 Un lieu Flaix
Le client touche le lieu → écran **Saison** (calendrier des matchs) →
« Commander » → le **serveur** choisit le lien Flaix du match selon l'heure
(`common/helpers/fenetre-commande.ts`) → page Flaix dans l'app, identité du
client glissée par étiquettes (`[#firstname]`, `[#mail]`…). **La commande
Flaix ne remonte pas encore chez BreakEat** : c'est le flux E1 du cahier des
charges, attendu du développeur Flaix
([ADR-0003](DECISIONS/ADR-0003-lien-de-commande-par-evenement.md),
`brain/FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md`).

### 4.3 Le temps réel
Socket.IO, salons par organisation / événement / buvette (isolation
vérifiée par tests). Redis sert d'adaptateur entre instances **quand
`REDIS_URL` est posée** — sinon, une seule instance. Les annonces sont
**déposées** dans la transaction, **publiées** après, et **rejouées** chaque
minute si une émission a échoué (bail `claimedUntil`). Le temps réel n'est
qu'un signal : l'état persistant fait foi, et l'écran opérateur se resynchronise
par REST. Contrats : `brain/REALTIME_CONTRACTS.md`.

### 4.4 Prévenir le client
- **Live Activity** (iPhone, écran verrouillé) : mise à jour à chaque étape,
  **en silence** ; seules « prête » et « produit manquant » allument l'écran
  avec un son. Cible native : `apps/mobile/targets/live-activity`.
- **Notification classique** (Expo Push) : « prête » quand aucune Live
  Activity n'est atteinte ; campagnes des clubs (clients ayant commandé
  dans le club — BUG-2026-011 pour les lieux Flaix).
- Rattrapage de l'annonce « prête » chaque minute (`@Cron`).

---

## 5. Les données

PostgreSQL via Prisma (`backend/prisma/schema.prisma`, migrations dans
`backend/prisma/migrations/`). **Les clés sont en `UUID`** dans la base,
même si Prisma écrit `String` : une migration écrite à la main doit dire
`UUID` (INC-2026-003). Toutes les migrations sont rejouées sur un PostgreSQL
réel par la CI avant les tests d'intégration.

Modèles centraux : `Organization` (le club) → `Venue` (le lieu) → `Event`
(le match, ou le « contenant permanent » d'un lieu ouvert en continu) →
`Supplier` (la buvette) → `Product` / `Stock` ; `Cart` → `Order` →
`OrderItem`, `Payment`, `OrderAuditTrail` ; `LiveActivity`, `PushToken`,
`ScheduledPush`, `UserNotification` ; `RealtimeOutbox` ; `Frequentation` ;
`LoyaltyAccount`. Le modèle métier est détaillé dans `brain/DOMAIN_MODEL.md`.

Les documents des clubs (contrats…) sont **stockés en base**, pas dans un
stockage objet (dette connue, voir REPRISE).

---

## 6. Sécurité, en bref

Détail et état vérifié : [`brain/SECURITE.md`](SECURITE.md). Droits vérifiés
côté serveur (rôles d'organisation ; super admin relu en base), validation
stricte des entrées, CORS par liste, limitation de débit (Redis si présent),
en-têtes de sécurité, webhooks Stripe et Flaix signés, aucun secret dans le
dépôt.

---

## 7. Exploitation

Déploiement, versions, mises à jour à distance, sauvegardes :
[`brain/DEPLOIEMENT.md`](DEPLOIEMENT.md). Le serveur se vérifie par
`GET /health`, qui rend le **commit** déployé.

**Pas d'environnement de préproduction** au 11/11/2026 (BUG-2026-014).
Les sécurités du serveur : [`brain/SECURITE.md`](SECURITE.md).

---

## 8. Les règles de conception qui tiennent

- Pas de microservices en V1 ; un module = un domaine ; pas de logique
  métier dupliquée entre modules ou entre apps.
- Ne jamais perdre une commande ; chaque transition tracée ; ce qui doit
  partir après un changement d'état est promis dans la transaction.
- Le serveur décide (heure d'ouverture, lien à ouvrir, droits) — jamais le
  téléphone.
- Flaix décide de ce qu'il pilote (créneaux, comptoir, « prête » sur ses
  commandes — [ADR-0002](DECISIONS/ADR-0002-operateur-flaix-dit-prete.md)).
- Une fonctionnalité risquée passe derrière un interrupteur (`FeatureFlag`,
  `app-settings`, `Venue.flaixEnabled`).
