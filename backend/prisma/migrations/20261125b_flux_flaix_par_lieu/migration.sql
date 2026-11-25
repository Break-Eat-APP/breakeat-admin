-- LA SYNCHRONISATION DU CALENDRIER FLAIX, LIEU PAR LIEU (25/11/2026).
--
-- Le club colle le lien de son calendrier Flaix dans « Événements &
-- configuration », voit l'aperçu, puis active la synchronisation de CE lieu.
-- Faux par défaut : aucun lieu existant ne se met à importer sans ce geste.
ALTER TABLE "venues" ADD COLUMN "flaix_flux_actif" BOOLEAN NOT NULL DEFAULT false;
