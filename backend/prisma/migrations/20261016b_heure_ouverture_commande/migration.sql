-- L'HEURE D'ACCÈS AU LIEN, PLUTÔT QU'UN DÉLAI AVANT LE COUP D'ENVOI.
--
-- La veille, la fenêtre s'exprimait en « minutes avant le début ». Le club,
-- lui, le pense autrement : « le lien ouvre à 8 h le matin du match ». Une
-- heure fixe ne bouge pas quand l'horaire du match change, et elle se dit en
-- une phrase à une équipe.
--
-- L'ouverture des CRÉNEAUX de retrait se règle dans Flaix ; ce champ ne décide
-- que de l'accès au lien, qui vient des heures avant.
--
-- La colonne remplacée n'a jamais été déployée (ajoutée le 16/10 au matin) :
-- aucune donnée à reprendre.
ALTER TABLE "venues" DROP COLUMN IF EXISTS "orders_open_before_min";
ALTER TABLE "venues" ADD COLUMN "orders_open_at" TEXT NOT NULL DEFAULT '08:00';
