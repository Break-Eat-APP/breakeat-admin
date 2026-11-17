# Compte rendu — Corrections des audits Codex du 17/11/2026

- **Date :** 17/11/2026
- **Agent / développeur :** Claude Code (Opus), à la demande de Rémi
- **Commit(s) :** voir CHANGELOG 1.7.41
- **Bug / décision liés :** BUG-2026-030 à 037 ; ADR-0009, 0010, 0012 ;
  `brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`
- **Statut :** TERMINÉ (en attente de la CI et du déploiement)

## Objectif
Corriger les défauts confirmés par les deux audits Codex avant la sortie de
la 1.1.3 sur les stores. Ils touchent le paiement, la base et Flaix : tâche
importante.

## Ce qui a été fait

### 1. Paiements abandonnés (BUG-2026-030)
`backend/src/modules/cart/paiements-abandonnes.service.ts`, toutes les 5 min,
50 paniers au plus par passage, les plus anciens d'abord :
- panier `CHECKOUT_PENDING` depuis **30 min** (`updatedAt`, écrit au gel) ;
- `PaymentIntent` lu chez Stripe : `succeeded`, `processing`,
  `requires_capture` → **on ne touche à rien** (le webhook créera la
  commande) ; sinon **annulé** chez Stripe (s'il ne l'est déjà) — une
  annulation refusée (le client vient de payer) fait sauter le panier ;
- page hébergée (web) sans `PaymentIntent` connu : attendue jusqu'à son
  expiration chez Stripe (24 h, + 1 h de marge) ;
- bascule conditionnelle `CHECKOUT_PENDING → ABANDONED` : une seule instance
  rend, une seule fois ; puis points, place du créneau et stock rendus.

### 2. Panier figé = panier chiffré (BUG-2026-031)
- `modifierSiOuvert` : toute modification (lignes, comptoir, points) s'écrit
  dans une transaction ouverte par un verrou conditionnel `status = OPEN`.
- `figerEtEngager` : relit le panier sous verrou et le compare au contenu sur
  lequel le montant a été calculé (lignes, quantités, points, créneau,
  comptoir). Différent : rien n'est figé, l'intention reste attachée au
  panier (la tentative suivante l'ajuste au nouveau montant au lieu de
  heurter la clé d'idempotence), points / stock / place rendus sous
  condition, 409 « Ton panier a changé pendant le paiement… rien n'a été
  débité ».

### 3. Webhook Flaix rejouable (BUG-2026-032)
Sur un doublon d'`eventId` : traité → 200 « doublon » ; en échec → repris par
une seule livraison (`updateMany` qui efface l'erreur) ; en cours ailleurs →
409, pour que Flaix réessaie.

### 4. Ouverture / fermeture atomiques (BUG-2026-033)
Une transaction par événement (statut + points de retrait) ; erreur isolée
par événement.

### 5. Route `/orders/event/:id/active` (BUG-2026-034)
L'épinglage à une buvette s'applique, comme au tableau.

### 6. Création d'événement atomique (BUG-2026-035)
Événement, rattachements et comptoirs par défaut dans une transaction ; les
fonctions de `rattachement-buvettes.ts` acceptent un client transactionnel.

### 7. Acceptation d'invitation (BUG-2026-036)
Invitation consommée dans la transaction, à condition de n'avoir ni changé
ni expiré (sinon 409, rien n'est créé).

## Fichiers
- Créés : `cart/paiements-abandonnes.service.ts` (+ spec),
  `brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`, ce compte rendu ; les
  deux rapports de Codex rangés dans `brain/audits/`.
- Modifiés : `cart/cart.service.ts`, `cart/cart.module.ts`,
  `events/ouverture-automatique.service.ts`, `events/events.service.ts`,
  `common/helpers/rattachement-buvettes.ts`,
  `live-activity/flaix-webhook.service.ts`, `orders/orders.controller.ts`,
  `orders/orders.service.ts`, `organizations/organizations.service.ts`, et
  leurs specs.

## Base de données
Aucune migration. Nouvel usage du statut `ABANDONED` (existant dans le
schéma, jamais posé jusqu'ici).

## Tests
| Quoi | Résultat |
|---|---|
| `ouverture-automatique.service.spec.ts` | 11/11 (3 nouveaux) |
| `flaix-webhook.service.spec.ts` | 24/24 (2 nouveaux) |
| `orders.controller.spec.ts` + `orders.service.spec.ts` | 74/74 (4 nouveaux) |
| `events.service.spec.ts` + `rattachement-buvettes.spec.ts` | 42/42 (1 nouveau) |
| `organizations.service.spec.ts` | 40/40 (1 nouveau) |
| `cart.service.spec.ts` | 54/54 (2 nouveaux, 3 adaptés au gel interactif) |
| `paiements-abandonnes.service.spec.ts` | 9/9 (nouveau) |
| Typage serveur (`tsc --noEmit`) | 0 erreur |
| Lint des fichiers touchés | 0 erreur |

Commande : `NODE_OPTIONS=--max-old-space-size=1000 node node_modules/jest/bin/jest.js -i <fichier>`.
Non lancés sur le poste : la suite complète et l'intégration sur PostgreSQL
réel — **la CI les rejoue**.

## Risques restants
- La transaction de gel et les verrous ajoutent quelques écritures par
  paiement (une ligne de panier verrouillée brièvement) : négligeable, mais
  à observer au test de charge.
- Délai d'abandon fixé à 30 min : un client resté plus longtemps sur la
  feuille de paiement voit son paiement annulé et doit recommencer.
- Pas de contrainte d'unicité sur le comptoir par défaut (migration non
  faite).
- Tableau opérateur sans pagination (BUG-2026-037), capacité non mesurée.

## Déploiement
Railway au prochain `main` ; vérifier `/health` → `commit`, puis dans les
journaux : « Panier … : paiement abandonné » (toutes les 5 min, s'il y en a).
Aucune mise à jour de l'app nécessaire : le message 409 est déjà affiché tel
quel par l'app.

## Retour arrière
`git revert` du commit ; aucune migration. Les paniers déjà passés
`ABANDONED` restent abandonnés (le client en ouvre un nouveau).
