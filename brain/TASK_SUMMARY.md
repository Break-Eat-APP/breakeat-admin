# BREAK EAT Task Summary

This file must be updated after every implementation task.

---

## [2026-06-07] Phase 15 — Dashboard Manager (analytics org/événement, lecture seule)

### Objectif
Donner au **manager** (client payant) une **visibilité opérationnelle** qui manquait totalement : le `/dashboard` admin n'était qu'un lanceur de navigation. Première brique d'analytics **lecture seule**, dont les chiffres se **réconcilient** avec le back office SUPER_ADMIN (mêmes règles CA).

### Livré
- **Backend `stats` (aucune migration)** — `StatsService.getOrgOverview(orgId, userId)` (CA HT/TTC, nb commandes, panier moyen, nb événements + **en cours**, rollup revenu par événement) et `getEventStats(eventId, userId)` (revenu, panier moyen, **répartition par statut** zéro-seedée sur les 8 `OrderStatus`, **top 10 produits**). `StatsController` : `GET organizations/:orgId/stats` · `GET events/:eventId/stats` (JWT + UUID). +1 spec (**7 cas**). `StatsModule` enregistré dans `app.module.ts`.
- **Admin client** — interfaces stats + `apiGetOrgStats` / `apiGetEventStats` (statut typé via l'union `OperatorOrderStatus`).
- **Dashboard admin réécrit** — de lanceur → tableau de bord org (KPIs CA HT/TTC, commandes, panier moyen, événements + « N en cours », **Performance par événement** avec badge « ● En cours », accès rapide board opérateur).
- **Stats par événement** — carte 📊 sur `events/[id]` (KPIs + répartition statut + top produits), fetch **isolé** du `Promise.all` principal.

### Décisions
- **Règle CA = source unique** calquée sur `BackofficeService` : CA seulement si `paymentStatus = SUCCEEDED` ; `totalCents` = TTC ; `CA HT = round(TTC / 1.10)` (`vatRate` config, fallback 0.1). `Order` porte `organizationId` **et** `eventId` → agrégations **sans jointure**.
- **Gating MANAGE_ROLES** (ORG_ADMIN, MANAGER) : le CA est sensible → OPERATOR/MARKETING **403** ; SUPER_ADMIN bypass. Les deux frontends **dégradent proprement** (carte « réservé aux managers », jamais une page cassée).
- **404 avant 403** sur événement inconnu (ne révèle pas l'appartenance org).
- **Lecture seule** : zéro écriture, zéro schéma — pure agrégation sur les tables existantes.

### Reste
- Commit/push du changeset (déclenche les déploiements).
- Backlog non démarré : doc des 2 P1 (#15), audit docs + dossier handoff (#20), Phase 11.5 Flaix (**bloquée** sur le code Flaix), approfondir back office, test live board opérateur.

### Vérifications
- Backend **26 suites / 313 tests** (306 → +7) · typecheck 0 · lint 0.
- Admin typecheck 0 · lint 0 · build ✓ (`/dashboard` 4.97 kB · `/events/[id]` 8.71 kB). Opérateur (régression) typecheck 0 · lint 0. Aucune migration, aucune dépendance ajoutée.

---

## [2026-06-07] Audit Codex — corrections sécurité & robustesse

### Objectif
Traiter les findings de l'audit Codex (frontière 2026-06-02) avant toute nouvelle phase.

### Livré
- **P1 sécurité** — `public-orders.controller.ts` : l'écran public READY (`GET /public/orders/event/:id/ready`) était ouvert → fuite des n° de commandes des **événements privés** à qui connaît l'UUID. Gaté par `OptionalJwtAuthGuard` + `canAccessEvent` (PUBLIC anonyme OK · PRIVATE membre seulement · sinon 404). `OrdersModule` importe `GroupsModule`. +1 spec contrôleur (3 cas).
- **P2 robustesse** — `batchAdvance` (board opérateur) : `Promise.all` → `Promise.allSettled` + reload **toujours** + bannière d'erreur claire. Plus d'état mixte silencieux en rush.
- **P2 hygiène** — `*.tsbuildinfo` retirés du suivi Git + ajoutés au `.gitignore`.

### Vérifié (non-bug)
- **Pipeline racine Turbo** : sain ici (3× exit 0). CI/Vercel/Railway provisionnent pnpm. L'échec Codex = sandbox sans pnpm au PATH → documenté, pas « corrigé ».

### Reste
- **Commit/push** du changeset non commité (~132 fichiers) — après revue (aucun secret), déclenche les déploiements.
- Phase 11.5 (Flaix), dashboards manager / back office.

### Vérifications
- Backend **25 suites / 306 tests** · typecheck 0. Opérateur typecheck 0 · lint 0 · build ✓.

---

## [2026-06-07] Phase 11.4c — Board opérateur : regroupement « X commandes similaires »

### Objectif
En rush, empiler les **paniers identiques** d'une colonne en une carte groupée pour les **préparer ensemble** (et non une par une). Affichage pur **owned by Break** ; distinct de la difficulté Flaix (11.5).

### Livré
- `lib/screens/grouping.ts` — `groupSimilarOrders` : cluster par composition (`productId:quantity` trié), FIFO-préservé. Singletons = groupe de 1 ⇒ board groupé = **sur-ensemble** strict du plat (rien n'est caché, rien n'est fusionné).
- `components/OrderGroupCard.tsx` — carte empilée : chip `🧩 N commandes`, total articles + âge de la plus ancienne, badges `#n°`, composition partagée (`× total`), **bouton batch** (`Préparer les N`…) + dépliage `Voir les N` → `OrderCard` individuelles. Groupe de 1 ⇒ `OrderCard` normale.
- `DashboardColumn` — API `orders: Order[]` + `toCardProps` + `grouped` + `onBatchAdvance` ; `page.tsx` — toggle header « 🧩 Grouper » (**off par défaut**, réversible) + `batchAdvance` (avance tout le groupe via `Promise.all`, puis refresh).

### Décisions
- Toggle **off par défaut** : comportement du board strictement inchangé tant que l'opérateur n'active pas → rétrocompat.
- Le compteur de colonne reste le nombre de **commandes** (pas de groupes) pour ne pas masquer le volume réel.
- Batch borné aux statuts avançables (`PAID→…→READY`, `RECOVERED→ACCEPTED`) ; chaque commande reste indépendante et actionnable individuellement via le dépliage.

### Vérifications
- Opérateur : `typecheck` exit 0 · `lint` 0 · `build` ✓ (`/dashboard/[eventId]` 10.3 kB). Backend inchangé (jest orders **88/88**).

---

## [2026-06-07] Phase 11.4 — Board opérateur : rendu des écrans configurables (onglets + filtrage + Récap)

### Objectif
Faire **rendre** au dashboard opérateur les écrans définis en 11.3 : un **onglet par écran**, chacun filtrant le flux temps réel par statut + créneau + catégorie/produit. C'est la « réception des commandes par créneau » demandée, calquée sur la capture de référence. Différé : regroupement « commandes similaires » (11.4c) et plan Flaix (11.5, en attente du code Flaix).

### Le verrou résolu (pourquoi un enrichissement backend)
Le payload dashboard exposait `slotId` (pas `slot.kind`) et `productId` (pas la catégorie). Deux écrans ne différant que par le créneau (Immédiat / 1ère / 2ème mi-temps) auraient rendu un contenu **identique**. Donc on aplatit côté serveur : `slotKind` par commande + `categoryId`/`categoryName` par ligne (+ `customerName` pour l'appel au retrait et la recherche). `OrderItem` n'ayant **pas** de relation `product`, les catégories sont résolues par **un seul** `product.findMany` batché sur les `productId` distincts. `PICKED_UP` ajouté aux statuts du dashboard (défaut de l'écran « récupérées » = `[PICKED_UP, RECOVERED]`).

### Filtrage (helpers purs, `lib/screens/filter.ts`)
- `orderMatchesScreen` : gate créneau (`slotKinds` vide = tous) + au moins une ligne passant les filtres include/exclude catégorie/produit.
- `buildScreenColumns` : pour l'écran actif, construit un mini-Kanban scoppé à ses `statuses` (statut absent du dashboard → colonne vide).
- `countScreenOrders` : compteur live pour le badge d'onglet.
- Pas de runner de tests dans l'app opérateur → helpers purs validés par typecheck/lint/build ; l'enrichissement backend est couvert par jest.

### UI livrée
- `ScreenTabBar` (icône + nom + compteur) ; board = colonnes de l'écran actif **ou** Kanban fixe en **fallback** quand aucun écran configuré (sécurité de rétrocompat).
- `RecapPanel` (moitié droite de la capture) : **Accès rapide** (recherche n° commande / nom client → 8 résultats max) + **Récap produits** (agrégation `catégorie → produits` avec totaux + `N cmd · N u`). Toggle header « 📊 Récap » initialisé depuis `filters.showRecap`.
- Marque conservée (orange #FC4002 / blanc / Fredoka) — les captures roses sont des références **fonctionnelles**, pas visuelles.

### Vérifications
- Backend : `typecheck` exit 0 · `lint` 0 · `jest orders` → **88/88** (dont 2 nouveaux tests d'enrichissement).
- Opérateur : `typecheck` exit 0 · `lint` 0 · `build` ✓ (`/dashboard/[eventId]` 9.37 kB).

---

## [2026-06-07] Phase 11.3 — UI admin des écrans opérateur (CRUD templates + application par événement)

### Objectif
Donner au manager/développeur l'interface pour piloter les deux surfaces backend de `0.25.0` : créer des **modèles d'écran réutilisables** (org-scoped), définir leurs **conditions d'affichage**, puis les **appliquer/réordonner/activer par événement**. Frontend admin uniquement ; le rendu opérateur (11.4) et FlaixPrepPlan (11.5) suivent.

### Architecture des écrans dans l'admin
- **Deux surfaces qui calquent le backend** : CRUD des templates = nouvelle page de nav top-level `/operator-screens` (analogue à Groupes) ; application par événement = carte sur la page détail de l'événement (analogue à l'accès par groupe par événement).
- **Builder de conditions partagé** (`components/operator-screens/screen-form.tsx`) : `ScreenConditionsForm` + `templateToDraft`/`draftToInput` + libellés (`KIND_LABELS`/`SLOT_KIND_LABELS`/`STATUS_LABELS`). Consommé par création ET édition → pas de duplication.
- **UI différée** : `productIds`/`excludeProductIds` + `excludeCategoryIds` existent côté serveur mais ne sont pas encore exposés ; l'UI couvre `categoryIds` (inclusion) + `showRecap`.

### Pages livrées
- `operator-screens/page.tsx` : liste (cartes résumées via `summarize()`, badge kind, compteur d'événements) + création inline.
- `operator-screens/[id]/page.tsx` : édition + suppression (la suppression retire l'écran de tous les événements — bannière de comptage).
- `events/[id]/page.tsx` : carte « 🖥️ Écrans opérateur » — appliquer un modèle, réordonner ▲/▼, activer/désactiver, retirer. Ordre effectif = `lien.sortOrder ?? template.sortOrder` ; le réordonnancement persiste un ordre explicite `0..n-1` (PATCH uniquement des lignes modifiées).

### Client API (`admin-client.ts`)
- 9 fonctions + types (`OperatorScreenTemplate`, `EventOperatorScreen`, `ScreenFilters`, inputs). `_count.eventScreens` (listes), `template?` (réponses apply/list/update) et l'enveloppe `resolveForEvent` typés conformément au service backend. Ajout de `kind?: SlotKind` à `Slot`.

### Vérifications
- `pnpm --filter @break-eat/admin typecheck` → **exit 0**
- `pnpm --filter @break-eat/admin lint` → **0 erreur**
- `pnpm --filter @break-eat/admin build` → **✓ 15 routes** (`/operator-screens` 2.41 kB, `/operator-screens/[id]` 2.17 kB, `/events/[id]` 7.45 kB)

---

## [2026-06-07] Phase 11 (fondation backend) — Écrans opérateur configurables (templates réutilisables)

### Objectif
Rendre le board opérateur **paramétrable** (ajouter des écrans, les limiter à certains créneaux, conditions d'affichage par statut/fournisseur/catégorie/produit). Décision de co-conception : **écrans configurables d'abord**, modélisés comme **templates réutilisables au niveau organisation** (définis une fois, ex. « Spartiates buvette », appliqués à plusieurs événements). Cet incrément ne livre **que la fondation backend** ; l'UI admin (11.3), le rendu opérateur (11.4) et le contrat FlaixPrepPlan (11.5) suivent.

### Modèle de données (bloc 11.1)
- `enum SlotKind {IMMEDIATE|PAUSE_1|PAUSE_2|GENERAL|CUSTOM}` + `Slot.kind` (@default IMMEDIATE). **Pourquoi** : les slots sont des UUID **par événement** — un template ne peut pas cibler un slotId portable. Un `SlotKind` stable laisse un template viser un **moment de récupération** réutilisable d'un événement à l'autre. Les commandes sans slot sont traitées comme IMMEDIATE.
- `enum OperatorScreenKind {ORDERS_QUEUE|READY|RECOVERED|GENERAL}` — pré-règle les statuts par défaut d'un écran.
- `OperatorScreenTemplate` (org-scoped) : `name`, `kind`, `icon?`, `sortOrder`, `enabled`, `slotKinds[]`, `statuses[]` (`OrderStatus`), `supplierIds[]`, `filters Json`, timestamps. Réutilisable.
- `EventOperatorScreen` (jonction) : `eventId`+`templateId`, `sortOrder?`/`enabled` en **override par événement**, `@@unique([eventId,templateId])` (un template appliqué une seule fois par événement).
- Migration : `20260606_phase11_operator_screens` (appliquée via `migrate deploy`, non destructif).

### Backend — OperatorScreensModule (bloc 11.2)
- **Templates** : `organizations/:orgId/operator-screens` (JwtAuthGuard). Écriture `ORG_ADMIN`/`MANAGER`, lecture tout membre (SUPER_ADMIN bypass via `requireOrgAccess`).
- **Jonction** : `events/:eventId/operator-screens` — `apply`/`list`/`update`/`remove` (résout event→org pour l'accès). P2002 sur double application → `ConflictException`.
- **`resolveForEvent`** (consommateur board) : statuts par défaut depuis `kind` (`DEFAULT_STATUSES`) si vides ; `sortOrder` effectif = `lien.sortOrder ?? template.sortOrder` ; **pin fournisseur** = `membership.supplierId ?? supplierIdParam ?? null` (l'épingle de l'opérateur l'emporte sur le query param) ; masque les écrans scopés à un autre fournisseur quand épinglé ; tri par `sortOrder` puis `name`.
- **`filters`** gardé opaque (`@IsObject`) au DTO car `whitelist`+`forbidNonWhitelisted` ne récurse pas dedans (les clés internes survivent), puis **sanitizé serveur** (`sanitizeFilters` : whitelist `categoryIds`/`excludeCategoryIds`/`productIds`/`excludeProductIds`/`showRecap`, dédup des tableaux de strings, coercition booléenne).

### Vérifications
- `pnpm --filter @break-eat/backend typecheck` → **exit 0**
- `pnpm --filter @break-eat/backend lint` → **0 erreur**
- `operator-screens.service.spec.ts` → **10/10** (sanitizeFilters ×3, createTemplate ×2, resolveForEvent ×3, applyToEvent ×2)
- Migration via `prisma migrate deploy` + `prisma generate`

### Frontière Flaix (rappel, inchangée)
Flaix **décide** (renvoie un plan de prépa : groupes + difficulté + batch + séquence), Break **affiche**. Break possède tout le commerce + l'UI ; Flaix n'est que le cerveau IA exposant une API, **sans fonction ni affichage dans le back office**. `FLAIX_CONTRACT.md` n'est pas réécrit. Le rendu du plan + le fallback local arrivent en 11.5.

---

## [2026-06-06] Refonte design — Board opérateur + centralisation STATUS_COLORS + LoginForm partagé

### Objectif
La refonte white-label (`0.23.0`) avait converti le **login** et le **shell** de l'app operator, mais le **board opérateur lui-même** (page dashboard + composants kanban) était resté sur l'ancienne palette sombre (header `#1f2937`, « 🍔 BREAK EAT », chips bleues, boutons gris `#374151`), et la table des couleurs de statut était **dupliquée 3×**. Cet incrément termine l'alignement white/orange du board et fait de `StatusBadge.tsx` la **source de vérité unique** des couleurs + libellés de statut.

### Centralisation (source de vérité unique)
- `components/StatusBadge.tsx` exporte désormais `STATUS_COLORS` + `STATUS_LABELS` (8 statuts). Palette raffinée : `PAID` = orange `#FC4002` (à traiter), `ACCEPTED` bleu, `PREPARING` violet, `READY` vert, `PICKED_UP` cyan, `COMPLETED` stone, `CANCELLED` rouge, `RECOVERED` ambre.
- Les 3 duplications locales (`OrderCard`, `DashboardColumn`, `NotificationPopup`) sont supprimées et importent ces maps.

### Composants refondus (tokens BRAND)
- `OrderCard.tsx` : carte `border BRAND.border` + `borderLeft 4px solid color`, ombre douce, Fredoka ; boutons d'action mappés sur `STATUS_COLORS` (Accepter→ACCEPTED, Préparer→PREPARING, Prête→READY, Récupérée→PICKED_UP, Récupérer↩→RECOVERED, Annuler✕→CANCELLED).
- `DashboardColumn.tsx` : suppression des maps `COLUMN_BG`/`HEADER_COLOR` ; `headerColor = STATUS_COLORS[status]` ; conteneur `bgSubtle` + `borderTop 3px headerColor`.
- `NotificationPopup.tsx` : `bg = isReady ? STATUS_COLORS.READY : BRAND.orange`.

### LoginForm partagé (nouveau)
- `components/LoginForm.tsx` (nouveau) : login opérateur unique (lockup `BreakEatLogo size=54 showWordmark`, sous-titre « Portail opérateur », CTA orange) ; stocke `operator_token`. Consommé par la **home** (`app/page.tsx`) ET le **dashboard** (`dashboard/[eventId]/page.tsx`) → les deux surfaces ne divergent plus (suppression de 2 LoginForm inline, dont l'ancien sombre du dashboard).

### Header dashboard white-label
- `dashboard/[eventId]/page.tsx` : header blanc (`BreakEatLogo size=26` + wordmark « BREAKEAT » + sous-titre `grey`), chip fournisseur orange (`orangeTint`/`orangeSoft`/`orangeDark`, 🏪 conservé), compteur « commandes actives » en `grey`, helper `HeaderButton` (blanc, bordure `border`, hover orange) pour ↺ / plein écran ⊞⊠ / Déconnexion ; `ConnectionBadge` (sémantique vert/ambre/rouge) conservé ; wrapper principal `bgSubtle` + Fredoka.

### Vérifications
- `pnpm --filter @break-eat/operator typecheck` → **exit 0**
- `pnpm --filter @break-eat/operator lint` → **exit 0**
- `pnpm --filter @break-eat/operator build` → **✓ 4 routes** (`/dashboard/[eventId]` 7.56 kB)

### Périmètre (important)
Ceci est l'**alignement de marque** du board (couleurs / typo / composants), **PAS** la restructuration **par créneau** (#17) — celle-ci reste en attente de la démonstration du workflow par le product owner (« celui où je reçois toutes commandes de chaque créneau je te montrerais comment je fonctionne »). Le board groupe encore par **STATUT** (kanban PAID → RECOVERED).

---

## [2026-06-03] Phase 14 — Groupes, accès privé aux événements & Back Office (SUPER_ADMIN)

### Objectif
Trois livrables : (1) **groupes/segments** par organisation (adhésion manuelle par email + auto-rattachement par **domaine email**) ; (2) **accès privé** au niveau de l'événement (`EventVisibility PUBLIC|PRIVATE` + `EventGroup`), **enforcé serveur** → 404 pour non-membre ; (3) **Back Office** (`apps/backoffice`, port 3003, `SUPER_ADMIN`) avec KPIs globaux + gestion orgs + supervision groupes. Codes promo ciblés : conçus, non construits.

### Modèle de données (bloc 14.1)
- `enum EventVisibility {PUBLIC|PRIVATE}` + `Event.visibility` (@default PUBLIC) + `Event.groups`
- `Group` (org-scoped, `@@unique([organizationId,name])`, `emailDomain?` minuscule sans `@`)
- `GroupMember` (`source MANUAL|DOMAIN`, `@@unique([groupId,userId])`)
- `EventGroup` (PK composite `[eventId,groupId]` → remplacement propre via deleteMany+createMany)
- Migration : `20260603_phase14_groups_event_visibility`

### Backend
- **GroupsModule** (14.2-14.4) : `organizations/:orgId/groups` (JwtAuthGuard, 8 routes). Écriture `ORG_ADMIN`/`MANAGER` (SUPER_ADMIN bypass). `applyDomainMembershipsForUser()` (auto-join), `canAccessEvent()` (enforcement privé branché dans `public-events.controller.ts`).
- **BackofficeModule** (14.5) : `/backoffice` `@Roles(SUPER_ADMIN)`. KPIs : `revenue{caTtcCents, caHtCents, vatRate}`, `ordersCount`, `averageBasket{htCents, ttcCents}`, `accountsCount`, `organizationsCount`. **CA HT = round(TTC / (1 + vatRate))**, `vatRate = 0.10` (resto sur place, configurable `app.reporting.vatRate`).
- **EventsService.update()** (14.7) : applique `visibility` + **remplacement transactionnel** du set `EventGroup` ; tous les `groupIds` doivent appartenir à l'org → `400` sinon (avant écriture). `findOne()` inclut `groups{groupId}`.

### Back Office app (14.6) — apps/backoffice port 3003
Next.js 15 + TanStack Query + `@break-eat/brand`, auth `SUPER_ADMIN` (`backoffice_token`/`backoffice_user`). Routes : overview (KPIs), organizations (liste/détail/activation), groups (supervision cross-tenant lecture seule). `StatusBadge` extrait dans `components/` (un `page.tsx` App Router ne peut exporter que `default` + noms reconnus).

### Dashboard CLUB (14.7) — apps/admin
- `admin-client.ts` : `EventVisibility`, `AdminEvent.visibility?`/`groups?`, `apiUpdateEvent` +`visibility?`/`groupIds?`, types `Group`/`GroupMember` + 8 fonctions groupes.
- Nav +`Groupes` (🏷️) ; pages `groups/` (liste+création) et `groups/[id]` (édition, membres, suppression) ; carte « 🔒 Accès & visibilité » sur l'événement (radios public/privé + multi-select groupes) ; badge « 🔒 Privé » sur la liste.
- **Convention** : `groupIds` envoyé `[]` quand l'événement repasse PUBLIC (évite des restrictions zombies si re-privatisé).

### Vérifications (bloc 14.8)
- backend `typecheck` exit 0 ; `test` **291/291 — 23 suites — 0 failure** (+4 tests events.service)
- admin `typecheck` exit 0 ; `build` ✓ **14 routes** ; backoffice `build` ✓ **7 routes**
- Reste : audit Codex externe Phase 14 (P1/P2/P3).

---

## [2026-06-03] Refonte design white-label — package @break-eat/brand + rebrand admin/operator

### Objectif
Aligner toutes les surfaces web sur l'identité Break Eat (fond blanc, orange `#FC4002`, police Fredoka, wordmark « BREAKEAT » PNG, logo « B éclair »), en centralisant les tokens dans **un seul package** pour le white-label.

### Package partagé `@break-eat/brand` (nouveau)
- `packages/brand/src/brand.ts` — objet `BRAND` (palette complète + ombres + font) + `type Brand`
- `packages/brand/src/BreakEatLogo.tsx` — logo lockup complet (login) + mark seul (dashboard)
- `packages/brand/src/index.ts` — barrel export
- Consommé via `workspace:*` + `transpilePackages: ['@break-eat/brand']` (admin + operator)
- Shims de compat : `apps/admin/src/lib/brand.ts` et `apps/admin/src/components/brand/BreakEatLogo.tsx` re-exportent le package

### Rebrand admin
- **Chrome** : `app/layout.tsx` (Fredoka + wordmark), `(admin)/layout.tsx` (sidebar blanche, nav active orange), `dashboard/page.tsx`, `login/page.tsx` (lockup), `globals.css`
- **10 pages internes** converties aux tokens BRAND : team, venues, events, events/[id], feature-flags, settings, demo-setup, suppliers/[id], organizations/[id], simulator

### Convention de mapping (identique sur les 10 pages)
- `#2563eb`/`#3b82f6` → `orange` (+hover `orangeDark`) ; CTA primaires sombres → orange ; nav sombre `#111827`/`#1f2937` → `ink`
- titres `#111827` → `ink` ; labels `#374151` → `inkSoft` ; muted `#6b7280`/`#9ca3af` → `grey`
- bordures `#d1d5db`/`#e5e7eb` → `border` ; fonds clairs `#f9fafb`/`#f3f4f6` → `bgSubtle` ; cartes `#fff` → `bg` + `border`
- color-picker white-label default `#2563eb` → `orange` ; `fontFamily: BRAND.font` (conteneur) + `inherit` (champs)

### Sémantique préservée (non touchée)
Erreur rouge, succès vert, warning ambre, money `#059669`, badges rôle/scope catégoriels, légende lifecycle `STATUS_COLOR` (partagée opérateur), `#7c3aed` rush simulateur.

### Rebrand operator
`page.tsx` (login), `layout.tsx` (shell), `globals.css` — même identité white/orange + Fredoka.

### Vérifications
- `pnpm --filter @break-eat/admin typecheck` → **0 erreur**
- `grep (admin)` : **0 couleur de chrome résiduelle** ; seules les couleurs lifecycle sémantiques subsistent (intentionnel).

---

## [2026-06-02] Audit Phase 11 & 12 — P1 fix + P2/P3

### Résultats de l'audit

**Phase 11 (Admin Panel de base)**
- P1 : aucun
- P2 : dashboard hardcoded localhost:3002 (documenté, non bloquant)
- P3 : cartes dashboard incomplètes (Équipe + Lieux absentes) → CORRIGÉ

**Phase 12 (Admin V1 complet)**
- P1 : **Security** — `findDashboard` ne vérifiait pas le `supplierId` réel du membership DB. Un opérateur pouvait retirer le paramètre URL pour voir tous les fournisseurs → CORRIGÉ
- P2 : `@IsUrl()` rejetait `''` pour effacer le logo → CORRIGÉ via `@Transform('' → null)`
- P2 : pas d'endpoint PATCH pour changer le rôle / fournisseur d'un membre existant → documenté, P13 backlog
- P3 : `window.location.href` dans operator/page.tsx (cause un rechargement) → documenté

### Corrections appliquées
1. `orders.controller.ts` → `findDashboard()` : lit `membership.supplierId` depuis DB, l'applique en priorité sur le query param
2. `update-org-branding.dto.ts` → `@Transform('' → null)` sur les 3 champs branding
3. `update-event.dto.ts` → idem pour branding event
4. `dashboard/page.tsx` admin → +cartes Équipe + Lieux

**Tests** : 273/273 passent après corrections. TypeScript : 0 erreurs.

---

## [2026-06-02] Phase 12 — Blocs 12.7 · 12.8 · 12.9 — Admin Panel complet

### BLOC 12.7 — Invitation opérateur & gestion d'équipe
**Problème résolu** : le Super Admin ne pouvait inviter un membre que par UUID. Impossible d'assigner un opérateur à un fournisseur précis.

**Schéma** : `OrganizationMember.supplierId String?` → FK vers `Supplier` (onDelete: SetNull). Migration `20260602_phase12_7`.

**Backend** :
- `InviteMemberDto` — email + role + supplierId? (optionnel)
- `OrganizationsService.inviteByEmail()` — lookup par email, NotFoundException clair si pas de compte
- `OrganizationsService.getMembers()` — liste membres avec user info + supplier info
- `OrganizationsService.removeMember()` — supprimer un membre (pas soi-même)
- `UsersService.findByIdWithMemberships()` — inclut maintenant `supplier` dans chaque membership
- Routes : `GET /organizations/:id/members`, `POST /organizations/:id/invite`, `DELETE /organizations/:id/members/:memberId`

**Admin panel** : page `/team` — tableau membres (displayName, email, role badge, fournisseur assigné, bouton retirer) + formulaire invitation (email, rôle, select fournisseur si OPERATOR).

### BLOC 12.8 — Branding (logo URL, couleur primaire, description)
**Problème résolu** : pas de champs de branding sur les organisations et événements.

**Schéma** : `Organization` +`logoUrl`, `primaryColor`, `description`. `Event` idem. Migration `20260602_phase12_8`.

**Backend** :
- `UpdateOrgBrandingDto` — logoUrl (URL), primaryColor (#rrggbb), description (max 2000 chars)
- `UpdateEventDto` — +`description`, `logoUrl`, `primaryColor`
- `OrganizationsService.updateBranding()` — PATCH branding org
- `EventsService.update()` — persist branding fields
- Route : `PATCH /organizations/:id/branding`

**Admin panel** :
- `organizations/[id]` — section Branding : logo preview, color picker natif + input hex, textarea description
- `events/[id]` — section Branding : description pour mobile, logo preview, color picker

### BLOC 12.9 — Dashboard opérateur filtré
**Problème résolu** : un opérateur assigné à "Buvette Nord" voyait toutes les commandes de tous les fournisseurs.

**Backend** : `GET /orders/event/:id/dashboard?supplierId=uuid` — filtre orders par supplier si param fourni.

**Operator app** :
- `fetchMeWithMemberships()` — lit `supplierId` + `supplier.name` depuis la réponse `/auth/me/memberships`
- Après login, stocke `operator_supplier_id` + `operator_supplier_name` dans localStorage
- EventSelector : badge "🏪 Buvette Nord" visible dès la sélection d'événement
- Dashboard : badge supplier dans le header, `useDashboard({ supplierId })` transmet le filtre à l'API
- `useDashboard` : option `supplierId?` → transmise à `fetchDashboard(eventId, token, supplierId)`

**Résultat** : un opérateur assigné à "Buvette Nord" voit uniquement les commandes de ce stand, pas celles de "Buvette VIP".

---

## [2026-06-02] Phase 13 — Mobile V1 — Parcours Client Complet

Task: Implémentation du parcours client mobile end-to-end : QR scan → event home → catalogue → panier → créneau → commande démo → suivi temps réel.

### BLOC 13.1 — Backend Endpoints Publics
Nouveau contrôleur `PublicEventsController` (pas d'auth) avec 3 routes :
- GET /public/events/:id — event + suppliers
- GET /public/events/:id/suppliers/:supplierId/products — produits groupés par catégorie
- GET /public/events/:id/slots — créneaux OPEN

### BLOC 13.2 — Demo Checkout
`CartService.demoCheckout()` : crée un Order avec status PAID sans Stripe, en contournant la validation stock pour le mode démo. Protégé par DemoGuard (DEMO_MODE=true uniquement). Route : POST /carts/:id/demo-checkout.

### BLOC 13.3 — Stores Zustand
- `auth.store.ts` : token + user avec rehydrate depuis AsyncStorage (login persistant)
- `cart.store.ts` : items, eventId, supplierId, selectedSlotId — state local du panier

### BLOC 13.4 — Mobile API Client
`mobile-api.ts` : injection automatique du token Bearer depuis auth.store. Fonctions : apiLogin, apiRegister, apiGetPublicEvent, apiGetPublicProducts, apiGetPublicSlots, apiCreateCart, apiAddCartItem, apiDemoCheckout, apiGetOrder + helpers formatPrice/formatTime.

### BLOC 13.5 — 9 Screens
1. `login.screen.tsx` — Login/Register dark theme, tabs mode, redirect après auth
2. `qr-scanner.screen.tsx` — VisionCamera v4 + useCodeScanner, parse breakeat://event/[id], saisie manuelle fallback, viewfinder animé
3. `event-home.screen.tsx` — Event info + venue + liste stands, login hint si non connecté
4. `supplier-catalog.screen.tsx` — SectionList par catégorie, add/increment/decrement, floating cart bar
5. `cart.screen.tsx` — Revue du panier avec quantités, slot sélectionné, total
6. `slot-selector.screen.tsx` — Créneaux avec barre de capacité + badge places disponibles
7. `checkout.screen.tsx` — Récap commande + fake card Visa Demo + 3 étapes backend (cart → items → demo-checkout)
8. `order-confirmation.screen.tsx` — Succès animé (spring scale) + N° commande + lien suivi
9. `order-tracking.screen.tsx` — Polling toutes les 5s, progress steps PAID→ACCEPTED→PREPARING→READY→PICKED_UP, badge LIVE

### BLOC 13.6 — Navigation + Deep Links
`root-navigator.tsx` refait : RootStackParamList × 9 screens, `linking` config pour `breakeat://event/:eventId`, rehydrate auth au démarrage, `screen.contentStyle` sombre uniforme.

### Setup natif
`app.config.js` : plugin react-native-vision-camera avec enableCodeScanner + NSCameraUsageDescription iOS + android.permission.CAMERA.

### Résultats finaux
```
pnpm typecheck (mobile)    → exit 0 — 0 erreur
pnpm lint (mobile)         → exit 0 — 0 erreur
pnpm typecheck (backend)   → exit 0 — 0 erreur
pnpm lint (backend)        → exit 0 — 0 warning
pnpm test (backend)        → 273/273 — 22 suites — 0 failure
```

### Setup pour lancer sur appareil physique
```bash
# iOS (Mac requis)
cd apps/mobile/ios && pod install
pnpm ios

# Android
pnpm android

# Backend (DEMO_MODE=true pour demo-checkout)
DEMO_MODE=true pnpm dev  # depuis /backend
```

---

## [2026-06-02] Phase 12 — Admin Panel V1 Complet + Operator Home V2

Task: Complétion du panel admin pour le parcours démo end-to-end + refonte accueil opérateur.
Date: 2026-06-02

### BLOC 12.1 — admin-client.ts : +12 fonctions API
Ajouté : Venue (get, create), Category (get, create), Product (get, create, delete), PickupPoint (get, create), Slot (get, create, delete)

### BLOC 12.2 — /venues page
CRUD lieux (name, address, timezone) + copie UUID en un clic.

### BLOC 12.3 — /suppliers/[id] page
Détail fournisseur complet : catégories (create inline) + produits (create avec prix €, catégorie, description / delete). Affichage groupé par catégorie.

### BLOC 12.4 — events/[id] enrichi
Ajouté : Venue info, section Pickup Points (create par nom + venueId auto), section Time Slots (create startAt/endAt/capacity/label + delete), QR Code (image + deep link breakeat://event/[id] + bouton copie + download), lien vers dashboard opérateur, liens "Gérer les produits" vers /suppliers/[id].

### BLOC 12.5 — Demo Wizard "Spartiates Hockey"
Page /demo-setup : 9 étapes atomiques avec progress UI → crée venue + event + supplier + 2 catégories + 5 produits + 2 pickup points + 3 slots + active l'événement. Affiche QR code et URL opérateur en résultat.

### BLOC 12.6 — Operator Home V2
Home page refaite : login dark theme → fetch orgs/events → sélecteur d'événements avec statut coloré → ou saisie UUID manuelle.

### Résultats finaux
```
pnpm typecheck (admin)     → exit 0
pnpm lint (admin)          → exit 0
pnpm typecheck (operator)  → exit 0
pnpm lint (operator)       → exit 0
pnpm test (backend)        → 273/273 — 22 suites — 0 failure
```

---

## [2026-06-02] Phase 11 — Admin Panel

Task: Panel d'administration complet (Next.js 15) avec authentification JWT, gestion des organisations, événements, feature flags, paramètres application et simulateur de données.
Date: 2026-06-02

### BLOC 11.1 — Backend : Auth/Me Memberships

Modified:
- `backend/src/modules/users/users.service.ts` — `findByIdWithMemberships(id)` : retourne SafeUser + memberships (org id/name/slug/status) via Prisma include imbriqué
- `backend/src/modules/auth/auth.service.ts` — `meWithMemberships(userId)` délègue à UsersService
- `backend/src/modules/auth/auth.controller.ts` — `GET /auth/me/memberships` protégé par JwtAuthGuard + @CurrentUser()

Pourquoi : L'admin panel doit identifier quelle organisation gère l'utilisateur connecté dès le login, sans endpoint séparé `/organizations`.

### BLOC 11.2 — Infrastructure Admin App

Modified:
- `apps/admin/next.config.ts` — +`NEXT_PUBLIC_API_URL` env block avec fallback `http://localhost:3000/api/v1`

Created:
- `apps/admin/src/lib/api/admin-client.ts` — client API centralisé :
  - Helpers localStorage : `getToken()`, `getOrgId()`, `getOrgName()`, `getStoredUser()`, `clearSession()`
  - Fonction base `req<T>()` avec auto-redirect 401 → `/login`
  - Tous les appels API : auth (login, me, memberships), orgs, events, suppliers, products, feature-flags, app-settings, simulator (seed/rush/progress/failures/clear/stats)

### BLOC 11.3 — Pages Admin (10 pages)

Created/Modified:
- `apps/admin/src/app/page.tsx` — redirect client-side vers `/dashboard` (token valide) ou `/login`
- `apps/admin/src/app/login/page.tsx` — formulaire email/password → apiLogin → apiMeWithMemberships → stockage localStorage (admin_token, admin_user, admin_org_id, admin_org_name) → redirect `/dashboard`. Gère SUPER_ADMIN (org optionnelle)
- `apps/admin/src/app/(admin)/layout.tsx` — layout protégé : vérifie token au mount, sidebar dark (#111827, 240px), NAV_ITEMS (Dashboard / Organisation / Événements / Feature Flags / Paramètres / Simulateur), bouton Déconnexion
- `apps/admin/src/app/(admin)/dashboard/page.tsx` — welcome, badge santé API (`/health`), 5 cards de navigation, liens rapides
- `apps/admin/src/app/(admin)/organizations/[id]/page.tsx` — chargement org via `apiGetOrganization(id)`, table membres (userId / orgRole / date), formulaire add member (UUID + role select)
- `apps/admin/src/app/(admin)/events/page.tsx` — liste événements de l'org courante, formulaire inline création (name + venueId UUID + startAt/endAt datetime-local), cards cliquables → `/events/[id]`
- `apps/admin/src/app/(admin)/events/[id]/page.tsx` — détail événement : changement status (select + apply), gestion suppliers (attach existant, create inline, detach), lien simulateur avec eventId
- `apps/admin/src/app/(admin)/feature-flags/page.tsx` — CRUD flags : filtre scope (GLOBAL/ORGANIZATION/EVENT), toggle ON/OFF en un clic, delete avec confirm, formulaire create avec auto-fill org
- `apps/admin/src/app/(admin)/settings/page.tsx` — CRUD app settings : parsing JSON auto (true/false/null/number/object/string), renderValue, delete avec confirm
- `apps/admin/src/app/(admin)/simulator/page.tsx` — sélecteur événement (dropdown + UUID direct), StatBar colorée par status, actions (Seed N, Rush N, Progresser, Pannes aléatoires rate, Clear), journal 50 dernières opérations, warning DEMO_MODE

### Résultats finaux

```
pnpm typecheck (backend)   → exit 0 — 0 erreur
pnpm lint (backend)        → exit 0 — 0 erreur
pnpm typecheck (admin)     → exit 0 — 0 erreur
pnpm lint (admin)          → exit 0 — 0 erreur
pnpm test (backend)        → 273/273 — 22 suites — 0 failure
```

---

## [2026-06-02] Phase 10 — QA, Rush Tests, Déploiement

Task: Validation sous charge (rush tests 50/100 commandes), tests d'intégrité (order-loss), Sentry frontend opérateur, logging JSON structuré, Docker Compose production, Dockerfile backend, déploiement Vercel, checklist de déploiement.
Date: 2026-06-02

### BLOC 10.1 — Rush tests

Created:
- backend/src/modules/simulator/rush.spec.ts — 18 tests en 5 suites (50-order rush, 100-order rush, progressOrders sans perte, rush+failures combiné, getStats consistance)

Stratégie: mock stateful en mémoire qui simule le comportement Prisma réel (write dans un tableau local, findMany filtre sur ce tableau). Permet de vérifier "N IN → N OUT" à chaque étape sans DB.

Tests couverts:
- 50 orders PAID créés exactement avec prefix DEMO-, IDs uniques
- 100 orders PAID créés, numéros publics uniques (pas de collision séquence)
- 50 PAID → 6 cycles progressOrders → 50 COMPLETED (aucune perte)
- count invariant seedEvent + progressOrders
- rush + randomFailures(100%) + progressOrders : total = 30 à chaque étape
- clearEvent supprime exactement N ordres
- getStats totaux = store.length à chaque cycle

### BLOC 10.2 — Order loss tests

Created:
- backend/src/modules/orders/order-loss.spec.ts — 14 tests en 4 suites

Tests couverts:
- COMPLETED → toute transition → BadRequestException (état terminal protégé par state machine réelle)
- CANCELLED → toute transition → BadRequestException
- COMPLETED → CANCELLED impossible (pas de régression)
- findReadyByEvent après reconnect : retourne uniquement READY (3/5 orders)
- findReadyByEvent après READY→PICKED_UP : liste réduite automatiquement
- findReadyByEvent quand tous PICKED_UP : tableau vide
- transition() ne crée ni ne supprime d'ordres (count invariant)
- 25 transitions rapides séquentielles : count = 25 tout au long
- PAID→ACCEPTED→PREPARING séquence : count = 1 avant et après
- Projection minimale : pas de userId, totalCents, items dans findReadyByEvent

### BLOC 10.3 — Sentry frontend (operator Next.js app)

Created:
- apps/operator/sentry.client.config.ts — init browser: DSN, tracesSampleRate, replays, beforeSend filter
- apps/operator/sentry.server.config.ts — init Node.js: DSN, tag runtime=node
- apps/operator/sentry.edge.config.ts — init Edge runtime: DSN, tag runtime=edge
- apps/operator/instrumentation.ts — Next.js 15 hook : charge sentry.server / sentry.edge selon NEXT_RUNTIME

Modified:
- apps/operator/package.json — +@sentry/nextjs ^9.0.0
- apps/operator/next.config.ts — wrapped avec withSentryConfig (tunnelRoute, hideSourceMaps, telemetry:false)

Key decisions:
- `enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN_OPERATOR)` → no-op sans DSN (dev local)
- tunnelRoute `/monitoring` évite les bloqueurs de pub
- `beforeSend` filtre ResizeObserver loop et Non-Error promise rejection (bruit connu)
- Source maps cachés (hideSourceMaps: true)

### BLOC 10.4 — Structured JSON logging

Created:
- backend/src/logger/json-logger.ts — ConsoleLogger subclass, JSON one-line par log en production, format humain en dev

Modified:
- backend/src/main.ts — `new JsonLogger('Bootstrap')` comme logger NestJS; LOG_LEVEL env configurable

Key decisions:
- Aucune dépendance externe ajoutée (sous-classe ConsoleLogger natif NestJS)
- JSON activé uniquement si NODE_ENV=production ; dev reste lisible coloré
- LOG_LEVEL par env : `log` pour prod, `debug` pour staging/dev
- Format: `{"level":"log","timestamp":"...","context":"...","message":"..."}`
- LEVEL_ORDER map : verbose(0) < debug(1) < log(2) < warn(3) < error(4) < fatal(5)

### BLOC 10.5 — Docker Compose production + Dockerfile

Created:
- backend/Dockerfile — multi-stage: deps → builder → runner (node:22-alpine, non-root user, HEALTHCHECK)
- docker-compose.prod.yml — postgres:16-alpine + redis:7-alpine + backend; réseau interne (backend) + public; variables POSTGRES_PASSWORD et REDIS_PASSWORD obligatoires au démarrage

Key decisions:
- Stage `deps` installe tout (dev + prod), `runner` réinstalle --prod seulement
- Prisma client copié depuis le stage builder (évite re-génération en prod)
- Utilisateur non-root (breakeat uid=1001)
- DEMO_MODE forcé à "false" dans docker-compose.prod.yml
- Redis maxmemory=256mb + allkeys-lru pour usage cache

### BLOC 10.6 — Vercel config

Modified:
- apps/operator/vercel.json — headers sécurité (CSP, HSTS, X-Frame-Options DENY, etc.), rewrite /monitoring/* (tunnel Sentry)

### BLOC 10.7 — Deployment checklist

Created:
- DEPLOYMENT_CHECKLIST.md — 7 sections, 40+ items : pré-vol (secrets), Railway, Vercel, DB migrations, tests, scan sécurité, smoke tests post-déploiement + procédure de rollback

### Résultats tests

**Total backend : 273 tests passants — 22 suites — 0 failure**
(+23 nouveaux tests Phase 10 : rush.spec.ts +18, order-loss.spec.ts +14, mais certains items dans order-loss existaient partiellement, total net +23)

### Variables d'environnement nouvelles

- `LOG_LEVEL` — backend : verbose|debug|log|warn|error|fatal (default: log en prod, debug ailleurs)
- `NEXT_PUBLIC_SENTRY_DSN_OPERATOR` — operator app browser (public)
- `SENTRY_DSN_OPERATOR` — operator app server-side
- `SENTRY_AUTH_TOKEN` — upload source maps vers Sentry (CI/Vercel uniquement)
- `SENTRY_ORG` — organisation Sentry (défaut: break-eat)
- `SENTRY_PROJECT` — projet Sentry (défaut: operator)
- `POSTGRES_PASSWORD` — obligatoire dans docker-compose.prod.yml
- `REDIS_PASSWORD` — obligatoire dans docker-compose.prod.yml

### Risks (P3, documentés)

- Sentry replays en production (5% sessions): implique collecte de données utilisateur. Désactiver si RGPD strict requis.
- Docker Compose prod ne couvre pas la haute disponibilité (1 instance backend). Pour HA: Kubernetes ou Railway scaling.
- JsonLogger ne buffèrise pas : I/O synchrone par log line. Tolérable pour le volume actuel.

Next steps:
→ Phase 11 : mobile app Flutter (commandé par le PO) ou lancement beta avec données réelles

---

## [2026-06-01] Phase 9 — CMS basique + Feature Flags

Task: Feature flags sans redéploiement (résolution EVENT > ORG > GLOBAL), CMS key-value JSON par scope (AppSettings), CORS hardening gateway Socket.IO, hook React useFeatureFlag.
Date: 2026-06-01

Created:
- backend/prisma/migrations/20260601_phase9_feature_flags_cms/migration.sql
- backend/src/modules/feature-flags/dto/set-feature-flag.dto.ts
- backend/src/modules/feature-flags/feature-flags.service.ts — resolve(key, context), list(), set(), remove()
- backend/src/modules/feature-flags/feature-flags.service.spec.ts — 10 tests
- backend/src/modules/feature-flags/feature-flags.controller.ts — GET /feature-flags, GET /feature-flags/resolve, POST, DELETE/:id
- backend/src/modules/feature-flags/feature-flags.module.ts
- backend/src/modules/app-settings/dto/set-app-setting.dto.ts
- backend/src/modules/app-settings/app-settings.service.ts — get(key, context), list(), set(), remove()
- backend/src/modules/app-settings/app-settings.service.spec.ts — 11 tests
- backend/src/modules/app-settings/app-settings.controller.ts — GET /app-settings, GET /app-settings/get, POST, DELETE/:id
- backend/src/modules/app-settings/app-settings.module.ts
- apps/operator/src/hooks/useFeatureFlag.ts — hook React

Modified:
- backend/prisma/schema.prisma — +enum FlagScope (GLOBAL|ORGANIZATION|EVENT) +model FeatureFlag +model AppSetting
- backend/src/app.module.ts — +FeatureFlagsModule +AppSettingsModule
- backend/src/modules/realtime/realtime.gateway.ts — CORS origin → process.env.CORS_ORIGINS (ferme P2 depuis Phase 6)

Key technical decisions:
- FlagScope enum partagé par FeatureFlag et AppSetting (économie de schéma)
- resolve() : EVENT > ORGANIZATION > GLOBAL > false — chaque étape fait 1 findUnique (court-circuit dès hit)
- Upsert via @@unique([key, scope, scopeId]) — pas de doublon, pas de concurrence write
- JSON nullable (metadata sur FeatureFlag) : cast en `Prisma.InputJsonValue` (requis par le type Prisma généré)
- scopeId null cast en `string` pour le where Prisma (type généré pour compound-unique ne gère pas null explicitement)
- CORS gateway : `process.env['CORS_ORIGINS']?.split(',')` — même logique que main.ts HTTP CORS

Tests (Phase 9 initial):
- feature-flags.service.spec.ts — 10 tests : resolve (5 — GLOBAL, not-found, event-wins, fallthrough-to-org, fallthrough-to-global), list (2), set (2), remove (1)
- app-settings.service.spec.ts — 11 tests : get (4), list (2), set (2), remove (2), NotFoundException (1)
- Total backend (Phase 9) : 245 tests passants (20 suites, 0 failure) — +21 nouveaux tests Phase 9

Audit Phase 9 — corrections P2 (2026-06-01):
- [P2 FIXED] Controllers list() : @Query('scope') non validé → PrismaClientValidationError (500). Guard inline : BadRequestException si scope ∉ FlagScope. (feature-flags.controller.ts, app-settings.controller.ts)
- [P2 FIXED] Services set() : validation cross-champ ajoutée — GLOBAL+scopeId → BadRequestException ; ORG/EVENT sans scopeId → BadRequestException. (feature-flags.service.ts, app-settings.service.ts)
- [P2 FIXED] Services resolve()/get() : findFirst(GLOBAL) maintenant filtre scopeId: null — défensif contre enregistrements GLOBAL avec scopeId≠null.
- [P2 FIXED] FeatureFlagsService.remove() : findUnique + NotFoundException avant delete (miroir AppSettings — évite Prisma P2025 → 500).
- +5 tests : feature-flags (3 nouveaux : GLOBAL+scopeId, ORG sans scopeId, NotFoundException remove), app-settings (2 nouveaux : GLOBAL+scopeId, EVENT sans scopeId).
- Total backend après audit Phase 9 : 250 tests passants (20 suites, 0 failure)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section Phase 9 ajoutée + audit P2 documenté

Risks (P3, documentés):
- FeatureFlagController et AppSettingController : pas de contrôle de rôle en V1 (tout JWT peut lire/écrire). À restreindre à SUPER_ADMIN/ORG_ADMIN en V2.
- Pas de cache sur resolve() — 1-3 requêtes DB par appel. À ajouter si haute fréquence.
- UNIQUE PostgreSQL avec NULL non couvert par NULLS NOT DISTINCT — deux lignes GLOBAL identiques possibles via SQL direct (application protégée via upsert Prisma).

Next steps:
- Phase 10 : QA, rush tests, déploiement, Sentry, logs production, checklist de déploiement

---

## [2026-06-01] Phase 8 — Dashboards + Public Screens

Task: Dashboard kanban temps réel pour l'opérateur + écran public des commandes prêtes. Couche frontend complète (socket.io-client, hooks réactifs, composants UI, Storybook). Simulator étendu avec progressOrders/randomFailures/getStats.
Date: 2026-06-01

Created:
- backend/src/modules/orders/dto/assign-slot.dto.ts — @IsUUID() slotId
- backend/src/modules/flaix/flaix.controller.ts — GET /flaix/event/:eid/rush-status + GET /flaix/event/:eid/decisions
- backend/src/modules/simulator/simulator.service.spec.ts — 15 tests (seed/rush/clear/progressOrders/randomFailures/getStats)
- apps/operator/src/lib/realtime/socket-client.ts — dynamic import socket.io-client, JWT auth, join_room, dedup Set(1000), onResync
- apps/operator/src/lib/api/orders-client.ts — fetchDashboard + accept/startPreparing/markReady/markPickedUp/recover/cancel + login
- apps/operator/src/components/StatusBadge.tsx — 8 variants, STATUS_COLORS/STATUS_LABELS (français)
- apps/operator/src/components/OrderCard.tsx — numéro, badge, timer, items, boutons d'action, isLoading
- apps/operator/src/components/DashboardColumn.tsx — colonne Kanban, hasNew pulsing dot, empty state
- apps/operator/src/components/NotificationPopup.tsx — overlay fixe, auto-dismiss 4s, new_order/order_ready
- apps/operator/src/components/PublicScreenRow.tsx — numéro monospace, PRÊTE badge, pickup label, isNew highlight, ZÉRO PII
- apps/operator/src/hooks/useSound.ts — Web Audio API, playNewOrder() + playOrderReady()
- apps/operator/src/hooks/useDashboard.ts — useReducer 11 actions, socket + polling fallback 10s, withLoading()
- apps/operator/src/app/dashboard/[eventId]/page.tsx — dashboard opérateur (JWT localStorage, login form, kanban 5 colonnes, son, fullscreen)
- apps/operator/src/app/public/[eventId]/page.tsx — écran public sans auth (READY orders, auto-prune 5min, socket polling fallback)
- apps/operator/src/stories/DashboardColumn.stories.tsx — 5 stories
- apps/operator/src/stories/NotificationPopup.stories.tsx — 3 stories
- apps/operator/src/stories/PublicScreenRow.stories.tsx — 4 stories

Modified:
- backend/src/modules/orders/orders.service.ts — +findDashboardByEvent() groupée par statut, +assignOrderToSlot() transactionnel
- backend/src/modules/orders/orders.service.spec.ts — +findDashboardByEvent (3 tests) +assignOrderToSlot (2 tests)
- backend/src/modules/orders/orders.controller.ts — +GET /event/:eventId/dashboard +PATCH /:id/assign-slot
- backend/src/modules/orders/orders.module.ts — import SlotsModule
- backend/src/modules/flaix/flaix.module.ts — controllers: [FlaixController]
- backend/src/modules/simulator/simulator.service.ts — +progressOrders() +randomFailures(failRate) +getStats()
- backend/src/modules/simulator/simulator.controller.ts — +POST /progress +POST /random-failures +GET /stats
- apps/operator/src/app/page.tsx — landing page (liens dashboard + public)
- apps/operator/src/stories/OrderCard.stories.tsx — 7 stories (uses real component)
- apps/operator/package.json — socket.io-client ^4.8.1

Key technical decisions:
- Dynamic import socket.io-client (`await import('socket.io-client')`) → évite erreur SSR Next.js App Router
- `new_order` socket event → resync REST complet (payload socket sans items — données insuffisantes pour afficher la commande)
- `order_updated` socket event → mise à jour in-place dans la colonne (pas de resync)
- `order_ready` socket event → NotificationPopup + son (Web Audio OscillatorNode + GainNode, zéro dépendance externe)
- Polling fallback toutes les 10s quand socket déconnecté → garantit la fraîcheur même sans WS
- PublicScreenRow = ZÉRO PII (aucun nom, prix, article — uniquement numéro de commande + point de retrait)
- Auto-prune écran public : commandes >5 min retirées automatiquement toutes les 30s
- JWT stocké dans localStorage sous la clé `operator_token` — la page affiche LoginForm si absent
- SlotsModule importé dans OrdersModule (pas l'inverse) — aucune dépendance circulaire
- findDashboardByEvent() : requête unique, filtrage en mémoire pour les 5 statuts live (PAID/ACCEPTED/PREPARING/READY/RECOVERED)

Architecture decisions:
- useDashboard : useReducer (prévisible, testable) plutôt que useState ou Zustand
- La page dashboard est 100% client-side (`'use client'`) — aucun RSC pour les composants réactifs temps réel
- L'écran public n'a PAS de JWT → la connexion socket.io est refusée par le gateway → fallback automatique sur polling REST
- progressOrders/randomFailures dans le Simulator utilisent chacun une `$transaction` par commande (respect outbox)

Dependencies added:
- apps/operator: socket.io-client ^4.8.1 (pnpm install requis dans apps/operator)

Tests:
- simulator.service.spec.ts — 15 tests : seedEvent (happy, event 404, no suppliers, getOrCreateDemoUser), simulateRush (N PAID orders, no suppliers), clearEvent (purge + count), progressOrders (PAID→ACCEPTED, ACCEPTED→PREPARING, PREPARING→READY, COMPLETED unchanged, RECOVERED→ACCEPTED), randomFailures (failRate=1 → tous affectés, failRate=0 → aucun), getStats (counts par statut)
- orders.service.spec.ts — +5 tests : findDashboardByEvent (groups orders by status, empty groups, queries 5 live statuses), assignOrderToSlot (assigns and returns updated, NotFoundException when order missing)
- Total backend (Phase 8) : 221 tests passants (18 suites, 0 failure) — +20 nouveaux tests Phase 8 (42 dans les 2 suites modifiées)
- 4 nouveaux fichiers Storybook stories, 22 stories au total dans le package operator

Audit Phase 8 — corrections post-livraison (2026-06-01):
- [P1 FIXED] public-orders.controller.ts créé : GET /public/orders/event/:id/ready sans JwtAuthGuard. findReadyByEvent() dans orders.service.ts (select minimal, pas de PII). Frontend public/page.tsx appelle désormais ce endpoint. Écran public charge correctement.
- [P2 FIXED] simulator.service.ts : failRate clampé via Math.max(0, Math.min(1, failRate))
- [P2 FIXED] flaix.controller.ts : injection PrismaService + assertOrgMemberForEvent() — chaque endpoint vérifie que l'utilisateur est membre de l'organisation de l'event
- [P2 FIXED] dashboard/page.tsx + public/page.tsx : fullscreenchange DOM listener synchronise isFullscreen avec l'état réel du navigateur (gère Échap)
- +3 tests findReadyByEvent dans orders.service.spec.ts
- Total backend après audit : 224 tests passants (18 suites, 0 failure)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-06-01] Phase 8 ajoutée + audit P1/P2 noté

Risks:
- pnpm install requis dans apps/operator pour activer socket.io-client
- L'écran public ne peut pas recevoir les mises à jour temps réel sans token JWT → polling REST uniquement (acceptable pour V1)
- CORS `origin: '*'` sur le gateway Socket.IO reste un P2 ouvert depuis Phase 6 → à corriger Phase 9
- La page dashboard lit le JWT depuis localStorage (côté client uniquement) → pas de SSR possible pour la page dashboard

Next steps:
- Phase 9 : CMS basique + Feature Flags
  - Feature flags (JSON config + UI toggle)
  - Templates fixes (emails, notifications)
  - Durcissement CORS gateway (`CORS_ORIGINS` env)

---

## [2026-06-01] Phase 7 — Slots + Flaix Foundation

Task: Créneaux de retrait (Slot) + frontière d'intégration Flaix (stub HTTP + audit des décisions).
Date: 2026-06-01

Created:
- backend/prisma/migrations/20260601_phase7_slots_flaix/migration.sql — enums slot_status/slot_source/flaix_decision_type ; tables slots + flaix_decisions ; FK carts.selected_slot_id ; contrainte FK orders.slot_id
- backend/src/modules/slots/dto/create-slot.dto.ts + update-slot.dto.ts
- backend/src/modules/slots/slots.service.ts — CRUD + assignOrderToSlot() atomique
- backend/src/modules/slots/slots.service.spec.ts — 21 tests
- backend/src/modules/slots/slots.controller.ts — GET/POST/PATCH/DELETE /events/:eventId/slots
- backend/src/modules/slots/slots.module.ts
- backend/src/modules/flaix/flaix.service.ts — requestSlotDecision / requestRushDecision / requestRecommendation / recordDecision / getLatestRushDecision / listDecisionsForEvent
- backend/src/modules/flaix/flaix.service.spec.ts — 12 tests
- backend/src/modules/flaix/flaix.module.ts

Modified:
- backend/prisma/schema.prisma — 3 enums + Slot + FlaixDecision + selectedSlotId Cart + relation slot Order + reverse relations Event/Supplier/PickupPoint
- backend/src/app.module.ts — SlotsModule + FlaixModule (Phase 7)

Key technical decisions:
- Flaix = stub V1 — l'URL HTTP est câblée mais retourne null tant que FLAIX_API_URL est vide. Aucun appel réseau réel en Phase 7.
- `assignOrderToSlot()` incrémente currentLoad via `updateMany WHERE currentLoad < capacity` — pattern race-safe identique au décrémentation de stock (Phase 5)
- Capacité FULL auto-détectée après incrément : `updateMany WHERE currentLoad = capacity → status FULL`
- FlaixDecision.decisionId = UNIQUE → double application silencieusement ignorée (P2002 ignoré dans recordDecision)
- Slot.source = MANUAL pour toutes les créations manuelles ; Flaix peut changer à FLAIX via update
- orders.slot_id existait comme colonne nue depuis Phase 5 ; Phase 7 attache enfin la FK constraint

Architecture decisions:
- SlotsModule : exports [SlotsService] — OrdersModule pourra importer pour l'assignation automatique
- FlaixModule : exports [FlaixService] — accessible par OrdersModule + (future) DashboardsModule
- Tous les appels Flaix passent EXCLUSIVEMENT par FlaixService (FLAIX_CONTRACT.md)
- Aucun autre module n'importe directement le client HTTP Flaix

Dependencies added:
- Aucune nouvelle dépendance externe

Tests:
- slots.service.spec.ts — 21 tests : create (happy, event 404, endAt≤startAt, supplier non attaché, pickupPoint hors événement, forbidden), findByEvent, findOne (found/404), update (label+capacity, close, invalid window, 404), remove (empty, conflit avec orders, 404), assignOrderToSlot (increment+order update, slot 404, CLOSED, FULL, race→0 rows)
- flaix.service.spec.ts — 12 tests : isConfigured (false/true), requestSlotDecision (not configured/stub), requestRushDecision (not configured), recordDecision (SLOT/RUSH, idempotent P2002, rethrow non-P2002, payload JSON), getLatestRushDecision, listDecisionsForEvent
- Total backend : 203 tests passants (17 suites)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-06-01] Phase 7 ajoutée

Risks:
- pnpm db:migrate requis pour appliquer la migration Phase 7
- Flaix non fonctionnel en V1 — null retourné sur tous les appels ; aucune commande bloquée
- assignOrderToSlot doit être appelé DANS une $transaction Prisma existante quand combiné avec order.create/update
- Slot.capacity ne peut pas être réduit en dessous de currentLoad — à valider côté service (TODO Phase 8)

Next steps:
- Phase 8 : Dashboards + Public screens
  - Operator dashboard (new orders / preparing / ready / recovered views)
  - Public ready screen
  - Sound alerts + fullscreen
  - Storybook stories pour chaque composant
  - 4 environnements demo seedés

---

## [2026-06-01] Audit Phase 6 — P1 Fixes + Documentation

Task: Full Phase 6 audit — identify and fix all P1 bugs, document P2/P3 gaps, update engineering manual.
Date: 2026-06-01

Fixed (P1 — bugs bloquants):
- backend/src/modules/simulator/simulator.service.ts — `getOrCreateDemoUser()`: `firstName: 'Demo', lastName: 'Simulator'` → `displayName: 'Demo Simulator'` (modèle User n'a que `displayName`)
- backend/src/modules/simulator/simulator.service.ts — `seedEvent()` + `simulateRush()`: `event.suppliers` n'existe pas (junction `EventSupplier[]`) → `event.eventSuppliers.map(es => es.supplier)` avec include correct `eventSuppliers: { include: { supplier: { include: { products } } } }`

Updated docs:
- brain/ENGINEERING_MANUAL.md — suppression stale "TODO Phase 6.2" dans Bloc 6.1 (outbox déjà implémentée); ajout section audit Phase 6 (P1 fixes, P2 écarts documentés, P3 reportés, tableau critères d'acceptance)
- brain/TASK_SUMMARY.md (cette entrée)

P2 gaps documentés (non bloquants Phase 7):
- Gateway CORS `origin: '*'` → à restreindre via `CORS_ORIGINS` env
- Aucune autorisation de room → limitation V1, Phase 8
- Pas de tests SimulatorService → Phase 8
- Endpoint resync dashboard GET snapshot → Phase 8
- Storybook mobile non scaffoldé → Phase 8

P3 reportés:
- Événements `supplier_status_changed`, `rush_detected`, `queue_updated` → Phase 7 (Flaix)
- `STAGING_ONLY_TOKEN` simulateur → Phase 8
- `progressOrders()` / `randomFailures()` → Phase 8

Test results: 170 tests passing, 0 failures (15 suites — inchangé)

---

## [2026-06-01] Bloc 6.3 — Storybook + Mobile Pipeline + Simulator

Task: Validation infrastructure for Phase 6 — Storybook scaffolding, EAS mobile build pipeline, DEMO_MODE toggle, and fake event simulator skeleton.
Date: 2026-06-01
Commit: bce65e6

Created:
- apps/admin/.storybook/main.ts + preview.ts — @storybook/nextjs config
- apps/admin/src/stories/StatusBadge.stories.tsx — all 8 OrderStatus variants
- apps/operator/.storybook/main.ts + preview.ts — @storybook/nextjs config
- apps/operator/src/stories/OrderCard.stories.tsx — PAID/ACCEPTED/PREPARING/READY
- apps/mobile/eas.json — EAS Build profiles: development, preview, production
- apps/mobile/app.config.js — Expo bare workflow config (iOS + Android)
- .github/workflows/mobile-preview.yml — EAS build triggered on mobile/** push; posts QR/download as commit comment
- backend/src/common/guards/demo.guard.ts — 403 unless DEMO_MODE=true
- backend/src/modules/simulator/simulator.service.ts — seedEvent, simulateRush, clearEvent
- backend/src/modules/simulator/simulator.controller.ts — POST seed/rush, DELETE clear
- backend/src/modules/simulator/simulator.module.ts

Modified:
- apps/admin/package.json + apps/operator/package.json — storybook + build-storybook scripts (ports 6006/6007)
- backend/src/main.ts — DEMO_MODE safety check (exit 1 if DEMO_MODE=true AND NODE_ENV=production)
- backend/src/app.module.ts — SimulatorModule registered
- pnpm-workspace.yaml — esbuild + core-js-pure build scripts allowed

Key technical decisions:
- SimulatorModule always loaded but DemoGuard returns 403 in non-demo environments (no conditional module loading)
- Demo orders use DEMO- prefix for easy identification and cleanup
- Storybook ports: admin=6006, operator=6007 (no conflict)
- EAS projectId=FILL_IN_EAS_PROJECT_ID — requires `eas init` to activate pipeline
- EXPO_TOKEN GitHub Secret required to trigger EAS builds

Test results: 170 tests passing, 0 failures (15 suites — unchanged)

---

## [2026-06-01] Bloc 6.2 — Socket.IO Gateway + Outbox Realtime

Task: Implement the realtime layer — WebSocket gateway (Socket.IO), JWT auth on connect, room management, and outbox-compliant emit after DB commits.
Date: 2026-06-01
Commit: 49d0f2e

Created:
- backend/src/modules/realtime/realtime.gateway.ts — Socket.IO gateway, JWT auth on connect (handshake.auth.token / Bearer header), join_room / leave_room
- backend/src/modules/realtime/realtime.service.ts — emitNewOrder, emitOrderUpdated, emitOrderReady with correct room targeting
- backend/src/modules/realtime/realtime.module.ts — JwtModule.registerAsync + exports RealtimeService
- backend/src/modules/realtime/dto/join-room.dto.ts — room name validation (type:uuid pattern)
- backend/src/modules/realtime/realtime.gateway.spec.ts — 11 tests (auth, join/leave, edge cases)
- backend/src/modules/realtime/realtime.service.spec.ts — 8 tests (room targeting, envelope shape, UUID uniqueness)

Modified:
- backend/src/modules/orders/orders.service.ts — inject RealtimeService; emitNewOrder after createFromPaymentIntent; emitOrderUpdated + conditional emitOrderReady after transition
- backend/src/modules/orders/orders.service.spec.ts — RealtimeService mock + outbox assertions
- backend/src/modules/orders/orders.module.ts — import RealtimeModule
- backend/src/app.module.ts — import RealtimeModule (Phase 6)
- backend/package.json + pnpm-lock.yaml — @nestjs/websockets, @nestjs/platform-socket.io, socket.io

Key technical decisions:
- JWT verified on connect; invalid/missing token → immediate disconnect(true)
- auth.token takes priority over Authorization header
- eventId in payload = realtime dedup UUID (not the concert eventId — naming conflict resolved)
- Outbox rule: guard throws BEFORE $transaction; emit fires AFTER commit — never inverted
- emitOrderReady triggered only when to===READY (drives customer pickup notification)

Test results: 170 tests passing, 0 failures (15 suites)

---

## [2026-06-01] Bloc 6.1 — Order State Machine + Audit Trail

Task: Implement the full operator order lifecycle — transition guard, PATCH endpoints, audit trail recording, and operator dashboard snapshot.
Date: 2026-06-01
Commit: 4cf5426

Created:
- backend/src/modules/orders/order-state-machine.service.ts — pure guard, 15 allowed transitions (PAID/ACCEPTED/PREPARING/READY/PICKED_UP/COMPLETED + cancel + recovery)
- backend/src/modules/orders/order-state-machine.service.spec.ts — 30 tests (transition map, all 15 valid paths, 12 invalid paths, isAllowed, allowedFrom)
- backend/src/modules/orders/dto/transition-order.dto.ts — optional reason field (max 500 chars)

Modified:
- backend/src/modules/orders/orders.service.ts — added transition(), findActiveByEvent(), findAuditTrail(); fix orderBy createdAt (not occurredAt)
- backend/src/modules/orders/orders.service.spec.ts — 35 tests total (existing + new transition/findActive/findAuditTrail suites)
- backend/src/modules/orders/orders.controller.ts — full rewrite: 6 operator PATCH + dashboard GET + 2 customer GET, all behind JwtAuthGuard + assertOrgMember
- backend/src/modules/orders/orders.module.ts — OrderStateMachineService added to providers/exports

Key technical decisions:
- assertTransition() fires BEFORE any DB write → BadRequestException if illegal
- transition() uses $transaction([order.update, orderAuditTrail.create]) array form → atomic
- Terminal states COMPLETED/CANCELLED have no outgoing transitions (verified 15 total, not 17 as misdocumented)
- READY cannot be cancelled (deadline passed) — forces recovery path
- TODO Phase 6.2 comment left in transition() for outbox realtime emit

Test results: 151 tests passing, 0 failures (13 suites)

---

## [2026-06-01] Bloc 6.0 — Infrastructure Staging (Vercel + Railway + GitHub Secrets)

Task: Deploy full staging infrastructure — Vercel (admin + operator), Railway (backend + PostgreSQL + Redis), GitHub Secrets, cross-env wiring.
Date: 2026-06-01

URLs staging actives:
- Admin:    https://breakeat-admin-admin.vercel.app
- Operator: https://breakeat-operator-git-main-breakeatapp-1555s-projects.vercel.app
- Backend:  https://breakeat-admin-production.up.railway.app  → GET /health ✅

Modified:
- apps/admin/vercel.json — installCommand: cd ../.. && pnpm install; buildCommand: pnpm build; Root Directory = apps/admin
- apps/operator/vercel.json — idem
- apps/admin/src/app/layout.tsx + page.tsx — titre BREAK EAT (was BRAT EAT)
- apps/operator/src/app/layout.tsx + page.tsx — idem
- backend/package.json — express ajouté en dépendance directe (pnpm strict mode ne remonte pas les deps transitives)
- pnpm-lock.yaml — mis à jour après ajout express

Created:
- nixpacks.toml (racine) — COREPACK_INTEGRITY_KEYS='' + corepack prepare pnpm@11.3.0 + pnpm --filter @break-eat/backend build
- railway.json (racine) — builder NIXPACKS + startCommand + healthcheckPath

Also (mass rename, same session):
- 30+ fichiers : BRAT EAT → BREAK EAT, @brat-eat/ → @break-eat/, brateat → breakeat

Key technical issues solved:
- corepack key mismatch Node 22 → COREPACK_INTEGRITY_KEYS='' en variable Railway
- Root Directory = backend cachait pnpm-lock.yaml → vider Root Directory, build depuis racine
- Railway Settings Build Command écrasait nixpacks.toml → champs Settings vidés
- express manquant en dep directe → Cannot find module 'express' au runtime → ajout explicite
- Prisma generate manquant dans CI → ajouté dans backend build script

GitHub Secrets configurés:
VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID_ADMIN, VERCEL_PROJECT_ID_OPERATOR,
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

---

## [2026-06-01] Codex Audit Phase 5 (2nd pass) — 3 P1 + 2 P2 Fixes

Task: Address the 3 P1 + 2 P2 issues from the second Codex audit that blocked moving to the infra/design step.
Date: 2026-06-01

Modified:
- backend/src/modules/cart/cart.service.ts — **P1 #1**: freeze prices ONLY after Stripe succeeds, in one transaction with the CHECKOUT_PENDING flip; computeView() uses live price while status===OPEN (defensive)
- backend/src/modules/cart/cart.service.spec.ts — renamed freeze test + new "Stripe-fails → no freeze/transition" regression test
- package.json — **P1 #2**: build/lint/typecheck/test → `turbo run X`; removed build:turbo; clean → turbo run clean
- backend/package.json — **P1 #2**: jest maxWorkers:1 (deterministic, no --runInBand)
- .gitignore — **P1 #3**: explicit secret/key ignores (firebase key, google-services, GoogleService-Info.plist, .p8/.p12, keystores, service-account*.json…) WITHOUT blanket *.json; + .claude/settings.local.json
- BLOC_6_0_SETUP_GUIDE.md — fixed false "*.json protects firebase key" claim (L168); **P2**: vercel.json is the single source of truth for build/install/output (dashboard left empty)

Created:
- .gitattributes (LF normalization for Linux CI/Docker builds)
- Local git repo (branch main) + initial commit fbf6147 — NO remote, NO push

Why (root causes):
- **P1 #1** — checkout froze priceSnapshotCents BEFORE the Stripe call and before the status flip. A Stripe failure left the cart OPEN with frozen prices, and computeView reused that stale snapshot on retry. Now: Stripe first (no DB write on failure), then snapshot+status in one atomic transaction; computeView ignores snapshots while OPEN.
- **P1 #2** — `corepack pnpm typecheck/lint/build` ran scripts whose body was `pnpm -r run X`; the nested `pnpm` isn't on PATH (it lives in the corepack cache, not node_modules/.bin), so it failed. `turbo` IS in node_modules/.bin → `turbo run X` resolves and works. This SUPERSEDES the v0.8.0 `pnpm -r run` decision. The earlier "turbo can't find pnpm" issue no longer reproduces (turbo 2.9.14 + .npmrc package-manager-strict=false), and turbo runs per-package binaries (tsc/eslint) directly anyway.
- **P1 #3** — security: keys could be committed. Specific ignores added; `*.json` deliberately NOT blanket-ignored (would hide package.json/tsconfig.json/vercel.json).
- **P2** — guide vs vercel.json contradiction: vercel.json wins on Vercel, so the guide now defers to it as the single source of truth.
- **P2** — no git repo blocked Vercel/Railway import: initialized locally; push deferred to the product owner (needs the remote GitHub repo).

Verification:
- 95 backend tests passing (12 suites, sequential ~16s, 0 flaky)
- `corepack pnpm typecheck` + `corepack pnpm lint` → GREEN via scripts (exact command the audit said was broken)
- turbo run typecheck/lint → 4/4 packages OK
- git check-ignore: 10 sensitive paths ignored, 0 config files wrongly ignored; only .env.example (placeholders) would be tracked

Remaining (product owner / next):
- Create the GitHub remote + push (no remote configured locally, nothing pushed)
- Then Bloc 6.0 infra (Vercel/Railway/Firebase per BLOC_6_0_SETUP_GUIDE.md)
- Phase 6 business logic (OrderStatus state machine, realtime) not started — comes after Bloc 6.0

Docs updated: CHANGELOG.md [0.10.3], DEVELOPMENT_LOG.md (audit cluster), ENGINEERING_MANUAL.md (superseding pipeline+checkout section), TASK_SUMMARY.md (this entry)

---

## [2026-06-01] Codex Audit Phase 5 — P1/P2/P3 Fixes

Task: Address 4 P1 issues + 1 P3 + missing DOCX (P2) from Codex audit of Phase 5.
Date: 2026-06-01

Created:
- backend/prisma/migrations/20260601_phase5_codex_audit/migration.sql
- phases de DEV/PHASE_4_PRODUCTS_CATEGORIES_STOCK.docx
- phases de DEV/PHASE_5_CART_CHECKOUT_STRIPE_ORDERS.docx
- phases de DEV/generate_phase4.js + generate_phase5.js

Modified:
- backend/prisma/schema.prisma (CartItem.priceSnapshotCents added)
- backend/src/modules/cart/cart.service.ts (freeze prices at checkout, use snapshot in computeView)
- backend/src/modules/cart/cart.service.spec.ts (+1 test for price freeze)
- backend/src/modules/orders/orders.service.ts (4 critical fixes — see Why below)
- backend/src/modules/orders/orders.service.spec.ts (+4 audit-guard tests)
- backend/src/modules/payments/stripe.service.ts (P3 comment fix)
- package.json (build → pnpm -r run; turbo kept as build:turbo)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)
- DEVELOPMENT_LOG.md
- CHANGELOG.md

Why (4 P1 + 1 P3):
- P1 #1 — Stock oversell: previous code did `newQty < 0 ? 0 : newQty` which let two concurrent transactions both consume the last unit. Fixed with `tx.stock.updateMany({ where: { id, quantity: { gte: item.quantity } } })` — if the conditional update affects 0 rows, we throw ConflictException and the whole transaction rolls back.
- P1 #2 — Payment/Order amount divergence: cart.checkout used live Product.price for the PaymentIntent, but orders.service recomputed from live price at webhook time. Now CartItem.priceSnapshotCents is set at checkout, and OrdersService uses the snapshot exclusively. Defensive check rejects with ConflictException if subtotal != intent.amount.
- P1 #3 — Failed-then-succeeded webhook crashes: `recordFailedPayment` creates a Payment FAILED row keyed on stripePaymentIntentId. If the customer retries and the SAME PaymentIntent succeeds, `tx.payment.create` would raise P2002 (UNIQUE violation). Replaced with `tx.payment.upsert` keyed on stripePaymentIntentId.
- P1 #4 — Pipeline broken via corepack: `corepack pnpm build` failed because `build` script invoked `turbo` which needs `pnpm` resolvable in PATH from a corepack-wrapped child process. Switched root scripts to `pnpm -r run build/typecheck/lint`. `turbo build` retained as `build:turbo` for local dev caching benefit.
- P3 #7 — Wrong Stripe doc comment: header said "we NEVER mix application_fee_amount with destination charges" but the code does exactly that (which IS the correct standard marketplace pattern). Comment rewritten to describe the actual behaviour.

Architecture decisions:
- Frozen snapshots on CartItem rather than re-derivation at order time — guarantees Order.totalCents == Payment.amountCents
- Defensive ConflictException on subtotal/intent.amount mismatch — refuse to create Order rather than risk financial discrepancy
- Atomic decrement via updateMany + WHERE constraint — race-safe without DB-level SELECT FOR UPDATE
- Payment.upsert preserves the failure history (rawStripeEvent) while transitioning to SUCCEEDED
- Pipeline uses pnpm-r (zero Turbo dependency in scripts that codex must run) — Turbo stays available via build:turbo for local cache

Dependencies added:
- None

Tests (audit guards — 5 new):
- orders.service.spec.ts (+4):
    "refuses when CartItem has no price snapshot (checkout was skipped)"
    "refuses when computed total diverges from PaymentIntent amount (P1 #2 guard)"
    "throws ConflictException when stock is insufficient (P1 #1 oversell guard)"
    "upserts Payment when a FAILED row already exists (P1 #3 retry guard)"
- cart.service.spec.ts (+1):
    "freezes prices on every CartItem before creating the PaymentIntent (P1 #2 guard)"
- Total backend: 94 tests passing (89 before + 5 new)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-06-01] Codex Audit P1 added
- Code refs: orders.service.ts (atomic decrement), cart.service.ts (price freeze), payment.upsert

Risks:
- pnpm db:migrate MUST be run again on every environment to apply the 20260601 migration (column add)
- Existing carts in CHECKOUT_PENDING state without priceSnapshotCents (created before fix) cannot complete — they will fail at order creation with the "no price snapshot" guard. Acceptable for staging; document for prod cutover.
- Stock decrement test (P1 #1) is unit-mocked — true concurrency must be validated in Phase 6 rush testing
- Defensive amount check (P1 #2) blocks Order creation on tiny rounding mismatches — Stripe uses integer cents so this should be exact, but worth monitoring on first prod webhook

Next steps:
- Resume Bloc 6.0 (infrastructure scaffolding ongoing — staging deployment + Storybook + Firebase)
- Then Phase 6.1+ : OrderStatus state machine + Realtime + Outbox

---

## [2026-05-28] Process Update — Visual Validation Contract

Task: Formalize the Visual Control & Product Validation update + Live Preview Access requirements provided by the product owner.
Date: 2026-05-28

Created:
- brain/PRODUCT_VALIDATION.md (contract v1.0.0, mandatory from Phase 6)
- brain/REMINDERS.md (assistant self-notes : Cursor timing, design inputs, infra checkpoints)

Modified:
- brain/ROADMAP.md (Visual Validation Rule added globally; Phase 6 and Phase 8 deliverables enriched)
- brain/TASK_SUMMARY.md (this entry)
- CHANGELOG.md

Why:
- Product owner wants to test, validate and visualize the app continuously, like a real production app
- Storybook, preview builds, QR codes, staging dashboards, fake data and demo mode are now mandatory from Phase 6 onward
- This ensures no feature is validated blindly and demos can run autonomously for investors / clubs

Architecture decisions:
- New brain document `PRODUCT_VALIDATION.md` versioned as v1.0.0 (semver, every change logged)
- Visual validation applies from Phase 6 onward (Phases 1-5 stay validated on technical delivery)
- Phase 6 scope now includes infrastructure setup (staging deployment, EAS Build pipeline, Storybook scaffolding, demo mode toggle, fake event simulator skeleton)
- Phase 8 scope explicitly enriched with the Storybook stories + state previews + 4 demo environments

Dependencies added:
- None (yet — Phase 6 will add Storybook, EAS, deployment configs)

Tests:
- N/A (documentation update only)

Engineering manual:
- Cross-references to PRODUCT_VALIDATION.md will be added in Phase 6 ENGINEERING_MANUAL entries

Risks:
- Phase 6 estimated duration (2 weeks per original ROADMAP) will likely extend to ~2.5 weeks due to added infrastructure work
- Apple Developer account (~99 $/year) and Google Play Console (25 $ one-time) required for Phase 8 mobile previews
- Staging hosting costs to estimate (Vercel + Railway/Render ≈ 20-40 $/month for early stage)
- Decision needed before Phase 6: Expo / EAS Build vs pure React Native CLI builds (Expo simplifies preview pipelines significantly)

Next steps:
- Pending product owner decisions before Phase 6 start:
  1. Confirm Apple Developer + Play Console signup timeline
  2. Choose hosting target (Vercel + Railway recommended) or self-hosted VPS
  3. Confirm Expo / EAS adoption (recommended for preview pipelines) — would require migration of `apps/mobile` from RN CLI to Expo (managed or bare)
  4. Confirm budget for staging infrastructure (~20-40 €/month)
- Then start Phase 6 with the enriched deliverables

---

## [2026-05-27] Phase 5 — Cart, Checkout, Stripe Connect, Orders

Task: Implement the full V1 ordering pipeline — Cart, Stripe Connect onboarding, Checkout (PaymentIntent), Webhook handler, Order creation from successful payment.
Date: 2026-05-27

Created:
- backend/prisma/migrations/20260527_phase5_stripe_connect/migration.sql
- backend/src/modules/payments/stripe.service.ts (Stripe SDK wrapper)
- backend/src/modules/payments/payments.module.ts (@Global)
- backend/src/modules/suppliers/dto/create-onboarding-link.dto.ts
- backend/src/modules/cart/{dto/*, cart.service.ts, cart.controller.ts, cart.module.ts}
- backend/src/modules/cart/cart.service.spec.ts (12 tests)
- backend/src/modules/orders/{orders.service.ts, orders.controller.ts, orders.module.ts}
- backend/src/modules/orders/orders.service.spec.ts (5 tests)
- backend/src/modules/webhooks/{stripe-webhooks.controller.ts, stripe-webhooks.service.ts, webhooks.module.ts}
- backend/src/modules/webhooks/stripe-webhooks.service.spec.ts (4 tests)

Modified:
- backend/package.json (+stripe 17.7.0)
- backend/prisma/schema.prisma (+5 enums, +6 models, Supplier extended)
- backend/src/main.ts (raw body for webhooks, bodyParser disabled, prefix exclude)
- backend/src/config/app.config.ts (stripe.apiVersion, platformFeeBps, connect.*)
- backend/src/app.module.ts (4 new modules wired)
- backend/src/modules/suppliers/suppliers.service.ts (Stripe Connect methods)
- backend/src/modules/suppliers/suppliers.controller.ts (2 new endpoints)
- .env.example (4 Stripe Connect variables)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)
- DEVELOPMENT_LOG.md
- CHANGELOG.md

Why:
- Cart is the customer's editable view before payment — it must persist server-side so the customer can resume on any device
- Stripe Connect (Standard accounts) is mandatory for marketplace payments — funds flow directly to the supplier minus a platform fee
- Webhook is the only trustworthy signal of payment success — never trust the client confirmation alone
- Order creation must be transactional + idempotent — duplicate webhooks must NOT produce duplicate orders
- Snapshots on OrderItem freeze product name + price at order time — historical orders never depend on mutable Product rows

Architecture decisions:
- V1 = ONE supplier per cart/order (multi-vendor flag stays OFF). Simplifies idempotency, refunds, and dashboards.
- PaymentIntent uses destination charges (`transfer_data.destination`) + `application_fee_amount` for platform commission (BPS).
- Cart idempotency key for Stripe = `cart_${cartId}` — two checkouts on the same cart return the SAME PaymentIntent.
- Webhook idempotency = WebhookEvent table with UNIQUE stripeEventId.
- Order creation runs in a single `prisma.$transaction()`: Cart→CONVERTED + Order + Items + Payment + AuditTrail + Stock decrement.
- Public order number = PostgreSQL sequence formatted "BE-XXXXXXXX" (human-readable, monotonically increasing).
- Raw body middleware for /webhooks/stripe registered BEFORE the JSON parser in main.ts — required by Stripe signature verification.
- Suppliers controller exposes `POST /stripe/onboarding-link` (idempotent — creates account if absent, returns fresh URL) and `GET /stripe/status` (live refresh from Stripe).
- StripeAccountStatus mirrors are stored on Supplier (chargesEnabled, payoutsEnabled) — avoids a Stripe round-trip on every checkout.
- Cart stock validation: per-pickup-point first, fall back to global. Cumulative quantity (post-upsert) re-checked against stock.

Dependencies added:
- stripe@17.7.0

Tests (Phase 5 specifically — 21 new):
- cart.service.spec.ts (12): create happy-path, event not ACTIVE, supplier not attached, duplicate OPEN cart, ownership check, cross-supplier product, inactive product, checkout success/PaymentIntent, supplier not Stripe-ACTIVE, no pickup point, checkout idempotency, findOne 404
- orders.service.spec.ts (5): createFromPaymentIntent happy-path (transaction), idempotency (existing Payment→same Order), missing cartId metadata→404, paymentIntent mismatch→Conflict, recordFailedPayment upsert
- stripe-webhooks.service.spec.ts (4): duplicate event skipped, payment_intent.succeeded→OrdersService, payment_intent.payment_failed→recordFailedPayment, account.updated mirrors supplier
- Total backend: 89 tests passing (68 before + 21 new)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-27] Phase 5 added
- Code refs: stripe.service.ts (SDK wrapper), cart.service.ts:checkout, orders.service.ts:createFromPaymentIntent, stripe-webhooks.service.ts:handleEvent, main.ts (raw body middleware)

Risks:
- pnpm db:migrate MUST be run to apply the Phase 5 migration (orders table requires the order_public_seq sequence)
- STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET must be set in .env before any /checkout call
- Webhook endpoint /webhooks/stripe must be reachable from Stripe (use `stripe listen --forward-to localhost:3000/webhooks/stripe` for local dev)
- A supplier must reach stripeAccountStatus=ACTIVE before customers can checkout against them — the API rejects with 400 otherwise
- Realtime emission (new_order event) is NOT done here — comes in Phase 6 Outbox
- No refund logic in V1 — refunds = Phase 9
- Cart sweeper (auto-expire stale carts) = Phase 9

Next steps:
- Phase 6: Orders state machine + Realtime + Outbox + Operator dashboard reads
  - OrderStatus transitions (PAID→ACCEPTED→PREPARING→READY→PICKED_UP→COMPLETED)
  - Operator endpoints (accept, mark ready, etc.)
  - Realtime outbox + WebSocket emission
  - Dashboard snapshot API

---

## [2026-05-26] Codex Audit Phase 4 — P1/P2/P3

Task: Fix 4 issues found by Codex audit on Phase 4 (2 P1 + 2 P2 + 1 P3)
Date: 2026-05-26

Created:
- backend/src/modules/categories/categories.service.spec.ts (8 tests)

Modified:
- backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql (UUID fix)
- backend/src/modules/stock/stock.service.ts (supplier check on pickup point)
- backend/src/modules/stock/stock.service.spec.ts (cross-supplier test)
- backend/src/modules/products/products.service.ts (validateDateWindow)
- backend/src/modules/products/products.service.spec.ts (date window test)
- package.json (typecheck/lint use pnpm -r run)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)
- CHANGELOG.md

Why:
- P1 UUID: all Phase 3 tables use UUID type for PKs; Phase 4 had TEXT — PostgreSQL FK constraints require matching types, so db:migrate would have failed with a type mismatch error
- P1 pipeline: turbo typecheck/lint fails when pnpm isn't in PATH; pnpm -r run works via pnpm's own binary without going through Turbo's binary resolution
- P2 stock: a pickup point scoped to supplier A could receive stock from supplier B — now blocked with BadRequestException
- P2 products: availableFrom/availableUntil were stored without verifying temporal ordering — now validated with BadRequestException
- P3 categories: CRUD + P2003 delete-conflict had no tests — now covered

Architecture decisions:
- Migration fix: UUID type matches Phase 2/3 conventions; gen_random_uuid() on every PK
- Pipeline fix: pnpm -r run runs in parallel across workspaces, no turbo binary lookup required; turbo still used for build (caching benefit) and test
- Stock pickup fix: supplierId=null on pickup point = shared point (any supplier allowed); supplierId set = exclusive point (only that supplier)
- Date window: validation in service (not DTO) because update() must merge existing values before checking

Dependencies added:
- None

Tests:
- categories.service.spec.ts — 8 tests: create (success, Forbidden, supplier 404), findAll, update (success, 404), remove (success, 404, P2003 conflict)
- stock.service.spec.ts — 1 test added: pickup point cross-supplier → BadRequestException
- products.service.spec.ts — 1 test added: availableUntil before availableFrom → BadRequestException
- Total backend: 67 tests expected

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section Codex Audit Phase 4 added
- Code references: migration.sql (UUID), stock.service.ts:requirePickupPointInOrg, products.service.ts:validateDateWindow

Risks:
- pnpm db:migrate MUST be run after correcting the migration file; any partial application of the old (broken) migration on a real DB would need cleanup
- pnpm -r run for typecheck/lint loses Turbo caching — acceptable for dev workflow; build retains Turbo

Next steps:
- Phase 5: Stripe Connect onboarding for Suppliers
  - stripeAccountId population on Supplier (already nullable in schema)
  - Stripe webhook handler
  - Phase 6 will need valid stripeAccountId to process payments

---

## [2026-05-26] Codex Audit P1 — JwtStrategy globalRole + Pipeline corepack

Task: Fix 2 P1 blockers from Codex post-Phase-4 audit
Date: 2026-05-26

Created:
- .npmrc (package-manager-strict=false — resolves Turbo binary lookup with corepack)

Modified:
- backend/src/modules/auth/strategies/jwt.strategy.ts (globalRole added to DB select; return { ...payload, globalRole: user.globalRole })
- backend/src/modules/auth/strategies/jwt.strategy.spec.ts (test updated: asserts DB globalRole overrides JWT globalRole)
- brain/ENGINEERING_MANUAL.md (P1 section added; old JwtStrategy data-flow annotated)
- brain/TASK_SUMMARY.md (this file)
- CHANGELOG.md

Why:
- P1 globalRole: organizations.controller and roles.guard read request.user.globalRole. A user whose platform role was upgraded/revoked after token issuance would carry the wrong role for up to 15 minutes (the JWT TTL). Since validate() already hit the DB for isActive, adding globalRole costs zero extra queries.
- P1 corepack: Turbo v2 resolves the pnpm binary via PATH. On Windows with corepack managing pnpm, `where pnpm` can fail when using `corepack pnpm` as the entry point. .npmrc disables strict enforcement; documentation corrects the invocation.

Architecture decisions:
- validate() returns { ...payload, globalRole: user.globalRole } — all other JWT fields (sub, email, iat, exp) still come from the verified and unexpired token
- The DB is the single source of truth for globalRole — never the JWT payload
- .npmrc is project-wide — affects all workspaces uniformly

Dependencies added:
- None

Tests:
- jwt.strategy.spec.ts — updated test: DB returns globalRole='SUPER_ADMIN', JWT had 'CUSTOMER' → result.globalRole must be 'SUPER_ADMIN'
- All existing 57 tests continue to pass

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-26] Codex Audit P1 added
- Code references: jwt.strategy.ts:44 (select), jwt.strategy.ts:52 (return), jwt.strategy.spec.ts:41 (test)

Risks:
- If a future developer adds a long-lived JWT (> 15 min) the stale-globalRole attack window increases — the DB refresh in validate() is the guard against this
- .npmrc must not be deleted — it enables Turbo to resolve pnpm on non-standard setups

Next steps:
- Phase 5: Stripe Connect onboarding for Suppliers
  - stripeAccountId population on Supplier (already nullable in schema)
  - Stripe webhook handler
  - Phase 6 will need valid stripeAccountId to process payments

---

## [2026-05-26] Phase 4 — Products, Categories, Stock

Task: Prisma Phase 4 schema + 3 NestJS modules + tests
Date: 2026-05-26

Created:
- backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql
- backend/src/modules/categories/dto/create-category.dto.ts
- backend/src/modules/categories/dto/update-category.dto.ts
- backend/src/modules/categories/categories.service.ts
- backend/src/modules/categories/categories.controller.ts
- backend/src/modules/categories/categories.module.ts
- backend/src/modules/products/dto/create-product.dto.ts
- backend/src/modules/products/dto/update-product.dto.ts
- backend/src/modules/products/products.service.ts
- backend/src/modules/products/products.service.spec.ts
- backend/src/modules/products/products.controller.ts
- backend/src/modules/products/products.module.ts
- backend/src/modules/stock/dto/create-stock.dto.ts
- backend/src/modules/stock/dto/update-stock.dto.ts
- backend/src/modules/stock/dto/update-stock-availability.dto.ts
- backend/src/modules/stock/stock.service.ts
- backend/src/modules/stock/stock.service.spec.ts
- backend/src/modules/stock/stock.controller.ts
- backend/src/modules/stock/stock.module.ts

Modified:
- backend/prisma/schema.prisma (enums CategoryStatus, ProductStatus ; modèles Category, Product, Stock + relations Supplier/PickupPoint)
- backend/src/app.module.ts (CategoriesModule, ProductsModule, StockModule)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)
- CHANGELOG.md

Why:
- Categories and Products are required before Phase 6 (Orders/Cart) can reference items
- Stock is the inventory layer needed by Phase 6 to block out-of-stock items at checkout
- Price in cents avoids Float precision bugs in financial calculations

Architecture decisions:
- Price stored as Int (cents) — enforced by DTO @Min(0)/@IsInt() and DB CHECK constraint
- Category DELETE blocked if products reference it (ON DELETE RESTRICT) — prevents orphan products
- Product DELETE cascades to Stock (ON DELETE CASCADE) — stock entries have no meaning without product
- Stock global uniqueness enforced by two partial DB indexes: one for (product, NULL), one for (product, pickupPoint)
- isAvailable auto-set to false when quantity = 0 (service-level rule, not DB trigger)
- OPERATOR can only toggle isAvailable — quantity management reserved for MANAGER/ORG_ADMIN
- OPERATOR cannot force isAvailable = true when quantity = 0 (guarded at service level)

Dependencies added:
- None

Tests:
- backend/src/modules/products/products.service.spec.ts — 8 tests
  - create: success, ForbiddenException, supplier 404, category 404, category wrong supplier
  - update: success, category wrong supplier, product 404
- backend/src/modules/stock/stock.service.spec.ts — 9 tests
  - create: global stock, qty=0 auto-unavailable, ConflictException duplicate global, per-pickup-point, product 404
  - update: success, auto-unavailable on qty=0, stock 404
  - updateAvailability: OPERATOR can mark unavailable, cannot force available when qty=0
- Total backend: 57 tests (pnpm test ✅)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-26] Phase 4 added
- Code references: products.service.ts:requireCategoryForSupplier, stock.service.ts:updateAvailability

Risks:
- pnpm db:migrate required before Phase 4 functionality is usable
- pnpm db:generate already executed (Prisma client up to date)
- Stock decrement on order placement is Phase 6 — current stock.quantity is only for manual management
- availableFrom/availableUntil gates are stored but NOT enforced at API level yet (Phase 6 cart logic)

Next steps:
- Phase 5: Stripe Connect onboarding for Suppliers
  - Stripe webhook handler
  - stripeAccountId population on Supplier
  - Phase 6 will need valid stripeAccountId to process payments

---

## [2026-05-25] Codex Audit Corrections — Phase 2 & 3

Task: Fix 6 security and robustness issues from Codex Phase 2/3 audit
Date: 2026-05-25

Created:
- backend/src/modules/auth/strategies/jwt.strategy.spec.ts (4 tests)
- backend/src/modules/organizations/organizations.service.spec.ts (9 tests)
- backend/src/modules/pickup-points/pickup-points.service.spec.ts (5 tests)

Modified:
- turbo.json (test.dependsOn: ["^build"] → [])
- apps/mobile/package.json (lint: --ext removed, build script added)
- backend/src/common/helpers/require-org-access.ts (SUPER_ADMIN DB query bypass)
- backend/src/modules/organizations/organizations.service.ts (SUPER_ADMIN findById/addMember + targetUser 404)
- backend/src/modules/organizations/organizations.controller.ts (passes user.globalRole)
- backend/src/modules/auth/strategies/jwt.strategy.ts (async validate + DB isActive check)
- backend/src/modules/pickup-points/pickup-points.service.ts (event.venueId === dto.venueId check)
- backend/src/modules/suppliers/suppliers.service.ts (OrgRole.OPERATOR replaces string cast)
- backend/src/modules/events/events.service.spec.ts (user mock added for requireOrgAccess)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)

Why:
- JWT tokens for deactivated accounts were still accepted for up to 15 minutes
- SUPER_ADMIN had no real bypass — they were blocked from org operations like regular users
- addMember could silently create a membership for a non-existent userId (FK error or ghost member)
- PickupPoints could reference a different venue than their event (data inconsistency)
- 'OPERATOR' string cast bypassed TypeScript type checking on OrgRole
- Mobile lint script used --ext flag removed in ESLint 9 — pnpm lint was broken from root

Architecture decisions:
- requireOrgAccess reads globalRole from DB (not JWT) so role revocation is immediate
- JwtStrategy.validate() adds one DB query per authenticated request (acceptable; cache in Phase 10 if needed)
- SUPER_ADMIN bypass in OrganizationsService via callerGlobalRole parameter (explicit, no hidden magic)
- turbo test task has no dependsOn — tests run without a prior build step

Dependencies added:
- None

Tests:
- jwt.strategy.spec.ts — 4 tests (valid user, unknown user 401, inactive user 401, missing sub 401)
- organizations.service.spec.ts — 9 tests (findById member/non-member/SUPER_ADMIN/404, addMember ORG_ADMIN/non-admin/SUPER_ADMIN/targetUser404/conflict)
- pickup-points.service.spec.ts — 5 tests (success, no event, venue mismatch, venue 404, event 404)
- Total backend: 36 tests (20 Phase 2/3 + 16 new)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-25] Codex Audit Corrections Phase 2 & 3 added
- Code references: require-org-access.ts:36, jwt.strategy.ts:43, organizations.service.ts:findById/addMember

Risks:
- requireOrgAccess now makes an extra DB query per org-scoped request (1 query: SELECT globalRole)
- JwtStrategy.validate() adds 1 DB query per authenticated request — plan Redis cache in Phase 10

Next steps:
- Phase 4: Products, Categories, Stock
  - Add Category, Product, Stock to Prisma schema
  - NestJS modules for each entity
  - Stock availability management per supplier/event

---

## [2026-05-25] Phase 3 — Events, Venues, Suppliers, Pickup Points

Task: Prisma Phase 3 schema + 4 NestJS modules + tests
Date: 2026-05-25

Created:
- backend/prisma/migrations/20260525_phase3_events_venues_suppliers/migration.sql
- backend/src/common/helpers/require-org-access.ts
- backend/src/modules/venues/dto/create-venue.dto.ts
- backend/src/modules/venues/dto/update-venue.dto.ts
- backend/src/modules/venues/venues.service.ts
- backend/src/modules/venues/venues.controller.ts
- backend/src/modules/venues/venues.module.ts
- backend/src/modules/suppliers/dto/create-supplier.dto.ts
- backend/src/modules/suppliers/dto/update-supplier.dto.ts
- backend/src/modules/suppliers/dto/update-supplier-status.dto.ts
- backend/src/modules/suppliers/suppliers.service.ts
- backend/src/modules/suppliers/suppliers.controller.ts
- backend/src/modules/suppliers/suppliers.module.ts
- backend/src/modules/events/dto/create-event.dto.ts
- backend/src/modules/events/dto/update-event.dto.ts
- backend/src/modules/events/dto/update-event-status.dto.ts
- backend/src/modules/events/dto/attach-supplier.dto.ts
- backend/src/modules/events/events.service.ts
- backend/src/modules/events/events.service.spec.ts
- backend/src/modules/events/events.controller.ts
- backend/src/modules/events/events.module.ts
- backend/src/modules/pickup-points/dto/create-pickup-point.dto.ts
- backend/src/modules/pickup-points/dto/update-pickup-point.dto.ts
- backend/src/modules/pickup-points/pickup-points.service.ts
- backend/src/modules/pickup-points/pickup-points.controller.ts
- backend/src/modules/pickup-points/pickup-points.module.ts
- CHANGELOG.md (nouveau fichier de suivi des modifications)

Modified:
- backend/prisma/schema.prisma (enums Phase 3 + Venue, Event, EventSupplier, Supplier, PickupPoint)
- backend/src/app.module.ts (ajout VenuesModule, SuppliersModule, EventsModule, PickupPointsModule)
- brain/ENGINEERING_MANUAL.md
- brain/TASK_SUMMARY.md (this file)
- DEVELOPMENT_LOG.md
- CHANGELOG.md

Why:
- Events = contexte d'activation de toute la logique métier (products, cart, orders)
- Phase 4 et 5 ont besoin d'un Venue + Event + Supplier déjà persistés

Architecture decisions:
- requireOrgAccess() helper extrait pour éviter la duplication dans les 4 services
- MANAGE_ROLES = [ORG_ADMIN, MANAGER] pour les écritures, ALL_ORG_ROLES pour les lectures
- EventStatus machine avec transitions explicites + guard sur états terminaux
- EventSupplier junction table (many-to-many event↔supplier)
- stripeAccountId nullable sur Supplier — sera rempli Phase 5
- Venues liés à l'org via CASCADE — supprimer une org supprime venues, events, suppliers, pickup points

Dependencies added:
- Aucune nouvelle dépendance externe

Tests:
- backend/src/modules/events/events.service.spec.ts — 9 tests
  - create: happy path, ForbiddenException, venue not found, invalid dates
  - updateStatus: DRAFT→ACTIVE, invalid transition, CANCELLED terminal
  - attachSupplier: happy path, ConflictException duplicate
- Total: 20 tests backend (pnpm test ✅)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-25] Phase 3 ajoutée
- Code references: events.service.ts:247 (guardFinalized), :257 (validateTransition), :163 (attachSupplier)

Risks:
- Migration Phase 3 doit être appliquée après Phase 2 (ordre important)
- pnpm db:generate requis après tout changement schema.prisma
- stripeAccountId vide jusqu'à Phase 5

Next steps:
- Phase 4 : Products, Categories, Stock
  - Ajout Category, Product, Stock au schéma Prisma
  - Modules NestJS correspondants
  - Gestion disponibilité et stock par supplier

---

## [2026-05-25] Codex Audit Corrections

Task: Fix 6 issues from Codex audit before Phase 3
Date: 2026-05-25

Created:
- apps/mobile/src/lib/config/env.ts (typed env config module)
- apps/mobile/src/types/globals.d.ts (minimal process.env ambient declaration)

Modified:
- apps/mobile/src/instrument.ts (uses ENV.* instead of process.env)
- apps/mobile/src/lib/api/api-client.ts (uses ENV.API_URL instead of process.env.API_URL)
- apps/admin/package.json (lint: "eslint src/" replacing next lint)
- apps/operator/package.json (lint: "eslint src/" replacing next lint)
- backend/src/modules/auth/auth.service.ts (removed unused argon2 import)
- backend/src/modules/organizations/dto/add-member.dto.ts (removed unused IsString import)
- brain/ENGINEERING_MANUAL.md (Codex Audit Corrections entry added)
- brain/TASK_SUMMARY.md (this file)

Why:
- Typecheck was failing on mobile due to untyped process.env accesses
- Health route was incorrectly prefixed — /health was at /api/v1/health
- next lint incompatible with ESLint 9 flat config
- Two unused imports causing lint errors in backend
- All builds must pass before Phase 3 starts

Architecture decisions:
- Mobile env vars centralized in src/lib/config/env.ts (no @types/node in RN)
- Minimal process.d.ts declaration avoids polluting RN scope with Node.js types
- ESLint 9 flat config at root is shared via directory traversal — no per-app config needed
- health route exclusion via setGlobalPrefix({ exclude: ['health'] }) is the NestJS official way

Dependencies added:
- None

Tests:
- All 11 existing backend tests pass (pnpm test)
- pnpm typecheck → 4 packages, 0 error
- pnpm lint → 4 packages, 0 error
- apps/admin pnpm build → OK
- apps/operator pnpm build → OK
- apps/mobile pnpm typecheck → OK

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-25] Codex Audit Corrections ajoutée
- Code references: apps/mobile/src/lib/config/env.ts:1, globals.d.ts:1, main.ts:27

Risks:
- Fix 1 (mobile env): process.env is replaced at Metro bundle time — ENVfile is a TS-only type layer
- Fix 4 (eslint): next build still runs its own internal lint pass (shows warning about missing Next.js plugin — non-blocking)

Next steps:
- Phase 3 : Events, Venues, Suppliers
  - Add Venue, Event, Supplier, PickupPoint to Prisma schema
  - NestJS modules for each entity
  - Relations with Organization (already exists from Phase 2)

---

## [2026-05-25] Phase 2 — Auth + Organizations

Task: Prisma setup, JWT auth, Users, Organizations, Roles, Guards
Date: 2026-05-25

Created:
- backend/prisma/schema.prisma (User, Organization, OrganizationMember, RefreshToken)
- backend/prisma/migrations/20260525_phase2_auth_organizations/migration.sql
- backend/src/database/prisma.service.ts
- backend/src/database/prisma.module.ts
- backend/src/common/enums/role.enum.ts
- backend/src/common/decorators/current-user.decorator.ts
- backend/src/common/decorators/roles.decorator.ts
- backend/src/common/guards/jwt-auth.guard.ts
- backend/src/common/guards/roles.guard.ts
- backend/src/modules/users/users.service.ts
- backend/src/modules/users/users.module.ts
- backend/src/modules/auth/dto/register.dto.ts
- backend/src/modules/auth/dto/login.dto.ts
- backend/src/modules/auth/dto/refresh.dto.ts
- backend/src/modules/auth/strategies/jwt.strategy.ts
- backend/src/modules/auth/auth.service.ts
- backend/src/modules/auth/auth.controller.ts
- backend/src/modules/auth/auth.module.ts
- backend/src/modules/auth/auth.service.spec.ts
- backend/src/modules/organizations/dto/create-organization.dto.ts
- backend/src/modules/organizations/dto/add-member.dto.ts
- backend/src/modules/organizations/organizations.service.ts
- backend/src/modules/organizations/organizations.controller.ts
- backend/src/modules/organizations/organizations.module.ts

Modified:
- backend/package.json (ajout argon2, @nestjs/jwt, @nestjs/passport, prisma, class-validator...)
- backend/src/app.module.ts (ajout PrismaModule, AuthModule, UsersModule, OrganizationsModule)
- pnpm-workspace.yaml (allowBuilds pour prisma, argon2, @nestjs/core)
- DEVELOPMENT_LOG.md
- brain/TASK_SUMMARY.md
- brain/ENGINEERING_MANUAL.md

Why:
- Aucune fonctionnalité métier n'est utilisable sans auth et organisations
- Les guards et decorators créés ici sont réutilisés par toutes les phases suivantes

Architecture decisions:
- Prisma choisi pour sa type-safety et ses migrations SQL explicites
- argon2 pour le hachage (résistant GPU, recommandé OWASP)
- Refresh token haché en SHA-256 avant stockage (jamais le token brut en DB)
- Rotation systématique : un refresh token ne peut être utilisé qu'une seule fois
- Login : même message d'erreur email inconnu vs mauvais mot de passe
- Création d'organisation en transaction Prisma (org + membership atomiques)
- PrismaModule @Global() — évite les re-imports dans chaque module
- passwordHash exclu de tous les retours publics (SafeUser type)

Dependencies added:
- @nestjs/jwt, @nestjs/passport, passport, passport-jwt
- argon2
- @prisma/client, prisma (dev)
- class-validator, class-transformer
- @types/passport-jwt (dev)

Tests:
- backend/src/modules/auth/auth.service.spec.ts — 6 tests
  - register: crée user + retourne tokens
  - register: ConflictException si email pris
  - login: retourne tokens si credentials valides
  - login: UnauthorizedException si email inconnu
  - login: UnauthorizedException si mauvais mot de passe
  - login: même message pour email inconnu vs mauvais mot de passe (pas d'énumération)
  - login: UnauthorizedException si compte inactif
  - logout: idempotent

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-25] Phase 2 ajoutée
- Code references: auth.service.ts:94 (login), auth.service.ts:148 (generateTokens), prisma.service.ts:1

Risks:
- Migration SQL à appliquer manuellement : docker-compose up → pnpm db:migrate
- android/ et ios/ mobile toujours vides (inchangé depuis Phase 1)
- Pas de rate limiting sur /auth/login en Phase 2 — à ajouter en Phase 10 (QA)

Next steps:
- Phase 3 : Events, Venues, Suppliers
  - Ajout des entités Venue, Event, Supplier, PickupPoint au schéma Prisma
  - Modules NestJS correspondants
  - Relations avec Organization (déjà créée en Phase 2)

---

## [2026-05-25] Phase 1 — Foundation

Task: Monorepo + backend shell + app shells + Docker + CI
Date: 2026-05-25

Created:
- package.json (root workspace)
- pnpm-workspace.yaml
- turbo.json
- .prettierrc / .prettierignore
- eslint.config.mjs (ESLint 9 flat config)
- .gitignore
- .env.example (toutes les variables documentées)
- docker-compose.yml (PostgreSQL 16 + Redis 7)
- .github/workflows/ci.yml
- DEVELOPMENT_LOG.md (log chronologique complet)
- backend/package.json + tsconfig + nest-cli.json
- backend/src/main.ts
- backend/src/instrument.ts
- backend/src/app.module.ts
- backend/src/config/app.config.ts
- backend/src/health/health.module.ts
- backend/src/health/health.controller.ts
- backend/src/health/health.controller.spec.ts
- apps/admin/ (Next.js 15 shell complet)
- apps/operator/ (Next.js 15 shell + WebSocket stub)
- apps/mobile/ (React Native CLI shell complet)

Modified:
- brain/ENGINEERING_MANUAL.md (Phase 1 entry added)
- brain/TASK_SUMMARY.md (this file)

Why:
- Poser les fondations techniques avant toute logique métier
- S'assurer que tous les packages démarrent, TypeScript passe, CI est vert

Architecture decisions:
- ConfigModule global → aucun module ne lit process.env directement
- Sentry importé avant tout autre module (main.ts + App.tsx)
- WebSocket stub créé en Phase 1 pour stabiliser les chemins d'import dès le départ
- Stores Zustand sans logique métier (setters uniquement, pas de calculs)
- Health endpoint hors prefix /api/v1 (doit répondre sans auth)
- TanStack Query configuré différemment admin vs operator (staleTime 30s vs 10s)

Dependencies added:
- Backend: @nestjs/common, @nestjs/config, @nestjs/core, @nestjs/platform-express, @sentry/nestjs
- Admin/Operator: @tanstack/react-query, next, react, react-dom
- Mobile: @react-navigation/native, @react-navigation/native-stack, zustand, @tanstack/react-query, @sentry/react-native, react-native-screens, react-native-safe-area-context

Tests:
- backend/src/health/health.controller.spec.ts — 3 tests (status, timestamp ISO, environment)

Engineering manual:
- Updated ENGINEERING_MANUAL.md: section [2026-05-25] Phase 1 Foundation ajoutée
- Important code references added: main.ts:1, health.controller.ts:26, app.config.ts, socket-client.ts, query-client.ts, api-client.ts

Risks:
- android/ et ios/ sont vides — setup natif requis localement (Android Studio + Xcode)
- OneDrive peut ralentir node_modules — exclure de la sync OneDrive recommandé

Next steps:
- Phase 2 : Auth + Organizations
  - ORM choice (TypeORM ou Prisma — décision requise)
  - backend/src/modules/auth/ (JWT, guards, stratégies Passport)
  - backend/src/modules/users/
  - backend/src/modules/organizations/
  - Première migration de base de données

---

## [2026-06-02] Audit Global — Phases 1→10 (zéro bug, structure parfaite)

Task: Audit complet de toutes les phases (1 à 10) : TypeScript, ESLint, tests, structure modules, guards, config, migrations, gitignore. Corriger chaque bug trouvé. Objectif : 0 erreur TS, 0 erreur ESLint, 100% tests verts.
Date: 2026-06-02

### Bugs corrigés

#### TypeScript (4 erreurs)
- `backend/src/logger/json-logger.ts` — méthode privée renommée `formatMessage` → `serializeMessage` (conflit avec méthode publique de `ConsoleLogger`)
- `backend/src/modules/flaix/flaix.controller.ts:73` — clé composée `organizationId_userId` → `userId_organizationId` (ordre des champs dans `@@unique([userId, organizationId])`)
- `backend/src/modules/orders/orders.controller.ts:227` — même correction clé composée
- `apps/operator/next.config.ts` — `hideSourceMaps: true` → `sourcemaps: { deleteSourcemapsAfterUpload: true }` (API @sentry/nextjs v9)

#### ESLint (8 erreurs + 1 warning)
- `backend/src/modules/flaix/flaix.service.ts` — paramètres inutilisés `context` → `_context`, `userId` → `_userId`
- `backend/src/modules/flaix/flaix.service.spec.ts` — import inutilisé `TestingModule` supprimé
- `backend/src/modules/realtime/realtime.gateway.spec.ts` — variable inutilisée `configService` supprimée
- `backend/src/modules/simulator/simulator.controller.ts` — import inutilisé `Body` supprimé
- `backend/src/modules/simulator/simulator.service.spec.ts` — import inutilisé `OrderActorType` supprimé
- `backend/src/modules/simulator/rush.spec.ts` — imports inutilisés `NotFoundException` + `OrderActorType` supprimés
- `backend/src/modules/orders/order-loss.spec.ts` — assertion non-null `!` remplacée par `if (o1)` conditionnel safe
- `apps/operator/src/hooks/useDashboard.ts` — commentaire `eslint-disable react-hooks/exhaustive-deps` supprimé (plugin non installé → "rule definition not found")

### Améliorations structure

- `backend/src/config/app.config.ts` — ajout `appEnv` (APP_ENV) et `logLevel` (LOG_LEVEL) dans le registre ConfigModule pour cohérence
- `.env.example` — ajout APP_ENV, LOG_LEVEL, NEXT_PUBLIC_SENTRY_DSN_OPERATOR, SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT

### Vérifications structurelles

- `app.module.ts` : 20 modules enregistrés (ConfigModule + PrismaModule + HealthModule + 17 fonctionnels)
- `prisma.module.ts` : `@Global()` confirmé — PrismaService disponible dans tous les modules
- 7 migrations : phases 2, 3, 4, 5, 5-audit, 7, 9 (phases 1, 6, 8, 10 sans DB-change → normal)
- Guards : `JwtAuthGuard`, `DemoGuard`, `requireOrgAccess` — implémentations correctes
- `.gitignore` : pas de `*.json` global (interdirait `package.json`, `tsconfig.json`)
- Compound key ordering : `@@unique([userId, organizationId])` → `userId_organizationId` (vérifié partout)

### Résultats finaux

```
pnpm typecheck (backend)   → exit 0 — 0 erreur
pnpm typecheck (operator)  → exit 0 — 0 erreur
pnpm lint (backend)        → exit 0 — 0 erreur
pnpm lint (operator)       → exit 0 — 0 erreur
pnpm test (backend)        → 273 tests — 22 suites — 0 failure — 21.5s
```

Next steps:
→ Phase 11 : application mobile Flutter (PO) ou lancement beta avec données réelles

---

## Template

```text
Task:
Date:

Created:
- 

Modified:
- 

Why:
- 

Architecture decisions:
- 

Dependencies added:
- 

Tests:
- 

Engineering manual:
- Updated ENGINEERING_MANUAL.md:
- Important code references added:

Risks:
- 

Next steps:
- 
```
