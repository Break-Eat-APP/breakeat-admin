-- PHASE 25 — « l'ardoise » : composer a plusieurs, regler chacun sa part
--
-- Un groupe arrive au stade, UNE personne installe l'app. Elle compose la
-- tournee, partage un lien, et chacun ouvre une page web pour prendre SES
-- articles et les payer par carte. Aucun autre telechargement.
--
-- Chaque convive paie SA nourriture a la buvette : ce sont des ventes normales
-- (destination charges Connect), jamais une collecte d'argent pour un tiers.
--
-- Les cartes sont AUTORISEES puis encaissees au depart de la commande : si la
-- tournee capote, rien a rembourser, une autorisation non capturee se libere.

CREATE TYPE "order_split_status" AS ENUM ('OPEN', 'SENT', 'CANCELLED');
CREATE TYPE "order_split_unit_status" AS ENUM ('FREE', 'RESERVED', 'PAID');
CREATE TYPE "order_split_share_status" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'CANCELLED');

CREATE TABLE "order_splits" (
  "id"               TEXT NOT NULL,
  "code"             TEXT NOT NULL,
  "organization_id"  TEXT NOT NULL,
  "event_id"         TEXT NOT NULL,
  "venue_id"         TEXT NOT NULL,
  "supplier_id"      TEXT NOT NULL,
  "pickup_point_id"  TEXT,
  "selected_slot_id" TEXT,
  "host_user_id"     TEXT NOT NULL,
  "status"           "order_split_status" NOT NULL DEFAULT 'OPEN',
  "order_id"         TEXT,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  "expires_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_splits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_split_shares" (
  "id"                       TEXT NOT NULL,
  "split_id"                 TEXT NOT NULL,
  "claimant_name"            TEXT,
  "is_host"                  BOOLEAN NOT NULL DEFAULT false,
  "amount_cents"             INTEGER NOT NULL,
  "status"                   "order_split_share_status" NOT NULL DEFAULT 'PENDING',
  "stripe_session_id"        TEXT,
  "stripe_payment_intent_id" TEXT,
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_split_shares_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_split_units" (
  "id"               TEXT NOT NULL,
  "split_id"         TEXT NOT NULL,
  "product_id"       TEXT NOT NULL,
  "product_name"     TEXT NOT NULL,
  "unit_price_cents" INTEGER NOT NULL,
  "status"           "order_split_unit_status" NOT NULL DEFAULT 'FREE',
  "share_id"         TEXT,
  "reserved_until"   TIMESTAMP(3),
  CONSTRAINT "order_split_units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_splits_code_key" ON "order_splits"("code");
CREATE INDEX "order_splits_host_user_id_status_idx" ON "order_splits"("host_user_id", "status");
CREATE UNIQUE INDEX "order_split_shares_stripe_session_id_key"
  ON "order_split_shares"("stripe_session_id");
CREATE UNIQUE INDEX "order_split_shares_stripe_payment_intent_id_key"
  ON "order_split_shares"("stripe_payment_intent_id");
CREATE INDEX "order_split_shares_split_id_status_idx" ON "order_split_shares"("split_id", "status");
CREATE INDEX "order_split_units_split_id_status_idx" ON "order_split_units"("split_id", "status");

ALTER TABLE "order_split_shares"
  ADD CONSTRAINT "order_split_shares_split_id_fkey"
  FOREIGN KEY ("split_id") REFERENCES "order_splits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_split_units"
  ADD CONSTRAINT "order_split_units_split_id_fkey"
  FOREIGN KEY ("split_id") REFERENCES "order_splits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_split_units"
  ADD CONSTRAINT "order_split_units_share_id_fkey"
  FOREIGN KEY ("share_id") REFERENCES "order_split_shares"("id") ON DELETE SET NULL ON UPDATE CASCADE;
