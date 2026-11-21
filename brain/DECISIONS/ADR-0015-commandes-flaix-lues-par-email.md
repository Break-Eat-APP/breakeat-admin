# ADR-0015 — Les commandes Flaix sont LUES chez Flaix par l'e-mail du client, en attendant E1

- **Date :** 21/11/2026
- **Statut :** ACCEPTÉE (provisoire, jusqu'au webhook E1 de Flaix)
- **Décidée par :** Rémi (« il faut que demain les clients puissent recevoir
  leurs commandes sur leur compte », 21/11), instruite par l'agent
- **Liée à :** ADR-0002 (l'opérateur Flaix dit « prête »), BUG-2026-039,
  `brain/FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md` (E1),
  `brain/taches/2026-11-21-commandes-flaix-mes-commandes.md`, CHANGELOG 1.7.44

## Contexte
Une commande passée dans Flaix ne créait rien chez BreakEat. Le cahier des
charges prévoit que Flaix POUSSE ses commandes et leurs changements d'état
(webhook E1). Rémi avait un match le 22/11, et le développeur Flaix ne
travaillait pas ce week-end. Ce qui existait déjà côté Flaix : une API qui
rend les commandes d'un client **par son e-mail**, et une adresse publique de
suivi par commande.

## Options étudiées
1. **Attendre E1.** Rien pour le match du 22/11.
2. **Lire chez Flaix, à la demande, par l'e-mail du compte** (retenue).
   Faisable dans la soirée, sans rien demander à Flaix.
3. **Recopier les commandes Flaix dans la base BreakEat** (une `Order` par
   commande). Rejetée pour l'instant : sans webhook, la copie serait vite
   périmée, et Flaix reste la source de vérité de ses commandes (règle 4).

## Décision
- Le serveur lit chez Flaix les commandes de l'e-mail **du compte connecté**,
  lu en base, jamais fourni par l'app. Rien n'est écrit en base.
- L'état affiché est **celui de Flaix**, relu tant que l'écran est ouvert.
  C'est l'opérateur Flaix qui dit « prête » (ADR-0002).
- Une panne Flaix rend une liste vide, jamais une erreur. Deux variables
  Railway (`FLAIX_COMMANDES_URL`, `FLAIX_COMMANDES_API_KEY`) allument la
  fonction ; retirer la clé l'éteint.
- Le lien de commande remplit `mail=[#mail]` avec l'e-mail du compte : la
  commande passée depuis l'app porte la bonne adresse.

## Complément du 21/11 au soir (1.7.45) — la notification « prête »
Décidé par Rémi (« Oui, fais-le »). Chaque lecture de « Mes commandes » fait
retenir au serveur les commandes Flaix en cours du client. Toutes les 15 s,
il lit leur état chez Flaix. Au passage à « prête », il envoie la même
notification qu'une commande BreakEat, **une fois**.
**Écart assumé à la règle 3 de `CLAUDE.md`** : la liste est en mémoire, pas en
base. Un redémarrage du serveur l'efface (reprise à la lecture suivante de
« Mes commandes »), et un envoi raté n'est pas rejoué. Le client doit avoir
ouvert « Mes commandes » une fois après sa commande. Le webhook `ORDER_READY`
de Flaix remplacera ce dépannage.

## Ce que ça coûte
- **L'e-mail n'est pas vérifié par BreakEat** (BUG-2026-039). Risque accepté
  par Rémi pour les essais. À corriger avant l'ouverture au public.
- Pas de Live Activity, pas de « Je suis arrivé », de note, de fidélité ni de
  campagne « a commandé » pour ces commandes : tout cela demande que Flaix
  pousse ses changements (E1). La notification « prête » passe par le
  dépannage du complément ci-dessus.
- Chaque écran ouvert interroge Flaix toutes les 10 s (liste gardée 5 s par
  client). Assez pour des essais, pas pour un soir de grande affluence.

## Ce qui la remplacera
Le webhook E1 (`ORDER_CREATED`, puis `ORDER_READY`…, avec un identifiant de
commande Flaix) et l'étiquette `[#breakeatId]`. Cette ADR passera alors en
`REMPLACÉE`.
