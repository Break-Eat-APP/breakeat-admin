-- Se réinscrire après un archivage ne doit plus rien bloquer.
--
-- Un compte archivé gardait son adresse : la même personne ne pouvait plus
-- s'inscrire, ni par e-mail ni par Apple. Une organisation suspendue gardait
-- son slug : impossible d'en recréer une sous le même nom.
--
-- L'ancien compte (ou l'ancienne organisation) garde désormais tout son
-- historique mais LIBÈRE son identifiant, remplacé par un identifiant-témoin.
-- L'original est conservé ici. Colonnes nullables : aucune ligne existante
-- n'est modifiée par cette migration.
ALTER TABLE "users" ADD COLUMN "archived_email" TEXT;
ALTER TABLE "organizations" ADD COLUMN "archived_slug" TEXT;
