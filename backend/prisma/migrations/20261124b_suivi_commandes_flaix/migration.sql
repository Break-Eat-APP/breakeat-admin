-- LE SUIVI DES COMMANDES FLAIX, EN BASE, ET LEURS LIVE ACTIVITIES (24/11/2026).
--
-- La surveillance « Ta commande est prête » des commandes Flaix vivait en
-- mémoire : un redémarrage du serveur pendant un match l'effaçait. Elle est
-- désormais ici, avec de quoi faire avancer la Live Activity du client.
--
-- LES CLÉS VERS NOS TABLES SONT EN UUID (`users.id`) : une clé TEXT vers une
-- colonne UUID a arrêté la production du 23 au 25/10 (INC-2026-003). Le jeton,
-- lui, est l'identifiant d'un système extérieur (Flaix) : TEXT est juste.
--
-- Tables neuves : aucune ligne existante n'est touchée.
CREATE TABLE "suivis_commandes_flaix" (
    "jeton"             TEXT         NOT NULL,
    "user_id"           UUID         NOT NULL,
    "numero"            TEXT         NOT NULL,
    "point_de_retrait"  TEXT,
    "passee_le"         TIMESTAMP(3) NOT NULL,
    "etat"              TEXT         NOT NULL DEFAULT 'queued',
    "prete_annoncee"    BOOLEAN      NOT NULL DEFAULT false,
    "essais_annonce"    INTEGER      NOT NULL DEFAULT 0,
    "remise_le"         TIMESTAMP(3),
    "termine"           BOOLEAN      NOT NULL DEFAULT false,
    "prochaine_lecture" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suivis_commandes_flaix_pkey" PRIMARY KEY ("jeton")
);

CREATE INDEX "suivis_commandes_flaix_termine_prochaine_lecture_idx" ON "suivis_commandes_flaix"("termine", "prochaine_lecture");
CREATE INDEX "suivis_commandes_flaix_user_id_idx" ON "suivis_commandes_flaix"("user_id");

ALTER TABLE "suivis_commandes_flaix"
  ADD CONSTRAINT "suivis_commandes_flaix_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "live_activities_flaix" (
    "id"          UUID                   NOT NULL,
    "jeton"       TEXT                   NOT NULL,
    "user_id"     UUID                   NOT NULL,
    "activity_id" TEXT                   NOT NULL,
    "push_token"  TEXT                   NOT NULL,
    "status"      "live_activity_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at"  TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3)           NOT NULL,
    "ended_at"    TIMESTAMP(3),
    CONSTRAINT "live_activities_flaix_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_activities_flaix_push_token_key" ON "live_activities_flaix"("push_token");
CREATE UNIQUE INDEX "live_activities_flaix_jeton_activity_id_key" ON "live_activities_flaix"("jeton", "activity_id");
CREATE INDEX "live_activities_flaix_jeton_status_idx" ON "live_activities_flaix"("jeton", "status");
CREATE INDEX "live_activities_flaix_user_id_idx" ON "live_activities_flaix"("user_id");

ALTER TABLE "live_activities_flaix"
  ADD CONSTRAINT "live_activities_flaix_jeton_fkey"
  FOREIGN KEY ("jeton") REFERENCES "suivis_commandes_flaix"("jeton") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_activities_flaix"
  ADD CONSTRAINT "live_activities_flaix_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
