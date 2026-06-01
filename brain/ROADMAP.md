# BRAT EAT Roadmap

Version: V1 source of truth

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
