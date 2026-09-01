-- TVA par produit.
--
-- La restauration n'a pas un taux, elle en a trois : 5,5 % (vente à emporter
-- sous emballage), 10 % (consommation immédiate) et 20 % (alcools, articles non
-- alimentaires). Jusqu'ici l'application dérivait le HT d'un taux unique lu
-- dans une variable d'environnement — juste pour une buvette qui ne vend que
-- des sandwichs, faux dès qu'elle sert une bière.
--
-- DEFAULT 1000 partout : les lignes déjà en base reprennent exactement le taux
-- qui servait à les déclarer (10 %). Les chiffres affichés hier restent donc
-- les chiffres affichés aujourd'hui — une migration comptable ne doit pas
-- réécrire le passé.

ALTER TABLE "products"           ADD COLUMN "vat_rate_bps" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "order_items"        ADD COLUMN "vat_rate_bps" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "order_split_units"  ADD COLUMN "vat_rate_bps" INTEGER NOT NULL DEFAULT 1000;
