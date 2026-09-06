-- Numero de commande COURT, par lieu et par jour de service.
--
-- « BE-00000023 » ne se crie pas a un comptoir, et au bout d'une saison la
-- reference atteint six chiffres. Le client et l'equipier ont besoin d'un
-- numero court, sans ambiguite CE SOIR-LA, dans CE LIEU-LA.
--
-- Par LIEU et non par buvette : un client qui se trompe de comptoir ne doit pas
-- y trouver un autre « 18 ». Dans un stade on se trompe de buvette, jamais de
-- stade.
--
-- La table plutot qu'un COUNT(*) sur les commandes : compter puis ajouter un
-- laisse deux paiements simultanes obtenir le meme numero. L'increment ci-dessous
-- tient en une instruction, que PostgreSQL serialise.
--
-- `daily_number` est NULLABLE : les commandes anterieures n'en ont pas, et
-- l'affichage retombe sur la reference longue. Rien du passe n'est reecrit.

ALTER TABLE "orders" ADD COLUMN "daily_number" INTEGER;

CREATE TABLE "order_counters" (
    "venue_id"     UUID    NOT NULL,
    "service_date" DATE    NOT NULL,
    "last_number"  INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "order_counters_pkey" PRIMARY KEY ("venue_id", "service_date")
);
