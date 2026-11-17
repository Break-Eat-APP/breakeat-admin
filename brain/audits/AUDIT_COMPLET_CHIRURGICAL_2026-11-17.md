# Audit complet et chirurgical — BreakEat

- **Date :** 17 novembre 2026
- **Révision examinée :** `64719f6` (branche `main`)
- **Périmètre :** parcours d'inscription, événements/lieux, commandes et paiements, créneaux, stock, commandes opérateur, temps réel, Flaix/Flex, flags, documentation de déploiement et de capacité.
- **Méthode :** lecture du code courant et des documents d'exploitation/règles; recoupement avec le registre des bugs et les décisions. Aucun fichier source n'a été modifié. Aucun test automatisé ni test de charge n'a été lancé pendant cet audit; l'état CI rapporté ci-dessous est celui documenté dans le dépôt.

## Verdict

**Je ne peux pas certifier BreakEat pour 10 000 utilisateurs simultanés, 5 000 commandes dans une fenêtre courte, ou 50 lieux actifs en même temps.** Le dépôt contient de bonnes protections de concurrence (contraintes uniques, transactions de commande, décrément conditionnel du stock, capacité des créneaux, outbox temps réel, Redis en option et garde d'idempotence Stripe). Mais quatre défauts de code peuvent bloquer des commandes ou les notifications Flex/Flaix, et les scénarios de charge à l'échelle demandée n'ont pas été mesurés.

**La mise en production large doit attendre la correction des constats P1 et une répétition de charge représentative.** L'état documenté au 17/11 indique également que Stripe est encore en mode test en production; Apple a validé la 1.1.3 en attente de publication manuelle et Google est encore en examen (`REPRISE.md`, lignes 46 et 80-81).

## Constats vérifiés dans le code

### P1 — Le panier reste modifiable pendant la création du paiement

- **Fichiers :** `backend/src/modules/cart/cart.service.ts:518`, `:687`, `:740`, `:850`, `:897`, `:915`.
- **Scénario :** le client appuie sur Payer. Le serveur lit le panier et son total, réserve stock/créneau, puis attend l'appel réseau à Stripe. Le statut reste `OPEN` jusqu'à ce que Stripe réponde et que `figerEtEngager()` l'écrive. Pendant cette fenêtre, les routes d'édition autorisent encore les changements. Le serveur peut donc envoyer à Stripe un montant calculé sur l'ancien panier, tandis que le webhook lira des lignes modifiées; il peut refuser de créer la commande après que le paiement a réussi, ou affecter un horaire différent de celui payé.
- **Correctif recommandé :** verrouiller atomiquement le panier avant le premier appel externe, puis prendre un instantané immuable (lignes, prix, fidélité, créneau, comptoir) pour Stripe et le webhook. Si l'appel Stripe échoue, libérer proprement ce verrou et les réservations.

### P1 — Abandon ou expiration du paiement : stock et créneau retenus sans échéance

- **Fichiers :** `backend/src/modules/cart/cart.service.ts:546-567`, `:687-760`; `backend/src/modules/webhooks/stripe-webhooks.service.ts:78-95`; `backend/src/modules/orders/orders.service.ts:683-766`.
- **Scénario :** une réservation de stock/créneau est posée avant Stripe. Si le client ferme la page de paiement ou abandonne la feuille native, aucun chemin d'expiration de `CHECKOUT_PENDING` n'est présent dans le code parcouru. Le webhook Stripe ne traite pas `checkout.session.expired` ni `payment_intent.canceled` dans son `switch`; l'événement non reconnu est journalisé puis acquitté. Le panier demeure en attente et sa réservation peut empêcher d'autres clients de commander ces articles ou ce créneau.
- **Correctif recommandé :** gérer explicitement expiration/annulation; établir une échéance serveur pour chaque réservation, avec réconciliation périodique et idempotente. Avant de libérer, vérifier auprès de Stripe que le paiement n'a pas réussi ou n'est pas en cours. Ajouter une course test « expiration contre paiement réussi ».

### P1 — Un webhook Flaix en échec est ensuite considéré comme doublon et ignoré

- **Fichier :** `backend/src/modules/live-activity/flaix-webhook.service.ts:141-175`.
- **Scénario :** le service insère d'abord l'identifiant `eventId`, puis applique l'événement. Si l'appel à la Live Activity/APNs échoue, il écrit l'erreur et renvoie une erreur HTTP. Quand Flaix renvoie le même événement, l'unicité déclenche `P2002`; la ligne 155 retourne immédiatement `duplicate: true`, sans vérifier `processedAt` ni rejouer l'événement. La notification et/ou une mise à jour opérationnelle qui aurait échoué avant persistance peuvent donc être perdues. Le statut métier de la commande n'est pas modifié par ce webhook. Le commentaire annonce un rejeu manuel, mais aucun chemin de rejeu automatique n'est présent dans ce service.
- **Correctif recommandé :** séparer « reçu » de « terminé » par une prise de bail conditionnelle; rejouer les lignes non traitées avec compteur et prochaine échéance, ou permettre à Flaix de renvoyer un événement neuf sans perdre l'idempotence de l'effet. Tester l'échec après insertion puis la reprise.

### P1 — Ouverture d'événement non atomique : événement actif, buvette restée fermée

- **Fichier :** `backend/src/modules/events/ouverture-automatique.service.ts:89-102`; fermeture `:121-153`.
- **Scénario :** l'événement passe à `ACTIVE`, puis l'update séparée du statut de ses points de retrait échoue. Le `catch` global journalise l'erreur. Au tic suivant, l'ouverture ne sélectionne que les événements `DRAFT`; celui-ci n'est donc plus candidat et la buvette peut rester `CLOSED` sans reprise automatique. Côté client, l'événement apparaît ouvert mais personne ne peut commander. À la fermeture, le statut de l'événement peut aussi être `ENDED` tandis qu'un point de retrait reste ouvert pour les autres événements qui le partagent.
- **Correctif recommandé :** transactionner la bascule et les mises à jour compatibles, ou faire une réconciliation qui retrouve les événements déjà basculés mais les points de retrait pas encore alignés. Isoler les erreurs par événement pour qu'un seul échec ne stoppe pas le lot.

### P1 — Stripe est encore documenté en mode test : impossible d'encaisser une vraie commande

- **Référence :** `REPRISE.md:46`, `brain/SECURITE.md` section « À faire ».
- **Scénario :** l'app est publiée et des clients paient avec leurs cartes habituelles; les paiements sont refusés ou ne sont que des paiements de test. Le code de commande ne suffit pas à rendre l'encaissement réel; les clés API, le webhook live, Stripe Connect de chaque club et Apple Pay doivent être basculés et vérifiés ensemble.
- **Suite avant lancement commercial :** bascule des clés live dans Railway, nouveau webhook live, onboarding Connect live pour chaque club, vrai paiement de bout en bout, rapprochement de la commande et remboursement de contrôle. Ne jamais mettre ces secrets dans Git ou dans le rapport.

### P2 — Un opérateur épinglé à une buvette peut lire les commandes de toutes les buvettes par une route secondaire

- **Fichiers :** `backend/src/modules/orders/orders.controller.ts:210-217`, `:391-404`; `backend/src/modules/orders/orders.service.ts:1012-1020`.
- **Scénario :** un compte opérateur est épinglé à la buvette A. Le tableau principal applique le filtre d'épinglage, mais `GET /orders/event/:eventId/active` vérifie seulement l'appartenance à l'organisation et demande toutes les commandes actives de l'événement, sans `supplierId`. Un appel direct à cette route révèle les commandes et lignes des buvettes B, C, etc. Cette route n'est pas utilisée par le frontend opérateur actuel, mais elle demeure accessible avec un jeton valide.
- **Correctif recommandé :** appliquer ici aussi le rôle comptoir et le `supplierId` épinglé, puis limiter explicitement les champs retournés. Ajouter un test contrôleur avec deux buvettes.

### P2 — Le rattachement automatique ignore le lieu et traverse toute l'organisation

- **Fichiers :** `backend/src/common/helpers/rattachement-buvettes.ts:29-43`, `:48-68`; `brain/DECISIONS/ADR-0009-rattachement-points-de-retrait.md`.
- **Scénario :** une organisation gère deux stades et crée une buvette au stade A. La fonction l'attache aux événements à venir de toute l'organisation, y compris ceux du stade B. L'inverse arrive également lors de la création d'un événement. Les clients peuvent alors voir une buvette/carte de l'autre lieu et l'opération peut accepter des commandes destinées au mauvais comptoir. Le risque est explicitement assumé dans ADR-0009, mais il contredit un déploiement multi-lieux sous une même organisation.
- **Correctif recommandé :** rattacher par `venueId` (et conserver une option explicite pour les équipes réellement partagées); afficher une vérification de compatibilité avant d'ouvrir les commandes. Considérer cette correction comme nécessaire avant qu'une organisation exploite plusieurs stades.

### P2 — Création événement et rattachements ne forment pas une seule opération

- **Fichiers :** `backend/src/modules/events/events.service.ts:80-115`; `backend/src/common/helpers/rattachement-buvettes.ts:29-43`, `:84-121`.
- **Scénario :** l'événement est créé, puis le rattachement automatique et la création de comptoirs s'exécutent séparément. Si une étape échoue, le client reçoit une erreur alors que l'événement existe déjà en base, partiellement configuré. En réessayant, il peut créer un événement en double; une réactivation/rattachements concurrents peuvent également créer deux comptoirs par défaut, car `PickupPoint` n'a pas de contrainte unique sur cette paire.
- **Correctif recommandé :** exécuter création + rattachement + comptoirs dans une transaction; poser une contrainte unique adaptée à `(eventId, supplierId)` pour le comptoir par défaut, ou une clé d'idempotence.

### P2 — Le tableau opérateur charge sans pagination toutes les commandes encore actives d'un événement

- **Fichier :** `backend/src/modules/orders/orders.service.ts:1312-1375`.
- **Scénario :** un événement accumule plusieurs milliers de commandes non terminées. Chaque poste opérateur qui ouvre/recharge le tableau récupère toutes les commandes et leurs lignes, puis charge les catégories produit. Le filtrage par événement/statut et les index existent, ce qui aide PostgreSQL, mais la réponse et le travail mémoire restent proportionnels à tout le backlog; aucune pagination/limite serveur n'est appliquée.
- **Correctif recommandé :** fixer un périmètre récent/actif utile au poste, paginer ou diffuser les deltas; séparer les compteurs agrégés du détail. Tester avec un événement de 5 000+ commandes et plusieurs postes.

### P2 — Le téléphone saisi n'est pas vérifié par SMS et n'est pas un identifiant de connexion

- **Fichiers :** `apps/mobile/src/screens/login.screen.tsx:159-218`; `backend/src/modules/auth/dto/register.dto.ts:61`.
- **Vérifié :** l'inscription utilise courriel + mot de passe; le téléphone est normalisé et contrôlé sur sa forme, sans code SMS. Les commentaires de l'écran le disent explicitement. Je n'ai trouvé aucun fournisseur SMS ni parcours OTP dans le module d'authentification.
- **Conséquence :** si l'exigence produit est « s'inscrire ou se connecter avec son numéro/SMS », ce parcours n'est pas livré. Un client peut également saisir le numéro d'une autre personne. Si le numéro n'est qu'une donnée de profil facultative, ce n'est pas un bug de commande, mais il ne faut pas le présenter comme vérifié.
- **Suite :** décider si l'authentification par SMS est une exigence de lancement; sinon ajuster le libellé et la collecte pour rendre clairement le numéro facultatif/non vérifié.

### P2 — Les flags génériques ne coupent pas les modules de l'application

- **Références :** `apps/admin/src/lib/interrupteurs.ts:61-77`; `backend/src/modules/order-splits/order-splits.service.ts:141-142`; `backend/src/modules/events/events.service.ts:108`, `:212-213`.
- **Vérifié :** l'unique interrupteur référencé comme réellement branché dans l'interface d'administration est `app.split.enabled` (partager l'addition). Le champ `Event.activeFeatureFlags` est écrit/lisible via les événements, mais aucune consommation fonctionnelle n'a été trouvée dans l'application mobile ou le backend au-delà de ce stockage. Le service générique `FeatureFlagsService` sait stocker/résoudre des clés, mais une ligne en base ne désactive pas magiquement un module.
- **Conséquence :** si l'équipe s'attend à pouvoir désactiver commande, fidélité, notifications ou parcours BreakEat/Flex avec ces flags, ces interrupteurs n'existent pas encore pour ces modules. Ne pas utiliser cet écran comme coupe-circuit de production avant branchement et test de chaque chemin serveur et client.

## Risques connus, documentés, à garder visibles

- **État de buvette global :** son ouverture/fermeture concerne tous les événements auxquels la buvette est rattachée. ADR-0009 l'accepte; en multi-événements simultanés, un opérateur doit comprendre cette portée.
- **Aucun environnement de préproduction :** BUG-2026-014 demeure ouvert dans `brain/BUGS_ET_INCIDENTS.md`. Les migrations et essais d'intégration ne sont pas éprouvés sur un clone isolé de la production.
- **Redis requis pour plusieurs instances :** le code expose `/ready` avec `redis.plusieursInstances`. Sans Redis joignable, les salons Socket.IO restent locaux à chaque instance; le commerce REST fonctionne mais un tableau peut manquer les annonces émises par une autre instance. Avant toute montée horizontale, surveiller cette valeur et exiger `true`.
- **Limitation par IP :** défaut documenté à 60 000/minute, pensé pour un stade derrière une IP commune; la protection anti-bruteforce par courriel dépend du Redis partagé, et se dégrade par instance si Redis tombe.

## Scénarios demandés

| Scénario | Ce que le code permet d'affirmer | Verdict |
|---|---|---|
| 2 000 personnes téléchargent/ouvrent l'app dans un stade | Le coupe-circuit IP par défaut est fixé au-dessus du volume estimé dans les commentaires; aucune mesure réelle ne prouve latence ni capacité Railway/PostgreSQL. | **Possible en théorie, non mesuré.** |
| 2 000 clients paient au même moment sur un même lieu | Stock et capacité des créneaux utilisent des mises à jour conditionnelles/transactions; c'est une bonne base. La fenêtre d'édition concurrente pendant checkout et les abandons avec réservations bloquées sont des défauts vérifiés. | **Pas fiable en l'état pour une ouverture sans surveillance.** |
| 5 000 commandes dans la soirée sur plusieurs lieux | L'outbox durable et les index événement/statut aident; les tableaux opérateur chargent sans pagination et le pool DB est plafonné par instance à 10 connexions par défaut. | **Aucune preuve que le débit et les tableaux tiennent; charge à mesurer.** |
| 10 000 utilisateurs connectés simultanément | L'app doit traverser l'API, PostgreSQL, Redis, Socket.IO, APNs/FCM et plusieurs services tiers. Le dépôt ne contient pas de test à cette échelle; le premier objectif documenté est 500 utilisateurs concurrents et 20 tableaux (`brain/TESTING_STRATEGY.md:116-122`). | **Non certifiable actuellement.** |
| 50 lieux simultanés dont plusieurs sous un même club | Le rattachement est actuellement organisation-wide; Redis doit être actif si l'API a plusieurs instances; capacité DB et comportement des fournisseurs partagés doivent être vérifiés. | **Risque de mauvais rattachement, plus charge non validée.** |
| Parcours Flex/Flaix sur 90 % des lieux | Le statut applicatif BreakEat n'est pas la source opérationnelle Flaix; le webhook Flaix est idempotent en succès, mais son mécanisme de doublon empêche le rejeu après échec. | **Le chemin nominal est présent; la reprise d'incident n'est pas sûre.** |
| Inscription par téléphone/SMS | Téléphone contrôlé en forme seulement; inscription actuelle par e-mail/mot de passe. | **Non disponible comme connexion SMS.** |

## Points solides observés

- La commande payée est créée dans une transaction avec paiement, lignes, trace d'état et entrée d'outbox temps réel (`orders.service.ts`). Le numéro public est unique et le compteur journalier est atomique.
- Les changements d'état de commande passent par une machine d'état; le stock utilise des réservations et écritures conditionnelles, et la capacité des créneaux est protégée côté base.
- L'idempotence des webhooks Stripe laisse les événements non traités rejouables, contrairement au handler Flaix relevé plus haut.
- Les contrôles Stripe de signature, les contrôles d'accès aux transitions, la validation des DTO et les garde-fous d'isolation multi-organisation sont présents dans les zones parcourues.
- Le suivi documenté de l'annonce « commande prête » prévoit un bail durable, une reprise et une déduplication entre instances.
- Les corrections des créneaux passés et du choix « Au plus vite » sont présentes dans le code actuel (BUG-2026-020/021).

## Validation et limites de l'audit

- Le dépôt indique CI verte sur `b430c58` (6 jobs) et les commits postérieurs examinés ici sont des mises à jour documentaires. Je n'ai pas relancé les suites sur ce poste et n'ai pas consulté les journaux Railway, les consoles Stripe/App Store/Play, les secrets de production ni les métriques réelles.
- Les tests unitaires documentés pour le service d'ouverture utilisent des doublures Prisma; ils ne simulent pas la panne entre la transition d'événement et la mise à jour des buvettes.
- La stratégie de test du dépôt fixe un premier objectif de **500 utilisateurs concurrents et 20 tableaux**, pas 10 000; aucun résultat de test de charge à 10 000 utilisateurs n'est présent dans les documents examinés.
- Le pool est réglé à 10 connexions par instance par défaut (`backend/src/database/pool.ts`), mais les limites exactes de l'offre PostgreSQL/Railway, le nombre de répliques, Redis, APNs/FCM et les latences Stripe/Flaix n'ont pas été vérifiés hors dépôt.

## Ordre recommandé des corrections

1. Fermer la course d'édition pendant checkout et créer un test de paiement simultané avec mutation.
2. Ajouter expiration/réconciliation sûre des réservations `CHECKOUT_PENDING` (Stripe + stock + créneau + fidélité).
3. Rendre le traitement des webhooks Flaix réellement rejouable après échec; couvrir panne transitoire et double livraison.
4. Rendre ouverture/fermeture événement + points de retrait transactionnelle ou réconciliable.
5. Corriger le périmètre de la route `/active` pour les opérateurs épinglés; ajouter test d'accès inter-buvette.
6. Rattacher les buvettes par lieu et rendre la création d'événement idempotente/atomique.
7. Fixer un volume maximum/pagination pour le tableau opérateur.
8. Avant d'annoncer une capacité : test de charge progressif (500, 2 000, 5 000, puis 10 000 connexions), parcours commande/paiement, plusieurs lieux, plusieurs instances, Redis, coupure/reconnexion socket, cartes refusées/abandons, et test de récupération du stock. Mesurer p95/p99, taux d'erreur, connexions DB, CPU/mémoire, Redis, commandes reçues au poste, et réconciliation Stripe.

**Décision conseillée :** poursuivre les essais contrôlés; ne pas annoncer « prêt pour 10 000 utilisateurs simultanés » avant les correctifs P1 et un test de charge concluant dans un environnement ressemblant à la production.
