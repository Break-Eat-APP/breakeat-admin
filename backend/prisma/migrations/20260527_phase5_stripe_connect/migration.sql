-- ─────────────────────────────────────────────────────────────
-- Phase 5 — Stripe Connect onboarding fields on suppliers
-- Adds account status tracking + capability mirrors so that the
-- API can answer "is this supplier ready to charge?" without a
-- live Stripe round-trip on every request.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "stripe_account_status" AS ENUM (
    'NOT_ONBOARDED',
    'PENDING',
    'ACTIVE',
    'RESTRICTED'
);

ALTER TABLE "suppliers"
    ADD COLUMN "stripe_account_status" "stripe_account_status" NOT NULL DEFAULT 'NOT_ONBOARDED',
    ADD COLUMN "stripe_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "stripe_payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "stripe_onboarded_at"    TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────
-- Carts + CartItems
-- All keys use UUID to match the rest of the schema.
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "cart_status" AS ENUM (
    'OPEN',
    'CHECKOUT_PENDING',
    'CONVERTED',
    'EXPIRED',
    'ABANDONED'
);

CREATE TABLE "carts" (
    "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"           UUID NOT NULL,
    "event_id"          UUID NOT NULL,
    "supplier_id"       UUID NOT NULL,
    "pickup_point_id"   UUID,
    "status"            "cart_status" NOT NULL DEFAULT 'OPEN',
    "payment_intent_id" TEXT,
    "expires_at"        TIMESTAMP(3) NOT NULL,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "carts_user_id_status_idx"  ON "carts" ("user_id", "status");
CREATE INDEX "carts_event_id_idx"        ON "carts" ("event_id");

ALTER TABLE "carts"
    ADD CONSTRAINT "carts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "carts"
    ADD CONSTRAINT "carts_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "carts"
    ADD CONSTRAINT "carts_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "carts"
    ADD CONSTRAINT "carts_pickup_point_id_fkey"
    FOREIGN KEY ("pickup_point_id") REFERENCES "pickup_points"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "cart_items" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id"    UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity"   INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cart_items_quantity_positive" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "cart_items_cart_product_key"
    ON "cart_items" ("cart_id", "product_id");

ALTER TABLE "cart_items"
    ADD CONSTRAINT "cart_items_cart_id_fkey"
    FOREIGN KEY ("cart_id") REFERENCES "carts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items"
    ADD CONSTRAINT "cart_items_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Orders, OrderItems, Payments, AuditTrail, WebhookEvents
-- ─────────────────────────────────────────────────────────────

CREATE TYPE "order_status" AS ENUM (
    'PAID',
    'ACCEPTED',
    'PREPARING',
    'READY',
    'PICKED_UP',
    'COMPLETED',
    'CANCELLED',
    'RECOVERED'
);

CREATE TYPE "payment_status" AS ENUM (
    'NOT_STARTED',
    'REQUIRES_ACTION',
    'PROCESSING',
    'SUCCEEDED',
    'FAILED',
    'REFUNDED',
    'PARTIALLY_REFUNDED'
);

CREATE TYPE "order_actor_type" AS ENUM (
    'SYSTEM',
    'CUSTOMER',
    'OPERATOR',
    'ADMIN',
    'FLAIX'
);

-- Public order number sequence — formatted as "BE-XXXXXXXX" in the service.
CREATE SEQUENCE "order_public_seq" START 1;

CREATE TABLE "orders" (
    "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_order_number" TEXT NOT NULL,
    "user_id"             UUID NOT NULL,
    "organization_id"     UUID NOT NULL,
    "event_id"            UUID NOT NULL,
    "venue_id"            UUID NOT NULL,
    "supplier_id"         UUID NOT NULL,
    "pickup_point_id"     UUID NOT NULL,
    "slot_id"             UUID,
    "status"              "order_status" NOT NULL DEFAULT 'PAID',
    "payment_status"      "payment_status" NOT NULL DEFAULT 'SUCCEEDED',
    "subtotal_cents"      INTEGER NOT NULL,
    "total_cents"         INTEGER NOT NULL,
    "currency"            TEXT NOT NULL DEFAULT 'eur',
    "metadata"            JSONB NOT NULL DEFAULT '{}',
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_subtotal_non_negative" CHECK ("subtotal_cents" >= 0),
    CONSTRAINT "orders_total_non_negative"    CHECK ("total_cents" >= 0)
);

CREATE UNIQUE INDEX "orders_public_order_number_key" ON "orders"("public_order_number");
CREATE INDEX "orders_user_id_idx"               ON "orders"("user_id");
CREATE INDEX "orders_event_id_status_idx"       ON "orders"("event_id", "status");
CREATE INDEX "orders_supplier_id_status_idx"    ON "orders"("supplier_id", "status");
CREATE INDEX "orders_organization_id_idx"       ON "orders"("organization_id");

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "order_items" (
    "id"                          UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id"                    UUID NOT NULL,
    "product_id"                  UUID NOT NULL,
    "product_name_snapshot"       TEXT NOT NULL,
    "unit_price_cents_snapshot"   INTEGER NOT NULL,
    "quantity"                    INTEGER NOT NULL,
    "line_total_cents"            INTEGER NOT NULL,
    "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unit_price_cents_snapshot" >= 0),
    CONSTRAINT "order_items_line_total_non_negative" CHECK ("line_total_cents" >= 0)
);

CREATE INDEX "order_items_order_id_idx"   ON "order_items"("order_id");
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

ALTER TABLE "order_items"
    ADD CONSTRAINT "order_items_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payments" (
    "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id"                 UUID,
    "stripe_payment_intent_id" TEXT NOT NULL,
    "status"                   "payment_status" NOT NULL DEFAULT 'NOT_STARTED',
    "amount_cents"             INTEGER NOT NULL,
    "currency"                 TEXT NOT NULL DEFAULT 'eur',
    "failure_reason"           TEXT,
    "raw_stripe_event"         JSONB,
    "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments"("stripe_payment_intent_id");
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "order_audit_trail" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id"       UUID NOT NULL,
    "actor_type"     "order_actor_type" NOT NULL,
    "actor_id"       TEXT,
    "previous_state" TEXT,
    "next_state"     TEXT NOT NULL,
    "reason"         TEXT,
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_audit_trail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_audit_trail_order_id_created_at_idx"
    ON "order_audit_trail"("order_id", "created_at");

ALTER TABLE "order_audit_trail"
    ADD CONSTRAINT "order_audit_trail_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "webhook_events" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "stripe_event_id"  TEXT NOT NULL,
    "event_type"       TEXT NOT NULL,
    "processed_at"     TIMESTAMP(3),
    "received_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_payload"      JSONB NOT NULL,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_events_stripe_event_id_key"
    ON "webhook_events"("stripe_event_id");

CREATE INDEX "webhook_events_event_type_received_at_idx"
    ON "webhook_events"("event_type", "received_at");
