# Audit complet BreakEat — 25 octobre 2026

> ## ⚑ SUITE DONNÉE — 26/10/2026
>
> **Les 4 bloquants et les 9 risques élevés sont traités.** Ce document garde
> ses constats d'origine ; ce bandeau dit ce qu'il en est advenu. Un audit
> réécrit après coup ne prouve plus rien.
>
> | Constat | Sort |
> |---|---|
> | P0-1 autorisation WebSocket | ✅ règle par salon, défaut = refus (`14ca877`) |
> | P0-2 Socket.IO mono-instance | ✅ adaptateur Redis (`9a0920e`) |
> | P0-3 configuration silencieuse | ✅ `estEnLigne()` + refus sur secret JWT faible (`4472889`) |
> | P0-4 double réservation des points | ✅ écriture conditionnelle (`930c5a1`) |
> | P1-1 limitation en mémoire | ✅ compteurs partagés, script Lua (`dbbf09f`) |
> | P1-2 tâches planifiées bloquées | ✅ statut honnête + relevé des abandons (`3624df3`) |
> | P1-3 campagnes non bornées | ⚠️ **le constat était FAUX** — voir l'encadré dans la section |
> | P1-4 pool PostgreSQL | ✅ explicite, l'exploitant gardant le dernier mot (`c7190c1`) |
> | P1-5 outbox temps réel | ◐ **partiel, et assumé** — réconciliation permanente, outbox non faite (`c7327cc`) |
> | P1-6 concurrence panier/stock | ✅ refus sans mutation (`59e31cb`) |
> | P1-7 configuration contradictoire | ✅ une seule commande de démarrage (`1779c39`) |
> | P1-8 migrations au démarrage | ◐ inchangé — `migrer.sh` reste au démarrage, délibérément |
> | P1-9 dépendances vulnérables | ✅ 4 critiques → **0** (`4aa96b9`) |
> | P2-1 flags qui ne pilotent rien | ✅ l'ardoise se coupe sans redéployer (`240cf9a`) |
> | P2-2 WebSocket et comptes désactivés | ✅ le compte est relu à la connexion (`297d2fa`) |
> | P2-3 CORS WebSocket ≠ CORS HTTP | ✅ une seule lecture (`297d2fa`) |
> | P2-4 lectures back-office non bornées | ◻ **ouvert, sciemment** — gênera avec le volume, pas aujourd'hui |
> | P2-5 healthcheck liveness | ◻ ouvert — confort d'exploitation |
> | P2-6 build fragile selon la mémoire | ✅ parallélisme borné en CI (`a508a80`) |
> | P2-7 historique du dépôt lourd | ◻ ouvert — ménage |
>
> **Ce que l'audit n'avait pas vu** : `NODE_ENV` valait `staging` en
> production, donc tout le « mode production » du backend était inactif — dont
> le masquage des erreurs, qui renvoyait au client le message brut de
> PostgreSQL. Et la production tourne sur **Postgres 18**, pas 16 : le
> vérificateur de migrations et les tests d'intégration éprouvaient sur la
> mauvaise version.
>
> **Ce sur quoi l'audit se trompait** : P1-3. La limite de 65 535 paramètres
> n'est jamais atteinte — mesuré, Prisma découpant lui-même. Le correctif a
> tout de même été gardé, pour une autre raison, et dite.
>
> État mesuré : **840 tests backend**, **130 d'intégration** (Postgres 18 +
> Redis), **0 vulnérabilité critique**. Détail dans `ENGINEERING_MANUAL.md`
> phases 68 et 69.

## Verdict exécutif

L'application est fonctionnelle sur les tests actuels, mais elle n'est pas encore prête à être déclarée sûre pour 100 000 utilisateurs, 50 lieux simultanés et plusieurs milliers de profils connectés.

Les risques majeurs sont distribués : temps réel, concurrence, déploiement multi-instance, campagnes de notification, configuration production et dépendances vulnérables. Les tests verts ne valident pas encore le comportement distribué.

### Bloquants avant une montée en charge réelle

1. Autorisation WebSocket incomplète pour plusieurs types de salons.
2. Socket.IO utilise l'adaptateur mémoire par défaut : les replicas Railway ne partageront pas les événements.
3. Le backend démarre malgré des variables critiques absentes et retombe sur des valeurs de développement.
4. Deux checkouts concurrents peuvent réserver deux fois les mêmes points de fidélité.
5. L'audit des dépendances signale encore des vulnérabilités critiques et élevées.

## Périmètre

Audit effectué sur le dépôt au commit e725d66, branche main, synchronisée avec origin/main au moment de l'audit.

Zones examinées :

- backend NestJS, Prisma, PostgreSQL, Stripe, fidélité, panier, stock, notifications, WebSocket, flags et tâches planifiées ;
- applications admin, back-office, operator et mobile/web Expo ;
- migrations Prisma et index du schéma ;
- Git, GitHub Actions, scripts de build et configurations Railway ;
- configuration de sécurité, secrets présents dans l'arbre courant et dépendances.

Le tableau de bord Railway lui-même n'est pas accessible depuis le dépôt. Le nombre réel de replicas, la mémoire, le plan PostgreSQL, les variables actives, Redis et les règles de déploiement restent donc à vérifier dans Railway.

## Validation réalisée

| Contrôle | Résultat |
|---|---|
| pnpm turbo lint --concurrency=1 | OK — 5 packages |
| pnpm turbo typecheck --concurrency=1 | OK — 5 packages |
| pnpm turbo test --force --concurrency=1 | OK — 894 tests annoncés |
| Tests backend | 58 suites, 796 tests passés |
| Tests PostgreSQL réelle | OK lors de la dernière exécution auditée : 12 suites, 118 tests |
| Build avec heap Node par défaut | Échec local par manque de mémoire pendant le backend |
| Build avec max-old-space-size=4096 | OK — 5 packages |
| Export Expo web local | Échec sous Node 24/Windows-OneDrive : erreur Expo de lecture puis OOM ; à reproduire sur CI Node 22 |
| État Git | Propre, aucun code applicatif modifié |

Les avertissements GitHub concernant Node.js 20 et ubuntu-latest ne sont pas la cause de l'échec des tests. Les échecs CI précédents venaient de Prisma non généré et d'une collision du code d'ardoise ; ces deux points ont déjà été corrigés dans l'historique.

## Constats critiques — P0

### P0-1 — Autorisation WebSocket incomplète

Fichier : backend/src/modules/realtime/realtime.gateway.ts, lignes 120 à 123.

peutRejoindre vérifie l'organisation et la buvette uniquement si le salon commence par supplier:. Pour organization:, event:, order:, pickup-point: et dashboard:, la méthode retourne immédiatement true.

RealtimeService émet bien dans ces salons. Un utilisateur authentifié qui connaît ou obtient un UUID peut donc rejoindre un salon hors de son périmètre. Selon le client connecté, cela peut exposer des changements de commande et des informations d'un autre lieu. C'est également une source de mélange opérationnel entre buvettes.

Correction : une règle d'autorisation par type de salon, les mêmes helpers d'accès que REST, et des tests négatifs pour chaque type. Il ne faut pas compter sur le secret des UUID.

### P0-2 — Temps réel non compatible avec plusieurs instances

Fichiers : backend/src/modules/realtime/realtime.module.ts et realtime.service.ts.

Socket.IO utilise l'adaptateur mémoire par défaut. Si Railway exécute deux replicas, un événement émis par l'instance A n'est pas transmis aux clients connectés à l'instance B. Un opérateur peut alors voir une commande seulement après un rafraîchissement REST, selon le routage du proxy.

Correction : Redis partagé avec l'adaptateur Redis de Socket.IO, ou bus/outbox durable consommé par chaque instance. Prévoir aussi la reconnexion et la resynchronisation REST.

### P0-3 — Configuration production qui échoue en silence

Fichiers : backend/src/main.ts, lignes 108 à 144, et backend/src/config/app.config.ts.

Le code détecte les variables absentes mais n'interrompt pas le démarrage. Les valeurs de repli comprennent notamment :

- JWT_SECRET égal à insecure-dev-secret ;
- URLs localhost pour l'API, le web et Stripe Connect ;
- CORS limité au localhost ;
- secrets Stripe vides ;
- Redis localhost.

Une instance Railway mal configurée peut donc être healthy tout en refusant les connexions, en renvoyant vers localhost, ou en utilisant un secret JWT connu.

Correction : en production, arrêter le processus avant listen si une variable critique manque, si une URL est locale, si le secret JWT est faible ou si le mode Stripe ne correspond pas à l'environnement. Séparer liveness et readiness.

### P0-4 — Double réservation possible des points de fidélité

Fichier : backend/src/modules/loyalty/loyalty.service.ts, lignes 256 à 326.

La méthode lit cart.loyaltyHoldId avant la transaction. Deux requêtes de checkout simultanées peuvent toutes deux constater l'absence de réservation, décrémenter le compte si le solde le permet, créer deux transactions HOLD, puis écrire deux fois le pointeur du panier.

La contrainte unique sur Cart.loyaltyHoldId n'empêche pas deux mouvements différents pour le même panier. Le premier peut rester orphelin et les points rester débités.

Correction : transaction sérialisée par panier, verrou ou mise à jour conditionnelle loyaltyHoldId IS NULL, puis idempotence par panier. Ajouter un test réel PostgreSQL avec deux checkouts simultanés.

## Risques élevés — P1

### P1-1 — Limitation de débit en mémoire

Fichiers : backend/src/common/securite/limitation.ts et backend/src/app.module.ts.

Les compteurs Nest Throttler sont en mémoire. Chaque replica a ses propres compteurs : la limite est multipliée par le nombre d'instances et peut être contournée en changeant de replica. À l'inverse, 600 requêtes/minute par IP peuvent être atteintes par les téléphones d'une même buvette derrière un NAT.

Correction : Redis partagé pour les compteurs, clé IP plus utilisateur quand possible, et tests avec le trafic réel d'un lieu.

### P1-2 — Tâches planifiées et état bloqué

Fichier : backend/src/modules/notifications/scheduled-push.service.ts.

Le passage PENDING vers PROCESSING est une bonne base, mais :

- une ligne PROCESSING peut rester bloquée après un crash ;
- FAILED n'a pas de retry, backoff ou dead-letter queue ;
- ExpoPushService.send absorbe les erreurs réseau/HTTP, puis process marque quand même la campagne SENT même si tous les lots ont échoué ;
- le traitement est séquentiel, limité à 50 campagnes par minute.

Correction : reprise des claims expirés, tentatives, backoff, succès partiel explicite, métriques et worker séparé.

### P1-3 — Campagnes non bornées en mémoire et en paramètres SQL

Fichiers : scheduled-push.service.ts, lignes 131 à 159, et user-notifications.service.ts, lignes 28 à 45.

Une diffusion globale charge tous les tokens en mémoire. Une campagne ciblée charge tous les utilisateurs ayant commandé, puis fait un createMany avec tous les destinataires. À 100 000 utilisateurs, cela peut dépasser la mémoire, la durée de transaction et la limite de paramètres PostgreSQL.

Correction : pagination par curseur, snapshot de campagne, lots limités, idempotency key par campagne et utilisateur, worker asynchrone.

> **Vérifié le 26/10/2026 — la limite de paramètres est une FAUSSE PISTE.**
>
> Mesuré sur un PostgreSQL 18 réel : `findMany` avec un `IN` de **100 000**
> valeurs passe, et `createMany` de **50 000 lignes × 4 colonnes** passe
> aussi. Prisma découpe lui-même ce qu'il envoie : le plafond de 65 535
> paramètres n'est jamais atteint par ce code.
>
> Ce qui reste vrai, et qui a été corrigé : un `createMany` géant tient UNE
> SEULE transaction, donc ses verrous, pendant que les buvettes servent. Le
> découpage par lots (`common/helpers/par-lots.ts`) rend la main entre chaque
> écriture. C'est une question de **disponibilité**, pas de capacité.
>
> La pagination par curseur et le worker asynchrone restent des sujets
> ouverts, mais pour la durée d'envoi — pas pour éviter un échec.
>
> Trois tests d'intégration couvrent désormais une campagne de 25 000
> destinataires : `test/integration/campagne-de-masse.int-spec.ts`.

### P1-4 — Pool PostgreSQL non explicite

Fichier : backend/src/database/prisma.service.ts.

Prisma est instancié sans stratégie visible de connection_limit, timeout de pool, PgBouncer ou limitation par replica. Avec plusieurs instances, les cron, WebSockets, webhooks et requêtes REST peuvent dépasser le plan PostgreSQL Railway avant que le CPU ne soit plein.

Correction : choisir le nombre de connexions par instance, configurer le pooler ou le mode Railway retenu, fixer les timeouts et tester avec le nombre réel de replicas.

### P1-5 — Événements temps réel sans outbox durable

Fichiers : backend/src/modules/orders/orders.service.ts, lignes 348 à 358, et realtime.service.ts.

Le commentaire parle d'une règle outbox, mais l'implémentation émet directement après la transaction. Si le processus tombe entre le commit PostgreSQL et emitNewOrder, la commande existe mais l'événement est perdu.

Correction : écrire l'événement dans une table outbox dans la même transaction, puis le publier avec un worker qui réessaie. Le client doit pouvoir se resynchroniser par REST.

### P1-6 — Concurrence panier/stock et expérience d'erreur

Fichier : backend/src/modules/cart/cart.service.ts, lignes 306 à 355 et 981 à 1002.

Le panier est modifié avant le contrôle cumulatif du stock. En cas de dépassement, la quantité est ensuite recadrée au stock puis une erreur HTTP est renvoyée. Le client reçoit donc une erreur tout en retrouvant une quantité différente de sa demande.

Le décrément final de stock utilise une mise à jour conditionnelle dans la transaction de commande, ce qui protège mieux l'inventaire. Il faut toutefois tester le comportement voulu : refus sans mutation, ou plafonnement clairement annoncé.

### P1-7 — Configuration Railway, Nixpacks et Docker contradictoire

Fichiers : railway.json, backend/railway.json, nixpacks.toml et backend/Dockerfile.

Plusieurs commandes différentes sont définies :

- railway.json : génération Prisma, scripts/migrer.sh puis node dist/main ;
- backend/railway.json : db:migrate:prod puis node dist/main ;
- nixpacks.toml : encore une autre combinaison ;
- Docker : pnpm@latest alors que le dépôt verrouille pnpm@11.3.0.

Le comportement dépend du répertoire racine et du réglage du service Railway. Une correction peut donc être prise en compte par une configuration et ignorée par une autre.

Correction : une seule stratégie de déploiement, fichiers concurrents supprimés ou explicitement documentés, pnpm versionné partout, migrations sorties du démarrage normal des replicas.

### P1-8 — Migrations au démarrage de l'application

Les scripts Railway exécutent Prisma Migrate avant le serveur. Lors d'un rollout multi-instance, plusieurs processus peuvent tenter la migration et retarder ou faire redémarrer les instances. Une indisponibilité PostgreSQL peut provoquer une boucle de redémarrages.

Correction : migration unique avant le rollout, timeout explicite, verrou opérationnel si nécessaire et rollback documenté.

### P1-9 — Vulnérabilités de dépendances de production

pnpm audit --prod a remonté 4 critiques, 71 élevées, 28 modérées et 5 faibles dans l'arbre installé.

Priorités :

- next 15.5.25 dans admin, back-office et operator ;
- @sentry/nextjs dans operator ;
- multer et body-parser dans Nest/Express ;
- shell-quote, zod, postcss et dépendances Expo associées.

Correction : mettre à jour le lockfile, vérifier les versions réellement résolues, puis exécuter lint, typecheck, tests, build et export. Ne pas lancer un audit fix aveugle sur ce monorepo.

## Risques moyens — P2

### P2-1 — Les flags en base ne pilotent pas tous les modules

FeatureFlagsService sait résoudre des flags globaux, organisationnels et événementiels. Cependant, OrderSplitsService.estActive lit uniquement app.split.enabled, alimenté par GROUP_SPLIT_ENABLED dans app.config.ts, et non par FeatureFlagsService.

Désactiver un flag depuis le back-office peut donc ne rien désactiver pour l'ardoise ; il faut modifier l'environnement et redéployer.

Correction : choisir par module entre kill switch d'environnement et flag dynamique, puis utiliser la même source côté API et client. Ajouter un test qui prouve qu'un flag OFF bloque réellement la route.

### P2-2 — Connexion WebSocket et comptes désactivés

La connexion WebSocket vérifie la signature et l'expiration du JWT mais ne relit pas l'utilisateur en base comme JwtStrategy le fait côté REST. Un compte désactivé ou dont les droits ont changé peut conserver une connexion jusqu'à expiration du token.

Correction : valider isActive à la connexion et prévoir une révocation/déconnexion lors d'un changement de droits.

### P2-3 — CORS WebSocket différent du CORS HTTP

main.ts nettoie les origines CORS avec trim, mais le décorateur WebSocket utilise directement CORS_ORIGINS.split(',') dans realtime.gateway.ts.

Une valeur avec un espace après une virgule peut fonctionner en HTTP mais échouer en WebSocket pour la seconde origine. Utiliser une configuration partagée.

### P2-4 — Lectures back-office non bornées

ClientsService.lister agrège tout l'historique des commandes et produitsPreferes charge toutes les lignes de commande en mémoire. Certaines listes de campagnes, événements, produits et groupes n'ont pas de pagination uniforme.

Ajouter pagination, filtres bornés, index adaptés et agrégation SQL ou matérialisée pour les statistiques lourdes.

### P2-5 — Healthcheck uniquement liveness

GET /health renvoie toujours status ok sans tester PostgreSQL, Redis, migrations ou secrets critiques. C'est correct pour savoir si Node répond, mais insuffisant pour déclarer une instance prête à servir des paiements.

Conserver un endpoint liveness rapide et ajouter un readiness séparé.

### P2-6 — Build fragile selon la mémoire

Le build backend échoue avec les paramètres Node locaux par défaut puis réussit avec 4096 Mo de heap. Le workflow définit 6144 Mo pour l'export Expo mais pas pour le job build.

Mesurer la mémoire réelle du runner Railway/CI et définir une marge explicite. Vérifier l'export Expo sur Node 22 Linux, pas seulement sur Windows/OneDrive Node 24.

### P2-7 — Historique et dépôt trop lourds

Le dépôt contient de nombreux documents de phases, générateurs et artefacts HTML ou images importés. Ils ne semblent pas exécutés par le runtime, mais augmentent la taille du clone, les scans et le temps de CI.

Séparer les archives documentaires du code, déplacer les gros assets inutilisés et effectuer un scan des secrets sur tout l'historique Git.

## Points rassurants

- Les migrations Prisma ont été rejouées sur PostgreSQL 16 dans les tests d'intégration précédents.
- Stripe vérifie l'écart entre le montant figé et le montant réellement encaissé avant de créer la commande.
- Le panier et la commande possèdent des garde-fous d'idempotence par panier et PaymentIntent.
- Le décrément de stock final est conditionnel et ne laisse pas le stock passer sous zéro dans la transaction.
- Les tests de séparation des buvettes couvrent le salon supplier:.
- Aucun secret live évident n'a été trouvé dans l'arbre Git courant ; cela ne remplace pas une analyse de l'historique complet.

## Vérifications à faire dans Railway

1. Confirmer le Root Directory : racine du monorepo ou backend.
2. Confirmer quelle configuration est réellement utilisée entre railway.json, backend/railway.json et nixpacks.toml.
3. Vérifier le nombre de replicas et la mémoire par replica.
4. Vérifier DATABASE_URL, le pool et le nombre maximal de connexions PostgreSQL.
5. Vérifier que Redis est partagé et joignable par toutes les instances.
6. Vérifier JWT_SECRET, les trois secrets Stripe, les URLs publiques et CORS_ORIGINS.
7. Vérifier Stripe sur /webhooks/stripe et surveiller les réponses 2xx/5xx.
8. Vérifier que /health sert uniquement de liveness et qu'un readiness existe.
9. Vérifier la protection GitHub de main : PR obligatoire, checks requis et push direct interdit.
10. Lancer un test de charge progressif avec menus, panier, checkout Stripe test, WebSocket et tableaux opérateurs.

## Plan prioritaire

### Avant toute ouverture importante

- Corriger l'autorisation des salons WebSocket.
- Ajouter Redis adapter Socket.IO ou un bus temps réel partagé.
- Rendre la configuration production fail-fast.
- Corriger l'idempotence concurrente de la fidélité.
- Mettre à jour les dépendances critiques et élevées.
- Unifier la configuration Railway et sortir les migrations du démarrage des replicas.

### Avant 10 000 utilisateurs actifs

- Redis pour rate limiting, jobs et temps réel.
- Pool PostgreSQL mesuré par replica.
- Outbox durable et resynchronisation.
- Notifications paginées avec retry et reprise des jobs bloqués.
- Pagination des listes et agrégation SQL.
- Tests de concurrence PostgreSQL : double checkout, double webhook, stock, fidélité, créneaux et ardoise.

### Avant 100 000 utilisateurs / 50 lieux

- Test de charge reproductible sur une base proche de la production.
- Observabilité : p95/p99, erreurs par route, connexions DB, locks, jobs, WebSocket connectés, événements perdus et webhooks retardés.
- Alertes sur paiement accepté sans commande, webhook en échec, jobs bloqués, pool saturé, mémoire et redémarrages.
- Procédure d'incident, rollback, migration forward-only et restauration testée.

## Conclusion

Les tests verts montrent que le code compile et que les scénarios prévus sont largement couverts. Ils ne valident pas encore le comportement distribué.

Les risques les plus graves sont concentrés dans quatre invariants : qui peut écouter quoi, comment les instances se parlent, comment l'argent et les points restent idempotents sous concurrence, et comment Railway refuse une mauvaise configuration.

Tant que les P0 ne sont pas corrigés et testés en concurrence, je déconseille de passer directement à plusieurs replicas ou à un événement de grande capacité.

