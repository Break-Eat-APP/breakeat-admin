-- PHASE 23 — créneaux de récupération RÉCURRENTS
--
-- Un lieu ouvert en continu n'a pas d'événement à créer, mais il a bien des
-- heures de retrait : « Immédiat », « 17h15 », « À la mi-temps ». La phase 22
-- avait retiré les créneaux en même temps que l'événement — elle mélangeait
-- deux choses distinctes : QUAND a lieu le match, et QUAND on peut venir
-- chercher. La seconde reste vraie sans événement.
--
-- On décrit ici le MOTIF récurrent. Le créneau du jour est matérialisé à la
-- première demande, comme le contenant permanent de la phase 22 : pas de tâche
-- planifiée à surveiller, et le système se répare tout seul.
--
-- Rattaché à une BUVETTE, pas au lieu : deux comptoirs d'une même enceinte
-- peuvent servir à des heures différentes.

CREATE TABLE "slot_templates" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "venue_id"      UUID         NOT NULL,
  "supplier_id"   UUID         NOT NULL,
  "kind"          "slot_kind"  NOT NULL DEFAULT 'CUSTOM',
  -- Ce que lit le client : « Immédiat », « À la mi-temps », « 17h45 ».
  "label"         TEXT         NOT NULL,
  -- Heures en MINUTES depuis minuit, dans le fuseau du lieu. Un timestamp
  -- porterait une date, qui n'a aucun sens pour un motif qui se rejoue.
  "start_minutes" INTEGER      NOT NULL,
  "end_minutes"   INTEGER      NOT NULL,
  -- Limite de commandes : desactivee par defaut. La plupart des clubs n'en
  -- veulent pas au demarrage, et une limite subie est pire qu'aucune limite.
  "capacity_enabled" BOOLEAN   NOT NULL DEFAULT false,
  "capacity"      INTEGER      NOT NULL DEFAULT 20,
  -- Désactivé = ne produit plus de créneau, sans perdre l'historique des
  -- commandes déjà rattachées aux créneaux qu'il a engendrés.
  "is_active"     BOOLEAN      NOT NULL DEFAULT true,
  "sort_order"    INTEGER      NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "slot_templates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "slot_templates"
  ADD CONSTRAINT "slot_templates_venue_id_fkey"
  FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "slot_templates"
  ADD CONSTRAINT "slot_templates_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "slot_templates_venue_id_supplier_id_idx"
  ON "slot_templates" ("venue_id", "supplier_id");

-- Le créneau matérialisé garde le lien vers son modèle et sa journée.
--
-- `service_date` est une DATE seule, portée explicitement plutôt que déduite de
-- `start_at` : c'est elle qui rend la génération idempotente. La déduire
-- exigerait une expression dépendante du fuseau dans un index, ce que Postgres
-- refuse (fonction non immuable).
ALTER TABLE "slots" ADD COLUMN "template_id"  UUID;
ALTER TABLE "slots" ADD COLUMN "service_date" DATE;

ALTER TABLE "slots"
  ADD CONSTRAINT "slots_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "slot_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un modèle ne produit qu'UN créneau par journée.
--
-- C'est cette contrainte qui autorise la génération à la volée sans verrou :
-- deux clients qui ouvrent le lieu à la même seconde ne peuvent pas créer de
-- doublon — le second se heurte à l'unicité et relit simplement l'existant.
--
-- Les créneaux ponctuels (template_id NULL) ne sont pas concernés : dans
-- Postgres, plusieurs NULL ne se contredisent jamais.
CREATE UNIQUE INDEX "slots_template_id_service_date_key"
  ON "slots" ("template_id", "service_date");
