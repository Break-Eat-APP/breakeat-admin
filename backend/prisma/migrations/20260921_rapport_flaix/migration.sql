-- Le lien vers le rapport Flaix d'un événement.
--
-- Posé À LA MAIN après le match, en attendant que Flaix soit branché à Break
-- Eat : chaque rapport Flaix a sa propre adresse, et le directeur devait la
-- retrouver lui-même dans Flaix. Nul tant que personne ne l'a renseigné.
ALTER TABLE "events" ADD COLUMN "flaix_report_url" TEXT;

-- Le contrôle complet (domaine flaixlabs.com, pas d'identifiants dans
-- l'adresse) vit dans le service. La base garde le minimum qui ne dépend
-- d'aucun code : du https, et une longueur raisonnable.
ALTER TABLE "events" ADD CONSTRAINT "events_rapport_flaix_https"
  CHECK ("flaix_report_url" IS NULL
         OR ("flaix_report_url" LIKE 'https://%' AND char_length("flaix_report_url") <= 1000));
