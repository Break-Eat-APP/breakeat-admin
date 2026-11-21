# ADR-0016 — L'agent pousse directement sur `main`, sans clic de validation

- **Date :** 21/11/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi (retour à l'usage d'avant la session cloud, 21/11 ;
  confirmé le même soir : « Non, reste direct »)
- **Liée à :** `CLAUDE.md` § 6, `brain/DEPLOIEMENT.md` (« Branches » et « Ce
  que Rémi valide »), gouvernance § 15.3

## Contexte
La session cloud travaillait sur une branche `claude/…` et passait par une
pull request que Rémi fusionnait : c'était son point de validation. Le 21/11,
la session locale du nouveau poste devient la seule à travailler sur le
dépôt.

## Décision
- L'agent pousse **directement sur `main`**, ce qui met en production
  (Railway pour le serveur, Vercel pour les consoles).
- **Avant chaque envoi** : tests, typage et lint des parties touchées,
  réellement lancés en local. Une migration écrite à la main passe par
  `pnpm db:verifier` (Docker), sinon par une pull request.
- **Après chaque envoi** : CI verte, et `/health` qui rend le commit envoyé.
- **Pas de clic de validation** avant `git push` : proposé le 21/11, refusé
  par Rémi. Ne pas le reproposer.
- **Restent à l'accord de Rémi, à chaque fois** : la mise à jour à distance
  de l'app, une build, une soumission ou une publication sur les stores, et
  Stripe en live.

## Ce que ça coûte
La CI vérifie APRÈS la mise en production : une erreur passe en ligne le
temps d'un correctif. D'où les tests locaux obligatoires avant l'envoi.

## Ce qui la remettrait en cause
Une régression en production due à un envoi direct, ou le passage du dépôt en
privé (la CI ne serait plus lisible sans identifiant).
