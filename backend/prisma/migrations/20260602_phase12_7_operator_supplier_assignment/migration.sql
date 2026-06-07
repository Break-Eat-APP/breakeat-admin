-- Phase 12.7 — Operator supplier assignment
-- Adds supplier_id to organization_members so OPERATOR role members
-- can be pinned to a specific supplier. Used by the filtered operator
-- dashboard (Phase 12.9) and the admin team management UI (Phase 12.7).

ALTER TABLE "organization_members"
  ADD COLUMN "supplier_id" UUID;

ALTER TABLE "organization_members"
  ADD CONSTRAINT "organization_members_supplier_id_fkey"
  FOREIGN KEY ("supplier_id")
  REFERENCES "suppliers"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
