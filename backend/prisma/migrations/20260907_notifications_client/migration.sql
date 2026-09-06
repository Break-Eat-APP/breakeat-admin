-- Les notifications recues par un client, conservees pour etre RELUES.
--
-- Un push est ephemere : balaye de l'ecran, il n'existe plus. La cloche de
-- l'application doit pourtant dire combien de messages attendent, et lesquels --
-- y compris ceux arrives telephone eteint, ou avant l'installation d'un second
-- appareil. Un compteur garde seulement dans l'application ne survivrait ni a
-- une reinstallation ni au passage d'un telephone a l'autre.
--
-- L'index suit LA lecture qu'on en fait : « mes notifications, non lues
-- d'abord, les plus recentes en tete ». Il n'y en a pas d'autre.

CREATE TABLE "user_notifications" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"         UUID         NOT NULL,
    "organization_id" UUID,
    "title"           TEXT         NOT NULL,
    "body"            TEXT         NOT NULL,
    "read_at"         TIMESTAMP(3),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_notifications_user_read_created_idx"
    ON "user_notifications"("user_id", "read_at", "created_at");
