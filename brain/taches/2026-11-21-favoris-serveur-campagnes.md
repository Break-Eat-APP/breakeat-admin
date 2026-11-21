# Compte rendu — Favoris copiés au serveur, campagnes vers ceux qui suivent le lieu

- **Date :** 21/11/2026
- **Agent / développeur :** Claude Code (session cloud), à la demande de Rémi
- **Commit(s) :** branche `claude/sharp-shannon-4ljkff` (voir `git log`) — **pas encore sur `main`**
- **Bug / décision liés :** BUG-2026-011 (corrigé dans le code), BUG-2026-038 (ouvert), ADR-0013
- **Statut :** TERMINÉ dans le code ; **PAS EN LIGNE** (attend l'accord de Rémi pour `main`, puis une mise à jour à distance de l'app)

## Objectif
Étape 1 du plan des API Flaix ↔ BreakEat (validé le 10/11) : qu'une campagne
d'un lieu piloté par Flaix atteigne quelqu'un, sans attendre le flux E1 du
développeur Flaix.

## Avant
`ScheduledPushService.destinataires` ne visait que les clients ayant une
`Order` BreakEat dans le club. Les commandes Flaix n'en créent pas, et les
trois lieux en production sont en Flaix : campagne ciblée = zéro appareil.
Les favoris n'existaient que sur le téléphone (`AsyncStorage`).

## Cause
Confirmée par lecture du code (`scheduled-push.service.ts`, requête
`order.findMany` seule), déjà notée le 10/11 (BUG-2026-011).

## Ce qui a été fait
- Table `venue_favorites` (clé composée `user_id` + `venue_id`, en **UUID**,
  suppression en cascade avec le compte ou le lieu).
- Route `PUT /api/v1/favorite-venues` (client connecté) : remplace la liste
  par celle du téléphone ; lieux inconnus écartés sans erreur ; 200 au plus ;
  l'utilisateur vient du jeton, jamais de la requête.
- Ciblage : « a commandé OU suit le lieu » (règles dans ADR-0013), filtre sur
  le club toujours écrit, match supprimé = aucun favori.
- App : la liste part au serveur à chaque enregistrement et à chaque
  connexion, si le client est connecté ; n'échoue jamais à l'écran.
- Suppression de compte : les favoris sont effacés.

## Fichiers
- Créés : `backend/prisma/migrations/20261121_lieux_favoris/migration.sql`,
  `backend/src/modules/favorites/{favorites.module,favorites.controller,favorites.service,favorites.service.spec}.ts`,
  `backend/test/integration/favoris-campagne.int-spec.ts`,
  `apps/mobile/src/lib/__tests__/favoris.test.ts`,
  `brain/DECISIONS/ADR-0013-campagnes-vers-ceux-qui-suivent-le-lieu.md`, ce fichier.
- Modifiés : `backend/prisma/schema.prisma`, `backend/src/app.module.ts`,
  `backend/src/modules/notifications/scheduled-push.service.ts` (+ spec,
  `campagne-statut.spec.ts`), `backend/src/modules/auth/auth.service.ts`
  (+ `suppression-compte.spec.ts`), `apps/mobile/src/lib/favoris.ts`,
  `apps/mobile/src/lib/api/mobile-api.ts`, `apps/mobile/App.expo.tsx`,
  `CHANGELOG.md`, `brain/ROADMAP.md`, `brain/BUGS_ET_INCIDENTS.md`,
  `brain/DECISIONS/README.md`, `REPRISE.md`.

## Base de données
Migration `20261121_lieux_favoris` : **table neuve**, aucune ligne existante
touchée. Rejouée avec les 80 précédentes sur un **PostgreSQL 16 local**
(Docker indisponible dans la session, donc pas `pnpm db:verifier`, qui utilise
la version 18 de la production) : toutes appliquées, colonnes `uuid`, clés
étrangères acceptées. **La CI la rejouera sur la version 18** : attendre la CI
verte avant de fusionner.

## Tests
| Quoi | Commande | Résultat |
|---|---|---|
| Unitaires serveur (toute la suite) | `npx jest` (backend) | 81 suites, **1 161 tests passés** |
| Intégration (toute la suite, PostgreSQL 16 local) | `DATABASE_URL_TEST=… npx jest --config ./test/jest-integration.json` | 24 suites passées, 2 ignorées ; **204 passés**, 8 ignorés |
| Intégration favoris (nouveau) | idem, `favoris-campagne.int-spec.ts` | 5 passés : lieu sans commande atteint, autre club exclu, retrait, doublon, cascade |
| Mobile (toute la suite) | `npx jest` (apps/mobile) | 14 suites, **157 tests passés** |
| Typage | `npm run typecheck` (backend), `npx tsc --noEmit` (mobile) | sans erreur |
| Lint | `eslint` sur les fichiers touchés | sans erreur |

Pas lancé : `pnpm db:verifier` (Docker indisponible), essai sur un vrai
téléphone (l'app n'est pas mise à jour).

## Documentation mise à jour
CHANGELOG 1.7.42, ROADMAP, BUGS (011, 038), ADR-0013, REPRISE.

## Risques restants
- **Seuls les clients connectés, sur une app mise à jour**, sont comptés. Le
  public grandit au fil des connexions : la première campagne d'un lieu Flaix
  restera petite.
- **Politique de confidentialité et déclarations des stores** à compléter
  (lieux suivis = donnée personnelle) avant la mise en ligne. Non modifiées :
  texte légal, décision de Rémi.
- **BUG-2026-038** : l'envoi IMMÉDIAT « Envoyer au club » du back-office vise
  l'équipe du club, pas ses clients. Non modifié : à trancher.
- Tant que le serveur n'est pas déployé, l'app mise à jour recevrait une 404
  sur la route : sans effet visible (l'erreur est absorbée), mais **déployer
  le serveur AVANT la mise à jour à distance**.

## Déploiement
Rien n'est en ligne. Ordre prévu, avec l'accord de Rémi :
1. fusion dans `main` → Railway déploie le serveur et applique la migration ;
   vérifier `/health` (`commit` = `origin/main`) ;
2. puis mise à jour à distance de l'app (workflow « Mise a jour a distance ») :
   changement JavaScript seulement, **aucune build native**, `version` reste
   1.1.3.

## Retour arrière
Revenir sur le commit (code). La table peut rester : rien ne la lit plus. Pour
l'enlever : une migration `DROP TABLE "venue_favorites";` (aucune autre table
n'en dépend).

## Suite
- Rémi : trancher BUG-2026-038 ; valider le texte de confidentialité ; donner
  l'accord pour `main` et la mise à jour à distance.
- Étape 2 du plan : recevoir E1 dès que le développeur Flaix l'envoie.
