# BREAK EAT Order State Machine

Version: V1 source of truth

## Principle

The order state machine protects the primary KPI: zero lost orders.

All order transitions must be explicit, validated, persisted and auditable.

## Order Statuses

```text
cart
payment_pending
payment_failed
paid
accepted
preparing
ready
picked_up
completed
cancelled
recovered
```

## Payment Statuses

```text
not_started
requires_action
processing
succeeded
failed
refunded
partially_refunded
```

## Allowed Transitions

```text
cart -> payment_pending
payment_pending -> payment_failed
payment_pending -> paid
payment_failed -> payment_pending
paid -> accepted
accepted -> preparing
preparing -> ready
ready -> picked_up
picked_up -> completed

paid -> cancelled
accepted -> cancelled
preparing -> cancelled

paid -> recovered
accepted -> recovered
preparing -> recovered
ready -> recovered
recovered -> accepted
recovered -> preparing
recovered -> ready
```

## Creation Rule

Do not create a final order before payment succeeds unless the implementation uses a clearly named reservation record.

Recommended V1 flow:

1. user validates cart;
2. backend creates Stripe PaymentIntent;
3. client confirms payment;
4. Stripe webhook confirms success;
5. backend creates order transactionally;
6. backend decrements stock and assigns slot;
7. backend commits;
8. backend emits realtime `new_order`.

## Idempotency

Payment webhooks and order creation must be idempotent.

Use stable idempotency keys:

- paymentIntentId;
- cartId;
- userId;
- eventId.

If the webhook is received twice, the system must not create two orders.

## Realtime Emission Rule

Persist transition first.

Emit realtime event second.

If event emission fails, persist the missed event in an outbox or retry queue.

## Recovery Rule

An order can enter `recovered` when the system detects a mismatch:

- payment succeeded but dashboard did not receive the order;
- order exists but no dashboard acknowledgement was observed;
- websocket outage happened during a critical transition;
- operator manually marks an order as recovered.

Recovered orders must appear on a dedicated dashboard view.

## Operator Actions

Allowed operator actions:

- accept order;
- start preparation;
- mark ready;
- mark picked up;
- recover order;
- cancel when allowed by policy.

All operator actions must write to the audit trail.

## Customer Actions

Allowed customer actions:

- create cart;
- select slot;
- pay;
- retry payment;
- view order status;
- receive ready notification.

Customer cancellation rules must be decided before implementation. Do not invent cancellation policy in code.

