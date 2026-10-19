# Break Eat

**Click & collect en temps réel pour stades, clubs et entreprises.** Le
spectateur commande depuis son téléphone, la buvette prépare, il récupère sans
faire la queue.

---

## 🚪 Tu ouvres ce dossier pour la première fois ?

**Va directement dans [`GUIDE_DEVELOPPEMENT/`](GUIDE_DEVELOPPEMENT/README.md).**
Il est écrit pour ça : comprendre le projet en une vingtaine de minutes au lieu
de fouiller pendant des heures.

Dans l'ordre, et rien d'autre pour commencer :

| # | Lire | Pourquoi |
|---|---|---|
| 1 | [`GUIDE_DEVELOPPEMENT/README.md`](GUIDE_DEVELOPPEMENT/README.md) | La vue d'ensemble : le monorepo, les technos, comment lancer |
| 2 | [`GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md`](GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md) | Où se trouve quoi — trouver le bon fichier en 30 secondes |
| 3 | [`REPRISE.md`](REPRISE.md) | **L'état courant** : ce qui marche, ce qui bloque, ce qui reste |

Ces trois-là suffisent pour poser une question intelligente. Le reste se lit
quand on en a besoin.

---

## 🗂️ Ce que contient le dossier

| Dossier | C'est quoi |
|---|---|
| `backend/` | L'API et toute la logique métier — NestJS, Prisma, PostgreSQL |
| `apps/mobile/` | L'app client (iOS, Android, et web) — React Native / Expo |
| `apps/admin/` | La console du **club** : son lieu, son catalogue, ses chiffres |
| `apps/operator/` | L'écran de **buvette** : les commandes à préparer |
| `apps/backoffice/` | Le **super-admin** : les clubs, les comptes, la plateforme |
| `packages/brand/` | Les couleurs et le logo, partagés par les trois consoles |
| `brain/` | La doc de fond : architecture, modèle métier, règles d'ingénierie |
| `GUIDE_DEVELOPPEMENT/` | **La porte d'entrée** (voir ci-dessus) |
| `phases de DEV/` | Les spécifications d'origine, phase par phase (.docx) |
| `outils/` | Les petits outils du dépôt (ex. décliner le logo) |

---

## 📚 Les quatre documents VIVANTS

Tout le reste est de l'historique. Ces quatre-là sont tenus à jour, et une
information qui les contredit a tort :

| Document | Répond à |
|---|---|
| [`REPRISE.md`](REPRISE.md) | **Où en est-on, que faire ensuite ?** |
| [`CHANGELOG.md`](CHANGELOG.md) | Qu'a-t-on livré, quand, et pourquoi ? |
| [`brain/ENGINEERING_MANUAL.md`](brain/ENGINEERING_MANUAL.md) | Pourquoi cette décision technique ? (avec les références de code) |
| [`brain/TASK_SUMMARY.md`](brain/TASK_SUMMARY.md) | Ce qu'a fait chaque session de travail |

Les autres — `DEVELOPMENT_LOG.md`, les `AUDIT_*.md`, `BLOC_6_0_SETUP_GUIDE.md`
— sont des **archives**. Elles disent la vérité du jour où elles ont été
écrites, et pas forcément celle d'aujourd'hui.

---

## ⚖️ Les règles de développement

Elles ne sont pas décoratives : la plupart viennent d'un incident précis, et
`brain/ENGINEERING_MANUAL.md` dit lequel.

1. **Lire `brain/` avant de coder.** Aucune logique produit ne s'invente contre
   ce qui y est écrit (`brain/AGENTS.md`).
2. **Une règle métier s'écrit UNE fois.** Elle vit dans
   `backend/src/common/helpers/`. Une règle écrite deux fois finit corrigée une
   seule fois — c'est l'origine de quatre des neuf défauts relevés en audit.
3. **Le contrôleur est mince.** Les routes valident et délèguent ; la logique
   est dans le service.
4. **La machine à états des commandes ne se contourne pas**
   (`brain/ORDER_STATE_MACHINE.md`). Aucune transition écrite à la main.
5. **Rien n'est émis en temps réel avant d'être persisté.** L'écran opérateur
   ne doit jamais voir ce que la base ignore.
6. **Les totaux d'une commande sont FIGÉS** à sa création — prix, taux de TVA,
   nom du produit. Corriger un prix demain ne réécrit pas la comptabilité
   d'hier.
7. **Ce qui touche l'argent ou la confidentialité se teste**, et le test dit
   dans sa phrase ce qu'il protège (`brain/TESTING_STRATEGY.md`).
8. **Le commentaire explique POURQUOI**, pas quoi. Un commentaire faux coûte
   plus cher qu'un commentaire absent.
9. **Jamais de secret dans le dépôt.** Ni clé Stripe, ni `DATABASE_URL`, ni
   certificat APNs. Les variables d'environnement vivent sur Railway et EAS.
10. **Le vocabulaire client est fixe.** On dit « partager l'addition » — jamais
    « ardoise » ni « tournée », qui sont le vocabulaire interne.

---

## 🚀 Mise en service

```bash
corepack pnpm install
```

Puis voir [`GUIDE_DEVELOPPEMENT/README.md`](GUIDE_DEVELOPPEMENT/README.md) § 4
pour lancer chaque application, et
[`DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md) avant toute mise en ligne.

**Déploiement** : pousser sur `main` suffit. Railway construit l'API et passe
les migrations tout seul (`pnpm db:migrate:prod` est dans son `startCommand`) ;
Vercel publie les consoles. L'application mobile, elle, demande une build EAS
explicite — voir `GUIDE_DEVELOPPEMENT/ENVIRONNEMENT_BETA.md`.
