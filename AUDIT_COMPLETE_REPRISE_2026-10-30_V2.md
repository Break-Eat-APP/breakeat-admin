# Audit de reprise V2 — Break Eat

**Date :** 30 octobre 2026  
**Branche et commit :** `main` — `7c52fe9077174ecfc27dc6731ef3f8fa8a68ee48`  
**État Git au début de l’audit :** `main` synchronisée avec `origin/main`, dépôt propre.  
**Périmètre :** backend, paiements et commandes, inventaire, créneaux, bascule Flaix, temps réel, flags, limites et pool PostgreSQL, scénarios de charge, CI et tests.  
**Modifications applicatives :** aucune. Ce rapport est le seul fichier ajouté.

Ce rapport reprend l’audit précédent, vérifie les corrections présentes dans le commit actuel et distingue les risques confirmés des capacités qui n’ont pas encore été mesurées. Il remplace la conclusion de l’audit du même jour sur le commit `c3c50d3`.

## Conclusion

Les corrections faites depuis l’audit précédent sont substantielles : le mode Flaix est maintenant contrôlé côté serveur, la commande payée et son annonce temps réel sont écrites ensemble, l’outbox rattrape une file bien plus vite, et le tableau opérateur regroupe ses relectures. Les vérifications TypeScript, lint et tests unitaires passent sur le commit audité.

**Je ne peux pas certifier que l’application tiendra 5 000 commandes Break Eat simultanées, ni 10 000 à 50 000 utilisateurs connectés.** Le banc actuel mesure surtout la recherche de lieux et le relais d’un lien Flaix. Il ne mesure pas 5 000 paiements Break Eat, les webhooks Stripe, les sockets opérateur et la base Railway ensemble.

Deux risques sont particulièrement importants pour le scénario annoncé : **le stock n’est pas réservé avant le paiement** et **un créneau de retrait complet peut être perdu après le paiement**. Les commandes sont alors conservées, mais le client peut payer pour un produit non disponible ou ne pas obtenir le créneau qu’il avait choisi.

## Vérifications de cette reprise

| Contrôle sur le commit `7c52fe9` | Résultat |
|---|---|
| `pnpm turbo typecheck --force --concurrency=1` | Réussi, 5 tâches non servies par le cache |
| `pnpm turbo lint --force --concurrency=1` | Réussi, 5 tâches non servies par le cache |
| `pnpm turbo test --force --concurrency=1` | Réussi : backend 71 suites / 983 tests; opérateur 27; mobile 57; admin 25; back-office 27 |
| Migrations et services d’intégration PostgreSQL 18 / Redis 7 jetables | Démarrés; le résumé final Jest n’a pas été récupéré dans cette session : résultat **non certifié**, ni déclaré réussi ni déclaré échoué |
| Build complet actuel | Non lancé : la machine n’avait qu’environ 80 Mo de mémoire disponible à la fin des vérifications |
| Statut du dernier run GitHub Actions | Non interrogé. Les résultats locaux ne prouvent pas le statut du run distant |

Les suites unitaires totalisent **1 119 tests réussis**. Les conteneurs temporaires créés pour l’intégration ont été supprimés; les conteneurs de développement n’ont pas été ciblés. L’environnement local est Node 24.15.0 alors que le workflow utilise Node 22 : il reste donc utile de confirmer le run GitHub sur cette révision.

## Corrections précédentes confirmées dans le code actuel

| Point du rapport précédent | État vérifié |
|---|---|
| UUID invalides dans le test de concurrence de l’outbox | Corrigé dans le test, qui utilise maintenant `randomUUID()`. Le résultat de la suite d’intégration actuelle reste à confirmer. |
| Repli Break Eat lorsqu’un lieu Flaix n’a pas de lien commandable | Une règle partagée existe dans `backend/src/common/helpers/mode-de-commande.ts`; elle est appelée par le calendrier et le panier. |
| Panier ouvert avant le passage d’un lieu à Flaix | Le serveur revérifie le mode lors de l’ouverture du panier et avant de créer/reprendre le paiement Stripe. |
| Annonce `new_order` perdue entre le commit de la commande et l’envoi | L’annonce est déposée dans l’outbox dans la transaction qui crée la commande. |
| Doubles lectures du tableau opérateur lors d’une rafale | `apps/operator/src/lib/realtime/lecture-groupee.ts` limite les appels à une lecture en vol et une relecture en attente, avec regroupement à 300 ms. |
| Rattrapage lent de l’outbox | Le worker traite plusieurs lots et marque les lignes livrées en groupe; le dépôt documente un test de vidange de 10 000 lignes sur PostgreSQL réel. |
| Recherches d’événements par lieu sans index dédié | Une migration ajoute un index sur le lieu et la date des événements; le guide documente les mesures avant/après. |
| Banc de charge pouvant viser une cible non prévue ou semer une base de production | Le tireur impose une cible autorisée et le semeur refuse une base qui contient commandes ou paiements. |
| Limitation des essais de mot de passe quand Redis tombe | Le repli local a été resserré. Il reste cependant local à chaque instance, donc non global si Redis est indisponible. |
| Plafond de connexions PostgreSQL inconnu | Le code lit désormais `max_connections` et l’activité de PostgreSQL; le pool Prisma est de 10 connexions par instance. Cela améliore la visibilité, sans démontrer le débit soutenable. |

## Problèmes à traiter

### P1 — Le contrôle de stock au paiement ne réserve pas l’article

Dans `backend/src/modules/cart/cart.service.ts:516`, le checkout vérifie la quantité disponible avant l’appel Stripe. Cette lecture ne bloque pas le stock et ne crée pas de réservation. Ensuite, après confirmation du paiement, `backend/src/modules/orders/orders.service.ts:421-465` tente le décrément conditionnel. Si le stock a été pris entre-temps, le code met le stock à zéro et indisponible, écrit un avertissement, mais **crée quand même la commande payée**.

Avec un dernier article et plusieurs paniers payés au même moment, plusieurs checkouts peuvent lire la même quantité avant qu’un webhook ne la décrémente. Le décrément empêche le stock de devenir négatif; il n’empêche pas les ventes au-delà du stock. Les tests d’intégration actuels du panier vérifient l’ajout et la modification de quantité, pas la concurrence de plusieurs paiements pour la dernière unité.

**Impact possible :** paiements encaissés, commandes créées et articles manquants au comptoir; remboursements ou substitutions manuels pendant un pic d’activité.

**Correction à faire :** réserver la quantité atomiquement avant de lancer Stripe, avec une réservation idempotente par panier, une expiration, une libération si le paiement échoue ou expire, et une consommation de la réservation dans le webhook. Ne pas faire échouer la création de commande après encaissement sans mécanisme de remboursement/réconciliation.

### P1 — Un créneau complet peut être perdu après encaissement

La capacité d’un créneau est protégée par une mise à jour conditionnelle dans `backend/src/modules/slots/slots.service.ts:288-329`. C’est une bonne protection contre le dépassement du compteur. Mais l’affectation se fait lors de la création de commande, après le paiement. Dans `backend/src/modules/orders/orders.service.ts:317-325`, une erreur de créneau plein est attrapée et seulement journalisée; la commande payée est conservée sans créneau.

**Impact possible :** si beaucoup de clients choisissent le même créneau, seuls les clients qui obtiennent une place dans sa capacité le garderont. Les autres peuvent avoir payé sans l’heure de retrait promise ou comprise dans leur parcours. Le nombre dépend de la capacité configurée et de la répartition des commandes.

**Correction à faire :** réserver également la capacité du créneau avant paiement, libérer la réservation sur échec/expiration et la confirmer à la réception du paiement. Si le club accepte volontairement les commandes sans créneau, l’application doit en informer clairement le client et fournir une file ou une règle de rattrapage côté opérateur.

### P2 — Le contrôle du mode Flaix recharge tous les événements du lieu

`CartService.assertEncoreSurBreakEat` (`backend/src/modules/cart/cart.service.ts:1017-1040`) charge les événements du lieu pour calculer le mode. La méthode est appelée à l’ouverture du panier et au checkout. Pour un club qui conserve plusieurs saisons, chaque arrivée sur ces parcours relit donc une liste qui grandit avec l’historique. Le nouvel index aide les recherches, mais il ne réduit pas le nombre de lignes renvoyées par cette requête.

**Impact possible :** sur un événement populaire, ces lectures répétées consomment des connexions et du temps PostgreSQL/Node; la latence augmente avec l’historique du lieu.

**À faire :** conserver la règle métier commune, mais calculer son état avec une requête bornée ou un état de mode maintenu/invalidé lors des changements de configuration. Mesurer sur des lieux ayant plusieurs saisons avant déploiement massif.

### P2 — La liste clients et son export restent non bornés

`backend/src/modules/clients/clients.service.ts:61-120` agrège les commandes de tous les clients du périmètre, charge leurs comptes, lieux et produits préférés, puis construit et trie toute la réponse en mémoire. `exporterCsv` (`:252-258`) réutilise cette liste complète. Le document de reprise reconnaît que cette pagination reste ouverte.

**Impact possible :** un export ou l’ouverture de l’écran client d’un grand club peut consommer beaucoup de mémoire et de temps, voire ralentir les autres requêtes du même processus.

**À faire :** paginer l’écran et calculer ses agrégats au niveau SQL; générer le CSV en flux ou en tâche d’arrière-plan pour ne pas tronquer silencieusement le fichier.

### P2 — Le test de l’ordre outbox ne prouve pas le cas décrit dans ses commentaires

`backend/test/integration/outbox-ordre-deux-ouvriers.int-spec.ts` présente deux annonces d’une même transaction comme le cas réel, mais son helper `etape()` insère chaque annonce par deux appels Prisma séparés. Il ne reproduit ni une transaction unique ni l’intercalage d’écritures concurrentes. Le commentaire suppose également que deux valeurs `BIGSERIAL` de la même transaction sont consécutives. Cette propriété n’est pas démontrée par ce test.

**Impact possible :** près d’une frontière de lot, deux instances pourraient traiter deux états d’une commande dans un ordre différent si des insertions concurrentes séparent leurs numéros de séquence. C’est un risque de cohérence d’affichage temps réel, pas une duplication de la commande en base.

**À faire :** écrire un test PostgreSQL qui dépose réellement les deux annonces dans la même transaction pendant qu’une autre transaction insère des événements, puis force deux workers et une frontière de lot. Si l’ordre est requis, le garantir explicitement par une clé d’ordre transactionnelle/commande et une règle de claim adaptée.

### P2 — Une reprise outbox peut notifier deux fois

L’outbox protège le travail concurrent avec un bail, mais sa livraison est « au moins une fois » : si l’émission a réussi et que le processus s’arrête avant le marquage `deliveredAt`, l’annonce peut être rejouée après expiration du bail. Le hook opérateur traite chaque `new_order` reçu comme une nouvelle notification (`apps/operator/src/hooks/useDashboard.ts:242-255`) et ne déduplique pas les `eventId` déjà vus.

**Impact possible :** une même commande peut déclencher deux alertes sonores/visuelles après une panne à cet endroit. Le snapshot REST évite de créer deux cartes de commande, mais l’équipier peut croire qu’une nouvelle commande est arrivée.

**À faire :** mémoriser une fenêtre bornée d’identifiants d’événements côté opérateur et tester une livraison suivie d’un échec du marquage puis d’un rejeu.

### P2 — Les plafonds et mesures de charge ne valent pas une capacité de production

Le guide `backend/scripts/banc-de-charge/LISEZ-MOI.md` rapporte notamment 299 requêtes/s pour le scénario `flaix` avec 200 clients et 14,6 inscriptions/s avec 50 clients. Ces chiffres viennent d’une machine de développement, une seule instance, sans Redis. Le tireur relance chaque requête quand la précédente répond : il ne reproduit pas une arrivée de 5 000 requêtes en rafale fixe.

Le scénario `flaix` ne réalise qu’un GET Break Eat qui résout le lien de commande. Le panier, les paiements, les webhooks et la file du fournisseur externe sont hors de cette mesure. La mesure de vidange outbox compte des appels à une passerelle simulée : elle ne mesure pas 10 000 véritables émissions Redis/Socket.IO.

Le limiteur par défaut est de 30 000 requêtes/minute par IP (`backend/src/common/securite/limitation.ts:94`). Dans un stade où les spectateurs partagent une même adresse publique, ce seuil peut devenir visible selon le nombre d’appels par parcours. Si Redis est indisponible, le repli mémoire compte séparément par instance. Le pool est de 10 connexions par instance (`backend/src/database/pool.ts:41`); les connexions totales doivent tenir dans le plafond PostgreSQL après prise en compte de tous les services.

**À faire :** exécuter une campagne sur une recette dimensionnée comme Railway, avec plusieurs instances, Redis, la vraie version de PostgreSQL, plusieurs lieux et les chemins complets. Injecter des rafales d’arrivées fixes, des webhooks, des connexions Socket.IO et des opérateurs. Suivre p95/p99, erreurs HTTP, attente du pool, CPU/mémoire, profondeur/âge outbox et commandes sans stock/créneau.

### P2 — Les flags ne désactivent pas tous les modules

`FeatureFlagsService` existe, mais le consommateur métier générique trouvé dans le code est principalement `app.split.enabled` dans `OrderSplitsService`. Les champs `activeFeatureFlags` des événements sont enregistrés, mais je n’ai pas trouvé de lecture générale qui désactive les modules du parcours client. `flaixEnabled` est un réglage dédié au mode de commande d’un lieu, pas un coupe-circuit universel.

La vérification au checkout bloque un nouveau paiement Break Eat après la bascule. En revanche, un paiement Stripe déjà engagé est volontairement honoré par le webhook pour éviter d’encaisser sans créer/servir de commande. Il faut donc prévoir qu’une commande déjà en paiement puisse arriver après le changement de mode.

**À faire :** dresser une liste des fonctionnalités qui doivent être coupables séparément, relier chaque flag à ses points d’entrée backend et tester chaque état absent/actif/inactif. Documenter la période de transition des paiements déjà commencés.

## Ce que les scénarios permettent de conclure

| Scénario illustratif | Calcul ou mesure disponible | Conclusion prudente |
|---|---:|---|
| 5 000 ouvertures « Commander » réparties sur 1 minute | 83 requêtes/s; scénario Flaix mesuré à 299 req/s dans le banc local | Le chemin étroit du lien est sous le chiffre local mesuré, mais ce n’est pas un test Railway ni un pic fixe de 5 000 arrivées. |
| 5 000 ouvertures en 10 secondes | 500 requêtes/s | Au-dessus des 299 req/s mesurées à 200 clients; risque de hausse de latence et d’erreurs, capacité de production inconnue. |
| 5 000 commandes payées Break Eat dans le même créneau | Pas de mesure de charge de checkout/webhook | **Capacité non démontrée**; les courses de stock et de créneau peuvent produire des commandes payées à traiter manuellement. |
| 5 000 inscriptions dans la soirée | 14,4–14,6 inscriptions/s en banc local | À ce débit théorique, environ 5 min 45 s pour 5 000 inscriptions sur une instance; ce n’est pas une garantie de débit en production et la montée en répliques n’a pas été mesurée. |
| 50 000 personnes connectées ou 50 000 sockets | Aucun test à cette échelle | **Capacité non démontrée**. Un nombre de comptes, de requêtes par seconde et de sockets ouvertes sont trois charges différentes. |
| 50 lieux actifs dans la même soirée | Le banc de découverte rapporte environ 43–46 req/s sur ses scénarios à 50 lieux | Utile pour comparer des versions; insuffisant pour promettre 5 000 commandes ou valider la base Railway. |

## Plan de correction recommandé

1. **Réserver le stock avant l’appel Stripe**, puis confirmer/libérer la réservation de manière idempotente au webhook ou à l’expiration.
2. **Réserver le créneau avant le paiement** ou définir explicitement le parcours client si le créneau est devenu complet.
3. Ajouter des tests de concurrence PostgreSQL pour le dernier article, la dernière place d’un créneau, les webhooks répétés et les transitions outbox sous deux instances.
4. Rejouer le workflow GitHub complet sur `7c52fe9` (Node 22, PostgreSQL 18, Redis 7) et conserver le lien du run. Refaire le build sur une machine disposant d’assez de mémoire.
5. Paginer la liste clients et borner le chargement des événements utilisé par le contrôle Flaix.
6. Dédupliquer les événements temps réel au poste opérateur.
7. Avant d’annoncer une capacité cible, faire un test de charge complet sur une recette Railway représentative, avec les mêmes ressources, le même pool, Redis, plusieurs instances et les flux de paiement simulés.

## Détail d’intégration Flex/Flaix

Dans le dépôt audité, les noms et réglages trouvés sont `Flaix`, `flaixEnabled` et les routes de destination Flaix. Je n’ai pas trouvé de module nommé `Flex`. Si Flex est un autre fournisseur ou une évolution distincte, son adaptateur API et sa capacité ne sont pas validés par cet audit.

## Verdict final

**Les principaux correctifs du précédent audit sont visibles et les contrôles unitaires/TypeScript/lint passent. Les promesses de capacité demandées ne sont pas établies.** Avant une montée en charge avec 5 000 paiements simultanés, il faut régler la réservation du stock et des créneaux, puis valider le parcours complet sur une recette calquée sur Railway. Les chiffres de transfert Flaix ne peuvent pas servir de preuve pour 5 000 commandes Break Eat.
