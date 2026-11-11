# Décisions d'architecture et de produit (ADR)

> Une décision prise ici n'est pas défaite par hasard. Chaque fiche dit ce qui
> a été tranché, **pourquoi**, ce que ça coûte, et ce qui la remettrait en
> cause. Ouvert le 11/11/2026 (gouvernance, étape 2) ; les fiches 0001 à 0008
> sont écrites **après coup**, à partir de décisions déjà en vigueur dans le
> code et dans `REPRISE.md`.

## Quand écrire une fiche

- Un choix qui engage l'architecture, un contrat avec Flaix, un format de
  données, ou une règle métier que quelqu'un pourrait « corriger » de bonne
  foi.
- **Pas** pour un détail d'implémentation : le CHANGELOG suffit.

Copier [`ADR-0000-modele.md`](ADR-0000-modele.md), numéroter à la suite,
ne jamais réutiliser un numéro. Une décision remplacée passe en
`REMPLACÉE par ADR-NNNN` : on ne l'efface pas.

## Index

| N° | Décision | Date | Statut |
|---|---|---|---|
| [0001](ADR-0001-flaix-encaisse-breakeat-vitrine.md) | Flaix encaisse et pilote ; BreakEat est la vitrine | 09/10/2026 | ACCEPTÉE |
| [0002](ADR-0002-operateur-flaix-dit-prete.md) | Pour une commande Flaix, l'opérateur Flaix dit « prête », à la main | 11/11/2026 | ACCEPTÉE |
| [0003](ADR-0003-lien-de-commande-par-evenement.md) | Un lien de commande Flaix par événement, choisi par la date | 10/2026 | ACCEPTÉE |
| [0004](ADR-0004-promesse-dans-la-transaction.md) | Ce qui doit partir après un changement d'état est promis dans la transaction | 27/10/2026 | ACCEPTÉE |
| [0005](ADR-0005-runtime-version-version-de-l-app.md) | Mises à jour à distance : `runtimeVersion` = version de l'app | 11/2026 | ACCEPTÉE |
| [0006](ADR-0006-programmation-dans-le-tableau-de-bord-du-lieu.md) | Le super admin crée les lieux ; toute la programmation se fait dans le tableau de bord du lieu | 10/11/2026 | ACCEPTÉE |
| [0007](ADR-0007-icone-ios-icon-composer.md) | L'icône iOS est au format Icon Composer | 11/11/2026 | ACCEPTÉE |
| [0008](ADR-0008-documentation-dans-brain.md) | La documentation vit dans `brain/`, pas dans un `docs/` parallèle | 11/11/2026 | ACCEPTÉE |
