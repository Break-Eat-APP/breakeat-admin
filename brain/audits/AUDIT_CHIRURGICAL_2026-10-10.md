# Audit chirurgicale de Break Eat

**Date :** 10 octobre 2026  
**Révision auditée :** `22e02a4`  
**Périmètre :** backend, mobile, admin, back-office, operator, tests, CI/CD et documentation.  
**Modification du code pendant l’audit :** aucune.

## Verdict général

Le socle technique de Break Eat est globalement solide : le typage, le lint, les builds et les tests d’intégration passent. Cependant, l’application ne doit pas encore être déclarée totalement terminée, car plusieurs fonctionnalités peuvent être activées alors que leur parcours utilisateur n’est pas complet.

**Conclusion :** prêt pour une phase finale de corrections et de recette, mais pas encore clôturé sans réserve pour la production.

## Résultats des vérifications

| Vérification | Résultat |
|---|---|
| Tests backend | 54 suites, 684 tests réussis |
| Tests mobile | 12 tests réussis |
| Tests admin | 10 tests réussis |
| Tests back-office | 12 tests réussis |
| Tests d’intégration PostgreSQL | 12 suites, 117 tests réussis |
| Typecheck | Réussi sur les 5 packages concernés |
| Lint | Réussi, 0 erreur et 11 avertissements |
| Builds production | Réussis pour backend, mobile, admin, operator et back-office |
| Export web mobile réel | Non validé : processus interrompu vers 84,6 %, aucun dossier `dist/` produit |
| Tests operator | Aucun script de test automatisé |

Les premiers lancements parallèles du typecheck et du lint ont épuisé la mémoire Node. Les relances séquentielles avec une mémoire adaptée passent. Il s’agit d’une limite de l’environnement de validation, pas d’une erreur de compilation identifiée.

## Problèmes prioritaires

### P1 — Flaix peut être activé mais le parcours de commande n’est pas livré

Le back-office permet d’activer `flaixEnabled` pour un lieu. L’application mobile détecte alors ce réglage et navigue vers l’écran `FlaixOrder`.

Mais `apps/mobile/src/screens/flaix-order.screen.tsx` affiche encore : « L’intégration arrive bientôt. » L’utilisateur est donc envoyé vers une fonctionnalité non opérationnelle.

**Fichiers concernés :**

- `apps/backoffice/src/app/(backoffice)/organizations/[id]/page.tsx`
- `apps/mobile/src/screens/venue-discovery.screen.tsx`
- `apps/mobile/src/screens/flaix-order.screen.tsx`

**Correction attendue :** masquer l’activation Flaix tant que l’intégration n’est pas livrée, ou terminer le vrai parcours de commande et le tester de bout en bout.

### P1 — Divergence possible des statuts Flaix et Break Eat

Le webhook Flaix peut considérer une commande comme prête sans réécrire le `OrderStatus` de Break Eat. Un écran peut donc afficher `READY` alors que l’opérateur voit encore `PREPARING`.

**Risque :** informations contradictoires pour le client, l’opérateur et le support.

**Correction attendue :** choisir une règle unique : synchroniser les statuts, afficher partout un statut externe séparé, ou définir une priorité stricte. Ajouter un test métier qui verrouille cette décision.

### P1 — Deuxième réglage Flaix dans l’admin, lui aussi incomplet

La page d’apparence admin expose `flaixTakeover`, présenté comme un réglage permettant à Flaix de prendre le dessus sur l’interface standard. L’écran mobile associé indique encore que l’intégration est à venir.

**Risque :** deux réglages peuvent donner l’impression que Flaix est disponible alors que le parcours réel ne l’est pas.

**Correction attendue :** centraliser l’activation Flaix, empêcher les combinaisons incohérentes et désactiver les réglages tant que le parcours complet n’existe pas.

### P1 — Mentions légales et confidentialité non finalisées dans le profil

Dans `apps/mobile/src/screens/profile.screen.tsx`, les actions « Mentions légales » et « Confidentialité » affichent encore « Disponible prochainement ». Les CGU sont pourtant affichées dès l’inscription ou la connexion.

**Risque :** parcours de conformité incomplet au moment de la publication.

**Correction attendue :** brancher les URLs définitives, vérifier leur contenu et tester les liens sur iOS, Android et web.

## Problèmes importants mais secondaires

### P2 — Action white-label « Mes commandes » inactive

`apps/admin/src/app/(admin)/appearance/page.tsx` propose l’action `orders` sous le libellé « Mes commandes ». Dans `apps/mobile/src/screens/event-home.screen.tsx`, cette action est traitée comme un no-op.

**Risque :** l’administrateur peut configurer un bouton visible qui ne fait rien.

**Correction attendue :** naviguer vers l’historique des commandes, ou retirer l’action jusqu’à son implémentation.

### P2 — L’export web mobile n’est pas couvert par la CI

Le package mobile possède un script réel `expo export -p web`, mais le build Turbo de la CI vérifie seulement le TypeScript. L’export manuel a été interrompu à environ 84,6 % avec le code Windows `3221226505`, sans produire `apps/mobile/dist`.

**Risque :** le code peut passer la CI alors que le livrable web ne se construit pas.

**Correction attendue :** ajouter l’export web à la CI ou à la pipeline Vercel et conserver l’artefact `dist`. Diagnostiquer l’arrêt Metro sur un environnement propre, hors OneDrive si nécessaire.

### P2 — Script local PostgreSQL utilisant l’ancien port

`backend/scripts/api-essai-local.js` pointe vers `localhost:55432`, alors que le conteneur et la documentation actuels utilisent `localhost:15432`.

**Risque :** le script local échoue alors que la base fonctionne.

**Correction attendue :** utiliser `DATABASE_URL` et supprimer le port codé en dur, ou l’aligner sur la procédure actuelle.

### P2 — Aucun test automatisé pour l’application operator

`apps/operator/package.json` possède les scripts de build, lint et typecheck, mais aucun script `test`.

**Risque :** les écrans opérateur sont compilés sans vérification comportementale comparable à l’admin et au back-office.

**Correction attendue :** ajouter des tests de connexion, chargement des commandes, filtres, changement de statut, déconnexion et expiration de session.

### P2 — 11 avertissements lint à nettoyer

Le lint passe, mais signale des désactivations ESLint inutiles, des assertions non nulles et quelques exceptions forcées.

**Correction attendue :** supprimer les désactivations inutiles, remplacer les assertions non nulles par des gardes et documenter les exceptions conservées.

## Points d’exploitation à confirmer avant production

Les documents de reprise signalent encore les validations suivantes :

- stockage et planification réelle des sauvegardes Railway ;
- Apple Pay et soumission EAS avec comptes, certificats et marchand réel ;
- recette sur vrais appareils iPhone et Android ;
- scénarios de remboursement et d’interruption sur Railway ;
- validation réelle des notifications ;
- verrouillage temporaire et confirmation email côté sécurité ;
- endpoints de visites encore inutilisés ;
- stockage des PDF en `BYTEA` avec limite de 10 Mo à surveiller.

Ces éléments ne sont pas tous des bugs de code, mais chacun doit avoir un responsable, une preuve de validation et une date de clôture.

## Documentation à corriger

`REPRISE.md` contient encore des informations contradictoires :

- une table indique que les remboursements `REFUNDED` ne sont pas disponibles, alors que la phase 55 et les tests les couvrent ;
- les tests d’intégration sont indiqués comme verts à un endroit et encore à lancer à un autre ;
- le point Flaix est décrit comme une incohérence connue mais doit être relié à une décision produit claire.

La numérotation historique des phases reste également irrégulière : les phases 16 à 18 n’ont pas d’entrée autonome complète, la phase 23 est absente et la phase 6 porte le titre « Audit Phase 6 ».

## Éléments validés et non bloquants

- Les tests backend, mobile, admin et back-office passent.
- Les 117 tests d’intégration PostgreSQL passent réellement.
- Les migrations sont à jour dans la base de validation.
- Les builds des cinq packages passent.
- Le stub du service de décision Flaix est documenté comme dépendant du contrat Flaix réel ; il ne doit simplement pas être présenté comme une intégration finale.
- Les erreurs JSDOM de navigation observées dans certains tests admin/back-office sont du bruit de test : les assertions passent, mais les mocks de navigation doivent être améliorés.

## Plan de correction recommandé

1. Bloquer les activations Flaix incomplètes ou livrer le parcours Flaix réel.
2. Décider et tester la synchronisation des statuts Flaix/Break Eat.
3. Finaliser les liens légaux et la confidentialité.
4. Corriger ou retirer l’action « Mes commandes ».
5. Rendre l’export web mobile reproductible et obligatoire dans la CI.
6. Ajouter les tests operator et nettoyer les avertissements lint.
7. Corriger le port PostgreSQL du script local.
8. Mettre à jour `REPRISE.md` et les dossiers de phases.
9. Effectuer une recette finale Railway et appareils réels avec preuves datées.

## Conclusion transmissible

Break Eat dispose d’un socle de code cohérent et largement testé. Les tests automatisés principaux, les builds et les tests d’intégration sont verts. Toutefois, plusieurs options encore visibles dans les interfaces ne correspondent pas à un parcours complet, notamment Flaix et « Mes commandes ». L’export web mobile n’est pas validé par la CI et l’application operator n’est pas couverte par des tests automatisés.

Le projet est donc **prêt pour les corrections finales et la recette**, mais **ne doit pas encore être déclaré totalement clôturé pour la production sans réserve**.
