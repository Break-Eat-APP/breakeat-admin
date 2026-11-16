-- UNE INVITATION À ACCEPTER (test croisé entre organisations, 16/11/2026).
--
-- Un club rattachait un compte EXISTANT sans l'accord de son propriétaire. Il
-- l'invite désormais : l'invitation attend ici, et l'appartenance
-- (`organization_members`) n'est créée qu'à l'acceptation.
--
-- LES CLÉS SONT EN UUID, comme les colonnes qu'elles visent (`users.id`,
-- `organizations.id`, `suppliers.id`) : une clé TEXT vers une colonne UUID a
-- arrêté la production du 23 au 25/10 (INC-2026-003).
--
-- Table neuve : aucune ligne existante n'est touchée.
CREATE TABLE "organization_invitations" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"         UUID         NOT NULL,
    "organization_id" UUID         NOT NULL,
    "org_role"        "org_role"   NOT NULL DEFAULT 'OPERATOR',
    "supplier_id"     UUID,
    "invited_by_id"   UUID,
    "expires_at"      TIMESTAMP(3) NOT NULL,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_invitations_user_id_organization_id_key"
  ON "organization_invitations"("user_id", "organization_id");

ALTER TABLE "organization_invitations"
  ADD CONSTRAINT "organization_invitations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_invitations"
  ADD CONSTRAINT "organization_invitations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_invitations"
  ADD CONSTRAINT "organization_invitations_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
