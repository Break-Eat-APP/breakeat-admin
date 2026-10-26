# Le calendrier de la saison — spécification

**Posé le 26/10/2026.** Pas encore développé. Ce document fixe l'intention, les
décisions de forme et les deux questions qui conditionnent le chantier.

Référence visuelle : l'application de l'ASM Clermont Auvergne, dont le
propriétaire du projet a retenu trois choses — le logo de l'adversaire à la
place du numéro du jour, le choix entre calendrier et liste, et le décompte.

---

## Ce que ça doit servir

**Break Eat n'est pas une application de club.** On ne consulte pas un
calendrier pour le plaisir de le consulter : on l'ouvre pour savoir **quand
commander**, et pour commander.

Tout le reste découle de là. Un calendrier qui affiche joliment la saison sans
mener à une commande aurait raté sa cible. Le chemin visé :

> le supporter ouvre le lieu → il voit tout de suite le match d'aujourd'hui, ou
> le prochain → il entre dans l'écran de commande.

La saison entière est un **confort**, pas l'objet. Elle répond à « c'est quand,
le prochain ? » — une vraie question, mais secondaire.

---

## La forme

### Le logo remplace le numéro, uniquement quand il y a un événement

C'est ce qui rend la grille lisible d'un coup d'œil : l'œil trouve les matchs
sans lire une seule date. Les jours sans événement **gardent leur numéro** —
sans quoi la grille perd son repère de calendrier et devient une liste mal
rangée.

### L'opacité dit le TEMPS, pas l'importance

Les matchs passés s'effacent, le prochain reste à pleine force. Un supporter
ouvre l'app pour ce qui vient, pas pour ce qui est fini.

Trois états, et trois seulement :

| État | Rendu |
|---|---|
| **En cours** | pleine force, cerclé, et c'est le seul qui bouge |
| À venir | pleine force |
| Passé | estompé |

Résister à la tentation d'un quatrième. Une grille où tout est nuancé ne
hiérarchise plus rien.

### « En cours » est l'état qui compte

C'est le moment où l'on peut commander. Il doit être **impossible à manquer**,
et mener à la commande en un geste.

C'est aussi le seul endroit où une animation se justifie — un point qui
respire, rien de plus. Ailleurs, elle distrairait.

### Le décompte n'apparaît que lorsqu'il veut dire quelque chose

« 87 jours » n'est pas une information, c'est du bruit. En dessous d'une
semaine, le décompte devient utile ; le jour même, il cède la place à
l'information qui sert vraiment :

```
  J-6      →  « samedi 31 octobre »
  J-1      →  « demain, 14h30 »
  Jour J   →  « les buvettes ouvrent à 13h30 »
  En cours →  « commander »
```

Le dernier état n'est plus un décompte : c'est un bouton.

### Calendrier ou liste — le supporter choisit, et son choix se garde

Deux lectures de la même saison. La grille pour « c'est quand », la liste pour
« qu'est-ce qui vient ».

**Une seule source, une seule carte d'événement.** La liste n'est pas une
seconde implémentation : c'est le même composant, arrangé autrement. Deux
écritures finiraient par diverger, et l'une des deux mentirait.

Le choix se mémorise localement : quelqu'un qui préfère la liste ne doit pas la
rechoisir à chaque ouverture.

---

## Les deux questions à trancher avant d'écrire une ligne

### 1. D'où vient le logo de l'adversaire ?

**`Event.logoUrl` existe déjà — mais il ne veut pas dire ça.** Il sert de
*branding* : il habille l'écran de l'événement et **retombe sur le logo du
club** quand il est vide (`public-events.controller.ts:126`). Le détourner
ferait porter au club le blason de son rival sur son propre écran.

Il faut donc trancher :

- **a.** deux champs neufs sur `Event` — `opponentName`, `opponentLogoUrl` — et
  le club les remplit par match. Simple, explicite, mais c'est de la saisie en
  plus à chaque rencontre ;
- **b.** les données viennent de **Flaix**, qui connaît déjà le calendrier
  sportif. Rien à saisir, mais cela crée une dépendance pour un écran qui doit
  s'afficher même si Flaix ne répond pas ;
- **c.** pas de logo du tout : le nom de l'événement suffit. Moins beau, zéro
  coût, et on garde la possibilité d'ajouter les logos plus tard.

> Un calendrier sans logo reste utile. Un calendrier dont les logos manquent à
> moitié est pire que pas de logo.

**Recommandation :** commencer par **(c)**, livrer la grille et la liste avec
les noms, puis ajouter les logos quand la source est décidée. La forme se
valide sans eux ; eux ne se valident pas sans la forme.

### 2. Un lieu sait-il lister sa saison ? — **OUI, et c'est déjà le cas**

*Vérifié le 26/10/2026. Cette question se posait ; elle ne se pose plus.*

**Break Eat enregistre déjà chaque événement**, y compris pour un lieu Flaix.
`flaixOrderUrl` est un champ de **`Event`**, pas de `Venue` — c'est la règle
posée en phase 59 : *un lien de commande par match, et la date choisit lequel
s'ouvre*. Pour que le relais Flaix fonctionne aujourd'hui, le club crée donc
déjà chaque rencontre dans Break Eat et y colle son lien.

Il n'y a **rien à dupliquer**, et **aucune API Flaix à attendre**. Les données
du calendrier sont celles qui font déjà marcher le relais.

`public-venues.controller.ts` calcule déjà une fenêtre d'ouverture et expose
`prochainEvenement`. Ce qui manque est une **liste**, pas une source : étendre
la lecture à la saison, en la bornant — une saison, pas tout l'historique — et
en ne rendant que les événements **visibles**, la garde `canAccessEvent`
distinguant déjà public et privé. Un calendrier ne doit pas révéler qu'un
événement réservé existe.

### 3. Ce que le calendrier répare au passage

Aujourd'hui, un lieu Flaix dont la commande ouvre plus tard est **fermé** — et
l'écran le dit sans plus d'explication (`cheminDeCommande` rend `null`). Le
supporter voit « fermé » un jour de match, trois heures avant le coup d'envoi,
et n'a aucun moyen de savoir que ça ouvrira.

Le calendrier retourne cette situation : il montre le match, dit quand la
commande ouvre, et mène au bon endroit le moment venu. **Ce n'est pas qu'un
confort de navigation — c'est la réponse à un écran qui se tait.**

---

## Ce que ça ne doit pas devenir

- **Pas un fil d'actualité.** Les résultats, le classement, les compositions
  sont le métier du club, pas le nôtre. Chaque élément ajouté éloigne du
  bouton « commander ».
- **Pas un second écran d'accueil.** `venue-discovery` reste l'entrée ; le
  calendrier est une vue *du lieu*.
- **Pas une grille vide.** Un lieu sans événement à venir affiche ce qu'il en
  est, en une phrase — jamais une grille de numéros gris qui donne à croire que
  l'app est cassée.

---

## Lien avec l'existant

- `apps/mobile/src/screens/venue-discovery.screen.tsx` — l'entrée actuelle ;
- `apps/mobile/src/screens/event-home.screen.tsx` — où mène un événement ;
- `GET /api/v1/public/venues/:id` — la source ;
- `brain/PRODUCT_VISION.md` et la spec d'accueil tenue dans `REPRISE.md` —
  recherche, événements proches, favoris. **Ce calendrier en est la suite
  naturelle**, pas un écran parallèle.
