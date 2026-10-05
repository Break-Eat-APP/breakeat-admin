# Audit technique Break Eat — audit par phase

> ## ⚠️ DOCUMENT HISTORIQUE — lire d'abord ceci
>
> **Ce rapport décrit le dépôt du 30 septembre 2026, AVANT corrections.** Tout
> ce qu'il signale comme défaut a depuis été traité : les **5 P1** en phase 53,
> les **9 P2** en phase 54, et les **3 défauts du second passage** en phase 55
> (dont deux ouverts par les corrections elles-mêmes).
>
> Il est conservé parce qu'il dit d'où l'on part et pourquoi chaque correction a
> été faite — pas pour décrire l'état actuel. **Ne pas s'en servir comme liste
> de travail** : on retraiterait d'anciens défauts comme s'ils étaient toujours
> là, ce que le dossier de clôture du 04/10 demande explicitement d'éviter.
>
> | Pour savoir… | Lire |
> |---|---|
> | ce qui a été corrigé, et comment | `brain/ENGINEERING_MANUAL.md`, phases 53 à 55 |
> | l'état courant et ce qui reste ouvert | `REPRISE.md` → « SUJETS OUVERTS » |
> | ce qui reste à valider avant exploitation | `brain/audits/DOSSIER_AUDIT_CLOUD_CODE_2026-10-04.docx` |
>
> Seule la section « Qualité et vérification » est périmée sur les chiffres :
> au 01/10/2026 la suite compte **684 tests unitaires** et **12 suites
> d'intégration / 117 tests** sur PostgreSQL réel, lancées par la CI.

Date de l’audit : 30 septembre 2026  
Périmètre : code présent dans le dépôt, phases 1 à 14 documentées dans `phases de DEV`, phases 15 à 23 décrites dans `DEVELOPMENT_LOG.md` / `CHANGELOG.md`, puis modules ajoutés ensuite.

## Verdict général

La base est sérieuse : monorepo cohérent, TypeScript strict, séparation des responsabilités, contrôles d’organisation déjà présents, snapshots de commande, idempotence Stripe, machine d’état des commandes et émission temps réel après commit.

Elle n’est toutefois pas encore suffisamment sûre pour une mise en production sans corrections. Les risques les plus importants touchent les frontières entre locataires, la cohérence stock/paiement et les lieux permanents.

Priorités identifiées :

- **P1 — à corriger avant production : 5 sujets**
- **P2 — à corriger avant exploitation réelle : 9 sujets**
- **P3 — qualité, robustesse ou documentation : plusieurs sujets**

## Audit phase par phase

| Phase | État | Conclusion |
|---|---|---|
| 1 — Foundation | Partiellement conforme | Architecture et compilation correctes. La CI ne lance pas les tests d’intégration et les apps web n’ont pratiquement aucun test automatisé. |
| 2 — Auth / organisations | Correct avec réserve | JWT, argon2, rotation et hash des refresh tokens sont bien conçus. L’invitation peut laisser un compte orphelin en cas d’échec ultérieur. |
| 3 — Events / venues / suppliers | Correct avec réserve | Les contrôles d’organisation sont globalement présents. Le changement de mode d’un lieu ne désactive pas réellement son ancien conteneur permanent. |
| 4 — Products / categories / stock | Correct avec réserve | Les produits et stocks sont bien rattachés à l’organisation. Un opérateur peut modifier la disponibilité du stock d’une autre buvette du même club. |
| 5 — Cart / checkout / Stripe / orders | Risqué | Les snapshots, montants et idempotences sont bons. Les flux fidélité et ardoise peuvent encaisser sans aboutir à une commande ; une course existe aussi dans le journal webhook Stripe. |
| 6 — State machine / realtime / outbox | Plutôt correct | Transitions, audit et émission après transaction sont bien structurés. Le contrôle des salons fournisseur est présent dans le code actuel. |
| 7 — Slots / Flaix | Insuffisant | Lecture de créneaux sans contrôle de tenant, incohérence de date locale/UTC, et contrôle fournisseur manquant pour l’ouverture/fermeture par opérateur. Flaix cœur reste un stub. |
| 8 — Dashboards / écrans publics | Correct avec réserve | Les réponses du dashboard limitent les champs PII. Le chemin `/active` donne toutefois accès à tout membre de l’organisation, pas seulement aux rôles opérationnels. |
| 9 — CMS / feature flags / CORS | Correct | Les accès scoped sont présents et les flags sont résolus par priorité événement > organisation > global. Validation des UUID de scope encore perfectible. |
| 10 — QA / déploiement | Insuffisant | Les tests unitaires passent localement, mais le pipeline CI ne lance pas `test:integration`; la couverture front web est absente. |
| 11 — Admin panel | Partiellement conforme | Le panneau admin a un refresh token. Le back-office séparé ne l’utilise pas et perd la session après expiration de l’access token. |
| 12 — Admin V1 | Correct avec réserve | CRUD et filtrage opérateur globalement en place. L’invitation n’est pas transactionnelle. |
| 13 — Mobile V1 | Partiellement vérifié | Le build TypeScript/mobile passe. Il n’existe qu’un seul fichier de test mobile et la partie iOS native n’a pas été compilée dans cet environnement Windows. |
| 14 — Groups / private events / backoffice | Correct avec réserve | Le verrouillage des événements privés est centralisé et cohérent. Le conteneur permanent dormant reste néanmoins accessible par des chemins directs. |
| 15–19 — Stats / polish / rebrand / buvettes / appearance | Partiellement conforme | Fonctionnalités présentes. Le back-office et les stats d’organisation n’appliquent pas exactement la même règle au chiffre d’affaires annulé. La documentation design est obsolète par rapport à la marque actuelle. |
| 20 — Loyalty | Risqué | Les opérations de solde sont atomiques, mais le débit est réalisé après paiement Stripe et peut faire échouer la création de commande. |
| 21 — Live Activity | Partiellement vérifié | Signature HMAC, anti-rejeu et idempotence sont présents. Les identifiants `slotId` et `pickupPointId` reçus de Flaix ne sont pas validés contre l’événement de la commande. |
| 22–23 — Venues permanents / recurring slots | Risqué | Le conteneur est créé correctement, mais jamais rendu inactif au retour en mode événementiel. Les slots récurrents sont matérialisés pour tout événement du lieu et la date de lecture reste UTC. |
| 24 — Pickup guidance | Correct | Les informations de retrait sont enrichies par lots et sans exposer email/téléphone sur le board. |
| 25 — Ardoise / paiement partagé | Risqué | Capture avant création de commande, absence de décrément de stock et absence de verrouillage atomique de l’envoi. |

## Défauts prioritaires

### P1 — accès à des données d’un autre événement/tenant

Les routes `GET /events/:eventId/slots` et `GET /events/:eventId/slots/:id` sont authentifiées mais ne vérifient ni l’appartenance à l’organisation ni la cohérence entre `eventId` et le slot demandé. `findOne` recherche seulement par identifiant global.

Un utilisateur authentifié qui connaît ou devine un UUID peut donc lire un créneau d’une autre organisation. De plus, `/events/A/slots/B` peut retourner le slot B appartenant à l’événement X.

Fichiers : [slots.controller.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/slots/slots.controller.ts:28), [slots.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/slots/slots.service.ts:113).

Correction attendue : faire passer `eventId` et l’utilisateur au service, filtrer par `{ id, eventId }`, puis appliquer le contrôle d’organisation ; ajouter des tests cross-tenant et path mismatch.

### P1 — conteneur permanent dormant mais encore commandable

Lorsqu’un lieu passe de `PERMANENT` à `EVENT_BASED`, le code conserve le conteneur pour préserver l’historique, mais ne change pas son statut et ne bloque pas son usage. `ensurePermanentContainer` ne fait rien dans ce cas ; `GroupsService.canAccessEvent` et `CartService.create` ne vérifient pas `isPermanentContainer` contre le mode actuel du lieu.

Un ancien lien profond vers le conteneur peut donc encore permettre de créer un panier et une commande alors que le lieu est redevenu événementiel.

Fichiers : [venues.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/venues/venues.service.ts:78), [cart.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/cart/cart.service.ts:140), [groups.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/groups/groups.service.ts:249).

Correction attendue : bloquer les accès/commandes si `event.isPermanentContainer === true` et que `venue.operatingMode !== PERMANENT`, ou modéliser explicitement l’état dormant et le tester dans tous les chemins publics et paiement.

### P1 — ardoise : argent capturé sans compensation garantie

`envoyer` capture les PaymentIntents, marque les parts comme capturées, puis appelle `createFromSplit`. Si la création de commande échoue (base, invariant, slot, données invalides), l’argent est déjà encaissé et l’ardoise reste ouverte puisque son passage à `SENT` arrive après la création.

Deux appels concurrents peuvent aussi lire simultanément `OPEN` et capturer les mêmes parts ; `orderId` n’est pas unique dans le schéma et le passage à `SENT` n’est pas une revendication atomique.

Fichiers : [order-splits.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/order-splits/order-splits.service.ts:420), [schema.prisma](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/prisma/schema.prisma:1289).

Correction attendue : verrouiller/claimer l’ardoise par transition atomique, rendre la création idempotente par contrainte unique, et prévoir une compensation Stripe durable si la commande ne peut pas être créée.

### P1 — ardoise : le stock n’est jamais décrémenté

Le chemin normal de création de commande décrémente le stock, mais `OrdersService.createFromSplit` crée uniquement la commande, les lignes, les paiements et l’audit. Aucun décrément atomique n’est effectué pour les unités de l’ardoise.

Une commande partagée peut donc vendre des produits sans réduire leur stock et dépasser largement la quantité disponible.

Fichier : [orders.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/orders/orders.service.ts:482).

Correction attendue : mutualiser la réservation/décrémentation stock avec le chemin Stripe classique, avant ou pendant la création, avec une stratégie de remboursement/compensation si nécessaire.

### P1 — fidélité : paiement confirmé mais commande refusée

`createFromPaymentIntent` recalcule la remise puis appelle `redeemForOrderTx` dans la transaction de création. Si les points ont été consommés par une autre commande entre le checkout et le webhook, la transaction est annulée alors que Stripe a déjà confirmé le paiement. Le webhook sera rejoué, mais le solde ne redeviendra pas disponible automatiquement.

Fichiers : [orders.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/orders/orders.service.ts:150), [loyalty.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/loyalty/loyalty.service.ts:245).

Correction attendue : réserver les points avant paiement, ou traiter l’échec comme une compensation financière explicite (remboursement/avoir) plutôt que laisser un paiement capturé sans commande.

## P2 — risques importants

1. **Stock opérateur non limité à sa buvette.** `updateAvailability` vérifie seulement le rôle dans l’organisation, pas `membership.supplierId`. Un opérateur rattaché à A peut activer/désactiver le stock de B. [stock.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/stock/stock.service.ts:155)

2. **Statut de créneau opérateur non limité à sa buvette.** Même problème dans `updateStatus`, qui accepte tout opérateur membre de l’organisation. [slots.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/slots/slots.service.ts:157)

3. **Date des créneaux incohérente.** La matérialisation utilise le jour local du lieu, mais les lectures utilisent le jour UTC. Autour de minuit, les créneaux du bon jour peuvent disparaître ou ceux du mauvais jour apparaître. [slot-templates.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/slots/slot-templates.service.ts:185), [public-events.controller.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/events/public-events.controller.ts:221)

4. **Slots récurrents injectés dans tout événement du lieu.** `ensureTodaySlots` est appelé sans vérifier que l’événement est le conteneur permanent ; les templates du lieu peuvent donc être matérialisés pour un événement ponctuel. [public-events.controller.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/events/public-events.controller.ts:207)

5. **KPI back-office non alignés avec les stats d’organisation.** Le back-office agrège tous les ordres `SUCCEEDED`, y compris les commandes `CANCELLED`, alors que `StatsService` exclut les commandes annulées. Les deux tableaux peuvent afficher des CA différents pour le même périmètre. [backoffice.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/backoffice/backoffice.service.ts:76), [stats.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/stats/stats.service.ts:140)

6. **Back-office sans renouvellement de session.** L’API renvoie un refresh token mais le login ne le stocke pas ; le client ne tente aucun `/auth/refresh`. Avec un access token de 15 minutes, l’utilisateur est redirigé vers le login. [auth.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/auth/auth.service.ts:24), [backoffice-client.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/apps/backoffice/src/lib/api/backoffice-client.ts:54), [login/page.tsx](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/apps/backoffice/src/app/login/page.tsx:38)

7. **Invitation non transactionnelle.** Un utilisateur créé avec mot de passe provisoire reste en base si la vérification d’un membre existant ou du fournisseur échoue ensuite. [organizations.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/organizations/organizations.service.ts:501)

8. **Course dans l’idempotence Stripe.** Deux livraisons simultanées du même `stripeEventId` peuvent toutes deux observer l’absence de ligne puis tenter `webhookEvent.create`; une des deux reçoit une violation d’unicité et fait échouer le webhook. Les retries Stripe finissent généralement par réparer, mais cela produit des erreurs et rend le traitement moins déterministe. [stripe-webhooks.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/webhooks/stripe-webhooks.service.ts:32)

9. **Webhook Flaix insuffisamment borné.** La signature est correctement vérifiée, mais un `slotId` ou `pickupPointId` signé est appliqué sans vérifier qu’il appartient au même événement/lieu/buvette que la commande. [flaix-webhook.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/live-activity/flaix-webhook.service.ts:178), [live-activity.service.ts](C:/Users/notta/OneDrive/Bureau/Break%20Eat%20APP/backend/src/modules/live-activity/live-activity.service.ts:401)

## Qualité et vérification

- `pnpm typecheck` passe.
- Le lint passe avec des avertissements non bloquants.
- Les tests unitaires backend passent : 52 suites / 621 tests selon l’exécution locale précédente.
- Les tests d’intégration existent mais ne sont pas appelés par `.github/workflows/ci.yml`, qui lance seulement `pnpm turbo test`.
- Les apps admin, operator et backoffice n’ont pas de tests Jest/Playwright détectés ; le mobile ne contient qu’un test automatisé visible.
- Les builds operator, backoffice et mobile passent. Le build admin local a rencontré une erreur `UNKNOWN stat` dans `node_modules` sous OneDrive ; ce résultat est à revalider dans CI Linux avant de conclure à un bug applicatif.
- `prisma validate` passe. L’état local de migration n’est pas à considérer comme preuve d’un défaut de production sans comparaison avec la base cible.

## Points contrôlés et jugés corrects

- Les mots de passe sont hashés avec argon2 et les refresh tokens sont stockés hashés, avec rotation et suppression atomique.
- Les accès organisationnels sont majoritairement centralisés dans `requireOrgAccess`.
- Les commandes normales utilisent des snapshots de prix/TVA et une transaction de création.
- Les transitions de commande sont validées avant écriture, auditées et émises en temps réel après commit.
- Les salons Socket.IO `supplier:*` vérifient l’organisation et la buvette épinglée du membre dans le code actuel.
- Les événements privés utilisent un contrôle d’accès commun et renvoient 404 aux non-membres.
- Les réponses du dashboard évitent l’email et le téléphone du client.
- Les webhooks Flaix disposent d’HMAC, de fenêtre anti-rejeu, d’idempotence et de journalisation.

## Ordre de correction recommandé

1. Fermer les accès slots cross-tenant et le conteneur permanent dormant.
2. Sécuriser l’ardoise : verrouillage, idempotence, stock, compensation Stripe.
3. Repenser la réservation des points avant paiement.
4. Corriger les scopes fournisseur stock/créneaux et unifier le calcul des KPI.
5. Corriger le refresh du back-office et rendre l’invitation transactionnelle.
6. Ajouter des tests d’intégration CI pour chaque frontière d’organisation, chaque transition de mode du lieu, les courses webhook et les échecs après paiement.

Ce document est un audit : aucun fichier de code applicatif n’a été modifié.
