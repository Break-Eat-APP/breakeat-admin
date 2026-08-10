-- ─────────────────────────────────────────────────────────────
-- Phase 20 — Programme de fidélité (gain + utilisation)
--
-- Activation PAR LIEU (le club décide), solde PAR ORGANISATION (les points
-- suivent le club d'un événement à l'autre).
--
-- loyalty_accounts     : solde courant d'un client chez un club.
-- loyalty_transactions : registre immuable des mouvements (source de vérité).
--                        L'unicité (order_id, kind) garantit qu'une commande ne
--                        crédite ni ne débite deux fois, même si une transition
--                        de statut est rejouée.
-- ─────────────────────────────────────────────────────────────

-- 1) Configuration du programme, portée par le lieu
ALTER TABLE "venues"
    ADD COLUMN "loyalty_enabled"           BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "loyalty_points_per_euro"   INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "loyalty_point_value_cents" INTEGER NOT NULL DEFAULT 1;

-- 2) Points choisis par le client sur son panier
ALTER TABLE "carts"
    ADD COLUMN "redeemed_points" INTEGER NOT NULL DEFAULT 0;

-- 3) Remise et points figés sur la commande
ALTER TABLE "orders"
    ADD COLUMN "discount_cents"  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "points_redeemed" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "points_earned"   INTEGER NOT NULL DEFAULT 0;

-- 4) Nature d'un mouvement de points
CREATE TYPE "loyalty_entry_kind" AS ENUM ('EARN', 'REDEEM', 'ADJUST');

-- 5) Solde par (client, club)
-- Types UUID + gen_random_uuid() : convention des tables existantes (les PK sont
-- des uuid en base, cf. dérive historique documentée dans REPRISE.md). Un TEXT
-- ici rendrait les clés étrangères impossibles à créer.
CREATE TABLE "loyalty_accounts" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"         UUID         NOT NULL,
    "organization_id" UUID         NOT NULL,
    "balance"         INTEGER      NOT NULL DEFAULT 0,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "loyalty_accounts_user_id_organization_id_key"
    ON "loyalty_accounts" ("user_id", "organization_id");
CREATE INDEX "loyalty_accounts_organization_id_idx"
    ON "loyalty_accounts" ("organization_id");

ALTER TABLE "loyalty_accounts"
    ADD CONSTRAINT "loyalty_accounts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loyalty_accounts"
    ADD CONSTRAINT "loyalty_accounts_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) Registre des mouvements
CREATE TABLE "loyalty_transactions" (
    "id"            UUID                 NOT NULL DEFAULT gen_random_uuid(),
    "account_id"    UUID                 NOT NULL,
    "order_id"      UUID,
    "kind"          "loyalty_entry_kind" NOT NULL,
    "points"        INTEGER              NOT NULL,
    "balance_after" INTEGER              NOT NULL,
    "created_at"    TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "loyalty_transactions_order_id_kind_key"
    ON "loyalty_transactions" ("order_id", "kind");
CREATE INDEX "loyalty_transactions_account_id_created_at_idx"
    ON "loyalty_transactions" ("account_id", "created_at");

ALTER TABLE "loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "loyalty_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
