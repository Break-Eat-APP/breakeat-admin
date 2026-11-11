# Bugs et incidents — le registre

> **Un bug connu ne reste jamais seulement dans une conversation, un audit ou
> la mémoire d'un agent.** Il a une ligne ici, un identifiant stable et un
> statut. Le détail (analyse, correctif, chiffres) reste là où il a été écrit
> — `CHANGELOG.md`, `brain/audits/`, `REPRISE.md` — et la ligne y renvoie.
>
> Ouvert le 11/11/2026 (gouvernance, étape 2). Les entrées antérieures ont été
> reprises après coup des audits et de `REPRISE.md` : ce sont les plus
> marquantes, pas l'inventaire exhaustif de l'historique.

## Comment s'en servir

- **Identifiant** : `BUG-AAAA-NNN` (défaut) ou `INC-AAAA-NNN` (incident de
  production : le service ou des données ont été touchés). Jamais réutilisé.
- **Sévérité** : `SEV-0` données perdues ou corrompues, sécurité, paiements
  gravement touchés · `SEV-1` fonction critique indisponible (commander,
  payer, comptoir) · `SEV-2` fonction importante dégradée, contournement
  possible · `SEV-3` défaut limité, affichage · `SEV-4` mineur.
- **Statut** : `OUVERT` · `EN COURS` · `CORRIGÉ` (code livré) · `VÉRIFIÉ`
  (constaté en vrai, sur appareil ou en production) · `FERMÉ` · `ACCEPTÉ`
  (connu, assumé, pas de correction prévue).
- **Quand ajouter une ligne** : tout bug signalé par Rémi ou un audit, tout
  incident de production. Un incident `SEV-0` ou `SEV-1` reçoit en plus un
  compte rendu dans `brain/taches/` (cause, chronologie, prévention).
- **Avant d'écrire une cause** : demander les journaux (Railway, Stripe,
  Vercel). Cause **confirmée**, **probable** ou **inconnue** — jamais
  devinée et présentée comme sûre.

---

## Ouverts

| ID | Date | Sév. | Module | Description | Cause | Statut / suite |
|---|---|---|---|---|---|---|
| BUG-2026-010 | 10/11 | SEV-2 | mobile — écran Saison | Un lieu réglé « Ouvert en continu » sans match daté n'a **aucun bouton « Commander »** : l'écran dit « Ce lieu prend les commandes en continu » et le client est bloqué. Touche tout lieu en continu, Flaix ou non. | Confirmée : `saisonDuLieu` écarte le contenant permanent, `selection` reste nul (`apps/mobile/src/screens/saison.screen.tsx`) | OUVERT — en attente du feu vert de Rémi (lié au « lien calendrier Flaix », REPRISE point 5). **Ne pas basculer un lieu Flaix en continu d'ici là.** |
| BUG-2026-011 | 10/11 | SEV-2 | backend — campagnes | Une campagne lancée par un **lieu Flaix n'atteint personne**. | Confirmée : `scheduled-push.service.ts` (`destinataires`) cible les clients ayant une `Order` BreakEat ; les commandes Flaix n'en créent pas ; les favoris sont gardés sur le téléphone | OUVERT — correctif possible sans Flaix (favoris au serveur, ≈ 1 j), puis E1 côté Flaix. Plan des API, REPRISE |
| BUG-2026-013 | 31/10 | SEV-3 | mobile — Android | Aucun envoi possible sur Google Play. | Confirmée : clé d'importation à réinitialiser, demandée à Google le 09/11 | OUVERT — attend Google |
| BUG-2026-014 | 09/11 | SEV-3 | infra — préproduction | Il n'existe **aucun environnement de préproduction** : migrations et intégrations partent en production directement après la CI. | — | OUVERT — procédure prête (`GUIDE_DEVELOPPEMENT/ENVIRONNEMENT_BETA.md`) ; à faire avant les API Flaix |

## Corrigés récemment (novembre 2026)

| ID | Date | Sév. | Module | Description | Cause | Correctif |
|---|---|---|---|---|---|---|
| BUG-2026-001 | 10/11 | SEV-2 | mobile — icône iOS | Icône floue sur l'iPhone (builds 42 et 43) alors que le fichier était net. | Confirmée : iOS 26 habille toute icône PNG de reflets, d'ombre et d'un dégradé | VÉRIFIÉ sur iPhone (build 44) — format Icon Composer, effets coupés. CHANGELOG 1.7.15. **Ne pas revenir à un PNG.** |
| BUG-2026-002 | 11/11 | SEV-2 | notifications | Aucune notification quand la commande est **prête** : la Live Activity se met à jour en silence, rien sur Android. | Confirmée : push par étape retiré le 07/09 | CORRIGÉ — CHANGELOG 1.7.14 ; à vérifier en vrai sur appareil |
| BUG-2026-003 | 11/11 | SEV-2 | notifications | L'annonce « prête » pouvait se **perdre** si le serveur s'arrêtait entre l'enregistrement et l'envoi ; pas de garde contre une double sonnerie. | Confirmée (audit Codex) : envoi après commit, sans reprise | CORRIGÉ — promesse dans la transaction, bail, rattrapage chaque minute. CHANGELOG 1.7.16, `brain/audits/AUDIT_2026-11-11_codex-notification-prete.md` |
| BUG-2026-004 | 11/11 | SEV-3 | mobile — notifications | Le **toucher d'une notification était rejoué** à chaque lancement de l'app, et traité deux fois au démarrage à froid. | Confirmée (audit Codex) : réponse jamais effacée | CORRIGÉ — CHANGELOG 1.7.16 |
| BUG-2026-005 | 11/11 | SEV-2 | mobile — clavier | Impossible de **fermer le clavier** (note d'une commande, « Mes informations ») ; « Enregistrer » restait dessous. | Confirmée : pavé téléphone et champ multiligne sans touche « OK » sur iPhone, pas d'évitement du clavier | CORRIGÉ — CHANGELOG 1.7.13 |
| BUG-2026-006 | 11/11 | SEV-3 | mobile — détail commande | « Signaler un problème » à moitié caché sous la barre du bas. | Confirmée : pas d'espace réservé à la barre flottante | CORRIGÉ — CHANGELOG 1.7.13 |
| BUG-2026-007 | 10/11 | SEV-3 | mobile — saison | « La commande ouvre à 08:00 » **sans le jour** : affiché un mardi pour un concert le vendredi. | Confirmée | CORRIGÉ — CHANGELOG 1.7.11 |
| BUG-2026-008 | 10/11 | SEV-2 | backend — panier | Le créneau pouvait changer après le début du paiement ; deux « Payer » simultanés pouvaient retenir deux fois le stock. | Confirmée (audit Codex du 10/11) | CORRIGÉ — `brain/audits/AUDIT_2026-11-10_codex-multi-lieux-charge.md` |
| BUG-2026-009 | 10/11 | SEV-2 | admin | « Access denied » brut pour le super admin sur les lieux dont il n'est pas membre. | Confirmée : contrôle d'appartenance sans exception super admin | CORRIGÉ — rôle relu en base (`orders.controller.ts`, `flaix.controller.ts`) |

| BUG-2026-015 | 11/11 | SEV-4 | infra — sauvegardes | La restauration n'avait jamais été faite à partir d'un **artefact de nuit** réel (seulement par le script, le 18/09 et le 25/10). | — | **VÉRIFIÉ le 11/11** : workflow `essai-restauration.yml`, exécution 43092415355 — dernière sauvegarde de nuit téléchargée, déchiffrée avec la phrase réelle, restaurée sans erreur dans un PostgreSQL 18 jetable ; tables, migrations, organisations, lieux et commandes retrouvés. Relancé le 1er de chaque mois |

| BUG-2026-012 | 10/11 | SEV-4 | backend — tests | Test d'intégration instable : `temps-reel-multi-instances` › « SANS canal commun » avait échoué une fois (commit `871d5ff`, documentation seule). | Probable : ports fixes 45021/45022, fermetures non attendues entre deux tests, client qui attendait sa connexion sans jamais échouer | CORRIGÉ le 11/11 — ports éphémères, fermetures attendues, connexion qui échoue tout de suite avec sa raison. À surveiller sur les prochains passages de CI |

## Incidents de production

| ID | Date | Sév. | Description | Cause | Leçon (où elle vit maintenant) |
|---|---|---|---|---|---|
| INC-2026-003 | 23→25/10 | **SEV-1** | **Production figée deux jours** : l'API répondait, mais servait le code d'avant le 23/10. | Confirmée : migration `20261023_note_de_commande` en échec (`P3009`, clé étrangère TEXT vers UUID) ; Railway gardait l'ancienne version | Les clés sont en UUID ; rejouer toute migration écrite à la main sur un PostgreSQL vierge ; `/health` rend le commit déployé. REPRISE (« UNE MIGRATION ÉCRITE À LA MAIN… »), `CLAUDE.md` § 5 |
| INC-2026-002 | 06/09 | **SEV-0** | « Je paie et aucune commande n'apparaît » : paiement débité, commande non créée. | Confirmée (journaux Railway) : produit sans ligne de stock, exception APRÈS le débit | Diagnostiquer par les journaux d'abord (six heures d'hypothèses). `CLAUDE.md` § 3 |
| INC-2026-001 | 25/07→26/10 | SEV-1 | Serveur à l'arrêt (404 « Application not found »). | Confirmée : essai Railway expiré | Abonnement en place ; `/health` à surveiller |

## Fermés / historiques

Les défauts antérieurs à novembre 2026 sont documentés dans leurs audits
(`brain/audits/`, dont les audits Codex du 30/09 au 10/11) et dans
`CHANGELOG.md`. Ils ne sont repris ici que s'ils reviennent.
