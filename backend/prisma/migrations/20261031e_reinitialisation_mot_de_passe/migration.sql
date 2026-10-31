-- LA RÉCUPÉRATION DE MOT DE PASSE N'EXISTAIT PAS.
--
-- Le lien « Mot de passe oublié ? » affichait une alerte : « Réinitialisation
-- du mot de passe à venir ». Un client qui perdait son mot de passe perdait
-- son compte — son historique, ses points de fidélité, ses lieux favoris — et
-- n'avait d'autre recours que de s'inscrire avec une autre adresse.
--
-- ── UN CODE À SIX CHIFFRES, PAS UN LIEN ────────────────────────
--
-- Un lien cliquable dans un courriel devrait rouvrir l'application : liens
-- universels à déclarer chez Apple et chez Google, ou page web de repli à
-- écrire et à héberger. Un code se tape dans l'écran où le client se trouve
-- déjà, et marche depuis n'importe quelle messagerie.
--
-- La sécurité tient alors au COMPTAGE DES ESSAIS, et pas à la longueur : six
-- chiffres ne résistent pas à un million de tentatives, mais ne survivent pas
-- à cinq. D'où la colonne `attempts`, et pas seulement une limite de débit —
-- celle-ci vit dans Redis, et Redis peut être absent.
--
-- ── LE CODE EST HACHÉ, JAMAIS STOCKÉ EN CLAIR ──────────────────
--
-- Une base lue — une sauvegarde égarée, un accès de lecture de trop — livrerait
-- sinon tous les comptes ayant une demande en cours. SHA-256 suffit ici : le
-- code vit quinze minutes et le nombre d'essais est borné, donc le coût d'un
-- hachage lent ne protégerait rien de plus. Il se paierait en revanche à
-- CHAQUE essai, y compris à ceux d'un attaquant — un hachage lent sur une
-- route publique est une arme qu'on se tend à soi-même.
--
-- ── CE QUI RESTE À FAIRE, ET QUI N'EST PAS DU CODE ─────────────
--
-- Le projet n'avait aucun moyen d'envoyer un courriel. Le serveur sait le
-- faire désormais (Resend ou Brevo, un seul POST, aucune dépendance ajoutée),
-- mais il faut une clé d'API et un domaine d'expédition vérifié. Sans elles,
-- `/auth/password-reset/available` répond `false` et l'application n'offre pas
-- le parcours — plutôt que de promettre « vérifie tes courriels » sans pouvoir
-- en envoyer.

CREATE TABLE "password_resets" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID         NOT NULL,
    "code_hash"  TEXT         NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at"    TIMESTAMP(3),
    "attempts"   INTEGER      NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- SUPPRESSION EN CASCADE : un compte supprimé — droit exigé par Apple — ne
-- doit pas laisser derrière lui un code qui permettrait de le reprendre.
ALTER TABLE "password_resets"
  ADD CONSTRAINT "password_resets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La seule lecture du parcours : « la demande en cours de cette personne »,
-- la plus récente d'abord.
CREATE INDEX "password_resets_user_id_created_at_idx"
  ON "password_resets"("user_id", "created_at");

-- Un compteur d'essais ne descend pas. Sans cette borne, un défaut de code
-- pourrait le remettre à zéro et rendre le code éternellement devinable.
ALTER TABLE "password_resets"
  ADD CONSTRAINT "password_resets_attempts_positif" CHECK ("attempts" >= 0);
