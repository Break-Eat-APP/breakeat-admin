-- PHASE 23b — la limite de commandes devient FACULTATIVE
--
-- Migration séparée, et non un amendement de la précédente.
--
-- `20260826_phase23_slot_templates` était déjà appliquée en production quand ce
-- besoin est apparu. Prisma enregistre l'empreinte de chaque migration jouée et
-- refuse de démarrer si un fichier déjà appliqué a changé — à raison : deux
-- bases ayant joué « la même » migration n'auraient plus le même schéma.
--
-- La règle vaut pour toujours : une migration poussée est figée. Ce qui vient
-- après vient dans un nouveau fichier.
--
-- Sur le fond : la plupart des clubs ne veulent pas de limite au démarrage, et
-- une limite subie est pire qu'aucune limite. Le champ `capacity` existait déjà
-- et restait affiché sans jamais rien contraindre ; l'interrupteur dit
-- explicitement s'il compte.

ALTER TABLE "slot_templates"
  ADD COLUMN IF NOT EXISTS "capacity_enabled" BOOLEAN NOT NULL DEFAULT false;
