-- L'ACCEPTATION DES CGU N'ÉTAIT CONSERVÉE NULLE PART.
--
-- L'écran d'inscription impose une case décochée au départ, et refuse de
-- continuer sans elle. Mais la réponse ne quittait jamais le téléphone :
-- `cguAcceptees` n'était pas envoyé, le DTO ne l'attendait pas, et la table
-- `users` n'avait aucune colonne pour le recevoir.
--
-- Le texte des CGU affirme pourtant que l'acceptation est recueillie à
-- l'inscription. On ne pouvait pas le démontrer : ni la date, ni la version
-- acceptée. Une case cochée dans une application qu'on a depuis mise à jour ne
-- prouve rien — c'est exactement ce qu'un litige demanderait.
--
-- ── POURQUOI LA VERSION, ET PAS SEULEMENT UN BOOLÉEN ────────────
--
-- Les CGU changent. Un `cgu_accepted = true` ne dit pas À QUOI la personne a
-- consenti : il faudrait deviner la version en vigueur ce jour-là, en espérant
-- que le déploiement et la date de signature concordent. La version est donc
-- stockée TELLE QUE LE CLIENT L'A LUE — c'est la seule chose qui corresponde à
-- ce qu'il avait sous les yeux.
--
-- Chaîne libre, et non un identifiant numérique : la valeur vient du fichier
-- des textes légaux, qui porte « Version du 19 octobre 2026 ». Un numéro
-- séparé serait une deuxième source de vérité pour la même date, et les deux
-- divergeraient à la première mise à jour.
--
-- ── NULLABLE, ET ÇA DOIT LE RESTER ─────────────────────────────
--
-- Deux populations n'ont pas de preuve, et n'en auront jamais :
--
--   · les comptes créés AVANT cette migration — on ne va pas leur inventer une
--     date d'acceptation ;
--   · les comptes créés par Apple ou Google, qui passent par une autre route
--     et ne transmettent pas la case.
--
-- Une colonne NOT NULL aurait obligé à remplir ces lignes avec une valeur
-- fabriquée. Une preuve fabriquée est pire qu'une preuve absente : elle a
-- l'air d'en être une.

ALTER TABLE "users"
  ADD COLUMN "cgu_version"     TEXT,
  ADD COLUMN "cgu_accepted_at" TIMESTAMP(3);

-- Les deux vont ENSEMBLE ou pas du tout. Une version sans date ne se situe pas
-- dans le temps ; une date sans version ne dit pas à quoi on a consenti. Ni
-- l'une ni l'autre ne vaudrait comme trace, et l'écart passerait inaperçu.
ALTER TABLE "users"
  ADD CONSTRAINT "users_cgu_complet"
  CHECK (
    ("cgu_version" IS NULL AND "cgu_accepted_at" IS NULL)
    OR ("cgu_version" IS NOT NULL AND "cgu_accepted_at" IS NOT NULL)
  );
