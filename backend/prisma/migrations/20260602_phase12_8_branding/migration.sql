-- Phase 12.8 — Branding fields
-- Adds logo URL, primary colour, and description to organizations and events.
-- These are URL-based in V1 (no file upload). Used by the admin panel
-- branding editor and surfaced in the mobile app public event view.

ALTER TABLE "organizations"
  ADD COLUMN "logo_url"      TEXT,
  ADD COLUMN "primary_color" TEXT,
  ADD COLUMN "description"   TEXT;

ALTER TABLE "events"
  ADD COLUMN "description"   TEXT,
  ADD COLUMN "logo_url"      TEXT,
  ADD COLUMN "primary_color" TEXT;
