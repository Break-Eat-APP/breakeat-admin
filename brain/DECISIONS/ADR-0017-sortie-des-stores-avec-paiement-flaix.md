# ADR-0017 — Les stores peuvent publier : tous les lieux publics encaissent par Flaix

- **Date :** 23/11/2026
- **Statut :** ACCEPTÉE — **remplace ADR-0012** sur la condition de sortie
- **Décidée par :** Rémi (« oui tous les lieux sont sur Flaix », 23/11), instruite par l'agent
- **Liée à :** ADR-0012 (publication manuelle), ADR-0014 (paiement via Flaix), INC-2026-004

## Contexte
ADR-0012 interdisait la sortie sur les stores avant le passage de Stripe en
production : un client ne devait jamais tomber sur un paiement qui refuse les
vraies cartes. ADR-0014 a mis Stripe en attente, le paiement passant par
Flaix. La condition de ADR-0012 n'avait donc plus d'échéance.

## Décision
- La condition de sortie devient : **tout lieu ouvert au public encaisse par
  Flaix**. Rémi confirme le 23/11 que c'est le cas pour tous les lieux.
- **La publication reste manuelle et faite par Rémi** (ADR-0012, point 1 et 2,
  toujours valables) : App Store « Publier cette version », Google Play
  « Publier les modifications » avec la publication gérée.
- Un lieu qui reviendrait au paiement BreakEat (Stripe) doit être fermé au
  public tant que Stripe est en mode test.

## Risques acceptés à la sortie
- E-mail non vérifié (BUG-2026-039), jusqu'à `[#breakeatId]` côté Flaix.
- Notifications iPhone : clé APNs posée chez Expo le 21/11, aucune
  notification encore constatée sur un iPhone.
- Politique de confidentialité sans les lieux suivis (BUG-2026-046).

## Conséquences
- App Store : la 1.1.3 (build 46), validée le 17/11, peut être publiée. Le
  public passe de la 1.0.10 à la 1.1.3 et reçoit les mises à jour à distance.
- La prochaine build native (1.1.4) se fera pour iOS ET Android (ADR-0005).
