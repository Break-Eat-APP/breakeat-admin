# BREAK EAT Testing Strategy

Version: V1 source of truth

## Priority

Testing must protect the primary KPI: zero lost orders during rush periods.

Tests are mandatory for:

- payment idempotency;
- order creation;
- order state transitions;
- stock decrement;
- slot allocation;
- realtime event emission;
- dashboard reconnect;
- Flaix fallback behavior.

## Unit Tests

Required for:

- order state machine;
- totals calculation;
- permission checks;
- feature flag resolution;
- slot capacity rules;
- slot choice rules (open, not over, same event, same supplier — `cart.service.spec.ts`);
- automatic opening / closing of events and pickup points
  (`ouverture-automatique.service.spec.ts`, 8 tests) and automatic attachment
  with default pickup point (`rattachement-buvettes.spec.ts`, 4 tests);
- organization isolation and invitations (`organizations.service.spec.ts`);
- Flaix decision mapping.

## Integration Tests

Required for:

- cart to payment flow;
- Stripe webhook idempotency;
- order creation transaction;
- order status transitions;
- realtime outbox behavior;
- dashboard snapshot endpoint;
- supplier duplication joins upcoming events, closed (`duplication-buvette.int-spec.ts`).
- Flaix order tracking (`suivi-commandes-flaix.int-spec.ts`, 24-26/11/2026):
  - each followed order is reserved before it is processed, so two server
    instances never handle the same order;
  - Live Activity updates are retried after an APNs error and pushed to a
    late-registered activity;
  - "Note ta commande" goes out once, 10 min after hand-over;
  - the live state is scoped to its own customer.
- Flaix match feed import (`import-matchs-flaix.int-spec.ts`):
  - the preview writes nothing;
  - activation is venue by venue;
  - one club cannot touch another club's venue;
  - imported fields are locked.

## Rules learnt in November 2026

- **No fixed dates in tests.** Build them from the clock (`Date.now()` ±
  offsets). Two suites broke because a fixed date slipped into the past
  (BUG-2026-052, CI red on `main`). Another suite kept a production bug alive
  with June dates (BUG-2026-053, a finished match still shown "open").
- **Simulate the production failure, not the convenient one.**
  `ExpoPushService.send()` never throws: an outage comes back as
  `{ sent: 0, failed: n }`. A test that only made `send` reject missed
  BUG-2026-057.
- **Mobile Jest does not resolve the `@lib` alias.**
  - Import relatively in a module under test, or mock it with
    `{ virtual: true }`.
  - Variables used inside a `jest.mock` factory must start with `mock`; read
    them through a getter if the factory runs before they exist.
  - Use `require`, not a dynamic `import()`: Jest runs without
    `--experimental-vm-modules`.
- **Server type-check is `pnpm run typecheck`**: it also checks
  `tsconfig.tests.json` (integration tests).
- **Integration tests on the workstation.** Use Docker:
  - `postgres:18-alpine` on port 15432 and `redis:7-alpine` on port 16379
    (ports 55432 and up are reserved by Windows);
  - then `prisma migrate deploy`;
  - then `pnpm test:integration`, with `DATABASE_URL_TEST` and
    `REDIS_URL_TEST` set.

They run in CI on a real PostgreSQL after replaying every migration
(`.github/workflows/ci.yml`, job « Tests d'integration (base reelle) »).

## Capacity — not certified (Codex audit, 17/11/2026)

No load test has been run beyond the first target below (500 users, 20
dashboards). 10 000 concurrent users, 5 000 orders in an evening or 50 live
venues are **not** demonstrated. Next: a pilot on one BreakEat venue, then a
progressive load bench (500 → 2 000 → 5 000) on a pre-production copy
(BUG-2026-014), measuring p95/p99, error rate, DB connections, Redis,
socket delivery to dashboards and Stripe reconciliation.

## How tests are run on the development machine (21/11/2026)

Since 21/11/2026 the workstation has 16 GB: the full Jest suites can run
locally. If memory runs short anyway, fall back to the old routine (Jest file
by file, `-i`, `NODE_OPTIONS=--max-old-space-size=1000`; server type-check with
`node node_modules/typescript/bin/tsc --noEmit`). Docker runs there, so
`pnpm db:verifier` works locally. The full suites, the mobile type-check and the integration tests run in CI —
**read the CI before saying anything is green** (`CLAUDE.md` § 2, rule 8).

## Realtime Tests

Required scenarios:

- dashboard receives `new_order`;
- dashboard receives `order_updated`;
- dashboard reconnects and resyncs;
- duplicate event id is ignored;
- socket disconnect triggers polling fallback;
- polling stops after socket recovery.

## Rush Tests

Rush tests must simulate:

- many orders created in a short period;
- multiple dashboards connected;
- supplier overload;
- slot capacity pressure;
- reconnect during active order flow;
- Flaix unavailable during rush.

## Payment Tests

Mandatory assertions:

- failed payment creates no final order;
- successful payment creates exactly one order;
- duplicate Stripe webhook creates no duplicate order;
- payment success without realtime emission is recoverable;
- order snapshots preserve historical item prices.

## Manual QA Checklist

Before beta:

- create event;
- create supplier;
- create products;
- place order;
- retry failed payment;
- receive order on dashboard;
- mark order preparing;
- mark order ready;
- see order on public screen;
- simulate socket disconnect;
- verify dashboard resync;
- simulate Flaix unavailable;
- verify safe degraded behavior;
- BreakEat venue: a DRAFT event opens by itself at the venue's opening time
  and closes at its end (Railway logs « Ouverture automatique » /
  « Fermeture automatique »);
- choose a slot, go back, choose « Au plus vite », pay: the order has **no**
  slot;
- Android build on a real phone: Google sign-in, payment, « prête »
  notification.

## Load Testing Targets

Initial V1 targets must be realistic and measured.

Recommended first target:

- 500 concurrent users;
- 20 connected dashboards;
- 100 orders in 10 minutes;
- no lost orders;
- dashboard recovery after disconnect.

Scale targets can increase after the base system proves stable.

