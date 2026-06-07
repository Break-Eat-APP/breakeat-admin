-- ─────────────────────────────────────────────────────────────
-- Phase 7 Migration: Slots + Flaix Foundation
--
-- Adds:
--   • ENUM slot_status, slot_source, flaix_decision_type
--   • TABLE slots           — time-bounded pickup windows
--   • TABLE flaix_decisions — append-only audit of all Flaix calls
--   • COLUMN carts.selected_slot_id  (FK → slots.id)
--   • FK CONSTRAINT orders.slot_id → slots.id  (column already exists since Phase 5)
-- ─────────────────────────────────────────────────────────────

-- ─── ENUMS ───────────────────────────────────────────────────

CREATE TYPE "slot_status" AS ENUM (
  'OPEN',
  'FULL',
  'CLOSED'
);

CREATE TYPE "slot_source" AS ENUM (
  'MANUAL',
  'DEFAULT',
  'FLAIX'
);

CREATE TYPE "flaix_decision_type" AS ENUM (
  'SLOT_DECISION',
  'RUSH_DECISION',
  'RECOMMENDATION_DECISION'
);

-- ─── TABLE: slots ─────────────────────────────────────────────

CREATE TABLE "slots" (
  "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
  "event_id"         UUID          NOT NULL,
  "supplier_id"      UUID,
  "pickup_point_id"  UUID,
  "start_at"         TIMESTAMP(3)  NOT NULL,
  "end_at"           TIMESTAMP(3)  NOT NULL,
  "capacity"         INTEGER       NOT NULL,
  "current_load"     INTEGER       NOT NULL DEFAULT 0,
  "status"           "slot_status" NOT NULL DEFAULT 'OPEN',
  "source"           "slot_source" NOT NULL DEFAULT 'MANUAL',
  "label"            TEXT,
  "created_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "slots_pkey"                   PRIMARY KEY ("id"),
  CONSTRAINT "slots_event_id_fkey"          FOREIGN KEY ("event_id")
      REFERENCES "events"("id") ON DELETE CASCADE,
  CONSTRAINT "slots_supplier_id_fkey"       FOREIGN KEY ("supplier_id")
      REFERENCES "suppliers"("id") ON DELETE SET NULL,
  CONSTRAINT "slots_pickup_point_id_fkey"   FOREIGN KEY ("pickup_point_id")
      REFERENCES "pickup_points"("id") ON DELETE SET NULL,
  CONSTRAINT "slots_capacity_positive"      CHECK ("capacity" > 0),
  CONSTRAINT "slots_load_non_negative"      CHECK ("current_load" >= 0),
  CONSTRAINT "slots_load_le_capacity"       CHECK ("current_load" <= "capacity"),
  CONSTRAINT "slots_time_window"            CHECK ("end_at" > "start_at")
);

CREATE INDEX "slots_event_id_status_idx"  ON "slots" ("event_id", "status");
CREATE INDEX "slots_event_id_start_at_idx" ON "slots" ("event_id", "start_at");

-- ─── TABLE: flaix_decisions ───────────────────────────────────

CREATE TABLE "flaix_decisions" (
  "id"             UUID                    NOT NULL DEFAULT gen_random_uuid(),
  "decision_id"    TEXT                    NOT NULL,
  "type"           "flaix_decision_type"   NOT NULL,
  "event_id"       UUID                    NOT NULL,
  "slot_id"        UUID,
  "source_payload" JSONB                   NOT NULL,
  "applied_action" TEXT                    NOT NULL,
  "affected_ids"   TEXT[]                  NOT NULL DEFAULT '{}',
  "created_at"     TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "flaix_decisions_pkey"              PRIMARY KEY ("id"),
  CONSTRAINT "flaix_decisions_decision_id_key"   UNIQUE ("decision_id"),
  CONSTRAINT "flaix_decisions_event_id_fkey"     FOREIGN KEY ("event_id")
      REFERENCES "events"("id") ON DELETE CASCADE,
  CONSTRAINT "flaix_decisions_slot_id_fkey"      FOREIGN KEY ("slot_id")
      REFERENCES "slots"("id") ON DELETE SET NULL
);

CREATE INDEX "flaix_decisions_event_id_created_at_idx" ON "flaix_decisions" ("event_id", "created_at");
CREATE INDEX "flaix_decisions_type_event_id_idx"        ON "flaix_decisions" ("type", "event_id");

-- ─── ALTER TABLE: carts — add selected_slot_id ────────────────

ALTER TABLE "carts"
  ADD COLUMN "selected_slot_id" UUID,
  ADD CONSTRAINT "carts_selected_slot_id_fkey"
    FOREIGN KEY ("selected_slot_id") REFERENCES "slots"("id") ON DELETE SET NULL;

-- ─── ALTER TABLE: orders — add FK on existing slot_id column ──
-- The slot_id column was added in Phase 5 (as nullable UUID, no FK).
-- We now attach the foreign key constraint.

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_slot_id_fkey"
    FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE SET NULL;

CREATE INDEX "orders_slot_id_idx" ON "orders" ("slot_id");
