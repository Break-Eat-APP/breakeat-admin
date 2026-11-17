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

They run in CI on a real PostgreSQL after replaying every migration
(`.github/workflows/ci.yml`, job « Tests d'integration (base reelle) »).

## How tests are run on the development machine (17/11/2026)

The workstation has little memory (6 GB, often < 800 MB free): run Jest file
by file, `-i`, with `NODE_OPTIONS=--max-old-space-size=1000`; type-check the
server with `node node_modules/typescript/bin/tsc --noEmit` (heap 1300 MB).
The full suites, the mobile type-check and the integration tests run in CI —
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

