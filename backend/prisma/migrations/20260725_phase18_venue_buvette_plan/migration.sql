-- ─────────────────────────────────────────────────────────────
-- Phase 18 — Plan des buvettes au niveau du lieu
--
-- buvette_plan_url : URL de l'image du plan des buvettes (créée via Canva puis
--                    hébergée). Affichée dans l'app mobile pour aider le client
--                    à localiser la/les buvette(s). Nullable.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "venues"
    ADD COLUMN "buvette_plan_url" TEXT;
