# ADR-0009 — Points de retrait rattachés d'office ; ouverture et fermeture automatiques

- **Date :** 16/11/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi, sur proposition de Claude
- **Liée à :** CHANGELOG 1.7.35 ; `common/helpers/rattachement-buvettes.ts` ;
  `modules/events/ouverture-automatique.service.ts`

## Contexte
En testant le concert du Dôme (16/11), Rémi a dû, à la main : rattacher la
buvette à l'événement (depuis deux écrans possibles), passer l'événement en
« Actif », puis la buvette en « Ouverte ». L'événement programmé à 14 h ne
s'est pas ouvert tout seul. Rien de tout cela n'était automatisé.

## Décision
1. **Un point de retrait (buvette) se crée seulement** dans Configuration →
   Points de retrait. Il **s'attache d'office** à tous les événements à venir
   du club ; un événement qui naît reçoit tous les points de retrait du club
   (hors ligne exclus). Un point de retrait appartient à un seul lieu / club.
2. Sur la fiche d'un événement, chaque point de retrait se **désactive** (ou se
   réactive) **à la main, événement par événement**. L'automatisme ne joue
   qu'à la naissance de l'un ou de l'autre : il ne défait jamais une
   désactivation.
3. **Ouverture automatique** (lieux BreakEat, hors service continu) : un
   événement en brouillon, avec au moins un point de retrait, passe en
   **Actif** à l'heure d'ouverture de la commande du lieu (`ordersOpenAt`,
   08:00 par défaut, le jour de l'événement ; dès son début s'il commence plus
   tôt). Ses points de retrait **fermés** s'ouvrent.
4. **Fermeture automatique** : à l'heure de fin, un événement actif ou en pause
   passe en **Terminé** ; ses points de retrait **ouverts** se ferment, sauf
   s'ils servent encore un autre événement en cours (ou un service continu).
5. Le comptoir garde son bouton « fermer » ; un point de retrait **en pause ou
   hors ligne** n'est jamais touché. Le club peut toujours changer un statut à
   la main.

6. Chaque point de retrait rattaché reçoit, s'il n'en a aucun sur
   l'événement, un **comptoir par défaut à son nom** (ajout du 16/11, accord de
   Rémi) : sans comptoir, une commande ne se paie pas.

## Pourquoi
- Un oubli de rattachement ou d'ouverture, c'est une buvette vide le soir du
  match — l'échec le plus visible de l'app.
- « Terminé » n'arrête que les **nouvelles** commandes (le panier exige
  « Actif ») : le poste opérateur liste tous les événements, les commandes
  payées restent à préparer. Aucune commande n'est perdue (règle n° 1).

## Ce qui n'est pas concerné
- Les lieux **Flaix** : Flaix décide (ADR-0001), et leur commande ouvre déjà à
  l'heure, sans statut à basculer.
  - Conséquence visible (27/11/2026) : un match Flaix reste « brouillon »
    toute sa vie.
  - La console montre donc son état réel, pas ce statut
    (`apps/admin/src/lib/statut-evenement.ts`, 1.7.74).
  - Seuls « suspendu », « annulé » et « terminé » ferment sa commande.
- Le contenant d'un lieu **ouvert en continu**, ouvert par définition.

## Conséquences
- Un brouillon s'ouvrira tout seul le jour J : pour empêcher un événement de
  s'ouvrir, l'annuler (ou retirer tous ses points de retrait).
- Chaque minute, une tâche planifiée lit les événements concernés. Les
  bascules sont conditionnelles (`updateMany` sur le statut attendu) : sans
  effet en double sur plusieurs serveurs.
