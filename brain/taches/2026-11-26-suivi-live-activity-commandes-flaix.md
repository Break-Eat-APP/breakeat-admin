# Compte rendu — Commandes Flaix : suivi en base, « prête », Live Activity, note

- **Date :** 24 au 26/11/2026
- **Agent / développeur :** Claude Code (session locale), à la demande de Rémi
- **Commit(s) :**
  - `7a01798` (1.7.53), `f8f59d5` (1.7.56), `1459a76` (1.7.60) ;
  - `3456700` (journal), `d02752f` (1.7.61), `be3c812` (1.7.62) ;
  - `a7e419b` (1.7.63), `912170a` (1.7.64), `be42b05` (1.7.65) ;
  - `5b24420` (1.7.66), `b028f84` (widget 1.1.5).
- **Bug / décision liés :**
  - BUG-2026-052, 054, 055 ;
  - ADR-0015 (commandes Flaix lues par e-mail ; suivi désormais en base) ;
  - décision de Rémi du 24/11 : pas de webhook, on interroge ;
  - audits Codex du 26/11 et leurs réponses dans `brain/audits/`.
- **Statut :** TERMINÉ. Vérifié en vrai le 25/11 sur la commande n° 1006 au
  Mans.

## Objectif
Une commande passée chez Flaix doit vivre dans BreakEat comme une commande
BreakEat :
- une Live Activity qui avance ;
- « Ta commande est prête » avec un son ;
- la flamme et « Mes commandes » en direct ;
- une note après la remise.

## Avant
- La surveillance « prête » vivait **en mémoire** : un redémarrage du serveur
  l'effaçait.
- Le serveur n'apprenait une commande qu'en lisant « Mes commandes ».
- Pas de Live Activity pour une commande Flaix.
- « En préparation » n'apparaissait pas.

## Cause
Confirmée, essai par essai, avec les journaux Railway :
- Après paiement, Flaix reste sur l'adresse du match (`/o/<match>`) : pas de
  jeton à lire dans l'adresse (BUG-2026-054).
- Flaix dit `assigned` pour « en préparation ». Ce mot n'était documenté nulle
  part (BUG-2026-055).

## Ce qui a été fait
**Serveur**
- Suivi en base (`SuiviCommandeFlaix`) :
  - 15 s jusqu'à « prête », 60 s ensuite, 12 h au plus ;
  - chaque suivi est réservé avant traitement (sûr à plusieurs instances).
- « Prête » est annoncée une fois (3 essais ; un `sent: 0` compte comme un
  échec).
- Live Activity par APNs (`LiveActivityFlaix`) :
  - `etatEnvoye` + `rattraperActivites` reprennent après une erreur, et
    poussent l'état à une activité enregistrée en retard ;
  - l'activité se ferme à la remise.
- `GET /flaix/mes-suivis` donne l'état en direct, lu dans notre base.
- « Note ta commande » :
  - la relance part 10 min après la remise, une fois, jamais après 24 h ;
  - `POST /flaix/commandes/:jeton/note`, une note par commande ;
  - table `NoteCommandeFlaix`.
- Image du lieu et logo du club ajoutés à `mes-commandes`.
- Chaque étape est écrite dans le journal Railway, avec le numéro seulement.

**App**
- La page Flaix repère la commande payée par différence de liste, la fait
  suivre et démarre la Live Activity `flaix-<jeton>`. Pas de doublon :
  `suivies` et `enCours`.
- Messages acceptés : `flaix_commande` (immédiat) et `flaix_fermer`
  (`window.close()` intercepté, qui ramène à « Mes commandes »).
- La flamme s'allume pour une commande Flaix et suit la **dernière commande
  passée** (règle de Rémi du 26/11).
- Le ticket Flaix montre l'état en direct, « Noter ma commande », l'image du
  lieu et le numéro en vert.

**Widget (build 1.1.5)**
- L'étape s'affiche dans la Dynamic Island.
- Pas de « Je suis arrivé » pour une commande Flaix.

## Fichiers
Voir les entrées 1.7.53 à 1.7.66 de `CHANGELOG.md`. Fichiers principaux :
- serveur :
  - `backend/src/modules/flaix/surveillance-commandes-flaix.service.ts` ;
  - `etat-widget-flaix.ts`, `flaix.controller.ts`,
    `commandes-client-flaix.service.ts` ;
- app :
  - `apps/mobile/src/components/relais-flaix.native.tsx` ;
  - `lib/suivi-commande-flaix.ts`, `lib/live-activity-tracking.ts`,
    `lib/suivi-commande.ts`, `lib/use-etat-pastille.ts` ;
  - `screens/order-history.screen.tsx` ;
- widget : `targets/live-activity/BreakEatLiveActivity.swift`.

## Base de données
Tables neuves ou colonnes nullables, clés `users` en UUID. Toutes ces
migrations ont été rejouées sur une base vierge.

| Migration | Ajout |
|---|---|
| `20261124b_suivi_commandes_flaix` | tables `suivis_commandes_flaix` et `live_activities_flaix` |
| `20261126_note_commandes_flaix` | table `notes_commandes_flaix`, plus 3 colonnes nullables sur le suivi |
| `20261126b_etat_envoye_live_activity_flaix` | `etat_envoye` |

## Tests
| Quoi | Commande | Résultat |
|---|---|---|
| Suivi sur base réelle : reprise APNs, enregistrement tardif, deux instances, état cloisonné, relance de note | `pnpm test:integration` | Vert (234/234 au 26/11) |
| Fonctions de la page Flaix | `npx jest suivi-commande-flaix signal-commande-flaix` | Vert |
| Cycle complet en vrai (n° 1006, Le Mans) | iPhone de Rémi + journaux Railway | `queued → assigned → ready → delivered` |

Ce qui n'est pas vérifié : le son de « prête » sur tous les téléphones (il
dépend des réglages et du mode silencieux).

## Documentation mise à jour
CHANGELOG ; REPRISE ; BUGS_ET_INCIDENTS ; ARCHITECTURE ; DOMAIN_MODEL ;
CARTE_DU_CODE ; ENGINEERING_MANUAL ; cahier des charges Flaix ; audits et
réponses.

## Risques restants
- Le vocabulaire de Flaix peut s'enrichir : un état inconnu est journalisé une
  fois (« État de suivi Flaix inconnu »).
- Sans app à l'écran, iOS interdit de démarrer une Live Activity : seule la
  surveillance serveur part.
- Le widget ne change qu'avec une build (limite de 15 par mois).

## Déploiement
Push sur `main`, CI verte, `/health` vérifié. Puis mises à jour à distance sur
chaque version installée (voir `brain/DEPLOIEMENT.md`) et build 1.1.5 pour le
widget.

## Retour arrière
- Côté serveur : revenir au commit précédent. Les tables restent, inertes.
- Côté app : publier la mise à jour à distance précédente.

## Suite
- Écran de suivi BreakEat pour une commande Flaix, et reçu : en attente de la
  décision de Rémi.
- Statistiques du club pour les notes Flaix.
- « Reçue » en jaune dans le widget (prochaine build).
