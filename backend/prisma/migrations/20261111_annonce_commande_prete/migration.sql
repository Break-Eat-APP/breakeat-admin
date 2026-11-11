-- « TA COMMANDE EST PRÊTE » : LA FILE D'ANNONCE, PORTÉE PAR LA COMMANDE.
--
-- Audit Codex du 11/11 : l'annonce partait après le commit, en fire-and-forget.
-- Un arrêt du serveur entre les deux la perdait. Désormais la transaction qui
-- passe la commande à READY pose `ready_announce_due_at` (la promesse), et un
-- rattrapage chaque minute reprend ce qui n'a pas été annoncé.
--
-- TROIS COLONNES, SANS CLÉ ÉTRANGÈRE : aucune question de type uuid/text ici
-- (voir REPRISE, migration du 23/10). Deux dates nullables, sans valeur par
-- défaut : PostgreSQL n'écrit rien sur les lignes existantes. L'entier a une
-- valeur par défaut CONSTANTE (0) : depuis PostgreSQL 11, elle est enregistrée
-- dans le catalogue, sans réécrire la table.
--
-- L'index est un index ordinaire : `orders` reste petite à l'échelle d'un
-- verrou de création d'index, et Prisma exécute la migration dans une
-- transaction, où CREATE INDEX CONCURRENTLY est interdit.
ALTER TABLE "orders"
  ADD COLUMN "ready_announce_due_at" TIMESTAMP(3),
  ADD COLUMN "ready_announced_at" TIMESTAMP(3),
  ADD COLUMN "ready_announce_attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "orders_ready_announce_due_at_idx" ON "orders"("ready_announce_due_at");
