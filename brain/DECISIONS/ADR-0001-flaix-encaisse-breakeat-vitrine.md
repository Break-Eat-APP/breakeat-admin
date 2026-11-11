# ADR-0001 — Flaix encaisse et pilote ; BreakEat est la vitrine

- **Date :** 06 et 09/10/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi
- **Liée à :** `brain/FRONTIERE_FLAIX_OPS.md` (section 7), `brain/FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md`

## Contexte
Flaix est le logiciel de restauration en marque blanche qui fait partie de
BreakEat : son « cerveau ». Il a son propre tableau de bord (ventes, données
client) et son propre paiement. Le client veut aussi vendre Flaix à d'autres
applications que BreakEat.

## Options étudiées
1. BreakEat garde tout le parcours (panier, paiement, stock, comptoir) et
   Flaix n'est qu'un conseiller.
2. **Flaix encaisse et opère ; BreakEat est la vitrine** (comptes, lieux,
   découverte, notifications, Live Activity) et relaie vers Flaix.

## Décision
Option 2, **lieu par lieu** : `Venue.flaixEnabled` bascule un lieu sur Flaix.
Le parcours BreakEat (panier, paiement, partager l'addition, stock, créneaux,
écran opérateur) **s'endort** pour ce lieu — il n'est jamais supprimé, et
reprend pour un lieu sans Flaix.

## Pourquoi
Flaix est le produit qui se vend à d'autres ; le responsable F&B y a toutes
ses données. Doubler l'encaissement créerait deux vérités sur les ventes.

## Ce que ça coûte
- Une commande passée dans Flaix ne crée rien chez BreakEat tant que le flux
  des commandes (E1) n'existe pas : pas de « Mes commandes », de Live Activity
  ni de campagne ciblée pour ces lieux (BUG-2026-011).
- Les créneaux de retrait sont chez Flaix : BreakEat ne les affiche jamais.

## Ce qui la remettrait en cause
Un lieu qui ne veut pas de Flaix — il garde simplement le parcours BreakEat.

## Où elle vit dans le code
`Venue.flaixEnabled`, `Event.flaixOrderUrl`, `common/helpers/fenetre-commande.ts`,
`apps/mobile/src/lib/ouverture-lieu.ts` (`cheminDeCommande`).
