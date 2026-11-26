-- L'ÉTAT RÉELLEMENT REÇU PAR CHAQUE LIVE ACTIVITY FLAIX (26/11/2026).
--
-- Audit Codex du 26/11 : un envoi APNs raté, ou une activité enregistrée après
-- un changement d'état, n'étaient jamais rattrapés. Le serveur retient
-- désormais le dernier état reçu, et repousse tant qu'il diffère.
--
-- Colonne nullable : les activités existantes reçoivent l'état courant au
-- tour suivant, ce qui est voulu.
ALTER TABLE "live_activities_flaix" ADD COLUMN "etat_envoye" TEXT;
