# Frontière Break Eat ↔ Flaix Ops — ce qui disparaîtra, ce qui restera

**Date** : 6 octobre 2026.
**Question posée** : si une API Flaix Ops vient se connecter à l'application,
pourra-t-on supprimer des fonctionnalités devenues inutiles ou en doublon ?
**Complète** : `brain/FLAIX_CONTRACT.md`, qui reste la source de vérité.

---

## La réponse courte

**Oui — mais très peu de ce qui est construit est à jeter**, et ce n'est pas un
hasard : la frontière a été écrite avant le code (`FLAIX_CONTRACT.md`). La règle
tient en une phrase :

> **Flaix DÉCIDE. Break Eat ENREGISTRE et AFFICHE.**

Tant qu'on s'y tient, une API Flaix Ops ne rend presque rien inutile : elle
remplace des **sources de décision**, pas des fonctionnalités. Ce qui tombera,
c'est ce que Break Eat avait prévu de *décider lui-même* — et il y en a peu,
parce que ça n'a jamais été construit.

**Le vrai risque n'est pas le doublon de fonctionnalité. C'est le doublon de
DÉCIDEUR** : deux systèmes qui écrivent le même fait. Voir « Le point à trancher
avant d'écrire l'API », plus bas — c'est le seul endroit où le projet est
aujourd'hui ambigu.

---

## 1. Supprimable TOUT DE SUITE, sans attendre Flaix

Deux morceaux sont déjà morts. Ils ne gênent personne, mais ils font croire à
des fonctions qui n'existent pas.

| Quoi | Où | Pourquoi c'est mort |
|---|---|---|
| `requestSlotDecision`, `assessRush`, `requestRecommendations` | `backend/src/modules/flaix/flaix.service.ts` | Rendent `null` et **n'ont aucun appelant**. Elles décrivent un contrat dont l'API n'existe pas. |
| Le calcul des `visites` | `frequentation` | Calculé à chaque lecture, **affiché par aucun écran** depuis la refonte des KPI (phase 51). |

**Décision à prendre sur le stub** : le brancher ou le supprimer. Il ne faut pas
le laisser en l'état — un lecteur croit que Break Eat sait demander un créneau à
Flaix, ce qui est faux.

## 2. Ce que l'API Flaix Ops remplacera — et donc ce qui tombera

### a) La plomberie de décision : **pull ou push ?**

C'est le choix d'architecture le plus structurant, et il se prend avant la
première ligne d'API.

| | Break Eat demande (pull) | Flaix annonce (push) |
|---|---|---|
| Ce que ça suppose | une API Flaix interrogeable en ligne | un webhook signé vers Break Eat |
| Ce qui existe déjà | le **stub** (3 fonctions, zéro appelant) | **le webhook, en production** : HMAC, fenêtre anti-rejeu, idempotence, journal (`live-activity/flaix-webhook.service.ts`) |
| Si Flaix tombe | chaque commande attend une réponse → le parcours ralentit, ou s'arrête | rien ne change : Break Eat garde son dernier état connu |

**Recommandation : rester en PUSH**, et supprimer le stub. Le push est déjà
construit, éprouvé, signé — et surtout il ne met jamais le parcours de commande
en dépendance d'un service extérieur. Un client qui paie ne doit pas attendre
que Flaix réponde.

Si le pull est malgré tout nécessaire (une recommandation produit au moment du
panier, par exemple), il doit être **optionnel par construction** : `null` = pas
d'avis, et le parcours continue. C'est déjà écrit dans le contrat
(« Failure Behavior ») et rappelé dans l'en-tête du service.

### b) La fréquentation : **partiellement** remplaçable

Attention, ce sont deux mesures différentes qu'on confond facilement :

| Mesure | Qui peut la voir | Verdict |
|---|---|---|
| L'affluence de l'ÉVÉNEMENT (combien de monde au stade) | Flaix, par ses propres capteurs et ses rapports | ⬅️ **à Flaix.** Break Eat ne l'a jamais mesurée, et le lien vers le rapport Flaix existe déjà pour ça (phase 50) |
| Le TUNNEL de l'app (visiteurs anonymes, connectés, nouveaux, taux qui commande) | **Break Eat seul** — Flaix ne voit pas qui ouvre l'application | ✅ **reste.** C'est la mesure qui dit si l'app sert, pas si le stade est plein |

Donc : si Flaix Ops expose l'affluence, on ne supprime **rien** du tunnel. On
s'interdit seulement d'essayer de déduire l'affluence de l'événement depuis les
ouvertures d'app — ce serait un doublon faux, et c'est tentant.

### c) Les écrans opérateur : **seulement si** le comptoir change de logiciel

Le contrat V1 est explicite : les tableaux de bord opérateur appartiennent à
Break Eat, qui « rend les décisions de Flaix » à l'équipier.

Deux scénarios, et ils ne se valent pas :

- **le comptoir reste dans Break Eat** (contrat actuel) : rien à supprimer.
  Flaix envoie son rythme, l'écran l'affiche. C'est ce qui tourne aujourd'hui ;
- **le comptoir travaille DANS Flaix Ops** : alors `apps/operator`, la passerelle
  temps réel (`realtime`) et l'écran de signalement des produits manquants
  deviennent des doublons — et il faut les retirer, pas les laisser en parallèle.
  Deux écrans qui prétendent piloter le même service, c'est la panne garantie un
  soir de match.

**Ce scénario est une décision PRODUIT, pas un effet de bord technique.** Elle se
prend explicitement, et si elle est prise, le contrat V1 doit être réécrit —
pas contourné.

À noter si ce scénario est choisi : le **signalement des produits manquants**
(`orders/produits-manquants.service.ts`) ne disparaît pas pour autant. L'écran
disparaît ; l'**enregistrement** reste, parce que c'est lui qui prévient le
client et qui retire le produit de la carte. Il devient un événement de webhook
de plus.

---

## 3. Ce qui ne bougera JAMAIS — et pourquoi ce n'est pas négociable

Ce ne sont pas des fonctionnalités, ce sont des obligations. Les déplacer chez
un partenaire change de métier, ou casse la comptabilité.

| Domaine | Pourquoi ça reste |
|---|---|
| **L'argent** : Stripe Connect en destination charge, reçus, remboursements, périmètre de CA | C'est le contrat entre Break Eat et les clubs. Chacun paie sa nourriture à sa buvette, et Break Eat ne détient jamais l'argent d'un tiers |
| **Les empreintes de prix et de TVA** sur les lignes de commande | Une commande est figée à l'instant du paiement. Un prix qui changerait après coup rendrait toute la comptabilité fausse |
| **Les comptes, clubs, groupes, événements privés** | L'identité et les droits d'accès |
| **Le parcours client** : panier, suivi de commande, Live Activity, notifications, fidélité, ardoise | C'est l'application. Flaix n'a pas de client — elle a un comptoir |
| **Le journal d'audit des commandes** | Il doit rester complet même si Flaix se tait, précisément pour pouvoir arbitrer un litige |

---

## 4. Le point à trancher AVANT d'écrire l'API

**Qui écrit l'état d'une commande ?**

État actuel du code, vérifié :

- `order.status` n'est écrit que par **Break Eat**, via la machine d'état et le
  poste opérateur (`orders.service.ts` → `transition`) ;
- le webhook Flaix n'écrit **pas** le statut. Il écrit l'heure estimée, le
  créneau et le comptoir, et passe un statut d'**affichage** à la Live Activity
  (`live-activity.service.ts` → `applyOperationalUpdate`).

La frontière est donc respectée — mais elle laisse une divergence possible, et
elle se voit chez le client :

> Flaix annonce `ORDER_READY`. La Live Activity du client affiche **« prête »**.
> `order.status` est encore `PREPARING`, parce que l'équipier n'a pas appuyé.
> Le client se présente au comptoir, qui ne l'attend pas.

Il faut choisir **une** réponse, et une seule :

1. **Flaix est la vérité du service.** Son `ORDER_READY` fait réellement passer
   la commande en `READY` (par la machine d'état, avec `actorType: FLAIX`, déjà
   prévu). Le bouton du comptoir devient un repli pour les soirs où Flaix se
   tait.
2. **Le comptoir est la vérité.** Flaix ne fait que suggérer, et l'affichage
   client ne doit **jamais** annoncer « prête » avant le comptoir — il faut alors
   retirer cet affichage anticipé.

Aujourd'hui le code fait « 2 » pour l'état et « 1 » pour l'affichage. C'est la
seule incohérence réelle de la frontière, et c'est **elle** qui produira des
bugs quand l'API arrivera — pas les fonctionnalités en doublon.

---

## 5. Comment supprimer sans rien casser

1. **Ne rien supprimer en prévision.** Une fonctionnalité retirée avant que son
   remplaçant ne tourne, c'est un trou en production.
2. **Brancher l'API, et faire tourner les deux en parallèle** le temps d'un
   service réel. Le journal d'audit dit alors qui a écrit quoi.
3. **Supprimer ensuite**, en commençant par l'interface et jamais par les
   données : un écran se retire en un commit, une table qui porte de
   l'historique comptable ne se retire pas du tout.
4. **Une seule source par fait.** Si après branchement deux chemins écrivent le
   même champ, ce n'est pas « de la redondance de sécurité » : c'est un bug qui
   attend un soir de forte affluence.
5. **Garder le mode dégradé.** Le contrat l'exige : si Flaix se tait, les
   commandes continuent. Tout ce qui sert de repli (créneaux récurrents du lieu,
   bouton du comptoir) doit survivre à la suppression des doublons.

---

## 6. Ce qu'il faut demander à l'API Flaix Ops

Sans ces réponses, aucune suppression ne peut être décidée :

- **expose-t-elle l'affluence de l'événement** (et sous quelle forme) ? Sinon le
  lien vers le rapport Flaix reste le seul chemin ;
- **annonce-t-elle l'état d'une commande, et avec quelle autorité** — un fait ou
  une suggestion ? (voir le point 4) ;
- **décide-t-elle des créneaux de retrait**, ou lit-elle les nôtres ? Si elle
  décide, les modèles récurrents du lieu deviennent le **repli** ;
- **gère-t-elle un stock** ? Si oui, lequel fait foi pour ce que le client voit
  dans l'app — parce que le client ne peut pas commander ce que la carte ne
  montre pas ;
- **le comptoir travaille-t-il dans Flaix Ops ou dans Break Eat ?** C'est la
  question qui décide du sort de `apps/operator` ;
- **que se passe-t-il quand elle est indisponible** ? La réponse doit être « le
  parcours client continue », sinon l'intégration est à refaire.

---

## En un mot

Le dépôt a été construit avec cette frontière en tête, donc **il n'y a pas de
chantier de démolition à prévoir** : deux morceaux morts à retirer aujourd'hui,
une plomberie de décision à choisir (push, de préférence), et une ambiguïté à
trancher sur qui dit « prête ».

Ce qui coûterait cher, en revanche, c'est de laisser deux systèmes décider la
même chose « au cas où ». C'est le seul scénario où brancher Flaix Ops
dégraderait une application qui marche.
