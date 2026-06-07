-- ─────────────────────────────────────────────────────────────
-- Phase 11 — Configurable Operator Screens
-- (Added after Phase 14 chronologically; Phase 11 = the operator dashboard.)
--
-- Builds the data foundation for the rebuilt OPERATOR board:
--   • slots.kind        — a STABLE "moment de récupération" role so reusable
--                          screen templates can target a moment (IMMEDIATE /
--                          PAUSE_1 / PAUSE_2 …) across events without binding to
--                          per-event slot UUIDs. Existing slots default to
--                          IMMEDIATE (prepare/collect ASAP) — no behaviour change.
--   • operator_screen_templates — org-level, reusable screen definitions.
--   • event_operator_screens    — junction applying a template to one event with
--                                  per-event ordering / enable toggle.
--
-- All UUID PKs/FKs match the UUID type used since Phase 2.
-- updated_at is managed by Prisma (@updatedAt) on write — no DB trigger needed,
-- consistent with the Phase 14 migration style.
-- ─────────────────────────────────────────────────────────────

-- ─── Enums ────────────────────────────────────────────────────
CREATE TYPE "slot_kind" AS ENUM ('IMMEDIATE', 'PAUSE_1', 'PAUSE_2', 'GENERAL', 'CUSTOM');
CREATE TYPE "operator_screen_kind" AS ENUM ('ORDERS_QUEUE', 'READY', 'RECOVERED', 'GENERAL');

-- ─── slots.kind ───────────────────────────────────────────────
ALTER TABLE "slots"
    ADD COLUMN "kind" "slot_kind" NOT NULL DEFAULT 'IMMEDIATE';

-- ─── operator_screen_templates ────────────────────────────────
CREATE TABLE "operator_screen_templates" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name"            TEXT NOT NULL,
    "kind"            "operator_screen_kind" NOT NULL DEFAULT 'ORDERS_QUEUE',
    "icon"            TEXT,
    "sort_order"      INTEGER NOT NULL DEFAULT 0,
    "enabled"         BOOLEAN NOT NULL DEFAULT true,
    "slot_kinds"      "slot_kind"[] NOT NULL DEFAULT ARRAY[]::"slot_kind"[],
    "statuses"        "order_status"[] NOT NULL DEFAULT ARRAY[]::"order_status"[],
    "supplier_ids"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "filters"         JSONB NOT NULL DEFAULT '{}',
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operator_screen_templates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "operator_screen_templates"
    ADD CONSTRAINT "operator_screen_templates_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "operator_screen_templates_organization_id_idx"
    ON "operator_screen_templates" ("organization_id");

-- ─── event_operator_screens ───────────────────────────────────
CREATE TABLE "event_operator_screens" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id"    UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "sort_order"  INTEGER,
    "enabled"     BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_operator_screens_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "event_operator_screens"
    ADD CONSTRAINT "event_operator_screens_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_operator_screens"
    ADD CONSTRAINT "event_operator_screens_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "operator_screen_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- A template is applied at most once per event.
CREATE UNIQUE INDEX "event_operator_screens_event_id_template_id_key"
    ON "event_operator_screens" ("event_id", "template_id");

CREATE INDEX "event_operator_screens_event_id_idx"
    ON "event_operator_screens" ("event_id");
