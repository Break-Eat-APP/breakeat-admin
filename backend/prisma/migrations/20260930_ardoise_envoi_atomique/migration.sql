-- L'ENVOI D'UNE ARDOISE DEVIENT UNE REVENDICATION.
--
-- « Envoyer » encaissait les cartes des convives, puis créait la commande,
-- puis seulement passait l'ardoise à SENT. Deux appuis simultanés sur le
-- bouton lisaient donc tous les deux « OPEN », encaissaient les mêmes parts et
-- créaient DEUX commandes pour une seule tournée — la seconde écrasant le lien
-- de la première.
--
-- Trois garde-fous, ici, dans la base :

-- 1. Un état d'envoi EN COURS. Le passage OPEN → SENDING est la revendication :
--    un seul appel peut le faire, les autres se voient refuser. Et un envoi qui
--    échoue au milieu laisse une trace lisible au lieu d'une ardoise « ouverte »
--    dont l'argent est déjà pris.
ALTER TYPE "order_split_status" ADD VALUE IF NOT EXISTS 'SENDING';

-- 2. Un état d'ÉCHEC. La tournée n'est pas partie, les convives ont été
--    remboursés : ce n'est ni « ouverte », ni « annulée par l'hôte ».
ALTER TYPE "order_split_status" ADD VALUE IF NOT EXISTS 'FAILED';

-- 3. Une part REMBOURSÉE. Jusqu'ici une part encaissée n'avait pas de retour
--    possible : le seul état de sortie était CANCELLED, qui décrit une
--    autorisation libérée — donc un argent JAMAIS pris. Rembourser et libérer
--    ne se lisent pas de la même façon sur un relevé bancaire.
ALTER TYPE "order_split_share_status" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- 4. Une commande par ardoise, garanti par la base et non par la lecture qui
--    précède l'écriture. Les ardoises encore ouvertes ont `order_id` NULL, et
--    Postgres considère les NULL comme distincts : elles ne se gênent pas.
CREATE UNIQUE INDEX IF NOT EXISTS "order_splits_order_id_key"
  ON "order_splits"("order_id");
