# BREAK EAT Realtime Contracts

Version: V1 source of truth

## Principle

Realtime improves speed, but persisted database state remains the source of truth for recovery.

Every realtime view must be recoverable through an HTTP API resync.

## Transport

V1 uses WebSockets.

The client must support:

- reconnect with backoff;
- visible connection status;
- resync after reconnect;
- fallback polling for critical dashboards.

## Rooms

Recommended room names:

```text
organization:{organizationId}
event:{eventId}
supplier:{supplierId}
pickup-point:{pickupPointId}
dashboard:{dashboardId}
order:{orderId}
```

## Events

### new_order

Emitted after an order is committed.

Payload:

```json
{
  "eventName": "new_order",
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "orderId": "uuid",
  "publicOrderNumber": "string",
  "organizationId": "uuid",
  "venueId": "uuid",
  "supplierIds": ["uuid"],
  "pickupPointId": "uuid",
  "status": "paid",
  "slotId": "uuid-or-null"
}
```

### order_updated

Payload:

```json
{
  "eventName": "order_updated",
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "orderId": "uuid",
  "previousStatus": "string",
  "nextStatus": "string",
  "actorType": "system|user|operator|admin|flaix",
  "reason": "string-or-null"
}
```

### order_ready

Payload:

```json
{
  "eventName": "order_ready",
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "orderId": "uuid",
  "publicOrderNumber": "string",
  "pickupPointId": "uuid"
}
```

### customer_arrived

Emitted when a customer taps "Je suis arrivé" at the pickup point (phase 19).

Rooms: `organization:{id}`, `event:{id}`, `supplier:{id}`.
Deliberately **not** `order:{id}` — this is an operator-facing signal; the
customer already knows they arrived.

Payload:

```json
{
  "eventName": "customer_arrived",
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "orderId": "uuid",
  "publicOrderNumber": "string",
  "pickupPointId": "uuid",
  "arrivedAt": "iso-date"
}
```

**Why a separate event and not `order_updated`.** The operator board applies an
optimistic update on `nextStatus` whenever it receives `order_updated`. Carrying
a mere presence signal on that channel would move the card to another column
while the order's status has not changed. `customer_arrived` therefore carries
**no status field at all** — consumers must treat it as a highlight hint only.

Arrival does not drive the order lifecycle: the stand still decides when the
order moves to READY or PICKED_UP.

**Idempotent at the source.** A second tap re-emits nothing (`customerArrivedAt`
is already set), so the card does not flash twice. Clients must nonetheless
tolerate a duplicate delivery and de-duplicate on `eventId`, as with every other
event here.

### supplier_status_changed

Payload:

```json
{
  "eventName": "supplier_status_changed",
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "supplierId": "uuid",
  "status": "open|paused|closed|overloaded"
}
```

### rush_detected

Payload:

```json
{
  "eventName": "rush_detected",
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "eventIdRef": "uuid",
  "rushScore": 0,
  "severity": "low|medium|high|critical",
  "source": "flaix"
}
```

### queue_updated

Payload:

```json
{
  "eventName": "queue_updated",
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "supplierId": "uuid",
  "pickupPointId": "uuid",
  "currentLoad": 0,
  "estimatedWaitMinutes": 0
}
```

## Event IDs

Every realtime event must have a unique `eventId`.

Clients must ignore duplicated `eventId` values.

## Dashboard Resync

After reconnect, dashboards must call:

```text
GET /dashboards/:dashboardId/snapshot
```

The snapshot must return the full current state required to render the dashboard.

## Polling Fallback

Critical dashboards must poll when the socket is disconnected longer than the configured threshold.

Recommended V1 threshold:

```text
socket disconnected for 5 seconds -> start polling every 5 seconds
socket restored -> resync once -> stop polling
```

## Outbox Rule

For critical order events, use an outbox table or retry queue.

This prevents committed order transitions from being invisible when realtime emission fails.

