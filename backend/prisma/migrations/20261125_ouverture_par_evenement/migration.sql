-- L'HEURE D'OUVERTURE DE LA COMMANDE, PAR ÉVÉNEMENT (25/11/2026).
--
-- Décision de Rémi : l'heure d'ouverture vient de Flaix, match par match
-- (`commande.ouvreLe` du flux des matchs, importé toutes les 10 minutes).
-- Remplie, elle l'emporte sur l'heure du lieu (`venues.orders_open_at`) ;
-- nulle, l'heure du lieu reprend — c'est le cas de tous les événements
-- existants : colonne nullable, aucune ligne réécrite.
ALTER TABLE "events" ADD COLUMN "orders_open_at" TIMESTAMP(3);
