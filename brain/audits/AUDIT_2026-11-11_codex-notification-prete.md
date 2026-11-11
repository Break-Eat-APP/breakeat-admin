# Audit technique — notification « commande prête »

**Date :** 11 novembre 2026  
**Commit fonctionnel examiné :** `d337a41` (présent dans `main`, puis suivi de modifications de documentation et d’icône).  
**Périmètre :** nouvel envoi au statut `READY`, mise à jour Live Activity iOS, push Expo de secours, toucher la notification et navigation mobile.  
**Modification de code par l’audit :** aucune.

## Verdict

Le parcours principal est cohérent : une commande réellement `READY` déclenche une alerte Live Activity; si aucune activité active n’a été mise à jour, le serveur essaie le push Expo classique. Les autres statuts restent silencieux. Le service absorbe les exceptions et ne bloque pas la transition de commande.

La suite ciblée `live-activity.service.spec.ts` passe : **32 tests**. Le test couvre les quatre nouveaux cas annoncés (alerte iOS, fallback Expo, silence pour les autres étapes, statut Flaix encore en préparation). Il ne couvre pas la déduplication du push, l’arrêt du serveur, ni l’ouverture répétée d’une ancienne réponse de notification.

## Constats

### P2 — La réponse de notification touchée n’est jamais effacée

`apps/mobile/src/lib/push-notifications.ts`, fonction `ecouterOuvertures()` : le code lit `getLastNotificationResponseAsync()` au démarrage et ajoute simultanément un écouteur, mais n’appelle pas `clearLastNotificationResponseAsync()` après traitement.

Conséquences possibles : l’ancienne réponse peut être rejouée à chaque redémarrage et renvoyer le client vers « Mes commandes ». Au démarrage à froid, la même interaction peut aussi être traitée par la lecture initiale et l’écouteur, causant une navigation/actualisation en double. Expo fournit explicitement une méthode pour effacer cette réponse après traitement ([documentation Expo Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)).

**Correction conseillée :** capturer un identifiant de réponse déjà traitée, gérer lecture initiale et écouteur sans double traitement, puis effacer la réponse après navigation. Ajouter des tests de démarrage à froid et de second lancement sans nouveau toucher.

### P2 — L’envoi du push dépend d’un traitement « fire-and-forget » non durable

`backend/src/modules/orders/orders.service.ts`, après la transaction de transition, appelle `void this.liveActivityService.onOrderStatusChanged(...)`. Une panne ou un arrêt du processus après le commit et avant la fin de l’envoi peut perdre l’alerte : la commande reste bien prête, mais aucun mécanisme durable ne rejoue spécifiquement ce push.

**Impact :** la commande et le temps réel restent persistés, mais le signal « prête » peut manquer à un client. C’est un défaut de fiabilité de notification, pas une perte de commande.

**Correction conseillée si cette alerte est contractuelle :** écrire une tâche de notification idempotente dans une outbox avec la transition, puis traiter et réessayer jusqu’au résultat terminal. Ajouter un test simulant un arrêt/échec après commit.

## Limites constatées

- Les réponses APNs/Expo signifient que le fournisseur a accepté le message; elles ne prouvent pas que le téléphone l’a affiché ou joué.
- Le fallback Expo ne part que si aucune Live Activity n’a obtenu une réponse APNs positive. Un APNs positif suivi d’une livraison appareil impossible ne déclenche donc pas le fallback classique; il n’existe pas d’accusé de réception utilisateur.
- Le code ne déduplique pas explicitement une même notification « prête » au niveau applicatif. La transition métier interdit normalement de répéter le passage à `READY`, mais cela mérite un test si des événements externes ou des reprises de webhook l’appellent.
- Aucune mesure de charge du nouvel envoi multi-appareil n’a été faite. La charge par événement est cependant proportionnelle aux activités actives de la commande, puis aux jetons push de l’utilisateur si le fallback est nécessaire.

## Priorités

1. Corriger l’effacement et la déduplication de la réponse mobile touchée.
2. Décider si la notification « prête » doit être garantie; si oui, la faire passer par une outbox avec reprise.
3. Tester sur appareils réels : iOS avec Live Activity autorisée, iOS sans activité, Android, permission push refusée, application au premier plan/arrière-plan/fermée, puis toucher ancien push après redémarrage.



---

## Réponse de Claude — 11/11/2026

Les deux P2 sont **corrigés**, chacun avec ses tests.

### P2 — La réponse touchée n'était jamais effacée → corrigé

`apps/mobile/src/lib/push-notifications.ts` : `traiterReponse` traite chaque
toucher **une seule fois** (clé = identifiant de la notification + geste,
gardée au niveau du module, donc aussi à travers une ré-écoute après
reconnexion), puis l'**efface** (`clearLastNotificationResponse`). La lecture
initiale passe par la même porte que l'écouteur : plus de double traitement au
démarrage à froid, plus de rejeu au lancement suivant. Passage aux variantes
synchrones non dépréciées (`getLastNotificationResponse`).
Tests : `src/lib/__tests__/ouvertures-notification.test.ts` (5) — démarrage à
froid, effacement, second lancement sans toucher, ré-écoute, deux
notifications distinctes.

### P2 — Envoi « fire-and-forget » non durable → corrigé

La promesse d'annoncer est désormais **écrite dans la transaction** qui passe
la commande à READY (`orders.service.ts`, `transition`) :
`readyAnnounceDueAt = now`, `readyAnnouncedAt = null`,
`readyAnnounceAttempts = 0` (migration `20261111_annonce_commande_prete`,
trois colonnes sans clé étrangère + un index).

`LiveActivityService.annoncerCommandePrete` **réserve** l'annonce avant
d'émettre (`updateMany` conditionnel : pas encore annoncée, échéance passée
ou nulle, moins de 5 essais) et repousse l'échéance de 2 minutes — c'est le
bail. Une fois émise, `readyAnnouncedAt` est posé. Un rattrapage
`@Cron(EVERY_MINUTE)` (`rattraperAnnoncesPretes`) reprend les annonces dues
dont le bail a expiré, et abandonne celles des commandes qui ne sont plus
prêtes.

Cela règle aussi la limite « pas de déduplication applicative » : une
commande déjà annoncée par le comptoir ne sonne pas une seconde fois quand
Flaix confirme « prête », et deux répliques ne sonnent pas ensemble.

Tests : 5 nouveaux dans `live-activity.service.spec.ts` (fait une fois émis ;
pas de seconde sonnerie ; échec = non marqué ; rattrapage ; abandon d'une
commande récupérée), 2 dans `orders.service.spec.ts` (promesse écrite dans la
transaction ; aucune promesse pour les autres transitions).

### Limites, inchangées et assumées

- Une réponse positive d'APNs ou d'Expo ne prouve pas l'affichage : il n'y a
  pas d'accusé de réception utilisateur. Le repli Expo ne part que si aucune
  Live Activity n'a été acceptée par APNs.
- Livraison **au moins une fois** : un serveur qui meurt APRÈS l'émission et
  AVANT d'avoir noté « fait » fera sonner une seconde fois au rattrapage.
  Préférable à une annonce perdue.
- Tests sur appareils réels (iOS avec et sans Live Activity, Android,
  permission refusée, premier plan / arrière-plan / fermée) : à faire par
  Rémi, la liste de l'audit reste la bonne.
- La migration n'a pas pu être rejouée en local (Docker indisponible, mémoire
  du poste) : elle l'est par la CI, qui applique toutes les migrations sur un
  PostgreSQL réel avant les tests d'intégration.
