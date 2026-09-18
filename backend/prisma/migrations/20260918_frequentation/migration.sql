-- La fréquentation : qui ouvre l'application, et où.
--
-- Jusqu'ici, un club ne pouvait savoir que ce que les COMMANDES racontaient. La
-- question qu'il pose pourtant en premier — « combien de personnes ont ouvert
-- notre carte pendant le match ? » — n'avait aucune réponse : rien ne
-- l'enregistrait.
--
-- Une ligne par VISITEUR, par TYPE de visite, par PÉRIMÈTRE et par FENÊTRE de
-- trente minutes. Pas une ligne par écran ouvert : dix allers-retours entre la
-- carte et le panier sont UNE visite, pas dix. C'est ce qui rend le chiffre
-- comparable d'un match à l'autre, et ce qui empêche la table d'enfler.
CREATE TABLE "frequentation" (
  "id" TEXT NOT NULL,

  -- Identifiant d'INSTALLATION, tiré au sort par l'application et gardé sur
  -- l'appareil. Anonyme : il ne dit rien de la personne, il sert uniquement à
  -- ne pas compter deux fois le même téléphone. Un visiteur qui n'est pas
  -- connecté compte donc quand même — c'est justement celui qu'on cherche.
  "visitor_key" TEXT NOT NULL,

  -- Rempli seulement si le visiteur est connecté. Nul sinon, et ce n'est pas
  -- un défaut : la différence entre les deux EST la mesure intéressante.
  "user_id" UUID,

  "organization_id" UUID,
  "venue_id" UUID,
  "event_id" UUID,

  -- APP_OPEN | LOGIN | VENUE_VIEW | EVENT_VIEW | MENU_VIEW
  "kind" TEXT NOT NULL,

  -- `kind:venue:event`, recomposé par le serveur. Il existe parce qu'un index
  -- unique PostgreSQL considère deux NULL comme différents : sans cette
  -- colonne, une visite sans lieu ne se dédoublonnerait jamais, et chaque
  -- ouverture d'application créerait une ligne.
  "scope" TEXT NOT NULL,

  -- Début de la tranche de trente minutes à laquelle la visite se rattache.
  "window_start" TIMESTAMP(3) NOT NULL,

  -- Nombre de fois que la visite a été signalée dans cette fenêtre. Sert à
  -- distinguer un passage d'une consultation insistante.
  "hits" INTEGER NOT NULL DEFAULT 1,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "frequentation_pkey" PRIMARY KEY ("id")
);

-- Ce qui fait qu'une visite répétée se met à jour au lieu de s'ajouter.
CREATE UNIQUE INDEX "frequentation_visite_unique"
  ON "frequentation" ("visitor_key", "scope", "window_start");

-- Les trois lectures : par club, par lieu, par événement — toujours dans une
-- fenêtre de temps.
CREATE INDEX "frequentation_org_fenetre" ON "frequentation" ("organization_id", "window_start");
CREATE INDEX "frequentation_lieu_fenetre" ON "frequentation" ("venue_id", "window_start");
CREATE INDEX "frequentation_evenement_fenetre" ON "frequentation" ("event_id", "window_start");

-- Aucune clé étrangère vers `users`, `venues` ou `events`, et c'est voulu.
--
-- Une mesure de fréquentation doit survivre à la suppression de ce qu'elle
-- mesure : un lieu fermé ne doit pas effacer l'histoire de sa saison, et un
-- compte supprimé ne doit pas trouer les totaux d'un club. Les identifiants
-- restent lisibles ; ce qui n'existe plus s'affiche sans nom.
