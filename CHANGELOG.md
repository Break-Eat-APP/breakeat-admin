# CHANGELOG — BREAK EAT

Chaque entrée correspond à une session de travail ou une phase.
Format : fichiers créés (`+`), modifiés (`~`), supprimés (`-`).

---

## [0.37.0] — 2026-06-15 — Bloc B (pages, retraits, créneaux) + C4 (parrainage exploitant)

### Bloc B — Configuration enrichie
- **Pages multiples dans l'app** (B1) : le modèle `HomeAppearance` accepte désormais `pages: AppPage[]` (illimité). Nouveau type d'action carte `'page'` (ouvre une page in-app) en plus de `'url'` (Instagram, YouTube…). Éditeur admin : section « Pages secondaires » + composant `CardEditor` réutilisable + aperçu multi-écrans. Mobile : navigation interne entre accueil et pages dans `AppearanceHome`.
- **1–4 points de retrait par buvette** (B2) : `pickup-points.service` plafonne à 4 par supplier/event + endpoint DELETE (refusé si commandes liées). Event page : select buvette + suppression + regroupement visuel.
- **Créneaux personnalisables / illimités** (B3) : générateur en lot (N créneaux consécutifs de durée fixe) sur la page événement, en plus de l'ajout unitaire. Aucune limite de nombre.

### Bloc C4 — Exploitant externe (code de parrainage)
- Schéma : `Supplier.isExternal` + `Supplier.referralCode` (unique). Migration appliquée en SQL (drift PK pré-existant → ALTER direct).
- Backend : génération de code `BE-XXXXXX` unique, endpoints `POST /suppliers/:id/referral` (régénérer) et `GET /suppliers/referral/:code` (lookup).
- Admin : checkbox « Exploitant externe » à la création + carte « Parrainage » (affichage/copie/régénération du code) + badge dans la liste.

### Bloc C — fondation push Expo (canal choisi par le client)
- **Backend** `NotificationsModule` : `ExpoPushService` (envoi via l'API Expo, batches de 100, purge des jetons invalides), `PushTokensService` + endpoints `POST/DELETE /push-tokens`. Table `push_tokens` (migration SQL directe) + modèle Prisma `PushToken`. Test unitaire vert.
- **Mobile** : `apiRegisterPushToken` / `apiUnregisterPushToken` (sans dépendance native).
- ⚠️ **App mobile = React Native bare** (pas Expo-managed) : l'obtention du jeton Expo nécessite d'installer les modules Expo + config FCM (Android) / APNs (iOS) + rebuild natif — étape côté client avant activation.

### Bloc C — logique livrée (C1, C2, C3) sur la fondation Expo
- **C1 — Notifs par étape** : `OrderNotificationsService` envoie un push au client à chaque transition de commande, selon des modèles éditables (clé app-settings `app.notifications`). Hook dans `OrdersService.transition` (fire-and-forget). Page admin **Notifications** (toggle + titre/message par étape, variable `{orderNumber}`).
- **C2 — Push programmés** : modèle `ScheduledPush` + cron `@nestjs/schedule` (chaque minute) qui envoie les pushs dont l'heure est passée. Endpoints CRUD + page admin **Campagnes & push** (date/heure, ciblage org ou événement, multiples).
- **C3 — Campagne -50 % auto** : même système, `kind=DISCOUNT_CAMPAIGN` + `discountPercent` ; déclenchement auto à l'heure (ex. fin de match) → push d'annonce. ⚠️ L'**application réelle de la remise au panier** se branche au checkout (invariant Stripe) — pièce de suivi identifiée, non incluse.

### Reste (suivi)
- Application de la remise C3 au checkout (cart → snapshot prix → PaymentIntent).
- Mobile : setup natif Expo (modules + FCM/APNs + rebuild) puis `registerForPushNotificationsAsync` → `apiRegisterPushToken`.

---

## [0.36.0] — 2026-06-12 — Bloc A : Comptabilité + images produits + opérateur amélioré

### Nouvelles fonctionnalités
- **Section Comptabilité** (`/accounting`) : CA TTC, CA HT, TVA collectée (10 %), panier moyen, tableau détaillé par événement. Accessible depuis le groupe "Pilotage" de la nav (icône Receipt).
- **Images produits** : champ URL dans le formulaire de création produit (aperçu live). Thumbnail affiché dans la liste. `apiCreateProduct` accepte `imageUrl?`.
- **Opérateur — résumé produits par colonne** : bandeau "Coca-Cola ×8 · Hot-Dog ×3" en tête de chaque colonne du board — vue d'ensemble de ce qu'il y a à préparer.
- **Zone de préparation supprimée** de l'UI buvettes (champ retiré du formulaire création + page détail). Le champ reste en base pour compatibilité.

### Corrections
- Mot de passe `admin@breakeat.test` réinitialisé directement en base (argon2id).
- `apiCreateProduct` : signature étendue avec `imageUrl?: string`.

---

## [0.35.0] — 2026-06-08 — « Apparence de l'app » v2 : Flaix toggle, réordonnancement cartes, Jost, wording optionnel

### Contexte
Spec complète du client pour le configurateur d'écran d'accueil :
police Jost pour les descriptions, aucun wording obligatoire (icône/image seule valide), réordonnancement des cartes (↑/↓), toggle Flaix (désactive l'interface et passe la main à Flaix — plan du stade), mise à jour mobile.

### Admin — appearance/page.tsx — 6 améliorations
~ `apps/admin/src/app/(admin)/appearance/page.tsx`
  - **Toggle Flaix** : carte dédiée « Intégration Flaix » avec switch ON/OFF animé + description complète (Phase 11.5 à venir).
  - **Réordonnancement cartes** : boutons ▲/▼ sur chaque carte ; `moveCard(id, dir)` swap propre dans le tableau.
  - **Wording non-obligatoire** : `addCard` crée avec `title: ''` ; input `placeholder="Titre (optionnel)"` ; le preview masque le `<div>` si le titre est vide → carte icône-seule ou image-seule valide.
  - **Normalisation** : `flaixTakeover: v.flaixTakeover ?? false` ajouté dans le bloc de chargement (compat configs antérieures).
  - **Sous-titre en Jost** dans le preview (`var(--font-jost), "Jost", sans-serif`, weight 400).
  - **`patchFlaix(v)`** helper pour mettre à jour `appearance.flaixTakeover`.
~ `apps/admin/src/app/layout.tsx` — chargement de la police **Jost** (Google Fonts, subsets latin, weights 300/400/500/600, variable `--font-jost`) aux côtés d'Inter.

### Mobile — types + chemin Flaix
~ `apps/mobile/src/lib/api/mobile-api.ts` — `flaixTakeover?: boolean` ajouté à `HomeAppearance`.
~ `apps/mobile/src/screens/event-home.screen.tsx` — si `appearance.flaixTakeover === true`, affiche un écran placeholder « Plan du lieu / Intégration Flaix à venir » (Phase 11.5) avant de tomber sur l'AppearanceHome standard.

### Reste (prochaine itération)
- Cartes icône côté app (lucide-react-native — module natif, rebuild requis).
- Upload d'image (S3/local — URL en attendant).
- Écran carte/menu style Burger King (2ᵉ écran).
- Phase 11.5 — intégration SDK Flaix (attendu côté Flaix).

---

## [0.34.0] — 2026-06-08 — « Apparence de l'app » : éditeur de cartes (accueil) + branding exposé à l'app

### Contexte
Point 3 du plan (brancher le branding sur l'app), élargi par le client en un **configurateur d'écran d'accueil** : le manager compose des cartes (icône OU image, couleurs, taille, disposition), avec presets par type de lieu. Choix validés : **les deux écrans** (accueil d'abord), styles **globaux + surcharge par carte**, image par **upload** (infra de stockage à venir ; URL en attendant).

### Admin — éditeur « Apparence de l'app » (accueil) — aligné sur le cahier des charges client
+ `apps/admin/src/app/(admin)/appearance/page.tsx` — éditeur avec **aperçu live** (maquette téléphone) :
  - **En-tête configurable** : logo centré (toggle), **titre MAJUSCULE**, **sous-titre minuscule**, couleurs titre/sous-titre (cf. maquettes Le Mans FC / BoursoBank).
  - **Cartes** : 3 visuels — **texte seul** (ex. TRIBUNE NORD/SUD/EST/OUEST en doré), **icône** (set Lucide fourni), ou **image** (photo plein cadre + titre en surimpression). Surcharge couleur texte/icône par carte.
  - **Disposition** : 1 colonne (vertical) ou 2 côte à côte ; taille de carte sm/md/lg.
  - **Presets** : Stade (cartes texte tribunes), Restauration entreprise (cartes photo), Festival/Concert (cartes icône) — points de départ à affiner ensemble.
  - Sauvegarde/chargement en app-settings (`app.appearance.home`, ORGANIZATION) ; **normalisation** au chargement (compat configs antérieures).
~ `apps/admin/src/app/(admin)/layout.tsx` — item **« Apparence de l'app »** (`Palette`) dans Configuration.

### Backend — branding + apparence exposés à l'app cliente
~ `backend/src/modules/events/public-events.controller.ts` — `GET /public/events/:id` renvoie `branding { primaryColor, logoUrl }` (événement puis org en fallback) + `appearance` (config `app.appearance.home` de l'org, ou `null`). **Vérifié live** (4 cartes + titre).

### App mobile — RENDU de l'écran d'accueil configurable (boucle fermée)
~ `apps/mobile/src/lib/api/mobile-api.ts` — types `HomeAppearance`/`AppCard`/`AppCardAction` + `branding`/`appearance` sur `PublicEvent`.
~ `apps/mobile/src/screens/event-home.screen.tsx` — si une apparence est définie, rend le **gabarit** (logo centré → titre MAJUSCULE → sous-titre → grille de cartes), sinon **repli** sur la sélection de stand actuelle. **Actions** mappées : `supplier` → menu de la buvette, `scan` → QR, `url` → lien ; `orders` no-op (pas d'écran liste). Cartes **texte + image** en RN core (cartes icône en v2 avec `lucide-react-native`).

### Qualité — boucle dashboard → backend → app vérifiée
- Admin `typecheck` 0 · `lint` 0 · Backend `typecheck` 0 · **Mobile `typecheck` 0**.
- Backend **relancé en watch** : `GET /public/events/:id` expose bien `branding` + `appearance` (4 cartes « TRIBUNE »).

### Reste (point 3)
- **Cartes icône côté app** (corporate/festival) — v2 : `lucide-react-native` + `react-native-svg` (module natif → rebuild). Le **Stade** (cartes texte) marche déjà.
- **Upload d'image** (stockage S3/local — infra à brancher ; URL en attendant).
- **Écran carte/menu** (2ᵉ écran, style Burger King — pur frontend admin).
- **Définir ensemble** le contenu fin de chaque template + l'action de chaque carte.

---

## [0.33.0] — 2026-06-08 — Section « Buvettes » (config une fois → rattacher aux événements)

### Contexte
Demande client : pouvoir **configurer les buvettes une fois** (au niveau du club) puis les **attribuer à chaque événement**, avec un **accès direct** à l'ensemble d'une buvette. Le modèle le supportait déjà (Supplier = org-level, Event↔Supplier M:N) mais il **manquait une section dédiée** dans le menu (les buvettes ne se créaient que dans le wizard ou la fiche événement). **Aucun changement backend** (CRUD fournisseur déjà complet : GET / GET :id / PATCH :id / PATCH :id/status).

### Livré (frontend admin)
+ `apps/admin/src/app/(admin)/suppliers/page.tsx` — **liste des buvettes** (nouvelle section) : création (nom + zone), cartes premium (`surface`/`shadowCard`, icône `Store`, badge de statut Ouverte/En pause/Fermée/Hors ligne), description « config une fois → rattacher ».
~ `apps/admin/src/app/(admin)/layout.tsx` — item **« Buvettes »** (`Store`) dans le groupe Configuration.
~ `apps/admin/src/app/(admin)/suppliers/[id]/page.tsx` — fil d'Ariane `← Événements` → `← Buvettes` ; dé-emoji `🏪` + badge de statut dans l'en-tête ; **carte « Réglages »** (édition nom/zone via `apiUpdateSupplier` + bascule de **statut** OPEN/PAUSED/CLOSED/OFFLINE via `apiUpdateSupplierStatus`) ; **carte « Rattacher à un événement »** (dropdown événements + `apiAttachSupplier`). Gestion produits/catégories/prix : **inchangée** (déjà présente).
~ `apps/admin/src/lib/api/admin-client.ts` — `apiUpdateSupplier(orgId, id, {name?, preparationZone?})` (`PATCH /…/suppliers/:id`) + `apiUpdateSupplierStatus(orgId, id, status)` (`PATCH /…/suppliers/:id/status`).

### Qualité
- Admin `typecheck` exit 0 · `lint` 0. Endpoint `PATCH …/suppliers/:id/status` **vérifié en live** (HTTP 200). Aucune migration, aucun changement backend.

### Consolidation des buvettes dupliquées (fait, avec accord)
- **Données** : 3 « Buvette Nord » CLOSED **orphelines** (0 référence : 0 produit/commande/comptoir/attache) supprimées en transaction → **1 seule** « Buvette Nord » (OPEN, 5 produits, 20 commandes, comptoirs + événement intacts).
~ `apps/admin/src/app/(admin)/demo-setup/page.tsx` — Step 2 **réutilise** une buvette nommée « Buvette Nord » si elle existe (`apiGetSuppliers` → find), sinon la crée. Plus de doublons à l'avenir (comme le lieu).

---

## [0.32.0] — 2026-06-07 — Refonte v3 « chaleureux premium » : Inter + Lucide + canevas crème (bloc 1)

### Contexte
Pivot de direction artistique (client) : Fredoka jugée « trop enfant » pour des outils pro → on **abandonne Fredoka** au profit d'**Inter** ; emojis de navigation remplacés par un **jeu d'icônes Lucide** (ligne fines) ; direction **« chaleureux premium »** (canevas blanc cassé chaud, cartes blanches qui ressortent, profondeur DOUCE et NEUTRE, orange maîtrisé). Le logo « B éclair » est laissé tel quel (revu plus tard). **Bloc 1** = fondations + sidebar admin + dashboard manager ; les autres pages suivront.

### Fondations (package brand + 3 apps)
~ `packages/brand/src/brand.ts` — `font` → Inter via `--font-sans` (était Fredoka) ; `bg` `#ffffff` → `#fcfaf8` (crème) ; `inkSoft` `#44403c` → `#57514c` ; nouveaux tokens `surface #ffffff` (cartes), `shadowCard` + `shadowSoft` **neutres en couches** (fini l'ombre orangée générique), `radius {card:16, control:12, pill:999}`.
~ `apps/{admin,operator,backoffice}/src/app/layout.tsx` — `next/font/google` Fredoka → **Inter** (variable font, `--font-sans`).
~ `apps/{admin,operator,backoffice}/src/app/globals.css` — body `font-family` → `var(--font-sans)` + fallback système ; `background #fcfaf8` ; `color #2d2926`.
+ `lucide-react` ajouté aux 3 apps (vérifié authentique : registry npm officiel, repo `lucide-icons/lucide`, licence ISC).

### Admin — sidebar + dashboard
~ `apps/admin/src/app/(admin)/layout.tsx` — nav **groupée** (Pilotage / Configuration / Organisation / Système / Outils), **icônes Lucide** (fini les emojis), **pastille active arrondie** (au lieu du filet gauche), rail **blanc** sur canevas crème.
~ `apps/admin/src/app/(admin)/events/page.tsx` — section renommée **« Événements & configuration »** + description grise (le centre de paramétrage : buvettes, créneaux, retraits, écrans, stats).
~ `apps/admin/src/app/(admin)/dashboard/page.tsx` — dé-emoji (greeting ; `InfoCard` 🏢/🔒/🎪 → `Building2`/`Lock`/`CalendarDays` ; bouton ↻ → `RefreshCw` ; chevron `›` → `ChevronRight`) ; cartes `surface` + `shadowCard` (hover `shadowSoft` + lift) ; typo resserrée (letter-spacing négatif sur les chiffres).

### Admin — « Lieu » intégré à Organisation (section « Lieux » retirée)
Décision produit (client) : **un club = un lieu**. La section multi-lieux n'a plus de sens et le formulaire d'événement demandait de **coller un UUID de venue** — supprimé.
~ `apps/admin/src/app/(admin)/layout.tsx` — item « Lieux » retiré du menu (import `MapPin` retiré).
~ `apps/admin/src/app/(admin)/organizations/[id]/page.tsx` — **carte « Lieu »** (nom + adresse + fuseau) : crée le lieu s'il n'existe pas, sinon le met à jour ; `SectionCard` passé en `surface`/`shadowCard` ; cas multi-sites résiduel affiché en chips (lecture seule).
~ `apps/admin/src/app/(admin)/events/page.tsx` — fini l'UUID : le formulaire **utilise le lieu du club automatiquement** (0 lieu → invite vers Organisation + submit désactivé ; 1 → affichage lecture seule ; >1 → menu déroulant).
~ `apps/admin/src/lib/api/admin-client.ts` — `apiUpdateVenue(orgId, venueId, {name?,address?,timezone?})` → `PATCH /organizations/:orgId/venues/:id` (endpoint backend **déjà existant**).
~ `apps/admin/src/app/(admin)/venues/page.tsx` — réduit à une **redirection** vers Organisation (anciens favoris).

### Qualité
- Admin / Operator / Backoffice : `typecheck` exit 0 · `lint` 0.
- Aucune migration, aucun changement backend (réutilise le `PATCH` venue existant).

### Consolidation des lieux dupliqués + correction de la cause racine
La base de démo avait **4 lieux dupliqués** « Patinoire des Spartiates » (cause réelle : la page **Démo Spartiates** — et le wizard — créaient un nouveau lieu à chaque run).
- **Données** (transaction SQL, données de démo, avec accord explicite) : 3 événements repointés sur le lieu canonique (celui des 20 commandes + 2 comptoirs), **3 doublons supprimés** → **1 seul lieu** (`UPDATE 3` events · `DELETE 3` venues · commandes/comptoirs intacts).
- **Cause racine** : `wizard/page.tsx` **et** `demo-setup/page.tsx` **réutilisent désormais** le lieu existant de l'org (via `apiGetVenues` → `apiUpdateVenue`) au lieu d'en créer un nouveau. Plus de doublons à l'avenir.
- **Événements dupliqués nettoyés** (accord explicite) : 3 événements « Match Spartiates Hockey » en double (DRAFT/CANCELLED, 0 commande) supprimés en transaction (FK vérifiées : `event_suppliers` CASCADE, le reste à 0). État final démo : **1 lieu · 1 événement actif · 20 commandes · 2 comptoirs**.

### Admin — sweep premium des pages (dé-emoji + cartes surface/shadowCard)
Application de la recette « chaleureux premium » aux pages de liste/config : titres dé-emoji (texte net + letter-spacing), cartes `BRAND.bg` → `BRAND.surface` (blanc sur canevas crème) + `shadowCard`, emojis d'état vide → icônes Lucide en pastille, chevrons `›` → `ChevronRight`.
~ `dashboard` (déjà), `events` (en-tête), `organizations/[id]` (carte Lieu) — faits plus haut.
~ `settings` (Paramètres) · `groups` (Groupes) · `team` (Équipe) · `operator-screens` (Écrans opérateur) · `feature-flags` · `simulator` — dé-emoji + surface/shadowCard ; chips fournisseur 🏪 → `Store`, badges, etc.
- **Piège évité** : `replace_all` `background: BRAND.bg` sans virgule capture `BRAND.bgSubtle` → toujours inclure la virgule (`background: BRAND.bg,`).

### Sweep complet (3 apps)
~ **Admin** — toutes les pages : fiche événement (8 titres de cartes dé-emoji + visibilité/copie en Lucide), détails (groupe/écran/fournisseur), wizard (icônes templates → Lucide Trophy/Tent/Building2, recap + labels dé-emoji, push → Zap), démo-setup, renommage **« Configurer mon lieu »**.
~ **Backoffice** — sidebar refonte (Lucide + pastille active), KPI cards `surface`/`shadowCard`.
~ **Operator** (console rush, design conservé) — chips fournisseur 🏪 → `Store`, en-têtes de colonnes dé-emoji, « 🍔 BREAK EAT » → « BREAKEAT », popup `CheckCircle2`/`Bell`, ombres adoucies.
- **Qualité finale** : admin / operator / backoffice `typecheck` 0 · `lint` 0.

### Reste (hors sweep — prochaines features validées)
Section **« Buvettes »** dédiée (config une fois → rattacher aux événements), puis **câbler la couleur** sur l'app mobile. *(Toggle Flaix parqué — attend le code Flaix. Option non retenue : fusion Organisation + Équipe.)*

---

## [0.31.0] — 2026-06-07 — Admin : allègement typographique (Fredoka) + Wizard multi-buvettes

### Contexte
Deux ajustements du panel manager dans la même session. (1) Le dashboard manager paraissait « trop noir / gras » : Fredoka **conservée** mais **poids allégés** et near-black `#1c1917` adouci en anthracite chaud. (2) Le wizard guidé ne configurait qu'**un seul** point de vente ; or un même lieu/stade peut exploiter **plusieurs buvettes ou stands**. Le parcours configure désormais **N buvettes** en une fois (1 lieu → N fournisseurs), chacune avec sa zone de préparation, son point de retrait, ses catégories et son menu.

### Design — allègement Fredoka (package brand, propagé aux 3 apps)
~ `packages/brand/src/brand.ts` — `ink` `#1c1917` → `#2d2926` (anthracite chaud adouci). Token **unique** → admin + operator + backoffice.
~ 16 pages admin — `fontWeight: 800` → `600` (dashboard, events, events/[id], venues, groups, groups/[id], settings, feature-flags, simulator, team, operator-screens, operator-screens/[id], organizations/[id], suppliers/[id], demo-setup, wizard). Fredoka est chargée en `['400','500','600','700']` → un `800` inline clampait déjà à 700 ; on descend volontairement à 600.

### Admin — Wizard multi-buvettes
~ `apps/admin/src/app/(admin)/wizard/page.tsx` — refonte de l'étape « Produits » en **« Buvettes & produits »** :
  - nouveau type `Buvette { id, name, prepZone, pickupPoint, categories[], products[] }` ; `WizardData.buvettes: Buvette[]` (remplace les champs à plat `supplierName`/`prepZone`/`categories`/`products`/`pickupPoints`).
  - étape 2 : N cartes buvette (ajout/retrait, min. 1) via `BuvetteCard`, chacune avec nom, zone de prépa, point de retrait, catégories et table produits/prix **indépendants**. Le `<select>` catégorie d'un produit n'expose que les catégories de **sa** buvette.
  - étape 3 (« Créneaux ») : le point de retrait étant désormais par buvette, l'étape ne gère plus que le générateur de créneaux (partagés par l'événement) + un encart **lecture seule** « buvette → point de retrait ».
  - exécution : 1 lieu + 1 événement, **catégories dédupliquées** sur toutes les buvettes (créées une fois → `catMap`), puis **une tâche par buvette** (fournisseur + attachement + point de retrait + produits), puis créneaux / notifs / push / activation. Log de progression dynamique.
  - templates (Stade/Festival/Entreprise) pré-remplissent 2 buvettes (Stade Nord/Sud, Festival Food Truck/Bar) ou 1 (Entreprise).

### Qualité
- Admin : `typecheck` exit 0 · `lint` 0.
- **Aucune migration, aucune dépendance npm, aucun changement backend** — le multi-fournisseur par événement était déjà supporté (Org→Suppliers N, Event↔Supplier M:N, `PickupPoint` rattachable à un `supplierId`). Le wizard orchestre l'existant.

---

## [0.30.0] — 2026-06-07 — Phase 15 : Dashboard Manager (analytics org/événement, lecture seule)

### Contexte
Le board opérateur était riche (réception temps réel), mais le **manager** n'avait **aucune visibilité opérationnelle** : le `/dashboard` admin n'était qu'un lanceur de navigation. Cette phase livre la première brique d'analytics **lecture seule** au service du client payant (le gérant de club) : un module backend `stats` (aucune migration), la **transformation du dashboard admin** en tableau de bord opérationnel, et un bloc **stats par événement** sur la fiche événement. Les chiffres se **réconcilient avec le back office** SUPER_ADMIN (mêmes règles CA).

### Règle de revenu (source unique, calquée sur BackofficeService)
Une commande compte au CA **seulement** si `paymentStatus = SUCCEEDED`. `Order.totalCents` est **TTC** ; `CA HT = round(CA TTC / (1 + vatRate))`, `vatRate` lu depuis `app.reporting.vatRate` (fallback **0.1** = 10 %). `Order` porte `organizationId` **et** `eventId` directement → agrégations sans jointure. Top produits via `orderItem.groupBy` scoppé par `order: { eventId, paymentStatus: SUCCEEDED }` (`productNameSnapshot` + `lineTotalCents`).

### Backend — module stats (lecture seule, aucune migration)
+ `backend/src/modules/stats/stats.service.ts` — `getOrgOverview(orgId, userId)` (KPIs org : CA HT/TTC, nb commandes, panier moyen HT/TTC, nb événements + **événements en cours** `startAt ≤ now ≤ endAt`, rollup revenu par événement) et `getEventStats(eventId, userId)` (revenu, panier moyen, **répartition complète par statut** zéro-seedée sur les 8 `OrderStatus`, **top 10 produits**). Privés : `toHtCents(ttc)=round(ttc/(1+vat))`, `averageBasket()` avec garde division-par-zéro. Accès gaté **MANAGE_ROLES** (ORG_ADMIN, MANAGER) — le CA est sensible, OPERATOR/MARKETING exclus ; SUPER_ADMIN bypass.
+ `backend/src/modules/stats/stats.controller.ts` — `@UseGuards(JwtAuthGuard)`, base path vide ; `GET organizations/:orgId/stats` et `GET events/:eventId/stats` (`ParseUUIDPipe` + `@CurrentUser().sub`).
+ `backend/src/modules/stats/stats.module.ts` — provider `StatsService` + controller.
+ `backend/src/modules/stats/stats.service.spec.ts` — **7 tests** : math CA à 10 %, merge rollup + comptage « en cours », org vide (zéros + pas de division par zéro), refus OPERATOR (403 + **aucune** requête revenu), breakdown statut complet + top produits, 404 événement inconnu **avant** tout check d'accès, non-membre 403.
~ `backend/src/app.module.ts` — `StatsModule` enregistré (Phase 15).

### Admin — dashboard opérationnel + stats par événement
~ `apps/admin/src/lib/api/admin-client.ts` — section stats : interfaces `RevenueBlock`/`BasketBlock`/`OrgEventStat`/`OrgStatsOverview`/`TopProduct`/`EventStats` (statut typé via l'union `OperatorOrderStatus`) + `apiGetOrgStats(orgId)` / `apiGetEventStats(eventId)`.
~ `apps/admin/src/app/(admin)/dashboard/page.tsx` — **réécrit** : de lanceur de navigation → tableau de bord org. KPIs (CA HT avec « TVA 10 % », CA TTC, Commandes, Panier moyen TTC, Événements + « N en cours »), liste **Performance par événement** (badge « ● En cours » calculé client), accès rapide board opérateur. Dégradation propre : OPERATOR/MARKETING (403) voient une carte « Statistiques réservées aux managers » au lieu d'une erreur.
~ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — carte **📊 Statistiques de l'événement** (KPIs + répartition par statut + top produits). Fetch **isolé** du `Promise.all` principal → un 403 manager-only n'altère jamais le reste de la fiche.

### Qualité
- Backend : **26 suites / 313 tests** (306 → +7) · `typecheck` exit 0 · `lint` 0
- Admin : `typecheck` exit 0 · `lint` 0 · `build` ✓ (15 routes · `/dashboard` 4.97 kB · `/events/[id]` 8.71 kB)
- Opérateur (régression) : `typecheck` exit 0 · `lint` 0 — **aucune** migration, **aucune** dépendance npm ajoutée

---

## [0.29.0] — 2026-06-07 — Corrections post-audit Codex (sécurité écran public + hygiène Git + batch résilient)

### Contexte
Audit Codex (frontière précédente : 2026-06-02). Trois correctifs livrés ; un quatrième finding (pipeline racine Turbo) **vérifié sain** et documenté plutôt que « corrigé ».

### Sécurité (P1)
~ `backend/src/modules/orders/public-orders.controller.ts` — `GET /public/orders/event/:eventId/ready` était **sans garde** : connaître l'UUID d'un événement **privé** suffisait à lire les n° publics de ses commandes prêtes. Ajout `@UseGuards(OptionalJwtAuthGuard)` + `groupsService.canAccessEvent(eventId, user?.sub ?? null)` → PUBLIC : anonyme OK ; PRIVATE : membre authentifié seulement ; sinon **404** identique (pas de fuite d'existence). Parité avec `PublicEventsController` (Phase 14.4).
~ `backend/src/modules/orders/orders.module.ts` — `imports: [..., GroupsModule]`
+ `backend/src/modules/orders/public-orders.controller.spec.ts` — 3 tests (anonyme autorisé · propagation `sub` · **404 + `findReadyByEvent` jamais appelé** quand refusé)

### Robustesse UX (P2)
~ `apps/operator/src/app/dashboard/[eventId]/page.tsx` — `batchAdvance` : `Promise.all` → **`Promise.allSettled`** + `loadSnapshot()` **toujours** exécuté + bannière ambre dismissible (`batchError`) « N/total commandes n'ont pas pu être avancées ». Un échec en milieu de lot ne laisse plus un état mixte silencieux.

### Hygiène Git (P2)
~ `.gitignore` — `*.tsbuildinfo` ajouté (section Build outputs)
- `apps/admin/tsconfig.tsbuildinfo`, `apps/operator/tsconfig.tsbuildinfo` — **dé-suivis** (`git rm --cached`, fichiers conservés sur disque)

### Pipeline racine Turbo (P1 audit — non-bug)
- `turbo run typecheck/build/lint` **vérifié sain** ici (3× exit 0, pnpm 11.3.0 = `packageManager`). CI (`.github/workflows/ci.yml` via `pnpm/action-setup@v4`), Vercel (`vercel.json` → `pnpm install` + `pnpm build`) et Railway (`nixpacks.toml` → `corepack prepare pnpm@11.3.0`) provisionnent tous pnpm. L'échec Codex « Unable to find package manager binary » = **sandbox** sans pnpm au PATH, pas le dépôt. Fallback fiable : builds **package par package** (`pnpm --filter`).

### Qualité
- Backend : **25 suites / 306 tests** (303 → +3) · `typecheck` exit 0
- Opérateur : `typecheck` exit 0 · `lint` 0 · `build` ✓ (`/dashboard/[eventId]` 10.5 kB)

---

## [0.28.0] — 2026-06-07 — Phase 11.4c : regroupement visuel « X commandes similaires » (cartes empilées + batch)

### Contexte
En plein rush, le même panier est commandé en boucle (dix « Burger + Frites »). Les préparer carte par carte gaspille des gestes. Cet incrément **empile les paniers identiques** d'une colonne en une seule carte groupée — composition affichée une fois, badges de n° de commande, et un bouton **batch** qui fait avancer tout le lot au statut suivant d'un clic (« se préparent ensemble »). Affichage **pur owned by Break** : aucune commande n'est fusionnée, chacune garde son cycle de vie. Distinct de la difficulté Flaix (11.5, en attente du code Flaix). Toggle **désactivé par défaut** → rétrocompat totale.

### Client opérateur
+ `apps/operator/src/lib/screens/grouping.ts` — `groupSimilarOrders(orders)` : cluster par signature de composition (`productId:quantity` trié, FIFO-préservé) ; `compositionSignature` ; types `OrderGroup`/`GroupedLine`. Singletons = groupe de 1 → board groupé = **sur-ensemble** strict du board plat.
+ `apps/operator/src/components/OrderGroupCard.tsx` — carte « empilée » (faux stack en profondeur) : chip `🧩 N commandes`, total articles + âge de la plus ancienne, badges `#n°` (max 10 + `+K`), composition partagée (`× total`), bouton **batch** contextuel (`Accepter/Préparer/… les N`) + dépliage `Voir les N` → `OrderCard` individuelles (actions par commande conservées). Groupe de 1 → `OrderCard` normale.
~ `apps/operator/src/components/DashboardColumn.tsx` — nouvelle API : `orders: Order[]` + `toCardProps` + `grouped?` + `onBatchAdvance?` ; rend des `OrderGroupCard` quand `grouped`, cartes plates sinon (compteur d'en-tête = nombre de **commandes**, pas de groupes)
~ `apps/operator/src/components/OrderCard.tsx` — `elapsed` exporté (réutilisé par la carte de groupe)
~ `apps/operator/src/app/dashboard/[eventId]/page.tsx` — toggle header « 🧩 Grouper » (off par défaut) ; `batchAdvance(orders)` → transition du statut courant pour tout le groupe en parallèle (`Promise.all`) puis `loadSnapshot()`
~ `apps/operator/src/stories/DashboardColumn.stories.tsx` — migrées vers la nouvelle API (`Order[]` + `toCardProps`) + story « 6 commandes identiques (groupées) »

### Qualité
- `pnpm --filter @break-eat/operator typecheck` → **exit 0** · lint **0 erreur** · `build` → **✓** (`/dashboard/[eventId]` 10.3 kB)
- Aucun changement backend → suites jest inchangées (**88/88** orders)

---

## [0.27.0] — 2026-06-07 — Phase 11.4 : board opérateur rendu des écrans configurables (onglets + filtrage + Récap produits)

### Contexte
La fondation backend (`0.25.0`) et l'UI admin (`0.26.0`) permettaient de **définir** des écrans opérateur. Cet incrément les **rend** enfin sur le board : le dashboard opérateur affiche désormais **un onglet par écran configuré** (« Commandes Immédiates », « 1ère mi-temps », « Prêtes », « Récupérées », « Écran Général »…), chacun filtrant le flux de commandes temps réel par **statut + créneau (slotKind) + catégorie/produit**. Ajout du **panneau Récap produits** (agrégation par catégorie) et de l'**Accès rapide** (recherche par n° de commande ou nom client) — la moitié droite de la capture de référence. Hors périmètre (différé) : le **regroupement « X commandes similaires »** (11.4c) et l'affichage du **plan de préparation Flaix** (11.5, en attente du code Flaix).

### Backend — enrichissement du payload dashboard (11.4a)
~ `backend/src/modules/orders/orders.service.ts` — `findDashboardByEvent` enrichi pour que les écrans puissent filtrer/afficher côté client : chaque **commande** porte `slotKind` (aplati depuis `order.slot.kind`, défaut `IMMEDIATE`) + `customerName` (`user.displayName` uniquement — jamais email/téléphone sur le board partagé) ; chaque **ligne** porte `categoryId` + `categoryName` (résolus via **un seul** `product.findMany` batché sur les `productId` distincts — `OrderItem` n'a pas de relation `product`). `PICKED_UP` ajouté à `DASHBOARD_STATUSES` (l'écran « récupérées » a pour défaut `[PICKED_UP, RECOVERED]`). Forme `{ eventId, counts, orders }` conservée.
~ `backend/src/modules/orders/orders.service.spec.ts` — `product: { findMany }` ajouté au mock Prisma ; 2 nouveaux tests (enrichissement slotKind/customerName/categoryId/categoryName + lookup batché dédupliqué ; skip du lookup produit quand aucune ligne) ; test statuts mis à jour (inclut `PICKED_UP`). **88/88** sur le module orders.

### Client opérateur (11.4a)
~ `apps/operator/src/lib/api/orders-client.ts` — `OrderItem` (+`categoryId`/`categoryName`), `Order` (+`slotKind`/`customerName`) ; types `OperatorScreenKind`/`SlotKind`/`ScreenFilters`/`ResolvedOperatorScreen`/`ResolvedScreensResponse` ; `fetchResolvedScreens(eventId, token, supplierId?)` → `GET /events/:eventId/operator-screens/resolved`
+ `apps/operator/src/lib/screens/filter.ts` — helpers **purs** (testables) : `itemMatchesFilters` (include/exclude catégorie+produit), `hasActiveFilters`, `orderMatchesScreen` (gate créneau + ≥1 ligne passant les filtres), `buildScreenColumns` (mini-Kanban scoppé à l'écran), `countScreenOrders` (badge d'onglet)

### UI board opérateur (11.4a + 11.4b)
~ `apps/operator/src/app/dashboard/[eventId]/page.tsx` — fetch des écrans résolus (config statique, 1 fois) ; **barre d'onglets** `ScreenTabBar` (icône + nom + compteur live) ; le board rend les **colonnes de l'écran actif** via `buildScreenColumns`, **fallback** sur le Kanban fixe historique quand aucun écran configuré ; toggle header « 📊 Récap » (initialisé depuis `filters.showRecap` de l'écran)
+ `apps/operator/src/components/RecapPanel.tsx` — panneau droit : **Accès rapide** (input → max 8 résultats #numéro + nom + StatusBadge) et **Récap produits** (agrégation `catégorie → produits` avec totaux, en-tête `N cmd · N u`, tri par quantité)

### Qualité
- `pnpm --filter @break-eat/backend typecheck` → **exit 0** · lint **0 erreur** · `jest orders` → **88/88**
- `pnpm --filter @break-eat/operator typecheck` → **exit 0** · lint **0 erreur** · `build` → **✓** (`/dashboard/[eventId]` 9.37 kB)

---

## [0.26.0] — 2026-06-07 — Phase 11.3 : UI admin des écrans opérateur (CRUD templates + application par événement)

### Contexte
La fondation backend (`0.25.0`) exposait deux surfaces de routes (templates org-scoped + jonction par événement). Cet incrément livre l'**UI admin** qui les pilote : un développeur/manager peut créer des **modèles d'écran réutilisables** au niveau organisation, définir leurs **conditions d'affichage**, puis les **appliquer/réordonner/activer par événement**. Périmètre frontend admin uniquement — le rendu opérateur (11.4) et le contrat FlaixPrepPlan (11.5) restent en attente.

### Client API + navigation
~ `apps/admin/src/lib/api/admin-client.ts` — section « Operator Screens (Phase 11) » : types `OperatorScreenKind`/`SlotKind`/`OperatorOrderStatus`/`ScreenFilters`/`OperatorScreenTemplate`/`EventOperatorScreen`/`CreateOperatorScreenInput`/`UpdateOperatorScreenInput` + 9 fonctions (`apiGetOperatorScreens`/`apiGetOperatorScreen`/`apiCreateOperatorScreen`/`apiUpdateOperatorScreen`/`apiDeleteOperatorScreen` ; `apiGetEventScreens`/`apiApplyEventScreen`/`apiUpdateEventScreen`/`apiRemoveEventScreen`) ; ajout de `kind?: SlotKind` à l'interface `Slot`
~ `apps/admin/src/app/(admin)/layout.tsx` — entrée de nav « 🖥️ Écrans opérateur » (`/operator-screens`) entre Groupes et Feature Flags

### Builder de conditions partagé
+ `apps/admin/src/components/operator-screens/screen-form.tsx` — source unique des libellés (`KIND_LABELS`/`SLOT_KIND_LABELS`/`STATUS_LABELS` + ordres) ; `ScreenDraft` (forme plate) + `EMPTY_DRAFT` + `templateToDraft`/`draftToInput` ; composant `<ScreenConditionsForm>` (nom, kind, icône, sortOrder, enabled, puis chips multi-toggle créneaux/statuts/fournisseurs/catégories + case « récap »). Réutilisé par les pages création **et** édition pour éviter ~150 lignes dupliquées. **Note** : filtres niveau produit (`productIds`/`excludeProductIds`) + `excludeCategoryIds` câblés côté serveur mais **différés** dans l'UI (seuls `categoryIds` (inclusion) + `showRecap` exposés).

### Pages CRUD templates (org-scoped)
+ `apps/admin/src/app/(admin)/operator-screens/page.tsx` — liste + création inline ; cartes (icône, nom, badge « désactivé », résumé `summarize()` des conditions, badge kind, compteur d'événements appliqués) liant vers le détail
+ `apps/admin/src/app/(admin)/operator-screens/[id]/page.tsx` — édition (via `<ScreenConditionsForm>`) + suppression (zone de danger) ; bannière indiquant le nombre d'événements où le modèle est appliqué

### Application par événement
~ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — carte « 🖥️ Écrans opérateur » : `load()` étendu (`apiGetEventScreens` + `apiGetOperatorScreens` dans le `Promise.all`) ; sélecteur des modèles non encore appliqués → `apiApplyEventScreen` ; liste triée par ordre effectif (`lien.sortOrder ?? template.sortOrder`) avec réordonnancement ▲/▼ (persiste un ordre explicite `0..n-1` uniquement pour les lignes dont le `sortOrder` a dérivé), bascule Activer/Désactiver et Retirer ; lien « Gérer les modèles → » vers `/operator-screens`

### Qualité
- `pnpm --filter @break-eat/admin typecheck` → **exit 0**
- `pnpm --filter @break-eat/admin lint` → **0 erreur**
- `pnpm --filter @break-eat/admin build` → **✓ 15 routes** (`/operator-screens` 2.41 kB, `/operator-screens/[id]` 2.17 kB, `/events/[id]` 7.45 kB)

---

## [0.25.0] — 2026-06-07 — Phase 11 (fondation backend) : écrans opérateur configurables (templates réutilisables)

### Contexte
Le board opérateur doit devenir **paramétrable** : ajouter des écrans, les afficher seulement pour certains créneaux, avec conditions d'affichage (statuts, fournisseurs, catégories/produits). Décision de co-conception : on commence par les **écrans configurables** modélisés comme **templates réutilisables au niveau organisation** (définis une fois — ex. « Spartiates buvette » — puis appliqués à plusieurs événements). Cet incrément livre **uniquement la fondation backend** (schéma + migration + module CRUD + résolution). L'UI admin (11.3), le rendu opérateur (11.4) et le contrat FlaixPrepPlan (11.5) restent en attente.

### Schéma & migration (bloc 11.1)
~ `backend/prisma/schema.prisma` — `enum SlotKind {IMMEDIATE|PAUSE_1|PAUSE_2|GENERAL|CUSTOM}` + `Slot.kind` (@default IMMEDIATE, moment de récupération **portable** entre événements) ; `enum OperatorScreenKind {ORDERS_QUEUE|READY|RECOVERED|GENERAL}` ; `model OperatorScreenTemplate` (org-scoped : `name`, `kind`, `icon?`, `sortOrder`, `enabled`, `slotKinds[]`, `statuses[]` (`OrderStatus`), `supplierIds[]`, `filters Json`, timestamps) ; `model EventOperatorScreen` (jonction `eventId`+`templateId`, `sortOrder?`/`enabled` override par événement, `@@unique([eventId,templateId])`) ; `Organization.operatorScreenTemplates` + `Event.operatorScreens`
+ `backend/prisma/migrations/20260606_phase11_operator_screens/migration.sql` — `CREATE TYPE slot_kind` + `operator_screen_kind` ; `ALTER TABLE slots ADD COLUMN kind` (NOT NULL DEFAULT 'IMMEDIATE') ; `CREATE TABLE operator_screen_templates` (arrays `slot_kind[]`/`order_status[]`/`text[]`, `filters JSONB DEFAULT '{}'`, `TIMESTAMP(3)`) + `event_operator_screens` ; FK `ON DELETE CASCADE` + unique `(event_id, template_id)` + index. Appliquée via `prisma migrate deploy` (non destructif) puis `prisma generate`.

### Backend — OperatorScreensModule (bloc 11.2)
+ `backend/src/modules/operator-screens/operator-screens.service.ts` — cœur : `createTemplate`/`listTemplates`/`getTemplate`/`updateTemplate`/`deleteTemplate` (org-scoped, écriture `ORG_ADMIN`/`MANAGER`, lecture tout membre, SUPER_ADMIN bypass) ; `applyToEvent`/`listEventScreens`/`updateEventScreen`/`removeEventScreen` (jonction, résout event→org) ; `resolveForEvent(eventId, userId, supplierIdParam?)` (consommateur board : pin fournisseur `membership.supplierId ?? param`, statuts par défaut depuis `kind` via `DEFAULT_STATUSES`, `sortOrder` effectif = lien ?? template, tri, masquage des écrans d'un autre fournisseur quand épinglé) ; statiques `sanitizeFilters` (whitelist clés connues + dédup) et `mapKnownError` (P2002→Conflict) ; exporte `ScreenFilters` + `ResolvedOperatorScreen`
+ `backend/src/modules/operator-screens/operator-screen-templates.controller.ts` — `organizations/:orgId/operator-screens` (POST/GET/GET :screenId/PATCH/DELETE)
+ `backend/src/modules/operator-screens/event-operator-screens.controller.ts` — `events/:eventId/operator-screens` (GET `/resolved` ?supplierId, GET liste, POST apply, PATCH/DELETE :linkId)
+ `backend/src/modules/operator-screens/operator-screens.module.ts`
+ `backend/src/modules/operator-screens/dto/create-operator-screen.dto.ts` · `update-operator-screen.dto.ts` · `apply-event-screen.dto.ts` · `update-event-screen.dto.ts`
+ `backend/src/modules/operator-screens/operator-screens.service.spec.ts` — 10 tests (sanitizeFilters ×3, createTemplate ×2, resolveForEvent ×3, applyToEvent ×2)
~ `backend/src/app.module.ts` — `OperatorScreensModule` enregistré (section « Phase 11 »)

### Qualité
- `pnpm --filter @break-eat/backend typecheck` → **exit 0**
- `pnpm --filter @break-eat/backend lint` → **0 erreur**
- `operator-screens.service.spec.ts` → **10/10**
- Migration appliquée via `prisma migrate deploy` (non destructif, conforme au garde-fou Prisma) ; client régénéré

---

## [0.24.1] — 2026-06-06 — Refonte design : board opérateur + STATUS_COLORS centralisé + LoginForm partagé

### Contexte
La refonte white-label `0.23.0` avait rebrandé le **login** et le **shell** de l'app operator, mais le **board opérateur** (page dashboard + composants kanban) était resté sur l'ancienne palette sombre et la table des couleurs de statut était **dupliquée 3×**. Cet incrément termine l'alignement white/orange du board et établit `StatusBadge.tsx` comme **source de vérité unique** des couleurs + libellés de statut. **Périmètre : alignement de marque uniquement** — la restructuration **par créneau** (#17) reste en attente de la démonstration du workflow par le product owner.

### Centralisation statut (source de vérité unique)
~ `apps/operator/src/components/StatusBadge.tsx` — exporte `STATUS_COLORS` + `STATUS_LABELS` (8 statuts) ; palette raffinée (`PAID` orange `#FC4002`, `ACCEPTED` bleu, `PREPARING` violet, `READY` vert, `PICKED_UP` cyan, `COMPLETED` stone, `CANCELLED` rouge, `RECOVERED` ambre)

### Composants kanban (tokens BRAND + dédup)
~ `apps/operator/src/components/OrderCard.tsx` — import `BRAND` + `STATUS_COLORS` ; suppression du `STATUS_COLORS` local dupliqué ; carte `border BRAND.border` + `borderLeft 4px solid color` ; boutons d'action mappés sur `STATUS_COLORS`
~ `apps/operator/src/components/DashboardColumn.tsx` — import `BRAND` + `STATUS_COLORS` ; suppression des maps `COLUMN_BG`/`HEADER_COLOR` ; `headerColor = STATUS_COLORS[status]` ; conteneur `bgSubtle` + `borderTop 3px headerColor`
~ `apps/operator/src/components/NotificationPopup.tsx` — import `BRAND` + `STATUS_COLORS` ; `bg = isReady ? STATUS_COLORS.READY : BRAND.orange`

### LoginForm opérateur partagé
+ `apps/operator/src/components/LoginForm.tsx` — login unique (lockup `BreakEatLogo` + « Portail opérateur » + CTA orange), stocke `operator_token` ; consommé par home + dashboard
~ `apps/operator/src/app/page.tsx` — utilise le `LoginForm` partagé (suppression du LoginForm inline)
~ `apps/operator/src/app/dashboard/[eventId]/page.tsx` — header blanc de marque (`BreakEatLogo` + wordmark « BREAKEAT » + sous-titre `grey`), chip fournisseur orange (🏪), compteur en `grey`, helper `HeaderButton` (blanc, hover orange) pour ↺ / plein écran ⊞⊠ / Déconnexion ; wrapper `bgSubtle` + Fredoka ; suppression de l'ancien LoginForm sombre inline (`#1f2937`/« 🍔 BREAK EAT »)

### Qualité
- `pnpm --filter @break-eat/operator typecheck` → **exit 0**
- `pnpm --filter @break-eat/operator lint` → **exit 0**
- `pnpm --filter @break-eat/operator build` → **✓ 4 routes** (`/dashboard/[eventId]` 7.56 kB)
- `STATUS_COLORS`/`STATUS_LABELS` ne sont plus définis qu'à **un seul endroit** (était : 3 copies)

---

## [0.24.0] — 2026-06-03 — Phase 14 : Groupes, accès privé aux événements & Back Office (SUPER_ADMIN)

### Contexte
Trois livrables liés : (1) **groupes/segments** rattachés à l'organisation avec adhésion manuelle + auto-rattachement par **domaine email** ; (2) **accès privé** au niveau de l'événement (`EventVisibility PUBLIC|PRIVATE` + liaison `EventGroup`), **enforcé côté serveur** (404 pour non-membre) ; (3) **Back Office** plateforme (`apps/backoffice`, port 3003, garde `SUPER_ADMIN`) avec KPIs globaux, gestion des organisations et supervision des groupes. Codes promo ciblés par groupe : conçus, **non construits**.

### Schéma & migration (bloc 14.1)
~ `backend/prisma/schema.prisma` — `enum EventVisibility {PUBLIC|PRIVATE}` ; `Event.visibility` (@default PUBLIC) + `Event.groups` ; `model Group` (`organizationId`, `name`, `description?`, `emailDomain?`, `@@unique([organizationId,name])`) ; `model GroupMember` (`source GroupMemberSource @default MANUAL`, `@@unique([groupId,userId])`) ; `model EventGroup` (`@@id([eventId,groupId])`, `@@index([groupId])`) ; `enum GroupMemberSource {MANUAL|DOMAIN}`
+ `backend/prisma/migrations/20260603_phase14_groups_event_visibility/migration.sql`

### Backend — GroupsModule (blocs 14.2 → 14.4)
+ `backend/src/modules/groups/groups.module.ts`
+ `backend/src/modules/groups/groups.controller.ts` — base `organizations/:orgId/groups` (`JwtAuthGuard`) ; 8 routes (CRUD groupe + CRUD membres)
+ `backend/src/modules/groups/groups.service.ts` — CRUD, membres par email, `applyDomainMembershipsForUser()` (auto-rattachement `DOMAIN`), `canAccessEvent()` (enforcement privé)
+ `backend/src/modules/groups/dto/create-group.dto.ts` · `update-group.dto.ts` · `add-group-member.dto.ts`
~ `backend/src/modules/events/public-events.controller.ts` — `canAccessEvent()` → **404** identique pour non-membre (aucune fuite d'existence)

### Backend — BackofficeModule (bloc 14.5)
+ `backend/src/modules/backoffice/backoffice.module.ts`
+ `backend/src/modules/backoffice/backoffice.controller.ts` — base `/backoffice`, `@Roles(SUPER_ADMIN)`
+ `backend/src/modules/backoffice/backoffice.service.ts` — `getGlobalKpis()` : `revenue{caTtcCents, caHtCents, vatRate}`, `ordersCount`, `averageBasket{htCents, ttcCents}`, `accountsCount`, `organizationsCount` ; **CA HT = round(TTC / (1 + vatRate))**, `vatRate = 0.10` (resto sur place) ; + orgs CRUD/activation cross-tenant
+ `backend/src/modules/backoffice/backoffice.service.spec.ts`
+ `backend/src/modules/backoffice/dto/create-backoffice-org.dto.ts` · `update-backoffice-org.dto.ts`

### Back Office app (bloc 14.6) — apps/backoffice, port 3003
+ App Next.js 15 dédiée (TanStack Query, `@break-eat/brand`), auth `SUPER_ADMIN` (clés `backoffice_token`/`backoffice_user`)
+ `(backoffice)/overview/page.tsx` (KPIs) · `organizations/page.tsx` + `organizations/[id]/page.tsx` · `groups/page.tsx` (supervision cross-tenant lecture seule)
+ `components/status-badge.tsx` (badge statut org — hors route App Router) · `login/page.tsx` · `layout.tsx`
+ `public/logo-full.png` · `logo-mark.png` · `.gitignore`

### Bloc 14.7 — Dashboard CLUB : visibilité + groupes
~ `backend/src/modules/events/dto/update-event.dto.ts` — +`visibility?` (EventVisibility) +`groupIds?` (UUID[])
~ `backend/src/modules/events/events.service.ts` — `update()` : set `visibility` + **remplacement transactionnel** du set `EventGroup` (validation appartenance org → 400 sinon) ; `findOne()` inclut `groups{groupId}` ; `EventWithSuppliers.groups?` optionnel
~ `backend/src/modules/events/events.service.spec.ts` — +4 tests (set visibility, remplacement groupes, vidage `[]`, rejet groupe cross-org)
~ `apps/admin/src/lib/api/admin-client.ts` — +`type EventVisibility`, `AdminEvent.visibility?`/`groups?` ; `apiUpdateEvent` +`visibility?`/`groupIds?` ; +types `Group`/`GroupMember` + 8 fonctions (`apiGetGroups`…`apiRemoveGroupMember`)
~ `apps/admin/src/app/(admin)/layout.tsx` — +entrée nav `{ /groups, 🏷️, "Groupes" }`
+ `apps/admin/src/app/(admin)/groups/page.tsx` — liste + création (nom, description, domaine)
+ `apps/admin/src/app/(admin)/groups/[id]/page.tsx` — édition méta, membres (ajout/retrait, badge Manuel/Domaine), suppression
~ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — +carte « 🔒 Accès & visibilité » (radios public/privé + multi-select groupes si privé)
~ `apps/admin/src/app/(admin)/events/page.tsx` — +badge « 🔒 Privé »

### Qualité (bloc 14.8)
- `pnpm typecheck` (backend) → **exit 0** ; `pnpm test` (backend) → **291/291 — 23 suites — 0 failure**
- `pnpm typecheck` (admin) → **exit 0** ; `pnpm build` (admin) → **✓ 14 routes** (+`/groups` +`/groups/[id]`)
- `groupIds` **remplace** le set quand fourni (`[]` = vide ; omis = inchangé) ; écriture en `$transaction`

---

## [0.23.0] — 2026-06-03 — Refonte design white-label : package @break-eat/brand (white/orange)

### Contexte
Refonte visuelle complète des surfaces web (admin + operator) vers l'identité Break Eat : fond **blanc** neutre (zéro forme décorative), **orange vif `#FC4002`**, police **Fredoka** sur toute l'UI, wordmark officiel **« BREAKEAT »** (artwork PNG) et logo **« B éclair »** (lockup complet sur login, mark seul sur dashboard). Objectif : centraliser tous les tokens de design dans un package partagé pour garantir **une seule source de vérité** white-label réutilisable par les 3 surfaces.

### Package partagé (nouveau)
+ `packages/brand/package.json` — `@break-eat/brand` (consommé via `workspace:*`)
+ `packages/brand/src/brand.ts` — objet `BRAND` : orange `#FC4002`, orangeDark `#DA3702`, orangeSoft, orangeTint, ink `#1c1917`, inkSoft `#44403c`, grey `#a8a29e`, border `#ece3dd`, bg `#ffffff`, bgSubtle `#faf7f5`, shadowSoft, shadowButton, font Fredoka + `type Brand`
+ `packages/brand/src/BreakEatLogo.tsx` — composant logo (lockup complet `logo-full.png` + mark seul `logo-mark.png`)
+ `packages/brand/src/index.ts` — barrel export (`BRAND`, `Brand`, `BreakEatLogo`)
~ `apps/admin/next.config.ts` + `apps/operator/next.config.ts` — `transpilePackages: ['@break-eat/brand']`
~ `apps/admin/package.json` — dépendance `@break-eat/brand: workspace:*`

### Shims admin (re-export — compat imports existants)
+ `apps/admin/src/lib/brand.ts` — re-export depuis `@break-eat/brand`
+ `apps/admin/src/components/brand/BreakEatLogo.tsx` — re-export

### Rebrand admin — chrome
~ `apps/admin/src/app/layout.tsx` — `next/font/google` Fredoka, wordmark PNG (Raleway retiré)
~ `apps/admin/src/app/(admin)/layout.tsx` — sidebar blanche, entrée nav active orange, logo mark
~ `apps/admin/src/app/(admin)/dashboard/page.tsx` — cartes nav + health badge BRAND
~ `apps/admin/src/app/login/page.tsx` — lockup complet sur login
~ `apps/admin/src/app/globals.css` + `apps/admin/src/app/page.tsx`

### Rebrand admin — 10 pages internes (tokens BRAND)
~ `(admin)/team/page.tsx` · `(admin)/venues/page.tsx` · `(admin)/events/page.tsx` · `(admin)/events/[id]/page.tsx` · `(admin)/feature-flags/page.tsx` · `(admin)/settings/page.tsx` · `(admin)/demo-setup/page.tsx` · `(admin)/suppliers/[id]/page.tsx` · `(admin)/organizations/[id]/page.tsx` · `(admin)/simulator/page.tsx`

**Convention de mapping appliquée à l'identique sur les 10 pages :**
- Bleus primaires `#2563eb`/`#3b82f6` → `BRAND.orange` (hover → `orangeDark`) ; CTA sombres « + Nouveau… » → orange + hover ; boutons navigation sombres `#111827`/`#1f2937` → `BRAND.ink`
- `#111827` (titres) → `ink` ; `#374151`/`#1f2937` (labels) → `inkSoft` ; `#6b7280`/`#9ca3af` (muted) → `grey`
- Bordures `#d1d5db`/`#e5e7eb` → `border` ; fonds clairs `#f9fafb`/`#f3f4f6` → `bgSubtle` ; cartes `#fff` → `bg` **+ `border`** ; ombres → `rgba(28,25,23,0.06)` / `shadowSoft`
- color-picker white-label (org + event) default `#2563eb` → `BRAND.orange` ; `fontFamily: BRAND.font` sur conteneur, `inherit` sur inputs/selects/buttons/textarea

**Couleurs sémantiques PRÉSERVÉES (hors palette historique) :** erreur rouge, succès vert, warning ambre, money `#059669`, badges rôle/scope catégoriels, légende lifecycle `STATUS_COLOR` (PAID/ACCEPTED/PREPARING/READY/PICKED_UP/COMPLETED/RECOVERED/CANCELLED — partagée avec l'opérateur), `#7c3aed` rush simulateur.

### Rebrand operator
~ `apps/operator/src/app/page.tsx` (login) · `apps/operator/src/app/layout.tsx` (shell) · `apps/operator/src/app/globals.css` — même identité white/orange + Fredoka

### Qualité
- `pnpm --filter @break-eat/admin typecheck` → **exit 0 — 0 erreur**
- `grep (admin)` chrome bleu/gris/bordure → **0 résiduel** ; seules subsistent les couleurs lifecycle sémantiques (`#3b82f6` PAID, `#6b7280` COMPLETED) dans la légende `STATUS_COLOR` du simulateur — **intentionnel**

---

## [0.22.1] — 2026-06-02 — Audit Phase 11 & 12 — P1 fix + P2/P3 corrections

### Audit P1 — Sécurité : enforcement supplierId dashboard

**Bug** : un opérateur avec supplierId assigné pouvait retirer/modifier le paramètre `?supplierId=` dans l'URL pour voir les commandes des autres fournisseurs.

~ `backend/src/modules/orders/orders.controller.ts` — `findDashboard()` : lit maintenant `membership.supplierId` depuis la DB ; si l'opérateur a un fournisseur assigné, ce fournisseur est **toujours appliqué** (ignoring query param). Les opérateurs sans assignment gardent l'accès complet.

### Audit P2 — Branding : vidage des champs logoUrl / primaryColor

**Bug** : envoyer une chaîne vide `''` pour effacer `logoUrl` échouait la validation `@IsUrl()`. Impossible de supprimer un logo une fois défini.

~ `backend/src/modules/organizations/dto/update-org-branding.dto.ts` — `@Transform('' → null)` sur `logoUrl`, `primaryColor`, `description` ; types passent à `string | null`
~ `backend/src/modules/events/dto/update-event.dto.ts` — même correction

### Audit P3 — Dashboard admin : cartes de navigation incomplètes

**Amélioration** : les cartes de la page d'accueil admin ne référençaient pas les sections Équipe et Lieux ajoutées en Phase 12.

~ `apps/admin/src/app/(admin)/dashboard/page.tsx` — +cartes Équipe (`/team`) et Lieux (`/venues`)

---

## [0.22.0] — 2026-06-02 — Phase 12 complétée : Blocs 12.7 · 12.8 · 12.9

### BLOC 12.7 — Invitation opérateur & gestion d'équipe

**Schéma**
~ `backend/prisma/schema.prisma` — `OrganizationMember.supplierId` (FK vers Supplier) + relation `Supplier.assignedOperators`
+ `backend/prisma/migrations/20260602_phase12_7_operator_supplier_assignment/migration.sql`

**Backend**
+ `backend/src/modules/organizations/dto/invite-member.dto.ts` — `InviteMemberDto` (email + role + supplierId?)
~ `backend/src/modules/organizations/organizations.service.ts` — +`inviteByEmail()` +`getMembers()` +`removeMember()` +`updateBranding()`
~ `backend/src/modules/organizations/organizations.controller.ts` — +`GET /:id/members` +`POST /:id/invite` +`DELETE /:id/members/:memberId` +`PATCH /:id/branding`
~ `backend/src/modules/users/users.service.ts` — `findByIdWithMemberships()` inclut maintenant `supplier` pour l'opérateur

**Admin panel**
~ `apps/admin/src/lib/api/admin-client.ts` — +`OrgMemberWithUser` +`apiGetOrgMembers()` +`apiInviteMember()` +`apiRemoveMember()`
+ `apps/admin/src/app/(admin)/team/page.tsx` — page équipe : tableau membres (email/rôle/fournisseur), formulaire invitation par email
~ `apps/admin/src/app/(admin)/layout.tsx` — +entrée nav "Équipe"

### BLOC 12.8 — Branding (logo, couleur, description)

**Schéma**
~ `backend/prisma/schema.prisma` — `Organization` +`logoUrl` +`primaryColor` +`description` ; `Event` +`description` +`logoUrl` +`primaryColor`
+ `backend/prisma/migrations/20260602_phase12_8_branding/migration.sql`

**Backend**
+ `backend/src/modules/organizations/dto/update-org-branding.dto.ts` — `UpdateOrgBrandingDto`
~ `backend/src/modules/events/dto/update-event.dto.ts` — +`description` +`logoUrl` +`primaryColor`
~ `backend/src/modules/events/events.service.ts` — `update()` persiste les champs branding
~ `backend/src/modules/organizations/organizations.service.ts` — +`updateBranding()`
~ `backend/src/modules/organizations/organizations.controller.ts` — +`PATCH /:id/branding`

**Admin panel**
~ `apps/admin/src/lib/api/admin-client.ts` — branding fields dans `Organization` et `AdminEvent` +`apiUpdateOrgBranding()` +`apiUpdateEvent()`
~ `apps/admin/src/app/(admin)/organizations/[id]/page.tsx` — section Branding (logo preview, color picker, description)
~ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — section Branding (description événement, logo, couleur)

### BLOC 12.9 — Dashboard opérateur filtré par fournisseur

**Backend**
~ `backend/src/modules/orders/orders.controller.ts` — `GET /event/:id/dashboard` accepte `?supplierId=uuid`
~ `backend/src/modules/orders/orders.service.ts` — `findDashboardByEvent()` filtre par `supplierId` si fourni

**Operator app**
~ `apps/operator/src/lib/api/orders-client.ts` — +`fetchMeWithMemberships()` +`OperatorMembership` ; `fetchDashboard()` accepte `supplierId?`
~ `apps/operator/src/app/page.tsx` — après login : lit `memberships[0].supplierId`, stocke `operator_supplier_id` + `operator_supplier_name` dans localStorage, affiche badge fournisseur
~ `apps/operator/src/app/dashboard/[eventId]/page.tsx` — lit `operator_supplier_id`, badge fournisseur dans header
~ `apps/operator/src/hooks/useDashboard.ts` — option `supplierId?` transmise à `fetchDashboard()`

---

## [0.21.0] — 2026-06-02 — Phase 13 : Mobile V1 — Parcours Client Complet

### Contexte
Implémentation du parcours client end-to-end sur l'application mobile React Native : scanner un QR code → choisir un stand → ajouter des articles → sélectionner un créneau → passer une commande demo → suivre la commande en temps réel.

### Backend — BLOC 13.1 (Endpoints publics)
+ `backend/src/modules/events/public-events.controller.ts` — 3 routes sans auth : GET /public/events/:id, GET /public/events/:id/suppliers/:supplierId/products, GET /public/events/:id/slots
~ `backend/src/modules/events/events.module.ts` — +PublicEventsController

### Backend — BLOC 13.2 (Demo Checkout)
~ `backend/src/modules/cart/cart.service.ts` — +demoCheckout() : crée un Order PAID sans Stripe (DemoGuard)
~ `backend/src/modules/cart/cart.controller.ts` — +POST /carts/:id/demo-checkout (DemoGuard + JwtAuthGuard)

### Mobile — BLOC 13.3 (Stores)
+ `apps/mobile/src/store/auth.store.ts` — token + user state avec AsyncStorage persistence
+ `apps/mobile/src/store/cart.store.ts` — panier local (items, slot, supplierId, eventId)

### Mobile — BLOC 13.4 (API Client)
+ `apps/mobile/src/lib/api/mobile-api.ts` — toutes les fonctions API mobiles (auth, public events, cart, orders)

### Mobile — BLOC 13.5 (Screens × 9)
+ `apps/mobile/src/screens/login.screen.tsx` — Login / Register dark theme
+ `apps/mobile/src/screens/qr-scanner.screen.tsx` — Scanner QR (VisionCamera v4) + saisie manuelle
+ `apps/mobile/src/screens/event-home.screen.tsx` — Accueil événement + sélecteur de stand
+ `apps/mobile/src/screens/supplier-catalog.screen.tsx` — Catalogue produits par catégorie + ajout panier
+ `apps/mobile/src/screens/cart.screen.tsx` — Panier (quantités, total, slot sélectionné)
+ `apps/mobile/src/screens/slot-selector.screen.tsx` — Sélection créneau horaire avec barre de capacité
+ `apps/mobile/src/screens/checkout.screen.tsx` — Récapitulatif + fake card + demo checkout
+ `apps/mobile/src/screens/order-confirmation.screen.tsx` — Confirmation animée avec N° de commande
+ `apps/mobile/src/screens/order-tracking.screen.tsx` — Suivi temps réel (polling 5s) avec étapes visuelles

### Mobile — BLOC 13.6 (Navigation + Deep Links)
~ `apps/mobile/src/navigation/root-navigator.tsx` — Stack complet 9 screens + deep link breakeat://event/:eventId + rehydrate auth
~ `apps/mobile/app.config.js` — +react-native-vision-camera plugin + camera permission iOS/Android

### Dépendances installées
+ `react-native-vision-camera@^4.7.3` — scanner QR natif (useCodeScanner)
+ `@react-native-async-storage/async-storage@^3.1.1` — persistance du token JWT

### Qualité
- pnpm typecheck (mobile) : exit 0 — 0 erreur
- pnpm lint (mobile) : exit 0 — 0 erreur
- pnpm typecheck (backend) : exit 0 — 0 erreur
- pnpm lint (backend) : exit 0 — 0 warning
- pnpm test (backend) : 273/273 — 22 suites — 0 failure

---

## [0.20.0] — 2026-06-02 — Phase 12 : Admin Panel V1 Complet + Operator Home V2

### Contexte
Complétion du panel admin pour le parcours démo end-to-end. Ajout de la gestion des lieux, catégories, produits, points de retrait, créneaux et QR codes. Wizard "Spartiates Hockey" en 1 clic. Refonte complète de l'accueil opérateur avec sélecteur d'événements.

### Fichiers créés / modifiés

#### Admin App — BLOC 12.1 (admin-client.ts)
~ `apps/admin/src/lib/api/admin-client.ts` — +12 fonctions API : Venue, Category, Product, PickupPoint, Slot (CRUD complet)

#### Admin App — BLOC 12.2 (Venues)
+ `apps/admin/src/app/(admin)/venues/page.tsx` — CRUD lieux avec copie UUID

#### Admin App — BLOC 12.3 (Produits par fournisseur)
+ `apps/admin/src/app/(admin)/suppliers/[id]/page.tsx` — Détail fournisseur : catégories + produits CRUD (prix €, catégorie, description)

#### Admin App — BLOC 12.4 (Event Detail enrichi)
~ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — +Venue info +Pickup Points +Time Slots +QR Code +Lien dashboard opérateur +Liens fournisseurs vers /suppliers/[id]

#### Admin App — BLOC 12.5 (Nav + Demo Wizard)
~ `apps/admin/src/app/(admin)/layout.tsx` — +Lieux +Démo Spartiates dans sidebar
+ `apps/admin/src/app/(admin)/demo-setup/page.tsx` — Wizard one-click "Spartiates Hockey" (9 étapes : venue → event → supplier → categories → products → pickup points → slots → activate)

#### Operator App — BLOC 12.6 (Home V2)
~ `apps/operator/src/app/page.tsx` — Home refaite : login dark + sélecteur d'événements auto-chargé depuis /auth/me/memberships + saisie UUID manuelle

### Score final
**TypeScript : 0 erreur | ESLint : 0 erreur | Tests : 273/273 — 22 suites — 0 failure**

---

## [0.19.0] — 2026-06-02 — Phase 11 : Admin Panel

### Contexte
Panel d'administration Next.js 15 complet pour gérer les organisations, événements, feature flags, paramètres et le simulateur. Authentification JWT propre, layout protégé, API client centralisé.

### Fichiers créés / modifiés

#### Backend — BLOC 11.1 (Auth + Users)
~ `backend/src/modules/users/users.service.ts` — +`findByIdWithMemberships(id)` (inclut memberships + organizations)
~ `backend/src/modules/auth/auth.service.ts` — +`meWithMemberships(userId)` délègue à UsersService
~ `backend/src/modules/auth/auth.controller.ts` — +`GET /auth/me/memberships` (JwtAuthGuard)

#### Admin App — BLOC 11.2 (Infrastructure)
~ `apps/admin/next.config.ts` — +`NEXT_PUBLIC_API_URL` dans env block
+ `apps/admin/src/lib/api/admin-client.ts` — client API complet (auth, orgs, events, suppliers, feature-flags, settings, simulator)

#### Admin App — BLOC 11.3 (Pages)
~ `apps/admin/src/app/page.tsx` — redirect client-side (token → /dashboard, sinon /login)
+ `apps/admin/src/app/login/page.tsx` — formulaire login → JWT → memberships → localStorage
+ `apps/admin/src/app/(admin)/layout.tsx` — layout protégé, sidebar nav, logout
+ `apps/admin/src/app/(admin)/dashboard/page.tsx` — health badge, 5 nav cards
+ `apps/admin/src/app/(admin)/organizations/[id]/page.tsx` — détail org, membres, add member
+ `apps/admin/src/app/(admin)/events/page.tsx` — liste + création événements
+ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — détail événement, status, suppliers
+ `apps/admin/src/app/(admin)/feature-flags/page.tsx` — CRUD feature flags, toggle rapide
+ `apps/admin/src/app/(admin)/settings/page.tsx` — CRUD app settings, JSON value parsing
+ `apps/admin/src/app/(admin)/simulator/page.tsx` — seed/rush/progress/failures/clear + stat bar

#### Documentation
~ `.env.example` — +`NEXT_PUBLIC_API_URL` (admin app)

### Score final
**TypeScript : 0 erreur | ESLint : 0 erreur | Tests : 273/273 — 22 suites — 0 failure**

---

## [0.18.1] — 2026-06-02 — Audit Global Phases 1→10

### Contexte
Audit complet de toutes les phases 1 à 10. Objectif : 0 erreur TypeScript, 0 erreur ESLint, 100 % tests verts, structure parfaite.

### Bugs corrigés (TypeScript — 4 erreurs)
- `backend/src/logger/json-logger.ts` — méthode privée `formatMessage` renommée `serializeMessage` (conflict avec `ConsoleLogger.formatMessage` publique)
- `backend/src/modules/flaix/flaix.controller.ts:73` — clé composée Prisma `organizationId_userId` → `userId_organizationId`
- `backend/src/modules/orders/orders.controller.ts:227` — même correction
- `apps/operator/next.config.ts` — `hideSourceMaps: true` → `sourcemaps: { deleteSourcemapsAfterUpload: true }` (API @sentry/nextjs v9)

### Bugs corrigés (ESLint — 8 erreurs)
~ `backend/src/modules/flaix/flaix.service.ts` — params inutilisés `context` → `_context`, `userId` → `_userId`
~ `backend/src/modules/flaix/flaix.service.spec.ts` — import `TestingModule` supprimé
~ `backend/src/modules/realtime/realtime.gateway.spec.ts` — variable `configService` supprimée
~ `backend/src/modules/simulator/simulator.controller.ts` — import `Body` supprimé
~ `backend/src/modules/simulator/simulator.service.spec.ts` — import `OrderActorType` supprimé
~ `backend/src/modules/simulator/rush.spec.ts` — imports `NotFoundException` + `OrderActorType` supprimés
~ `backend/src/modules/orders/order-loss.spec.ts` — assertion `!` → safe conditional
~ `apps/operator/src/hooks/useDashboard.ts` — commentaire eslint-disable supprimé (plugin non installé)

### Améliorations
~ `backend/src/config/app.config.ts` — +`appEnv` (APP_ENV) +`logLevel` (LOG_LEVEL) dans registerAs
~ `.env.example` — +APP_ENV, +LOG_LEVEL, +NEXT_PUBLIC_SENTRY_DSN_OPERATOR, +SENTRY_AUTH_TOKEN, +SENTRY_ORG, +SENTRY_PROJECT

### Score final
**TypeScript : 0 erreur | ESLint : 0 erreur | Tests : 273/273 — 22 suites — 0 failure**

---

## [0.18.0] — 2026-06-02 — Phase 10 : QA, Rush Tests, Déploiement

### Contexte
Validation sous charge (rush 50/100 commandes, invariant de count), tests d'intégrité order-loss, Sentry frontend Next.js, logging JSON structuré, Docker Compose production, déploiement Vercel, checklist de déploiement.

### Ajouté (backend — tests)
+ backend/src/modules/simulator/rush.spec.ts — 18 tests (rush 50/100, progressOrders no-loss, combined, getStats)
+ backend/src/modules/orders/order-loss.spec.ts — 14 tests (terminal states, reconnect, count conservation, projection minimale)

### Ajouté (backend — infrastructure)
+ backend/src/logger/json-logger.ts — ConsoleLogger subclass JSON one-line (prod) / coloré (dev)
+ backend/Dockerfile — multi-stage build (deps → builder → runner, node:22-alpine, non-root)

### Ajouté (frontend — operator)
+ apps/operator/sentry.client.config.ts — init Sentry navigateur (DSN, replays, beforeSend)
+ apps/operator/sentry.server.config.ts — init Sentry Node.js
+ apps/operator/sentry.edge.config.ts — init Sentry Edge
+ apps/operator/instrumentation.ts — hook Next.js 15 (charge sentry selon NEXT_RUNTIME)

### Ajouté (déploiement)
+ docker-compose.prod.yml — PostgreSQL 16 + Redis 7 + backend (réseau interne, volumes nommés)
+ DEPLOYMENT_CHECKLIST.md — 7 sections, 40+ items (secrets, Railway, Vercel, migrations, tests, smoke)

### Modifié
~ apps/operator/package.json — +@sentry/nextjs ^9.0.0
~ apps/operator/next.config.ts — withSentryConfig (tunnelRoute, hideSourceMaps, telemetry:false)
~ apps/operator/vercel.json — headers sécurité (HSTS, X-Frame-Options, CSP...) + rewrite /monitoring/*
~ backend/src/main.ts — new JsonLogger('Bootstrap') comme logger NestJS global; LOG_LEVEL par env

### Tests
**Total backend Phase 10 : 273 tests passants — 22 suites — 0 failure** (+23 nouveaux tests)

---

## [0.16.0] — 2026-06-01 — Phase 8 : Dashboards + Public Screens

### Contexte
Dashboard kanban temps réel pour l'opérateur + écran public des commandes prêtes pour les clients. Couche frontend complète : socket.io-client, hooks réactifs, composants Storybook.

### Ajouté (backend)
+ backend/src/modules/orders/dto/assign-slot.dto.ts
+ backend/src/modules/flaix/flaix.controller.ts — GET rush-status + GET decisions
+ backend/src/modules/simulator/simulator.service.spec.ts — 15 tests

### Modifié (backend)
~ backend/src/modules/orders/orders.service.ts — +findDashboardByEvent() +assignOrderToSlot()
~ backend/src/modules/orders/orders.service.spec.ts — +5 tests (dashboard + assignSlot)
~ backend/src/modules/orders/orders.controller.ts — +GET /event/:eid/dashboard +PATCH /:id/assign-slot
~ backend/src/modules/orders/orders.module.ts — import SlotsModule
~ backend/src/modules/flaix/flaix.module.ts — controllers: [FlaixController]
~ backend/src/modules/simulator/simulator.service.ts — +progressOrders() +randomFailures() +getStats()
~ backend/src/modules/simulator/simulator.controller.ts — +3 nouveaux endpoints

### Ajouté (frontend)
+ apps/operator/src/lib/realtime/socket-client.ts — socket.io-client dynamique, JWT, dedup
+ apps/operator/src/lib/api/orders-client.ts — REST API client complet
+ apps/operator/src/components/StatusBadge.tsx
+ apps/operator/src/components/OrderCard.tsx
+ apps/operator/src/components/DashboardColumn.tsx
+ apps/operator/src/components/NotificationPopup.tsx
+ apps/operator/src/components/PublicScreenRow.tsx
+ apps/operator/src/hooks/useSound.ts — Web Audio API (beeps)
+ apps/operator/src/hooks/useDashboard.ts — useReducer + socket + polling fallback
+ apps/operator/src/app/dashboard/[eventId]/page.tsx — kanban opérateur
+ apps/operator/src/app/public/[eventId]/page.tsx — écran public sans auth
+ apps/operator/src/stories/DashboardColumn.stories.tsx
+ apps/operator/src/stories/NotificationPopup.stories.tsx
+ apps/operator/src/stories/PublicScreenRow.stories.tsx

### Modifié (frontend)
~ apps/operator/src/app/page.tsx — landing page (liens dashboard + public)
~ apps/operator/src/stories/OrderCard.stories.tsx — 7 stories (uses real component)
~ apps/operator/package.json — socket.io-client ^4.8.1

### Notes techniques
- Dynamic import socket.io-client → évite erreur SSR Next.js App Router
- `new_order` socket → resync REST complet (payload socket ne contient pas les items)
- `order_ready` socket → NotificationPopup + son (Web Audio OscillatorNode)
- Polling fallback toutes les 10s quand socket déconnecté
- PublicScreenRow = ZÉRO PII (pas de nom, prix, articles)
- Auto-prune écran public : commandes >5 min purgées toutes les 30s

### Tests
42 tests backend passants dans les 2 suites modifiées (Phase 8 ajout : 20 tests)
**Total backend : 221 tests passants, 18 suites, 0 failure**

---

## [0.17.1] — 2026-06-01 — Audit Phase 9 : P2 fixes

### P2 — ?scope= query param non validé (→ Prisma 500)
~ feature-flags.controller.ts — guard inline : BadRequestException si scope ∉ FlagScope
~ app-settings.controller.ts — idem

### P2 — Validation cross-champ absente dans set()
~ feature-flags.service.ts — BadRequestException si GLOBAL+scopeId ou ORG/EVENT sans scopeId
~ app-settings.service.ts — idem

### P2 — findFirst(GLOBAL) sans scopeId: null (fallback défensif)
~ feature-flags.service.ts — where: { key, scope: GLOBAL, scopeId: null }
~ app-settings.service.ts — idem

### P2 — FeatureFlagsService.remove() sans NotFound guard (→ Prisma P2025 non intercepté)
~ feature-flags.service.ts — findUnique avant delete + NotFoundException (miroir AppSettings)

### Tests (+5)
~ feature-flags.service.spec.ts — +3 (GLOBAL+scopeId, ORG sans scopeId, NotFoundException remove)
~ app-settings.service.spec.ts — +2 (GLOBAL+scopeId, EVENT sans scopeId)
**Total : 250 tests passants, 20 suites, 0 failure**

---

## [0.17.0] — 2026-06-01 — Phase 9 : CMS + Feature Flags

### Contexte
Feature flags sans redéploiement avec résolution EVENT > ORG > GLOBAL. CMS basique (AppSettings) key-value JSON par scope. CORS hardening gateway Socket.IO. Hook frontend `useFeatureFlag`.

### Ajouté (backend)
+ backend/prisma/migrations/20260601_phase9_feature_flags_cms/migration.sql
+ backend/src/modules/feature-flags/dto/set-feature-flag.dto.ts
+ backend/src/modules/feature-flags/feature-flags.service.ts — resolve() list() set() remove()
+ backend/src/modules/feature-flags/feature-flags.service.spec.ts — 10 tests
+ backend/src/modules/feature-flags/feature-flags.controller.ts — 4 endpoints
+ backend/src/modules/feature-flags/feature-flags.module.ts
+ backend/src/modules/app-settings/dto/set-app-setting.dto.ts
+ backend/src/modules/app-settings/app-settings.service.ts — get() list() set() remove()
+ backend/src/modules/app-settings/app-settings.service.spec.ts — 11 tests
+ backend/src/modules/app-settings/app-settings.controller.ts — 4 endpoints
+ backend/src/modules/app-settings/app-settings.module.ts

### Modifié (backend)
~ backend/prisma/schema.prisma — +enum FlagScope +model FeatureFlag +model AppSetting
~ backend/src/app.module.ts — +FeatureFlagsModule +AppSettingsModule
~ backend/src/modules/realtime/realtime.gateway.ts — CORS_ORIGINS env (fix P2 depuis Phase 6)

### Ajouté (frontend)
+ apps/operator/src/hooks/useFeatureFlag.ts — hook useFeatureFlag(key, options)

### Tests
**Total backend : 245 tests passants, 20 suites, 0 failure** (+21 nouveaux tests Phase 9)

---

## [0.16.1] — 2026-06-01 — Audit Phase 8 : P1 + P2 fixes

### Contexte
Audit post-Phase 8. 1 bug P1 (écran public vide), 3 issues P2 (failRate non borné, flaix sans contrôle org, fullscreen desync).

### P1 — Écran public : 401 silencieux au chargement
**Cause :** `GET /orders/event/:id/dashboard` est protégé par `JwtAuthGuard`. L'écran public appelait cet endpoint sans token → 401 silencieux → liste vide.
**Fix :**
+ backend/src/modules/orders/public-orders.controller.ts — nouveau contrôleur `@Controller('public/orders')` sans guard, retourne seulement `{id, publicOrderNumber, pickupPointId, updatedAt}` (zéro PII)
~ backend/src/modules/orders/orders.service.ts — +`findReadyByEvent()` avec `select` minimal
~ backend/src/modules/orders/orders.module.ts — ajout `PublicOrdersController` dans `controllers`
~ apps/operator/src/app/public/[eventId]/page.tsx — endpoint `GET /public/orders/event/:id/ready`

### P2 — failRate non borné dans randomFailures()
~ backend/src/modules/simulator/simulator.service.ts — `const rate = Math.max(0, Math.min(1, failRate))`

### P2 — FlaixController : endpoints accessibles à n'importe quel utilisateur JWT
~ backend/src/modules/flaix/flaix.controller.ts — injection `PrismaService` + `assertOrgMemberForEvent()` vérifie membership avant chaque réponse

### P2 — isFullscreen désynchronisé si l'utilisateur sort via Echap
~ apps/operator/src/app/dashboard/[eventId]/page.tsx — listener `fullscreenchange` + toggle sans `setState` manuel
~ apps/operator/src/app/public/[eventId]/page.tsx — idem

### Tests
+ 3 tests pour `findReadyByEvent` dans `orders.service.spec.ts`
**Total backend : 224 tests passants, 18 suites, 0 failure**

---

## [0.15.0] — 2026-06-01 — Phase 7 : Slots + Flaix Foundation

### Contexte
Gestion des créneaux de retrait et fondation de l'intégration Flaix.

### Ajouté
+ backend/prisma/migrations/20260601_phase7_slots_flaix/migration.sql
+ backend/src/modules/slots/dto/create-slot.dto.ts
+ backend/src/modules/slots/dto/update-slot.dto.ts
+ backend/src/modules/slots/slots.service.ts — CRUD + gestion capacité atomique + assignOrderToSlot
+ backend/src/modules/slots/slots.service.spec.ts — 21 tests
+ backend/src/modules/slots/slots.controller.ts — GET/POST/PATCH/DELETE /events/:eventId/slots
+ backend/src/modules/slots/slots.module.ts
+ backend/src/modules/flaix/flaix.service.ts — stub HTTP + fallback + recordDecision
+ backend/src/modules/flaix/flaix.service.spec.ts — 12 tests
+ backend/src/modules/flaix/flaix.module.ts

### Modifié
~ backend/prisma/schema.prisma — enums SlotStatus/SlotSource/FlaixDecisionType ; modèles Slot + FlaixDecision ; selectedSlotId sur Cart ; relation slot sur Order ; reverse relations Event/Supplier/PickupPoint
~ backend/src/app.module.ts — SlotsModule + FlaixModule enregistrés (Phase 7)

### Notes techniques
- Flaix = stub Phase 7 — HTTP call scaffoldé mais retourne null tant que FLAIX_API_URL n'est pas renseigné
- Incrémentation currentLoad atomique via updateMany + WHERE conditionnel (race-safe, même pattern que stock)
- FlaixDecision.decisionId = clé d'idempotence Flaix (UNIQUE en DB) — double application silencieusement ignorée
- FK orders.slot_id existait depuis Phase 5 (colonne sans contrainte) — Phase 7 attache la contrainte FK

### Tests
203 passing, 0 failures (17 suites — +2 nouvelles : slots: 21, flaix: 12)

---

## [0.14.0] — 2026-06-01 — Bloc 6.3 : Storybook + Mobile Pipeline + Simulator

### Contexte
Infrastructure de validation Phase 6 : Storybook (admin + operator), pipeline EAS Build mobile, toggle DEMO_MODE, et skeleton simulateur d'événements.

### Ajouté
+ apps/admin/.storybook/ — config @storybook/nextjs (main.ts + preview.ts)
+ apps/admin/src/stories/StatusBadge.stories.tsx — 8 variants + AllStatuses story
+ apps/operator/.storybook/ — idem
+ apps/operator/src/stories/OrderCard.stories.tsx — 4 états PAID/ACCEPTED/PREPARING/READY
+ apps/mobile/eas.json — profils EAS : development / preview / production
+ apps/mobile/app.config.js — config Expo bare workflow (iOS + Android)
+ .github/workflows/mobile-preview.yml — build EAS sur push mobile/**, post QR en commentaire commit
+ backend/src/common/guards/demo.guard.ts — 403 sauf DEMO_MODE=true
+ backend/src/modules/simulator/ — seedEvent(), simulateRush(), clearEvent()

### Modifié
~ apps/admin/package.json + apps/operator/package.json — scripts storybook:6006 / storybook:6007
~ backend/src/main.ts — garde sécurité : exit(1) si DEMO_MODE=true ET NODE_ENV=production
~ backend/src/app.module.ts — SimulatorModule enregistré
~ pnpm-workspace.yaml — esbuild + core-js-pure autorisés

### Notes techniques
- SimulatorModule toujours chargé, DemoGuard retourne 403 en prod (pas de chargement conditionnel)
- Commandes demo préfixées DEMO- pour purge facile
- EAS projectId=FILL_IN à remplir via `eas init`, EXPO_TOKEN secret GitHub requis

### Tests
170 passing, 0 failures (inchangé — pas de nouveaux tests backend pour ce bloc)

---

## [0.13.0] — 2026-06-01 — Bloc 6.2 : Socket.IO Gateway + Outbox Realtime

### Contexte
Couche temps réel complète : gateway Socket.IO avec auth JWT, gestion des rooms, et émission outbox-compliant après chaque commit DB.

### Ajouté
+ backend/src/modules/realtime/realtime.gateway.ts — gateway Socket.IO, JWT auth au connect, join_room / leave_room
+ backend/src/modules/realtime/realtime.service.ts — emitNewOrder, emitOrderUpdated, emitOrderReady
+ backend/src/modules/realtime/realtime.module.ts — JwtModule.registerAsync + export RealtimeService
+ backend/src/modules/realtime/dto/join-room.dto.ts — validation nom de room (type:uuid)
+ backend/src/modules/realtime/realtime.gateway.spec.ts — 11 tests
+ backend/src/modules/realtime/realtime.service.spec.ts — 8 tests

### Modifié
~ backend/src/modules/orders/orders.service.ts — inject RealtimeService + emit outbox
~ backend/src/modules/orders/orders.service.spec.ts — mock RealtimeService + assertions outbox
~ backend/src/modules/orders/orders.module.ts — import RealtimeModule
~ backend/src/app.module.ts — import RealtimeModule (Phase 6)
~ backend/package.json + pnpm-lock.yaml — socket.io packages ajoutés

### Règles respectées
- Outbox rule : guard avant $transaction, emit après commit (jamais inversé)
- eventId payload = UUID de dédup realtime (≠ concert eventId — conflit nommage résolu)
- Token handshake.auth prioritaire sur Authorization header
- Disconnect immédiat si JWT invalide ou absent

### Tests
170 tests passing, 0 failures (15 suites)

---

## [0.12.0] — 2026-06-01 — Bloc 6.1 : Order State Machine + Audit Trail

### Contexte
Implémentation de la machine d'états des commandes côté opérateur : guard de transitions, 6 endpoints PATCH, snapshot pour le dashboard, enregistrement de l'audit trail atomique.

### Ajouté
+ backend/src/modules/orders/order-state-machine.service.ts — garde pur, 15 transitions autorisées
+ backend/src/modules/orders/order-state-machine.service.spec.ts — 30 tests (map, 15 paths valides, 12 invalides, isAllowed, allowedFrom)
+ backend/src/modules/orders/dto/transition-order.dto.ts — champ `reason` optionnel (max 500 chars)

### Modifié
~ backend/src/modules/orders/orders.service.ts — transition(), findActiveByEvent(), findAuditTrail() ; fix orderBy → createdAt
~ backend/src/modules/orders/orders.service.spec.ts — 35 tests (existants + nouveaux blocs transition/find)
~ backend/src/modules/orders/orders.controller.ts — réécriture complète : 6 PATCH opérateur + GET dashboard + 2 GET client
~ backend/src/modules/orders/orders.module.ts — OrderStateMachineService ajouté providers/exports

### Garanties techniques
- assertTransition() tire avant tout écrit DB → la transaction n'est jamais ouverte si la transition est invalide
- transition() utilise $transaction([order.update, audit.create]) → atomique
- 15 transitions réelles (correction du commentaire "17" erroné dans le service)
- État READY non annulable — oblige le chemin recovery

### Tests
151 tests passing, 0 failures (13 suites)

---

## [0.11.0] — 2026-06-01 — Bloc 6.0 : Infrastructure Staging complète

### Contexte
Déploiement complet de l'infrastructure staging : Vercel (admin + operator), Railway (NestJS backend + PostgreSQL + Redis), GitHub Secrets, wiring cross-env.

### URLs actives
- Admin :    https://breakeat-admin-admin.vercel.app ✅
- Operator : https://breakeat-operator-git-main-breakeatapp-1555s-projects.vercel.app ✅
- Backend :  https://breakeat-admin-production.up.railway.app — GET /health → {"status":"ok"} ✅

### Ajouté
+ nixpacks.toml (racine) — build Railway : COREPACK_INTEGRITY_KEYS='', corepack, pnpm --filter backend
+ railway.json (racine) — builder NIXPACKS, healthcheckPath /health, restart ON_FAILURE

### Modifié
~ apps/admin/vercel.json — pattern propre : installCommand cd ../.. && pnpm install, buildCommand pnpm build
~ apps/operator/vercel.json — idem
~ apps/admin/src/app/layout.tsx + page.tsx — titre BREAK EAT corrigé
~ apps/operator/src/app/layout.tsx + page.tsx — idem
~ backend/package.json — express ajouté en dépendance directe (fix Cannot find module 'express')
~ pnpm-lock.yaml — mis à jour

### Fixes techniques notables
- COREPACK_INTEGRITY_KEYS='' : contourne le bug Node.js 22 / corepack signing key mismatch
- Root Directory Railway vidé : pnpm-lock.yaml doit être accessible depuis la racine
- express déclaré explicitement : pnpm strict mode ne remonte pas les deps transitives
- Prisma generate dans le build script : évite les 44 erreurs TypeScript en CI

### GitHub Secrets configurés
VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID_ADMIN, VERCEL_PROJECT_ID_OPERATOR, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

---

## [0.10.3] — 2026-06-01 — Codex Audit Phase 5 (2e passe) : 3 P1 + 2 P2 fixes

### Contexte
Deuxième audit Codex après les corrections [0.10.2]. Les gros correctifs Phase 5 sont validés ; 3 P1 + 2 P2 bloquaient le passage à l'étape infra/design. Tout est corrigé ci-dessous.

### Modifié (P1 fixes)
~ backend/src/modules/cart/cart.service.ts :
    - **P1 #1 (snapshot prix écrit trop tôt)** — le freeze des prix se fait MAINTENANT après le succès Stripe, dans UNE transaction unique avec la bascule CHECKOUT_PENDING. Un échec Stripe laisse donc le cart OPEN, sans snapshot.
    - computeView() : garde défensive — tant que status === OPEN, on lit TOUJOURS le prix live (un snapshot résiduel ne peut plus fausser le total au retry).
~ backend/src/modules/cart/cart.service.spec.ts :
    - test renommé "freezes prices + transitions ONLY after Stripe succeeds"
    - + nouveau test "does NOT freeze/transition when Stripe fails" (régression P1 #1)
~ package.json :
    - **P1 #2 (pipeline cassé via corepack)** — build/lint/typecheck/test → `turbo run X`. turbo est dans node_modules/.bin (donc résolvable par corepack/pnpm), alors que `pnpm -r` appelé depuis un script ne l'était pas → c'était LA cause racine.
    - build:turbo supprimé (redondant), clean → `turbo run clean`
~ backend/package.json :
    - **P1 #2** — jest `maxWorkers: 1` → tests déterministes, plus de flakiness en parallèle, plus besoin de `--runInBand`
~ .gitignore :
    - **P1 #3 (sécurité)** — ignore explicite : firebase-app-distribution-key.json, firebase-adminsdk-*.json, **/google-services.json, **/GoogleService-Info.plist, service-account*.json, gcp-*.json, *.p8, *.p12, *.mobileprovision, *.cer, *.certSigningRequest, *.keystore, *.jks
    - PAS de `*.json` en bloc (package.json / tsconfig.json / vercel.json préservés)
    - + .claude/settings.local.json (config locale machine, ne doit pas être partagée)
~ BLOC_6_0_SETUP_GUIDE.md :
    - ligne 168 : fausse affirmation "`*.json` protège la clé Firebase" corrigée (la vérité : ignore nominatif + patterns ciblés, vérifier via `git status`)
    - **P2 (contradiction Vercel)** — build/install/output : source de vérité unique = `apps/*/vercel.json` ; le dashboard Vercel reste vide

### Ajouté
+ .gitattributes (normalisation LF pour les builds Linux Railway/Vercel ; binaires .docx/.pdf/.p8/etc. marqués binary)
+ **Repo git initialisé en local** (branche `main`) + commit initial `fbf6147` (P2 "pas de repo") — AUCUN remote, AUCUN push (attend que le product owner crée le repo GitHub)

### Vérifications
- **95 tests backend ✅** (12 suites, séquentiel ~16s, 0 flaky)
- `corepack pnpm typecheck` + `corepack pnpm lint` → **VERTS via les scripts** (la commande exacte que Codex disait cassée passe maintenant)
- turbo run typecheck/lint : 4/4 packages OK
- .gitignore vérifié via `git check-ignore` : 10 chemins sensibles ignorés, 0 fichier de config ignoré par erreur ; seul `.env.example` (placeholders) serait suivi

### Reste (hors P1, acté avec le product owner)
- P2 : push GitHub à faire (créer le repo distant, puis `git remote add` + push) avant import Vercel/Railway
- P2 : Phase 6 métier (OrderStatus state machine, realtime) pas commencée — vient après Bloc 6.0

---

## [0.10.2] — 2026-06-01 — Codex Audit Phase 5 : P1/P2/P3 fixes

### Ajouté
+ backend/prisma/migrations/20260601_phase5_codex_audit/migration.sql (cart_items.price_snapshot_cents + CHECK)
+ phases de DEV/PHASE_4_PRODUCTS_CATEGORIES_STOCK.docx
+ phases de DEV/PHASE_5_CART_CHECKOUT_STRIPE_ORDERS.docx
+ phases de DEV/generate_phase4.js
+ phases de DEV/generate_phase5.js

### Modifié (P1 fixes)
~ backend/prisma/schema.prisma (CartItem.priceSnapshotCents ajouté)
~ backend/src/modules/cart/cart.service.ts (freeze prix au checkout + use snapshot in computeView)
~ backend/src/modules/cart/cart.service.spec.ts (test "freezes prices on every CartItem" ajouté)
~ backend/src/modules/orders/orders.service.ts :
    - utilise priceSnapshotCents pour les snapshots OrderItem (P1 #2)
    - vérification défensive subtotal === intent.amount (P1 #2)
    - décrémentation atomique tx.stock.updateMany WHERE quantity >= item.quantity (P1 #1)
    - tx.payment.upsert au lieu de create (P1 #3 retry après FAILED)
~ backend/src/modules/orders/orders.service.spec.ts (+4 tests audit guards : no-snapshot, divergence, oversell, upsert)
~ backend/src/modules/payments/stripe.service.ts (P3 #7 — commentaire destination charges corrigé)
~ package.json (build: turbo → pnpm -r run, build:turbo conservé en backup)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md
~ CHANGELOG.md

### Résultat
- 94 tests backend ✅ (+5 nouveaux audit guards)
- Pipeline racine : typecheck + lint + build TOUS verts (4 packages chacun)
- 5 DOCX phases livrés (1, 2, 3, 4, 5)

---

## [0.10.1] — 2026-05-28 — Bloc 6.0 scaffolding (infrastructure)

### Ajouté
+ BLOC_6_0_SETUP_GUIDE.md (guide pas-à-pas pour le product owner : Vercel + Railway + Firebase + GitHub Secrets)
+ apps/admin/vercel.json (config monorepo Vercel)
+ apps/operator/vercel.json (config monorepo Vercel)
+ backend/railway.json (config Railway + healthcheck /health)
+ .github/workflows/deploy-frontends.yml (CI auto-deploy Vercel sur push main)
+ .github/workflows/mobile-preview.yml (placeholder Fastlane + Firebase, activé quand iOS/Android natifs initialisés)

### Modifié
~ backend/src/config/app.config.ts (demoMode + stagingToken)
~ .env.example (DEMO_MODE + STAGING_ONLY_TOKEN)
~ brain/REMINDERS.md (décisions infra actées : Vercel + Railway + Firebase + Fastlane)

### À faire (côté product owner — voir BLOC_6_0_SETUP_GUIDE.md)
- Étape 1 : créer projets Vercel admin + operator
- Étape 2 : créer projet Railway avec PostgreSQL + Redis
- Étape 3 : créer projet Firebase + App Distribution
- Étape 4 : configurer GitHub Secrets
- Étape 5 (optionnelle) : domaines custom

---

## [0.10.0] — 2026-05-28 — Process update: Visual Validation Contract

### Ajouté
+ brain/PRODUCT_VALIDATION.md (contrat v1.0.0 : visual validation, Storybook, preview builds, staging, fake data, demo mode, QR codes, approval flow)
+ brain/REMINDERS.md (notes internes assistant : Cursor timing, design inputs, infra à prévoir)

### Modifié
~ brain/ROADMAP.md (Visual Validation Rule ajoutée + deliverables Phase 6 + Phase 8 enrichis)
~ brain/TASK_SUMMARY.md (entrée process update)
~ CHANGELOG.md (cette entrée)

### Impact
- À partir de Phase 6 : tout deliverable frontend doit inclure screenshots + preview build + QR code
- Phase 6 enrichie : ajoute setup staging + Storybook + EAS Build + simulateur fake data
- Phases 1-5 exemptes (backend-only) — validation technique acceptée

---

## [0.9.0] — 2026-05-27 — Phase 5: Cart, Checkout, Stripe Connect, Orders

### Ajouté
+ backend/prisma/migrations/20260527_phase5_stripe_connect/migration.sql
+ backend/src/modules/payments/stripe.service.ts
+ backend/src/modules/payments/payments.module.ts
+ backend/src/modules/suppliers/dto/create-onboarding-link.dto.ts
+ backend/src/modules/cart/dto/create-cart.dto.ts
+ backend/src/modules/cart/dto/update-cart.dto.ts
+ backend/src/modules/cart/dto/add-cart-item.dto.ts
+ backend/src/modules/cart/dto/update-cart-item.dto.ts
+ backend/src/modules/cart/cart.service.ts
+ backend/src/modules/cart/cart.service.spec.ts (12 tests)
+ backend/src/modules/cart/cart.controller.ts
+ backend/src/modules/cart/cart.module.ts
+ backend/src/modules/orders/orders.service.ts
+ backend/src/modules/orders/orders.service.spec.ts (5 tests)
+ backend/src/modules/orders/orders.controller.ts
+ backend/src/modules/orders/orders.module.ts
+ backend/src/modules/webhooks/stripe-webhooks.controller.ts
+ backend/src/modules/webhooks/stripe-webhooks.service.ts
+ backend/src/modules/webhooks/stripe-webhooks.service.spec.ts (4 tests)
+ backend/src/modules/webhooks/webhooks.module.ts

### Modifié
~ backend/package.json (+stripe 17.7.0)
~ backend/prisma/schema.prisma (StripeAccountStatus, CartStatus, OrderStatus, PaymentStatus, OrderActorType enums; Cart, CartItem, Order, OrderItem, Payment, OrderAuditTrail, WebhookEvent models; Supplier extended with stripeAccountStatus + mirrors)
~ backend/src/main.ts (raw body for /webhooks/stripe; bodyParser disabled; prefix exclude webhooks)
~ backend/src/config/app.config.ts (stripe.apiVersion, platformFeeBps, connect.returnUrl/refreshUrl)
~ backend/src/app.module.ts (PaymentsModule, CartModule, OrdersModule, WebhooksModule)
~ backend/src/modules/suppliers/suppliers.service.ts (Stripe Connect onboarding + status refresh)
~ backend/src/modules/suppliers/suppliers.controller.ts (POST /stripe/onboarding-link, GET /stripe/status)
~ .env.example (STRIPE_API_VERSION, STRIPE_PLATFORM_FEE_BPS, STRIPE_CONNECT_RETURN_URL, STRIPE_CONNECT_REFRESH_URL)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md
~ CHANGELOG.md

---

## [0.8.0] — 2026-05-26 — Codex Audit Phase 4 : P1/P2/P3

### Ajouté
+ backend/src/modules/categories/categories.service.spec.ts (8 tests)

### Modifié
~ backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql (TEXT → UUID sur tous les IDs et FKs)
~ backend/src/modules/stock/stock.service.ts (BadRequestException import ; requirePickupPointInOrg vérifie supplier)
~ backend/src/modules/stock/stock.service.spec.ts (test cross-supplier pickup point ajouté)
~ backend/src/modules/products/products.service.ts (validateDateWindow() : availableUntil > availableFrom)
~ backend/src/modules/products/products.service.spec.ts (test date window invalide ajouté)
~ package.json (typecheck/lint : turbo → pnpm -r run)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ CHANGELOG.md

---

## [0.7.0] — 2026-05-26 — Codex Audit P1: globalRole + corepack

### Ajouté
+ .npmrc (package-manager-strict=false)

### Modifié
~ backend/src/modules/auth/strategies/jwt.strategy.ts (globalRole dans select + return { ...payload, globalRole: user.globalRole })
~ backend/src/modules/auth/strategies/jwt.strategy.spec.ts (test: DB globalRole écrase le JWT globalRole)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ CHANGELOG.md

---

## [0.6.0] — 2026-05-26 — Phase 4: Products, Categories, Stock

### Ajouté
+ backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql
+ backend/src/modules/categories/dto/create-category.dto.ts
+ backend/src/modules/categories/dto/update-category.dto.ts
+ backend/src/modules/categories/categories.service.ts
+ backend/src/modules/categories/categories.controller.ts
+ backend/src/modules/categories/categories.module.ts
+ backend/src/modules/products/dto/create-product.dto.ts
+ backend/src/modules/products/dto/update-product.dto.ts
+ backend/src/modules/products/products.service.ts
+ backend/src/modules/products/products.service.spec.ts
+ backend/src/modules/products/products.controller.ts
+ backend/src/modules/products/products.module.ts
+ backend/src/modules/stock/dto/create-stock.dto.ts
+ backend/src/modules/stock/dto/update-stock.dto.ts
+ backend/src/modules/stock/dto/update-stock-availability.dto.ts
+ backend/src/modules/stock/stock.service.ts
+ backend/src/modules/stock/stock.service.spec.ts
+ backend/src/modules/stock/stock.controller.ts
+ backend/src/modules/stock/stock.module.ts

### Modifié
~ backend/prisma/schema.prisma (enums CategoryStatus, ProductStatus ; modèles Category, Product, Stock ; relations Supplier + PickupPoint)
~ backend/src/app.module.ts (ajout CategoriesModule, ProductsModule, StockModule)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ CHANGELOG.md

---

## [0.5.0] — 2026-05-26 — Codex Audit Phase 2/3

### Ajouté
+ backend/src/modules/auth/strategies/jwt.strategy.spec.ts
+ backend/src/modules/organizations/organizations.service.spec.ts
+ backend/src/modules/pickup-points/pickup-points.service.spec.ts

### Modifié
~ turbo.json (test.dependsOn: [] — indépendant du build)
~ apps/mobile/package.json (lint: eslint src/, build: tsc --noEmit)
~ backend/src/common/helpers/require-org-access.ts (SUPER_ADMIN DB bypass)
~ backend/src/modules/organizations/organizations.service.ts (SUPER_ADMIN + NotFoundException targetUser)
~ backend/src/modules/organizations/organizations.controller.ts (user.globalRole passé)
~ backend/src/modules/auth/strategies/jwt.strategy.ts (async validate + isActive DB check)
~ backend/src/modules/pickup-points/pickup-points.service.ts (venueId === event.venueId)
~ backend/src/modules/suppliers/suppliers.service.ts (OrgRole.OPERATOR)
~ backend/src/modules/events/events.service.spec.ts (user mock ajouté)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md

---

## [0.4.0] — 2026-05-25 — Phase 3: Events, Venues, Suppliers

### Ajouté
+ backend/prisma/schema.prisma (enums: VenueStatus, EventStatus, SupplierStatus, PickupPointStatus ; modèles: Venue, Event, EventSupplier, Supplier, PickupPoint)
+ backend/prisma/migrations/20260525_phase3_events_venues_suppliers/migration.sql
+ backend/src/common/helpers/require-org-access.ts
+ backend/src/modules/venues/dto/create-venue.dto.ts
+ backend/src/modules/venues/dto/update-venue.dto.ts
+ backend/src/modules/venues/venues.service.ts
+ backend/src/modules/venues/venues.controller.ts
+ backend/src/modules/venues/venues.module.ts
+ backend/src/modules/suppliers/dto/create-supplier.dto.ts
+ backend/src/modules/suppliers/dto/update-supplier.dto.ts
+ backend/src/modules/suppliers/dto/update-supplier-status.dto.ts
+ backend/src/modules/suppliers/suppliers.service.ts
+ backend/src/modules/suppliers/suppliers.controller.ts
+ backend/src/modules/suppliers/suppliers.module.ts
+ backend/src/modules/events/dto/create-event.dto.ts
+ backend/src/modules/events/dto/update-event.dto.ts
+ backend/src/modules/events/dto/update-event-status.dto.ts
+ backend/src/modules/events/dto/attach-supplier.dto.ts
+ backend/src/modules/events/events.service.ts
+ backend/src/modules/events/events.service.spec.ts
+ backend/src/modules/events/events.controller.ts
+ backend/src/modules/events/events.module.ts
+ backend/src/modules/pickup-points/dto/create-pickup-point.dto.ts
+ backend/src/modules/pickup-points/dto/update-pickup-point.dto.ts
+ backend/src/modules/pickup-points/pickup-points.service.ts
+ backend/src/modules/pickup-points/pickup-points.controller.ts
+ backend/src/modules/pickup-points/pickup-points.module.ts

### Modifié
~ backend/src/app.module.ts (ajout VenuesModule, SuppliersModule, EventsModule, PickupPointsModule)
~ brain/ENGINEERING_MANUAL.md (section Phase 3 ajoutée)
~ brain/TASK_SUMMARY.md (entrée Phase 3 ajoutée)
~ DEVELOPMENT_LOG.md (Phase 3 marquée terminée)
~ CHANGELOG.md (cette entrée)

---

## [0.3.0] — 2026-05-25 — Codex Audit Corrections

### Ajouté
+ apps/mobile/src/lib/config/env.ts
+ apps/mobile/src/types/globals.d.ts

### Modifié
~ apps/mobile/src/instrument.ts (process.env → ENV.*)
~ apps/mobile/src/lib/api/api-client.ts (process.env.API_URL → ENV.API_URL)
~ apps/admin/package.json (lint: next lint → eslint src/)
~ apps/operator/package.json (lint: next lint → eslint src/)
~ backend/src/modules/auth/auth.service.ts (import argon2 supprimé — unused)
~ backend/src/modules/organizations/dto/add-member.dto.ts (import IsString supprimé — unused)
~ backend/src/main.ts (setGlobalPrefix exclude health)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md

---

## [0.2.0] — 2026-05-25 — Phase 2: Auth + Organizations

### Ajouté
+ backend/prisma/schema.prisma (User, Organization, OrganizationMember, RefreshToken)
+ backend/prisma/migrations/20260525_phase2_auth_organizations/migration.sql
+ backend/src/database/prisma.service.ts
+ backend/src/database/prisma.module.ts
+ backend/src/common/enums/role.enum.ts
+ backend/src/common/decorators/current-user.decorator.ts
+ backend/src/common/decorators/roles.decorator.ts
+ backend/src/common/guards/jwt-auth.guard.ts
+ backend/src/common/guards/roles.guard.ts
+ backend/src/modules/users/users.service.ts
+ backend/src/modules/users/users.module.ts
+ backend/src/modules/auth/dto/register.dto.ts
+ backend/src/modules/auth/dto/login.dto.ts
+ backend/src/modules/auth/dto/refresh.dto.ts
+ backend/src/modules/auth/strategies/jwt.strategy.ts
+ backend/src/modules/auth/auth.service.ts
+ backend/src/modules/auth/auth.controller.ts
+ backend/src/modules/auth/auth.module.ts
+ backend/src/modules/auth/auth.service.spec.ts
+ backend/src/modules/organizations/dto/create-organization.dto.ts
+ backend/src/modules/organizations/dto/add-member.dto.ts
+ backend/src/modules/organizations/organizations.service.ts
+ backend/src/modules/organizations/organizations.controller.ts
+ backend/src/modules/organizations/organizations.module.ts

### Modifié
~ backend/package.json
~ backend/src/app.module.ts
~ pnpm-workspace.yaml
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md

---

## [0.1.0] — 2026-05-25 — Phase 1: Foundation

### Ajouté
+ package.json
+ pnpm-workspace.yaml
+ turbo.json
+ .prettierrc / .prettierignore
+ eslint.config.mjs
+ .gitignore
+ .env.example
+ docker-compose.yml
+ .github/workflows/ci.yml
+ DEVELOPMENT_LOG.md
+ backend/package.json + tsconfig + nest-cli.json
+ backend/src/main.ts
+ backend/src/instrument.ts
+ backend/src/app.module.ts
+ backend/src/config/app.config.ts
+ backend/src/health/health.module.ts
+ backend/src/health/health.controller.ts
+ backend/src/health/health.controller.spec.ts
+ apps/admin/ (Next.js 15 shell)
+ apps/operator/ (Next.js 15 shell + WebSocket stub)
+ apps/mobile/ (React Native CLI shell)
+ brain/ENGINEERING_MANUAL.md
+ brain/TASK_SUMMARY.md
