-- ─────────────────────────────────────────────────────────────
-- Phase 16 — Coordonnées des lieux (découverte géolocalisée mobile)
--
-- Ajoute latitude/longitude (nullable) à venues pour permettre le tri et le
-- filtrage par proximité dans l'écran « Lieux » de l'app mobile.
-- Endpoint public associé : GET /api/v1/public/venues?q=&lat=&lng=.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "venues"
    ADD COLUMN "latitude"  DOUBLE PRECISION,
    ADD COLUMN "longitude" DOUBLE PRECISION;
