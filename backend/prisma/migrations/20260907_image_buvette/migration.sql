-- Image de la buvette.
--
-- Le client choisit son stand dans une liste ou chaque buvette n'etait qu'une
-- initiale dans un rond. Dans un stade, on reconnait un comptoir a son enseigne
-- avant de lire son nom.
--
-- Une URL, comme le logo du club (`organizations.logo_url`), le plan
-- (`suppliers.plan_url`) et les photos de produits : le projet n'a pas de depot
-- de fichier, et le stockage n'est pas branche. Le jour ou il le sera, cette
-- colonne recevra l'adresse produite par le depot, sans rien changer d'autre.

ALTER TABLE "suppliers" ADD COLUMN "image_url" TEXT;
