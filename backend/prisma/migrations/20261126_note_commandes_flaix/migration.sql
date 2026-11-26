-- LA NOTE D'UNE COMMANDE FLAIX ET SA RELANCE (26/11/2026).
--
-- « Note ta commande » 10 minutes après la remise, et la note enregistrée chez
-- BreakEat. Une commande Flaix n'a pas d'`orders` : la note vit à part, liée au
-- suivi de la commande (`suivis_commandes_flaix`).
--
-- LES CLÉS VERS NOS TABLES SONT EN UUID (`users.id`) — INC-2026-003. Le jeton
-- est un identifiant Flaix : TEXT.
--
-- Colonnes nullables et table neuve : aucune ligne existante n'est réécrite.
ALTER TABLE "suivis_commandes_flaix" ADD COLUMN "lieu_flaix" TEXT;
ALTER TABLE "suivis_commandes_flaix" ADD COLUMN "evenement_flaix" TEXT;
ALTER TABLE "suivis_commandes_flaix" ADD COLUMN "relance_note_le" TIMESTAMP(3);

CREATE TABLE "notes_commandes_flaix" (
    "jeton"            TEXT         NOT NULL,
    "user_id"          UUID         NOT NULL,
    "stars"            INTEGER      NOT NULL,
    "comment"          TEXT,
    "numero"           TEXT         NOT NULL,
    "point_de_retrait" TEXT,
    "lieu_flaix"       TEXT,
    "evenement_flaix"  TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notes_commandes_flaix_pkey" PRIMARY KEY ("jeton"),
    -- La base borne elle-même : un 0 ou un 7 fausserait toute moyenne.
    CONSTRAINT "notes_commandes_flaix_etoiles" CHECK ("stars" BETWEEN 1 AND 5),
    CONSTRAINT "notes_commandes_flaix_commentaire" CHECK ("comment" IS NULL OR char_length("comment") <= 1000)
);

CREATE INDEX "notes_commandes_flaix_lieu_flaix_created_at_idx" ON "notes_commandes_flaix"("lieu_flaix", "created_at");
CREATE INDEX "notes_commandes_flaix_user_id_idx" ON "notes_commandes_flaix"("user_id");

ALTER TABLE "notes_commandes_flaix"
  ADD CONSTRAINT "notes_commandes_flaix_jeton_fkey"
  FOREIGN KEY ("jeton") REFERENCES "suivis_commandes_flaix"("jeton") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notes_commandes_flaix"
  ADD CONSTRAINT "notes_commandes_flaix_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
