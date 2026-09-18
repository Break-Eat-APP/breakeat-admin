# Audit du dépôt — 18/09/2026

État des lieux complet, fait à la demande, avant changement de session.
Rien n'était en cours : dossier de travail propre, `main` local = GitHub =
production (`4c16805`).

---

## 1. Ce qui tourne, et où

| Pièce | Hébergement | État au 18/09 |
|---|---|---|
| API (NestJS) | Railway — service `breakeat-admin` | en ligne, commit `4c16805` (visible dans `/health`) |
| Base Postgres, Redis | Railway (services distincts) | en ligne |
| Dashboard manager | Vercel — `breakeat-admin-admin.vercel.app` | en ligne |
| Back-office super-admin | Vercel — `breakeat-admin-backoffice.vercel.app` | en ligne |
| Poste opérateur | Vercel — `breakeat-operator.vercel.app` | en ligne |
| App web (export Expo) | Vercel — `breakeat-admin-mobile-rho.vercel.app` | en ligne |
| App iOS | TestFlight | **build 15** (17/09) |

**Railway ne redéploie plus l'API pour un commit de documentation** : depuis le
16/09, `railway.json` limite les déclenchements (`watchPatterns`) au serveur, à
sa configuration de build et aux dépendances. Un déploiement qui ne part pas
n'est donc plus une anomalie quand seuls des `.md` ont changé.

**`/health` annonce le commit déployé.** C'est la réponse à « ma livraison
est-elle passée ? » : Railway laisse l'ancien conteneur répondre tant que le
nouveau n'a pas passé son contrôle de santé, et tout paraît normal de
l'extérieur.

---

## 2. Le code, en chiffres

| Zone | Fichiers suivis | Remarque |
|---|---|---|
| `backend/src` | 227 | 25 modules NestJS |
| `apps/mobile/src` | 46 | + `targets/live-activity` (Swift), `modules/live-activity` (pont natif) |
| `apps/admin/src` | 32 | dashboard manager |
| `apps/operator/src` | 27 | poste comptoir |
| `apps/backoffice/src` | 16 | super-admin |
| `packages/brand/src` | 3 | couleurs, typo, logo partagés |
| migrations Prisma | 37 | toutes appliquées en production |

Versions : Nest 11, Prisma 6.8, Stripe 17.5, `jose` 5 (CommonJS — la 6 est ESM
seule et ne se charge pas dans le build Nest), Expo SDK 57 / React Native 0.86,
Next 15, React 19.

Aucun `TODO`, `FIXME` ni `HACK` dans le code applicatif : les décisions et les
réserves sont écrites en commentaires explicites ou dans `ENGINEERING_MANUAL.md`.

---

## 3. Tests

| Suite | Nombre | Commande |
|---|---|---|
| Unitaires backend | **543** (44 fichiers) | `pnpm --filter @break-eat/backend test` |
| Intégration, base réelle | **37** (2 fichiers) | `pnpm test:integration` + `DATABASE_URL_TEST` |
| Applications (mobile, web) | **0** | — |

Les tests d'intégration tournent sur un Postgres construit par
`prisma migrate deploy` : c'est le seul endroit où les règles de suppression
(CASCADE, RESTRICT, SET NULL), les contraintes `CHECK` et les index uniques sont
réellement vérifiés — le SQL des migrations diverge par endroits de
`schema.prisma`, et une doublure ne voit ni l'un ni l'autre.

**Trois manques, par ordre d'importance :**

1. **Aucun test dans les applications.** Le poste opérateur et le dashboard
   n'ont aucun filet : leurs régressions se voient à l'écran, ou pas du tout.
2. **Jest ne fonctionne pas sur le mobile** (`@react-native/jest-preset` échoue
   au chargement sous pnpm). D'où `--passWithNoTests` : la commande passe sans
   rien exécuter, ce qui est pire que pas de tests du tout — ça rassure à tort.
3. **La suite d'intégration ne tourne pas en CI** (il lui faut un service
   Postgres dans le workflow). Elle n'est jouée que localement, à la main.

CI actuelle (`.github/workflows/ci.yml`) : lint, typecheck, test, build via
Turbo. Deux autres workflows : déploiement Vercel, build EAS de prévisualisation.

---

## 4. Dette technique, par priorité

### À traiter bientôt

1. **Le statut d'une organisation n'est vérifié nulle part.** « Désactiver » dans
   le back-office ne change qu'une étiquette : une organisation suspendue reste
   visible dans l'app et commandable. Le correctif est prêt à écrire, mais
   demande d'abord de vérifier qu'aucun club en service n'est marqué suspendu —
   sinon il disparaîtrait de l'application.
2. **Le back-office ne renouvelle pas sa session** : il déconnecte au bout de
   15 minutes. Le dashboard manager, le poste et l'app ont été corrigés le 16/09
   (une seule demande de renouvellement à la fois) ; le back-office, lui, n'a
   jamais eu de renouvellement du tout.
3. **Jest mobile à réparer**, puis premiers tests d'application (renouvellement
   de session, carte de commande, bandeau « produit manquant »).

### À surveiller

4. **Les commandes de démonstration** (`DEMO-…`) restent en base tant que la
   purge n'a pas été lancée depuis le back-office : elles comptent comme payées
   et gonflent le chiffre d'affaires et la TVA.
5. **`schema.prisma` diverge du SQL des migrations** par endroits (un `Restrict`
   annoncé au schéma est un `SET NULL` en base). La base fait foi ; le schéma
   sert de vue d'ensemble. À aligner un jour, migration par migration.
6. **`GET /orders/:id` renvoie les lignes de paiement** (identifiants Stripe) au
   client propriétaire de la commande. Sans danger immédiat, mais l'app n'en a
   aucun usage : à retirer de la réponse.
7. **Le remboursement d'un produit manquant est manuel** (au comptoir). Un
   remboursement partiel automatique via Stripe est possible : il déplace de
   l'argent, donc c'est une décision à part.

### Code mort, assumé

- `apps/mobile/App.tsx` et `src/navigation/root-navigator.tsx` ne sont **jamais
  livrés** : toutes les builds (web et natives) passent par `index.expo.js` →
  `App.expo.tsx`. Les garder induit en erreur à chaque lecture.
- `OrderNotificationsService` (push par étape) est conservé sans appelant depuis
  le 07/09 : la Live Activity fait le travail, et les modèles écrits par des
  clubs restent en base. Effacer des données se décide.

---

## 5. Ménage fait dans cette session

- `prisma/migrations/20260601_phase5_codex_audit/` à la racine (vide) et
  `backend/C:UsersnottaAppDataLocalTemptmpmqs5yidtn/` (vide, né d'un chemin
  Windows mal échappé) : supprimés. Aucun des deux n'était suivi par git.
- `backend/.env.example` : les variables `STORAGE_*` et `GROUP_SPLIT_ENABLED`,
  utilisées par le code mais absentes du fichier, y sont maintenant décrites.

Restent à la racine, volontairement : les documents Word/PDF du dossier CTO, les
pages HTML du site vitrine et `phases de DEV/` (générateurs historiques). Ils ne
gênent aucun build — mais ils ne sont plus tenus à jour.

---

## 6. Documentation — ce qui fait foi

| Document | À jour au | Rôle |
|---|---|---|
| `REPRISE.md` | 18/09 | **à lire en premier** : état, points en attente, méthode |
| `brain/ENGINEERING_MANUAL.md` | 18/09 | pourquoi chaque décision, phase par phase (36 phases) |
| `CHANGELOG.md` | 18/09 | ce qui a été livré, quand |
| `GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md` | 18/09 | où trouver quoi |
| `brain/ROADMAP.md` | 25/08 | plan initial — historique |
| `brain/ARCHITECTURE.md`, `DOMAIN_MODEL.md` | 06 → 08/2026 | fondations, peu bougé |
| `DEVELOPMENT_LOG.md`, `CODEX_AUDIT.md`, `DEPLOYMENT_CHECKLIST.md` | ≤ 06/2026 | historiques, non tenus |

---

## 7. En attente d'une décision ou d'une action

1. **Build 16** — non lancée. Elle apporterait sur le téléphone : la Live
   Activity réordonnée (plus de bouton vert coupé, plus de « Retrait prévu à
   00:00 », numéro de commande à la place de l'heure) et le bandeau « produit
   manquant » dans l'écran **Suivi**. Tout le reste est déjà actif côté serveur.
2. **Purger la démonstration** — back-office → Vue d'ensemble. Irréversible.
3. **Vérifier les statuts d'organisation** — back-office → Organisations, avant
   de faire respecter le statut (point 1 de la dette).
