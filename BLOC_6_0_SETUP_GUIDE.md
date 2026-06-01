# Bloc 6.0 — Setup Guide (à exécuter par le product owner)

> **Version :** 1.0 — 28/05/2026
> **Durée estimée totale :** 1h30 à 2h
> **Coût initial :** 0 € (tous les services en free tier pour staging)
> **Coût récurrent estimé :** 20-30 €/mois quand le projet sera plus chargé

---

## 📋 Ordre d'exécution recommandé

Suis les étapes **dans l'ordre**. Si tu bloques sur une étape, **stoppe et écris-moi**, je débuggue avec toi avant qu'on passe à la suivante.

```
ÉTAPE 1 : Vercel (15 min)        — déploiement frontends
ÉTAPE 2 : Railway (20 min)       — backend + PostgreSQL + Redis
ÉTAPE 3 : Firebase (15 min)      — mobile preview distribution
ÉTAPE 4 : GitHub Secrets (10 min) — connexion des comptes au repo
ÉTAPE 5 : Domaines (optionnel, 30 min) — staging.breakeat.com etc.
```

---

# ÉTAPE 1 — Vercel (15 min)

**But :** Déployer `apps/admin` et `apps/operator` en staging avec URL publique.

## 1.1 — Créer compte Vercel
1. Va sur **https://vercel.com/signup**
2. Clique **"Continue with GitHub"** (lie ton compte GitHub directement)
3. Plan **Hobby (gratuit)** — suffisant pour staging

## 1.2 — Créer le projet `breakeat-admin`
1. Dashboard Vercel → **Add New… → Project**
2. **Import Git Repository** → sélectionne ton repo `Break-Eat-APP`
3. **Configure Project :**
   - **Project Name :** `breakeat-admin`
   - **Framework Preset :** Next.js (auto-détecté)
   - **Root Directory :** `apps/admin` ⚠️ important
   - **Build Command :** **laisse vide** — il est défini dans `apps/admin/vercel.json` (Vercel lit ce fichier automatiquement ; ne mets rien dans le dashboard, sinon les deux entrent en conflit)
   - **Output Directory :** **laisse vide** — déjà fixé à `.next` dans `vercel.json`
   - **Install Command :** **laisse vide** — `vercel.json` gère l'install (monorepo : `pnpm install --frozen-lockfile` à la racine, puis build de l'app)

   > ℹ️ **Source de vérité unique :** toute la config de build vit dans `apps/admin/vercel.json` (et `apps/operator/vercel.json`). On NE configure RIEN à la main dans le dashboard Vercel, pour éviter que dashboard et fichier divergent.
4. **Environment Variables** (à ajouter, on remplit en ÉTAPE 4) :
   - `NEXT_PUBLIC_API_URL` = (vide pour l'instant)
5. Clique **Deploy**
6. Quand le déploiement passe → tu obtiens une URL `https://breakeat-admin-xxxx.vercel.app`
7. ✏️ **Note cette URL pour me l'envoyer**

## 1.3 — Créer le projet `breakeat-operator`
**Répète 1.2** avec :
- **Project Name :** `breakeat-operator`
- **Root Directory :** `apps/operator`
- Tout le reste identique

✏️ **Note la 2e URL générée.**

## 1.4 — Confirmation
Tu dois avoir 2 URLs Vercel actives. Si oui : **étape 1 terminée ✅**

---

# ÉTAPE 2 — Railway (20 min)

**But :** Déployer le backend NestJS + provisionner PostgreSQL + Redis managés.

## 2.1 — Créer compte Railway
1. Va sur **https://railway.app/login**
2. Clique **"Login with GitHub"**
3. Plan **Hobby (5 $ de crédit gratuit par mois)** — largement suffisant pour staging

## 2.2 — Créer le projet `breakeat-staging`
1. Dashboard Railway → **New Project**
2. **Deploy from GitHub repo** → sélectionne `Break-Eat-APP`
3. Quand la pop-up s'ouvre :
   - **Add Service → GitHub Repo** ✓
   - **Root Directory :** `backend`
   - **Branch :** `main` (ou ta branche de staging si tu en as une)
4. Le déploiement va échouer la 1ère fois (pas de DB). C'est normal.

## 2.3 — Ajouter PostgreSQL
1. Dans le projet → clique **"+ New"** → **Database → Add PostgreSQL**
2. PostgreSQL est provisionné automatiquement
3. Clique sur le service Postgres → onglet **Variables**
4. Copie la variable **DATABASE_URL** (commence par `postgresql://`)

## 2.4 — Ajouter Redis
1. Dans le projet → **"+ New"** → **Database → Add Redis**
2. Redis est provisionné
3. Clique sur Redis → onglet **Variables**
4. Copie la variable **REDIS_URL** (commence par `redis://`)

## 2.5 — Connecter le backend aux DB
1. Clique sur le service **backend** (le service NestJS) → onglet **Variables**
2. Ajoute (en cliquant **"+ New Variable"**) :
   ```
   DATABASE_URL = ${{ Postgres.DATABASE_URL }}
   REDIS_URL = ${{ Redis.REDIS_URL }}
   NODE_ENV = staging
   PORT = 3000
   JWT_SECRET = (génère un secret long : https://generate-secret.vercel.app/64)
   JWT_EXPIRES_IN = 7d
   CORS_ORIGINS = (à remplir étape 4 avec les URLs Vercel)
   STRIPE_SECRET_KEY = (ta clé sk_test_… de Stripe dashboard)
   STRIPE_WEBHOOK_SECRET = (à remplir étape 4)
   STRIPE_API_VERSION = 2024-12-18.acacia
   STRIPE_PLATFORM_FEE_BPS = 500
   STRIPE_CONNECT_RETURN_URL = (à remplir étape 4)
   STRIPE_CONNECT_REFRESH_URL = (à remplir étape 4)
   ```
3. Va dans **Settings → Build & Deploy :**
   - **Build Command :** `pnpm install --frozen-lockfile && cd backend && pnpm db:generate && pnpm build`
   - **Start Command :** `cd backend && pnpm db:migrate:prod && node dist/main`
4. **Redéploie** (clic sur le menu ⋮ → Redeploy)
5. Quand ça passe → onglet **Settings → Networking → Generate Domain**
6. ✏️ **Note l'URL backend** : `https://breakeat-backend-xxxx.up.railway.app`

## 2.6 — Confirmation
Tu dois avoir :
- ✅ URL backend Railway publique
- ✅ PostgreSQL + Redis connectés
- ✅ Variables d'environnement configurées (avec quelques vides à remplir étape 4)

---

# ÉTAPE 3 — Firebase (15 min)

**But :** Distribuer les builds mobile preview avec QR code installable.

## 3.1 — Créer compte Firebase
1. Va sur **https://console.firebase.google.com/**
2. Login avec ton compte Google
3. Plan **Spark (gratuit)** — suffisant pour App Distribution

## 3.2 — Créer le projet `breakeat-staging`
1. **Add project**
2. **Project name :** `breakeat-staging`
3. ⚠️ **Désactive Google Analytics** (pas utile pour App Distribution, ajoute de la complexité)
4. **Create project**

## 3.3 — Activer App Distribution
1. Dans le menu de gauche → **App Distribution** (dans la section "Release & Monitor")
2. Clique **Get Started**

## 3.4 — Ajouter une app iOS
1. Sur la page d'overview Firebase → clique l'icône iOS (la pomme)
2. **Apple bundle ID :** `com.breakeat.app` (note-le, on l'utilisera dans Xcode)
3. **App nickname :** `BREAK EAT iOS`
4. **App Store ID :** laisse vide
5. **Register app**
6. **Télécharge `GoogleService-Info.plist`** → place-le dans `apps/mobile/ios/` (sera utilisé plus tard)
7. **Skip** les étapes "Add Firebase SDK" et "Add initialization code" (on les fera quand on installera Firebase SDK)
8. **Continue to console**

## 3.5 — Ajouter une app Android
1. Sur la page overview → icône Android
2. **Android package name :** `com.breakeat.app`
3. **App nickname :** `BREAK EAT Android`
4. **Debug signing certificate SHA-1 :** laisse vide pour l'instant
5. **Register app**
6. **Télécharge `google-services.json`** → place-le dans `apps/mobile/android/app/` (sera utilisé plus tard)
7. **Continue to console**

## 3.6 — Créer un service account pour Fastlane
1. Firebase Console → **Project settings** (icône engrenage en haut à gauche) → onglet **Service accounts**
2. **Generate new private key** → télécharge le JSON
3. ⚠️ **Renomme-le** `firebase-app-distribution-key.json`
4. ✏️ **Garde ce fichier en sécurité** — on l'ajoutera dans GitHub Secrets en étape 4
5. **NE COMMIT JAMAIS** ce fichier dans git. Il est explicitement ignoré par `.gitignore` (entrée `firebase-app-distribution-key.json`, + patterns `service-account*.json`, `*.p8`, `*.p12`). ⚠️ On n'ignore **PAS** `*.json` en bloc (ça masquerait `package.json`, `tsconfig.json`, `vercel.json`). **Vérifie toujours avec `git status`** que ce fichier n'apparaît jamais dans les changements avant un commit.

## 3.7 — Récupérer les App IDs
1. Project settings → onglet **General → Your apps**
2. Pour iOS : copie le **App ID** (format `1:123456789:ios:abcdef`)
3. Pour Android : copie le **App ID** (format `1:123456789:android:abcdef`)
4. ✏️ **Note les 2 App IDs**

## 3.8 — Ajouter testeur (toi)
1. App Distribution → **Testers & Groups**
2. **Add testers** → ajoute ton email
3. Crée un groupe **"Internal"** avec toi dedans

---

# ÉTAPE 4 — GitHub Secrets (10 min)

**But :** Donner accès aux comptes ci-dessus depuis GitHub Actions (déploiements automatiques).

## 4.1 — Aller dans Settings du repo
1. Sur GitHub : ton repo → **Settings → Secrets and variables → Actions**

## 4.2 — Ajouter les secrets (clic "New repository secret" pour chaque)

```
# Vercel
VERCEL_TOKEN              = (depuis https://vercel.com/account/tokens — "Create" avec scope full)
VERCEL_ORG_ID             = (depuis Settings de tes projets Vercel)
VERCEL_PROJECT_ID_ADMIN   = (depuis projet breakeat-admin → Settings → General)
VERCEL_PROJECT_ID_OPERATOR = (depuis projet breakeat-operator → Settings → General)

# Railway (déploiement automatique déjà géré par Railway, pas de secret nécessaire ici)

# Firebase App Distribution
FIREBASE_APP_ID_IOS     = (App ID iOS noté étape 3.7)
FIREBASE_APP_ID_ANDROID = (App ID Android noté étape 3.7)
FIREBASE_SERVICE_ACCOUNT_JSON = (copier-coller le CONTENU du fichier firebase-app-distribution-key.json)

# Apple Developer (pour Fastlane match + TestFlight upload — pour Phase 8)
APPLE_TEAM_ID           = (depuis https://developer.apple.com/account → Membership)
APPLE_API_KEY_ID        = (à créer plus tard via App Store Connect → Keys)
APPLE_API_ISSUER_ID     = (idem)
APPLE_API_PRIVATE_KEY   = (idem — fichier .p8 contenu base64)

# Stripe (pour seed dans staging)
STRIPE_SECRET_KEY      = sk_test_... (depuis dashboard Stripe Developers → API keys)
STRIPE_WEBHOOK_SECRET  = whsec_... (créé en étape 4.4 ci-dessous)
```

## 4.3 — Configurer le webhook Stripe staging
1. Dashboard Stripe → **Developers → Webhooks → Add endpoint**
2. **Endpoint URL :** `https://breakeat-backend-xxxx.up.railway.app/webhooks/stripe` (ton URL Railway de l'étape 2.5)
3. **Events to listen :** sélectionne :
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `account.updated`
4. **Add endpoint**
5. **Copie le Signing secret** (commence par `whsec_`)
6. **Mets-le dans Railway** (étape 2.5 → variable `STRIPE_WEBHOOK_SECRET`)

## 4.4 — Mettre à jour les variables croisées

### Dans Railway (variables backend)
- `CORS_ORIGINS` = `https://breakeat-admin-xxxx.vercel.app,https://breakeat-operator-xxxx.vercel.app`
- `STRIPE_CONNECT_RETURN_URL` = `https://breakeat-admin-xxxx.vercel.app/suppliers/onboarding/complete`
- `STRIPE_CONNECT_REFRESH_URL` = `https://breakeat-admin-xxxx.vercel.app/suppliers/onboarding/refresh`

### Dans Vercel admin
- `NEXT_PUBLIC_API_URL` = `https://breakeat-backend-xxxx.up.railway.app/api/v1`

### Dans Vercel operator
- `NEXT_PUBLIC_API_URL` = `https://breakeat-backend-xxxx.up.railway.app/api/v1`

## 4.5 — Redéploie partout
- Vercel admin → Deployments → Redeploy
- Vercel operator → Deployments → Redeploy
- Railway → Redeploy

---

# ÉTAPE 5 — Domaines custom (optionnel, 30 min)

**Reporté à plus tard si pas urgent.** On peut commencer avec les URLs Vercel/Railway automatiques.

Si tu veux maintenant :
- `staging.breakeat.com` → Vercel admin
- `operator.staging.breakeat.com` → Vercel operator
- `api.staging.breakeat.com` → Railway backend

Requiert un domaine acheté (Cloudflare, Namecheap, OVH). On peut le faire plus tard.

---

# ✅ Confirmation finale

Quand tu as tout fini, envoie-moi :

```
✓ URL Vercel admin     : https://...
✓ URL Vercel operator  : https://...
✓ URL Railway backend  : https://...
✓ Firebase project     : breakeat-staging (confirme)
✓ GitHub Secrets       : configurés (confirme oui/non)
✓ Stripe webhook       : configuré sur Railway URL (confirme)
```

Une fois reçu, je :
1. Vérifie que `/health` répond sur Railway
2. Push le scaffolding Storybook + Fastlane + GitHub Actions (déjà préparés)
3. Active la pipeline d'auto-déploiement
4. Démarre le **Bloc 6.1 (OrderStatus state machine)** avec validation visuelle continue

---

# 🆘 En cas de blocage

Si une étape échoue :
1. Note **précisément** le message d'erreur (capture d'écran si possible)
2. Note quelle étape tu étais en train de faire
3. Envoie-moi le tout
4. **NE PASSE PAS à l'étape suivante** tant que la précédente n'est pas validée

Je débuggue avec toi avant que ça cascade.
