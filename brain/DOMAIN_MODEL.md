# BREAK EAT Domain Model

Version: V1 source of truth

## Core Entities

### User

Represents a customer, operator or admin.

Required fields:

- id
- email
- phone optional
- displayName
- role
- organizationId optional
- createdAt
- updatedAt

### Organization

Represents a company, venue operator or event owner.

Required fields:

- id
- name
- slug
- status
- settings
- createdAt
- updatedAt

### Venue

Represents a physical location.

Required fields:

- id
- organizationId
- name
- address
- timezone
- status

### Venue operating mode

Phase 22. A Venue carries `operatingMode`:

- `EVENT_BASED` — stadium, arena, concert hall. Sales happen per match, each with
  its own schedule and catalogue. Flaix drives these.
- `PERMANENT` — restaurant, corporate catering, airport, theme park. Open every
  day, the menu barely moves, there is no "event" to speak of.

**Why the mode exists.** `Order.eventId` and `Cart.eventId` are required, and
eight tables hang off Event. A permanent venue still needs somewhere for its
orders to live — but asking an operator to create one event per day would be
absurd. So Break Eat creates, on its own, a single open-ended Event flagged
`isPermanentContainer`, ACTIVE from birth.

That container is invisible on purpose: excluded from event listings and from
org statistics, and rejected by every event mutation. Renaming or closing it
would strip the venue of its only anchor — no order could be placed, and the
failure would be unintelligible to the club.

Switching a venue to PERMANENT creates the container if missing. Switching back
to EVENT_BASED never deletes it: past orders are attached to it. It simply goes
dormant.

A partial unique index enforces one container per venue at the database level,
so two concurrent mode switches cannot silently produce two containers with
orders scattered between them.

### Event

Represents a time-bound ordering context.

Required fields:

- id
- organizationId
- venueId
- name
- startAt
- endAt
- status
- activeFeatureFlags

### Supplier

Represents a food, drink or merchandise operator.

Required fields:

- id
- organizationId
- eventId optional
- name
- status
- preparationZone

### PickupPoint

Represents a pickup location inside a venue or event.

Required fields:

- id
- organizationId
- venueId
- eventId optional
- supplierId optional
- name
- status

### Category

Required fields:

- id
- supplierId
- name
- sortOrder
- status

### Product

Required fields:

- id
- supplierId
- categoryId
- name
- description
- price
- imageUrl optional
- status
- availableFrom optional
- availableUntil optional

### Stock

Stock is scoped by supplier and pickup point when applicable.

Required fields:

- id
- productId
- supplierId
- pickupPointId optional
- quantity
- isAvailable
- updatedAt

### Cart

Cart is temporary and belongs to a user or guest session.

Required fields:

- id
- userId optional
- guestSessionId optional
- eventId
- items
- selectedSlotId optional
- totals
- expiresAt

### Order

Order is the critical business entity.

Required fields:

- id
- publicOrderNumber
- userId
- organizationId
- venueId
- eventId
- supplierIds
- pickupPointId
- slotId optional
- status
- paymentStatus
- itemsSnapshot
- totalsSnapshot
- auditTrail
- createdAt
- updatedAt

Phase 19/20 fields:

- estimatedReadyAt optional — expected pickup time, drives the live status in "Mes commandes"
- customerArrivedAt optional — set once when the customer announces their presence
- discountCents — loyalty discount applied, always `subtotal - discount = total`
- pointsRedeemed / pointsEarned — mirrors of the ledger, for reading an order without joining LoyaltyTransaction

Orders must use snapshots for items and totals. Never depend on mutable product data to render historical orders.

`customerArrivedAt` records a fact, not a state: it never changes `status`. The
stand alone drives the lifecycle — a customer standing at the counter does not
make an order ready. Setting it is idempotent; a second announcement is a no-op.

### Payment

Required fields:

- id
- orderId optional
- stripePaymentIntentId
- status
- amount
- currency
- failureReason optional
- createdAt
- updatedAt

### Slot

Required fields:

- id
- eventId
- supplierId optional
- pickupPointId optional
- startAt
- endAt
- capacity
- currentLoad
- status
- source

`source` must indicate whether the slot came from manual config, default rules or Flaix.

### LoyaltyAccount

A customer's point balance **with one club**. Phase 20.

Required fields:

- id
- userId
- organizationId
- balance

Scope is deliberately split from configuration: the programme is **configured on
the Venue** (`loyaltyEnabled`, `loyaltyPointsPerEuro`, `loyaltyPointValueCents`)
because the club decides its own rates, but the **balance lives on the
Organization** so points follow the club rather than a building — a customer
keeps them from one event to the next.

`balance` is a cache. The truth is the sum of the ledger below; the two are
always written in the same transaction, never one without the other.

### LoyaltyTransaction

Append-only ledger of point movements. Phase 20.

Required fields:

- id
- accountId
- orderId
- kind — EARN or REDEEM
- points — positive on EARN, negative on REDEEM
- balanceAfter — the account balance once this movement was applied
- createdAt

Rules:

- Unique on `(orderId, kind)`. An order credits at most once and debits at most
  once, so a replayed transition has no effect.
- Entries are never updated or deleted. A correction is a new movement.
- `balance` must always equal the sum of `points` for the account. Any code
  touching the balance uses a database-side `increment` / `decrement`, never a
  read-then-write of an absolute value — concurrent orders would otherwise lose
  a movement or spend the same points twice.
- A redemption always leaves a payable minimum on the order (see
  `MIN_PAYABLE_CENTS`): points reduce a bill, they never settle it entirely,
  because the payment provider rejects amounts below its floor.

## Relationship Rules

- One organization has many venues.
- One organization has many events.
- One event belongs to one venue.
- One event can have many suppliers.
- One supplier can have many products.
- One supplier can have many pickup points.
- One order belongs to one event.
- One order can contain products from multiple suppliers only if the multi-vendor flag is enabled.
- One order must have one customer-facing pickup point.
- One customer has at most one loyalty account per organization.
- One loyalty account has many loyalty transactions.
- One order produces at most one EARN and one REDEEM transaction.

## Audit Trail Rules

Every order must store an append-only audit trail:

- actor type: system, user, operator, admin, flaix;
- actor id optional;
- previous state;
- next state;
- reason optional;
- timestamp;
- metadata optional.

Never overwrite the audit trail.

