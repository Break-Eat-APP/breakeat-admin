# BRAT EAT Testing Strategy

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
- Flaix decision mapping.

## Integration Tests

Required for:

- cart to payment flow;
- Stripe webhook idempotency;
- order creation transaction;
- order status transitions;
- realtime outbox behavior;
- dashboard snapshot endpoint.

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
- verify safe degraded behavior.

## Load Testing Targets

Initial V1 targets must be realistic and measured.

Recommended first target:

- 500 concurrent users;
- 20 connected dashboards;
- 100 orders in 10 minutes;
- no lost orders;
- dashboard recovery after disconnect.

Scale targets can increase after the base system proves stable.

