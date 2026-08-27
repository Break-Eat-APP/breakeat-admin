-- PHASE 24 — commander a plusieurs, « chacun paie sa part »
--
-- Le groupe ne porte aucun argent : chaque convive passe et paie SA commande.
-- Le rattachement sert a la buvette, qui prepare et remet l'ensemble d'un coup.
--
-- C'est ce qui rend la fonction sure : un ami qui renonce ne bloque personne,
-- et aucune commande ne reste « en attente du paiement d'un autre ».

CREATE TABLE IF NOT EXISTS "order_groups" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "event_id"    TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "created_by"  TEXT NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_groups_code_key" ON "order_groups"("code");
CREATE INDEX IF NOT EXISTS "order_groups_event_id_idx" ON "order_groups"("event_id");
CREATE INDEX IF NOT EXISTS "order_groups_created_by_expires_at_idx"
  ON "order_groups"("created_by", "expires_at");

ALTER TABLE "carts"  ADD COLUMN IF NOT EXISTS "order_group_id" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "order_group_id" TEXT;

CREATE INDEX IF NOT EXISTS "orders_order_group_id_idx" ON "orders"("order_group_id");
