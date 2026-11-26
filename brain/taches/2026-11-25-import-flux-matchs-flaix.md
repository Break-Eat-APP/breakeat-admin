# Compte rendu — Les matchs arrivent tout seuls depuis Flaix

- **Date :** 24 au 25/11/2026
- **Agent / développeur :** Claude Code (session locale), à la demande de Rémi
- **Commit(s) :** `7498fb7` (import, 1.7.54), `8702710` (ouverture par match,
  1.7.57), `331917a` (réglage dans l'admin, 1.7.58)
- **Bug / décision liés :** ADR-0018 ; CLAUDE.md § 4 mis à jour (l'ouverture
  de la commande vient de Flaix)
- **Statut :** TERMINÉ. Le réglage s'active lieu par lieu, dans l'admin.

## Objectif
Ne plus saisir chaque match deux fois (dans Flaix, puis dans BreakEat avec son
lien collé à la main). Le développeur Flaix a livré le flux des matchs
(cahier des charges, option B) le 24/11.

## Avant
- Chaque match était recréé à la main dans BreakEat, avec son lien de
  commande.
- L'heure d'ouverture était celle du lieu (08:00), alors que Flaix ouvrait
  certains matchs à 08:30.

## Cause
Pas un bug : un besoin. Le flux n'existait pas avant le 24/11.

## Ce qui a été fait
- **Lecture du flux** (`flux-matchs-flaix.ts`) :
  - `lireFluxMatchs` valide le JSON ;
  - `deciderImport` décide pour chaque événement (créer, adopter, modifier,
    annuler, ignorer) ; c'est une fonction pure ;
  - `nomCourtDuLieu` accepte le lien collé, l'adresse du flux ou le nom court.
- **Import** (`import-matchs-flaix.service.ts`) :
  - toutes les 10 min, avec l'ETag de Flaix ;
  - un événement saisi à la main est adopté, pas doublé ;
  - le lien garde ses étiquettes d'identité.
- **Ouverture par match** : `Event.ordersOpenAt` l'emporte dans
  `heureDOuverture`. La saison de l'app dit « La commande ouvre demain à
  08:30 ».
- **Réglage par lieu**, dans « Événements & configuration » de l'admin
  (`calendrier-flaix.tsx`) :
  - coller le lien ;
  - « Voir les événements » (aperçu sans écriture) ;
  - « Activer la synchronisation » ou « Couper ».
- **Verrou côté serveur** : nom, horaires et lien d'un événement importé ne
  se modifient pas (`GERE_DANS_FLAIX`).
- `FLAIX_FLUX_IMPORT` devient un interrupteur de secours général.

## Fichiers
- Créés :
  - `backend/src/modules/flaix/flux-matchs-flaix.ts` (+ spec) ;
  - `import-matchs-flaix.service.ts`, `flux-matchs-flaix.controller.ts`,
    `dto/flux-flaix.dto.ts` ;
  - `backend/test/integration/import-matchs-flaix.int-spec.ts` ;
  - `apps/admin/src/components/calendrier-flaix.tsx` ;
  - trois migrations.
- Modifiés :
  - `schema.prisma`, `fenetre-commande.ts` (+ spec),
    `public-venues.controller.ts`, `cart.service.ts`, `events.service.ts`,
    `flaix.module.ts`, `app.config.ts`, `.env.example` ;
  - admin : `events/page.tsx`, `events/[id]/page.tsx`, `admin-client.ts` ;
  - app : `ouverture-lieu.ts` (+ test), `saison.screen.tsx`, `mobile-api.ts`.

## Base de données
Toutes ces colonnes sont nullables ou ont une valeur par défaut : aucune ligne
existante n'est réécrite.

| Migration | Ajout |
|---|---|
| `20261124_evenement_flaix` | `events.flaix_event_id`, unique par lieu |
| `20261125_ouverture_par_evenement` | `events.orders_open_at` (nullable) |
| `20261125b_flux_flaix_par_lieu` | `venues.flaix_flux_actif` (faux par défaut) |

Les trois migrations ont été rejouées sur une base vierge (`pnpm db:verifier`).

## Tests
| Quoi | Commande | Résultat |
|---|---|---|
| Règles du flux (22 cas, dont le lien collé) | `npx jest flux-matchs-flaix` | Vert |
| Import sur base réelle (aperçu sans écriture, activation, cloisonnement, verrou) | `pnpm test:integration` | 9/9 |
| Suites complètes | serveur, intégration | 1217/1217, 227/227 |
| Admin | `next build` | OK |

Ce qui n'a pas pu être vérifié : le rendu de l'écran dans un navigateur
connecté (vu ensuite par Rémi).

## Documentation mise à jour
CHANGELOG 1.7.54, 1.7.57 et 1.7.58 ; ADR-0018 ; CLAUDE.md § 4 ; REPRISE ;
ARCHITECTURE ; DOMAIN_MODEL ; CARTE_DU_CODE ; ENGINEERING_MANUAL ; cahier des
charges Flaix (état au 26/11).

## Risques restants
- Flaix peut changer le format du flux sans prévenir. Un événement mal formé
  est écarté, sans faire tomber le reste.
- Les créneaux de retrait de Flaix ne sont jamais affichés : ils changent
  sans qu'on l'apprenne.

## Déploiement
Push sur `main`, CI verte, `/health` vérifié. Puis mise à jour à distance pour
la phrase d'ouverture dans l'app.

## Retour arrière
Couper la synchronisation du lieu dans l'admin, ou poser
`FLAIX_FLUX_IMPORT=arret` dans Railway. Les événements déjà importés restent :
ils se modifient alors dans Flaix.

## Suite
Brancher un à un les lieux Flaix. Les noms courts sont dans `REPRISE.md`.
