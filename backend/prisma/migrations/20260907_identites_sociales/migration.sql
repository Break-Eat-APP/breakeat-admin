-- Les inscriptions rapides : Apple et Google.
--
-- `password_hash` devient nullable : un compte cree par Apple n'a jamais eu de
-- mot de passe. Y ranger un hachage bidon aurait laisse croire le contraire.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- Le rattachement se fait sur le sujet du fournisseur, jamais sur l'adresse :
-- Apple donne une adresse relais qui peut changer, le sujet non.
CREATE TABLE "user_identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- Un meme compte Apple ne peut pas ouvrir deux comptes Break Eat.
CREATE UNIQUE INDEX "user_identities_provider_subject_key"
    ON "user_identities"("provider", "subject");
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
