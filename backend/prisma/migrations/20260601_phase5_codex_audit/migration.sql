-- ─────────────────────────────────────────────────────────────
-- Phase 5 — Codex audit fixes (01/06/2026)
-- Adds price snapshot column to cart_items so that the PaymentIntent
-- amount and the Order.totalCents stay consistent even if the Product
-- price changes between checkout and webhook delivery.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "cart_items"
    ADD COLUMN "price_snapshot_cents" INTEGER;

-- Defensive: when set, must be >= 0
ALTER TABLE "cart_items"
    ADD CONSTRAINT "cart_items_price_snapshot_non_negative"
    CHECK ("price_snapshot_cents" IS NULL OR "price_snapshot_cents" >= 0);
