# ADR-0012 — Les stores publient à la main, et pas avant le passage de Stripe en production

- **Date :** 17/11/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi (« je veux qu'il y ait un envoi manuel de ma part une
  fois validé, de la même façon que l'App Store »), instruite par Claude
- **Liée à :** REPRISE, « ÉTAT AU 17/11/2026 » ;
  `brain/taches/2026-11-17-soumission-stores-1.1.3.md`

## Contexte
Le 16 et le 17/11, la version 1.1.3 est soumise à Apple (build 46) et à
Google (code de version 7). Le serveur de production encaisse **en mode test
Stripe** (`sk_test_…`) : les vérificateurs paient avec la carte de test
4242…, mais une vraie carte serait refusée. Une app validée qui partirait en
ligne d'elle-même serait visible du public avec un paiement qui ne marche pas.

## Décision
1. **Apple** : publication **manuelle** de la version (App Store Connect →
   page de la version → « Publication de la version » → « Publier
   manuellement cette version »). Réglage **confirmé par Rémi le 17/11** sur la
   version 1.1.3.
2. **Google Play** : **publication gérée activée** (Vue d'ensemble de la
   publication). Ce que Google valide attend dans « Modifications prêtes à
   être publiées » ; c'est Rémi qui clique sur « Publier les modifications ».
3. **Ordre de sortie** : validation des deux stores **en mode test** →
   passage de Stripe **en production** (clés live et webhook live sur Railway,
   saisis par Rémi ; « Encaissement » refait en mode live par chaque club ;
   un vrai paiement vérifié dans les journaux) → **Rémi publie** sur les deux
   stores.
4. Les notes pour les vérificateurs pointent un **événement public**
   (Dôme → Moto Cross X), la carte de test et « Au plus vite ». Aucun
   identifiant dans le dépôt ni dans une conversation : Rémi les saisit
   lui-même dans les consoles des stores.

## Pourquoi
Rien ne doit être visible du public tant qu'un client ne peut pas payer pour
de vrai. Rémi garde la main sur le moment de la sortie (règle n° 9 de
`CLAUDE.md` : ne jamais déclarer « en ligne » ce qui n'est que poussé).

## Ce que ça coûte
Un clic de plus à chaque version ; un délai entre la validation et la sortie,
le temps de basculer Stripe. Les clubs doivent refaire leur onboarding Stripe
Connect en mode live.

## Ce qui la remettrait en cause
Une fois Stripe en production et stable, la publication automatique après
validation peut redevenir acceptable pour les versions mineures — décision à
reprendre avec Rémi, pas à prendre par défaut.

## Où elle vit
Pas dans le code : dans les réglages des consoles (App Store Connect, Play
Console). Les profils d'envoi sont dans `apps/mobile/eas.json` (`submit` :
Google `production` en `releaseStatus: draft`).
