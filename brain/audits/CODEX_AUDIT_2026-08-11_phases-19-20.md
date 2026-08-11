# À ENVOYER À CODEX — Audit phases 19 & 20 (2026-08-11)

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
- ENGINEERING_MANUAL.md — notice technique (entrées « Phase 19 » et « Phase 20 » avec références de ligne exactes)
- TASK_SUMMARY.md — résumé de chaque phase (entrée 2026-08-11 en tête)
- ORDER_STATE_MACHINE.md — transitions de commande autorisées
- FLAIX_CONTRACT.md — frontière Break Eat / Flaix
- CHANGELOG.md (racine) — fichiers créés/modifiés par phase
- REPRISE.md (racine) — état courant + dette technique + pièges (LIRE la section « Dette technique »)

## ⚠️ Trois contraintes de cet audit

1. **Backend hébergé hors ligne** (essai Railway expiré). Le développement se fait en LOCAL : `demarrer-local.bat` démarre Docker (Postgres/Redis) + backend + admin + back-office. Tu peux lancer `pnpm typecheck`, `pnpm lint`, et `pnpm --filter @break-eat/backend test`.
2. **Entrée de build mobile** : le bundle livré (web ET natif iOS) est `apps/mobile/index.expo.js` → `App.expo.tsx` (champ package.json `main`). `App.tsx` / `root-navigator.tsx` sont du CODE MORT non livré. Dans `App.expo.tsx`, `EventHome` / `QRScanner` sont des stubs — n'audite pas `App.tsx` comme s'il était livré.
3. **Stripe n'est pas encore branché** (décision client). La phase 20 modifie néanmoins le chemin de paiement réel (`createFromPaymentIntent`) : c'est le point le plus sensible de l'audit.

## Phases auditées

Phase 19 — état live des commandes + bouton « Je suis arrivé ».
Phase 20 — programme de fidélité (gain de points + utilisation en réduction).

## Fichiers modifiés

### Phase 20 — Fidélité (CHANGELOG [0.43.0])
+ backend/prisma/migrations/20260728_phase20_loyalty/migration.sql
+ backend/src/modules/loyalty/{loyalty.service.ts, loyalty.controller.ts, loyalty.module.ts, loyalty.mock.ts}
+ backend/src/modules/cart/dto/redeem-points.dto.ts
~ backend/prisma/schema.prisma (Venue.loyalty* ; LoyaltyAccount ; LoyaltyTransaction + enum LoyaltyEntryKind ; Cart.redeemedPoints ; Order.discountCents/pointsRedeemed/pointsEarned)
~ backend/src/modules/cart/cart.service.ts (computeView remisé, setRedeemedPoints, débit dans demoCheckout)
~ backend/src/modules/cart/cart.controller.ts (PATCH /carts/:id/loyalty-points)
~ backend/src/modules/orders/orders.service.ts (awardLoyaltyPoints à PICKED_UP ; contrôle défensif Stripe sur le total remisé ; débit dans createFromPaymentIntent)
~ backend/src/modules/venues/{dto/create-venue.dto.ts, dto/update-venue.dto.ts, venues.service.ts}
~ backend/src/app.module.ts, modules/{cart,orders}/*.module.ts
~ backend/src/modules/{cart/cart.service.spec.ts, orders/orders.service.spec.ts, orders/order-loss.spec.ts} (loyaltyDisabledProvider)
~ apps/admin/src/app/(admin)/organizations/[id]/page.tsx, src/lib/api/admin-client.ts
~ apps/mobile/src/screens/checkout.screen.tsx, src/lib/api/mobile-api.ts, src/store/cart.store.ts, src/screens/event-home.screen.tsx

### Phase 19 — État live + « Je suis arrivé » (CHANGELOG [0.42.0])
+ backend/prisma/migrations/20260728_phase19_order_customer_arrived/migration.sql
~ backend/prisma/schema.prisma (Order.customerArrivedAt)
~ backend/src/modules/orders/orders.service.ts (markCustomerArrived)
~ backend/src/modules/orders/orders.controller.ts (POST /orders/:id/arrived ; CUSTOMER_SLOT_SELECT sur GET /orders)
~ backend/src/modules/realtime/realtime.service.ts (emitCustomerArrived)
~ apps/mobile/src/screens/order-history.screen.tsx (réécrit), App.expo.tsx (OrderTracking dé-stubbé)
~ apps/operator/src/{components/OrderCard.tsx, hooks/useDashboard.ts, lib/realtime/socket-client.ts, lib/api/orders-client.ts, app/globals.css, app/dashboard/[eventId]/page.tsx}

## Ta mission

Lis /brain (ARCHITECTURE, DOMAIN_MODEL, ORDER_STATE_MACHINE, FLAIX_CONTRACT, ENGINEERING_MANUAL entrées phases 19-20, TASK_SUMMARY) + REPRISE.md, puis audite. Concentre-toi sur :

### 1. Intégrité financière (PRIORITÉ — phase 20)
- Le solde peut-il devenir négatif ? (course entre deux paniers, deux commandes simultanées, retry de webhook)
- `balance` (cache) peut-il diverger du registre `LoyaltyTransaction` ? Cherche toute écriture de l'un sans l'autre, ou hors transaction.
- `@@unique([orderId, kind])` couvre-t-il vraiment le double crédit / double débit ? Que se passe-t-il si une transition `PICKED_UP` est rejouée ?
- La remise peut-elle dépasser le montant du panier (note négative) ? Des points peuvent-ils être consommés au-delà du nécessaire ?
- `createFromPaymentIntent` : le contrôle `totalCents !== intent.amount` est-il correct maintenant qu'il porte sur le total remisé ? Un changement de config du club entre checkout et webhook est-il géré sans écart d'argent ?
- Arrondis : `pointsForAmount` (floor) et `discountForPoints` (ceil sur le plafonnement) sont-ils cohérents ? Une boucle gain→utilisation→gain peut-elle créer de la valeur ?

### 2. Sécurité
- Un client peut-il lire ou dépenser les points d'un autre ? (l'`userId` vient-il toujours du JWT, jamais de l'URL/body ?)
- `POST /orders/:id/arrived` : propriété vérifiée ? Fuite d'information sur une commande qui n'appartient pas à l'appelant ?
- Routes de mutation gardées (JWT) ? DTO validés (class-validator) ? `ParseUUIDPipe` sur les paramètres ?
- Le payload dashboard opérateur expose-t-il des données client qu'il ne devrait pas (le spread de `Order` inclut désormais de nouveaux champs) ?
- `CUSTOMER_SLOT_SELECT` : ne fuit-il rien d'opérationnel au client ?

### 3. Machine à états et invariants métier
- « Je suis arrivé » ne doit PAS changer le statut de la commande — vérifie que c'est bien le cas et qu'aucune transition parasite n'est introduite.
- Le gain de points à `PICKED_UP` est fire-and-forget : un échec peut-il bloquer ou corrompre la transition ?
- Cohérence avec ORDER_STATE_MACHINE.md.

### 4. Realtime
- `customer_arrived` : ciblage des rooms correct ? Le board peut-il rater l'événement (déduplication, reconnexion) ?
- Cohérence avec REALTIME_CONTRACTS.md (le contrat documente-t-il ce nouvel événement ? sinon, signale-le).

### 5. Schéma Prisma & migration
- Schéma conforme à DOMAIN_MODEL.md ? `@@map` snake_case ? `onDelete` explicites ?
- La migration SQL écrite à la main correspond-elle exactement au schéma Prisma (types, index, contraintes, FK) ?
- Les valeurs par défaut sont-elles sûres pour les lignes existantes (programme désactivé, compteurs à 0) ?

### 6. TypeScript, lint, tests
- `pnpm typecheck` / `pnpm lint` à 0 sur les 5 packages.
- `pnpm --filter @break-eat/backend test` (attendu : 336/336).
- Le `loyaltyDisabledProvider` partagé masque-t-il des cas qu'il faudrait tester ? **Manque-t-il des tests unitaires dédiés à la fidélité** (arrondis, plafonnement, idempotence, solde insuffisant) ? Si oui, c'est un finding attendu — propose les cas.

### 7. Documentation
- ENGINEERING_MANUAL.md contient-il les entrées phases 19 et 20 au format obligatoire, avec des références fichier:ligne **exactes** (vérifie-les) ?
- CHANGELOG.md et TASK_SUMMARY.md sont-ils à jour et cohérents avec le code ?

## Format de réponse attendu

## AUDIT — Phases 19 & 20
### ✅ Points corrects
### ⚠️ Avertissements (non bloquants) — avec fichier:ligne
### ❌ Problèmes critiques — avec fichier:ligne + correction recommandée
### 🔧 Corrections suggérées (fichier / ligne / problème / correction)
### 📋 Commandes de vérification à relancer
### ✅/❌ Verdict global — [APPROUVÉ] ou [BLOQUÉ]

Commence par lire /brain + REPRISE.md avant d'auditer le code.
```

---

## Ce qui a déjà été vérifié de notre côté (à recouper, pas à refaire à l'aveugle)

- Activation via l'API admin (2 pts/€, 1 c/point) → `GET /loyalty/venues/:id/me` renvoie `enabled: true`.
- Gain : commande 250 c passée en `PICKED_UP` → **+5 points**, `Order.pointsEarned = 5`.
- Utilisation : panier 500 c avec 5 points → remise 5 c → **payé 495 c**, solde 5 → 0.
- Garde-fous : 9999 points avec solde 0 → **400** ; points négatifs → **400**.
- Registre : 1 EARN + 1 REDEEM, et **`balance` == somme du registre**.
- Phase 19 : statut PAID → PREPARING → READY **sans action utilisateur** (poll 10 s) ; couleurs mesurées `rgb(252,64,2)` / `rgb(22,163,74)` ; `POST /arrived` idempotent ; **400** sur commande `PICKED_UP`.
- typecheck 0 · lint 0 · jest **336/336** · `expo export -p web` OK.

## Limites connues (déjà documentées, ne pas les compter comme découvertes)

- La section « Mes points » de l'écran de paiement **n'a pas été vérifiée visuellement** : `EventHome` est stubbé dans `App.expo.tsx`, le parcours d'achat n'est pas atteignable en preview web.
- Stripe n'est pas branché (décision client) — seul le chemin `demoCheckout` a été exercé en bout en bout ; le chemin `createFromPaymentIntent` a été relu et adapté mais pas exécuté.
- `order-tracking.screen.tsx` est réactivé mais garde son ancien thème sombre.
