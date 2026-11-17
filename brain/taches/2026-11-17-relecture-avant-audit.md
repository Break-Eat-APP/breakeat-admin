# Compte rendu — Relecture du code du 12 au 16/11 avant l'audit Codex

- **Date :** 17/11/2026
- **Agent / développeur :** Claude Code (Opus)
- **Commit(s) :** relu `3e46858..1fbdf46` (54 fichiers de code, +2 236 / −331) ;
  corrections : CHANGELOG 1.7.39
- **Bug / décision liés :** BUG-2026-020, 021, 025 ; ADR-0009, 0010, 0011
- **Statut :** TERMINÉ

## Objectif
Avant l'audit Codex demandé par Rémi : relire ce qui a été livré ces derniers
jours, corriger ce qui est faux, et dire ce qui reste assumé.

## Ce qui a été relu
| Sujet | Fichiers | Verdict |
|---|---|---|
| Ouverture et fermeture automatiques | `events/ouverture-automatique.service.ts` | Juste : bascules conditionnelles, lieux Flaix et contenant permanent exclus, en pause / hors ligne jamais touchés, commandes payées jamais perdues. Risques assumés listés plus bas |
| Rattachement d'office, comptoir par défaut | `common/helpers/rattachement-buvettes.ts`, `events`, `suppliers`, `venues` | Juste ; voir les risques |
| Invitations à accepter, réinitialisation de mot de passe | `organizations.service.ts`, `organizations.controller.ts`, migration `20261116_invitation_a_accepter` | Juste : rôle délégable vérifié, buvette du même club, invitation liée au compte (`findFirst({ id, userId })`), expiration, clés UUID |
| Créneau d'une commande au comptoir | `orders.service.ts` (`assignOrderToSlot` + `assertCreneauCompatible`) | Juste |
| Liste des créneaux du client, « Au plus vite » | `public-events.controller.ts`, `slot-selector`, `cart`, `checkout`, `cart.store` | **Deux défauts**, corrigés (ci-dessous) |
| Lien de « partager l'addition » | `order-splits.service.ts` (`lien`) | Juste |
| Textes devant le client | toute l'app mobile, notifications du serveur | **Vouvoiement restant**, corrigé |

## Défauts trouvés et corrigés
1. **BUG-2026-021 — « Au plus vite » gardait l'ancien créneau.** L'app
   n'appelait `PATCH /carts/:id/creneau` que s'il y avait un créneau ; le
   panier ouvert est réutilisé et garde le sien. Correctif : appel **toujours**
   fait, `null` compris (`checkout.screen.tsx`, `cart.screen.tsx`). Le serveur
   gérait déjà `null` (efface, rend la place sous verrou).
2. **BUG-2026-020 — créneau passé accepté par le serveur.** Correctif :
   `assertCreneauCompatible` refuse un créneau terminé quand `exigerOuvert`
   (choix du client). Le webhook Flaix et le comptoir (`exigerOuvert` faux) ne
   sont pas touchés. Le message « Choisissez-en un autre » est passé au
   tutoiement.
3. **BUG-2026-025 — vouvoiement.** 11 fichiers de l'app et la notification
   « produit manquant ».

## Risques assumés (non corrigés, à connaître)
- Le statut d'un point de retrait est **global** : l'ouverture automatique
  d'un événement ouvre le point de retrait pour tous ses événements.
- Le **comptoir par défaut** n'a pas de contrainte d'unicité : deux
  rattachements simultanés de la même paire en créeraient deux (sans effet
  sur les commandes). Il est aussi créé pour les événements Flaix (inutilisé).
- Messages **partagés** entre consoles (personnel, vouvoyé) et app (client,
  tutoyé) : le compte archivé (`auth.service.ts`), « Code invalide ou expiré.
  Demandez-en un nouveau. » et les courriels de mot de passe restent au
  vouvoiement. À trancher avec Rémi (un message par public).
- Textes de **permission iOS** au vouvoiement : build native nécessaire.

## Tests
| Quoi | Commande | Résultat |
|---|---|---|
| Panier et commandes (dont 2 nouveaux tests : créneau passé refusé, créneau à venir accepté) | `NODE_OPTIONS=--max-old-space-size=1000 node node_modules/jest/bin/jest.js -i src/modules/cart/cart.service.spec.ts src/modules/orders/orders.service.spec.ts` | **113 / 113 verts** |
| Typage du serveur | `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | **0 erreur** |
| Lint des 11 fichiers mobiles touchés | `node node_modules/eslint/bin/eslint.js …` | **0 erreur** |

Non lancés sur le poste (mémoire) : typage complet de l'app mobile, test
d'intégration `produits-manquants.int-spec.ts` (PostgreSQL) — **la CI les
rejoue** ; résultat à lire avant de dire « en ligne ».

## Déploiement
Serveur : Railway au prochain `main`, vérifier `/health` → `commit`. App :
mise à jour à distance 1.1.3, **avec l'accord de Rémi**.

## Retour arrière
`git revert` du commit ; aucune migration.
