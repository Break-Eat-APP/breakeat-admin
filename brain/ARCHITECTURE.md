# BRAT EAT Architecture

Version: V1 source of truth

## Architectural Strategy

BRAT EAT V1 uses a modular monolith.

No microservices in V1.

Reasons:

- faster implementation;
- simpler debugging;
- easier transactional consistency;
- lower infrastructure complexity;
- better fit for early product iteration.

The architecture must still be modular enough to extract services later if the product scale requires it.

## Mandatory Stack

### Backend

- NestJS
- TypeScript strict mode
- PostgreSQL
- Redis
- WebSockets
- Stripe
- S3-compatible storage
- Docker
- Sentry

### Mobile

- React Native
- React Native Navigation or Native Stack Navigation
- TypeScript strict mode
- Zustand for client state
- TanStack Query for server cache

### Admin and Operator Web Apps

- React or Next.js
- TypeScript strict mode
- TanStack Query
- WebSocket client with reconnect and polling fallback

## Repository Structure

```text
/brain
  PRODUCT_VISION.md
  ARCHITECTURE.md
  DOMAIN_MODEL.md
  ORDER_STATE_MACHINE.md
  REALTIME_CONTRACTS.md
  FLAIX_CONTRACT.md
  ROADMAP.md
  AGENTS.md
  DESIGN_SYSTEM.md
  TESTING_STRATEGY.md

/apps
  /mobile
  /admin
  /operator

/backend
  /src
    /modules
      /auth
      /organizations
      /events
      /suppliers
      /products
      /cart
      /orders
      /payments
      /slots
      /flaix
      /realtime
      /dashboards
      /feature-flags
      /notifications
```

## Developer Notice Requirement

`/brain/ENGINEERING_MANUAL.md` is the living technical notice of the application.

Every implementation task must update it with exact code references and line numbers. The manual must explain what was built, why it exists, how it works, how data flows through it, how it is tested and what future developers must be careful with.

For critical modules, the manual must reference:

- the API or UI entry point;
- the service method that owns business logic;
- the persistence point;
- the emitted realtime event when relevant;
- the tests that protect the behavior.

## Module Rules

- Each backend module owns its domain logic.
- Shared business rules must live in one place only.
- Controllers must stay thin.
- Services must not bypass repositories or transaction boundaries.
- Realtime events must be emitted only after persistent state changes succeed.
- Payment logic must not be mixed with order transition logic.
- Flaix integration must not be duplicated inside order, slot or dashboard modules.
- Feature flags must be checked through a shared feature flag service.

## Data Consistency Rules

Critical flows must use explicit transaction boundaries:

- payment confirmation;
- order creation;
- order status transition;
- stock decrement;
- slot allocation;
- order recovery.

For critical transitions, persist first, emit realtime event second.

Never emit an order event for a state that was not committed to the database.

## Realtime Reliability Rules

The realtime layer must support:

- WebSocket reconnect;
- missed event recovery;
- fallback polling;
- idempotent event handling;
- dashboard resync;
- operator-safe UI during reconnect.

Dashboards must never rely only on transient socket state. They must be able to reload their complete current view from the API.

## Feature Flags

Feature flags must support:

- global flags;
- organization-level flags;
- event-level flags.

V1 can use a simple database-backed feature flag system. Do not introduce a complex external flag platform unless explicitly requested.

## Observability

Every critical flow must produce structured logs:

- order created;
- payment succeeded;
- payment failed;
- order status changed;
- slot assigned;
- Flaix decision applied;
- dashboard client connected;
- dashboard client reconnected;
- realtime event emitted;
- realtime delivery failed.

Sentry must capture backend and frontend errors.
