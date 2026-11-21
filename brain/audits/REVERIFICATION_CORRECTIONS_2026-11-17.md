# Revérification des corrections — 17 novembre 2026

- **Révision :** `2a0b199` (correctifs code dans `748120c`)
- **Référence :** `brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`
- **Vérification locale :** 9 suites Jest ciblées, **254/254 tests réussis**; `tsc --noEmit -p tsconfig.json`, réussi.
- **Limite :** tests unitaires, sans PostgreSQL réel, sans appels réels à Stripe/Flaix et sans charge multi-répliques. L'état GitHub/Railway ci-dessous est celui consigné dans `REPRISE.md`, pas une nouvelle vérification de ces consoles.

## Verdict par constat

| # | Constat | Verdict de revérification |
|---|---|---|
| 1 | Paiement abandonné et réservations (BUG-2026-030) | **Partiellement corrigé.** La tâche périodique, la vérification/annulation Stripe et la bascule conditionnelle existent. La libération des ressources n'est toutefois pas atomique ni rejouable dans tous les cas (détail ci-dessous). |
| 2 | Panier modifié pendant l'appel Stripe (BUG-2026-031) | **Correction substantielle, garde incomplète.** Les modifications ordinaires sont désormais sous verrou et le contenu est comparé. `figerEtEngager` ignore cependant le nombre de lignes obtenu par son `updateMany` avant de poursuivre. |
| 3 | Rejeu du webhook Flaix (BUG-2026-032) | **Partiellement corrigé.** Une livraison suivante reprend bien une erreur enregistrée. Un arrêt brutal après l'insertion et avant la fin laisse une ligne « en cours » qui ne devient jamais récupérable automatiquement. |
| 4 | Ouverture/fermeture automatiques (BUG-2026-033) | **Atomique par événement et meilleure isolation des erreurs.** Un risque de concurrence subsiste lorsque plusieurs événements partageant une buvette se terminent en même temps sur plusieurs instances. |
| 5 | Stripe en mode test | **Pas corrigé, et volontairement différé.** `REPRISE.md` indique toujours `sk_test` en production. La vraie vente reste impossible tant que la bascule live, les webhooks live et les comptes Connect ne sont pas vérifiés. |
| 6 | Route `/orders/event/:id/active` et buvette épinglée (BUG-2026-034) | **Corrigé dans le code.** Le contrôleur récupère l'épinglage et le service filtre les commandes par `supplierId`. Test ciblé inclus. |
| 7 | Création d'événement et rattachements (BUG-2026-035) | **Corrigé pour l'atomicité.** Événement, rattachements et comptoirs sont maintenant dans une transaction. La contrainte d'unicité du comptoir par défaut reste absente, comme indiqué dans le compte rendu. |

Le correctif BUG-2026-036 sur l'acceptation des invitations, également présent dans ce commit, a été relu : la consommation conditionnelle de l'invitation et la création d'appartenance sont dans la même transaction. Le test spécifique passe.

## Réserves constatées dans les correctifs

### P1 — Le résultat du verrou de gel du panier n'est pas contrôlé

- **Fichier :** `backend/src/modules/cart/cart.service.ts`, méthode `figerEtEngager` (autour des lignes 970-1005 dans cette révision).
- Le code appelle `tx.cart.updateMany({ where: { status: OPEN | CHECKOUT_PENDING } })`, mais ignore `count`. Il relit ensuite le panier et, si le contenu correspond, effectue un `cart.update` inconditionnel vers `CHECKOUT_PENDING`.
- Si la ligne a quitté ces statuts entre la lecture initiale et cette transaction (par exemple le webhook l'a convertie, ou le nettoyage l'a passée à `ABANDONED`), l'appel conditionnel peut toucher zéro ligne; le code continue néanmoins et peut réécrire son statut. Cela ne respecte pas l'invariant d'état que le correctif prétend verrouiller.
- **À faire :** si `count !== 1`, arrêter sans modifier le panier ni ses snapshots et renvoyer un conflit adapté; borner aussi la mise à jour finale à un état permis. Ajouter un test où la ligne est déjà `CONVERTED` ou `ABANDONED` au moment du gel.

### P2 — Le nettoyage peut marquer « abandonné » puis perdre la reprise de libération

- **Fichier :** `backend/src/modules/cart/paiements-abandonnes.service.ts`, méthode `libererUn` (autour des lignes 90-130).
- L'ordre est : passer le panier à `ABANDONED`, puis rendre les points, la place, le stock, puis effacer les marqueurs. Si le processus tombe ou si `releaseHoldForCart`/la base échoue après la bascule, les passages suivants ne recherchent plus ce panier puisqu'ils filtrent uniquement `CHECKOUT_PENDING`. Les ressources restantes peuvent alors demeurer bloquées.
- `rendreLeStock` absorbe ses erreurs; le service efface ensuite `stockReservedAt` même si une libération a échoué. Dans ce cas, l'absence du marqueur empêche aussi toute réparation automatique.
- **À faire :** rendre DB-side les réservations et la transition d'état dans une transaction idempotente, sans effacer le marqueur si la libération n'a pas réussi; ou ajouter une réconciliation des paniers `ABANDONED` ayant encore des marqueurs/écritures de réservation.

### P2 — Crash du processus Flaix : état « en cours » sans bail d'expiration

- **Fichier :** `backend/src/modules/live-activity/flaix-webhook.service.ts`, `handle` (autour des lignes 141-190).
- La reprise traite les lignes avec `error != null`. Si le processus s'arrête après la création de `FlaixWebhookEvent` mais avant d'écrire `error` ou `processedAt`, les doublons reçoivent `409` car la ligne semble toujours en cours. Rien ne reprend cette ligne après un délai. En plus, le timestamp signé est limité à cinq minutes par `parsePayload`; un retry ancien peut être refusé avant d'atteindre la logique de reprise.
- **À faire :** ajouter un bail (`claimedAt`/`claimedUntil`) ou une tâche qui récupère les lignes non terminées anciennes; définir la fenêtre anti-rejeu en accord avec la politique de retry de Flaix, sans accepter une répétition d'effet déjà appliqué.

### P2 — Deux fermetures concurrentes peuvent laisser une buvette ouverte

- **Fichier :** `backend/src/modules/events/ouverture-automatique.service.ts`, `fermer` (autour des lignes 136-185).
- Les transactions ferment chacune leur événement puis cherchent si la buvette sert encore un événement actif. Avec deux instances du cron et deux événements partageant la même buvette, chacune peut lire l'autre événement comme encore actif (transaction concurrente non validée); chacune garde alors la buvette ouverte. Les deux événements peuvent ensuite être terminés et la buvette rester ouverte.
- **À faire :** sérialiser la fermeture par buvette/club, ou recalculer l'état après les transitions avec une stratégie de verrouillage/relance garantissant qu'une dernière fermeture examine l'état validé. Ajouter un test d'intégration PostgreSQL à deux transactions concurrentes.

## Tests exécutés pendant cette revérification

Commande Jest directe depuis `backend/` (la commande pnpm a été interrompue car la vérification de politique attendait le registre npm) :

```text
node node_modules/jest/bin/jest.js --runInBand \
  src/modules/cart/cart.service.spec.ts \
  src/modules/cart/paiements-abandonnes.service.spec.ts \
  src/modules/live-activity/flaix-webhook.service.spec.ts \
  src/modules/events/ouverture-automatique.service.spec.ts \
  src/modules/orders/orders.controller.spec.ts \
  src/modules/orders/orders.service.spec.ts \
  src/modules/events/events.service.spec.ts \
  src/common/helpers/rattachement-buvettes.spec.ts \
  src/modules/organizations/organizations.service.spec.ts
```

Résultat : **9 suites réussies, 254 tests réussis**. Le typage du backend réussit également. Ces tests valident les scénarios unitaires ajoutés; ils ne couvrent pas les quatre courses résiduelles décrites ci-dessus.

## Conclusion

Les correctifs **6 et 7 sont correctement appliqués au périmètre relu**, et les corrections 1 à 4 ont nettement amélioré les chemins nominaux. Je ne confirme pas encore que les sept points sont tous complètement sûrs : le paiement live reste différé, et les trois traitements asynchrones (gel du panier, libération après abandon, reprise Flaix) ainsi que la fermeture multi-instance gardent des cas de concurrence/reprise à traiter. Les 254 tests ciblés et le typage passent; cela ne constitue pas une validation de charge ni de production réelle.
