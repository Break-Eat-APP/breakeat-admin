-- Prénom et nom, séparés.
--
-- `display_name` portait tout : « Jo », « Jo Bricole », ou ce qu'Apple voulait
-- bien donner. Utilisable pour saluer quelqu'un à l'écran, inutilisable dans un
-- fichier client remis à un club — qui a besoin d'un nom et d'un prénom
-- distincts pour sa base.
--
-- NULLABLES, et ils le resteront : les comptes créés avant ce jour n'en ont
-- pas, et ceux créés par Apple ou Google n'en auront pas davantage (Apple ne
-- transmet le nom qu'à la toute première autorisation, et pas toujours).
-- Rendre ces colonnes obligatoires bloquerait ces inscriptions-là.
--
-- `display_name` reste la source d'affichage, calculée à partir des deux quand
-- elles existent : un seul endroit décide de ce qu'on montre.
ALTER TABLE "users" ADD COLUMN "first_name" TEXT;
ALTER TABLE "users" ADD COLUMN "last_name" TEXT;
