# Audit Codex — notifications, campagnes et « commande prête » Flaix — 21/11/2026

- **Périmètre :** notifications de commande BreakEat et Flaix, ciblage des campagnes par commandes/favoris, envoi immédiat et programmé, cycle de vie des jetons push et état de configuration mobile.
- **Révision du code :** `89904ef` (`main`).
- **Références de livraison :** 1.7.42 à 1.7.45 ; mise à jour à distance de l'app publiée le 21/11 selon `REPRISE.md`.
- **Méthode :** revue statique du backend, de l'app et de la documentation. Aucun appel à Expo, Railway, Flaix ou aux stores.
- **Modifications :** aucun code modifié. Ce rapport est le seul fichier créé.
- **Tests :** aucun test, lint, typage ou test sur appareil exécuté dans cet audit.

## Verdict

Le ciblage récent est mieux unifié : les envois immédiats et programmés d'un club utilisent le même public (clients ayant commandé ou suivi un lieu), et toucher une notification « prête » ouvre bien « Mes commandes ». Les jetons invalides sont purgés après les réponses d'Expo.

Je ne considère toutefois pas l'annonce « prête » Flaix comme garantie : la surveillance et son anti-doublon sont propres à la mémoire de chaque processus, et une notification manquée n'est pas retentée. Le contrôle par e-mail non vérifié peut aussi adresser la notification de commande à la personne qui a usurpé l'adresse. Enfin, la disponibilité Android dépend toujours du remplacement de la build publiée par la build code 8 et d'un essai réel.

## Constats

### P1 — Une adresse e-mail usurpée peut aussi recevoir le push « prête » du client

- **Fichiers :** `backend/src/modules/flaix/flaix.controller.ts:46-55`, `backend/src/modules/flaix/surveillance-commandes-flaix.service.ts:76-88, 130-149`, `backend/src/modules/auth/auth.service.ts:99-117`.
- **Vérifié :** le serveur demande les commandes Flaix par l'e-mail du compte BreakEat, puis associe chacune au `userId` connecté pour la surveillance et l'envoi du push. L'inscription par e-mail crée une session immédiatement ; le compte ne prouve pas la possession de l'adresse.
- **Scénario :** une personne s'inscrit avec l'adresse d'un client Flaix qui n'a pas encore de compte BreakEat. Elle peut voir sa commande via « Mes commandes » et le suivi peut attacher la commande à son propre `userId`. Au passage à « prête », le numéro et le point de retrait sont alors envoyés aux jetons push rattachés à ce compte.
- **Impact :** exposition de données de commande par l'écran et la notification sur l'écran verrouillé.
- **Suite :** le BUG-2026-039 et l'ADR-0015 documentent déjà le risque e-mail. La notification hérite du même défaut : utiliser une identité Flaix vérifiée (E1 et `[#breakeatId]`) ou imposer une preuve de contrôle de l'adresse avant de l'associer à la lecture Flaix. Une connexion Apple/Google ne suffit que si la preuve `email_verified` est conservée et vérifiée par cette route.
- **Statut :** confirmé, déjà connu et temporairement accepté pour les essais selon l'ADR-0015 ; à résoudre avant ouverture publique.

### P2 — La notification « prête » Flaix peut être perdue ou envoyée en double

- **Fichier :** `backend/src/modules/flaix/surveillance-commandes-flaix.service.ts:49-59, 76-124, 130-155`.
- **Vérifié :** la liste des commandes suivies et la liste des commandes déjà annoncées sont des `Map` en mémoire. Quand Flaix renvoie `ready`, la commande est retirée de la surveillance et marquée annoncée **avant** l'appel à Expo. L'envoi Expo retourne un résumé même en cas d'échec ; son champ `sent` n'est pas contrôlé pour décider d'une reprise.
- **Scénarios :**
  - un redémarrage avant le prochain GET « Mes commandes » efface les commandes suivies ; l'ADR-0015 reconnaît ce cas ;
  - si aucun jeton n'est trouvé ou si Expo échoue, la surveillance s'arrête et le push n'est pas retenté ;
  - **si plusieurs instances backend reçoivent le GET**, chacune peut conserver la même commande et la notifier : l'anti-doublon est local au processus. Le nombre d'instances actives n'a pas été vérifié.
- **Impact :** client non averti ou averti plusieurs fois, selon panne/redéploiement/scaling.
- **Suite :** remplacer le polling en mémoire par le webhook Flaix E1 et une réservation persistante/idempotente avant l'envoi ; traiter les échecs Expo comme des livraisons à reprendre sans doubler celles déjà prises en charge. Jusqu'à E1, garder explicitement ce mécanisme en mode dépannage.
- **Statut :** défauts de durabilité et de reprise confirmés ; comportement multi-instance conditionnel.

### P2 — Une déconnexion hors ligne peut laisser le jeton push lié à l'ancien compte

- **Fichiers :** `apps/mobile/src/lib/push-notifications.ts:157-170`, `apps/mobile/src/store/auth.store.ts:78-94`, `backend/src/modules/notifications/push-tokens.service.ts:18-33`.
- **Vérifié :** à la déconnexion, l'app tente de supprimer le jeton du serveur. Si l'appel échoue, l'erreur est absorbée et la référence locale est effacée quand même ; la session est ensuite supprimée. Le jeton reste alors lié à l'ancien compte en base jusqu'à sa suppression ou sa réassociation à un autre utilisateur.
- **Scénario :** téléphone partagé, déconnexion sans réseau, puis campagnes ou notification « prête » de l'ancien compte : le téléphone peut encore les recevoir.
- **Impact :** notifications destinées à l'ancien compte visibles sur un appareil qui vient d'être rendu ou partagé.
- **Suite :** conserver un retrait en attente et le retenter au prochain démarrage/connexion avant d'associer le jeton à un nouveau compte ; tester explicitement le scénario hors ligne.
- **Statut :** confirmé dans le code ; fenêtre d'exposition dépend de la reconnexion et du prochain envoi.

### P2 — Les favoris servent de critère aux campagnes, sans explication correspondante dans la politique du dépôt

- **Fichiers :** `backend/src/modules/notifications/scheduled-push.service.ts:125-178, 206-218`, `backend/src/modules/favorites/favorites.service.ts:30-36`, `documents-legaux/politique-de-confidentialite.txt` (sections 2, 3, 5 et 12).
- **Vérifié :** depuis 1.7.42, la liste des lieux suivis est copiée au serveur ; elle sert à sélectionner les destinataires des campagnes et celles-ci sont archivées dans la cloche, même pour un utilisateur sans jeton push. La politique décrit les commandes, préférences de communication et notifications commerciales, mais ne précise pas que les lieux suivis sont copiés au serveur et utilisés pour cibler ces annonces. La note de reprise signale elle-même ce point comme non revu.
- **Impact :** écart entre le traitement réellement effectué et l'information visible dans la documentation du dépôt ; l'autorisation du système d'exploitation ne bloque pas l'archivage dans la cloche.
- **Suite :** confirmer avec Rémi le sens produit du favori (simple raccourci ou accord pour recevoir des campagnes), et aligner l'information et le mécanisme de retrait avec ce choix avant d'élargir les campagnes. Ceci est un constat de cohérence du dépôt, pas une conclusion juridique.
- **Statut :** décalage documentaire confirmé ; la version publiée du texte légal et les déclarations des stores n'ont pas été consultées.

### P2 — Les envois immédiats ne sont pas archivés dans la cloche, contrairement aux programmés

- **Fichiers :** `backend/src/modules/backoffice/backoffice.service.ts:397-444`, `backend/src/modules/notifications/scheduled-push.service.ts:206-218`, `backend/src/modules/notifications/user-notifications.service.ts:23-61`.
- **Vérifié :** l'envoi immédiat du back-office récupère le public et envoie un push, mais ne crée pas d'entrée `UserNotification`. Le chemin programmé archive le message pour les utilisateurs avant l'envoi, y compris ceux qui n'ont pas de jeton.
- **Scénario :** un client ciblé qui a refusé les notifications système, ou qui était hors ligne pendant l'envoi immédiat, ne retrouve pas l'annonce dans la cloche ; la même campagne programmée y resterait consultable.
- **Impact :** différence de résultat entre « Envoyer maintenant » et « Programmer », malgré le ciblage désormais partagé.
- **Suite :** décider si l'immédiat est volontairement éphémère. Si les deux gestes doivent offrir la même annonce consultable, partager le calcul des `userIds` et appeler l'archivage avant l'envoi immédiat.
- **Statut :** différence de code confirmée ; le comportement produit attendu pour l'envoi immédiat reste à trancher.

### P3 — Le renouvellement d'un jeton push n'est pas observé pendant une session ouverte

- **Fichier :** `apps/mobile/src/lib/push-notifications.ts:40-71`.
- **Vérifié :** le jeton est obtenu et enregistré à la connexion, mais aucun écouteur de rotation du jeton n'est installé dans ce module. Les jetons rejetés sont purgés côté serveur.
- **Scénario conditionnel :** si Expo/FCM renouvelle le jeton pendant que l'app reste ouverte, le serveur peut conserver l'ancien jusqu'à son rejet ; le nouveau ne sera envoyé qu'au prochain appel à `enregistrerPush`.
- **Impact :** interruption temporaire des notifications sur cet appareil.
- **Suite :** écouter les changements de jeton selon l'API Expo utilisée et réenregistrer le nouveau jeton ; confirmer le comportement sur appareils réels.
- **Statut :** absence d'écouteur vérifiée ; fréquence et impact réels non mesurés.

## État de mise en service documenté

- **Android :** `REPRISE.md` indique que la version publique code 7 ne contient pas la configuration Firebase nécessaire. La build code 8 contient cette configuration et a été envoyée pour examen, mais la note ne confirme pas encore sa publication ni un test de notification sur Android. **Je n'ai pas consulté la Play Console.** Tant que code 8 n'est pas installé, l'envoi push Android ne peut pas être considéré comme vérifié.
- **iOS :** la reprise indique que la clé APNs a été importée dans Expo, mais que l'envoi doit encore être vérifié par une vraie notification sur iPhone. **Je n'ai pas consulté Expo ni testé un appareil.**
- **Campagnes :** le ciblage commandes + favoris et le changement 1.7.43 sont dans le code. Les notes rapportent un déploiement serveur, mais cet audit n'a pas relu Railway ni envoyé de push de production.
- **Notification Flaix :** les tests unitaires présents couvrent les transitions, une seule émission dans un processus, et l'échec d'envoi ; ils ne valident pas la reprise après redémarrage, plusieurs instances, ni un vrai trajet Expo → appareil.

## Contrôles positifs vérifiés

- Le jeton push est enregistré et supprimé par des routes authentifiées ; il est validé au format Expo.
- Les jetons rejetés par Expo sont purgés après les envois de campagnes, commandes et surveillance Flaix.
- Le toucher de `order_ready` est routé vers « Mes commandes » dans l'app, y compris au démarrage à froid.
- Le ciblage immédiat d'un club réutilise le ciblage centralisé des campagnes ; les favoris sont limités aux lieux du club.
- Les campagnes programmées sont archivées même quand le client n'a pas de jeton système, afin d'être consultables dans la cloche.

