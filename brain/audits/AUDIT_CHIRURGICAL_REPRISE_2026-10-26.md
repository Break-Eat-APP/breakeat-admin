# Audit chirurgical de reprise — Break Eat

**Date :** 26 octobre 2026  
**Commit audité :** `297d2fa`  
**Périmètre :** backend, applications web/mobile, flags, WebSocket/Redis, CI GitHub Actions, Railway/Nixpacks, migrations, dépendances et préparation à la charge.

**Aucun code applicatif n’a été modifié pendant cet audit.** Les conteneurs PostgreSQL/Redis temporaires utilisés pour les tests ont été supprimés.

## Verdict

Le dépôt est nettement plus solide et plusieurs anciens P0/P1 sont effectivement corrigés. Il ne faut toutefois pas le déclarer prêt pour production tant que ces deux blocages ne sont pas réglés :

1. la suite d’intégration CI est rouge ;
2. le build de l’application opérateur échoue.

À cela s’ajoutent des risques importants pour 100 000 utilisateurs : panne Redis mal gérée, sauvegardes non prouvées actives, absence d’outbox durable et lectures non bornées.

## Contrôles exécutés

| Contrôle | Résultat |
|---|---|
| Lint Turbo | OK — 5 packages |
| Typecheck Turbo | OK — 5 packages |
| Tests unitaires | OK — backend : 65 suites / 857 tests ; frontends verts |
| Migrations sur PostgreSQL 18 vierge | OK — 47 migrations |
| Vérificateur de migrations | OK |
| Intégration PostgreSQL 18 + Redis 7 | ÉCHEC — 15 suites passent, 131 tests passent, 1 suite ne compile pas |
| Build Turbo complet | ÉCHEC — application opérateur |
| Audit dépendances | 0 critique, 55 high, 24 moderate, 3 low |

## P1 — À corriger avant livraison

### P1-1 — Test d’intégration de l’ardoise obsolète

**Preuve :** `backend/test/integration/ardoise-envoi.int-spec.ts:38-43`.

Le test instancie `OrderSplitsService` avec 4 arguments. Le constructeur actuel, dans `backend/src/modules/order-splits/order-splits.service.ts:96-102`, exige aussi `FeatureFlagsService`.

Erreur observée :

```
TS2554: Expected 5 arguments, but got 4
```

**Impact :** le flux financier réel de l’ardoise ne s’exécute plus en CI. Le correctif des flags a créé une régression de test d’intégration.

**Action :** injecter un faux `FeatureFlagsService` dans ce test, puis rejouer la suite sur PostgreSQL réel.

### P1-2 — Build de l’application opérateur cassé

Commande : `pnpm turbo build --concurrency=2`.

Erreur :

```
lucide-react/dist/esm/Icon.mjs
Module not found: Can't resolve
'./shared/src/utils/hasA11yProp.mjs'
```

Le chemin est déclenché depuis `apps/operator/src/app/dashboard/[eventId]/page.tsx` via `lucide-react@1.17.0`.

**Impact :** le déploiement de l’interface opérateur peut être refusé même si lint et typecheck passent.

**Action :** verrouiller une version compatible de `lucide-react`/Next ou corriger la résolution Webpack, puis refaire `pnpm install --frozen-lockfile` et le build complet.

### P1-3 — Le comportement de limitation Redis n’est pas celui annoncé

**Fichier :** `backend/src/common/securite/limitation-redis.ts:91-118`.

Le commentaire annonce qu’une panne Redis laisse passer les requêtes avec une limitation dégradée. Pourtant `increment()` attend directement la commande Lua, sans fallback ni `try/catch`. Le guard Throttler attend cette promesse directement.

**Impact probable :** une coupure Redis en cours de service peut produire des erreurs HTTP sur les routes protégées au lieu d’une dégradation contrôlée.

**Action :** choisir explicitement fail-open, fail-closed ou circuit breaker et ajouter un test qui coupe Redis après le démarrage.

### P1-4 — Les sauvegardes sont codées mais non démontrées actives

**Fichiers :** `.github/workflows/sauvegarde.yml:111-127`, `brain/TASK_SUMMARY.md:89`.

Le workflow dépend de `DATABASE_URL_SAUVEGARDE` et `SAUVEGARDE_PASSPHRASE`. Le dépôt indique que ces secrets restent à poser.

**Impact :** aucune garantie de restauration tant qu’un workflow réel et une restauration sur base jetable n’ont pas réussi.

**Action :** activer les secrets, lancer le workflow manuellement, vérifier l’artefact chiffré et effectuer une restauration complète.

### P1-5 — Pas d’outbox durable

Les événements sont émis après commit, mais ne sont pas conservés dans une outbox durable. La réconciliation opérateur réduit le risque, sans garantir la livraison pour tous les consommateurs.

**Impact :** perte possible d’un événement entre le commit SQL et l’émission Socket.IO ; les notifications et autres flux peuvent ne jamais être rejoués.

**Action :** accepter explicitement ce niveau de fiabilité pour la V1 ou implémenter une outbox avec statut, tentatives, reprise et purge.

## P2 — Risques fonctionnels et de montée en charge

### P2-1 — Le flag ardoise ignore les scopes organisation/événement

**Fichier :** `backend/src/modules/order-splits/order-splits.service.ts:119-121`.

`estActive()` appelle `resolveOuRien('app.split.enabled')` sans `orgId` ni `eventId`. Le système de flags sait gérer EVENT > ORGANIZATION > GLOBAL, mais l’ardoise ne transmet pas le contexte.

**Impact :** seul le flag global peut réellement désactiver l’ardoise.

### P2-2 — Les messages WebSocket ne sont pas limités

Chaque `join_room` déclenche une ou plusieurs lectures Prisma. Le throttler HTTP ne protège pas automatiquement les messages Socket.IO.

**Impact :** amplification SQL par socket authentifiée et pression sur la base à grande échelle.

**Action :** limiter par socket/utilisateur, mémoriser les rooms déjà autorisées et ajouter un test de spam.

### P2-3 — Accès SUPER_ADMIN incohérent sur les rooms

Les rooms organisation/événement/commande passent par `requireOrgAccess`, qui autorise le SUPER_ADMIN. La room `supplier:` exige en revanche une appartenance réelle dans `accesBuvette()`.

**Impact :** la supervision cross-tenant peut fonctionner pour certaines rooms mais pas pour une buvette.

### P2-4 — Lectures non bornées clients et campagnes

- `backend/src/modules/clients/clients.service.ts:65-120` agrège tous les clients puis trie en mémoire ;
- `clients.service.ts:153-175` charge toutes les lignes de commande pour le produit préféré ;
- `backend/src/modules/notifications/scheduled-push.service.ts:131-151` charge tous les tokens ou utilisateurs d’un segment.

**Impact :** consommation mémoire, requêtes longues et timeouts sur de gros clubs/campagnes.

**Action :** pagination, agrégation SQL, curseurs et traitements batch bornés ; test avec données proches de 100 000 profils.

### P2-5 — Le healthcheck Railway est seulement une liveness

**Fichier :** `backend/src/health/health.controller.ts:41-53`.

`GET /health` renvoie toujours `status: ok` sans vérifier PostgreSQL, Redis ni les migrations.

**Impact :** Railway peut garder un conteneur qui répond HTTP mais ne peut plus traiter une commande.

**Action :** conserver `/health` pour la liveness et ajouter `/ready` pour la DB/Redis.

### P2-6 — Fallback API localhost dans les applications publiées

**Fichiers :** `apps/operator/src/hooks/useFeatureFlag.ts:5`, `apps/operator/src/app/dashboard/[eventId]/page.tsx:33`, `apps/operator/src/lib/api/orders-client.ts:8-10`.

Si `NEXT_PUBLIC_API_URL` manque dans Vercel, l’application publiée appelle `localhost:3000` sur le poste du visiteur.

**Action :** faire échouer la build de production si la variable manque ; garder le fallback uniquement en développement local.

### P2-7 — PostgreSQL 16 et 18 sont mélangés

CI et production documentée utilisent PostgreSQL 18, tandis que `docker-compose.yml` et `docker-compose.prod.yml` utilisent encore `postgres:16-alpine`.

**Impact :** les tests locaux et un éventuel déploiement Docker ne reproduisent pas Railway.

### P2-8 — Deux chemins de démarrage persistent

Railway utilise `railway.json` + Nixpacks ; `backend/Dockerfile` lance directement une autre commande de migration.

**Impact :** auto-hébergement et Railway peuvent diverger.

### P2-9 — La CI référence une branche `develop` absente

`.github/workflows/ci.yml` écoute `main` et `develop`, mais la branche `develop` n’existe pas actuellement.

**Impact :** pas de blocage sur `main`, mais politique CI de préproduction incomplète ou fictive.

## P3 — Qualité et dette à traiter ensuite

### P3-1 — Les dépendances ne sont pas propres

`pnpm audit --prod` retourne 55 high. Une partie vient du build, Expo, Next, Storybook ou Sentry et n’est pas automatiquement exposée par l’API ; néanmoins la déclaration « zéro high » n’est plus exacte.

Les paquets signalés comprennent notamment `sharp`, `postcss`, `zod`, `compression`, `js-yaml`, `fast-uri`, `@xmldom/xmldom` et `node-forge`.

**Action :** séparer l’audit runtime backend de l’audit build/dev frontend et justifier chaque high.

### P3-2 — Avertissement ESLint Next

Les builds admin/backoffice affichent que le plugin Next.js n’est pas détecté dans la configuration ESLint. Le build passe, mais certaines règles Next peuvent manquer.

### P3-3 — Campagnes : `sentAt` est renseigné même en échec total

**Fichier :** `backend/src/modules/notifications/scheduled-push.service.ts:203-209`.

Une campagne `FAILED` reçoit quand même une date `sentAt`, ce qui rend le reporting ambigu.

## Corrections confirmées

- accès WebSocket refusé par défaut et compte désactivé rejeté ;
- Redis temps réel multi-instance testé sur Redis réel ;
- JWT faible refusé au démarrage ;
- double réservation de fidélité corrigée ;
- refus de stock sans mutation parasite ;
- limitation Redis partagée entre instances ;
- pool Prisma explicite ;
- campagnes par lots et campagnes bloquées traitées ;
- 47 migrations validées sur PostgreSQL 18 vierge ;
- chemin de déploiement frontend unifié ;
- commande Railway principale recentrée dans `railway.json`.

## Ordre de correction recommandé

1. Corriger le constructeur du test d’intégration ardoise.
2. Corriger `lucide-react`/Next et refaire le build avec installation fraîche.
3. Rejouer toute la CI GitHub sur `main`.
4. Tester Redis coupé après démarrage et décider fail-open/fail-closed.
5. Activer et restaurer une sauvegarde chiffrée.
6. Décider officiellement pour l’outbox durable.
7. Corriger flags scoped, rate-limit WebSocket et lectures non bornées.
8. Faire un test de charge avec 50 lieux, écrans opérateurs, WebSocket, paniers, paiements simulés, campagnes et reconnexions.

## Conclusion

Les corrections récentes ont supprimé plusieurs failles importantes, mais l’état actuel prouve encore deux défauts de livraison immédiats : **CI intégration rouge** et **build opérateur rouge**. Tant que ces deux lignes ne sont pas vertes sur une installation propre, l’application ne doit pas être déclarée prête pour un déploiement ou un test à 100 000 utilisateurs.

Cet audit combine inspection statique, tests unitaires, intégration PostgreSQL/Redis et build local. Il ne remplace pas un test de charge distribué ni une vérification directe des variables réellement présentes dans Railway et Vercel.

