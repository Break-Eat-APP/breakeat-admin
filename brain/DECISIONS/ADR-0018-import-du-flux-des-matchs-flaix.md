# ADR-0018 — Les matchs viennent du flux Flaix, importé toutes les 10 minutes

- **Date :** 24/11/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi (« Oui, construis-le », 24/11), instruite par l'agent
- **Liée à :** cahier des charges B (`brain/FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md`),
  ADR-0003 (un lien de commande par événement), ADR-0009 (points de retrait
  rattachés à la naissance)

## Contexte
Chaque match était saisi deux fois : dans Flaix, puis dans BreakEat (avec son
lien de commande collé à la main). Le 24/11, le développeur Flaix a livré le
flux B : `GET https://flaix.bo.synertic.net/api/public/lieux/<lieu>/evenements`,
public, sans donnée client, avec ETag.

## Décision
1. **Toutes les 10 minutes**, BreakEat lit le flux de chaque lieu passé à Flaix
   dont « l'identifiant du lieu côté Flaix » (`Venue.flaixVenueId`, admin) est
   rempli.
2. **Un événement se reconnaît à son identifiant Flaix** (`idInterne`, stocké
   dans `Event.flaixEventId`, unique par lieu). Un événement saisi à la main
   est **adopté** (même lien de commande, ou même heure à 3 h près, s'il est le
   seul candidat), jamais doublé.
3. **Flaix fait foi** sur le nom, les heures, le lien de commande et l'annulation.
   L'adversaire et l'affiche ne remplacent ce que le club a mis que si Flaix
   en donne. Un événement absent du flux n'est pas touché ; un événement
   terminé ou annulé chez BreakEat n'est plus modifié.
4. **Le lien de commande garde les étiquettes d'identité** (`[#mail]`…) : un
   lien neuf reçoit le modèle `firstname/lastname/mail/phone` ; un lien en
   place qui mène à la même page est conservé.
5. **L'heure d'ouverture de la commande reste celle du lieu chez BreakEat**
   (`Venue.ordersOpenAt`) : `commande.ouvreLe` du flux n'est pas repris.
   À trancher par Rémi (voir « Ce qui la remettrait en cause »).
6. **Mise en service prudente** : `FLAIX_FLUX_IMPORT=journal` par défaut (lit et
   journalise sans écrire) ; `actif` pour écrire, `arret` pour couper.

## Pourquoi
Une seule saisie, chez Flaix ; le calendrier BreakEat (saison, « À ne pas
manquer », rappels) reste juste sans effort. L'adoption évite les doublons
avec les matchs déjà saisis ; le mode journal permet de vérifier sur les vrais
lieux avant d'écrire.

## Ce que ça coûte
Une modification faite à la main dans BreakEat sur un événement importé (nom,
heure, lien) est écrasée au passage suivant. Une colonne de plus (`flaix_event_id`).
Une panne du flux fige le calendrier à son dernier état, sans alerte autre
que les journaux.

## Ce qui la remettrait en cause
- Rémi décide que l'ouverture de la commande vient de Flaix, match par match
  (`ouvreLe`) : il faudrait un champ d'ouverture par événement et changer
  `fenetre-commande.ts` (serveur et app).
- Flaix change d'identifiant stable, ou retire les événements annulés du flux
  au lieu de les marquer.
- Le webhook E1 couvre un jour aussi les événements : l'import deviendrait un
  simple rattrapage.

## Où elle vit
`backend/src/modules/flaix/flux-matchs-flaix.ts` (règles, testées sans base),
`import-matchs-flaix.service.ts` (lecture et écriture),
`test/integration/import-matchs-flaix.int-spec.ts`, migration
`20261124_evenement_flaix`.
