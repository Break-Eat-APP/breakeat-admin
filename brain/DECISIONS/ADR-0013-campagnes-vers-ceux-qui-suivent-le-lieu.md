# ADR-0013 — Une campagne atteint ceux qui ont commandé OU qui suivent le lieu

- **Date :** 21/11/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi (plan des API Flaix ↔ BreakEat validé le 10/11, étape 1 lancée le 21/11), instruite par l'agent
- **Liée à :** BUG-2026-011, BUG-2026-038, `REPRISE.md` (« LE PLAN DE DÉVELOPPEMENT DES API FLAIX ↔ BREAKEAT », étape 1), `brain/FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md` (section E), `brain/taches/2026-11-21-favoris-serveur-campagnes.md`

## Contexte
Une campagne ciblant un club, un lieu ou un match ne visait que les clients
ayant une **commande BreakEat** chez lui. Les trois lieux en production sont
pilotés par Flaix, et une commande passée dans Flaix ne crée rien chez
BreakEat : leurs campagnes partaient vers **zéro appareil**. Les favoris, seul
autre signal d'intérêt, vivaient uniquement sur le téléphone.

## Options étudiées
1. **Attendre E1** (les commandes Flaix remontent chez BreakEat). Ne dépend pas
   de nous, et ne touche que ceux qui ont déjà commandé.
2. **Copier les favoris au serveur, et cibler « a commandé OU suit le lieu »**.
   Faisable sans Flaix, environ un jour.
3. **Viser tous les porteurs de l'app** pour tout lieu Flaix. Rejetée : un
   message qui ne concerne pas la personne est la façon la plus sûre de se
   faire couper les notifications.

## Décision
- Le **téléphone reste l'original** des favoris : on parcourt toujours les
  lieux sans compte. Quand le client est **connecté**, l'app envoie au serveur
  sa **liste entière** (`PUT /api/v1/favorite-venues`), à chaque changement et
  à chaque connexion. Le serveur s'y aligne : il remplace, il n'additionne pas.
- Le public d'une campagne d'un club devient : **a commandé (comme avant) OU a
  le lieu en favori**, avec ces règles :
  - lieu précisé : ceux qui suivent ce lieu ;
  - match précisé : ceux qui suivent **le lieu du match** ;
  - ni l'un ni l'autre : ceux qui suivent un lieu du club ;
  - un match supprimé depuis la programmation n'élargit **pas** la campagne à
    tout le club : aucun favori dans ce cas.
- Un favori d'un autre club ne passe jamais : le filtre sur l'organisation est
  écrit même quand le lieu est précisé.
- La suppression d'un compte efface ses favoris.

## Pourquoi
C'est le seul moyen, sans Flaix, de faire arriver une campagne d'un lieu Flaix
à quelqu'un. Le favori est un intérêt **exprimé** par le client pour ce lieu :
lui annoncer un match à ce lieu le concerne. La liste entière (plutôt que des
ajouts et retraits un par un) est rejouable : un envoi perdu est rattrapé par
le suivant.

## Ce que ça coûte
- **Seuls les clients connectés** sont touchés. Un visiteur anonyme qui a mis
  un cœur n'est connu de personne, et c'est voulu.
- **Deux téléphones** pour un même compte : le dernier qui écrit gagne.
- Un « −50 % fin de match » programmé sur un match atteint aussi ceux qui
  suivent le lieu sans y être ce soir-là. Assumé : ils suivent le lieu. À
  revoir si les retours disent le contraire.
- Un **téléphone partagé** : les favoris locaux (non liés à un compte) partent
  au compte qui se connecte.
- C'est une **donnée personnelle de plus** sur le serveur : la politique de
  confidentialité (§ 2, § 14) et les déclarations des stores (Apple
  « Confidentialité de l'app », Google « Sécurité des données ») sont à
  mettre à jour avant la mise en ligne.

## Ce qui la remettrait en cause
- L'arrivée de E1 ne la remet pas en cause : les commandes Flaix s'ajouteront
  aux commandes BreakEat, les favoris restent un second signal.
- Des plaintes ou un taux de désactivation des notifications en hausse sur les
  campagnes de match : restreindre alors les campagnes d'un match à ceux qui
  ont commandé.

## Où elle vit dans le code
- `backend/src/modules/notifications/scheduled-push.service.ts` (`destinataires`, `lieuDeLEvenement`)
- `backend/src/modules/favorites/` (route, service)
- `backend/prisma/migrations/20261121_lieux_favoris/` (table `venue_favorites`)
- `backend/src/modules/auth/auth.service.ts` (`supprimerMonCompte`)
- `apps/mobile/src/lib/favoris.ts` (`envoyerFavoris`), `apps/mobile/App.expo.tsx` (envoi à la connexion)
