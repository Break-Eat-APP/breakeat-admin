# 🌐 Déployer l'app web (URL publique, inscription)

L'app web (export Expo) est un site statique dans `dist/`. Elle vise le backend
**Railway** déjà en ligne. Objectif immédiat : **inscription/connexion publiques**.

## 1. Construire le bundle (vise la prod)
```
cd apps/mobile
EXPO_PUBLIC_API_URL="https://breakeat-admin-production.up.railway.app/api/v1" npx expo export -p web
```
→ produit `apps/mobile/dist/`.

## 2. Déployer `dist/`
**Option A — Netlify Drop (zéro config) :** va sur https://app.netlify.com/drop et
glisse le dossier `apps/mobile/dist`. URL publique immédiate.

**Option B — Vercel (déjà utilisé pour admin/operator) :**
```
cd apps/mobile
npx vercel deploy dist --prod
```

## 3. ⚠️ Autoriser l'origine côté backend (CORS) — sinon l'inscription est bloquée
Dans **Railway → service backend → Variables**, ajoute l'URL déployée à `CORS_ORIGINS` :
```
CORS_ORIGINS=...existant...,https://<ton-app>.netlify.app
```
puis redéploie le backend (Railway redémarre).

## ✅ Ce qui marche tout de suite
Inscription, connexion, profil — contre le backend Railway actuel.

## ⏳ Ce qui nécessite un redéploiement backend
La **découverte des lieux** (`GET /public/venues`), l'**historique** (`GET /orders`) et
le **filtrage des lieux privés** sont du code récent **pas encore déployé sur Railway**.
Il faut redéployer le backend (push de la branche) **et** appliquer les migrations DB
(`migration_lock.toml`, `phase15`, `phase16` — cf. REPRISE.md) sur la base de prod.

## ⛔ La commande de bout en bout
Bloquée sur le contrat d'API **Flaix** (Phase 11.5, non écrit). Inscription/navigation
OK ; la commande réelle attend Flaix.
