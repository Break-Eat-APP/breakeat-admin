-- PHASE 25 — retrait du partage « chacun commande de son cote »
--
-- Cette fonction supposait que TOUS les convives installent l'app. Personne ne
-- fait ca au comptoir : c'est justement le probleme que « l'ardoise » resout,
-- ou une seule personne installe l'app et les autres paient depuis un
-- navigateur.
--
-- La table n'a jamais ete deployee en production : elle est creee et supprimee
-- dans le meme cycle, sans qu'aucune donnee de club n'existe. C'est pourquoi on
-- la retire ici au lieu de la laisser en vestige.

DROP INDEX IF EXISTS "orders_order_group_id_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "order_group_id";
ALTER TABLE "carts"  DROP COLUMN IF EXISTS "order_group_id";
DROP TABLE IF EXISTS "order_groups";
