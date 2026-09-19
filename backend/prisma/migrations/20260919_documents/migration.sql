-- Les documents d'un club : contrat signé, attestation, ce qu'on veut garder.
--
-- LE CONTENU EST DANS LA BASE, et c'est un choix assumé.
--
-- L'alternative — un stockage objet — demanderait des identifiants que
-- personne n'a encore posés, et bloquerait la fonctionnalité sur une
-- inscription chez un hébergeur. Or ces documents sont peu nombreux (un
-- contrat par club), petits, et lus rarement : quelques méga-octets dans une
-- base qui en pèse cent vingt ne se remarquent pas.
--
-- Ce que ça simplifie, et qui compte pour un CONTRAT : l'accès passe par la
-- même authentification que le reste. Aucune adresse publique, aucun lien
-- signé à faire expirer, rien à deviner. Le jour où le volume l'exigera,
-- déplacer le contenu vers un stockage objet ne touchera qu'un service.
CREATE TABLE "documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,

  -- Le nom tel que le club l'a déposé, pour qu'il s'y retrouve.
  "name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,

  -- Qui a déposé, et quand. Un contrat sans trace de dépôt vaut moins qu'un
  -- contrat daté.
  "uploaded_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- La seule lecture qui existe : les documents d'un club, du plus récent au
-- plus ancien.
CREATE INDEX "documents_org_date" ON "documents" ("organization_id", "created_at" DESC);

-- Le club disparaît, ses documents avec lui : ils n'ont aucun sens seuls.
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;

-- Une borne DANS la base, et pas seulement dans le code : dix méga-octets.
-- Un contrat signé et scanné dépasse rarement trois. Au-delà, c'est une erreur
-- de manipulation, et la base doit la refuser même si le serveur laisse passer.
ALTER TABLE "documents" ADD CONSTRAINT "documents_taille_raisonnable"
  CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760);
