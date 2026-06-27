-- ─────────────────────────────────────────────────────────────
-- Phase 15 — Notifications push (C1/C2/C3) & parrainage exploitant externe
--
-- Rattrape les objets ajoutés au schéma Prisma mais jamais matérialisés en
-- migration (ils n'existaient qu'en SQL direct sur la base de dev). Sans ce
-- fichier, une base neuve (Railway) ne crée NI scheduled_pushes, NI push_tokens,
-- NI suppliers.is_external / referral_code.
--
--   • scheduled_pushes — push programmé (C2) + campagne promo auto (C3).
--   • push_tokens      — jetons Expo enregistrés par appareil (C1/C2/C3).
--   • suppliers.is_external / referral_code — exploitant externe + parrainage.
--
-- Conventions identiques aux migrations précédentes : PK UUID gen_random_uuid(),
-- FK ON DELETE CASCADE, updated_at géré par Prisma (@updatedAt) côté write.
-- ─────────────────────────────────────────────────────────────

-- ─── scheduled_pushes ─────────────────────────────────────────
CREATE TABLE "scheduled_pushes" (
    "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id"  UUID NOT NULL,
    "event_id"         UUID,
    "kind"             TEXT NOT NULL DEFAULT 'PUSH',
    "title"            TEXT NOT NULL,
    "body"             TEXT NOT NULL DEFAULT '',
    "discount_percent" INTEGER,
    "scheduled_at"     TIMESTAMP(3) NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'PENDING',
    "sent_at"          TIMESTAMP(3),
    "sent_count"       INTEGER NOT NULL DEFAULT 0,
    "created_by"       TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_pushes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "scheduled_pushes"
    ADD CONSTRAINT "scheduled_pushes_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_pushes"
    ADD CONSTRAINT "scheduled_pushes_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "scheduled_pushes_status_scheduled_at_idx"
    ON "scheduled_pushes" ("status", "scheduled_at");

CREATE INDEX "scheduled_pushes_organization_id_idx"
    ON "scheduled_pushes" ("organization_id");

-- ─── push_tokens ──────────────────────────────────────────────
CREATE TABLE "push_tokens" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID NOT NULL,
    "token"      TEXT NOT NULL,
    "platform"   TEXT NOT NULL DEFAULT 'unknown',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens" ("token");

CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens" ("user_id");

-- ─── suppliers : exploitant externe + parrainage ──────────────
ALTER TABLE "suppliers"
    ADD COLUMN "is_external"   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "referral_code" TEXT;

CREATE UNIQUE INDEX "suppliers_referral_code_key"
    ON "suppliers" ("referral_code");
