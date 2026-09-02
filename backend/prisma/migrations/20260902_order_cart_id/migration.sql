-- Le lien panier -> commande.
--
-- L'app ne connait que l'id du PANIER : le PaymentIntent est cree par Stripe,
-- cote serveur, et ne redescend jamais au client. Sans cette colonne, l'app qui
-- revient de la page de paiement n'a aucun moyen de demander « ou est MA
-- commande ? » -- elle ne peut que lister toutes les commandes et deviner la
-- plus recente. Sur un stade a 5 000 commandes le soir, deviner ne suffit pas.
--
-- UNIQUE : un panier ne produit qu'UNE commande. Stripe peut livrer le meme
-- webhook deux fois ; la contrainte transforme un doublon en erreur bruyante
-- plutot qu'en deuxieme tournee en cuisine.

ALTER TABLE "orders" ADD COLUMN "cart_id" TEXT;
CREATE UNIQUE INDEX "orders_cart_id_key" ON "orders"("cart_id");
