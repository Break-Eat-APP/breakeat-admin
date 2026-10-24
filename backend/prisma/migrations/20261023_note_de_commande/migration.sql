-- PHASE 63 — la note qu'un client laisse sur sa commande.
--
-- `order_id` UNIQUE : une note par commande, et la contrainte est ICI. Une
-- verification applicative se contourne par deux requetes simultanees, et le
-- club se retrouverait avec deux notes pour un meme retrait.
--
-- La borne 1..5 est posee en base pour la meme raison : une moyenne calculee
-- sur un 0 ou un 7 serait fausse sans que rien ne le signale.
--
-- LES IDENTIFIANTS SONT EN UUID, PAS EN TEXT -- et c'est la raison pour
-- laquelle la premiere version de ce fichier a echoue en production le
-- 23/10/2026 :
--
--   ERROR: foreign key constraint "order_ratings_order_id_fkey" cannot be
--   implemented
--   DETAIL: Key columns "order_id" and "id" are of incompatible types:
--           text and uuid.
--
-- Prisma rend `String @default(uuid())` en TEXT par defaut, mais CETTE base
-- declare ses cles en UUID depuis `20260527_phase5_stripe_connect`. Une
-- migration ecrite a la main doit suivre la base, pas le defaut de l'outil :
-- le schema Prisma dit le TYPE DU LANGAGE, le SQL dit celui de la COLONNE.
--
-- Postgres refuse aussi de comparer `uuid` et `text` : des colonnes TEXT ici
-- auraient casse toute jointure vers `orders`, `venues` ou `organizations`,
-- bien au-dela de cette seule contrainte.
CREATE TABLE "order_ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "venue_id" UUID,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_ratings_stars_range" CHECK ("stars" >= 1 AND "stars" <= 5)
);

CREATE UNIQUE INDEX "order_ratings_order_id_key" ON "order_ratings"("order_id");
CREATE INDEX "order_ratings_supplier_id_created_at_idx" ON "order_ratings"("supplier_id", "created_at");
CREATE INDEX "order_ratings_organization_id_created_at_idx" ON "order_ratings"("organization_id", "created_at");

ALTER TABLE "order_ratings"
  ADD CONSTRAINT "order_ratings_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
