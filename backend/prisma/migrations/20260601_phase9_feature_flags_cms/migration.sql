-- Phase 9: Feature Flags + CMS (AppSettings)
-- Adds: flag_scope enum, feature_flags table, app_settings table

-- Enum for flag/setting scope
CREATE TYPE "flag_scope" AS ENUM ('GLOBAL', 'ORGANIZATION', 'EVENT');

-- Feature flags table
-- Unique constraint on (key, scope, scope_id) — null scope_id = global
CREATE TABLE "feature_flags" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "key"        TEXT        NOT NULL,
  "scope"      "flag_scope" NOT NULL,
  "scope_id"   UUID,
  "enabled"    BOOLEAN     NOT NULL DEFAULT false,
  "metadata"   JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "feature_flags_key_scope_scope_id_key" UNIQUE ("key", "scope", "scope_id")
);

CREATE INDEX "feature_flags_key_scope_idx" ON "feature_flags" ("key", "scope");

-- App settings table (basic CMS)
CREATE TABLE "app_settings" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "key"        TEXT        NOT NULL,
  "scope"      "flag_scope" NOT NULL,
  "scope_id"   UUID,
  "value"      JSONB       NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "app_settings_key_scope_scope_id_key" UNIQUE ("key", "scope", "scope_id")
);

CREATE INDEX "app_settings_key_scope_idx" ON "app_settings" ("key", "scope");

-- Trigger to auto-update updated_at on feature_flags
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "feature_flags_updated_at"
  BEFORE UPDATE ON "feature_flags"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "app_settings_updated_at"
  BEFORE UPDATE ON "app_settings"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
