# Demande d'audit Codex — 17/11/2026 (livraisons du 11 au 17/11)

> Prête à envoyer. Le modèle général est `brain/CODEX_AUDIT_PROMPT.md`. Le
> rapport de Codex se range dans `brain/audits/` avec la réponse de Claude
> (corrigé / écarté / assumé, et pourquoi).

```
Tu es Codex, auditeur technique du projet BREAK EAT (dépôt Break-Eat-APP/breakeat-admin).

## Contexte
BreakEat : commande à la buvette des stades et salles, retrait au comptoir.
NestJS 11 + Prisma 6 + PostgreSQL (Railway), Expo SDK 57 / React Native 0.86
(app client), Next.js 15 (consoles admin, opérateur, back-office). Monorepo
pnpm + Turborepo. Les lieux « Flaix » délèguent la commande à Flaix ; les
lieux « BreakEat » gardent tout le parcours (panier, paiement Stripe, comptoir).

Lis D'ABORD : CLAUDE.md (règles absolues), REPRISE.md (« ÉTAT AU 17/11/2026 »),
brain/ARCHITECTURE.md, brain/DOMAIN_MODEL.md, brain/DECISIONS/ADR-0009 à 0012,
brain/BUGS_ET_INCIDENTS.md, brain/SECURITE.md, brain/taches/2026-11-1*.md.

## Périmètre
Commits `5c993f4..HEAD` sur `main` (11 → 17/11/2026), CHANGELOG 1.7.16 → 1.7.40.
Code surtout dans `3e46858..HEAD` (`git diff --stat 3e46858..HEAD`).

## Points à examiner en priorité
1. Ouverture et fermeture automatiques des événements et de leurs points de
   retrait (backend/src/modules/events/ouverture-automatique.service.ts) :
   concurrence entre instances, fuseaux horaires (heureDOuverture), effets sur
   les commandes déjà payées, statut GLOBAL d'un point de retrait partagé.
2. Rattachement d'office et comptoir par défaut
   (backend/src/common/helpers/rattachement-buvettes.ts) : doublons possibles,
   club à plusieurs lieux, événements Flaix.
3. Invitations à accepter et réinitialisation de mot de passe
   (backend/src/modules/organizations/*, migration 20261116_invitation_a_accepter) :
   isolation entre organisations, élévation de rôle, expiration, clés UUID.
4. « Au plus vite » et choix du créneau : apps/mobile/src/screens/{slot-selector,cart,checkout}.screen.tsx,
   backend/src/modules/cart/cart.service.ts (choisirCreneau),
   backend/src/common/helpers/retrait-compatible.ts : un créneau précédent
   est-il toujours effacé ? un créneau passé, fermé ou d'un autre club
   peut-il être réservé ? la place est-elle rendue ?
5. Partager l'addition : lien https (order-splits.service.ts, split.screen.tsx).
6. Poste opérateur : créneaux communs en lecture seule (apps/operator/src/components/SlotBar.tsx).
7. Textes devant le client : tutoiement, vocabulaire (CLAUDE.md § 4).
8. Documentation : chaque bug a-t-il sa ligne, chaque décision sa fiche, le
   code et les documents disent-ils la même chose ?

## Règles du projet à respecter dans tes constats
- Ne jamais perdre une commande ; chaque transition tracée (orderAuditTrail).
- Les droits se vérifient côté serveur ; aucune organisation n'agit sur une autre.
- Flaix décide pour ses lieux ; BreakEat n'affiche jamais les créneaux Flaix.
- Aucun secret dans le dépôt (il est public).

## Format
Pour chaque constat : sévérité (P0 bloquant / P1 / P2 / P3), fichier:ligne,
scénario concret qui casse, correctif proposé. Sépare ce que tu as VÉRIFIÉ
(lu, exécuté) de ce que tu SUPPOSES. Termine par un verdict global.
```

## Ce que Claude a déjà relu le 17/11 (pour ne pas le refaire à l'aveugle)
`brain/taches/2026-11-17-relecture-avant-audit.md` : deux défauts corrigés
(BUG-2026-020, 021), le vouvoiement (BUG-2026-025), et les risques assumés.
Un constat de Codex qui recouperait un risque assumé doit être discuté avec
Rémi, pas corrigé d'office.
