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
| BUG-2026-011 | 10/11 | SEV-2 | backend — campagnes | Une campagne lancée par un **lieu Flaix n'atteint personne**. | Confirmée : `scheduled-push.service.ts` (`destinataires`) cible les clients ayant une `Order` BreakEat ; les commandes Flaix n'en créent pas ; les favoris sont gardés sur le téléphone | **CORRIGÉ le 21/11 (1.7.42) — serveur en ligne (`108b02a`), mise à jour à distance de l'app à lancer** : favoris copiés au serveur, ciblage « a commandé OU suit le lieu » ([ADR-0013](DECISIONS/ADR-0013-campagnes-vers-ceux-qui-suivent-le-lieu.md), `brain/taches/2026-11-21-favoris-serveur-campagnes.md`). Ne touche que les clients **connectés**, une fois l'app mise à jour. L'envoi immédiat du back-office suit (BUG-2026-038, 1.7.43). Reste : E1 côté Flaix |
| BUG-2026-037 | 17/11 | SEV-3 | poste opérateur — charge | Le tableau opérateur charge TOUTES les commandes actives d'un événement, sans pagination : réponse et mémoire proportionnelles au retard accumulé. | Confirmée (Audit Codex du 17/11 (`brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`)) | OUVERT — à traiter avec le test de charge (préproduction, BUG-2026-014) |
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

| BUG-2026-016 | 12/11 | SEV-3 | dépendances | Premier audit des dépendances : **62 failles « élevées »**, 0 critique, **aucune dans le serveur** — outillage Expo (app mobile) et Next.js (consoles). | Confirmée (`pnpm audit --prod`) | CORRIGÉ le 12/11 : versions corrigées forcées dans la même version majeure (`pnpm-workspace.yaml` → `overrides`), **62 → 4**. Les 4 restantes sont des **risques acceptés**, listés dans `.github/workflows/audit-dependances.yml` : `sharp` 0.34 (3 avis, imposé par Next 15, non utilisé sur Vercel) et `decode-uri-component` 0.2 (via React Navigation ; la version corrigée est un module ES qu'il ne charge pas ; effet possible : figer l'app sur une adresse piégée, aucun accès aux données). À lever avec les prochaines montées de Next et de React Navigation. **Vérifié** : CI verte, Railway redéployé, et **build iOS de contrôle n° 45 réussie** (12/11, non envoyée sur TestFlight) |

| BUG-2026-017 | 16/11 | **SEV-1** | sécurité — organisations | **Prise de compte possible** : un responsable de club invitait par e-mail un compte EXISTANT (responsable d'un autre club, client, plateforme) comme opérateur, puis redéfinissait son mot de passe. | Confirmée par lecture du code (`inviteByEmail` + `resetMemberPassword`, contrôle limité au rôle dans CE club). Exploitation non constatée, non vérifiable depuis le dépôt | CORRIGÉ le 16/11 : `assertCompteDuClubSeulement` — un club ne redéfinit que les comptes sans vie hors de lui. Compte rendu : `brain/taches/2026-11-16-test-croise-organisations.md` |
| BUG-2026-018 | 16/11 | SEV-3 | sécurité — commandes | `PATCH /orders/:id/assign-slot` acceptait le créneau d'un autre événement, donc d'un autre club, et y consommait une place. | Confirmée par lecture du code | CORRIGÉ le 16/11 : `assertCreneauCompatible` (même événement, même buvette) |

| BUG-2026-019 | 16/11 | SEV-4 | poste opérateur | Un poste rattaché à une buvette affichait les créneaux communs (sans buvette) comme cliquables ; le clic finissait en erreur rouge 403 « Ce créneau ne concerne pas ta buvette ». | Confirmée : `SlotBar` les montrait, `requirePorteeBuvette` les refuse (règle voulue) | CORRIGÉ le 16/11 : créneaux communs en lecture seule, marqués « commun », sur un poste rattaché |

| BUG-2026-013 | 31/10 | SEV-3 | mobile — Android | Aucun envoi possible sur Google Play. | Confirmée : la clé d'importation attendue (`B4:0E:…`) était celle de l'éditeur précédent, introuvable | **VÉRIFIÉ le 17/11** : Google a validé la nouvelle clé (`F8:C8:BD:86:…:D0:08`, certificat téléchargé de la Play Console) et accepté l'`.aab` 1.1.3 (code 7). `brain/taches/2026-11-17-soumission-stores-1.1.3.md` |
| BUG-2026-020 | 16/11 | SEV-2 | créneaux | À 20 h, le client voyait encore « 14:00 – 14:15 » et pouvait le choisir ; le serveur l'acceptait. | Confirmée : liste publique et `assertCreneauCompatible` sans contrôle de `endAt` | CORRIGÉ : liste du client filtrée le 16/11 (CHANGELOG 1.7.36), refus côté serveur le 17/11 (1.7.39, + 2 tests). ADR-0011 |
| BUG-2026-021 | 17/11 | SEV-2 | mobile — panier | « Au plus vite » choisi APRÈS un créneau : la commande partait quand même sur l'ancien créneau. | Confirmée par relecture du code : l'app n'envoyait le choix que s'il y avait un créneau ; `POST /carts` réutilise le panier ouvert, qui gardait le sien | CORRIGÉ le 17/11 (1.7.39) : choix toujours envoyé, `null` compris (efface et rend la place). **Mise à jour à distance à relancer.** Trouvé avant tout signalement |
| BUG-2026-022 | 16/11 | SEV-2 | événements — lieux BreakEat | Le concert du Dôme programmé à 14 h ne s'est pas ouvert : il fallait passer l'événement en « Actif » et la buvette en « Ouverte » à la main, et rattacher la buvette. | Confirmée : aucune automatisation | CORRIGÉ le 16/11 : rattachement d'office, ouverture et fermeture automatiques, comptoir par défaut (1.7.35, 1.7.36, ADR-0009). À observer sur un vrai événement |
| BUG-2026-023 | 16/11 | SEV-2 | mobile — créneaux | Un événement sans créneau (ou aux créneaux passés) bloquait le client à l'écran de choix : aucun moyen de commander « tout de suite ». | Confirmée (constat de Rémi) | CORRIGÉ le 16/11 : « Au plus vite » toujours proposé (1.7.38, ADR-0011), livré par la mise à jour à distance 1.1.3 |
| BUG-2026-024 | 16/11 | SEV-3 | partager l'addition | Le lien envoyé (`breakeat://split/…`) n'était pas cliquable dans WhatsApp ou les SMS ; « Choisir un créneau puis partager » finissait au paiement. | Confirmée | CORRIGÉ le 16/11 (1.7.31) : lien `https`, le partage reprend après le choix du créneau |
| BUG-2026-025 | 17/11 | SEV-4 | mobile — textes | Du vouvoiement restait devant le client (connexion, paiement, profil, aide…) et dans la notification « produit manquant », contre la règle du tutoiement. | Confirmée (recherche dans le code) | CORRIGÉ le 17/11 (1.7.39). **Reste** : textes de permission iOS dans `app.config.js` — build native, version 1.1.4 |
| BUG-2026-026 | 16/11 | SEV-4 | CI | CI rouge sur `f569b60` : le test d'intégration de la duplication de buvette attendait l'ancienne règle (pas de rattachement). | Confirmée (journal de la CI) | CORRIGÉ par `67a1632` (test aligné sur ADR-0009) ; CI verte depuis |
| BUG-2026-027 | 17/11 | SEV-2 | Android — Google Play | Deux « problèmes de règles » bloquaient toute mise à jour : bibliothèque Google Play Billing antérieure à 8.0.0, pages mémoire de 16 ko non prises en charge. | Confirmée : ils viennent de l'ancienne version publiée (code 4, éditeur précédent) | CORRIGÉ par la 1.1.3 (code 7) : aucune bibliothèque Billing, 52 bibliothèques natives alignées 16 ko (contrôle de l'`.aab`). Levés à la publication |
| BUG-2026-028 | 17/11 | SEV-3 | Android — Google Play | Sécurité des données : e-mail, téléphone et identifiants d'appareil collectés mais « non déclarés » (code de version 4). | Confirmée par l'analyse de Google | CORRIGÉ le 17/11 : déclaration refaite d'après le code, en examen chez Google |
| BUG-2026-030 | 17/11 | **SEV-1** | paiement — panier | Un paiement **abandonné** (feuille fermée) laissait le panier « en attente » pour toujours, avec le stock et la place du créneau retenus : articles et créneaux paraissaient complets. | Confirmée (Audit Codex du 17/11 (`brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`)) : aucune tâche ne reprenait un panier `CHECKOUT_PENDING` | CORRIGÉ le 17/11 (1.7.41) : `PaiementsAbandonnesService` (5 min, délai 30 min, Stripe vérifié puis annulé, bascule conditionnelle, tout rendu). `brain/taches/2026-11-17-corrections-audits-codex.md` |
| BUG-2026-031 | 17/11 | **SEV-1** | paiement — panier | Une modification du panier pendant l'appel à Stripe pouvait changer les lignes sans changer le montant : le webhook refusait la commande, **client débité sans commande**. | Confirmée par lecture du code (Audit Codex du 17/11 (`brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`)) ; jamais constatée en production | CORRIGÉ le 17/11 (1.7.41) : modifications sous verrou (`modifierSiOuvert`), panier relu et comparé au gel (`figerEtEngager`) |
| BUG-2026-032 | 17/11 | SEV-2 | Flaix — webhook | Un événement Flaix tombé en erreur était ensuite pris pour un doublon : la mise à jour (dont « prête ») était perdue. | Confirmée (Audit Codex du 17/11 (`brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`)) ; sans effet aujourd'hui (flux E1 absent) | CORRIGÉ le 17/11 (1.7.41) : repris après échec, 409 si en cours ailleurs |
| BUG-2026-033 | 17/11 | SEV-2 | événements — ouverture automatique | Une coupure entre « événement Actif » et « points de retrait ouverts » laissait un événement affiché ouvert, impossible à commander, jamais repris. | Confirmée (Audit Codex du 17/11 (`brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`)) | CORRIGÉ le 17/11 (1.7.41) : une transaction par événement, erreur isolée |
| BUG-2026-034 | 17/11 | SEV-3 | sécurité — poste opérateur | `GET /orders/event/:id/active` ne tenait pas compte de l'épinglage : un poste rattaché à une buvette lisait les commandes des autres (même club). | Confirmée (Audit Codex du 17/11 (`brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`)) ; route sans écran | CORRIGÉ le 17/11 (1.7.41) : filtre sur la buvette épinglée |
| BUG-2026-035 | 17/11 | SEV-3 | événements — création | Événement créé puis rattachements écrits à part : une erreur au milieu laissait un événement incomplet, et un nouvel essai en créait un second. | Confirmée (Audit Codex du 17/11 (`brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`)) | CORRIGÉ le 17/11 (1.7.41) : une transaction. Reste : pas de contrainte d'unicité sur le comptoir par défaut |
| BUG-2026-036 | 17/11 | SEV-4 | organisations — invitations | Acceptation : expiration et réémission vérifiées avant la transaction (fenêtre de quelques ms). | Confirmée (Audit Codex du 17/11 (`brain/audits/REPONSE_AUDITS_CODEX_2026-11-17.md`)) | CORRIGÉ le 17/11 (1.7.41) : invitation consommée sous condition dans la transaction |
| BUG-2026-038 | 21/11 | SEV-3 | back-office — notifications | « **Envoyer au club** » (envoi IMMÉDIAT du back-office) atteint les **membres de l'équipe du club** (`organization_members`), pas ses clients ; la même cible **programmée** atteint les clients (commandes + favoris). Même bouton, deux publics. | Confirmée (lecture du code : `backoffice.service.ts`, `sendNotification` ; contre `scheduled-push.service.ts`, `destinataires`) | **CORRIGÉ DANS LE CODE le 21/11 (1.7.43), pas encore en ligne** — tranché par Rémi : **les clients seulement**. L'envoi immédiat prend le public d'une campagne du club (`ScheduledPushService.resolveAudience`) ; libellés « Clients de … » / « Envoyer aux clients du club » |
| BUG-2026-029 | 16/11 | SEV-4 | mobile — en-tête du lieu | La pastille « Prochain événement » touchait l'image du lieu sur iPhone. | Confirmée : marge posée sur un enfant d'une rangée qui passe à la ligne, ignorée | CORRIGÉ le 16/11 (1.7.37, 1.7.38) : écart porté par le conteneur |

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
