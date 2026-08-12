-- PHASE 22 — rythme d'exploitation d'un lieu
--
-- Un stade vend par événement (le match de samedi). Un restaurant, une cantine
-- d'entreprise ou un point de vente d'aéroport vendent tous les jours, sans
-- événement. Les forcer à en créer un par jour rend la configuration absurde.
--
-- On distingue donc les deux rythmes sur le lieu, et on donne aux lieux
-- permanents UN contenant unique et sans fin pour porter leurs commandes.

CREATE TYPE "venue_operating_mode" AS ENUM ('EVENT_BASED', 'PERMANENT');

-- Défaut EVENT_BASED : les lieux existants sont tous des enceintes sportives,
-- leur comportement ne doit pas changer sous leurs pieds.
ALTER TABLE "venues"
  ADD COLUMN "operating_mode" "venue_operating_mode" NOT NULL DEFAULT 'EVENT_BASED';

-- Marque le contenant d'un lieu permanent. Faux pour tout l'existant : aucun
-- événement déjà créé n'est un contenant technique.
ALTER TABLE "events"
  ADD COLUMN "is_permanent_container" BOOLEAN NOT NULL DEFAULT false;

-- Un lieu permanent n'a qu'UN contenant. L'index partiel l'impose au niveau de
-- la base plutôt que dans le code : une double création concurrente (deux
-- requêtes simultanées à la bascule de mode) échouerait sinon en silence et
-- laisserait deux contenants, donc des commandes éparpillées entre les deux.
CREATE UNIQUE INDEX "events_permanent_container_per_venue"
  ON "events" ("venue_id")
  WHERE "is_permanent_container" = true;
