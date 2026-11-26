-- LA CATÉGORIE ANDROID « COMMANDES » (26/11/2026).
--
-- Un appareil Android qui a créé la catégorie « Commandes » (importance haute :
-- son et bannière) le déclare ; le serveur ne la vise que pour lui, car un
-- channelId inconnu du téléphone fait disparaître la notification.
--
-- Colonne à valeur par défaut : aucune ligne existante n'est réécrite.
ALTER TABLE "push_tokens" ADD COLUMN "canal_commandes" BOOLEAN NOT NULL DEFAULT false;
