-- Phase 2 — Auth + Organizations
-- Run: pnpm db:migrate (requires Docker PostgreSQL running)

-- Enums
CREATE TYPE "global_role" AS ENUM ('SUPER_ADMIN', 'CUSTOMER');
CREATE TYPE "org_role" AS ENUM ('ORG_ADMIN', 'MANAGER', 'OPERATOR', 'MARKETING');
CREATE TYPE "org_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- Users
CREATE TABLE "users" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "email"         TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name"  TEXT NOT NULL,
    "phone"         TEXT,
    "global_role"   "global_role" NOT NULL DEFAULT 'CUSTOMER',
    "is_active"     BOOLEAN NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Organizations
CREATE TABLE "organizations" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "name"       TEXT NOT NULL,
    "slug"       TEXT NOT NULL,
    "status"     "org_status" NOT NULL DEFAULT 'ACTIVE',
    "settings"   JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- Organization members
CREATE TABLE "organization_members" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"         UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "org_role"        "org_role" NOT NULL DEFAULT 'OPERATOR',
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_members_user_id_organization_id_key"
    ON "organization_members"("user_id", "organization_id");

ALTER TABLE "organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Refresh tokens
CREATE TABLE "refresh_tokens" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"     UUID NOT NULL,
    "token_hash"  TEXT NOT NULL,
    "expires_at"  TIMESTAMP(3) NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
