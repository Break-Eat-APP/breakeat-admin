# 🧭 Guide développement — Break Eat

> **Tu reprends le projet ? Commence ici.** Ce dossier existe pour comprendre le projet en ~20 min au lieu de chercher pendant des heures. Il ne remplace pas `/brain` (la doc technique de fond) — il t'y emmène.

---

## 1. C'est quoi Break Eat

Plateforme de **click & collect en temps réel** pour stades et entreprises : le spectateur commande depuis son téléphone, l'exploitant de buvette prépare, le client récupère sans faire la queue. À terme, l'app mobile est la **porte d'entrée du système de commande Flaix** (Flaix = moteur de commande tiers, branché par API — voir `brain/FLAIX_CONTRACT.md`).

## 2. Le monorepo en un coup d'œil

pnpm workspaces. Cinq applications + un package partagé :

| Dossier | C'est quoi | Techno | Port dev |
|---|---|---|---|
| `backend/` | API + logique métier + base de données | NestJS 11, Prisma 6, PostgreSQL, Redis | 3000 |
| `apps/mobile/` | **L'app client** (iOS/Android + web) | React Native 0.86.2, Expo SDK 57 (bare) | — |
| `apps/admin/` | Dashboard du **club** (manager) | Next.js 15 | 3001 |
| `apps/operator/` | Écran **buvette** (préparation commandes) | Next.js 15 | 3002 |
| `apps/backoffice/` | **Super-admin** (gestion des clubs) | Next.js 15 | 3003 |
| `packages/brand/` | Tokens de marque partagés (couleurs, logo) | TS | — |

## 3. Par où lire (ordre conseillé)

1. **Ce fichier** — la vue d'ensemble.
2. [`CARTE_DU_CODE.md`](CARTE_DU_CODE.md) — où se trouve quoi, fichier par fichier.
3. **`../REPRISE.md`** (racine) — l'état courant : ce qui est fait, ce qui bloque, ce qui reste. **Toujours à jour, lu en premier à chaque session.**
4. `../brain/ARCHITECTURE.md` + `../brain/DOMAIN_MODEL.md` — les règles d'archi et le modèle métier.
5. `../brain/ENGINEERING_MANUAL.md` — notice technique avec références de code.
6. `../CHANGELOG.md` + `../brain/TASK_SUMMARY.md` — l'historique des phases (quoi a été livré, quand, pourquoi).
7. `../phases de DEV/` — les specs d'origine de chaque phase (.docx).

## 4. Lancer le projet en local (Windows)

`pnpm` passe par **corepack** (Node est déjà installé) ; Docker (Postgres + Redis) doit tourner ; base = `breakeat_dev`.

```
corepack pnpm --filter @break-eat/backend start:dev     # API  → :3000
corepack pnpm --filter @break-eat/admin dev             # club → :3001
corepack pnpm --filter @break-eat/operator dev          # buvette → :3002
corepack pnpm --filter @break-eat/backoffice dev        # super-admin → :3003
```

App mobile (aperçu web rapide) : `corepack pnpm --filter @break-eat/mobile build:web` puis servir `apps/mobile/dist`.
App mobile (build iOS de test, sans Mac) : `cd apps/mobile && eas build -p ios --profile preview` → installer via le QR code.

Connexion dev : `admin@breakeat.test` / `BreakEat2026!` (SUPER_ADMIN) sur :3001 et :3003.

## 5. ⚠️ Les 6 pièges à connaître AVANT de coder

Ce sont des choses non évidentes qui ont coûté du temps. Détail complet dans `../REPRISE.md` § « Dette technique ».

1. **L'app mobile livrée = `index.expo.js` → `App.expo.tsx`** (champ `package.json` `main`). `App.tsx` et `src/navigation/root-navigator.tsx` sont **du code mort** : ils ne sont JAMAIS livrés (ni web, ni iOS). Modifie `App.expo.tsx`, sinon ton changement est invisible.
2. **React en double = crash au démarrage.** Le monorepo peut charger 2 copies de React → `useState of null`. Un garde-fou force une copie unique dans `apps/mobile/metro.config.js` (`resolveRequest`). **Ne le retire pas.**
3. **`Alert.alert` ne marche pas sur le web** (react-native-web). Utilise `src/lib/alert.ts` (`showAlert` / `confirmAction`).
4. **Après tout changement du schéma Prisma** : arrêter le backend (DLL verrouillée sous Windows) → `prisma generate` → relancer.
5. **Modules natifs qui plantent au chargement** (caméra, Sentry) : chargés en lazy / protégés try-catch. Ne les importe pas au niveau racine d'un écran de démarrage.
6. **`crash-guard.tsx`** attrape les erreurs de démarrage et les affiche à l'écran (au lieu de fermer l'app). Si l'app affiche un écran d'erreur rouge, c'est lui — lis le message, il donne la stack.

## 6. Comment le projet a été développé (méthode)

- **Par phases** (Phase 1 → 18). Chaque phase = une spec (`phases de DEV/*.docx`), une implémentation, une entrée `CHANGELOG.md` + `brain/TASK_SUMMARY.md`, puis un **audit Codex** (prompt dans `brain/CODEX_AUDIT_PROMPT.md`, rapports archivés dans `brain/audits/`).
- **Phases 1→15** : construction du back-office et du back-end (auth, événements, buvettes, commandes temps réel, dashboards, notifications push).
- **Phases 16→18** (pivot mobile) : l'app devient la priorité — découverte géolocalisée des lieux, hébergement Vercel, build iOS interne, plan des buvettes.
- **Phases 19→20** (actuel) : état live des commandes (couleurs + créneau), bouton « Je suis arrivé » (la carte pulse côté buvette), et **programme de fidélité** (points gagnés/utilisés, activable par club). Voir l'entrée du 2026-08-11 dans `brain/TASK_SUMMARY.md`.

## 7. État actuel en une phrase

App mobile iOS fonctionnelle en test interne ; **le backend hébergé est en pause** (essai Railway expiré) → tout se développe et se teste **en local** via `demarrer-local.bat`. Détail et prochaines étapes : `../REPRISE.md`.

## 8. Lancer le projet en local — le raccourci

Double-clic sur **`../demarrer-local.bat`** (Docker Desktop doit être ouvert). Il démarre la base + les 3 services dans des fenêtres séparées. Pour tout arrêter : ferme ces fenêtres.
