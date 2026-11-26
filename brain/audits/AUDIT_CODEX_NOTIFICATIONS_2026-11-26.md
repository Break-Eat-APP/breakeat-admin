# Audit Codex — notifications de l’application — 26/11/2026

- **Dépôt :** `C:\dev\breakeat-admin`
- **Révision :** `967ab2b` (`main`, 1.7.65).
- **État pris en compte :** révision commitée et modifications locales visibles pendant l’audit. Elles touchent notamment aux images des tickets Flaix et au visuel de la Live Activity (état récupéré, logo et numéro) ; elles ne changent pas le transport des push audité ici. Elles n’ont pas été modifiées.
- **Périmètre :** inscription des appareils, permission, push Expo, campagnes immédiates et programmées, cloche, badge et ouverture des notifications, pushes de commande Flaix.
- **Méthode :** lecture statique et tests ciblés. Aucun envoi Expo/APNs réel, aucune console EAS/Railway/stores consultée, aucun essai sur téléphone.
- **Modifications par Codex :** ce rapport seulement.

## Synthèse

Le défaut qui empêchait l’inscription des téléphones sous Expo SDK 57 a été corrigé dans 1.7.65 : l’app ne dépend plus de `Constants.isDevice`, retiré dans cette version. Le jeton est obtenu puis rattaché au compte, renouvelé en cours de session et retiré à la déconnexion. Les campagnes immédiates et programmées sont archivées côté serveur afin de rester consultables dans la cloche.

J’ai trouvé trois incohérences d’expérience à corriger ou à trancher : l’interface peut afficher « notifications activées » sans que l’appareil soit enregistré côté serveur ; le compteur de la cloche compte aussi des push qui ne figurent pas dans la cloche ; l’écran marque les messages comme lus avant d’avoir confirmé que la liste a pu être chargée. Le toucher d’une notification de campagne n’est pas non plus relié à l’écran de la cloche.

## Constats

### P2 — « Notifications activées » ne confirme pas l’inscription effective de l’appareil

**Fichiers :** `apps/mobile/src/lib/permission-notifs.ts:76-100`, `apps/mobile/src/lib/push-notifications.ts:60-101`.

`demanderNotifs()` renvoie `accordee` si le système d’exploitation autorise les notifications. Elle appelle ensuite `enregistrerPush()`, mais cette fonction absorbe toutes les erreurs et ne renvoie pas de résultat : erreur Expo, absence de jeton, erreur réseau/API ou jeton non enregistré. Le profil affiche donc « Notifications activées » même si aucun jeton ne se trouve en base et que les campagnes ne peuvent pas atteindre ce téléphone.

Sur le web, le code ne fait que demander la permission du navigateur. Il n’obtient ni jeton Web Push ni abonnement transmis au backend, qui cible des jetons Expo. Un navigateur peut donc afficher « activées » sans être destinataire de push distants.

**Effet :** état de permission confondu avec état de livraison/inscription. La cloche et ses actualisations périodiques peuvent afficher les annonces, mais ne réparent pas l’absence de push.

### P2 — Le badge compte des push qui ne sont pas enregistrés dans la cloche

**Fichiers :** `apps/mobile/App.expo.tsx:198-199`, `apps/mobile/src/store/notif.store.ts:49`, `backend/src/modules/notifications/user-notifications.service.ts`, chemins d’envoi direct tels que `backend/src/modules/orders/produits-manquants.service.ts:236` et `backend/src/modules/flaix/surveillance-commandes-flaix.service.ts:278,518`.

À la réception de **tout** push app ouverte, `pushReceived()` ajoute 1 au nombre local de non-lues. Or le nombre serveur est fondé sur les lignes `UserNotification`, créées par les campagnes immédiates/programmées. Les push opérationnels de commande (produit manquant, commande prête, relance de note) sont envoyés directement et ne créent pas ces lignes.

**Effet :** après réception au premier plan d’un push opérationnel, le badge peut s’allumer alors que l’écran « Notifications » ne contient aucun nouvel élément correspondant. Il sera corrigé au prochain rafraîchissement serveur, mais peut induire le client en erreur entre-temps. Les push par étape de commande, eux, ont été explicitement retirés pour éviter de doubler la Live Activity ; ce choix connu n’est pas compté comme un défaut.

### P2 — La cloche marque tout comme lu avant le résultat du chargement

**Fichier :** `apps/mobile/src/screens/notifications.screen.tsx:30-50`.

À l’ouverture, l’écran lance `charger()` et appelle `markRead()` immédiatement, sans attendre le succès du chargement. Si la liste échoue alors que la requête de marquage réussit, le serveur marque les annonces comme lues sans que leur contenu ait été affiché. Quand le chargement réussit, la liste reçue peut encore contenir `lue: false` : l’écran conserve ces points de non-lu pendant que la cloche a déjà été remise à zéro côté serveur.

**Effet :** risque de messages consommés sans lecture lors d’une panne partielle et indicateur visuel momentanément contradictoire. Il faudrait lier le marquage à la réussite du chargement et mettre à jour la liste locale avec ce marquage.

### P3 — Toucher une notification de campagne ne mène pas à la cloche

**Fichiers :** `apps/mobile/App.expo.tsx:218-230`, `backend/src/modules/backoffice/backoffice.service.ts:435-444`, `backend/src/modules/notifications/scheduled-push.service.ts:226`.

Le gestionnaire mobile ne traite que `data.type` valant `missing_items`, `order_ready` ou `noter_commande`. Une campagne programmée envoie `kind` et `eventId`, sans `type`; une campagne immédiate n’envoie pas de champ `data`. Le gestionnaire retourne donc sans ouvrir l’écran « Notifications » pour ces campagnes.

**Effet :** le push de campagne ouvre l’app sur son écran courant/par défaut ; l’annonce reste dans la cloche, mais il faut la trouver manuellement. Si c’est le comportement attendu, aucune correction n’est nécessaire ; sinon, il manque une destination de campagne commune.

## Points connus et choix produit non comptés comme nouveaux défauts

- `OrderNotificationsService.notifyStatusChange` reste conservé mais n’est plus appelé : le dépôt documente le retrait volontaire des push à chaque étape, car la Live Activity couvre déjà cette progression.
- Les campagnes ciblent aussi les utilisateurs qui suivent un lieu ; la question d’information/consentement sur les favoris est déjà suivie comme point connu dans les audits précédents. Je ne la réouvre pas ici.
- La relance Flaix « Note ta commande » est marquée avant l’envoi et n’est pas retentée après un échec ; ce choix « une relance maximum » avait été accepté précédemment.
- Les statuts `SENT`/`sentCount` indiquent les tickets acceptés par Expo, pas une preuve de réception sur le téléphone. Le dépôt ne traite pas les reçus Expo.

## Vérifications exécutées

- Backend notifications : **5 suites, 34 tests réussis** (Expo, jetons, cloche, campagnes, statut d’envoi).
- Mobile notifications : **4 suites, 31 tests réussis** (permissions/appareil, jetons, ouverture de push, dates de la cloche).
- TypeScript backend : `pnpm exec tsc --noEmit` — **réussi**.
- TypeScript mobile : `pnpm exec tsc --noEmit` — **réussi**.
- `git diff --check` — **réussi**.
- Aucune vérification d’un envoi réel après la correction SDK 57. Les tests couvrent la détection « vrai téléphone » et les fonctions de jeton, pas la réception réelle via Expo/APNs/FCM.

## Conclusion

Le socle de push est présent et les contrôles ciblés passent. Le principal risque concret est l’interface qui annonce une activation réussie sans savoir si l’inscription au backend a abouti. Le badge et la liste de la cloche ont aussi des sources de vérité différentes pour les push opérationnels. Un essai sur iPhone et Android installés depuis les builds actuelles reste nécessaire pour confirmer la chaîne appareil → Expo/FCM/APNs → affichage et toucher.
