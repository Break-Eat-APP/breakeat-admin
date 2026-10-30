# Audit complète de reprise — Break Eat

**Date :** 30 octobre 2026  
**Branche :** `main`  
**Commit audité :** `c3c50d36a7bbdb4e43c239c41ce15980448393b2`  
**Synchronisation :** `main` et `origin/main` pointent sur le même commit. Dépôt propre au début de l’audit.  
**Périmètre :** monorepo, backend NestJS/Prisma, application mobile, tableaux opérateur/admin, migrations, workflows GitHub Actions, scénarios de charge, commandes Stripe, bascule Flaix et diffusion temps réel.  
**Modifications produit par Codex :** aucune. Ce fichier est le seul livrable ajouté.

## Conclusion exécutive

Les dernières corrections améliorent réellement le calendrier multi-événements, la fenêtre de saison, la lecture des lieux et la réservation des lignes d’outbox. Le code compile, le lint et les tests unitaires passent localement.

**Je ne recommande pas de considérer ce commit comme entièrement validé pour le déploiement.** La suite d’intégration réelle échoue sur les cinq tests du nouvel essai de concurrence outbox : le test envoie des identifiants texte à une colonne PostgreSQL `UUID`. Le workflow CI appelle cette suite sur PostgreSQL 18 et Redis 7; un run complet sur ce commit devrait donc échouer au job d’intégration. Je n’ai pas consulté l’historique distant des runs GitHub depuis cet environnement.

J’ai également confirmé des risques de production dans le parcours Flaix, l’atomicité de `new_order` et le rafraîchissement des tableaux opérateur. L’audit ne démontre pas que l’application tient 10 000 ou 50 000 utilisateurs, ni un pic de commandes : aucun scénario exécuté ici ne reproduit une foule qui s’inscrit, paie et utilise simultanément les sockets.

## Vérifications exécutées

| Vérification locale | Résultat |
|---|---|
| `pnpm turbo typecheck --concurrency=1` | Réussi — 5 tâches |
| `pnpm turbo lint --concurrency=1` | Réussi — 5 tâches |
| `pnpm turbo test --concurrency=1` | Réussi — 5 tâches; certaines sorties servies par le cache Turbo |
| `pnpm turbo build --concurrency=2` | Réussi — 5 tâches; certaines sorties servies par le cache Turbo |
| Migrations Prisma sur une base jetable PostgreSQL 18 | Réussies — 50 migrations, dont `20261030_bail_outbox` |
| `pnpm test:integration` avec PostgreSQL 18 et Redis 7 jetables | Échoué — 16 suites réussies, 1 échouée; 138 tests réussis, 5 échoués sur 143 |
| Version locale | Node 24.15.0 et pnpm 11.3.0; le workflow GitHub sélectionne Node 22 |

Les services de base utilisés pour l’intégration étaient des conteneurs temporaires dédiés. Ils ont été supprimés après le test; les conteneurs de développement n’ont pas été touchés. Le build Next.js affiche un avertissement de configuration du plugin ESLint, sans faire échouer la compilation.

## Correctifs confirmés dans le dépôt

- **Calendrier multi-événements :** l’API calcule l’état commandable par événement et l’application demande la destination pour l’événement choisi. Le endpoint lie bien l’événement au lieu demandé. Les tests unitaires des lieux et du calendrier passent.
- **Fenêtre de saison :** la borne temporelle est calculée dans la lecture des lieux, et non une fois au démarrage du module.
- **Recherche des lieux :** les événements retournés sont bornés à une saison utile; les agrégats de confidentialité restent calculés sur l’ensemble des événements. Le guide de charge consigne une amélioration mesurée précédemment, mais les mesures de ce guide n’ont pas été reproduites pendant cet audit.
- **Réservation outbox :** `claimed_until`, le bail récupérable et sa migration sont présents. La migration passe sur PostgreSQL 18. La garantie de concurrence n’est toutefois pas validée tant que l’essai d’intégration dédié échoue.
- **Création de panier :** le backend vérifie désormais le mode Flaix avant d’ouvrir un nouveau panier Break Eat. Cette protection ne couvre pas encore tous les chemins décrits plus bas.
- **Banc de charge :** les scripts sont désormais suivis dans le dépôt et le guide distingue clairement découverte, paiement et temps réel. Le tireur actuel reste limité à la découverte publique.

## Constats à corriger en priorité

### P1 — Le job d’intégration échoue sur le test de concurrence de l’outbox

Dans `backend/test/integration/outbox-concurrence.int-spec.ts:61-69`, les valeurs `eventId` sont générées par `unique('ev')`. Le helper de `backend/test/integration/banc.ts` renvoie une chaîne de la forme `ev-…`; le champ `realtime_outbox.event_id` est un UUID PostgreSQL. L’insertion échoue donc avant que le test ne vérifie le bail ou l’absence de doublons. Les cinq cas de cette suite échouent pour cette raison.

Le workflow `.github/workflows/ci.yml` configure `DATABASE_URL_TEST` et appelle `pnpm test:integration` avec une base réelle. Cette panne est donc un blocage CI sur le commit audité, même si les suites unitaires passent.

**À demander à Claude Code :** générer de vrais UUID pour `eventId` dans cette suite, garder un identifiant de test séparé dans `payload` si nécessaire, puis relancer tout le job d’intégration sur PostgreSQL 18 et Redis 7. Vérifier aussi le test « se partagent le travail » : son assertion actuelle ne prouve que le total d’émissions, pas que les deux ouvriers ont effectivement pris des lignes.

### P1 — Le fallback Break Eat quand un lieu Flaix n’a pas de lien est bloqué côté application

Le contrat mobile indique qu’un lieu `flaixEnabled` sans lien courant ni ouverture future reste commandable via Break Eat (`apps/mobile/src/lib/ouverture-lieu.ts:45-62`). Le service de panier permet également le fallback uniquement si aucun événement du lieu ne porte de lien (`backend/src/modules/cart/cart.service.ts:180-195`).

Dans la réponse du calendrier, cependant, tout lieu Flaix utilise `estCommandableMaintenant` pour chaque événement (`backend/src/modules/venues/public-venues.controller.ts:380-389`); cette fonction renvoie toujours `false` quand l’événement n’a pas d’URL (`backend/src/common/helpers/fenetre-commande.ts:235-245`). L’écran ne rend le bouton « Commander » que pour une sélection marquée `ouvert` (`apps/mobile/src/screens/saison.screen.tsx:383-395`). Résultat : un lieu basculé Flaix sans lien n’a pas de bouton Break Eat, contrairement au fallback prévu.

Autre divergence au même endroit : si un événement historique du lieu conserve une ancienne URL, `CartService.create` trouve ce lien et refuse un nouveau panier Break Eat, même si aucun match actuel n’a de lien utilisable.

**Scénario d’impact :** configuration Flaix commencée mais pas terminée, ou ancienne URL conservée; le supporter arrive au lieu et ne peut pas passer commande par le parcours de secours.

**À demander :** définir une seule règle métier pour le mode du lieu et l’événement sélectionné, puis la partager entre le calendrier, le bouton mobile, `CartService.create` et le paiement. Ajouter des tests d’intégration pour « aucun lien », « lien passé seulement », « lien futur » et « lien ouvert maintenant ».

### P1 — Un panier Break Eat déjà ouvert peut encore être payé après la bascule Flaix

La garde Flaix est présente dans `CartService.create`, mais `CartService.checkout` (`backend/src/modules/cart/cart.service.ts:434-451`) ne revalide que l’accès à l’événement et l’état de l’organisation. Il peut donc créer ou réutiliser une session / un PaymentIntent pour un panier ouvert avant le changement de mode.

Le webhook Stripe appelle ensuite `OrdersService.createFromPaymentIntent` (`backend/src/modules/webhooks/stripe-webhooks.service.ts:268-282`). Ce chemin ne vérifie pas le mode Flaix avant de créer la commande. Une intention de paiement déjà créée peut être réglée après la bascule et produire une commande Break Eat dans un lieu passé à Flaix.

**À demander :** appliquer une garde au checkout et décider explicitement du sort des paiements déjà engagés. Ne pas simplement rejeter le webhook après encaissement : il faut une règle sûre pour honorer, annuler ou rembourser ces paiements et laisser une trace exploitable.

### P1 — `new_order` n’est toujours pas écrit dans la transaction qui crée la commande

Les deux chemins de création (`backend/src/modules/orders/orders.service.ts:355-364` et `:605-613`) appellent `emitNewOrder()` après le commit. `RealtimeService` précise que cet émetteur historique dépose l’outbox juste après le commit (`backend/src/modules/realtime/realtime.service.ts:277-291`), de manière asynchrone.

Si le processus s’arrête entre le commit de la commande payée et la première écriture d’outbox, aucune ligne ne permet de rejouer `new_order`. Le tableau opérateur peut finir par récupérer la commande au polling, mais les autres consommateurs temps réel ne bénéficient pas de cette réparation.

**À demander :** préparer l’annonce avant la transaction, la déposer via `realtimeService.deposer(tx, …)` dans la transaction de création, puis publier après commit. Appliquer la même règle à la commande issue de l’ardoise.

### P1 — Chaque nouvelle commande déclenche une lecture complète du tableau opérateur

Dans `apps/operator/src/hooks/useDashboard.ts:181-205`, chaque événement `new_order` lance immédiatement `loadSnapshot()`. L’endpoint recharge toutes les commandes encore actives, leurs articles et leurs catégories (`backend/src/modules/orders/orders.service.ts:1131-1205`). Il n’y a ni regroupement de rafale, ni requête unique en vol, ni protection contre une réponse ancienne qui arriverait après une réponse récente.

À titre d’ordre de grandeur : 2 000 commandes et quatre tableaux connectés peuvent provoquer jusqu’à 8 000 relectures REST pendant la rafale. Comme chaque réponse reprend la liste complète des commandes actives, le coût peut croître plus vite que le nombre de nouvelles commandes.

**À demander :** regrouper les événements reçus sur une courte fenêtre, empêcher les relectures simultanées et ignorer les snapshots périmés; à terme, transmettre une commande complète pour une mise à jour incrémentale et garder le polling comme réconciliation.

## Risques restants avant une montée en charge

### P2 — L’ordre de livraison de l’outbox n’est pas garanti entre plusieurs ouvriers

Chaque ouvrier réserve un lot pouvant atteindre 200 lignes, puis les émet hors de la requête SQL (`backend/src/modules/realtime/outbox.service.ts`). Avec plusieurs instances, l’une peut réserver les lignes les plus anciennes et l’autre les suivantes; la seconde peut terminer ses émissions avant la première. Le commentaire de l’outbox promet un ordre d’arrivée, mais le bail seul ne garantit pas cet ordre global entre lots concurrents.

**À vérifier/corriger :** déterminer si l’ordre par commande est une exigence. Si oui, sérialiser par clé de commande ou réduire la réservation à une stratégie préservant cet ordre. Ajouter un test avec deux ouvriers et deux événements ordonnés pour une même commande.

### P2 — Les consommateurs ne dédupliquent pas visiblement les événements rejoués

L’outbox documente une livraison « au moins une fois » : après une émission réussie suivie d’un échec de marquage, le même `eventId` peut être renvoyé. Le hook opérateur traite chaque `new_order` reçu comme une nouvelle notification (`useDashboard.ts:193-205`) et ne mémorise pas les `eventId` déjà traités. Une reprise peut donc sonner/afficher deux alertes pour la même commande, même si le snapshot REST ne duplique pas la commande.

**À demander :** conserver un petit ensemble borné d’identifiants récents côté client et ignorer les événements déjà appliqués; tester la reprise après succès d’émission puis échec du marquage.

### P2 — L’outbox récupère lentement un gros retard

Le worker reprend au plus 200 lignes par minute (`backend/src/modules/realtime/outbox.service.ts`). Une file de 10 000 événements demanderait environ 50 minutes avec une seule instance, hors nouveaux événements et échecs. Le plafond de dix tentatives abandonne certaines lignes; les événements abandonnés nécessitent une alerte et une procédure opérationnelle de reprise.

**À prévoir :** surveiller profondeur, âge de la ligne la plus ancienne et nombre d’abandons; définir des seuils d’alerte et une procédure de rediffusion.

### P2 — Les agrégats de confidentialité peuvent relire un grand historique

`PublicVenuesController.projeter` exécute deux `event.groupBy` sur les événements de tous les lieux sélectionnés (`backend/src/modules/venues/public-venues.controller.ts:293-311`) afin de masquer les lieux privés. La lecture des événements renvoyés est bornée, mais ces deux agrégats ne le sont volontairement pas. Le schéma n’a pas d’index général dédié à `events.venue_id`; l’index trouvé est partiel et ne vise que les contenants permanents.

Le guide de charge du dépôt rapporte une amélioration de débit après l’optimisation, mais je n’ai pas exécuté `EXPLAIN (ANALYZE, BUFFERS)` sur un jeu de données réaliste pour confirmer le coût résiduel des agrégats.

**À vérifier :** plan d’exécution sur une base de recette avec plusieurs saisons et des dizaines de lieux; ajouter l’index adapté si le plan confirme une lecture séquentielle coûteuse.

### P2 — Le banc ne mesure pas encore les inscriptions, paiements ou sockets

`backend/scripts/banc-de-charge/tirer.js` boucle uniquement sur `GET /public/venues`. Il ne reproduit ni inscription Argon2, ni login, ni panier, ni checkout Stripe, ni webhook, ni connexions WebSocket. Les chiffres présents ne prouvent donc pas une capacité de commandes.

La protection du tireur bloque certains noms connus de production par expression régulière, ce qui peut laisser passer un domaine de production personnalisé. `semer.js` crée directement des organisations, lieux et événements avec Prisma et n’a pas de garde de cible. Une mauvaise `DATABASE_URL` pourrait polluer une base réelle.

**À sécuriser avant usage par l’équipe :** imposer une cible explicitement autorisée et refuser toute base non jetable; compléter ensuite le banc avec des comptes et paiements de test, des rafales et plusieurs opérateurs.

### P2 — Limite par IP et panne Redis

Le plafond par défaut est de 30 000 requêtes par minute et par IP (`backend/src/common/securite/limitation.ts`). Une sortie Internet partagée par des dizaines de milliers de spectateurs peut dépasser ce plafond même si les utilisateurs sont répartis sur plusieurs lieux. Lorsque Redis est indisponible, le limiteur retombe en mémoire par instance; avec plusieurs répliques, la limite effective peut alors être multipliée par le nombre d’instances. Le code journalise cette dégradation.

**À mesurer :** appels réels par parcours et effet du NAT des stades; définir le comportement attendu quand Redis tombe et des limites séparées pour les routes sensibles.

### P2 — Capacité Railway inconnue depuis le dépôt

Le pool Prisma est plafonné à dix connexions par instance (`backend/src/database/pool.ts`). Dix répliques pourraient donc ouvrir environ cent connexions, avant les autres services, migrations et sauvegardes. Le plan PostgreSQL, sa limite de connexions, les ressources CPU/mémoire, le nombre maximal de répliques et l’autoscaling Railway ne figurent pas dans le dépôt audité.

Sans ces valeurs et sans test de charge sur la recette Railway, il n’est pas possible d’affirmer que 10 000 connexions ou commandes simultanées sont supportées.

## Drapeaux fonctionnels et intégration externe

Le dépôt implémente **Flaix**; je ne trouve pas de client ou contrat nommé **Flex** dans le code audité. Si Flex est un autre fournisseur, son intégration n’est pas vérifiable dans cette révision.

Les flags génériques (`FeatureFlagsService`) sont disponibles, mais le consommateur métier runtime repéré pour l’instant est principalement `app.split.enabled` dans le module d’ardoise. `activeFeatureFlags` est stocké sur les événements, sans consommation générale trouvée dans le parcours utilisateur. Ces flags ne constituent donc pas un interrupteur universel de tous les modules.

`flaixEnabled` est un champ distinct et son application reste incomplète aux étapes création, checkout, paiement déjà engagé et calendrier sans URL. Avant activation par lieu, ces quatre cas doivent partager une règle et des tests serveur.

## Scénarios de trafic : ce que l’audit permet de dire

Ces volumes sont des exemples de calcul, pas des mesures de Break Eat.

| Scénario illustratif | Débit moyen calculé | Ce que le dépôt prouve |
|---|---:|---|
| 2 000 spectateurs × 8 appels API en une minute | 267 requêtes/s | Le banc actuel ne mesure que la découverte; pas le parcours complet |
| 50 lieux × 1 000 spectateurs × 8 appels/minute | 6 667 requêtes/s agrégées | Aucun test exécuté ne démontre ce débit sur l’API et PostgreSQL |
| 10 000 commandes étalées sur 4 heures | 0,69 commande/s en moyenne | La moyenne masque les pics, les conflits de stock/créneaux et le travail opérateur |
| 2 000 commandes en une minute | 33 commandes/s | Pas de simulation de paiements concurrents ni de rafale de `new_order` |
| 50 000 connexions en même temps | 50 000 sockets potentielles | Pas de test de sockets à cette échelle ni de mesure Redis/Railway |

**Verdict capacité : non démontrée.** Les mesures de découverte déjà écrites dans le guide sont un point de départ limité. Elles ne permettent pas de promettre l’absence de panne à 10 000 ou 50 000 utilisateurs.

## Ordre recommandé pour Claude Code

1. Corriger les UUID de `outbox-concurrence.int-spec.ts`, puis obtenir un job d’intégration vert sur PostgreSQL 18 / Redis 7.
2. Définir et appliquer la règle Flaix/Break Eat au calendrier, à la création et au checkout; prévoir le traitement des PaymentIntents déjà engagés.
3. Rendre `new_order` atomique avec la création de commande dans les deux chemins.
4. Regrouper les rafraîchissements du tableau opérateur et dédupliquer les événements rejoués.
5. Tester l’ordre de l’outbox avec plusieurs ouvriers; mesurer et alerter sur la profondeur et l’âge des lignes.
6. Sécuriser le semis et le tireur, puis construire une recette de charge qui inclut inscriptions, commandes simulées, webhooks, sockets et plusieurs lieux.
7. Mesurer les requêtes PostgreSQL et confirmer les ressources/quotas Railway avant d’annoncer une capacité cible.

## Limites de cet audit

Les validations sont locales sur la révision indiquée, avec Node 24; je n’ai pas interrogé l’interface GitHub pour obtenir le statut du dernier run distant. Les tests locaux n’émulent pas Railway et ne garantissent ni disponibilité absolue ni capacité à un nombre précis d’utilisateurs. Les appels réels à Stripe/Flaix et une campagne de charge production-like restent à vérifier sur une recette isolée.
