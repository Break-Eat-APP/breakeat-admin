-- Une campagne peut viser UN LIEU.
--
-- Jusqu'ici, un club ne pouvait s'adresser qu'à TOUS ses clients, ou à ceux
-- d'un événement précis. Or un club qui tient plusieurs lieux n'a aucune raison
-- d'annoncer une soirée au Vélodrome aux clients de son annexe : le message
-- arrive à des gens qu'il ne concerne pas, et c'est ainsi qu'on se fait couper
-- les notifications.
--
-- Nul = tous les clients du club, comme avant. Le comportement existant ne
-- change pas.
ALTER TABLE "scheduled_pushes" ADD COLUMN "venue_id" UUID;

-- Pas de clé étrangère vers `venues`, volontairement, et pour la même raison
-- que la fréquentation : l'historique d'une campagne doit survivre à la
-- fermeture du lieu qu'elle visait. Ce qui n'existe plus s'affiche sans nom.
CREATE INDEX "scheduled_push_lieu" ON "scheduled_pushes" ("venue_id");
