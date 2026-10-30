-- L'INTERRUPTEUR GLOBAL N'ÉTAIT PROTÉGÉ PAR RIEN.
--
-- `feature_flags` et `app_settings` portent `UNIQUE (key, scope, scope_id)`,
-- et `scope_id` est NUL pour une portée GLOBALE. Or dans PostgreSQL, deux
-- NULL sont DISTINCTS pour une contrainte d'unicité : deux lignes
-- `('app.split.enabled', 'GLOBAL', NULL)` peuvent donc coexister, l'une à
-- `true` et l'autre à `false`.
--
-- Vérifié sur une vraie base le 31/10, et les deux insertions passent :
--
--     key               | scope  | scope_id | enabled
--     app.split.enabled | GLOBAL |          | f
--     app.split.enabled | GLOBAL |          | t
--
-- Le lecteur, lui, fait `findFirst` sans aucun ordre. L'interrupteur devient
-- un tirage au sort — définitivement, puisque rien ne nettoie les doublons.
--
-- Ce n'est pas un détail : `app.split.enabled` coupe l'ardoise, qui REMBOURSE
-- de l'argent encaissé. On a tenu à pouvoir l'arrêter en secondes sans
-- redéployer ; un interrupteur dont l'état se tire au sort ne vaut rien.
--
-- ── POURQUOI UN INDEX PARTIEL, ET PAS `NULLS NOT DISTINCT` ───────
--
-- PostgreSQL 15 sait écrire `UNIQUE (…) NULLS NOT DISTINCT`, ce qui dirait
-- exactement l'intention. Deux raisons de ne pas s'en servir ici :
--
--  1. LA VERSION DE LA PRODUCTION N'EST PAS CONNUE DEPUIS LE DÉPÔT. Le
--     conteneur de développement est en 16.14 alors que la documentation
--     annonce 18 ; `postgres:18-alpine` n'est utilisé que par le banc. Une
--     migration qui échoue bloque TOUTE la file — c'est exactement l'incident
--     des 23–25 octobre, où la production a servi du code vieux de quatre
--     jours. Un index partiel fonctionne sur toute version depuis des années.
--
--  2. ON NE TOUCHE PAS À L'INDEX QUI MARCHE. Remplacer
--     `(key, scope, scope_id)` changerait le chemin `upsert` des portées
--     ORGANISATION et ÉVÉNEMENT, qui fonctionne aujourd'hui : Prisma y émet un
--     `ON CONFLICT (key, scope, scope_id)` qui a besoin de cet index précis.
--     On AJOUTE donc, on ne remplace pas. Vérifié : avec l'index partiel en
--     place, l'upsert par organisation passe toujours et ne laisse qu'une
--     ligne.
--
-- ── LE DÉDOUBLONNAGE EST DÉFENSIF ───────────────────────────────
--
-- Il ne devrait rien trouver, et c'est une bonne nouvelle déguisée : le
-- `set()` des flags GLOBAUX ne fonctionnait PAS DU TOUT (Prisma refuse un
-- `null` dans une clé composée — « Argument scopeId must not be null »), donc
-- aucune ligne globale n'a pu être écrite par ce chemin. Seuls un semis ou du
-- SQL à la main ont pu en créer.
--
-- On garde la ligne la PLUS RÉCEMMENT modifiée : c'est la dernière intention
-- de l'exploitant. `id` tranche les ex æquo, pour que le résultat ne dépende
-- pas de l'ordre de lecture.
DELETE FROM "feature_flags" f
 WHERE f."scope_id" IS NULL
   AND EXISTS (
     SELECT 1 FROM "feature_flags" g
      WHERE g."key" = f."key" AND g."scope" = f."scope" AND g."scope_id" IS NULL
        AND (g."updated_at", g."id") > (f."updated_at", f."id")
   );

DELETE FROM "app_settings" s
 WHERE s."scope_id" IS NULL
   AND EXISTS (
     SELECT 1 FROM "app_settings" t
      WHERE t."key" = s."key" AND t."scope" = s."scope" AND t."scope_id" IS NULL
        AND (t."updated_at", t."id") > (s."updated_at", s."id")
   );

-- `(key, scope)` et non `(key)` seul : une ligne mal formée — portée non
-- globale avec un `scope_id` nul — serait sinon comparée à la ligne globale de
-- même clé. Le service refuse déjà cette forme, mais l'index ne doit pas
-- dépendre du service pour avoir du sens.
CREATE UNIQUE INDEX "feature_flags_portee_globale_unique"
    ON "feature_flags" ("key", "scope") WHERE "scope_id" IS NULL;

CREATE UNIQUE INDEX "app_settings_portee_globale_unique"
    ON "app_settings" ("key", "scope") WHERE "scope_id" IS NULL;
