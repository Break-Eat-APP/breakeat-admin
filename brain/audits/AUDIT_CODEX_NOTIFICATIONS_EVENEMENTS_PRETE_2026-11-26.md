# Audit chirurgical — notifications, événements de commande et annonce « prête »

- **Date :** 26 novembre 2026
- **Dépôt :** `C:\dev\breakeat-admin`
- **Révision examinée :** `b028f84` (branche `main`), application **1.7.68**, build mobile **1.1.5**
- **Travaux récents couverts :** `6143900` (état des notifications, cloche et badge), `806c77f` (version/build), `b028f84` (présentation Live Activity/Dynamic Island)
- **État du dépôt au début et à la fin :** propre ; aucun fichier source modifié.
- **Méthode :** lecture du code et des tests ciblés. Aucun push réel APNs/Expo ni essai physique sur iPhone/Android n’a été effectué.

## Synthèse

Le parcours « commande prête » est maintenant conçu pour prévenir le client avec un son et une notification :

- **Commande BreakEat sur iOS avec Live Activity active :** mise à jour APNs de l’activité avec titre, texte et `sound: default`. Cette alerte est le canal principal ; le push Expo n’est pas envoyé en parallèle si APNs a accepté au moins une activité.
- **Commande BreakEat sans Live Activity** (notamment Android, activité absente/refusée/terminée) : notification Expo classique avec `sound: default`.
- **Commande Flaix :** notification Expo classique avec `sound: default`; en cas d’échec signalé, le suivi Flaix retente selon sa politique et son nombre maximal d’essais.
- **Application ouverte :** Expo Notifications demande explicitement l’affichage de la bannière/la liste et la lecture du son.
- **Progression ordinaire :** les autres étapes sont mises à jour sans son. Seule l’étape « prête » doit sonner.

**Conclusion :** le déclenchement sonore est bien présent dans le code pour « prête », sans doublon volontaire entre Live Activity et push classique. Je relève toutefois **un défaut P1 de reprise pour les commandes BreakEat** : une panne Expo qui est retournée comme un résultat normal avec zéro envoi est marquée comme annonce faite, et ne sera donc pas retentée. Les tests actuels couvrent l’exception levée, mais pas ce retour d’échec normal.

Le son effectivement entendu reste conditionné par le téléphone : autorisation des notifications, réglages de son/canal, mode silencieux/Concentration et livraison APNs/Expo. Ce point ne peut pas être certifié par une lecture de code ou les tests unitaires.

## 1. Annonce « prête » — commandes BreakEat

### Parcours constaté

Dans `backend/src/modules/live-activity/live-activity.service.ts` :

1. Une transition vers `READY` déclenche `annoncerCommandePrete()`.
2. L’état affiché est relu ; le serveur ne sonne pas si la commande n’est pas réellement `READY`.
3. Une réservation en base (`readyAnnounceDueAt`, `readyAnnouncedAt`, compteur d’essais) évite les annonces simultanées ou répétées.
4. Le serveur envoie d’abord une mise à jour Live Activity avec une alerte contenant « Ta commande est prête », le numéro et le point de retrait.
5. Si aucune Live Activity n’a été acceptée par APNs, il récupère les jetons utilisateur et envoie une push Expo classique avec `sound: 'default'` et `data.type: 'order_ready'`.
6. L’app traite `order_ready` et ouvre « Mes commandes ».
7. Un cron de reprise examine les réservations échues chaque minute.

Le payload APNs de Live Activity inclut `aps.alert.sound = default` quand l’appelant fournit une alerte. Les mises à jour d’étape ordinaires ne portent pas de champ `alert` et restent silencieuses.

### P1 — Un échec Expo résolu avec zéro envoi est enregistré comme « fait »

**Fichier :** `backend/src/modules/live-activity/live-activity.service.ts:566-595`.

Après la tentative de push Expo, le code ne vérifie pas `resultat.sent`. Il marque ensuite systématiquement `readyAnnouncedAt` et efface l’échéance de reprise. Or `ExpoPushService.send()` ne rejette pas sa promesse sur une panne HTTP, une erreur réseau ou un ticket Expo en erreur : il renvoie un résultat avec `sent: 0` et `failed > 0`.

**Effet concret :** avec une Live Activity absente et un jeton existant, une panne transitoire d’Expo peut faire manquer la notification « prête » sans reprise automatique. Le cas « aucun appareil enregistré » est également marqué fait ; c’est cohérent avec le fait qu’aucun destinataire n’existe, mais distinct d’un échec transitoire alors que des appareils sont inscrits.

**Preuve dans les tests :** le test de reprise simule `expo.send` qui *rejette* sa promesse. Il ne simule pas le comportement de production documenté du service Expo : une promesse résolue avec `{ sent: 0, failed: 1 }`. C’est précisément le chemin non couvert.

**Correction proposée à l’équipe :** ne marquer l’annonce comme faite que si au moins un envoi a été accepté par APNs ou Expo, ou s’il n’existe réellement aucun appareil à contacter. Si des jetons existent mais que tous les envois échouent, conserver l’annonce en attente pour le rattrapage, dans les limites d’essais prévues. Ajouter un test avec un résultat Expo `sent: 0`.

### Limite de garantie du son

Le serveur confirme l’acceptation d’un ticket par APNs/Expo, pas la réception ni l’audibilité sur le téléphone. Une Live Activity APNs acceptée ne déclenche pas le fallback Expo : c’est le comportement voulu pour éviter deux alertes, mais le code ne peut pas savoir si l’utilisateur a entendu le son.

## 2. Annonce « prête » — commandes Flaix

Le service de surveillance Flaix envoie une push Expo classique avec titre, consigne de retrait et `sound: 'default'`. Il considère l’envoi réussi uniquement si `sent > 0`. Un résultat Expo à zéro reste en échec et réessaie ; après le maximum configuré d’essais, il journalise l’abandon.

Le parcours Flaix est donc plus cohérent que le parcours BreakEat sur le traitement d’un résultat Expo résolu avec zéro envoi. Le changement dynamique de statut affiché sur la Live Activity (build 1.1.5) est visuel ; il ne remplace pas cette notification sonore.

## 3. Événements et navigation côté application

- Les pushes de commande `order_ready` ouvrent « Mes commandes » ; les campagnes portent désormais `type: 'campagne'` et mènent à la cloche.
- Le badge est relu auprès du serveur au lieu d’être incrémenté aveuglément pour chaque push.
- La liste de notifications n’est marquée comme lue qu’après un chargement réussi.
- L’écran profil distingue permission accordée et appareil réellement relié au serveur ; le web et les simulateurs sont affichés comme indisponibles.
- Les progressions de commande restent volontairement silencieuses ; « prête » est le seul événement de progression qui sonne.
- Les commits du build 1.1.5 modifient la présentation de la Live Activity/Dynamic Island. Je n’ai pas trouvé, dans ces changements, de modification du protocole d’événements ou de transport de push.

Le précédent audit des événements Flaix et sa réponse documentent déjà la reprise des mises à jour APNs, les activités enregistrées tardivement et la réservation du traitement de chaque commande ; ces corrections sont présentes dans l’historique récent et ne sont pas rouvertes ici.

## 4. Permission et son sur les appareils

Le gestionnaire mobile demande `shouldPlaySound: true` quand une notification arrive app ouverte. Les envois classiques incluent `sound: 'default'`, et l’alerte de Live Activity ajoute aussi le son par défaut.

Je n’ai pas trouvé de création explicite d’un canal Android dédié dans le code applicatif. Le son Android dépend donc aussi du canal configuré par le système/l’environnement natif et des préférences de l’utilisateur. Il faut vérifier sur une build installée que le canal utilisé est audible et que l’autorisation système est accordée. Pour iOS, le mode silencieux, Concentration et le réglage des notifications peuvent également neutraliser ou différer le son.

**À confirmer sur appareils réels :** une commande BreakEat prête sur iPhone avec Live Activity active, une commande prête sur Android, puis une commande Flaix prête ; vérifier écran verrouillé, app au premier plan/arrière-plan, son autorisé et appui sur la notification. Le build 1.1.5 est identifié dans le dépôt, mais sa publication/distribution effective et ces essais terrain ne sont pas vérifiables depuis le code local.

## Vérifications exécutées

- Backend : `live-activity.service.spec.ts`, `apns-payload.spec.ts`, `expo-push.service.spec.ts` — **3 suites, 44 tests réussis**.
- Mobile : `jeton-push.test.ts`, `permission-notifs.test.ts`, `ouvertures-notification.test.ts` — **3 suites, 16 tests réussis**.
- Les avertissements console des tests mobiles portent sur les scénarios simulés de retrait de jeton hors ligne ; les suites réussissent.
- Aucun test d’intégration avec fournisseur push réel, aucun test sur appareil et aucune vérification de réception utilisateur.

## Verdict

Le mécanisme sonore et la notification « commande prête » sont présents pour BreakEat et Flaix, et le parcours Flaix conserve les échecs Expo pour réessayer. **À corriger avant de considérer la fiabilité BreakEat entièrement auditée : le traitement des réponses Expo résolues avec zéro envoi dans `annoncerCommandePrete()`.** Le reste du résultat porte sur le code et les tests, pas sur une preuve de son audible sur les téléphones ni sur la distribution effective du build.
 
