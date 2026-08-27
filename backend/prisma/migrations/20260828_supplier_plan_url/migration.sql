-- PHASE 24 — un plan PAR BUVETTE
--
-- `venues.buvette_plan_url` porte un plan unique pour tout le lieu. Un stade
-- avec quatre comptoirs affichait donc le même plan à tous les clients, à
-- charge pour eux de trouver le bon sur l'image. Le plan qui sert vraiment est
-- celui qui mène AU comptoir où la commande attend.
--
-- Le champ du lieu reste : il devient le plan par défaut, utilisé tant qu'une
-- buvette n'a pas le sien. Aucune configuration existante ne se casse.

ALTER TABLE "suppliers"
  ADD COLUMN IF NOT EXISTS "plan_url" TEXT;
