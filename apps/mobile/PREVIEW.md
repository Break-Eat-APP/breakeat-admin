# 👀 Prévisualiser l'app sur iPhone / iPad (sans Mac, sans build natif)

Deux façons de voir le visuel. **Le web est recommandé** (le plus fiable, via un simple lien
dans Safari ; build web déjà validé). Expo Go donne un rendu natif plus fidèle mais demande
d'aligner des versions (verrous Expo Go).

> Entrée de preview = `index.expo.js` → `App.expo.tsx` (réutilise les vrais écrans, sans la
> caméra ni Sentry). L'entrée native de prod (`index.js` / `App.tsx`) est inchangée.

---

## Prérequis communs
1. **Backend lancé** (Docker Postgres/Redis up) :
   ```
   corepack pnpm --filter @break-eat/backend start:dev
   ```
2. **iPhone/iPad et PC sur le même Wi-Fi.**
3. **Trouver l'IP LAN du PC** : `ipconfig` → ligne « Adresse IPv4 » (ex. `192.168.1.23`).
4. **Pointer l'app vers le backend** : dans `src/lib/config/env.ts`, mettre l'IP du PC :
   ```ts
   API_URL: ... ?? 'http://192.168.1.23:3000/api/v1',
   ```
5. **Autoriser l'origine du preview côté CORS** : dans `backend/.env`, ajouter `:8081` à
   `CORS_ORIGINS` (sinon le navigateur bloque les appels API) :
   ```
   CORS_ORIGINS=...,http://localhost:8081,http://192.168.1.23:8081
   ```
   Puis relancer le backend.

---

## Option A — Web (recommandé, via un lien) ✅
```
corepack pnpm --filter @break-eat/mobile preview -- --web
# ou : cd apps/mobile && npx expo start --web
```
- Ça ouvre l'app dans le navigateur du PC.
- Sur l'**iPhone/iPad** : ouvre Safari → `http://<IP-DU-PC>:8081`.
- (Windows peut demander d'autoriser Node dans le pare-feu → accepter « Réseaux privés ».)

## Option B — Expo Go (rendu natif fidèle)
1. Installer **Expo Go** (App Store) sur iPhone/iPad.
2. ```
   cd apps/mobile && npx expo start
   ```
3. Scanner le QR (appareil photo iOS) ou ouvrir le lien `exp://…`.
- ⚠️ Si Expo Go affiche une erreur de version, aligner les libs sur le SDK 53 :
  `npx expo install --fix` (peut modifier react/react-native/safe-area/screens).
  Tester d'abord l'**option Web** qui n'a pas ce souci.

---

## Ce qu'on voit / ne voit pas dans le preview
- ✅ Écran **Lieux** (recherche + géoloc*), **Connexion/Inscription**, **Mes commandes**,
  **Profil**, barre d'onglets, thème blanc/orange, cartes ombrées.
- ⛔ Le scan QR, et le **handoff Flaix** (EventHome) = écrans stub (non prévisualisables).
- *Géoloc : sur web, le navigateur demande la position ; en Expo Go, fallback liste/recherche
  tant que le module natif n'est pas installé.
