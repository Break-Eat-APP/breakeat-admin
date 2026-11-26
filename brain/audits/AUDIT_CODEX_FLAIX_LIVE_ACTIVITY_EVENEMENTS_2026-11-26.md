# Audit chirurgical — intégration Flaix, événements et Live Activity — 26/11/2026

- **Dépôt :** `C:\dev\breakeat-admin`
- **Révision de base :** `a061673` (`main`).
- **État audité :** révision commitée et changements non commités observés pendant l’audit dans le schéma Prisma, le contrôleur/DTO/service Flaix, les écrans mobiles, le store, la lecture des commandes et une migration. Ils ajoutent notamment le parcours de note post-commande déclenché depuis la liste ou une notification. Le périmètre de cette vérification reste l’import d’événements et le cycle Live Activity ; le nouveau parcours de note n’a pas reçu un audit fonctionnel exhaustif. Ces changements ont été lus, sans être modifiés.
- **Interprétation du périmètre :** le dépôt nomme l’intégration « Flaix » et l’app « BreakEat » ; j’ai donc traité « Flex / Black It » comme cette intégration.
- **Méthode :** revue des flux client/API/backend/APNs, de l’import des événements, des tests disponibles et de la migration locale. Aucun appel réel à Flaix, APNs, Expo, Railway ou aux stores ; aucun essai sur appareil.
- **Écriture :** ce rapport seulement. Aucun fichier source, test, schéma ou changement existant n’a été modifié par l’audit.

## Verdict exécutif

Le raccordement est cohérent dans son architecture générale : Flaix reste la source des commandes, l’app transmet le jeton au backend, le backend confirme que cette commande appartient au compte puis la suit en base, et le serveur envoie les mises à jour d’activité directement à APNs. L’import du calendrier utilise un aperçu, un réglage par lieu, une validation de domaine, un identifiant Flaix stable et une contrainte unique par lieu.

J’ai relevé **deux défauts susceptibles de faire manquer une Live Activity**, plus un risque de sécurité déjà connu sur l’identité email. Les tests unitaires contrôlés passent, mais les tests d’intégration sur vraie base ont tous été ignorés faute de `DATABASE_URL_TEST` ; les changements non commités récents n’ont donc pas été validés par leurs tests d’intégration.

## Constats

### P2 — Une erreur APNs transitoire peut figer définitivement la Live Activity

**Fichiers :** `backend/src/modules/flaix/surveillance-commandes-flaix.service.ts` (comparaison d’état dans `verifier`, puis `pousserActivites`).

Le backend ne pousse une mise à jour que lorsque le texte brut du statut Flaix change. Après le premier essai APNs en échec, le statut est tout de même enregistré en base. Au tour suivant, le statut ne change plus : le code ne rappelle donc pas `pousserActivites`. Les erreurs temporaires (réseau, APNs indisponible, réponse 5xx) ne sont pas mises en file et ne sont jamais retentées. Seul un jeton explicitement invalide passe en `STALE`.

Même fenêtre de course au démarrage : le statut peut progresser alors qu’aucun jeton d’activité n’est encore enregistré. Le serveur constate le changement sans activité à notifier, enregistre ce statut, puis l’app enregistre son jeton après coup. L’enregistrement du jeton ne déclenche pas une synchronisation de l’état courant ; sans nouveau changement Flaix, l’activité reste sur son état initial.

**Effet :** l’app affiche correctement le suivi dans ses appels périodiques, mais l’écran verrouillé / la Dynamic Island peut rester en retard jusqu’à la prochaine transition, ou définitivement si la commande ne change plus d’état.

**Correction technique à envisager :** rendre l’envoi APNs idempotent et reprenable (état envoyé séparé de l’état observé, ou état courant renvoyé dès l’enregistrement du jeton), avec reprise après erreur temporaire.

### P2 — Le relais mobile marque le jeton « suivi » avant que l’activité ait réellement démarré

**Fichier :** `apps/mobile/src/components/relais-flaix.native.tsx`, fonction `suivreJeton`.

Sur l’app au premier plan, le jeton est ajouté à `suivies.current` avant l’appel asynchrone à `suivreCommandeFlaixDansLApp`. Si l’API est indisponible, si la commande n’est pas encore visible après les tentatives prévues, ou si iOS refuse le démarrage, une nouvelle détection du même jeton dans la page ne retente rien pendant la durée de vie de ce relais. Le `catch` final absorbe l’échec et ne retire pas le jeton de l’ensemble.

**Effet :** le suivi serveur peut finir par exister grâce à la lecture de la liste, sans que la Live Activity soit créée ; ou le client peut manquer toute l’activité après une panne temporaire. Le test unitaire du helper vérifie ses reprises de lecture, mais ne couvre pas ce verrouillage dans le composant React Native.

**Correction technique à envisager :** ne marquer comme traité qu’après confirmation du démarrage, ou distinguer explicitement les états « en cours », « démarré » et « à retenter ».

### P1 — L’identité des commandes reste fondée sur une adresse email non vérifiée

**Fichiers :** `backend/src/modules/flaix/flaix.controller.ts` et `backend/src/modules/flaix/commandes-client-flaix.service.ts`.

`mes-commandes` et l’endpoint de suivi demandent à Flaix les commandes de l’email enregistré sur le compte BreakEat. L’app ne fournit pas l’email, ce qui évite sa substitution dans la requête, mais le code ne prouve pas que le titulaire du compte contrôle cette adresse. Une personne inscrite avec l’adresse d’un autre client peut donc, si cette adresse n’est pas déjà protégée par la vérification d’email, obtenir la liste de ses commandes, faire enregistrer leur suivi et recevoir leur Live Activity / push.

Ce risque était déjà documenté comme accepté provisoirement dans l’audit précédent. Il reste bloquant avant une ouverture publique des commandes Flaix ; le cloisonnement par `userId` ne compense pas une identité initiale non vérifiée.

### P2 conditionnel — Plusieurs instances peuvent traiter le même événement de suivi simultanément

Le verrou `tourEnCours` est local à un seul processus. Deux instances peuvent sélectionner la même ligne arrivée à échéance, interroger Flaix en parallèle et envoyer deux push « prête » ou deux updates APNs. La persistance en base protège contre la perte au redémarrage, mais ne réserve pas la ligne pour un seul worker.

Je n’ai pas vérifié le nombre d’instances du service en production. Le doublon est donc conditionnel, pas constaté en production.

### Import du calendrier — garde-fous vérifiés ; activation client à confirmer

Le flux est vérifié et filtré avant écriture : HTTPS et hôtes Flaix, identifiant court du lieu borné, événements identifiés par clé Flaix, événement déjà terminé ou annulé figé, absence du flux non assimilée à une annulation. L’aperçu ne modifie pas la base. Le réglage exige les droits de gestion sur le club et vérifie que le lieu appartient bien à ce club. Une clé unique `(venueId, flaixEventId)` protège les créations en double.

**Point de parcours produit :** les événements importés sont créés avec le statut Prisma par défaut `DRAFT`. Le flux peut donc alimenter le calendrier administrateur sans rendre immédiatement ces matchs visibles aux clients. Il faut confirmer que la publication séparée est bien voulue pour « la remontée des événements sur l’application ».

**Résilience conditionnelle :** le minuteur et les ETags sont en mémoire et par processus. Plusieurs instances peuvent relire/importer le même calendrier. La contrainte unique protège les doublons de création ; elle ne réserve pas le travail et un conflit de création sera journalisé puis repris au tour suivant. Aucun statut d’instance ou nombre de réplicas production n’a été vérifié.

### Changements non commités observés — note de commande Flaix

Le travail local ajoute aussi le modèle/migration de note, la route API, le bouton dans « Mes commandes » et l’ouverture de la feuille de note depuis une notification. Le modèle/migration bornent les étoiles à 1–5, le commentaire à 1 000 caractères et imposent une note par jeton ; la route vérifie que le suivi appartient au client et que `remiseLe` est défini. Le rappel est marqué avant envoi et n’est donc pas retenté si Expo échoue ou si l’utilisateur n’a pas de jeton. Ce comportement est cohérent avec « une seule relance », mais signifie qu’un rappel peut ne jamais parvenir. Les nouveaux composants/flux de note n’ont pas de test mobile ciblé exécuté dans cet audit.

Ces ajouts sont hors du cœur demandé (Live Activity et import d’événements) et la suite d’intégration qui les teste a été ignorée dans cet environnement. Je n’en tire pas de verdict de livraison.

## Vérifications exécutées

- Backend, services Flaix et règles d’import : **2 suites, 48 tests réussis** (`commandes-client-flaix.service.spec.ts`, `flux-matchs-flaix.spec.ts`).
- Mobile, suivi, signal et navigation Flaix : **3 suites, 21 tests réussis**.
- Mobile, `pnpm exec tsc --noEmit` : **réussi** sur l’état de travail relu en fin d’audit ; les 21 tests mobiles Flaix ont aussi été relancés sur cet état.
- `pnpm exec tsc --noEmit` dans `backend` : **réussi**.
- `pnpm exec prisma validate --schema prisma/schema.prisma` : **réussi**.
- Tests d’intégration Flaix : **2 suites / 16 tests ignorés**, car `DATABASE_URL_TEST` n’est pas défini. Ils couvrent l’import sur base, la persistance du suivi, l’envoi des updates APNs simulé et les nouveaux tests de note.
- `git diff --check` : **aucune erreur d’espacement** dans les changements non commités au moment du contrôle.

## Priorités proposées

1. Ajouter une reprise APNs durable et synchroniser l’état courant quand l’activité s’enregistre.
2. Faire en sorte qu’un échec de démarrage Live Activity puisse être retenté depuis le relais.
3. Fermer le risque d’identité email non vérifiée avant ouverture publique.
4. Confirmer si les événements importés doivent rester en brouillon ou être publiés automatiquement ; faire tourner les tests d’intégration avec une base de test avant livraison.
