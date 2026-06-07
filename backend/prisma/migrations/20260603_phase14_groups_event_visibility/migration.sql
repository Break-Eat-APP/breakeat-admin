-- ─────────────────────────────────────────────────────────────
-- Phase 14 — Groups & Event Visibility
-- Adds user segmentation (groups) scoped to an organisation, plus
-- public/private visibility on events. Used (V1) to gate access to
-- private events to specific groups (e.g. "@boursorama.com" employees);
-- later for targeted promo codes.
--
-- All primary keys and foreign-key columns use UUID to match the UUID
-- type used since Phase 2 (users, organizations, events…). Running a
-- TEXT → UUID FK would fail at db:migrate on PostgreSQL.
-- Existing events default to PUBLIC — no visibility regression.
-- ─────────────────────────────────────────────────────────────

-- Enums
CREATE TYPE "group_member_source" AS ENUM ('MANUAL', 'DOMAIN');
CREATE TYPE "event_visibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- ─── events.visibility ────────────────────────────────────────
ALTER TABLE "events"
    ADD COLUMN "visibility" "event_visibility" NOT NULL DEFAULT 'PUBLIC';

-- ─── groups ───────────────────────────────────────────────────
CREATE TABLE "groups" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name"            TEXT NOT NULL,
    "description"     TEXT,
    "email_domain"    TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "groups"
    ADD CONSTRAINT "groups_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- One group name per organisation.
CREATE UNIQUE INDEX "groups_organization_id_name_key"
    ON "groups" ("organization_id", "name");

CREATE INDEX "groups_organization_id_idx" ON "groups" ("organization_id");
CREATE INDEX "groups_email_domain_idx"    ON "groups" ("email_domain");

-- ─── group_members ────────────────────────────────────────────
CREATE TABLE "group_members" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id"   UUID NOT NULL,
    "user_id"    UUID NOT NULL,
    "source"     "group_member_source" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "group_members"
    ADD CONSTRAINT "group_members_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_members"
    ADD CONSTRAINT "group_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- A user appears at most once per group.
CREATE UNIQUE INDEX "group_members_group_id_user_id_key"
    ON "group_members" ("group_id", "user_id");

CREATE INDEX "group_members_user_id_idx" ON "group_members" ("user_id");

-- ─── event_groups ─────────────────────────────────────────────
CREATE TABLE "event_groups" (
    "event_id"   UUID NOT NULL,
    "group_id"   UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_groups_pkey" PRIMARY KEY ("event_id", "group_id")
);

ALTER TABLE "event_groups"
    ADD CONSTRAINT "event_groups_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_groups"
    ADD CONSTRAINT "event_groups_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "event_groups_group_id_idx" ON "event_groups" ("group_id");
