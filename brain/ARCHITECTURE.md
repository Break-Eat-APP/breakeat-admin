# Architecture de BreakEat — l'état réel

> **Mis à jour le 26/11/2026** (lieux Flaix : commandes remontées, suivi en
> base, Live Activity, flux des matchs, ouverture par match, notes ;
> notifications : catégorie Android, reprise). Le 17/11 : rattachement et
> ouverture automatiques, invitations, « Au plus vite ». **Réécrit le 11/11/2026 à partir du code** (gouvernance, étape 3). La
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
| Comptes et accès | `auth` (e-mail + mot de passe, Apple, Google, jetons de rafraîchissement, mot de passe oublié), `users`, `organizations` (membres, **invitations à accepter** depuis le 16/11 — [ADR-0010](DECISIONS/ADR-0010-invitation-a-accepter.md)), `groups`, `backoffice` (super admin), `bootstrap` |
| Lieux et programmation | `venues`, `events` (dont l'**ouverture et la fermeture automatiques**, `ouverture-automatique.service.ts`), `suppliers` (les buvettes, appelées **« points de retrait »** dans la console depuis le 16/11), `pickup-points` (les **comptoirs de retrait**), `slots` (créneaux BreakEat), `categories`, `products`, `stock`. Le rattachement automatique buvette ↔ événement vit dans `common/helpers/rattachement-buvettes.ts` ([ADR-0009](DECISIONS/ADR-0009-points-de-retrait-rattaches-et-ouverture-automatique.md)) |
| Commande | `cart`, `orders` (machine à états, produits manquants), `order-splits` (« partager l'addition »), `payments` (Stripe), `webhooks` |
| Temps réel et notifications | `realtime` (Socket.IO, file `RealtimeOutbox`, adaptateur Redis), `live-activity` (APNs + webhooks Flaix), `notifications` (Expo Push, campagnes programmées, cloche) |
| Flaix | `flaix` : **commandes du client** lues chez Flaix (`commandes-client-flaix.service.ts`) ; **suivi en base**, « prête », Live Activity et « Note ta commande » (`surveillance-commandes-flaix.service.ts`) ; **import du flux des matchs** (`import-matchs-flaix.service.ts`, `flux-matchs-flaix.ts`, réglage par lieu dans `flux-matchs-flaix.controller.ts`) ; rapports. Le « cœur décisionnel » (rush, décisions) reste un stub sans appelant, voir REPRISE |
| Favoris | `favorites` : copie serveur des lieux suivis, pour le ciblage des campagnes ([ADR-0013](DECISIONS/ADR-0013-campagnes-vers-ceux-qui-suivent-le-lieu.md)) |
| Club | `loyalty` (fidélité), `stats`, `frequentation` (visites de l'app), `clients`, `documents` (contenu en base), `courriel`, `app-settings`, `feature-flags` |

---

## 4. Les flux critiques

### 4.1 Une commande BreakEat (lieu sans Flaix)
Panier → paiement Stripe (feuille native) → webhook Stripe signé → commande
créée (`PAID`), stock retenu, créneau réservé → comptoir (`apps/operator`)
la fait avancer : `ACCEPTED → PREPARING → READY → PICKED_UP → COMPLETED`.
La machine à états est dans `brain/ORDER_STATE_MACHINE.md` et
`orders/order-state-machine.service.ts`.

**Le moment du retrait** : un créneau du club, ou **« Au plus vite »**
(aucun créneau, la commande est préparée dès que possible —
[ADR-0011](DECISIONS/ADR-0011-au-plus-vite.md)). Le choix est envoyé au
serveur à chaque paiement (`PATCH /carts/:id/creneau`, `null` compris) ; le
serveur refuse un créneau fermé, passé, d'un autre événement ou d'une autre
buvette (`common/helpers/retrait-compatible.ts`). Le **comptoir de retrait**
est obligatoire : chaque point de retrait rattaché à un événement en reçoit
un par défaut, à son nom.

**Le panier figé est celui qui a été chiffré** (17/11) : toute modification
s'écrit sous verrou (`status = OPEN`), et au moment de figer, le panier est
relu et comparé au contenu sur lequel le montant a été calculé. Un paiement
**abandonné** rend ce qu'il retenait après 30 min (tâche planifiée, § 4.5).

**Avant la commande, l'ouverture** (lieux sans Flaix, ADR-0009) : un
événement en brouillon passe **Actif** à l'heure où la commande ouvre
(`Venue.ordersOpenAt`), ses points de retrait fermés s'ouvrent ; à l'heure de
fin, il passe **Terminé** et ses points de retrait se ferment, sauf s'ils
servent encore ailleurs. « Terminé » n'empêche que les **nouvelles**
commandes : celles déjà payées restent au comptoir.

**Chaque transition** (`orders.service.ts`, `transition`) écrit, dans **une
seule transaction** : le statut, une ligne `orderAuditTrail`, les annonces
temps réel (`RealtimeOutbox`) et, au passage à `READY`, la promesse
d'annoncer « prête » (`ready_announce_due_at`)
([ADR-0004](DECISIONS/ADR-0004-promesse-dans-la-transaction.md)).

### 4.2 Un lieu Flaix
Le client touche le lieu → écran **Saison** (calendrier des matchs) →
« Commander » → le **serveur** choisit le lien Flaix du match selon l'heure
(`common/helpers/fenetre-commande.ts`) → page Flaix dans l'app, identité du
client glissée par étiquettes (`[#firstname]`, `[#mail]`…)
([ADR-0003](DECISIONS/ADR-0003-lien-de-commande-par-evenement.md)).

**Depuis le 21-26/11, la commande Flaix remonte chez BreakEat. Pas de webhook :
on interroge** ([ADR-0015](DECISIONS/ADR-0015-commandes-flaix-lues-par-email.md)).

1. « Mes commandes » lit chez Flaix les commandes de l'e-mail du compte
   (`GET /flaix/mes-commandes`).
2. Après le paiement, la page Flaix de l'app repère la nouvelle commande par
   différence de liste. Elle demande au serveur de la suivre
   (`POST /flaix/commandes/:jeton/suivi`) et démarre la Live Activity.
3. Le serveur suit la commande **en base** (`SuiviCommandeFlaix`) :
   - il lit son état toutes les 15 s, puis toutes les 60 s après « prête » ;
   - il pousse chaque étape à la Live Activity (APNs) ;
   - il envoie « Ta commande est prête » (Expo, avec son) ;
   - 10 min après la remise, il envoie « Note ta commande ».
4. L'app lit l'état en direct dans **notre** base (`GET /flaix/mes-suivis`),
   jamais chez Flaix en boucle.

**Les matchs viennent de Flaix** ([ADR-0018](DECISIONS/ADR-0018-import-du-flux-des-matchs-flaix.md)) :
- import toutes les 10 min, lieu par lieu (`Venue.flaixFluxActif`, réglé dans
  l'admin) ;
- nom, horaires, lien et **heure d'ouverture de la commande**
  (`Event.ordersOpenAt`) viennent du flux ;
- ces champs sont verrouillés côté serveur.

Le détail, bloc par bloc : `brain/ENGINEERING_MANUAL.md`, « Les blocs livrés
du 21 au 26/11/2026 ».

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
- **Notification classique** (Expo Push) :
  - « prête » quand aucune Live Activity n'est atteinte ;
  - campagnes des clubs, vers « a commandé OU suit le lieu » (ADR-0013).
- **Commande Flaix** : « prête » et « Note ta commande » par Expo. La Live
  Activity avance en silence (`surveillance-commandes-flaix.service.ts`).
- **Android** : les notifications de commande passent par la catégorie
  « Commandes » (importance haute, son, bannière), créée par l'app. Le serveur
  ne la vise que pour les téléphones qui l'ont déclarée
  (`PushToken.canalCommandes`).
- Rattrapage de l'annonce « prête » chaque minute (`@Cron`). **Un envoi Expo
  ne lève jamais** : un bilan `sent: 0` laisse l'annonce due, et elle est
  reprise (BUG-2026-057).

### 4.5 Les tâches planifiées (`@Cron`, dans le serveur)

Chacune est **rattrapable** (une minute ratée se refait à la suivante) et
**sûre à plusieurs instances** (bascules conditionnelles ou bail).

| Tâche | Fréquence | Fichier |
|---|---|---|
| Ouverture / fermeture automatiques des événements et de leurs points de retrait | chaque minute | `events/ouverture-automatique.service.ts` |
| Rattrapage de l'annonce « prête » (Live Activity, notification) | chaque minute | `live-activity/live-activity.service.ts` |
| Campagnes programmées des clubs | chaque minute | `notifications/scheduled-push.service.ts` |
| Rejeu des annonces temps réel non parties (`RealtimeOutbox`) | chaque minute | `realtime/outbox.service.ts` |
| Purge des annonces temps réel anciennes | chaque jour à 4 h | `realtime/outbox.service.ts` |
| Retrait des accès perdus : sort des salons temps réel les sockets d'un équipier écarté | chaque minute | `realtime/realtime.gateway.ts` |
| « Partager l'addition » : envois interrompus remboursés, l'addition rouverte | toutes les 5 min | `order-splits/order-splits.service.ts` |
| **Paiements abandonnés** : paniers en attente de paiement depuis 30 min — Stripe vérifié puis annulé, points / place / stock rendus (17/11) | toutes les 5 min | `cart/paiements-abandonnes.service.ts` |
| Fidélité : points réservés par un panier expiré, rendus | toutes les 5 min | `loyalty/loyalty.service.ts` |
| **Suivi des commandes Flaix** : état, Live Activity (avec rattrapage), « prête », « Note ta commande ». Chaque suivi est réservé avant traitement | toutes les 15 s (`@Interval`) | `flaix/surveillance-commandes-flaix.service.ts` |
| **Import du flux des matchs Flaix** (lieux activés, ETag) | toutes les 10 min (`@Interval`) | `flaix/import-matchs-flaix.service.ts` |

Hors serveur, dans GitHub Actions : sauvegarde de nuit, essai de restauration
mensuel, audit des dépendances, mise à jour à distance (lancée à la main).

---

## 5. Les données

PostgreSQL via Prisma (`backend/prisma/schema.prisma`, migrations dans
`backend/prisma/migrations/`). **Les clés sont en `UUID`** dans la base,
même si Prisma écrit `String` : une migration écrite à la main doit dire
`UUID` (INC-2026-003). Toutes les migrations sont rejouées sur un PostgreSQL
réel par la CI avant les tests d'intégration.

Modèles centraux : `Organization` (le club) → `Venue` (le lieu) → `Event`
(le match, ou le « contenant permanent » d'un lieu ouvert en continu) →
`Supplier` (la buvette, « point de retrait » dans la console ; reliée aux
événements par `EventSupplier`) → `Product` / `Stock` ; `PickupPoint` (le
comptoir de retrait) et `Slot` (le créneau) ; `Cart` → `Order` →
`OrderItem`, `Payment`, `OrderAuditTrail` ; `OrganizationMember` et
`OrganizationInvitation` (16/11) ; `LiveActivity`, `PushToken`,
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
  `app-settings`, `Venue.flaixEnabled`). ⚠️ **Au 17/11/2026, seul
  `app.split.enabled` (partager l'addition) est réellement branché** ;
  `Event.activeFeatureFlags` est stocké sans être lu, et une clé en base ne
  coupe aucun module par elle-même (audit Codex). Ne pas compter sur l'écran
  des interrupteurs comme coupe-circuit de production.
