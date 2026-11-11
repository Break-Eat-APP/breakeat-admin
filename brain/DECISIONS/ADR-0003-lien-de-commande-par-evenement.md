# ADR-0003 — Un lien de commande Flaix par événement, choisi par la date

- **Date :** octobre 2026
- **Statut :** ACCEPTÉE (provisoire jusqu'au flux des matchs, option B)
- **Décidée par :** Rémi, instruite par Claude
- **Liée à :** cahier des charges Flaix (options A, B, C) ; `brain/CALENDRIER_SAISON.md`

## Contexte
Flaix fournit une adresse de commande par événement, créable des mois à
l'avance. Rémi les colle à la main dans le tableau de bord du lieu.

## Options étudiées
1. Deviner l'adresse à partir d'un motif (lieu + date).
2. **Coller l'adresse de chaque événement, et laisser la date choisir laquelle
   s'ouvre.**
3. Un seul lien « calendrier » par lieu (option A) — rejeté pour l'instant :
   il fait perdre le calendrier, « À ne pas manquer », les rappels, et bute
   sur BUG-2026-010.

## Décision
Option 2. `Event.flaixOrderUrl`, adresse `https://*.flaixlabs.com` (ou le
domaine de paiement validé) uniquement ; le **serveur** décide quel lien
ouvrir selon l'heure (`fenetre-commande.ts`), jamais le téléphone.

## Pourquoi
Un motif deviné tomberait **en silence** le jour où Flaix change son format.
Une horloge de téléphone de travers ouvrirait le mauvais match.

## Ce que ça coûte
La double saisie (Flaix puis BreakEat) — c'est ce que le flux des matchs
(option B) doit supprimer.

## Ce qui la remettrait en cause
Le flux B en place : les liens arriveront avec chaque match.

## Où elle vit dans le code
`backend/prisma/schema.prisma` (`Event.flaixOrderUrl`),
`backend/src/common/helpers/fenetre-commande.ts`,
`backend/src/modules/events/lien-flaix.ts`.
