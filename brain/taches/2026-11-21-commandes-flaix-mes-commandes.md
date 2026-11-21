# Compte rendu — les commandes Flaix dans « Mes commandes » (1.7.44)

- **Date :** 21/11/2026
- **Agent / développeur :** Claude Code (session locale), à la demande de Rémi
- **Commit(s) :** celui de la 1.7.44
- **Bug / décision liés :** E1 du cahier des charges Flaix (version réduite) ;
  règle 4 de `CLAUDE.md` (Flaix décide, Flaix dit « prête »)
- **Statut :** PARTIEL. Le code est en ligne une fois poussé. Il faut encore
  les deux variables Railway et la mise à jour à distance de l'app

## Objectif

Que le client retrouve dans « Mes commandes » ce qu'il a commandé dans Flaix,
pour les essais du match du 22/11. Le développeur Flaix ne travaille pas ce
week-end : on s'appuie sur ce qu'il a déjà livré.

## Avant

Une commande passée dans Flaix ne créait rien chez BreakEat. Les trois lieux
en production sont en Flaix : leurs clients avaient un « Mes commandes » vide.

## Ce que Flaix offre (essayé le 21/11 avec la commande de test du développeur)

- `POST <origine>/api/public/clients/commandes`, en-tête `X-Api-Key`, corps
  `{ "email" }` : les commandes du client (numéro, jeton, lieu, match, point
  de retrait, heure prévue, lignes avec TVA, total, lien de suivi, reçu PDF),
  limitées aux 8 lieux que voit la clé.
- `GET <origine>/api/public/orders/<jeton>/status` (public) : l'état en
  direct (`queued`, `ready`…, libellé, heure de retrait), que la page Flaix
  interroge toutes les 5 s.

## Ce qui a été fait

- **Serveur** (`backend/src/modules/flaix/commandes-client-flaix.service.ts`,
  route `GET /api/v1/flaix/mes-commandes`) : lit l'e-mail du client connecté
  en base, demande ses commandes à Flaix, puis l'état en direct de celles des
  12 dernières heures. Rien n'est écrit en base. Délai de 5 s par appel,
  liste gardée 5 s par client, toute panne Flaix rend une liste vide. Les
  liens ne sont gardés que s'ils sont en https vers l'origine Flaix
  configurée, et un jeton hors format est écarté.
- **App** (`carte-commande-flaix.tsx`, `order-history.screen.tsx`) : les
  commandes Flaix rejoignent « En cours » / « Terminées », avec l'état donné
  par Flaix et les boutons « Suivre ma commande » et « Reçu ». Elles se
  relisent toutes les 10 s tant qu'une commande est en cours.

## Fichiers
- Créés : `backend/src/modules/flaix/commandes-client-flaix.service.ts`,
  `…service.spec.ts`, `apps/mobile/src/components/carte-commande-flaix.tsx`,
  ce compte rendu
- Modifiés : `flaix.controller.ts`, `flaix.module.ts`, `app.config.ts`,
  `backend/.env.example`, `order-history.screen.tsx`, `mobile-api.ts`,
  `CHANGELOG.md`, `brain/ROADMAP.md`, `REPRISE.md`

## Base de données
Aucune migration.

## Tests
| Quoi | Commande | Résultat |
|---|---|---|
| Service, cas unitaires (11) | `pnpm exec jest src/modules/flaix` (backend) | ✅ 23/23 |
| Serveur complet | `pnpm test` (backend) | ✅ 82 suites, 1 176 tests |
| Typage et lint serveur | `tsc --noEmit`, `eslint src/modules/flaix/ src/config/app.config.ts` | ✅ |
| Typage et lint app | `tsc --noEmit` (couvre les deux fichiers), `eslint` des 3 fichiers | ✅ |
| Tests app | `pnpm exec jest` (mobile) | ✅ 14 suites, 157 tests |
| Le service contre la vraie API Flaix | script local, commande de test du développeur | ✅ 3 commandes ; la plus récente lue « En attente » en direct |

**Pas fait** : la carte n'a pas été vue à l'écran (ni simulateur ni web). Elle
le sera sur un téléphone après la mise à jour à distance.

## Risques restants
- Le client est reconnu par son **e-mail**, que BreakEat ne vérifie pas :
  quelqu'un qui crée un compte à l'adresse d'un autre voit ses commandes
  Flaix. **Accepté par Rémi pour les essais du 22/11** ; à régler avant
  l'ouverture au public (comptes Apple/Google seulement, vérification par
  courriel, ou `[#breakeatId]`).
- Pas de notification « prête » ni de Live Activity : il faut que Flaix
  pousse ses changements d'état (webhook E1).
- La liste des états Flaix n'est pas documentée. Ceux qui terminent une
  commande sont devinés (`collected`, `cancelled`…) : un état inconnu laisse
  la commande « en cours » pendant au plus 12 h.
- Chaque client qui a l'écran ouvert fait, au plus toutes les 10 s, un appel
  de liste plus un appel par commande en cours. C'est assez pour un essai,
  pas pour un grand soir.

## Déploiement
Serveur : Railway, au push sur `main`, à vérifier par `/health`. Puis Rémi
pose `FLAIX_COMMANDES_URL` (l'origine seule) et `FLAIX_COMMANDES_API_KEY`
sur Railway. App : mise à jour à distance (workflow GitHub), **avec l'accord
de Rémi**. Elle active aussi l'envoi des favoris (1.7.42). Aucune build.

## Retour arrière
Retirer `FLAIX_COMMANDES_API_KEY` sur Railway éteint tout : la route rend
`active: false` et une liste vide, l'app n'affiche plus rien de Flaix.

## Complément 1.7.45 (21/11 au soir)
- **Notification « prête »** par une surveillance en mémoire
  (`surveillance-commandes-flaix.service.ts`, 9 tests). Essayée contre la
  vraie API Flaix : la commande de test 1003 est surveillée, lue « en
  attente », et aucune notification n'est partie. Le serveur compilé
  démarre, et la route est bien branchée.
- **Audit Codex** : origine `https://` imposée, liste et lectures bornées,
  `indisponible` renvoyé (réponse dans `brain/audits/`).
- Tests : backend 83 suites, 1 190 tests ✅ ; typage, lint et compilation ✅.
- **Pas fait** : envoyer une vraie notification de bout en bout. Il faudrait
  qu'une commande Flaix passe « prête » ; ce sera l'essai du 22/11.

## Suite
Demander au développeur Flaix : la liste des états, le webhook « prête »
(E1), et l'étiquette `[#breakeatId]`.
