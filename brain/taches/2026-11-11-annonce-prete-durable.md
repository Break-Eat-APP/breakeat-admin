# Compte rendu — « Ta commande est prête » durable et sans doublon

- **Date :** 11/11/2026
- **Agent :** Claude Code (audit : Codex)
- **Commit(s) :** `d337a41` (la notification), `5c993f4` (durable + toucher non rejoué)
- **Bug / décision liés :** BUG-2026-002, BUG-2026-003, BUG-2026-004, ADR-0004
- **Statut :** TERMINÉ (code et CI) — vérification sur appareil à faire par Rémi

## Objectif
Prévenir le client, une seule fois et sans le perdre, quand sa commande
passe à « prête ».

## Avant
Aucune notification à « prête » (push par étape retiré le 07/09, Live
Activity silencieuse). Puis, première version du 11/11 : envoi après le
commit, sans reprise ni garde contre une double sonnerie (audit Codex), et
toucher de notification rejoué à chaque lancement.

## Cause
Confirmée par lecture du code et par l'audit Codex
(`brain/audits/AUDIT_2026-11-11_codex-notification-prete.md`).

## Ce qui a été fait
- Live Activity mise à jour **avec alerte** à « prête » ; repli Expo Push
  quand aucune activité n'est atteinte ; les autres étapes restent muettes.
- Promesse d'annoncer écrite dans la transaction (`ready_announce_due_at`),
  bail de 2 minutes, `ready_announced_at` une fois faite, rattrapage
  `@Cron` chaque minute, 5 essais, abandon si la commande n'est plus prête.
- App : chaque toucher traité une fois puis effacé.

## Fichiers
- Créés : `backend/prisma/migrations/20261111_annonce_commande_prete/`,
  `apps/mobile/src/lib/__tests__/ouvertures-notification.test.ts`
- Modifiés : `backend/prisma/schema.prisma`,
  `backend/src/modules/live-activity/live-activity.service.ts` (+ spec, + module),
  `backend/src/modules/orders/orders.service.ts` (+ spec),
  `apps/mobile/src/lib/push-notifications.ts`, `apps/mobile/App.expo.tsx`

## Base de données
Trois colonnes sur `orders` (deux dates nullables, un entier par défaut 0)
et un index. Aucune réécriture des lignes existantes. Rejouée par la CI sur
PostgreSQL réel (pas en local : Docker indisponible, mémoire du poste).

## Tests
| Quoi | Commande | Résultat |
|---|---|---|
| Live Activity | `jest -i src/modules/live-activity/live-activity.service.spec.ts` | 37 ✅ (dont 9 nouveaux) |
| Commandes | `jest -i src/modules/orders/orders.service.spec.ts` | 56 ✅ (dont 2 nouveaux) |
| Toucher de notification | `jest -i src/lib/__tests__/ouvertures-notification.test.ts` | 5 ✅ |
| Typage backend et mobile, lint | `tsc --noEmit`, `eslint` | ✅ |
| CI complète (dont intégration et migrations) | GitHub Actions sur `5c993f4` | ✅ 6/6 |

Non lancé en local : la suite complète du serveur (mémoire du poste) — la CI
l'a lancée.

## Risques restants
Livraison « au moins une fois » (double sonnerie possible si le serveur meurt
entre l'envoi et l'écriture de « fait »). Aucun accusé de réception
utilisateur. Vérification sur appareils réels à faire (iOS avec et sans Live
Activity, Android, permission refusée, app fermée).

## Déploiement
Railway sur `5c993f4` (vérifié par `/health`) ; mise à jour à distance 1.1.2
publiée.

## Retour arrière
Revenir au commit précédent suffit pour le code ; les trois colonnes peuvent
rester (inutilisées, sans effet).
