-- LES LIEUX FAVORIS, COPIÉS SUR LE SERVEUR (21/11/2026).
--
-- Une campagne ciblant un club ou un lieu ne visait que les clients ayant une
-- commande BreakEat chez lui. Les lieux pilotés par Flaix n'en ont aucune : leurs
-- campagnes partaient vers zéro appareil. Le téléphone envoie désormais ici la
-- liste des lieux que le client connecté a mis en favori, et le ciblage devient
-- « a commandé OU suit ce lieu ».
--
-- LES CLÉS SONT EN UUID, comme les colonnes qu'elles visent (`users.id`,
-- `venues.id`) : une clé TEXT vers une colonne UUID a arrêté la production du
-- 23 au 25/10 (INC-2026-003).
--
-- Table neuve : aucune ligne existante n'est touchée.
CREATE TABLE "venue_favorites" (
    "user_id"    UUID         NOT NULL,
    "venue_id"   UUID         NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_favorites_pkey" PRIMARY KEY ("user_id", "venue_id")
);

CREATE INDEX "venue_favorites_venue_id_idx" ON "venue_favorites"("venue_id");

ALTER TABLE "venue_favorites"
  ADD CONSTRAINT "venue_favorites_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venue_favorites"
  ADD CONSTRAINT "venue_favorites_venue_id_fkey"
  FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
