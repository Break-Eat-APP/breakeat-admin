-- LES POINTS SE RÉSERVENT AVANT LE PAIEMENT.
--
-- Le débit des points vivait DANS la transaction de création de commande, donc
-- après que Stripe ait confirmé le paiement. Si les points avaient été dépensés
-- entre-temps sur une autre commande, cette transaction échouait : le client
-- était débité de sa carte, la commande n'existait pas, et le solde ne
-- redevenait pas disponible tout seul. Le webhook rejouait, et échouait pareil.
--
-- Le refus doit arriver AVANT le paiement, là où il ne coûte qu'un message.

-- Deux mouvements de plus au registre : la réservation, et son retour.
ALTER TYPE "loyalty_entry_kind" ADD VALUE IF NOT EXISTS 'HOLD';
ALTER TYPE "loyalty_entry_kind" ADD VALUE IF NOT EXISTS 'RELEASE';

-- Le panier porte SA réservation. UNIQUE : deux paniers ne peuvent pas se
-- partager le même mouvement, et un panier n'en a jamais deux.
ALTER TABLE "carts" ADD COLUMN "loyalty_hold_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "carts_loyalty_hold_id_key"
  ON "carts"("loyalty_hold_id");

-- Et le registre dit de quel panier vient la réservation : sans cela, un HOLD
-- rendu (RELEASE) ne se rattacherait à rien de lisible.
ALTER TABLE "loyalty_transactions" ADD COLUMN "cart_id" TEXT;
CREATE INDEX IF NOT EXISTS "loyalty_transactions_cart_id_idx"
  ON "loyalty_transactions"("cart_id");
