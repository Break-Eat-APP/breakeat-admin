-- L'ORDRE D'ARRIVÉE DE L'OUTBOX — et il ne se déduit PAS de `created_at`.
--
-- Deux annonces déposées dans la MÊME transaction — un `order_updated` et le
-- `order_ready` qui le suit — portent la même date à la milliseconde près.
-- `ORDER BY created_at` a donc des ex æquo, et PostgreSQL rend alors les
-- lignes dans l'ordre qu'il veut.
--
-- Mesuré sur une vraie base le 30/10 : quinze lignes insérées ensemble
-- ressortaient mélangées. Le commentaire du service promettait pourtant
-- l'ordre d'arrivée — « un order_updated rejoué avant son new_order
-- afficherait une commande qui avance avant d'exister ».
--
-- Une séquence tranche : strictement croissante, insertion par insertion.
ALTER TABLE "realtime_outbox" ADD COLUMN "sequence" BIGSERIAL;

-- L'index suit la requête de l'ouvrier : non livrées, bail échu, par ordre
-- d'arrivée. Trier sur une colonne absente de l'index ferait trier en mémoire
-- — exactement ce qu'on évite sur une table qui enfle pendant un incident.
DROP INDEX IF EXISTS "realtime_outbox_delivered_at_claimed_until_created_at_idx";

CREATE INDEX "realtime_outbox_delivered_at_claimed_until_sequence_idx"
    ON "realtime_outbox"("delivered_at", "claimed_until", "sequence");
