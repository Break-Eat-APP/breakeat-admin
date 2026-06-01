# BRAT EAT — Reminders (Assistant Self-Notes)

> Fichier interne — l'assistant doit consulter ce fichier au début de chaque session
> et déclencher les rappels pertinents au moment opportun.

---

## 🛠️ Cursor — When to suggest

**Suggérer à l'utilisateur d'installer / activer Cursor :**

- **Maintenant (lecture seule)** : peut installer en parallèle pour explorer le code visuellement, voir les diffs git, naviguer l'arborescence. Aucun edit.
- **Fin de Phase 6** : moment idéal de transition — tout le backend critique sera terminé. Cursor devient utile pour ajustements visuels.
- **Phase 8 (Dashboards UI)** : Cursor passe en rôle ACTIF pour le front-end. L'assistant Claude Code reste maître de l'architecture et du backend, mais le user peut faire des ajustements visuels rapides avec `Cmd+K`.
- **Phases 9-10** : retour au workflow assistant (CMS + QA + déploiement = backend lourd).

**Règle d'or rappelée :** ne JAMAIS switcher d'outil au milieu d'une phase (risque docs désynchronisées, conventions mélangées).

---

## 🎨 Design system — Quand demander les inputs

**Avant Phase 8 (Dashboards) :**
- Demander : logo BRAT EAT (fichier SVG / PNG haute résolution)
- Demander : palette couleurs principales (primary, secondary, accent, neutrals)
- Demander : 3-5 screenshots de l'app Burger King (parties UX/navigation qui plaisent au user)
- Documenter dans `brain/DESIGN_SYSTEM.md`

**Avant Phase 8 — itérer en visuel :**
- Storybook live URL à partager
- Mood board / mockups validés AVANT de coder l'écran

---

## 💳 Stripe Connect — Vérifications avant Phase 5 prod

- Compte Stripe créé ? ✅ (confirmé 27/05/2026)
- Connect activé dans le dashboard Stripe ? À vérifier
- Webhook secret `whsec_xxx` configuré dans `.env` ? À demander à chaque déploiement
- En prod : webhooks doivent pointer vers l'URL publique (pas localhost)

---

## 🏗️ Infrastructure — Décisions actées (28/05/2026)

**Stack staging confirmée :**
- ✅ **Vercel** : déploiement Next.js admin + operator + public screen
- ✅ **Railway** : backend NestJS + PostgreSQL + Redis managés
- Coût estimé staging : 20-30 €/mois

**Mobile build pipeline confirmée :**
- ✅ **React Native CLI** (pas Expo) — décision user 28/05/2026
- ⚠️ **App Center sunsetting March 2025** — NE PAS l'utiliser, mort depuis ~1 an
- ✅ **Stack remplaçante : Fastlane + Firebase App Distribution**
  - Fastlane pour automation builds iOS + Android
  - Firebase App Distribution pour preview QR codes + TestFlight upload
  - GitHub Actions pour déclencher les builds

**Comptes plateformes :**
- ✅ Apple Developer — déjà actif (user 28/05/2026)
- ⏳ Google Play Console (25 $ one-time) — à créer avant Phase 8 si Android visé
- ⏳ Firebase project (gratuit) — à créer Bloc 6.0

**Setup Phase 6 (Bloc 6.0 — Infrastructure) :**
1. Vercel : créer 2 projets (admin + operator), connecter au repo
2. Railway : créer projet backend + provisionner PostgreSQL + Redis
3. Firebase : créer projet brateat-staging
4. Fastlane : initialiser dans `apps/mobile/ios/` et `apps/mobile/android/`
5. GitHub Actions : workflow `mobile-preview.yml` (build + upload Firebase)
6. Storybook : init dans `apps/admin/`, `apps/operator/` et `apps/mobile/`

**Avant Phase 8 (Mobile preview builds — confirmation) :**
- iOS provisioning profiles + certificates configurés (Fastlane match)
- Android keystore créé + sécurisé
- Firebase App Distribution testers list peuplée

---

## 📋 Audits Codex — Pattern établi

À la fin de chaque phase, le user lance un audit externe via Codex. Pattern :
1. User envoie le rapport Codex
2. Assistant catégorise P1/P2/P3
3. Corrections appliquées + tests
4. Docs mises à jour (CHANGELOG, TASK_SUMMARY, ENGINEERING_MANUAL, DEVELOPMENT_LOG)
5. Re-vérification : tests + typecheck + lint
6. Confirmation au user
