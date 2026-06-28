-- ─────────────────────────────────────────────────────────────
-- Phase 16.2 — Mots-clés de recherche des lieux
--
-- Champ texte libre saisi par le club (ex. "marseille, spartiates, patinoire")
-- pour que l'app retrouve le lieu via plusieurs termes, en plus du nom/adresse.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "venues" ADD COLUMN "search_terms" TEXT;
