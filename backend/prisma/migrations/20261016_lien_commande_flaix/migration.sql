-- LE LIEN DE COMMANDE FLAIX, PAR ÉVÉNEMENT — ET LA FENÊTRE QUI LE CHOISIT.
--
-- Flaix fournit une adresse de commande PAR ÉVÉNEMENT, créable des mois à
-- l'avance. Jusqu'ici il fallait remplacer un lien unique avant chaque match.
-- Désormais chaque événement porte le sien, et c'est sa DATE qui décide lequel
-- s'ouvre.
--
-- Pourquoi la date et non un motif d'URL : deviner `.../event/<id>` ferait
-- tomber toutes les commandes, en silence, le jour où Flaix change son format.
ALTER TABLE "events" ADD COLUMN "flaix_order_url" TEXT;

-- Combien de minutes AVANT le début la commande ouvre. Les portes d'un stade
-- ouvrent avant le coup d'envoi : attendre le début du match pour ouvrir la
-- vente, c'est rater l'essentiel du service.
--
-- Sur le LIEU : c'est une habitude de club, pas une décision par match.
-- 180 minutes (trois heures) par défaut, y compris pour les lieux existants.
ALTER TABLE "venues" ADD COLUMN "orders_open_before_min" INTEGER NOT NULL DEFAULT 180;
