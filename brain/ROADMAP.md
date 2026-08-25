# BREAK EAT Roadmap

Version: V1 source of truth

> **Phases 1 à 10** — le plan initial, écrit d'avance et intégralement livré.
> C'est le corps de ce document.
>
> **Phases 11 à 22** — reconstituées **après coup**, en fin de document. Elles
> ont émergé des besoins du client, une à une, sans plan préalable : board
> opérateur configurable, dashboard manager, back-office, pivot mobile, plan des
> buvettes, état live des commandes, fidélité, Live Activity iOS, lieux ouverts
> en continu.
>
> **Après les phases** — les chantiers de mise en service d'août 2026 (montée
> SDK 57, accès, remise à zéro) figurent aussi en fin de document.
>
> Pour l'état réel et ce qui reste : `../REPRISE.md`. Pour le détail daté :
> `../CHANGELOG.md` et `ENGINEERING_MANUAL.md`.

## Roadmap Rule

Never skip phases.

Never ask an AI coding tool to generate the full application in one request.

Each phase must produce:

- working code;
- tests where relevant;
- updated documentation;
- `TASK_SUMMARY.md`;
- updated `ENGINEERING_MANUAL.md` with code references;
- known risks and next steps.

### Visual Validation Rule (from Phase 6 onward)

Per `brain/PRODUCT_VALIDATION.md` (v1.0.0, 28/05/2026), starting with **Phase 6** every frontend deliverable must additionally produce:

- screenshots (iOS + Android);
- mobile preview build (QR-code installable on iPhone / Android);
- loading, empty and error state previews;
- live staging URL for any dashboard or public screen;
- Storybook isolated component preview (from Phase 8);
- approval from the product owner before the bloc is closed.

Phases 1–5 are exempt (backend-only) but Phase 6 must include the infrastructure setup
(staging deployment, mobile build pipeline, Storybook scaffolding) as part of its scope.

## Sprint Duration Recommendation

Solo development with Claude Code and Codex can move fast, but not infinitely fast. The realistic V1 planning target is approximately 14 weeks, or about 3.5 months.

These estimates assume:

- strict V1 scope control;
- no full-app generation request;
- no major redesign during implementation;
- module-by-module delivery;
- documentation updated after each block;
- tests added for critical order, payment and realtime flows.

| Phase | Content | Estimated Duration |
| --- | --- | --- |
| 1 | Foundation: monorepo and setup | 3-4 days |
| 2 | Auth and organizations | 1 week |
| 3 | Events, venues and suppliers | 1 week |
| 4 | Products, categories and stock | 1 week |
| 5 | Cart, checkout and Stripe Connect | 1.5 weeks |
| 6 | Orders, realtime and outbox | 2 weeks |
| 7 | Slots and Flaix foundation | 1.5 weeks |
| 8 | Dashboards and public screens | 1.5 weeks |
| 9 | Basic CMS and feature flags | 1 week |
| 10 | QA, rush tests and deploy | 1.5 weeks |
| Total | V1 realistic build target | ~14 weeks / ~3.5 months |

### Planning Risks

The highest-risk schedule areas are:

- Stripe Connect, because marketplace payment flows can add compliance and edge cases;
- realtime outbox, because order reliability depends on correct persistence and retry behavior;
- Flaix foundation, because the integration boundary must stay clear and traceable;
- dashboards, because operator UX must remain stable under rush and reconnect scenarios;
- CMS, because it must remain basic in V1 and not become a full page builder.

If scope expands during one of these phases, update this roadmap before asking Claude Code to continue.

## Phase 0: Source of Truth

Goal: create and validate the project brain before code generation.

Deliverables:

- `/brain` folder;
- product vision;
- architecture;
- domain model;
- order state machine;
- realtime contracts;
- Flaix contract;
- testing strategy;
- agent instructions;
- engineering manual template.

Acceptance criteria:

- Claude Code can read `/brain` and explain the architecture before coding.
- No implementation starts before the order lifecycle and realtime contracts exist.
- Claude Code understands that every task must update `ENGINEERING_MANUAL.md`.

## Phase 1: Foundation

Goal: create the technical base.

Deliverables:

- monorepo;
- NestJS backend;
- mobile app shell;
- admin/operator app shell;
- Docker setup;
- environment config;
- linting and formatting;
- TypeScript strict mode;
- base CI;
- health endpoint.

Acceptance criteria:

- all apps start locally;
- backend health check works;
- strict TypeScript enabled;
- no business logic implemented yet.
- `ENGINEERING_MANUAL.md` documents the monorepo structure and app startup flow.

## Phase 2: Auth and Organizations

Deliverables:

- user model;
- authentication;
- organizations;
- roles;
- permissions foundation;
- protected routes.

Acceptance criteria:

- admin can create organization;
- user can authenticate;
- role checks are enforced server-side.
- `ENGINEERING_MANUAL.md` references auth, organization and permission entry points.

## Phase 3: Events, Venues and Suppliers

Deliverables:

- venues;
- events;
- suppliers;
- pickup points;
- event activation;
- supplier status.

Acceptance criteria:

- an organization can configure a venue and event;
- event can contain suppliers and pickup points.
- `ENGINEERING_MANUAL.md` documents entity relationships and module boundaries.

## Phase 4: Products, Categories and Stock

Deliverables:

- categories;
- products;
- product availability;
- stock by supplier and pickup point;
- product image support.

Acceptance criteria:

- unavailable products cannot be ordered;
- stock changes are reflected in API responses.
- `ENGINEERING_MANUAL.md` documents catalog and stock flow.

## Phase 5: Cart, Checkout and Payment

Deliverables:

- cart;
- totals calculation;
- Stripe PaymentIntent;
- payment retry;
- order creation from successful payment;
- idempotency.

Acceptance criteria:

- failed payment creates no final order;
- successful payment creates exactly one order;
- duplicate webhook does not create duplicate orders.
- `ENGINEERING_MANUAL.md` documents Stripe idempotency and order creation references.

## Phase 6: Orders, Realtime and Validation Infrastructure

Deliverables (technical):

- order state machine;
- audit trail;
- realtime events;
- dashboard snapshot API;
- reconnect handling;
- polling fallback.

Deliverables (validation infrastructure — added 28/05/2026):

- staging deployment pipeline (backend + admin + operator);
- mobile preview build pipeline (EAS Build or App Center or equivalent);
- Storybook scaffolding (web + RN);
- fake event simulator skeleton (rush, fake orders);
- demo mode env toggle (DEMO_MODE);
- QR-code generator for mobile previews;
- staging dashboards URLs published.

Acceptance criteria:

- every transition is persisted and audited;
- dashboards recover after socket disconnect;
- no event is emitted before database commit;
- staging is reachable from a public URL;
- a first mobile preview build is installable via QR code;
- `ENGINEERING_MANUAL.md` documents transition validation, persistence and event emission lines.

## Phase 7: Slots and Flaix Foundation

Deliverables:

- slot model;
- slot assignment;
- Flaix integration boundary;
- safe fallback when Flaix is unavailable;
- decision audit.

Acceptance criteria:

- slot assignment is traceable;
- Flaix decisions are stored when applied;
- system degrades safely if Flaix is unavailable.
- `ENGINEERING_MANUAL.md` documents slot assignment and Flaix decision flow.

## Phase 8: Dashboards and Public Screens

Deliverables (technical):

- operator dashboard;
- new orders view;
- preparing view;
- ready view;
- recovered orders view;
- public ready screen;
- sound alerts;
- fullscreen support.

Deliverables (validation — mandatory per `PRODUCT_VALIDATION.md`):

- Storybook stories for every reusable component (DashboardCard, NotificationPopup, Timeline, PublicScreenCard, …);
- iPhone + Android previews of every screen;
- loading / empty / error states for every screen;
- light + dark mode visual proofs;
- live URLs published for all 4 dashboards in staging;
- 4 demo environments seeded (Stadium, Hockey, Corporate, Festival);
- product owner approval recorded.

Acceptance criteria:

- operator can move orders through allowed states;
- public screen shows no private customer info;
- recovered orders are visible;
- every component has a Storybook story with all states;
- staging dashboards are accessible at stable URLs;
- product owner has installed and approved the mobile preview build;
- `ENGINEERING_MANUAL.md` documents dashboard state flow and public privacy boundaries.

## Phase 9: CMS, Feature Flags and Polishing

Deliverables:

- basic feature flag service;
- simple CMS configuration;
- event-level toggles;
- organization-level toggles;
- controlled personalization.

Acceptance criteria:

- features can be enabled without redeploy;
- flags are enforced on backend and frontend.
- `ENGINEERING_MANUAL.md` documents feature flag resolution.

## Phase 10: QA and Deployment

Deliverables:

- rush testing;
- load testing;
- Sentry;
- production logs;
- beta deployment;
- deployment checklist.

Acceptance criteria:

- rush test completed;
- order loss test completed;
- dashboards tested under reconnect scenarios.
- `ENGINEERING_MANUAL.md` documents deployment, monitoring and incident debugging flow.

---

# Phases 11 à 22 — reconstituées après coup

> Ces phases n'ont pas été planifiées d'avance : elles ont émergé des besoins du
> client, une à une. Cette section les remet en ordre **a posteriori**, pour
> qu'un développeur qui reprend le dossier voie l'arc du produit et pas
> seulement une suite de correctifs datés.
>
> Source : `../CHANGELOG.md`, `ENGINEERING_MANUAL.md`, `TASK_SUMMARY.md`.
> En cas de désaccord, **le changelog fait foi** — il est écrit au moment du
> travail, celle-ci a été reconstituée.

## Le fil directeur

Les phases 1 à 10 ont bâti une plateforme de commande complète. Les suivantes
répondent à trois questions que le plan initial n'avait pas posées :

1. **Comment un client trouve-t-il un lieu ?** (16, 18, 22)
2. **Comment un club se pilote-t-il seul ?** (11, 15, 17)
3. **Que se passe-t-il après la commande ?** (19, 20, 21)

## Phase 11 — Admin panel et board opérateur configurable

Le panneau d'administration Next.js, puis sa pièce maîtresse : des **écrans
opérateur configurables** (11.3), leur rendu en board avec onglets et filtres
(11.4), et la préparation de l'intégration Flaix (11.5, restée en attente côté
Flaix).

*Pourquoi* : chaque buvette travaille différemment. Un board figé ne convient ni
à un stade ni à une cantine.

## Phase 12 — Blocs de consolidation

Reprises transversales sur les modules livrés en 1-10.

## Phase 13 — Mobile V1, parcours client complet

Premier parcours de bout en bout sur React Native : catalogue, panier, créneau,
commande, suivi.

## Phase 14 — Groupes

Événements **privés** réservés aux membres d'un groupe. Fonde la règle de
confidentialité : un lieu dont aucun événement n'est accessible reste masqué,
sans révéler son existence.

## Phase 15 — Dashboard manager

Analytique par organisation et par événement, en lecture seule. Le club voit son
activité sans pouvoir la fausser.

## Phase 16 — Découverte des lieux

`GET /public/venues` avec distance de Haversine. **Deux chemins, deux
seulement** : proximité dans 10 km, ou recherche par mot-clé configuré par le
club. Ni position ni recherche ⇒ liste vide, délibérément.

## Phase 17 — Back-office SUPER_ADMIN

Création de clubs, gestion des utilisateurs, groupes, notifications. Pose le
**modèle de délégation** : seule la plateforme délivre un accès responsable ; un
responsable ne peut créer que des accès opérateur.

## Phase 18 — Plan des buvettes

Image du plan portée par le lieu, affichée dans l'app et après la commande.
Indépendante du catalogue : elle vient du lieu, pas de Flaix.

## Phase 19 — État live et « Je suis arrivé »

Suivi temps réel de la commande, et signal d'arrivée du client — événement
**dédié**, jamais confondu avec une mise à jour de statut.

## Phase 20 — Programme de fidélité

Activation par lieu, solde par organisation, registre immuable. Les points
appartiennent au **club**, pas à Break Eat. Le solde est un cache du registre :
les mouvements passent par `increment` / `decrement`, jamais par une lecture
suivie d'une écriture absolue.

## Phase 21 — Live Activity iOS

Socle backend (APNs HTTP/2, JWT ES256, webhook Flaix signé) et extension
WidgetKit native. Compilée et signée pour la première fois le 24/08/2026.

## Phase 22 — Lieux ouverts en continu

`Venue.operatingMode`. Un restaurant ou une cantine n'a aucun événement à créer :
Break Eat pose un contenant unique et invisible, protégé contre toute
modification. Le wizard saute alors « Événement » et « Créneaux ».

---

# Après les phases — chantiers de mise en service (août 2026)

Ces travaux ne portent pas de numéro de phase : ils rendent livrable ce qui
existait déjà.

## Fiabilité de livraison (24/08)

Le parcours de commande était **inatteignable** dans toutes les versions
livrées : `App.expo.tsx` enregistrait un stub à la place de l'écran d'accueil
d'événement. Corrigé, avec l'adresse d'API gravée et les alertes rendues
visibles sur le web.

## Montée Expo SDK 53 → 57 (25/08)

Imposée par Apple : le SDK iOS 26 est obligatoire, et Xcode 26 ne compile pas
React Native 0.79. Quatre ruptures silencieuses corrigées — dont l'extension
Live Activity qui aurait disparu de la build sans erreur.

**Validée sur appareil réel**, y compris la géolocalisation native, qui n'avait
jamais été montée.

## Accès et remise à zéro (25/08)

Réinitialisation de mot de passe (inexistante jusque-là), suppression de compte,
remise à zéro des données d'une organisation, libellés métier des rôles.

## Ce que ces chantiers ont appris

Une leçon transverse, développée dans `ENGINEERING_MANUAL.md` :
**du code qui « se débrouille » face à une configuration absente transforme une
panne en comportement normal.** Repli silencieux vers localhost, `catch` vide,
validation après écriture, message d'erreur qui réécrit toutes les causes en
une seule — chaque symptôme rapporté par le client pointait ailleurs que sa
cause, et chacun a coûté des heures.

---

# Ce qui reste

Voir `../REPRISE.md`, section « Reste à faire » — tenue à jour, contrairement à
cette section qui fige un état.

Les deux chantiers structurants :

1. **Commande miroir Flaix** — sans elle, fidélité, présence et Live Activity
   restent éteintes sur les lieux Flaix.
2. **Wizard et demo-setup idempotents** — ils recréent tout à chaque passage.

