# Audit chirurgical — livraisons du 11 au 17 novembre 2026

**Date :** 17/11/2026  
**Dépôt :** `Break-Eat-APP/breakeat-admin`  
**Révision locale examinée :** `7b95f7ce07f6f466f21216fea1fba0c0e183dac3` (`main`, dépôt propre)  
**Diff fonctionnel principal :** `3e46858..HEAD` ; périmètre demandé : `5c993f4..HEAD`, changements du 11 au 17/11 et CHANGELOG 1.7.16 à 1.7.40.  
**Approche :** lecture ciblée du code et de ses appels, recoupement des tests, de la CI, du registre de bugs, des décisions ADR-0009 à 0012, de REPRISE et des comptes rendus. Pas de modification du code applicatif.

## Verdict

Les deux défauts panier relevés le 10/11 ont été corrigés dans le code examiné : le choix du créneau est maintenant réservé aux paniers modifiables, et les réservations de stock/créneau sont protégées par des mises à jour conditionnelles. Les contrôles d’isolation entre organisations, le consentement aux invitations, le refus des créneaux passés et le lien HTTPS de partage sont cohérents avec les décisions du projet.

J’ai trouvé **un défaut P1 de cohérence dans l’ouverture/fermeture automatique** : l’événement change de statut avant la mise à jour des points de retrait, sans transaction commune ni rattrapage des événements déjà basculés. Une erreur transitoire entre ces écritures peut laisser l’événement et les points de retrait dans des états contradictoires.

Deux risques multi-lieux sont déjà décrits comme assumés par l’équipe, mais ils ont un effet opérationnel concret : le statut d’un point de retrait est partagé entre ses événements et le rattachement automatique sélectionne les points du club, même si ce club gère plusieurs lieux. Ils méritent un essai contrôlé avant une exploitation simultanée sur plusieurs lieux.

**Production stores : pas encore prête à publier au public selon les documents du dépôt.** La production Stripe est en mode test ; une vraie carte serait refusée. Google et Apple sont en examen selon le compte rendu. La décision ADR-0012 impose une publication manuelle après bascule Stripe live et vérification d’un vrai paiement.

## Périmètre de vérification et preuves

| Contrôle | Résultat constaté |
|---|---|
| Dépôt | `git status` propre au début de l’audit. |
| CI | REPRISE indique 6 jobs verts sur `b430c58` le 17/11. Le commit local `7b95f7c` est un commit de documentation ; le check GitHub lu sur ce commit est la publication du canal production, réussie. |
| Tests des corrections examinées | Le compte rendu du développeur indique 113 tests panier/commandes verts, `tsc` et lint serveur verts, tests organisations 31/31 et tests ouverture/rattachement (4 + 8) verts. Ces commandes n’ont pas été relancées pendant cet audit. |
| Intégration | La CI sur PostgreSQL réel est indiquée verte après correction du test de rattachement dupliqué. Pas de nouveau test d’intégration lancé localement. |
| Stores et paiement | État repris du compte rendu de soumission 1.1.3 et de REPRISE ; consoles Apple, Google, Stripe et variables Railway non inspectées directement. |

## Constats

### P1 — La bascule automatique n’est pas atomique avec l’ouverture/fermeture des points de retrait

**Code :** `backend/src/modules/events/ouverture-automatique.service.ts:89-99` et `:121-149`.

À l’ouverture, le code passe d’abord l’événement de `DRAFT` à `ACTIVE`, puis exécute séparément `supplier.updateMany(CLOSED → OPEN)`. À la fermeture, il passe l’événement à `ENDED`, puis ferme les points de retrait dans une écriture distincte. Si la seconde écriture échoue (connexion DB interrompue, timeout, erreur transitoire), l’exception remonte au `tic()` qui journalise l’erreur.

À la minute suivante, l’ouverture ne sélectionne que les événements `DRAFT`; la fermeture ne sélectionne que `ACTIVE` ou `PAUSED`. L’événement déjà basculé n’est donc plus candidat : les points peuvent rester fermés pour un événement actif, ou ouverts après la fin. Le traitement peut également s’interrompre au milieu d’une liste d’événements.

**Scénario :** la commande d’un match s’ouvre à 08:00, l’événement devient actif, puis la base coupe avant l’ouverture des points de retrait. Les commandes restent indisponibles, et le cron ne réessaie pas cette partie après le rétablissement.

**Correction conseillée :** mettre le changement d’événement et les effets locaux en transaction quand c’est possible, et ajouter une réconciliation idempotente qui compare périodiquement les événements actifs/terminés aux statuts de points de retrait. Le rattrapage doit respecter l’état global partagé et les événements simultanément servis. Ajouter des tests injectant un échec entre les deux écritures et prouvant la réparation au tic suivant.

### P2 — Les points de retrait du club sont rattachés aux événements de tous ses lieux

**Code :** `backend/src/common/helpers/rattachement-buvettes.ts:29-45` et appel création d’événement `backend/src/modules/events/events.service.ts:101-114`.

La sélection de rattachement filtre par `organizationId`, pas par `venueId`. Un club qui opère deux stades voit donc ses points de retrait proposés pour les événements des deux stades. L’ADR-0009 documente que le responsable doit désactiver manuellement les points de l’autre lieu.

**Statut : risque assumé, pas défaut caché.** Si un rattachement erroné reste actif, un client peut voir ou sélectionner un point de retrait d’un autre site. Sur 30 lieux, cette règle exige une vérification de configuration événement par événement.

**À faire avant multi-déploiement :** tester un club à deux lieux de bout en bout et documenter un contrôle de publication d’événement qui vérifie les points actifs et leur lieu.

### P2 — L’ouverture d’un point pour un événement change son statut global

**Code :** `ouverture-automatique.service.ts:96` et fermeture `:146-149`.

Le statut est porté par `Supplier`, et les mises à jour modifient le point de retrait globalement. Si le même point sert plusieurs événements ou sites, l’ouverture d’un événement peut ouvrir le point pour les autres; la fermeture peut également interagir avec le choix manuel du comptoir. L’ADR-0009 et le compte rendu de relecture identifient explicitement ce risque.

**Statut : assumé, avec conséquence visible.** Pour une trentaine de lieux, valider que chaque point est bien propre à son site/événement avant d’activer l’automatisme. À plus long terme, porter l’état d’ouverture sur l’association événement-point plutôt que sur le fournisseur global.

### P2 — Événement et rattachements naissent dans des opérations séparées

**Code :** `backend/src/modules/events/events.service.ts:101-114`; `rattachement-buvettes.ts:29-45`.

L’événement est persisté avant le rattachement des points et la création des comptoirs par défaut. Une erreur après `event.create()` laisse l’événement en base mais retourne une erreur à l’interface. Un nouvel essai utilisateur peut créer un deuxième événement, tandis que le premier demeure incomplet. La logique de création des points par défaut n’est pas dans la transaction de création de l’événement.

**Correction conseillée :** faire naître événement, rattachements et comptoirs dans une transaction, ou rendre l’opération de finalisation reprenable et exposer un statut/diagnostic d’événement incomplet. Tester une erreur simulée après la création de l’événement.

### P2 — Les invitations existantes sont bien cloisonnées, mais l’acceptation fait une lecture avant transaction

**Code :** `backend/src/modules/organizations/organizations.service.ts:667-696`.

Le code relit l’invitation avec `{id, userId}`, vérifie l’expiration, puis crée l’appartenance et supprime l’invitation dans une transaction. L’identité destinataire est correctement liée; l’invitation expire après 14 jours et les tests croisés entre clubs ont été ajoutés.

**Course rare à couvrir :** le test d’expiration se fait avant l’ouverture de la transaction. Si l’invitation expire entre la lecture et la transaction, elle peut être acceptée après son échéance. Si l’invitation est simultanément réémise avec un nouveau rôle, l’acceptation peut utiliser les anciennes valeurs puis supprimer la nouvelle invitation. En pratique la fenêtre est petite, mais un verrou/une lecture avec contrôle conditionnel dans la transaction rendrait l’invariant précis.

**Test à ajouter :** réémission concurrente pendant l’acceptation et expiration survenue avant validation transactionnelle.

## Points corrigés et revérifiés dans le code

- **BUG-2026-020, créneau passé :** `assertCreneauCompatible(..., exigerOuvert)` vérifie le statut ouvert et `endAt > maintenant` pour un choix client; les autres rattachements restent possibles.
- **BUG-2026-021, « Au plus vite » :** les écrans panier/checkout envoient toujours le créneau, y compris `null`, pour effacer le choix antérieur.
- **Course du choix pendant le checkout :** `choisirCreneau()` exige désormais `requireEditable`, puis relit l’état sous transaction avant de libérer ou changer la réservation.
- **Deux checkouts pour le même panier :** la réservation stock et créneau utilise une écriture conditionnelle sur les champs de réservation avant le prélèvement; une transaction perdante ne réserve pas de nouveau stock/capacité.
- **Créneaux communs opérateur :** les créneaux communs sont visibles mais désactivés en lecture seule pour un opérateur épinglé à une buvette.
- **Invitation d’un compte existant :** le club crée une invitation à accepter; aucun droit n’est appliqué avant acceptation. L’invitation est liée à l’utilisateur et la migration utilise des UUID cohérents avec les clés référencées.
- **Partage de l’addition :** le code construit un lien depuis `app.split.webUrl` vers `/split/:code`; la réservation d’articles utilise un `updateMany` conditionnel `FREE → RESERVED`, ce qui protège deux convives qui choisissent le même article.

## Capacité, Flex et lancement réel

- **30 lieux :** aucune limite structurelle immédiate trouvée dans les fonctionnalités examinées, mais le rattachement de points est par organisation et leur statut est global. La topologie des organisations et lieux doit donc être testée, pas seulement le nombre de lieux.
- **Flex :** ce dépôt n’exécute pas le checkout Flex. Pour les lieux configurés Flaix/Flex, Break Eat sert la découverte et le relais; la capacité de commande et de paiement dépend du système cible et de son API. La présente revue ne peut pas certifier son débit.
- **Inscription massive :** le précédent banc de charge mesure environ 14,5 inscriptions e-mail/s sur une instance locale; aucun test multi-instances Railway ou pic d’inscriptions à l’échelle nationale n’est joint à ce lot.
- **Commandes Break Eat :** ces changements ne constituent pas un banc de milliers de paiements simultanés. La charge doit inclure panier, réservation, Stripe, webhook, comptoir et base de données.
- **Stripe :** au dernier état documenté, la production reste en mode test. Ne pas autoriser la publication publique avant la bascule live, le webhook live et un vrai paiement de bout en bout.
- **Appareils :** Android 1.1.3 est en examen et sa build n’a pas été essayée sur un téléphone Android selon le dossier. Le fonctionnement compilé n’équivaut pas à un test push/connexion/appareil réel.

## Priorités avant la publication

1. Corriger ou réconcilier les états partiels du cron ouverture/fermeture, avec test de panne entre les écritures.
2. Tester une organisation ayant au moins deux lieux, avec événements concurrents, points de retrait et ouvertures/fermetures automatiques.
3. Faire un pilote réel sur un lieu BreakEat et suivre les journaux aux heures d’ouverture/fermeture; contrôler commandes payées déjà en préparation lors de la fermeture.
4. Réaliser un banc de charge de préproduction pour les flux réellement gérés par Break Eat, et obtenir les mesures correspondantes de Flex pour les lieux délégués.
5. Terminer le passage Stripe en production et vérifier un paiement/remboursement réels avant publication store; faire un essai de la build Android 7 sur téléphone.

## Sources de l’audit

- `brain/audits/DEMANDE_AUDIT_CODEX_2026-11-17.md`
- `brain/taches/2026-11-17-relecture-avant-audit.md`
- `brain/taches/2026-11-16-ouverture-automatique-points-de-retrait.md`
- `brain/taches/2026-11-16-test-croise-organisations.md`
- `brain/taches/2026-11-17-soumission-stores-1.1.3.md`
- `brain/DECISIONS/ADR-0009-points-de-retrait-rattaches-et-ouverture-automatique.md`
- `brain/DECISIONS/ADR-0010-invitation-a-accepter.md`
- `brain/DECISIONS/ADR-0011-au-plus-vite-et-creneaux-passes.md`
- `brain/DECISIONS/ADR-0012-publication-manuelle-des-stores.md`
- `brain/BUGS_ET_INCIDENTS.md`, `REPRISE.md`, `CHANGELOG.md`
