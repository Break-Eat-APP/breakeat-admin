# Audit chirurgical complet — Break Eat V3

**Date :** 30–31 octobre 2026  
**Révision source auditée :** `main`, `7c52fe9077174ecfc27dc6731ef3f8fa8a68ee48`  
**Périmètre :** parcours client mobile/web, inscriptions et profils, téléphone/SMS, accès multi-organisations/lieux/événements, paniers, commandes, paiement, stock et créneaux, intégration Flaix, flags et réglages, temps réel, migrations, Railway, CI et dépendances.  
**État du dépôt au départ :** aucune modification de code présente; seul le rapport V2 précédent était déjà non suivi par Git.  
**Modifications applicatives pendant cet audit :** aucune.

## Verdict exécutif

Le code possède une base multi-lieux sérieuse côté serveur : les lieux contiennent leurs événements, les événements leurs stands, et plusieurs routes vérifient que le stand, le point de retrait, le match et le lieu correspondent. Les correctifs récents sur le mode Flaix et l’outbox sont également présents.

**L’application ne prend pas en charge l’inscription ou la connexion par SMS/téléphone.** Aujourd’hui, un compte standard se crée avec e-mail et mot de passe; Apple et Google sont également proposés. Le numéro est une donnée de profil/contact, non vérifiée et non unique. Si l’inscription par SMS est une exigence, cette fonctionnalité n’est pas prête à être annoncée.

J’ai relevé plusieurs défauts qui peuvent faire perdre ou altérer une commande pendant une reprise ou un pic : une nouvelle tentative mobile peut ajouter une seconde fois les lignes du même panier; le stock n’est pas réservé avant paiement; un créneau complet est ignoré après encaissement; et un client non connecté peut ouvrir un lien Flaix avec des champs d’identité non remplacés. Les flags globaux ont aussi un problème d’unicité en base, et les flags par lieu ne sont pas tous respectés par l’interface.

**Conclusion capacité :** les contrôles existants et les anciens bancs ne prouvent toujours pas la tenue de 5 000 paiements simultanés ou de 50 000 connexions. Je ne recommande pas d’utiliser ces chiffres comme garantie de lancement multi-stades.

## Vérifications et limites

| Élément | Résultat |
|---|---|
| Source | Même commit que l’audit V2 du 30/10; aucun commit source plus récent dans ce checkout |
| TypeScript, lint et tests unitaires | La dernière exécution connue sur ce même commit dans l’audit V2 avait réussi. Je ne l’ai pas relancée dans cette reprise. |
| Tests d’intégration PostgreSQL/Redis | Résultat précédent non certifié; aucun nouveau bilan CI distant obtenu ici |
| Build actuel | Non relancé dans cette reprise |
| `pnpm audit --prod --recursive` | 85 alertes dans le graphe de dépendances de production du workspace : 56 high, 25 moderate, 4 low, 0 critical |
| Modifications | Aucun fichier applicatif changé; ce rapport est le seul nouveau livrable |

Le scan de dépendances rattache les alertes high aux graphes des applications mobile, admin, back-office et opérateur; je n’ai pas trouvé de chemin high dans le paquet backend dans la sortie filtrée. Une alerte de dépendance n’établit pas à elle seule qu’une route donnée est exploitable : il faut vérifier le chemin, la fonction effectivement utilisée et la version publiée. Le scan montre toutefois que les overrides actuels ne corrigent pas toutes les plages; par exemple, l’override `brace-expansion` ne vise que certaines versions 2.x alors que le scan relève aussi des versions 1.x et 4.x vulnérables.

## Constats P1 — À traiter avant de compter sur ces parcours

### P1 — Le téléphone/SMS n’est pas une méthode de connexion

`apps/mobile/src/screens/login.screen.tsx` exige une adresse e-mail et un mot de passe. Le champ téléphone est envoyé comme profil de contact. Le DTO serveur `RegisterDto` exige un e-mail et un mot de passe, et déclare le téléphone facultatif. Les routes disponibles sont l’inscription e-mail/mot de passe, la connexion e-mail/mot de passe et la connexion sociale Apple/Google; aucune route OTP, aucun envoi de code SMS et aucun fournisseur SMS n’ont été trouvés.

Le modèle utilisateur n’a ni `phoneVerifiedAt` ni contrainte unique sur `phone`. Le numéro peut donc être faux, réutilisé par plusieurs comptes ou saisi dans plusieurs formats. Il ne peut pas servir d’identifiant fiable pour une connexion téléphonique, une récupération de compte ou une attribution d’identité.

**Impact :** un client qui s’attend à recevoir un code SMS ne peut pas s’inscrire ou se connecter par ce moyen. Une simple saisie de numéro ne prouve pas que le client le contrôle.

**À faire si le SMS est requis :** ajouter un vrai flux d’envoi et de validation OTP avec durée de vie courte, limites par numéro/IP, protection contre les renvois, stockage haché des codes, normalisation E.164 et tests de réutilisation/expiration. Décider si le téléphone devient unique après vérification. Ne jamais traiter le numéro actuellement saisi comme une identité vérifiée.

### P1 — Une nouvelle tentative de paiement peut doubler les lignes du panier

Dans `apps/mobile/src/screens/checkout.screen.tsx`, chaque appel de `handleOrder` fait `POST /carts`, puis renvoie chaque ligne locale par `apiAddCartItem`. Le serveur réutilise un panier existant encore `OPEN` (`CartService.create`), tandis que `CartService.addItem` additionne la quantité avec `quantity: { increment: dto.quantity }`.

Si le serveur a déjà reçu les articles mais que l’étape suivante échoue — par exemple ouverture Stripe, application des points, réseau ou partage d’addition — le panier reste ouvert et la page permet une nouvelle tentative. Celle-ci renvoie les mêmes quantités et les additionne une seconde fois. Le montant affiché dans le panier local peut alors ne plus correspondre au panier serveur ni au montant Stripe. Le même motif existe dans `CartScreen.handlePartagerAddition`.

**Impact :** le client peut payer plus d’articles que ceux qu’il avait sélectionnés, dépasser le stock ou recevoir une erreur Stripe d’idempotence parce que le montant a changé pour la même clé de paiement.

**À faire :** synchroniser un état désiré de façon idempotente (quantités absolues, clé d’opération, ou remplacement contrôlé du contenu) et relire l’état serveur avant d’afficher le total. Ajouter un scénario où la première tentative échoue après l’ajout des articles, puis vérifier que le retry ne change ni quantités ni total.

### P1 — Le stock est contrôlé, mais jamais réservé avant paiement

Le checkout relit le stock avant Stripe (`backend/src/modules/cart/cart.service.ts`, `verifierStockDisponible`). Cette lecture n’empêche aucun autre panier de lire la même quantité. Après confirmation Stripe, `OrdersService.decrementerStock` décrémente de façon conditionnelle; si la quantité manque, le code met le stock à zéro et crée tout de même la commande, car l’argent est déjà encaissé.

Deux requêtes simultanées d’ajout dans le même panier ont aussi une course : chacune peut lire l’ancienne quantité, passer la vérification, puis l’upsert incrémenter la ligne au-delà du stock. Les tests actuels du stock couvrent des opérations séquentielles, pas ces courses ni plusieurs paiements sur la dernière unité.

**Impact :** des commandes payées peuvent dépasser l’inventaire réellement disponible; le comptoir devra substituer ou rembourser des articles.

**À faire :** créer une réservation d’inventaire atomique et idempotente avant Stripe, avec expiration, libération sur paiement échoué/abandonné et consommation au webhook. Appliquer la même règle aux commandes partagées et gérer les ajouts concurrents par opération atomique.

### P1 — Un créneau saturé peut disparaître de la commande après encaissement

Le comptage de capacité d’un créneau est protégé par une incrémentation conditionnelle (`SlotsService.assignOrderToSlot`). Mais l’affectation arrive au moment de créer la commande, donc après paiement. En cas de créneau plein, `OrdersService` attrape l’erreur et conserve la commande sans `slotId`.

**Impact :** des clients peuvent payer après avoir choisi un créneau alors que l’affectation a échoué. En cas de rafale sur un même horaire, ils perdent l’heure qu’ils pensaient avoir réservée.

**À faire :** réserver la place avant paiement, la confirmer ou la libérer ensuite; si le produit accepte une commande sans créneau, l’indiquer explicitement avant l’encaissement et donner au comptoir une file de rattrapage.

### P1 — Un client non connecté peut ouvrir un lien Flaix avec ses étiquettes brutes

La route publique de destination Flaix personnalise le lien uniquement si elle reçoit un utilisateur authentifié (`public-venues.controller.ts`, destination de commande). Dans `apps/mobile/src/screens/saison.screen.tsx`, lorsque `attendIdentite` est vrai, l’application appelle `apiMonProfil()`, mais intercepte toute erreur et poursuit quand même vers `ouvrirFlaix(destination.url)`.

Pour un visiteur sans session, le serveur n’a pas remplacé `[#phone]`, `[#firstname]` ou les autres étiquettes; après l’échec de `apiMonProfil`, l’app ouvre tout de même cette URL brute. Le bouton Flaix est accessible depuis l’écran public, sans demande obligatoire de connexion.

**Impact :** le parcours de commande Flaix peut s’ouvrir avec des paramètres littéraux au lieu de l’identité du client, et le supporter peut échouer ou être mal identifié chez le partenaire.

**À faire :** quand le lien exige une identité et qu’il n’y a pas de session, demander la connexion/l’inscription avec reprise de l’événement, puis redemander la destination au serveur. Ne jamais ouvrir une URL contenant encore une étiquette `[#…]`.

### P1 — L’unicité des flags globaux n’est pas garantie par PostgreSQL

`FeatureFlag.scopeId` est nullable et les flags ont `@@unique([key, scope, scopeId])`; la migration SQL crée la même contrainte. Les réglages globaux `AppSetting` utilisent exactement le même schéma. Dans PostgreSQL, une contrainte `UNIQUE` considère par défaut deux `NULL` comme distincts : deux lignes `GLOBAL` de même clé et `scope_id IS NULL` peuvent donc coexister. Le setter utilise `upsert` sur cette clé nullable; les lecteurs utilisent ensuite `findFirst` sans ordre déterministe.

**Impact :** des écritures concurrentes peuvent créer plusieurs lignes pour un même flag/réglage global. La valeur relue peut ne pas être celle attendue; un interrupteur global ne doit pas être utilisé comme kill switch tant que l’unicité n’est pas garantie.

**À faire :** migrer vers une unicité qui traite les `NULL` comme identiques (PostgreSQL `UNIQUE NULLS NOT DISTINCT`) ou vers des index uniques partiels séparant `GLOBAL` des portées non nulles. Dédupliquer les données existantes avant la migration et tester deux `set()` simultanés sur une base réelle. Même correction pour `app_settings`. [Documentation PostgreSQL sur les contraintes uniques](https://www.postgresql.org/docs/18/ddl-constraints.html).

## Constats P2 — Fiabilité, expérience multi-lieux et préparation

### P2 — Les flags par événement/organisation peuvent être masqués dans l’interface

Le seul consommateur métier général de `FeatureFlagsService` trouvé est `app.split.enabled` dans `OrderSplitsService`. Le serveur sait résoudre une portée événement puis organisation puis globale. Mais le client appelle `GET /public/order-splits/enabled` sans `eventId` et le contrôleur appelle `estActive()` sans contexte. Un flag activé pour un événement ou une organisation peut donc autoriser le serveur tout en laissant le bouton « Partager l’addition » caché dans l’application.

Les champs `Event.activeFeatureFlags` sont écrits par les endpoints événement, mais aucun consommateur général n’a été trouvé. `flaixEnabled` est un réglage distinct du lieu, et ne désactive pas automatiquement les autres modules.

**À faire :** résoudre le flag avec le contexte du panier/événement dans l’API d’affichage et établir une table explicite des modules réellement branchés à un flag. Les flags stockés mais non lus ne sont pas des interrupteurs fonctionnels.

### P2 — Le panier client est unique en mémoire et s’efface au changement d’événement

`apps/mobile/src/store/cart.store.ts` utilise un seul état Zustand non persisté pour tous les lieux. `EventHomeScreen` appelle `resetCart()` lorsque l’événement est chargé; chaque sélection de stand réinitialise aussi ce même état. Le panier serveur n’est créé que plus tard, au checkout ou au partage de l’addition.

**Impact :** naviguer vers un autre lieu pendant la composition efface le panier local. Si un panier serveur ouvert existe après une tentative précédente, l’écran ne le recharge pas comme source d’affichage : l’état local peut diverger des articles déjà enregistrés.

**À faire :** décider si un client peut garder un panier par événement/stand. Si oui, indexer l’état local par lieu/événement/stand et le restaurer depuis l’API; sinon, avertir avant de jeter le panier. À minima, synchroniser le panier serveur avant de permettre la navigation.

### P2 — Téléphone non normalisé, règle de validation trop permissive

Le formulaire mobile et les DTO serveur n’ont pas la même borne minimale : le client exige 9 caractères, le serveur 7. La regex autorise uniquement des caractères de ponctuation sans aucun chiffre (par exemple neuf tirets) et le serveur stocke le texte après simple `trim()`. Aucun format E.164 n’est imposé et le téléphone n’est pas unique. Des variantes comme `06 12…`, `+33 6 12…` et `0033 6 12…` ne sont pas rapprochées.

**Impact :** un numéro inutilisable peut être enregistré; les liens Flaix reçoivent une valeur dont le format varie et l’application ne peut pas identifier sans ambiguïté un même client par téléphone.

**À faire :** utiliser un parseur de numéros international, un pays par défaut visible, une normalisation E.164 commune client/serveur et une vérification SMS si le numéro doit prouver l’identité. Ajouter des tests pour numéros français, étrangers, espaces, indicatifs et entrées sans chiffre.

### P2 — La récupération du mot de passe n’est pas disponible

Le lien « Mot de passe oublié ? » affiche seulement l’alerte « Réinitialisation du mot de passe à venir ». Un client qui perd son mot de passe ne peut pas récupérer son compte depuis l’application.

**À faire :** livrer une récupération sécurisée avec jeton à usage unique, expiration, limitation des demandes et réponse qui ne révèle pas si une adresse e-mail existe; sinon, retirer le lien tant que le parcours n’est pas prêt.

### P2 — Une inscription concurrente au même e-mail peut répondre 500

`UsersService.create` fait une lecture `findUnique`, calcule Argon2, puis crée l’utilisateur. Deux requêtes simultanées peuvent passer la lecture; l’index unique empêche bien deux comptes, mais le `P2002` de la seconde insertion n’est pas converti en `ConflictException`. Le filtre général transforme une erreur imprévue en 500. Le test de réinscription concurrente vérifie seulement qu’une requête réussit, pas que l’autre retourne un conflit HTTP compréhensible.

**À faire :** intercepter la violation d’unicité de l’e-mail et la renvoyer comme conflit contrôlé; couvrir le code HTTP et le message dans un test d’intégration.

### P2 — L’acceptation des CGU n’est pas conservée par le serveur

L’écran mobile impose une case CGU décochée au départ, mais `cguAcceptees` ne part pas dans `apiRegister`. Le DTO d’inscription et la table `User` ne contiennent pas de preuve versionnée d’acceptation dans le parcours observé. Le texte légal affirme pourtant que l’acceptation est recueillie à l’inscription.

**Impact :** le blocage de l’écran prouve seulement qu’une case était cochée localement; il ne permet pas de retrouver la date ni la version des conditions acceptées.

**À faire :** transmettre et enregistrer côté serveur l’identifiant/version des CGU, l’horodatage et l’utilisateur, dans la transaction de création, ou corriger le texte si la preuve est gérée ailleurs.

### P2 — Le contrat temps réel demande une déduplication absente du poste opérateur

`brain/REALTIME_CONTRACTS.md` demande aux clients d’ignorer les événements déjà reçus via leur `eventId`. L’outbox est au moins une fois : une reprise après émission et avant marquage peut rejouer l’événement. Le hook opérateur traite chaque `new_order` comme une nouvelle notification et ne mémorise pas les `eventId` récents.

**Impact :** après une reprise de l’outbox, une même commande peut déclencher plusieurs alertes visuelles/sonores, même si la commande n’existe qu’une fois en base.

**À faire :** ajouter une déduplication bornée côté client et un test de livraison puis rejeu.

### P2 — Plusieurs requêtes du parcours Flaix chargent une liste d’événements non bornée

Le contrôle du mode de commande dans `CartService.assertEncoreSurBreakEat` recharge les événements du lieu. Cette règle est appelée à la création du panier et au checkout. L’historique de plusieurs saisons peut donc augmenter le coût par commande.

**À faire :** garder la règle commune mais obtenir son état par une requête bornée ou un résumé actualisé à chaque changement de configuration; mesurer avec plusieurs saisons.

### P2 — Certaines listes clients et certains exports restent en mémoire sans pagination

`ClientsService.lister` agrège les commandes de tous les clients du périmètre, charge leurs comptes/lieux/produits préférés, construit la réponse en mémoire puis la trie. Le CSV réutilise cette liste complète.

**Impact :** un club avec un grand historique peut consommer une quantité importante de mémoire et de connexions lors d’un export; le risque augmente avec plusieurs clubs actifs.

**À faire :** paginer les vues et produire les exports par flux ou par tâche différée, sans tronquer le fichier.

### P2 — Le banc de charge ne prouve pas la capacité annoncée

Les mesures locales antérieures couvrent notamment la découverte des lieux, l’inscription et un GET Break Eat qui résout une URL Flaix. Le scénario de transfert n’exécute pas le panier, Stripe, les webhooks, le stock ou l’orchestration du fournisseur. Les mesures utilisent une instance locale; elles ne simulent pas 5 000 arrivées fixes en rafale. Le benchmark outbox compte des émissions vers une passerelle simulée, pas 10 000 émissions Redis/Socket.IO réelles.

Le limiteur par défaut est à 30 000 requêtes/minute par IP. Les clients d’un stade peuvent partager une même adresse de sortie; Redis indisponible, les compteurs locaux se multiplient par instance. Le pool Prisma est fixé à 10 connexions par instance, mais la capacité de la base Railway et le budget total de connexions ne sont pas fournis par le dépôt.

**À faire :** campagne sur une recette correspondant aux ressources Railway, avec plusieurs répliques et lieux, rafales de départ fixes, inscriptions, essais de paiement Stripe, webhooks, Redis, sockets et opérateurs. Mesurer latences p95/p99, 429/5xx, attente pool, erreurs de paiement, profondeur outbox, commandes sans stock et sans créneau.

## Ce qui est correctement engagé dans le code

- Le modèle distingue organisations, lieux, événements, stands et points de retrait; plusieurs événements peuvent appartenir au même lieu.
- La destination Flaix est résolue par couple lieu/événement, ce qui évite de renvoyer vers le match d’un autre lieu.
- Le panier est borné à un événement et un stand; les contrôles serveur vérifient l’accès à l’événement, l’ouverture du club/stand et la compatibilité du point de retrait.
- Les événements temps réel sont déposés dans l’outbox avec les changements de commande; Redis sert au transport entre instances.
- Les flags ont des portées globales/organisation/événement, et leurs routes contrôlent les droits de lecture/écriture. La résolution de portée est utile, mais les défauts d’unicité et d’intégration d’interface décrits plus haut doivent être corrigés avant de s’y fier pour une exploitation multi-lieux.

## Ordre recommandé de correction

1. Corriger l’idempotence de synchronisation des paniers et empêcher le double ajout au retry.
2. Ajouter les réservations atomiques du stock et des créneaux avant l’encaissement.
3. Bloquer l’ouverture de liens Flaix contenant encore une étiquette; exiger une session ou une saisie contrôlée lorsque l’identité est nécessaire.
4. Corriger les index d’unicité des flags/réglages globaux et tester les écritures concurrentes sur PostgreSQL réel.
5. Décider et livrer le vrai parcours SMS/OTP si l’inscription par téléphone est attendue; normaliser et vérifier les numéros.
6. Aligner le flag par événement/organisation avec l’API qui décide de montrer le bouton dans l’application; inventorier chaque module et son flag effectif.
7. Ajouter la déduplication des événements opérateur, la preuve serveur d’acceptation CGU, la récupération de compte et la conversion P2002 en conflit d’inscription.
8. Résoudre les alertes de dépendances sur les versions actuellement verrouillées, par paquet et par chemin, puis mettre ce contrôle dans la CI.
9. Paginer les listes lourdes, borner les lectures d’événements et tester le parcours complet sur une recette dimensionnée pour les objectifs de trafic.

## Conclusion

**À date, Break Eat peut faire découvrir plusieurs lieux et événements, mais l’expérience n’est pas encore validée pour un déploiement massif multi-lieux sans incident.** Le SMS n’est pas une fonction disponible; une reprise de checkout peut modifier le panier; les courses de stock/créneau peuvent laisser une commande payée sans l’article ou l’horaire attendu; et les interrupteurs globaux ne sont pas protégés contre les doublons SQL.

Une garantie « sans aucun bug » n’est pas démontrable par une lecture statique. Les points P1 de ce rapport doivent d’abord être corrigés, puis validés par tests de concurrence sur PostgreSQL/Redis et une campagne de charge complète sur la recette de production.
