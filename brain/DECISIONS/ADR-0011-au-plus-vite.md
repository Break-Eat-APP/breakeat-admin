# ADR-0011 — « Au plus vite » est toujours proposé ; un créneau n'est jamais obligatoire

- **Date :** 16/11/2026 (complétée le 17/11/2026)
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi, instruite par Claude
- **Liée à :** CHANGELOG 1.7.36, 1.7.38 et 1.7.39 ; BUG-2026-020 et
  BUG-2026-021

## Contexte
Sur un lieu BreakEat, le choix du moment de retrait ne proposait que les
créneaux du club. Un événement **sans créneau**, ou dont les créneaux étaient
**passés**, bloquait le client à l'écran de choix : Rémi n'a vu que « Mi-temps »
en testant le concert du Dôme, et aucun moyen de commander tout de suite.
Le paiement, lui, acceptait déjà une commande sans créneau (« dès que
prête »).

## Options étudiées
1. Créer automatiquement un créneau « immédiat » par événement : une ligne de
   plus à gérer, des places à compter pour rien.
2. Sauter l'écran quand il n'y a aucun créneau : le client ne comprendrait pas
   pourquoi l'écran apparaît un jour et pas l'autre.
3. **Une option « Au plus vite » toujours en tête de l'écran, qui ne
   correspond à aucun créneau.**

## Décision
- L'écran des créneaux propose **toujours** « Au plus vite — Dès que ta
  commande est prête », en premier, puis les créneaux du club rangés par
  moment (« Mi-temps »…).
- « Au plus vite » = **aucun créneau** : la commande est préparée dès que
  possible. Elle vaut aussi pour « Partager l'addition ».
- Le choix est **toujours envoyé au serveur** au moment de payer ou de
  partager, `null` compris : un créneau choisi plus tôt sur le même panier
  est ainsi **effacé** et sa place rendue (BUG-2026-021).
- Un **créneau passé** n'est plus proposé au client (liste publique filtrée
  sur `endAt`), et le serveur le **refuse** s'il le reçoit quand même
  (BUG-2026-020). La console et le poste opérateur voient tous les créneaux.

## Pourquoi
Le client ne doit jamais être bloqué par une configuration du club. « Au plus
vite » est le cas le plus courant (je commande, je récupère quand c'est
prêt) ; un créneau est un service en plus, pas un passage obligé.

## Ce que ça coûte
Le comptoir reçoit des commandes sans heure : il les sert dans l'ordre. Un
club qui voudrait imposer des créneaux (forte affluence) ne le peut pas
aujourd'hui — il faudrait un réglage par événement.

## Ce qui la remettrait en cause
Un lieu qui demande à imposer des créneaux pour lisser l'affluence. Pour un
lieu **Flaix**, la question ne se pose pas : Flaix tient les créneaux et
BreakEat ne les affiche jamais (CLAUDE.md § 4).

## Où elle vit dans le code
- `apps/mobile/src/screens/slot-selector.screen.tsx` (l'option, en tête) ;
  `apps/mobile/src/store/cart.store.ts` (`AU_PLUS_VITE`, `setSlot(null, …)`) ;
  `apps/mobile/src/lib/sections-creneaux.ts` (rangement par moment).
- `apps/mobile/src/screens/checkout.screen.tsx` et `cart.screen.tsx` :
  `apiChoisirCreneau(cart.id, selectedSlotId)` **toujours** appelé.
- `backend/src/modules/cart/cart.service.ts` (`choisirCreneau`, `null` efface
  et rend la place) ; `backend/src/common/helpers/retrait-compatible.ts`
  (`assertCreneauCompatible` : ouvert, non passé, même événement, même
  buvette) ; `backend/src/modules/events/public-events.controller.ts` (liste
  du client filtrée).
