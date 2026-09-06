-- Les inscriptions rapides : Apple et Google.
--
-- `password_hash` devient nullable : un compte cree par Apple n'a jamais eu de
-- mot de passe. Y ranger un hachage bidon aurait laisse croire le contraire.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

-- Une premiere ecriture de cette migration declarait `user_id` en TEXT alors
-- que `users.id` est un UUID : Postgres refuse la cle etrangere entre deux
-- types incompatibles, et la migration a echoue en production (P3009).
--
-- Le DROP couvre le cas ou la table aurait survecu a l'echec avec la mauvaise
-- colonne. Il ne detruit rien : cette table n'a jamais ete creee avec succes,
-- donc elle n'a jamais pu contenir une seule ligne.
DROP TABLE IF EXISTS "user_identities";

-- Le rattachement se fait sur le sujet du fournisseur, jamais sur l'adresse :
-- Apple donne une adresse relais qui peut changer, le sujet non.
CREATE TABLE "user_identities" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID         NOT NULL,
    "provider"   TEXT         NOT NULL,
    "subject"    TEXT         NOT NULL,
    "email"      TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Un meme compte Apple ne peut pas ouvrir deux comptes Break Eat.
CREATE UNIQUE INDEX "user_identities_provider_subject_key"
    ON "user_identities"("provider", "subject");
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");
