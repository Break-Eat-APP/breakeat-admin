# BRAT EAT Flaix Contract

Version: V1 source of truth

## Principle

Flaix is the source of truth for rush management, slot intelligence and operational pacing.

BRAT EAT must never override a Flaix decision.

## Flaix Owns

- pickup slot optimization;
- rush scoring;
- dynamic throttling;
- queue balancing;
- preparation pacing;
- smart recommendations;
- operational flow decisions.

## BRAT EAT Owns

- user accounts;
- product catalog;
- cart;
- payment;
- persisted orders;
- operator dashboards;
- public ready screens;
- audit trail;
- feature flags;
- rendering Flaix decisions to users and operators.

## Integration Boundary

Flaix integration must live in the backend `flaix` module.

Other modules must not call external Flaix APIs directly.

Allowed internal calls:

```text
orders -> flaix
slots -> flaix
dashboards -> flaix
products -> flaix only for recommendation requests
```

## Decision Types

### Slot Decision

```json
{
  "decisionId": "uuid",
  "type": "slot_decision",
  "eventId": "uuid",
  "supplierId": "uuid-or-null",
  "pickupPointId": "uuid-or-null",
  "recommendedSlotId": "uuid",
  "reason": "rush|capacity|manual|balancing",
  "confidence": 0.95,
  "createdAt": "iso-date"
}
```

### Rush Decision

```json
{
  "decisionId": "uuid",
  "type": "rush_decision",
  "eventId": "uuid",
  "rushScore": 80,
  "severity": "low|medium|high|critical",
  "recommendedAction": "normal|slow_orders|pause_orders|expand_slots",
  "createdAt": "iso-date"
}
```

### Recommendation Decision

```json
{
  "decisionId": "uuid",
  "type": "recommendation_decision",
  "eventId": "uuid",
  "userId": "uuid-or-null",
  "productIds": ["uuid"],
  "context": "after_add_to_cart|checkout|rush_optimization",
  "createdAt": "iso-date"
}
```

## Failure Behavior

If Flaix is unavailable:

- never lose existing orders;
- continue using last known safe slot rules if available;
- disable advanced recommendations;
- display degraded operational status in admin/operator UI;
- log and alert the failure;
- do not invent new rush decisions.

## Audit Rule

Every applied Flaix decision must be stored:

- decision id;
- decision type;
- source payload;
- applied action;
- affected entity ids;
- timestamp.

