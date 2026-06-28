-- Phase 17 — back office notifications programmées
-- Rend organization_id nullable sur scheduled_pushes pour permettre les
-- broadcasts plateforme (tous les utilisateurs) sans cibler une org spécifique.
ALTER TABLE "scheduled_pushes" ALTER COLUMN "organization_id" DROP NOT NULL;
