# 🗺️ Carte du code — où trouver quoi

> Complément du [README](README.md). Objectif : trouver le bon fichier en 30 secondes.

---

## Backend (`backend/`) — NestJS

- **Schéma base de données** : `backend/prisma/schema.prisma` (source de vérité des entités).
- **Migrations SQL** : `backend/prisma/migrations/` (une par phase, ex. `20260725_phase18_venue_buvette_plan`).
- **Modules métier** : `backend/src/modules/<domaine>/` — chaque module = `*.controller.ts` (routes, mince) + `*.service.ts` (logique) + `dto/` (validation entrées) + `*.spec.ts` (tests).

Modules et à quoi ils servent :

| Module | Rôle |
|---|---|
| `auth`, `users` | Connexion, JWT, comptes |
| `organizations`, `groups` | Clubs, membres, groupes d'accès privé |
| `venues` | **Lieux** (géoloc, recherche, Flaix, plan buvettes). `public-venues.controller.ts` = endpoint app |
| `events`, `slots` | Événements + créneaux de retrait. `public-events.controller.ts` = endpoint app |
| `suppliers`, `products`, `categories`, `stock` | Points de retrait (« buvettes »), catalogue, stock. Une **catégorie appartient à une buvette**, pas à l'organisation |
| `cart`, `orders`, `payments`, `webhooks` | Panier → commande → paiement (Stripe) |
| `pickup-points` | Comptoirs de retrait (1–4 par buvette) |
| `loyalty` | Fidélité : solde par organisation, registre immuable |
| `live-activity` | Live Activity iOS : client APNs + webhook Flaix signé |
| `bootstrap` | Reprise de l'accès principal (route inerte sans secret) |
| `realtime` | Temps réel (Socket.IO) vers l'écran opérateur |
| `notifications` | Push Expo : par statut de commande + programmées |
| `operator-screens` | Écrans configurables du board opérateur |
| `stats`, `backoffice` | Analytics club + KPIs super-admin |
| `feature-flags`, `app-settings` | Config sans redéploiement (CMS clé/valeur) |
| `flaix` | Intégration Flaix (API tierce — voir `brain/FLAIX_CONTRACT.md`) |
| `simulator` | Génération de données de démo/charge |

**Endpoints que l'app mobile consomme** (pas d'auth requise) : `GET /public/venues`, `GET /public/events/:id`, `GET /public/events/:id/suppliers/:sid/products`, `GET /public/events/:id/slots`. Puis авec auth : `/carts`, `/orders`.

## App mobile (`apps/mobile/`) — React Native / Expo

**Entrées de build (IMPORTANT) :**
- `index.expo.js` → `App.expo.tsx` = **ce qui est livré** (web Vercel ET natif iOS EAS).
- `index.js` → `App.tsx` → `src/navigation/root-navigator.tsx` = **code mort** (jamais livré).
- `metro.config.js` = config bundler + **fix React singleton** (ne pas toucher).
- `app.config.js` / `eas.json` = config build natif (icône, splash, EAS, Apple).
- `scripts/fix-web-assets.cjs` = post-traitement de l'export web (assets → `/vendor`).
- `src/lib/geolocation-polyfill.ts` = pont `navigator.geolocation` pour iOS/Android. Ce global n'existe PAS sur natif : sans ce pont, la découverte par proximité est muette sur téléphone, **sans erreur**. Appelé depuis `index.expo.js`, avant tout écran.
- `modules/live-activity/` = module Expo natif. Son podspec **recopie** `targets/live-activity/BreakEatOrderAttributes.swift` à chaque `pod install` : le contrat doit exister dans les deux cibles, et CocoaPods ne garantit pas les sources hors racine du pod. La copie est ignorée par git.
- **Expo SDK 57 / React Native 0.86.2** depuis le 25/08/2026. Ajouter un paquet : `npx expo install`, jamais `pnpm add`.

**`src/screens/`** — un écran = un fichier :

| Écran | Rôle | Livré ? |
|---|---|---|
| `venue-discovery.screen.tsx` | **Accueil** : recherche + lieux dans 10 km + favoris + plan buvettes. Section « À venir » vide en attendant les données Flaix | ✅ |
| `login.screen.tsx` | Connexion / inscription (optionnelle) | ✅ |
| `order-history.screen.tsx`, `profile.screen.tsx` | Historique, profil | ✅ |
| `flaix-order.screen.tsx`, `supplier-catalog.screen.tsx`, `cart.screen.tsx`, `slot-selector.screen.tsx`, `checkout.screen.tsx`, `order-confirmation.screen.tsx` | Parcours de commande | ✅ |
| `event-home.screen.tsx`, `order-tracking.screen.tsx` | Écran d'un lieu (catalogue, retrait) et suivi de commande | ✅ branchés dans `App.expo.tsx` |
| `qr-scanner.screen.tsx` | Scan QR | ⚠️ **stubbé** dans `App.expo.tsx` — la caméra n'existe pas sur le web |
| `partners.screen.tsx`, `placeholder.screen.tsx` | Secondaires | ✅ |

**`src/`** — le reste :
- `components/` — UI réutilisable. Ex. `buvette-plan-viewer.tsx` (plan plein écran zoomable), `crash-guard.tsx` (garde-fou démarrage), `app-bottom-bar.tsx` (nav du bas).
- `store/` — état global Zustand : `auth.store.ts` (session), `cart.store.ts` (panier), `notif.store.ts`.
- `lib/api/mobile-api.ts` — **tous les appels API** + les types (`PublicVenue`, `PublicEvent`, `Order`…).
- `lib/theme.ts` — couleurs + polices (`HEAD` = Raleway, `BLOC` = Oswald).
- `lib/alert.ts` — alertes multiplateformes (⚠️ à utiliser à la place de `Alert.alert`).
- `lib/hooks/use-user-location.ts` — géolocalisation.
- `lib/config/env.ts` — variables d'environnement (dont `API_URL`).

## Apps web (Next.js)

- `apps/admin/` — le club gère son lieu, ses buvettes, ses événements, son apparence d'app, ses notifs. Tous les appels : `src/lib/api/admin-client.ts`. Le lieu s'édite dans `src/app/(admin)/organizations/[id]/page.tsx`.
- `apps/backoffice/` — super-admin : création de clubs, utilisateurs, groupes, notifications programmées. Appels : `src/lib/api/backoffice-client.ts`.
- `apps/operator/` — écran buvette temps réel (Kanban des commandes). Appels + Socket.IO.
- Les trois partagent `packages/brand` (couleurs `#FC4002`, logo).

**À savoir sur les apps web :**
- **`NEXT_PUBLIC_API_URL` est gravée dans chaque `vercel.json`.** Elle est inlinée à la compilation : absente ce jour-là, le repli `localhost` part en production et l'app appelle la machine du visiteur. Un filet console le signale.
- **`src/lib/coords.ts` existe en DOUBLE** — `apps/admin` et `apps/backoffice`. Pas de paquet d'utilitaires partagé dans le monorepo. Il convertit DMS ↔ décimal et répartit une paire collée. **Toute correction vaut pour les deux fichiers.**
- **Remise à zéro et suppressions** vivent dans le back-office : `organizations/[id]/page.tsx` (vider un club) et `users/page.tsx` (supprimer un compte). Voir `REPRISE.md` pour ce qui est conservé.
- **Le lieu s'édite depuis TROIS écrans** — back-office, page Organisation du dashboard manager, et wizard. Trois occasions de diverger : à resserrer.
- ⚠️ **Wizard (`admin/.../wizard`) et `demo-setup` ne sont PAS idempotents** : ils recréent événement, buvettes, comptoirs, catégories et produits à chaque passage. Relancer empile des doublons et donne l'illusion que « rien ne s'enregistre ».

## Un parcours de bout en bout (exemple : passer commande)

1. Mobile — `venue-discovery` : le client cherche/choisit un lieu (`apiSearchVenues` → `GET /public/venues`).
2. Mobile — parcours : catalogue (`supplier-catalog`) → panier (`cart.store`) → créneau (`slot-selector`) → `checkout` (`apiCreateCart` + `apiDemoCheckout`).
3. Backend — `cart` / `orders` créent la commande, `notifications` envoie un push par statut.
4. Operator — le board reçoit la commande en temps réel (`realtime`), la buvette prépare, passe « prête ».
5. Mobile — `order-confirmation` / `order-tracking` : le client voit « prête » + le **plan des buvettes** pour aller récupérer.

## Où sont les décisions et l'historique

- **Pourquoi c'est comme ça** : `brain/ARCHITECTURE.md`, entrées `brain/TASK_SUMMARY.md` (section « Décisions »).
- **Ce qui a changé et quand** : `CHANGELOG.md` (racine).
- **Audits qualité** : `brain/audits/` (rapports Codex par phase).
- **État courant + pièges** : `REPRISE.md` (racine).
