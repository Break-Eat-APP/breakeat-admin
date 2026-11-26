# Compte rendu — Notifications : aucun téléphone ne s'enregistrait ; catégorie Android

- **Date :** 26/11/2026
- **Agent / développeur :** Claude Code (session locale), à la demande de Rémi
- **Commit(s) :** `be42b05` (1.7.65), `6143900` (1.7.67), `1015bb1` (1.7.69),
  `fd44c66` (1.7.70)
- **Bug / décision liés :** BUG-2026-056 (SEV-1), BUG-2026-057 ; audits Codex
  « notifications » du 26/11 et leurs réponses
- **Statut :** TERMINÉ dans le code et publié à distance. Le son sur un
  Android reste à vérifier en vrai.

## Objectif
« Ta commande est prête » doit arriver, avec un son, sur iPhone et sur
Android.

## Avant
- Rémi n'avait pas de son à « prête ».
- La page Notifications disait « impossible sur un simulateur », sur une app
  du store.

## Cause
**Confirmée par lecture du code**, puis par le retour des enregistrements
après correction.
- `Constants.isDevice` n'existe plus dans expo-constants au SDK 57. Il valait
  `undefined`, donc « faux » : l'app se croyait sur un simulateur partout et
  n'enregistrait aucun téléphone (BUG-2026-056).
- Audit Codex, ensuite :
  - un bilan Expo `sent: 0` était marqué « annoncé » (BUG-2026-057) ;
  - aucune catégorie Android dédiée n'existait.

## Ce qui a été fait
1. `lib/vrai-telephone.ts` : ne refuse que si l'on **sait** être sur un
   simulateur (`isDevice === false`).
2. L'état affiché dit la vérité :
   - `enregistrerPush()` rend un booléen ;
   - profil « non relié — Réessayer » ;
   - badge relu au serveur ;
   - cloche lue après chargement ;
   - une campagne ouvre la cloche.
3. `live-activity.service.ts` : si des appareils existent et qu'aucun n'est
   atteint, l'annonce reste due et le rattrapage la reprend (5 essais).
4. Catégorie Android « Commandes » :
   - l'app la crée (`lib/canal-commandes.ts`) et la déclare
     (`canalCommandes`) ;
   - le serveur la vise pour ces jetons seulement (`canauxCommandes`), sur
     « prête » BreakEat et Flaix, « Note ta commande » et produit manquant.

## Fichiers
- Créés :
  - `apps/mobile/src/lib/vrai-telephone.ts`, `canal-commandes.ts` (+ tests) ;
  - migration `20261126c_canal_commandes`.
- Modifiés :
  - app : `push-notifications.ts`, `permission-notifs.ts`, `mobile-api.ts`,
    `notif.store.ts`, `notifications.screen.tsx`, `profile.screen.tsx`,
    `App.expo.tsx` ;
  - serveur : `expo-push.service.ts`, `push-tokens.service.ts` (+ spec),
    `push-tokens.controller.ts`, `live-activity.service.ts` (+ spec),
    `produits-manquants.service.ts`, `surveillance-commandes-flaix.service.ts`,
    `backoffice.service.ts`, `scheduled-push.service.ts`.

## Base de données
`push_tokens.canal_commandes` (booléen, faux par défaut). Aucune ligne
existante n'est réécrite. Migration rejouée sur une base vierge
(`pnpm db:verifier`), appliquée en production : `/health` sert `fd44c66`.

## Tests
| Quoi | Commande | Résultat |
|---|---|---|
| Serveur | `npx jest` (backend) | 1227/1227 |
| Intégration | `pnpm test:integration` (Docker, ports 15432 et 16379) | 234/234 |
| App | `npx jest` (apps/mobile) | 197/197 |
| Migration | `pnpm db:verifier` | Passe sur base vierge |
| CI sur `main` | GitHub Actions | Verte |

Ce qui n'a pas pu être lancé : un vrai téléphone Android avec une commande
« prête ».

## Documentation mise à jour
CHANGELOG 1.7.65, 1.7.67, 1.7.69 et 1.7.70 ; BUGS_ET_INCIDENTS (056, 057) ;
REPRISE ; ARCHITECTURE ; DOMAIN_MODEL ; CARTE_DU_CODE ; ENGINEERING_MANUAL ;
TESTING_STRATEGY ; réponses aux audits.

## Risques restants
- Le son réel dépend du téléphone : mode silencieux, Concentration, réglages
  de la catégorie.
- Un Android ne déclare la catégorie qu'après avoir ouvert l'app mise à jour.

## Déploiement
Push sur `main`, CI verte, `/health` = `fd44c66`. Mises à jour à distance
publiées le 26/11 sur la 1.1.5, sur iOS 1.1.4 et sur Android 1.1.3.

## Retour arrière
- Serveur : revenir au commit précédent. La colonne reste, inerte ; sans elle,
  aucun `channelId` n'est posé.
- App : publier la mise à jour précédente.

## Suite
Essai sur un Android : commande « prête », écran verrouillé, app fermée.
