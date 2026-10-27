-- L'OUTBOX DU TEMPS RÉEL — pour qu'un événement ne se perde jamais.
--
-- Une commande payée, c'est DEUX gestes : l'écrire en base, et prévenir
-- l'écran de la buvette. Entre les deux, tout peut arriver — un redémarrage,
-- une passerelle pas encore prête, un réseau qui hoquette. La commande existe
-- alors, encaissée, et le comptoir n'en sait rien.
--
-- Chaque émission dépose une ligne ici ; un ouvrier la rejoue tant qu'elle
-- n'est pas livrée.
--
-- LES IDENTIFIANTS SONT EN UUID, PAS EN TEXT. C'est la convention de toutes
-- les tables de ce schéma, et la confondre a coûté deux jours de production
-- le 23/10/2026 (voir `20261023_note_de_commande`). Prisma rend
-- `String @default(uuid())` en TEXT : la migration s'écrit donc à la main.
--
-- Aucune clé étrangère : l'outbox doit survivre à ce qu'elle décrit. Une
-- commande supprimée n'empêche pas de rejouer l'annonce de son passage à
-- « prête », et surtout la suppression ne doit pas échouer parce qu'une ligne
-- d'outbox traîne.
CREATE TABLE "realtime_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    -- L'identifiant de déduplication porté par l'enveloppe. UNIQUE : une même
    -- émission ne peut pas être inscrite deux fois, et un client qui reçoit le
    -- doublon d'un rejeu le reconnaît.
    "event_id" UUID NOT NULL,
    "event_name" TEXT NOT NULL,
    "rooms" TEXT[] NOT NULL,
    -- L'enveloppe COMPLÈTE, telle qu'elle partira : rejouer ne recalcule rien.
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Nul tant que l'émission n'a pas abouti : c'est ce que l'ouvrier cherche.
    "delivered_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "realtime_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "realtime_outbox_event_id_key" ON "realtime_outbox"("event_id");

-- L'index de l'ouvrier : les non-livrées, dans l'ordre d'arrivée. L'ordre
-- compte — un `order_updated` rejoué avant son `new_order` afficherait une
-- commande qui avance avant d'exister.
CREATE INDEX "realtime_outbox_delivered_at_created_at_idx"
    ON "realtime_outbox"("delivered_at", "created_at");
