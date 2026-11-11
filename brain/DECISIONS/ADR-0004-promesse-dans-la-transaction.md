# ADR-0004 — Ce qui doit partir après un changement d'état est promis dans la transaction

- **Date :** 27/10/2026 (temps réel), étendue le 11/11/2026 (annonce « prête »)
- **Statut :** ACCEPTÉE
- **Décidée par :** Claude, sur audits Codex ; règle « ne jamais perdre une commande »
- **Liée à :** commit `0379b88` (l'outbox), `brain/audits/AUDIT_2026-11-11_codex-notification-prete.md`

## Contexte
Les annonces (nouvelle commande au comptoir, commande prête au client)
partaient **après** l'enregistrement, en « fire-and-forget ». Un arrêt du
serveur entre les deux, et le comptoir n'apprenait jamais la commande, ou le
client n'était jamais prévenu.

## Options étudiées
1. Envoyer après le commit et espérer.
2. Un système de files externe (Redis, file de messages) — complexité de plus
   en V1.
3. **Écrire la promesse dans la même transaction que le changement d'état,
   puis émettre, puis rattraper.**

## Décision
Option 3, dans PostgreSQL :
- **temps réel** : la table `RealtimeOutbox` reçoit l'annonce dans la
  transaction ; un bail (`claimedUntil`) évite le double envoi entre
  répliques ; un rattrapage chaque minute rejoue les ratés ;
- **annonce « prête »** : `orders.ready_announce_due_at` posé dans la
  transaction de `transition` ; envoi réservé par un bail de 2 minutes ;
  `ready_announced_at` une fois émise ; rattrapage chaque minute, 5 essais.

## Pourquoi
« Ne jamais perdre une commande » sans ajouter d'infrastructure : la base est
déjà la source de vérité.

## Ce que ça coûte
Livraison **au moins une fois** : un serveur qui meurt après l'envoi et avant
d'avoir noté « fait » peut faire sonner deux fois. Préférable à une perte.

## Ce qui la remettrait en cause
Un volume qui rendrait le balayage chaque minute trop coûteux (index en place
sur les deux).

## Où elle vit dans le code
`backend/src/modules/realtime/outbox.service.ts`,
`backend/src/modules/orders/orders.service.ts` (`transition`),
`backend/src/modules/live-activity/live-activity.service.ts`
(`annoncerCommandePrete`, `rattraperAnnoncesPretes`).
