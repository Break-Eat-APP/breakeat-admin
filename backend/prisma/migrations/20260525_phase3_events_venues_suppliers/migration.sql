-- Phase 3 — Events, Venues, Suppliers, Pickup Points
-- Run: pnpm db:migrate (requires Docker PostgreSQL running)

-- ─── Enums ────────────────────────────────────────────────────

CREATE TYPE "venue_status" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TYPE "event_status" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED');

CREATE TYPE "supplier_status" AS ENUM ('OPEN', 'CLOSED', 'PAUSED', 'OFFLINE');

CREATE TYPE "pickup_point_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- ─── Venues ───────────────────────────────────────────────────

CREATE TABLE "venues" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name"            TEXT NOT NULL,
    "address"         TEXT NOT NULL,
    "timezone"        TEXT NOT NULL DEFAULT 'Europe/Paris',
    "status"          "venue_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "venues"
    ADD CONSTRAINT "venues_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Events ───────────────────────────────────────────────────

CREATE TABLE "events" (
    "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"      UUID NOT NULL,
    "venue_id"             UUID NOT NULL,
    "name"                 TEXT NOT NULL,
    "start_at"             TIMESTAMP(3) NOT NULL,
    "end_at"               TIMESTAMP(3) NOT NULL,
    "status"               "event_status" NOT NULL DEFAULT 'DRAFT',
    "active_feature_flags" JSONB NOT NULL DEFAULT '{}',
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "events"
    ADD CONSTRAINT "events_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "events"
    ADD CONSTRAINT "events_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Suppliers ────────────────────────────────────────────────

CREATE TABLE "suppliers" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"  UUID NOT NULL,
    "name"             TEXT NOT NULL,
    "status"           "supplier_status" NOT NULL DEFAULT 'CLOSED',
    "preparation_zone" TEXT,
    "stripe_account_id" TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "suppliers"
    ADD CONSTRAINT "suppliers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Event ↔ Supplier junction ────────────────────────────────

CREATE TABLE "event_suppliers" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id"    UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_suppliers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_suppliers_event_id_supplier_id_key"
    ON "event_suppliers"("event_id", "supplier_id");

ALTER TABLE "event_suppliers"
    ADD CONSTRAINT "event_suppliers_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_suppliers"
    ADD CONSTRAINT "event_suppliers_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Pickup Points ────────────────────────────────────────────

CREATE TABLE "pickup_points" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "venue_id"        UUID NOT NULL,
    "event_id"        UUID,
    "supplier_id"     UUID,
    "name"            TEXT NOT NULL,
    "status"          "pickup_point_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_points_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pickup_points"
    ADD CONSTRAINT "pickup_points_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pickup_points"
    ADD CONSTRAINT "pickup_points_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pickup_points"
    ADD CONSTRAINT "pickup_points_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pickup_points"
    ADD CONSTRAINT "pickup_points_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
