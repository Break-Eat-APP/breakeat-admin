-- PHASE 26 — le compte Stripe appartient au CLUB, plus a chaque buvette
--
-- Un club a quatre comptoirs : lui demander quatre inscriptions Stripe, quatre
-- fois ses coordonnees bancaires et quatre tableaux de bord n'a aucun sens. Son
-- argent doit arriver au meme endroit.
--
-- La buvette garde la possibilite d'avoir SON compte : c'est le cas d'un
-- exploitant tiers (food-truck, traiteur), qui ne veut pas que sa recette
-- atterrisse chez le club. Le compte de la buvette PRIME donc sur celui du club
-- quand il existe.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "stripe_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "stripe_account_status" "stripe_account_status" NOT NULL DEFAULT 'NOT_ONBOARDED',
  ADD COLUMN IF NOT EXISTS "stripe_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stripe_onboarded_at" TIMESTAMP(3);
