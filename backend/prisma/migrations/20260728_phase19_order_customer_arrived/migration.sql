-- ─────────────────────────────────────────────────────────────
-- Phase 19 — « Je suis arrivé » (client présent au point de retrait)
--
-- customer_arrived_at : horodatage du signalement par le client depuis l'app.
--                       Le board opérateur met la commande en évidence (clignote)
--                       tant qu'elle n'est pas récupérée. NULL = non signalé.
--                       Horodatage plutôt que booléen : permet de trier par
--                       ancienneté d'attente côté buvette.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "orders"
    ADD COLUMN "customer_arrived_at" TIMESTAMP(3);
