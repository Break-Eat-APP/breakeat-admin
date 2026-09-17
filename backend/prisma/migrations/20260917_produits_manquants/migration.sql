-- Produits manquants.
--
-- Il arrive qu'un produit affiché disponible ne le soit plus au comptoir : une
-- erreur de gestion, un fût vide. Le comptoir le signale sur la commande, et le
-- client l'apprend avant d'arriver — sur sa Live Activity et dans l'app.
--
-- Porté par la LIGNE et non par la commande : un client qui a pris deux bières
-- peut n'en avoir qu'une de manquante.
ALTER TABLE "order_items" ADD COLUMN "missing_quantity" INTEGER NOT NULL DEFAULT 0;

-- Jamais plus que ce qui a été commandé, jamais moins que rien. Vérifié par la
-- base elle-même : une erreur de calcul côté serveur ne doit pas pouvoir écrire
-- « 3 manquants sur 2 ».
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_missing_quantity_range"
  CHECK ("missing_quantity" >= 0 AND "missing_quantity" <= "quantity");

-- Le dernier signalement. Nul quand rien ne manque (ou quand le comptoir est
-- revenu sur une erreur de saisie).
ALTER TABLE "orders" ADD COLUMN "missing_reported_at" TIMESTAMP(3);
