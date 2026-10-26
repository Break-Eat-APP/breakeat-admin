-- L'ADVERSAIRE DU MATCH — le nom et le blason, pour le calendrier de la saison.
--
-- Deux colonnes NULLABLES et sans valeur par défaut : rien à réécrire sur les
-- lignes existantes, et la migration passe sur une base pleine sans verrou long.
--
-- TEXT, comme `flaix_order_url` et les autres chaînes d'`events`. Pas UUID :
-- ce sont un nom libre et une adresse, pas des identifiants. (La migration du
-- 23/10 avait coûté deux jours de production pour avoir confondu les deux —
-- `pnpm db:verifier` existe depuis pour cette raison.)
ALTER TABLE "events" ADD COLUMN "opponent_name" TEXT;
ALTER TABLE "events" ADD COLUMN "opponent_logo_url" TEXT;
