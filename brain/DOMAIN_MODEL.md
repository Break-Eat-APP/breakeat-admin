# BRAT EAT Domain Model

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

Orders must use snapshots for items and totals. Never depend on mutable product data to render historical orders.

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

