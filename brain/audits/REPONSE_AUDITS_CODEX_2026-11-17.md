# Réponse aux deux audits Codex du 17/11/2026

> Audits : `AUDIT_CHIRURGICAL_2026-11-17.md` (révision `7b95f7c`) et
> `AUDIT_COMPLET_CHIRURGICAL_2026-11-17.md` (révision `64719f6`).
> Réponse de Claude Code, après **vérification de chaque constat dans le
> code**, corrections décidées par Rémi (« ok lance les corrections »).
> Compte rendu : `brain/taches/2026-11-17-corrections-audits-codex.md`.

## Constat par constat

| # | Constat | Vérifié | Décision | Où |
|---|---|---|---|---|
| 1 | P1 — Paiement abandonné : stock, créneau (et points) retenus sans échéance | ✅ vrai : aucune tâche ne reprenait un panier `CHECKOUT_PENDING` ; seuls les points étaient rendus (ronde fidélité) | **CORRIGÉ** (BUG-2026-030) — `PaiementsAbandonnesService`, toutes les 5 min, panier en attente depuis 30 min : Stripe interrogé ; si le paiement peut encore aboutir, rien ; sinon annulé chez Stripe, puis panier « abandonné » par bascule conditionnelle, points + place + stock rendus | `cart/paiements-abandonnes.service.ts` (+ 9 tests) |
| 2 | P1 — Panier modifiable pendant la création du paiement | ✅ vrai. Pas de fraude possible (le webhook refuse un total différent du montant payé) mais l'inverse : **débité sans commande** | **CORRIGÉ** (BUG-2026-031) — chaque modification écrit sous verrou conditionnel (`status = OPEN`) ; au gel, le panier est relu sous verrou et comparé au contenu chiffré ; différent → rien n'est figé, tout est rendu, 409 « rien n'a été débité » | `cart/cart.service.ts` (`modifierSiOuvert`, `figerEtEngager`, + 2 tests) |
| 3 | P1 — Webhook Flaix en échec ensuite pris pour un doublon | ✅ vrai (sans effet aujourd'hui : le flux E1 n'existe pas) | **CORRIGÉ** (BUG-2026-032) — traité → doublon ; en échec → repris par une seule livraison ; en cours ailleurs → 409, Flaix réessaie | `live-activity/flaix-webhook.service.ts` (+ 2 tests) |
| 4 | P1 — Ouverture / fermeture automatiques non atomiques | ✅ vrai | **CORRIGÉ** (BUG-2026-033) — événement et points de retrait dans **une transaction** par événement ; une erreur n'arrête plus le lot, l'événement est repris la minute suivante | `events/ouverture-automatique.service.ts` (+ 3 tests) |
| 5 | P1 — Stripe en mode test en production | ✅ vrai, **voulu** (ADR-0012) | **ASSUMÉ jusqu'à la sortie** : passage en production avant toute publication | REPRISE, point 1 |
| 6 | P2 — `GET /orders/event/:id/active` ignore l'épinglage à une buvette | ✅ vrai (aucun écran ne s'en sert) | **CORRIGÉ** (BUG-2026-034) — même règle que le tableau : un poste épinglé ne lit que sa buvette | `orders.controller.ts`, `orders.service.ts` (+ 4 tests) |
| 7 | P2 — Création d'événement et rattachements en deux temps | ✅ vrai | **CORRIGÉ** (BUG-2026-035) — une seule transaction. La contrainte d'unicité du comptoir par défaut n'est **pas** posée (migration) : risque résiduel faible, noté | `events.service.ts`, `rattachement-buvettes.ts` (+ 1 test) |
| 8 | P2 — Invitation : expiration et réémission vérifiées hors transaction | ✅ vrai, fenêtre de quelques millisecondes | **CORRIGÉ** (BUG-2026-036) — l'invitation est consommée DANS la transaction, à condition de n'avoir ni changé ni expiré | `organizations.service.ts` (+ 1 test) |
| 9 | P2 — Rattachement par club et non par lieu | Vrai : un `Supplier` n'a pas de `venueId` | **ASSUMÉ** (ADR-0009, règle de Rémi : un club = un lieu). À reprendre — avec une migration — le jour où un club exploite deux stades | ADR-0009 |
| 10 | P2 — Statut global d'un point de retrait | Vrai, déjà documenté | **ASSUMÉ** (ADR-0009) | — |
| 11 | P2 — Tableau opérateur sans pagination | Vrai | **OUVERT** (BUG-2026-037) — à traiter avec le test de charge | REPRISE, sujets ouverts |
| 12 | P2 — Téléphone non vérifié par SMS | Vrai, c'est voulu : le téléphone est facultatif et non vérifié | **QUESTION PRODUIT** pour Rémi ; pas un défaut de commande | REPRISE |
| 13 | P2 — Les interrupteurs génériques ne coupent pas les modules | Vrai : seul `app.split.enabled` est branché | **DOCUMENTÉ** : ne pas s'en servir comme coupe-circuit | `brain/ARCHITECTURE.md` § 8 |

## Capacité (10 000 utilisateurs, 5 000 commandes, 50 lieux)

**D'accord avec Codex : non certifiable aujourd'hui.** Le seul objectif
documenté est 500 utilisateurs et 20 tableaux ; aucun test de charge à cette
échelle, et pas de préproduction (BUG-2026-014). Les corrections 1 à 4
retirent les défauts de code qui auraient compromis un soir chargé ; elles
ne remplacent pas la mesure. Suite : pilote sur un lieu BreakEat, puis banc
de charge progressif (500 → 2 000 → 5 000) sur une préproduction. Ne pas
annoncer de chiffre de capacité au lancement.

## Tests lancés

Fichier par fichier sur le poste (`-i`, 1 000 Mo) : ouverture automatique
11/11, webhook Flaix 24/24, commandes (contrôleur + service) 74/74,
événements + rattachement 42/42, organisations 40/40, panier 54/54,
paiements abandonnés 9/9. Typage du serveur : 0 erreur. Lint des fichiers
touchés : 0 erreur. La CI (suite complète, intégration sur PostgreSQL réel)
fait foi après la poussée.
