# Le banc de charge

« Est-ce que l'application tient 2 000 commandes simultanées ? » ne se répond
pas en lisant du code. On le mesure, ou on se tait.

## Les deux gardes, et pourquoi ils refusent

Le tireur envoie des milliers de requêtes ; le semeur **écrit** dans une base.
Les deux peuvent faire du dégât, et leurs refus ne sont pas décoratifs.

**Le tireur autorise, il n'interdit plus.** Il bloquait les noms *connus* de la
production (`railway.app`, `breakeat-admin-production`). Une liste d'interdits
doit prévoir tous les noms futurs : le jour où le club pose son propre domaine,
`api.break-eat.fr` ne ressemble à rien d'interdit et le banc tire sur les
clients, un soir de match. Désormais seuls `localhost`, `127.0.0.1`, `::1` et
les domaines réservés `*.localhost` / `*.test` passent sans rien demander.

Pour une recette hébergée, il faut la **nommer** soi-même :

```bash
BANC_CIBLE_AUTORISEE=recette.example.test node scripts/banc-de-charge/tirer.js --scenario proche
```

Le refus ne recopie pas l'hôte qu'il vient de rejeter : souffler la ligne à
copier-coller à quelqu'un de pressé, c'est lui donner de quoi tirer sur la
production.

**Le semeur regarde ce que la base CONTIENT**, pas comment elle s'appelle. Il
n'en avait aucun garde : une `DATABASE_URL` restée en place dans un terminal, et
le semis versait quatre-vingts faux clubs et des milliers de faux matchs chez de
vrais clients. Nommer l'hôte ne suffit pas — un tunnel, un transfert de port,
une copie de production restaurée en local, et l'adresse dit `localhost`. Il
refuse donc toute base portant une **commande** ou un **paiement** : le semeur
n'en crée aucun, donc leur présence signifie de vrais clients.

## Monter le banc

Une base jetable, les vraies migrations, un jeu de données réaliste :

```bash
docker run -d --name breakeat-charge -e POSTGRES_PASSWORD=charge -e POSTGRES_DB=charge -p 0:5432 postgres:18-alpine
```

```bash
docker port breakeat-charge 5432/tcp
```

Puis, avec le port obtenu (`DATABASE_URL` pointant dessus) :

```bash
npx prisma migrate deploy
```

```bash
node scripts/banc-de-charge/semer.js --lieux 50 --saisons 3 --matchs 13
```

**Trois saisons, pas une.** Un club de troisième année porte des centaines
d'événements, et `/public/venues` les charge TOUS à chaque requête. Semer trois
matchs par lieu donnerait un banc flatteur et faux.

## Tirer

L'API doit tourner contre cette base (jamais la production — le script refuse
une adresse Railway) :

```bash
node scripts/banc-de-charge/tirer.js --scenario proche --clients 100 --duree 20
```

| Scénario | Ce qu'il reproduit |
|---|---|
| `proche` | un supporter DANS le stade, rayon 10 km — **le chemin par défaut de l'app** |
| `stade` | une recherche large qui ramène tous les lieux |
| `tournee` | 50 lieux, chacun cherche le sien |
| `calendrier` | géolocalisation à large rayon |

## Mesures du 30/10/2026

Sur une machine de développement Windows, le tireur et l'API se partageant le
même processeur — donc **pessimiste** par rapport à un conteneur Linux. Ce qui
compte ici n'est pas le chiffre absolu, c'est l'ÉCART entre les scénarios.

| Scénario | Lieux rendus | Débit | p50 | p95 |
|---|---|---|---|---|
| `tournee` (1 lieu) | 1 | **191 req/s** | 975 ms | 1,5 s |
| `proche` (réel) | 5 | **33 req/s** | 2,8 s à 100 clients | 3,5 s |
| `calendrier` | 50 | **26 req/s** | 6,2 s | 9,6 s |
| `stade` | 50 | **24 req/s** | 7,3 s | 9,4 s |

**Huit fois moins vite dès que la réponse porte 50 lieux.** Le coût ne vient
pas du nombre de requêtes : il vient de ce que CHAQUE requête charge tous les
événements jamais créés de chaque lieu retourné.

Le débit plafonne à ~33 req/s quelle que soit la concurrence (25, 50, 100
clients donnent le même débit) : au-delà, la latence croît linéairement, puis
les connexions sautent (21 % d'`ECONNRESET` à 500 clients).

**Et ça empire tout seul.** Le coût grandit avec l'HISTORIQUE : une quatrième
saison ajoute 33 % de lignes lues sur chaque requête, pour des matchs que
personne ne regarde.

## Ce que la première campagne a corrigé

`/public/venues` chargeait **tous les événements jamais créés** de chaque lieu
rendu, à chaque requête, et la route est en `no-store` — donc incachable. La
lecture est maintenant bornée à une saison écoulée et celle qui vient (le
contenant d'un lieu permanent échappe à la borne : sa date ne veut rien dire).

La règle de confidentialité n'a pas bougé d'un mot — un lieu qui a des
événements mais aucun d'accessible reste masqué — mais elle est désormais
**comptée par la base** : deux agrégats qui rendent cinquante nombres, au lieu
de deux mille lignes rapatriées pour être comptées en mémoire.

| Scénario | Avant | Après |
|---|---|---|
| `stade` (50 lieux) | 24 req/s, p50 7,3 s | **43 req/s, p50 4,4 s** |
| `calendrier` (50 lieux) | 26 req/s, p50 6,2 s | **46 req/s, p50 4,0 s** |
| `proche` (5 lieux, réel) | 33 req/s, p50 2,8 s | **41 req/s, p50 2,2 s** |

Environ **+80 % de débit** sur les chemins lourds, latence presque divisée par
deux. Et surtout : **le coût ne grandit plus avec l'historique.** Avant, une
quatrième saison ajoutait un tiers de lignes lues sur chaque requête, pour des
matchs que personne ne regarde.

## Ce que ces chiffres ne disent pas

- **Ils sont pessimistes.** Le tireur et l'API se partagent le processeur d'une
  machine de développement Windows. Un conteneur Linux fera mieux ; l'écart
  entre scénarios, lui, est fiable.
- **Ils ne mesurent pas la COMMANDE.** Sur un lieu Flaix, Break Eat ne traite
  aucun paiement : il sert la découverte et le lien. Le parcours de commande
  Break Eat (panier, Stripe, stock) reste à mesurer séparément.
- **Ils ne mesurent pas le temps réel.** Dix mille sockets ouvertes sur un
  soir de match sont un autre sujet que dix mille requêtes HTTP.
- **Un seul processus.** Le débit se multiplie par le nombre d'instances ;
  la base, elle, ne se multiplie pas.

## Campagne du 30/10 — inscriptions et passage vers Flaix

Les deux chemins que l'écran d'accueil ne mesure pas. Même machine, mêmes
réserves : le tireur et l'API se partagent le processeur, une seule instance,
sans Redis.

| Scénario | Débit | p50 | p95 | Servies |
|---|---|---|---|---|
| `flaix` (50 clients) | **427 req/s** | 93 ms | 148 ms | 100 % |
| `flaix` (200 clients) | **299 req/s** | 358 ms | 561 ms | 100 % |
| `inscription` (10 clients) | **14,4 req/s** | 671 ms | 880 ms | 100 % |
| `inscription` (50 clients) | **14,6 req/s** | 3,3 s | 3,6 s | 100 % |

**Le passage vers Flaix est dix fois moins cher que l'écran d'accueil.** Il ne
lit qu'un lieu et un match ; tout le reste — panier, paiement, créneaux — se
passe chez Flaix. C'est donc ce chiffre qui dit combien de commandes Break Eat
peut relayer, et non le débit de la découverte.

**L'inscription plafonne à 14,5 par seconde, et la concurrence n'y change
rien** — dix clients ou cinquante donnent le même débit, seule la latence
monte. Ce n'est pas une file d'attente : c'est `argon2`, le hachage du mot de
passe. Il est coûteux **par conception** (c'est ce qui protège les comptes), et
il s'exécute sur le fil unique de Node.

### Ce que ça donne pour « 50 lieux, 20 000 utilisateurs, 20 000 commandes »

Par instance, en prenant les chiffres ci-dessus :

| | Charge | Verdict |
|---|---|---|
| 20 000 relais Flaix, étalés sur 10 min | 33 req/s | **8 % d'une instance** |
| 20 000 inscriptions, étalées sur la soirée | 1,4 req/s | sans effort |
| 20 000 inscriptions, concentrées sur 30 min | 11 req/s | **76 % d'une instance** |
| 20 000 inscriptions, concentrées sur 10 min | 33 req/s | **3 instances** |
| Découverte, 20 000 × 3 appels sur 30 min | 33 req/s | **2 instances** |

**La commande n'est pas le problème ; l'inscription l'est.** Et c'est une
bonne nouvelle : elle n'arrive qu'une fois par client, elle s'étale
naturellement, et elle se règle en ajoutant des instances — le hachage est du
calcul pur, il n'attend aucune ressource partagée.

### Ce que ces chiffres ne disent toujours pas

- **Le parcours de commande Break Eat** (panier, Stripe, stock) n'est pas tiré.
  Sur un lieu Flaix il n'existe pas ; sur les autres, il reste à mesurer.
- **Le temps réel.** Dix mille sockets ouvertes un soir de match sont un autre
  sujet que dix mille requêtes HTTP.
- **Une seule instance, sans Redis.** Le débit se multiplie par le nombre
  d'instances ; la base, elle, ne se multiplie pas.
