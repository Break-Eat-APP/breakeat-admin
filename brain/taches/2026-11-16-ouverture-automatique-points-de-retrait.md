# Compte rendu — Points de retrait rattachés d'office, ouverture et fermeture automatiques

- **Date :** 16/11/2026
- **Agent / développeur :** Claude Code (Opus), à la demande de Rémi
- **Commit(s) :** `f569b60` (rattachement, ouverture et fermeture
  automatiques, menu « Configuration »), `67a1632` (test d'intégration
  adapté), `7ce410e` (comptoir par défaut, plus de créneau passé proposé)
- **Bug / décision liés :** ADR-0009 ; BUG-2026-022 ; BUG-2026-026
- **Statut :** TERMINÉ (à éprouver sur un vrai match)

## Objectif
Qu'un événement d'un lieu BreakEat s'ouvre et se ferme **tout seul**, avec ses
points de retrait, sans geste manuel du club.

## Avant
En testant le concert du Dôme, Rémi a dû rattacher la buvette à l'événement
(deux écrans possibles), passer l'événement en « Actif », puis la buvette en
« Ouverte ». L'événement de 14 h ne s'est pas ouvert. Une commande ne se paie
pas sans comptoir de retrait, et les comptoirs se créaient à la main.

## Cause
Confirmée par lecture du code : aucune automatisation du statut ; la création
d'un panier exige un événement **Actif** et une buvette **Ouverte**.

## Ce qui a été fait
- **Rattachement d'office** (`common/helpers/rattachement-buvettes.ts`) : un
  événement qui naît reçoit tous les points de retrait du club (hors ligne
  exclus) ; un point de retrait qui naît (ou dupliqué) rejoint tous les
  événements à venir du club ; le contenant d'un lieu en continu les reçoit
  aussi. Jamais rejoué ensuite : une **désactivation** manuelle par événement
  n'est jamais défaite.
- **Un comptoir par défaut**, au nom du point de retrait, pour chaque paire
  événement / point de retrait qui n'en a aucun d'actif (contenant permanent
  exclu).
- **Ouverture et fermeture automatiques** (`events/ouverture-automatique.service.ts`,
  chaque minute) — lieux BreakEat seulement, hors contenant permanent :
  - brouillon avec au moins un point de retrait → **Actif** à l'heure où la
    commande ouvre (`heureDOuverture`, même règle que l'app), points de
    retrait **fermés** → ouverts ;
  - à l'heure de fin, **Actif ou En pause** → **Terminé**, points de retrait
    **ouverts** → fermés, sauf s'ils servent encore un autre événement en cours
    ou un service continu ;
  - jamais touchés : points de retrait **en pause** ou **hors ligne**,
    événement en pause (pas rouvert), annulé ou terminé, lieux Flaix ;
  - chaque bascule est **conditionnelle** (`updateMany` sur le statut
    attendu) : sûre à plusieurs instances, n'écrase pas un changement du club.
- **Liste des créneaux du client** : les créneaux passés ne sont plus
  proposés.
- **Console** : « fournisseur » devient « point de retrait » ; menu
  « Configuration » ; carte « Points de retrait de l'événement (x sur y) »
  avec Désactiver / Réactiver ; « Rattacher à un événement » retiré de la
  fiche du point de retrait.

## Fichiers
- Créés : `backend/src/common/helpers/rattachement-buvettes.ts` (+ spec),
  `backend/src/modules/events/ouverture-automatique.service.ts` (+ spec),
  `brain/DECISIONS/ADR-0009-…`.
- Modifiés : `events.service.ts`, `events.module.ts`, `suppliers.service.ts`,
  `venues.service.ts`, `public-events.controller.ts`, leurs specs ;
  `test/integration/duplication-buvette.int-spec.ts` ; console : `lib/nav.ts`,
  `layout.tsx`, `events/[id]/page.tsx`, `suppliers/[id]/page.tsx`.

## Base de données
Aucune migration : seulement des écritures (`EventSupplier`, `PickupPoint`,
statuts).

## Tests
| Quoi | Commande | Résultat |
|---|---|---|
| Rattachement et comptoir par défaut | `jest -i src/common/helpers/rattachement-buvettes.spec.ts` | 4 tests verts |
| Ouverture / fermeture automatiques | `jest -i src/modules/events/ouverture-automatique.service.spec.ts` | 8 tests verts |
| Services événements, buvettes, lieux | specs correspondantes | vertes |
| CI complète, intégration sur PostgreSQL réel | GitHub Actions | **rouge** sur `f569b60` (le test d'intégration attendait l'ancienne règle — BUG-2026-026), **verte** à partir de `67a1632` |

Non éprouvé en vrai : l'ouverture d'un vrai match à son heure (à observer au
prochain événement d'un lieu BreakEat, dans les journaux Railway :
« Ouverture automatique : … »).

## Documentation mise à jour
CHANGELOG 1.7.35 et 1.7.36, ROADMAP, ADR-0009, `brain/ARCHITECTURE.md` (§ 4.1
et § 4.5), `brain/DOMAIN_MODEL.md`, REPRISE.

## Risques restants
- Le statut d'un point de retrait est **global** : l'ouvrir pour un
  événement l'ouvre pour tous ceux auxquels il est rattaché.
- Un club à **plusieurs lieux** voit ses points de retrait rattachés à tous
  ses événements : ceux de l'autre lieu se désactivent à la main.
- Le comptoir par défaut n'est pas protégé par une contrainte d'unicité : deux
  rattachements simultanés de la même paire pourraient en créer deux
  (improbable, sans effet sur les commandes).
- Les événements Flaix reçoivent aussi les points de retrait (sans effet :
  la commande passe par Flaix).

## Déploiement
Railway, automatique sur `main` ; `/health` → `7ce410e` vérifié le 17/11.

## Retour arrière
Retirer `OuvertureAutomatiqueService` des `providers` de `events.module.ts`
arrête l'automatisme ; les rattachements déjà écrits restent (inoffensifs,
désactivables par événement).

## Suite
Observer la première ouverture automatique réelle ; Rémi teste « Moto Cross
X » et le Dôme.
