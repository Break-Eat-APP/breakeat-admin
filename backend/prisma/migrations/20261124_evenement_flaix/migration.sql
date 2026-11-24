-- L'IDENTIFIANT FLAIX D'UN ÉVÉNEMENT (24/11/2026).
--
-- Le flux des matchs de Flaix (`/api/public/lieux/<lieu>/evenements`) est
-- importé toutes les 10 minutes : un match créé, modifié ou annulé chez Flaix
-- se reflète dans BreakEat sans double saisie. Cette colonne retient
-- l'identifiant Flaix de l'événement, pour reconnaître un match modifié au
-- lieu de le recréer.
--
-- TEXT, et c'est juste : ce n'est PAS une clé vers une de nos tables (qui sont
-- en UUID) mais l'identifiant d'un système extérieur. Aucune clé étrangère.
--
-- Colonne nullable, sans valeur par défaut : aucune ligne existante n'est
-- réécrite. L'index unique (lieu, identifiant Flaix) laisse passer les NULL
-- — PostgreSQL ne les compare pas entre eux —, donc tous les événements saisis
-- à la main restent valides.
ALTER TABLE "events" ADD COLUMN "flaix_event_id" TEXT;

CREATE UNIQUE INDEX "events_venue_id_flaix_event_id_key" ON "events"("venue_id", "flaix_event_id");
