-- LE BAIL DE L'OUTBOX — réserver jusqu'à l'émission, pas seulement le temps
-- de la requête.
--
-- `FOR UPDATE SKIP LOCKED` ne verrouille que pendant la requête qui réserve.
-- Une fois celle-ci terminée, la ligne reste `delivered_at IS NULL` : une
-- autre réplique la reprenait avant que la première n'ait fini d'émettre, et
-- le comptoir voyait la même commande arriver deux fois.
--
-- Le bail couvre la phase d'émission. Il EXPIRE, et c'est tout l'intérêt : un
-- ouvrier qui meurt entre la réservation et l'envoi ne retient pas la ligne
-- pour toujours — elle repart au tour suivant, une fois le bail échu.
ALTER TABLE "realtime_outbox" ADD COLUMN "claimed_until" TIMESTAMP(3);

-- L'index suit la requête de l'ouvrier : non livrées, bail échu, les plus
-- anciennes d'abord. Sans `claimed_until` dedans, Postgres lirait puis
-- filtrerait — exactement ce qu'on évite sur une table qui enfle en incident.
DROP INDEX IF EXISTS "realtime_outbox_delivered_at_created_at_idx";

CREATE INDEX "realtime_outbox_delivered_at_claimed_until_created_at_idx"
    ON "realtime_outbox"("delivered_at", "claimed_until", "created_at");
