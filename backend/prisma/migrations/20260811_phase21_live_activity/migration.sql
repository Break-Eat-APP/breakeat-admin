-- ─────────────────────────────────────────────────────────────
-- Phase 21 — Live Activity iOS (suivi de commande sur écran verrouillé)
--
-- live_activities      : une Live Activity = une commande + un client + un
--                        token push PROPRE A L'ACTIVITE (≠ push_tokens, qui
--                        identifie un appareil et vit bien plus longtemps).
-- flaix_webhook_events : journal des événements reçus de Flaix. L'unicité de
--                        event_id assure l'idempotence (un même événement
--                        réémis n'est traité qu'une fois) et sert d'audit.
-- orders.estimated_ready_at : heure de disponibilité estimée (calculée par
--                        Flaix), affichée et réévaluable dans la Live Activity.
--
-- Types UUID + gen_random_uuid() : convention des tables existantes.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "orders"
    ADD COLUMN "estimated_ready_at" TIMESTAMP(3);

CREATE TYPE "live_activity_status" AS ENUM ('ACTIVE', 'ENDED', 'STALE');

CREATE TABLE "live_activities" (
    "id"          UUID                  NOT NULL DEFAULT gen_random_uuid(),
    "user_id"     UUID                  NOT NULL,
    "order_id"    UUID                  NOT NULL,
    "activity_id" TEXT                  NOT NULL,
    "push_token"  TEXT                  NOT NULL,
    "status"      "live_activity_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at"  TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)          NOT NULL,
    "ended_at"    TIMESTAMP(3),
    CONSTRAINT "live_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_activities_push_token_key"
    ON "live_activities" ("push_token");
CREATE UNIQUE INDEX "live_activities_order_id_activity_id_key"
    ON "live_activities" ("order_id", "activity_id");
CREATE INDEX "live_activities_order_id_status_idx"
    ON "live_activities" ("order_id", "status");
CREATE INDEX "live_activities_user_id_idx"
    ON "live_activities" ("user_id");

ALTER TABLE "live_activities"
    ADD CONSTRAINT "live_activities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_activities"
    ADD CONSTRAINT "live_activities_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "flaix_webhook_events" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "event_id"     TEXT         NOT NULL,
    "event_type"   TEXT         NOT NULL,
    "order_id"     UUID,
    "payload"      JSONB        NOT NULL,
    "received_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error"        TEXT,
    CONSTRAINT "flaix_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "flaix_webhook_events_event_id_key"
    ON "flaix_webhook_events" ("event_id");
CREATE INDEX "flaix_webhook_events_event_type_received_at_idx"
    ON "flaix_webhook_events" ("event_type", "received_at");
CREATE INDEX "flaix_webhook_events_order_id_idx"
    ON "flaix_webhook_events" ("order_id");
