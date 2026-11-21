# ADR-0014 — Le paiement passe par Flaix ; le paiement BreakEat (Stripe) est mis en attente

- **Date :** 21/11/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi (« paiement en stand-by, ça sera via Flaix », 21/11)
- **Liée à :** ADR-0001 (Flaix encaisse), ADR-0012 (stores et Stripe),
  `REPRISE.md` (note du 21/11, « Ce qui reste », point 1 d),
  `brain/audits/REVERIFICATION_CORRECTIONS_2026-11-17.md`

## Contexte
La sortie sur les stores attendait le passage de Stripe en production : clés
live, webhook live, « Encaissement » refait par chaque club, puis un vrai
paiement vérifié (ADR-0012). Sur l'ancien disque dormait aussi une
correction du paiement BreakEat jamais commitée (le gel du panier et la
libération après abandon). Les lieux en production sont pilotés par Flaix,
qui encaisse déjà (ADR-0001).

## Décision
- **Le paiement des clients passe par Flaix.** Stripe BreakEat reste en
  **mode test** en production. Le passage en live est mis en attente, sans
  date.
- La correction de paiement de l'ancien disque est **mise en attente** avec
  lui. Elle ne vaut que pour le paiement BreakEat et redevient nécessaire si
  Stripe repasse un jour en production.

## Conséquences
- Un lieu BreakEat **sans Flaix** reste en paiement de test : une vraie carte
  y serait refusée. Le garder fermé au public, ou le passer en Flaix.
- **ADR-0012 est à reprendre.** Sa condition « pas de sortie avant Stripe en
  production » n'a plus d'échéance. Question ouverte à Rémi : publier sur les
  stores en fermant les lieux sans Flaix, ou attendre. Entre-temps, la 1.1.3
  est sortie sur Google Play le 21/11 (INC-2026-004).
- **Ne pas effacer l'ancien disque** tant que la correction de paiement n'est
  ni reprise ni abandonnée.

## Ce qui la remettrait en cause
Un lieu qui veut encaisser par BreakEat et non par Flaix, ou l'arrêt de Flaix
dans un lieu en production.
