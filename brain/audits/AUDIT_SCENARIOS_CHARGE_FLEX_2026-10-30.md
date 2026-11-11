# Audit de vérification et scénarios de charge — Break Eat

**Date :** 30 octobre 2026  
**Branche :** `main`  
**Révision locale et distante :** `14f831ac51c679856f9f5a8627a03e4f687a542e`  
**État Git :** `main` suit `origin/main` au commit indiqué, mais le répertoire de travail contient aussi des modifications non poussées dans `backend/src/modules/venues/public-venues.controller.ts` et son test. Ces deux changements sont apparus pendant l’audit et ne font pas partie du commit distant. Les scripts `backend/scripts/banc-de-charge/` sont également non suivis par Git.  
**Périmètre :** vérification des correctifs récents, parcours lieu/événement, relais externe appelé « Flex » dans la demande (le dépôt nomme son intégration existante « Flaix »), commandes, temps réel, limitations et capacité.  
**Codex n’a modifié aucun code produit.**

## Verdict

Les corrections de limitation IP et d’accès WebSocket sont bien présentes. Le typecheck passe aussi sur le répertoire de travail actuel. Les 7 suites ciblées passent maintenant, après la mise à jour du faux Prisma utilisé par le test des lieux.

Je ne peux cependant pas confirmer que Break Eat supporte **2 000 commandes simultanées**, **50 lieux**, ou **50 000 utilisateurs**. Le dépôt ne contient pas de test de charge qui réalise des inscriptions et commandes réelles. Le banc de charge local présent dans le dossier ne fait que répéter des requêtes de découverte des lieux.

Plusieurs points doivent être traités avant de présenter le système comme prêt pour cette charge :

1. La création d’une commande n’écrit toujours pas son événement `new_order` dans la transaction qui crée la commande.
2. Le tableau opérateur relance une lecture complète du tableau à chaque nouvelle commande; plusieurs écrans multiplient cette charge et des réponses peuvent revenir dans le désordre.
3. Les flags actuels ne désactivent pas de façon autoritaire la création d’une commande Break Eat côté serveur. Le flag Flaix agit surtout sur le parcours visible dans l’application.
4. Un lieu ne désigne qu’un seul événement commandable à la fois. En cas d’événements simultanés, le code choisit le premier; les autres peuvent apparaître dans le calendrier sans bouton de commande.
5. Le verrouillage de l’outbox avec `SKIP LOCKED` ne réserve pas durablement les lignes jusqu’à leur émission. Plusieurs répliques peuvent encore rejouer la même ligne.

**Conclusion de capacité :** la CI que tu indiques verte correspond au commit distant; la modification locale de découverte des lieux n’y est pas incluse et son test échoue ici. Même une CI entièrement verte ne démontre pas les performances ni la tenue de ces scénarios de pointe. Une campagne de charge sur une recette représentative est nécessaire avant de promettre ces volumes.

## Vérifications exécutées

| Vérification locale | Résultat |
|---|---|
| `pnpm turbo typecheck --concurrency=1` | Réussi — 5 tâches |
| Tests ciblés sécurité, commandes et temps réel | Réussi — 4 suites, 111 tests |
| Tests ciblés des règles de calendrier | Réussi — 2 suites, 38 tests |
| Tests ciblés des lieux, du calendrier, sécurité, commandes et temps réel | Réussi — 7 suites, 173 tests |
| Run GitHub Actions exact | Non consulté depuis cet environnement; la réussite des CI est rapportée par le propriétaire du dépôt et porte sur le commit distant |
| Test de charge | Non lancé; les scripts actuels ne testent pas le parcours de commande et les scripts de semis écrivent en base |

Le workflow GitHub contient des tâches de lint, typecheck, tests, intégration avec PostgreSQL 18 et Redis 7, export web et build. Le job d’intégration ne contient pas de test de concurrence de l’outbox, ni de simulation de dizaines de milliers de clients actifs. Les modifications du contrôleur et de son test restent non poussées; les contrôles locaux les couvrent désormais, mais le run GitHub vert du commit distant ne les valide pas.

## Suivi des constats précédents

### Corrigés ou améliorés

- **Limitation IP auparavant à 600 requêtes/minute : corrigée.** La limite par IP est maintenant de 30 000 par minute par défaut, configurable avec `LIMITE_IP_PAR_MINUTE`. Le proxy est configuré dans `backend/src/main.ts` pour récupérer l’adresse client. Les tests de la limite passent.
- **Course sur le plafond de salons WebSocket : corrigée.** Le code réserve une place avant d’attendre la vérification asynchrone et la libère ensuite. Le plafond concurrent ne devrait donc plus être dépassé par plusieurs demandes simultanées.
- **Accès WebSocket non révoqué après retrait d’un rôle : amélioré.** Une tâche périodique vérifie les salons révocables et sort les sockets devenues non autorisées. Le délai de prise en compte est d’au plus environ une minute, pas immédiat.
- **Événements de transition de commande : corrigés en partie.** Les notifications `order_updated` et `order_ready` sont déposées dans l’outbox dans la transaction qui modifie la commande.
- **TypeScript et tests ciblés des points modifiés : passent localement.**

### Partiellement corrigés ou encore ouverts

#### P1 — `new_order` n’est pas atomique avec la création de commande

Dans `backend/src/modules/orders/orders.service.ts:355-364` et `:605-613`, les deux chemins de création appellent `emitNewOrder()` après le commit. Cette méthode lance ensuite le dépôt de l’événement dans l’outbox de façon asynchrone via `backend/src/modules/realtime/realtime.service.ts:169-185`.

**Scénario :** la commande et le paiement sont validés en base; le processus tombe avant la première écriture de l’outbox. La commande existe, mais aucun événement ne permet de prévenir le comptoir ou de rejouer l’annonce.

**À faire :** préparer puis déposer `new_order` dans la même transaction que chaque création, y compris la commande issue d’une ardoise. Publier l’événement après commit à partir de la ligne déjà créée.

#### P1 — Le tableau opérateur amplifie chaque rafale de commandes

Dans `apps/operator/src/hooks/useDashboard.ts:181-205`, chaque événement Socket.IO `new_order` appelle immédiatement `loadSnapshot()`. Cette fonction fait un appel REST complet à `/orders/event/:eventId/dashboard`; le serveur recharge les commandes actives, leurs lignes et les catégories dans `backend/src/modules/orders/orders.service.ts:1131-1205`.

Il n’y a pas de regroupement des événements, de limitation à une requête en vol, ni de contrôle pour empêcher une ancienne réponse d’écraser une réponse plus récente.

**Scénario indicatif :** 2 000 nouvelles commandes pour la même buvette et 4 écrans opérateur abonnés peuvent déclencher jusqu’à environ **8 000 lectures REST du tableau**. Chaque lecture recharge l’ensemble des commandes encore actives. Les réponses peuvent se croiser et laisser temporairement un tableau plus ancien affiché.

**À faire :** regrouper les événements rapprochés, ne conserver qu’une resynchronisation en vol, ignorer les réponses périmées, ou envoyer dans l’événement les données nécessaires à l’ajout incrémental d’une commande. Garder une resynchronisation REST périodique comme filet de sécurité.

#### P1 — Le drapeau de prise en charge externe ne ferme pas le chemin serveur Break Eat

Dans ce dépôt, le drapeau de lieu est nommé `flaixEnabled`. Il intervient dans la construction de la réponse publique du lieu et le parcours mobile. Je n’ai pas trouvé de vérification équivalente dans les services de panier, paiement ou création de commande.

Les flags génériques sont résolus notamment dans `backend/src/modules/order-splits/order-splits.service.ts` pour `app.split.enabled`. Ils ne contrôlent pas le parcours mobile complet ni la création de commandes. Le champ `activeFeatureFlags` des événements est enregistré, mais je n’ai pas trouvé de consommation runtime générale.

De plus, `apps/mobile/src/lib/ouverture-lieu.ts` retombe sur le parcours Break Eat lorsqu’un lieu Flaix est activé mais n’a ni lien Flaix courant ni ouverture à venir. C’est un comportement de secours, pas un interrupteur qui garantit « aucune commande Break Eat ».

**Conséquence :** masquer ou rediriger le bouton dans l’application ne bloque pas un ancien client, une requête directe ou un appel API qui atteint encore le backend.

**À faire avant le basculement :** ajouter un mode de commande contrôlé côté serveur, par lieu ou événement, et le vérifier dans les opérations qui créent/paient une commande. Définir explicitement les états `BREAK_EAT`, `FLEX/FLAIX` et `FERMÉ`, ainsi que le comportement si l’URL externe manque ou échoue. Ne pas traiter le seul affichage mobile comme une protection.

**Nom de l’intégration :** le code observé contient Flaix, pas Flex. Si Flex est un autre produit, son intégration et son contrat API ne sont pas présents dans ce dépôt.

#### P1 — Le calendrier permet de choisir un événement, mais un seul est commandable

La page lieu choisit par défaut l’événement ouvert, puis le prochain dans `apps/mobile/src/screens/saison.screen.tsx:122-141`. C’est cohérent pour un lieu avec une seule rencontre à la fois.

En revanche, `backend/src/common/helpers/fenetre-commande.ts:223-248` ne renvoie qu’un seul événement ouvert. Si plusieurs événements Flaix se chevauchent, le code prend celui qui a commencé le plus tôt. Pour le parcours Break Eat, `backend/src/modules/venues/public-venues.controller.ts` fournit aussi un seul `currentEventId`. La carte de la saison peut montrer les autres événements, mais ils ne sont pas marqués comme commandables. Le bouton ouvre en outre le lien courant du lieu, plutôt qu’une destination résolue à partir de l’événement sélectionné.

**Conséquence :** le scénario « plusieurs sports/événements actifs dans un même lieu, le spectateur choisit celui du jour » n’est pas couvert par la règle actuelle.

**À faire :** résoudre le mode et la destination de commande à partir du couple lieu + événement sélectionné; permettre plusieurs événements ouverts quand le métier l’exige; vérifier côté serveur que la destination est autorisée pour cet événement.

#### P1 — Le verrouillage outbox ne couvre pas la phase d’émission

`backend/src/modules/realtime/outbox.service.ts:149-171` fait un `UPDATE … FOR UPDATE SKIP LOCKED`, puis la requête se termine avant l’émission et le marquage livré, effectués ensuite.

Le verrou PostgreSQL protège le temps de cette requête seulement. Une fois celle-ci terminée, la ligne reste non livrée et peut être reprise par une autre réplique avant que le premier ouvrier ne la marque. `attempts` est incrémenté, mais ne réserve pas durablement la ligne.

Le test `outbox.service.spec.ts` vérifie que le SQL contient `SKIP LOCKED`; il ne lance pas deux ouvriers contre une vraie base. Le job d’intégration CI ne contient pas de scénario outbox.

**Risques :** annonces en double, tentatives consommées trop rapidement, et ordre des événements perturbé.

**À faire :** ajouter un état de réservation et un bail récupérable après panne (ou mécanisme équivalent), puis tester deux ouvriers concurrents sur PostgreSQL réel et Redis. Vérifier aussi la déduplication côté opérateur.

#### P2 — Le rattrapage de l’outbox reste lent en cas de panne prolongée

L’ouvrier traite au plus 200 lignes par passage et passe toutes les minutes (`outbox.service.ts:47, 56, 121`). Un retard de 10 000 lignes demande au minimum environ **50 minutes avec un seul ouvrier**, si toutes les émissions réussissent et sans autre événement entrant. Les lignes échouées sont abandonnées après dix essais et restent non livrées; surveiller les erreurs et prévoir une procédure de reprise.

Ce rythme est acceptable comme filet de secours uniquement si la diffusion immédiate fonctionne normalement et si un retard d’environ une minute en cas d’incident est acceptable. Il ne remplace pas une file adaptée à une panne longue.

#### P2 — L’optimisation locale de découverte des lieux reste à confirmer sur une base réelle

Une modification non poussée de `backend/src/modules/venues/public-venues.controller.ts` ajoute une fenêtre de lecture de 150 jours et deux agrégations `event.groupBy` pour préserver le masquage des lieux privés. C’est une amélioration de la quantité d’événements ramenée par la requête. Le test correspondant a d’abord échoué, puis est passé après la mise à jour de son mock.

Le premier rejeu du test a échoué sur 24 cas, car le nouveau mock traitait la promesse de `venue.findMany` comme un tableau. Le mock a ensuite été modifié pour attendre cette promesse; le rejeu final des 7 suites et 173 tests passe. Ce changement n’est toutefois pas encore sur `origin/main`, et les mocks unitaires ne prouvent pas le plan ni le coût des requêtes sur PostgreSQL réel.

#### P2 — La nouvelle borne de saison est figée au démarrage et son agrégation reste à mesurer

`borneDeSaison()` est appelée dans l’objet constant `SELECTION_LIEU` (`public-venues.controller.ts:43-45, 91-94`). Malgré le commentaire indiquant une borne calculée à chaque appel, la date est donc calculée une seule fois au chargement du module. Sur un processus Railway qui reste actif plusieurs mois, la fenêtre dérive et remonte progressivement plus loin que 150 jours. Le seuil de 150 jours peut également exclure le dernier événement de la saison précédente si celle-ci est terminée depuis plus de cinq mois.

Les deux `groupBy` de `public-venues.controller.ts:275-293` comptent toujours les événements de toute l’histoire à chaque requête afin de préserver la confidentialité. Je n’ai pas trouvé d’index général sur `events.venue_id` dans le schéma ou les migrations; l’index trouvé sur cette colonne ne couvre que les contenants permanents. Le résultat renvoie peu de groupes, mais le nombre de lignes inspectées peut rester élevé. Il faut vérifier le plan PostgreSQL et le temps de requête avec un historique réaliste; l’ajout d’un index `(venue_id, start_at)` ou équivalent est à évaluer.

Les mesures de 24 requêtes/s et 7 secondes de médiane citées dans les commentaires du changement n’ont pas été reproduites pendant cet audit. Le script disponible ne charge que `GET /public/venues`, et les scripts sont non suivis par Git.

#### P2 — Le quota IP peut encore refuser une foule derrière une adresse partagée

Le nouveau plafond de 30 000 requêtes/minute corrige le seuil antérieur de 600. Il reste un plafond **par IP**. Si 50 000 spectateurs arrivent par la même IP de sortie et font au moins une requête dans la même minute, jusqu’à 20 000 requêtes peuvent être refusées. À 2 000 spectateurs, 8 appels chacun dans la minute représentent 16 000 appels/minute, sous ce plafond; 16 appels chacun représentent 32 000, au-dessus.

À 50 lieux avec des IP distinctes, la répartition aide le quota par IP, mais l’API et la base doivent toujours absorber le débit agrégé.

La valeur d’environnement est lue au chargement du module (`limitation.ts:93-105`); elle n’est pas modifiable dans le processus sans redémarrage.

#### P2 — Le banc de charge présent ne mesure pas les inscriptions ou les commandes

Les fichiers `backend/scripts/banc-de-charge/tirer.js` et `semer.js` sont actuellement **non suivis par Git**; ils ne font donc pas partie de la révision distante ni de la CI.

`tirer.js` appelle uniquement `GET /public/venues`, en boucle. Il ne crée pas de comptes, ne fait pas de login, ne crée pas de panier, ne passe pas de paiement, ne déclenche pas les webhooks Stripe et n’ouvre pas de sockets opérateur. Ses chiffres ne permettent pas de conclure sur les commandes simultanées.

La protection de `tirer.js` bloque certains noms connus de production, mais une adresse de production personnalisée pourrait contourner cette vérification. `semer.js` accepte n’importe quelle `DATABASE_URL` et écrit des organisations, lieux et événements sans contrôle d’environnement. Ne pas le lancer avant d’avoir sécurisé la cible et vérifié la base utilisée.

**À faire :** rendre la recette explicitement autorisée (liste d’hôtes de recette, blocage production fiable), ajouter une remise à zéro dédiée et construire des scénarios réels avec des comptes et paiements de test.

#### P2 — Les inscriptions simultanées ne sont pas benchmarkées

Une inscription exécute une recherche en base, un hachage Argon2 puis une insertion (`backend/src/modules/users/users.service.ts:55-79`). Argon2 consomme des ressources processeur et mémoire. Une arrivée massive de nouveaux utilisateurs peut donc ralentir les commandes si tout tourne sur les mêmes instances API.

Le code et les tests actuels ne démontrent pas le débit de 2 000 ou 50 000 inscriptions rapprochées.

**À mesurer :** inscription, connexion, récupération de session et arrivée dans un événement, avec les paramètres de hachage réels et les ressources Railway réelles.

#### Infrastructure à dimensionner — Pool PostgreSQL

`backend/src/database/pool.ts` fixe un maximum par défaut de 10 connexions par instance. Cinq répliques peuvent donc ouvrir environ 50 connexions, dix environ 100, auxquelles s’ajoutent les autres clients éventuels. Le plafond exact de la base Railway et le nombre de répliques disponibles ne sont pas visibles dans le dépôt. La capacité ne peut pas être confirmée sans ces paramètres.

#### Point ancien vérifié — Healthcheck Railway

`railway.json` conserve `/health`, tandis que `/ready` existe. Le code documente ce choix : les migrations passent avant le démarrage de l’API, et `/health` sert de test de vie. Le script `backend/scripts/migrer.sh` échoue au déploiement sur les erreurs de migration autres que P1001 et réessaie lorsque PostgreSQL est momentanément injoignable. Je classe donc le choix actuel comme **intentionnel**, pas comme un bug confirmé. Il reste utile de surveiller le résultat des migrations et l’état réel de la base après déploiement.

## Scénarios de charge à éprouver

Les calculs suivants sont des **hypothèses de trafic**, pas des mesures observées.

| Scénario | Charge illustrative | Lecture du code et risque |
|---|---:|---|
| Coup d’envoi dans un stade | 2 000 clients × 8 appels API en une minute = 16 000 appels/minute, soit environ 267 req/s sur la minute | Sous la limite par IP de 30 000 si le trafic est réparti sur toute la minute. Une arrivée concentrée sur quelques secondes produit un débit instantané beaucoup plus élevé. |
| Vingt à cinquante stades | 50 lieux × 1 000 clients; à 8 appels/minute chacun = 400 000 appels/minute, environ 6 667 req/s agrégées | Chaque lieu peut être sous son quota IP, mais l’API, PostgreSQL et Redis voient le trafic cumulé. Aucune mesure locale ou CI ne prouve ce débit. |
| Dix mille commandes sur une soirée de quatre heures | Moyenne de 0,69 commande/s; si 10 000 commandes arrivent dans une minute : environ 167/s | La moyenne de la soirée est trompeuse. Les transactions se disputent aussi les stocks, les créneaux et le compteur journalier du lieu. Il faut mesurer les pics et les conflits réels. |
| Deux mille commandes en une minute dans un stade | Environ 33 commandes/s pendant cette minute; en dix secondes, 200/s | Les deux chemins d’émission `new_order` ne sont pas atomiques avec la création. Les écrans opérateur rechargent le tableau à chaque événement. |
| Plusieurs événements simultanés dans un stade | Plusieurs rencontres ou activités ouvertes sur le même lieu | Le code ne donne qu’un événement commandable à la fois; le choix du spectateur n’est pas encore la source de vérité pour l’URL de commande. |
| Inscription collective | 2 000 puis 50 000 créations de comptes | Argon2 et la base sont impliqués. Le banc présent ne teste aucun de ces chemins. |

### Campagne de recette conseillée

Avant la production, lancer sur une recette isolée, avec un jeu de données ressemblant à l’exploitation :

1. 1 lieu puis 20, 30 et 50 lieux; plusieurs événements actifs par lieu et au moins trois saisons d’historique.
2. Montée progressive d’utilisateurs connectés, puis arrivée en rafale; tester également une IP commune de stade.
3. Tester séparément 2 000 commandes payées en quelques minutes et une rafale plus courte, avec Stripe en mode test ou un simulateur de webhook idempotent.
4. Répartir les commandes sur plusieurs lieux, puis concentrer un lot sur une même buvette, les mêmes produits et les mêmes créneaux pour révéler les verrous.
5. Connecter plusieurs tableaux opérateur par buvette et vérifier que le nombre de lectures REST ne croît pas comme « commandes × écrans ».
6. Mesurer p50/p95/p99, taux 429/5xx, temps de connexion et attente du pool PostgreSQL, CPU/mémoire API, Redis, nombre de sockets, retard et profondeur de l’outbox.
7. Simuler arrêt d’une réplique après commit, Redis indisponible, redémarrage de l’ouvrier et deux ouvriers d’outbox en concurrence.
8. Établir des seuils d’acceptation avant le test et conserver les métriques et la révision exacte testée.

Ne lancer aucune campagne de charge ou de semis sur la production.

## Liste de reprise priorisée pour Claude Code

1. **P1 — Sécuriser le mode de commande côté serveur.** Un mode Flex/Flaix par événement ou lieu doit refuser les créations Break Eat même avec un ancien client ou un appel direct. Définir le secours lorsque l’intégration est indisponible.
2. **P1 — Rendre atomique l’annonce de création.** Déposer `new_order` dans la transaction de création pour la commande Stripe et la commande issue d’une ardoise.
3. **P1 — Éviter les resynchronisations opérateur en rafale.** Regrouper les événements, coalescer les requêtes et ignorer les réponses anciennes.
4. **P1 — Faire de l’événement choisi la source de vérité.** Prendre en charge plusieurs événements commandables simultanément et résoudre une destination dédiée pour le lieu + événement.
5. **P1 — Réserver durablement les lignes d’outbox.** Ajouter un bail de réservation récupérable et une intégration réelle à deux ouvriers.
6. **P2 — Vérifier l’optimisation publique sur PostgreSQL réel.** Rendre la borne dynamique, analyser les deux agrégations, puis ajouter les index nécessaires selon les plans observés.
7. **P2 — Transformer les scripts locaux en banc sûr et représentatif.** Bloquer la production par configuration, créer les parcours d’inscription/commande et ajouter leur exécution sur une recette.
8. **P2 — Mesurer les limites Railway réelles.** Documenter la taille du plan PostgreSQL, la limite de connexions, les ressources API, Redis et la règle d’autoscaling.
9. **P2 — Définir le comportement des limites sous NAT partagé.** Mesurer les vrais appels par parcours et compléter le quota IP par des limites adaptées aux routes sensibles.

## Conclusion à transmettre

Les correctifs récents sont réels, et les vérifications ciblées passent sur l’état local actuel : typecheck, 7 suites et 173 tests. La modification locale du contrôleur des lieux reste non poussée et ses agrégations ne sont pas mesurées sur une vraie base. Rien de cela ne garantit l’absence de panne avec 10 000 utilisateurs simultanés. Les risques les plus directs restent la perte possible d’une annonce de nouvelle commande lors d’un arrêt, la multiplication des lectures complètes du tableau opérateur, la bascule Flex/Flaix qui n’est pas appliquée au serveur de commande, et l’absence de sélection commandable pour plusieurs événements simultanés d’un même lieu.

La prochaine étape utile est de corriger les P1 de ce rapport, puis de mesurer les parcours complets sur une recette dimensionnée comme Railway. La CI actuelle reste indispensable pour la correction fonctionnelle, mais elle ne constitue pas un test de capacité.

