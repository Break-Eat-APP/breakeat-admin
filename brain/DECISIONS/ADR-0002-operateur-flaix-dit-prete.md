# ADR-0002 — Pour une commande Flaix, l'opérateur Flaix dit « prête », à la main

- **Date :** 11/11/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi
- **Liée à :** REPRISE (« Flaix Ops — 3 décisions », point 3 ; plan des API), cahier des charges Flaix section E1

## Contexte
« Qui dit prête ? » était la dernière décision en suspens depuis octobre. Le
comptoir BreakEat écrit `order.status` ; Flaix peut aussi annoncer « prête ».
La Live Activity refuse aujourd'hui que Flaix soit **en avance** sur le
comptoir BreakEat (`statutAffiche`) : un client ne doit pas se présenter
devant un comptoir qui ne l'attend pas.

## Décision
Sur un lieu Flaix, le comptoir travaille **dans Flaix**, et c'est
**l'opérateur Flaix qui valide « prête », à la main**. Pour une commande
venue de Flaix (avec un `flaixOrderId`), l'état envoyé par Flaix **fait foi
tel quel** et `ORDER_READY` doit faire sonner le téléphone dans les secondes.

## Pourquoi
Il n'y a pas de comptoir BreakEat sur un lieu Flaix : avec la garde actuelle,
« prête » ne sonnerait jamais.

## Ce que ça coûte
Deux règles coexistent : la garde `statutAffiche` reste pour les commandes
servies au comptoir BreakEat ; elle doit être **contournée** pour les
commandes Flaix. À implémenter avec E1 — ne pas l'oublier.

## Ce qui la remettrait en cause
Un lieu Flaix dont le comptoir travaillerait dans BreakEat.

## Où elle vit dans le code
`backend/src/modules/live-activity/live-activity.service.ts` (`statutAffiche`,
`annoncerCommandePrete`) — **à adapter à l'arrivée de E1**.
