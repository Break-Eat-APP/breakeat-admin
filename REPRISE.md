# 🔖 POINT DE REPRISE — Break Eat

> Ouvre ce fichier en premier dans une nouvelle session. Tout l'état utile est ici + dans les 4 docs (`CHANGELOG.md`, `DEVELOPMENT_LOG.md`, `brain/ENGINEERING_MANUAL.md`, `brain/TASK_SUMMARY.md`) + le git.

_Dernière mise à jour : 2026-07-25_

## 🚨 BLOQUEUR ACTUEL (2026-07-25) — backend hors ligne
L'essai **Railway a expiré** → le backend NestJS est **suspendu**. `https://breakeat-admin-production.up.railway.app` renvoie 404 « Application not found » (404 de l'edge Railway, PAS une erreur applicative). **Décision utilisateur : backend en pause** (ni paiement Railway, ni migration d'hébergeur pour l'instant).

Conséquences tant que non relancé : connexion admin + saisie de données (dont le plan buvettes) KO ; parcours de commande + notifs KO ; login/données réelles dans l'app KO. Ce qui marche sans backend : site web de l'app (Vercel) et la pastille « Plan des buvettes » en démo (image placehold.co).

Pour relancer : réactiver Railway (plan Hobby ~5 $/mois, zéro migration — `startCommand` applique `prisma migrate deploy` au démarrage) **ou** migrer Postgres + Redis + API ailleurs. Le code déployé est à jour : la migration `20260725_phase18_venue_buvette_plan` s'appliquera au prochain démarrage.

## 🎯 Direction (pivot app mobile, confirmée 2026-06-23)
L'app Break Eat = **porte d'entrée du click-and-collect Flaix**. Rôle : (1) téléchargement + inscription (différable), (2) **découverte des lieux** (recherche + géoloc), (3) choix du lieu → **Flaix prend le dessus** (API en arrière-plan, UI reste Break Eat), (4) profil (compte, historique). Dashboards manager / back office **en pause** (priorité = mobile). Auth **optionnelle** (navigation libre, jamais bloquante).

Dépendance externe : **spec/clé API Flaix** toujours nécessaire pour le handoff (Phase 11.5, `FLAIX_CONTRACT.md` non écrit) → écran/handoff câblé mais **stubbé**.

## 🧱 Entrées de build — À SAVOIR ABSOLUMENT
- **Tous les builds livrés (web Vercel ET natif iOS EAS) bundlent `apps/mobile/index.expo.js` → `App.expo.tsx`** (champ `package.json` `"main"`). Confirmé dans les logs EAS (`iOS Bundled … index.expo.js`).
- **`App.tsx` / `root-navigator.tsx` ne sont JAMAIS livrés** (code mort). Toute modif UI/nav doit se faire dans `App.expo.tsx` pour être visible.
- Dans `App.expo.tsx`, `EventHome`/`OrderTracking`/`QRScanner` sont des **stubs** (le vrai parcours caméra/live n'est pas dans le build preview).
- Garde-fou : `src/components/crash-guard.tsx` intercepte erreur au require / au rendu / JS fatale → écran d'erreur lisible au lieu d'un crash après le splash. Présent dans les 2 entrées.

## ✅ Livré depuis le pivot mobile (Phases 16 → 18)
- **Phase 16 — Découverte des lieux (mobile)** : écran `venue-discovery` (recherche + géoloc, tri proximité, rayon 10 km), backend `GET /public/venues` (Haversine, `q`/`lat`/`lng`/`radiusKm`), coords `latitude`/`longitude` + `searchTerms` sur `venues`. **Lieux privés** masqués côté serveur (Codex P2). Handoff Flaix + champ Flaix (`flaixEnabled`/`flaixVenueId`) sur le lieu.
- **Phase 17 — Back office SUPER_ADMIN** : création club + lieu en un formulaire, logo club, **notifications push** (composer + programmées, phase 17), **suppression d'org**, **utilisateurs + groupes** CRUD, parser coordonnées GPS (DMS + décimal), rayon 10 km.
- **Hébergement Vercel** : migration Netlify → **Vercel** (app web + admin). `vercel.json` (SPA rewrites, root `apps/mobile`), script `fix-web-assets.cjs` (déplace les assets `.pnpm` → `/vendor` pour l'hébergement statique). CORS backend élargi à l'URL Vercel.
- **Typographie Raleway** : tout le texte en **Raleway** (`HEAD.*`), Oswald installé (titres sport), Fredoka = legacy. Défaut RN Text = Raleway_500Medium dans les 2 entrées.
- **Build iOS interne (EAS)** : profil `preview`, distribution **interne (QR code)**, sans Mac. Owner `break-eat-app-spe`, projet `break-eat`, Apple Team `2A5L298Q4C`. **L'app s'ouvre et tourne** sur iPhone après la résolution de la saga des crashs (voir dette ci-dessous).
- **Phase 18 — Plan des buvettes par lieu** : `Venue.buvettePlanUrl` (+ migration), champ admin, CTA app (pastille sur la carte du lieu + bouton sur la confirmation de commande), viewer plein écran zoomable (`buvette-plan-viewer.tsx`). Exposé dans `/public/venues` et `PublicEvent.venue`.
- **Favoris (cœur)** : toggle local via le cœur (CTA), synchronisé Lieux ↔ Favoris. **Persistance backend = à faire.**

## ⏳ Reste à faire (backlog priorisé)
1. **Relancer le backend** (Railway ou autre) — débloque tout le reste (voir bloqueur en tête).
2. ~~Brancher l'accueil sur les vrais lieux~~ **FAIT (audit Codex 16→18)** : « Lieux près de toi » est câblé sur `apiSearchVenues`/`GET /public/venues` (recherche + géoloc, navigation Flaix/événement/« Bientôt »). Restent en placeholder : la section « À venir » (pas d'endpoint) et les favoris (locaux, pas de persistance).
3. **Persistance des favoris** : endpoint backend (save/read par utilisateur) + store mobile.
4. **Handoff Flaix** : bloqué sur le contrat/clé API Flaix (Phase 11.5).
5. **Setup natif push Expo** : modules Expo + FCM/APNs + rebuild, puis `apiRegisterPushToken` post-login (méthodes API déjà prêtes).
6. **Remise C3 au checkout** : appliquer `discountPercent` au panier (sensible — prix figé au checkout).
7. **Audit Codex** de la phase mobile 16→18.

## ⚠️ Dette technique / pièges connus (à signaler à Codex)
- **Double React (pnpm)** : l'app épingle `react@19.0.0` (RN 0.79/SDK 53) mais le monorepo hoiste `react@19.2.x` ; les paquets `@expo-google-fonts/*` importent `react` sans le déclarer → 2 copies dans le bundle → crash `TypeError: Cannot read property 'useState' of null` dans `useFonts`. **Fix en place : singletons forcés dans `apps/mobile/metro.config.js` (`resolveRequest` → react/react-dom/react-native depuis apps/mobile). NE PAS RETIRER.**
- **Composant racine** : `index.expo.js`/`index.js` enregistrent via `registerRootComponent` (Expo) → module « main » attendu par l'AppDelegate natif. Ne pas revenir à `AppRegistry.registerComponent(appName, …)` (crash après splash).
- **Modules natifs eager** : `react-native-vision-camera` (QRScanner) et `@sentry/react-native` jettent au chargement si le module natif manque → QRScanner lazy-loadé (`getComponent`), `Sentry.init` protégé par try/catch, plugin Sentry en prod uniquement.
- **`Alert.alert` = no-op sur react-native-web** → utiliser `src/lib/alert.ts` (`showAlert`/`confirmAction`).
- **@types/react** volontairement `^19.1.0` (exclu du check `expo doctor` via `package.json` > `expo.install.exclude`) : le monorepo résout 19.2.x et 19.0.x casse `tsc`. Aucun impact runtime.
- Après tout changement de schéma Prisma : **arrêter le backend** (DLL Windows verrouillé) → `prisma generate` → relancer.

## 🔎 Vérifier un bundle iOS sans build EAS (utile pour debug crash)
`cd apps/mobile` puis `npx expo export:embed --platform ios --dev false --entry-file <ABSOLU>/index.expo.js --bundle-output out.jsbundle --assets-dest out-assets` — l'entry DOIT être un chemin absolu. Compter les occurrences de la version React parasite dans `out.jsbundle` (doit être 0).

## 🚀 Lancer l'environnement (Windows)
`pnpm` via **corepack** (Node OK) :
```
corepack pnpm --filter @break-eat/backend start:dev    # port 3000
corepack pnpm --filter @break-eat/admin dev            # port 3001
corepack pnpm --filter @break-eat/backoffice dev       # port 3003
corepack pnpm --filter @break-eat/operator dev         # port 3002
```
Docker (Postgres/Redis) doit tourner. DB = `breakeat_dev`.
Build iOS interne : `cd apps/mobile && eas build -p ios --profile preview` (installer via le NOUVEAU QR code du build).

## 🔑 Connexion (dev)
- URL : http://localhost:3001 (manager) · http://localhost:3003 (back office)
- `admin@breakeat.test` / `BreakEat2026!` (SUPER_ADMIN)
