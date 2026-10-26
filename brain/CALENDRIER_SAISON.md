# Le calendrier de la saison — spécification

**Posé le 26/10/2026, révisé le même jour.** Pas encore développé. Ce document
fixe l'intention, les décisions de forme, le vocabulaire à tenir, et la seule
question qui reste ouverte.

Référence visuelle de départ : l'application de l'ASM Clermont Auvergne, dont
trois idées avaient été retenues — le logo de l'adversaire à la place du numéro
du jour, le choix entre calendrier et liste, et le décompte.

**Une seule a survécu telle quelle.** Le logo reste ; le choix entre deux vues
est abandonné, les deux convergeant vers le même objet ; le décompte est gardé
mais borné. Et ce calendrier ne montre **que les matchs à domicile** — ce qui le
sépare pour de bon d'un calendrier de club.

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

## Ce que le calendrier montre, et ce qu'il ne montre pas

### Les matchs à domicile, et eux seuls

**Aucun déplacement n'apparaît.** Ce n'est pas un oubli, c'est la règle.

Break Eat ne tient pas la buvette du stade adverse. Afficher un match à
l'extérieur créerait une attente impossible à tenir : le supporter verrait la
rencontre, chercherait à commander, et ne trouverait rien. Un calendrier qui
annonce des matchs sans commande possible redevient un calendrier de club — et
ce métier-là n'est pas le nôtre.

La source y pousse d'elle-même : les événements sont ceux **du lieu**. Les
déplacements n'y sont simplement pas. Il n'y a donc rien à filtrer — seulement
une tentation à ne pas avoir.

### Une seule vue, pas deux

La référence offrait le choix entre une grille mensuelle et une liste. **Les
deux sont abandonnées au profit d'une seule vue.**

La grille d'un mois affiche trente et une cases pour cinq matchs : vingt-six
cases vides pour porter cinq informations. Et une case fait soixante pixels de
large — le nom de l'adversaire n'y tient pas. Pour qu'il tienne, il faut
l'élargir ; élargie, la case devient une ligne ; et une suite de lignes est une
liste.

**Les deux idées menaient au même objet.** D'où la forme retenue : une liste
verticale, groupée par mois, où **le logo de l'adversaire tient la place de la
date**. C'est bien le « logo au lieu du numéro » voulu au départ, avec la place
d'écrire ce qui compte.

Rien à choisir, rien à mémoriser, un seul composant à tenir. Deux écritures de
la même saison finiraient par diverger, et l'une des deux mentirait.

### L'opacité dit le TEMPS, pas l'importance

Les matchs passés s'effacent, le prochain reste à pleine force. Un supporter
ouvre l'app pour ce qui vient, pas pour ce qui est fini.

Trois états, et trois seulement :

| État | Rendu |
|---|---|
| **En cours** | pleine force, cerclé d'orange, et c'est le seul qui bouge |
| À venir | pleine force |
| Passé | estompé |

Résister à la tentation d'un quatrième. Une liste où tout est nuancé ne
hiérarchise plus rien.

« En cours » est le moment où l'on peut commander : il doit être **impossible à
manquer**, et mener à la commande en un geste. C'est aussi le seul endroit où
une animation se justifie — un point qui respire, rien de plus. Ailleurs, elle
distrairait.

### Le bandeau porte l'état de la commande

En haut, et fixe : le lieu, puis **une seule ligne qui dit où on en est**. C'est
ce que le supporter lit en premier et, le plus souvent, la seule chose qu'il
lira.

| Quand | Ce que porte le bandeau |
|---|---|
| la commande est ouverte | **« Commander »** — un bouton plein, orange |
| le jour même, avant l'heure | « La commande ouvre à 8 h » |
| à moins d'une semaine | « samedi 31 octobre, 14 h 30 » |
| plus loin | le prochain match, sans décompte |
| aucun match à venir | une phrase, et rien d'autre |

**Ce qui n'y figure pas : le nombre de buvettes.** Il change d'un match à
l'autre, et il ne répond à aucune question que le supporter se pose. Il
occuperait la ligne la plus lue de l'écran pour ne rien dire.

### Le décompte n'apparaît que lorsqu'il veut dire quelque chose

« 87 jours » n'est pas une information, c'est du bruit. En dessous d'une
semaine, le décompte devient utile ; le jour même, il cède la place à
l'information qui sert vraiment :

```
  J-6      →  « samedi 31 octobre »
  J-1      →  « demain, 14 h 30 »
  Jour J   →  « la commande ouvre à 8 h »
  Ouvert   →  « commander »
```

Le dernier état n'est plus un décompte : c'est un bouton.

---

## Ce qui ouvre : la COMMANDE, pas les buvettes

C'est la décision la plus importante de cet écran. Une phrase imprécise ici
fait déplacer quelqu'un pour rien.

Il y a **trois moments distincts**, et Break Eat n'en possède qu'un :

| Le moment | Qui le décide | Où il se règle |
|---|---|---|
| le lien du match existe | le club, trois à six jours avant | `Event.flaixOrderUrl` |
| **la commande ouvre** | **Break Eat** | `Venue.ordersOpenAt` |
| les créneaux de retrait ouvrent | **Flaix** | chez Flaix |

`common/helpers/fenetre-commande.ts` le posait déjà noir sur blanc :
« l'ouverture des CRÉNEAUX de retrait se règle, elle, dans Flaix — ici on ne
décide que de l'accès au lien ». Il n'y a donc rien à reprendre côté réglages,
seulement un vocabulaire à tenir.

**Rien de plus à saisir par match.** `ordersOpenAt` vaut « 08:00 » par défaut et
se règle **une fois par lieu**, avec `Venue.timezone` — parce que « 8 h » ne veut
rien dire sans fuseau. C'est voulu ainsi : l'heure ne bouge pas quand l'horaire
du coup d'envoi change. Un match qui commencerait avant cette heure ouvre dès
son début, jamais après (garde-fou déjà en place, `schema.prisma:406`).

**Le mot juste est « la commande ».** « Les buvettes ouvrent à 13 h 30 » est
faux : le client commande la veille et retire à la mi-temps. Les deux moments
n'ont rien à voir — et la buvette qui sert physiquement n'est même pas modélisée
dans Break Eat.

**Et Break Eat n'annonce jamais l'heure de retrait.** Elle vit dans Flaix, elle
peut y changer sans que Break Eat l'apprenne, et la répéter ici serait promettre
à la place de quelqu'un d'autre.

Vocabulaire arrêté, à tenir dans tout l'écran :

| On écrit | On n'écrit pas |
|---|---|
| « La commande ouvre à 8 h » | « Les buvettes ouvrent à 8 h » |
| « Commande ouverte » | « Buvettes ouvertes » |
| « Commander » | « Précommander », « Réserver » |

---

## Les décisions arrêtées

### 1. Le logo de l'adversaire — **saisi par événement**

*Tranché le 26/10/2026 par le propriétaire du projet : il téléverse le logo du
club adverse à la création de chaque match, avec le lien de commande qui va
avec.*

**Deux champs neufs sur `Event`** — `opponentName`, `opponentLogoUrl`. Le club
les remplit au même moment qu'il colle `flaixOrderUrl` : une rencontre se saisit
d'un seul geste, lien et blason ensemble.

**Pourquoi des champs neufs et pas `Event.logoUrl`.** Ce champ existe déjà, mais
il ne veut pas dire ça : il sert de *branding* — il habille l'écran de
l'événement et **retombe sur le logo du club** quand il est vide
(`public-events.controller.ts:126`). Le détourner ferait porter au club le
blason de son rival sur son propre écran. Deux sens dans un même champ, et l'un
des deux finirait par mentir.

**Pourquoi pas Flaix.** Flaix connaît le calendrier sportif, mais cet écran doit
s'afficher même quand Flaix ne répond pas. Une dépendance réseau pour un blason
est un mauvais marché.

**Le garde-fou à tenir :**

> Un calendrier sans logo reste utile. Un calendrier dont les logos manquent à
> moitié est pire que pas de logo.

Donc : `opponentLogoUrl` est **facultatif**, et son absence a un rendu décidé —
un disque sourd portant les initiales de l'adversaire, jamais un trou, jamais
une icône d'image cassée. Et l'écran se livre d'abord **avec les noms seuls** :
la forme se valide sans les logos, les logos ne se valident pas sans la forme.

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
- **Pas un écran vide.** Un lieu sans match à venir dit ce qu'il en est, en une
  phrase — jamais une liste vide ni un gabarit gris, qui donnent à croire que
  l'app est cassée.
- **Pas un calendrier de déplacements.** La tentation reviendra, parce qu'un
  supporter suit son club partout. Mais Break Eat ne tient que les buvettes du
  lieu, et un match affiché sans commande possible est une promesse en l'air.

---

## Lien avec l'existant

- `apps/mobile/src/screens/venue-discovery.screen.tsx` — l'entrée actuelle ;
- `apps/mobile/src/screens/event-home.screen.tsx` — où mène un événement ;
- `GET /api/v1/public/venues/:id` — la source ;
- `backend/src/common/helpers/fenetre-commande.ts` — **qui calcule l'état**
  (`ouvert` / `bientot` / `aucun`) à partir de `Venue.ordersOpenAt` et
  `Venue.timezone`. Le bandeau n'a rien à recalculer : il affiche ce que ce
  fichier répond ;
- `brain/PRODUCT_VISION.md` et la spec d'accueil tenue dans `REPRISE.md` —
  recherche, événements proches, favoris. **Ce calendrier en est la suite
  naturelle**, pas un écran parallèle.
