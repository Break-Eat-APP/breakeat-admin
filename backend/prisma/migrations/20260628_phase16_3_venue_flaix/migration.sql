-- ─────────────────────────────────────────────────────────────
-- Phase 16.3 — Intégration Flaix au niveau du lieu
--
-- flaix_enabled  : quand vrai, l'app passe le relais à Flaix (API) au lieu du
--                  parcours de commande Break Eat natif.
-- flaix_venue_id : identifiant du lieu côté Flaix (utilisé par les appels API).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "venues"
    ADD COLUMN "flaix_enabled"  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "flaix_venue_id" TEXT;
