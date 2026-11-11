# Cahier des charges Flaix ↔ BreakEat — le calendrier des matchs, et la passerelle d'accès

**À transmettre au développeur Flaix.** Rédigé le 10/11/2026, à partir de la
discussion du 09/11 (options A, B, C), complété le même jour par la
**passerelle d'accès** (D) et par **ce que BreakEat ouvre à Flaix** (E). Rien
n'est encore développé : ni côté Flaix, ni
côté BreakEat. Ce document fixe le format, pour que les deux côtés puissent
avancer chacun de leur côté.

**Trois besoins distincts :**

1. **Le calendrier** (A, B, C) — que BreakEat lise les matchs saisis dans
   Flaix, pour ne plus les saisir deux fois.
2. **La passerelle d'accès** (D) — qu'un responsable de lieu ouvre ses
   rapports et son espace Flaix **depuis le tableau de bord BreakEat, sans se
   reconnecter à Flaix**.
3. **Tout piloter depuis Flaix** (E) — que le responsable de lieu n'ait plus
   à se connecter à BreakEat : les commandes Flaix remontent dans l'app, et
   les chiffres et les campagnes de l'app sont visibles et pilotables depuis
   le tableau de bord Flaix.

---

## 1. Le besoin, en une phrase

Aujourd'hui, chaque match est saisi **deux fois** : une fois dans Flaix (avec
ses horaires et ses créneaux), une fois dans l'admin BreakEat (avec son lien de
commande Flaix). On veut que **Flaix soit la seule saisie** et que BreakEat
**lise** le calendrier de chaque lieu tout seul.

## 2. Les trois façons de le faire

| | Ce que c'est | Pour qui |
|---|---|---|
| **A — le lien principal** | La page web du calendrier Flaix d'un lieu, ouverte telle quelle dans l'app | Toute app, même sans développeur : il suffit d'ouvrir une adresse |
| **B — le flux de données** | La même liste de matchs, **sans mise en page**, en JSON | Les apps qui s'intègrent vraiment (BreakEat) |
| **C — le fichier iCal** | La même liste au format `.ics` | Les agendas (Google, Apple, Outlook) et les apps pressées |

Les trois se construisent à partir des **mêmes informations**, que la page
Flaix affiche déjà. B et C, c'est la page sans le design.

### Ce que chaque option fait perdre à BreakEat

| Fonction dans BreakEat | Aujourd'hui (saisie manuelle) | A — page web | B — flux | C — iCal |
|---|---|---|---|---|
| Double saisie | oui, tout | aucune | aucune | aucune |
| Calendrier de la saison dans le design BreakEat | oui | **non** (remplacé par la page Flaix) | oui | oui |
| « À ne pas manquer » rempli tout seul | oui | **non** (saisie manuelle des affiches) | oui | oui |
| « La commande ouvre à 08:00 » sur l'accueil | oui | **non** (seulement dans la page Flaix) | oui | seulement si l'heure d'ouverture est ajoutée |
| Prochain match, rappels, notifications | oui | **non** | oui | oui |
| Logo de l'adversaire, affiche | oui | **non** | oui | **non** (iCal ne porte pas d'image) |
| Lien de commande de chaque match | oui | oui (dans la page) | oui | oui |
| Risque à la vérification Apple | aucun | faible à moyen si tout passe en page web | aucun | aucun |
| Travail côté BreakEat | — | quelques heures | 1 à 2 jours | 1 jour |

**En résumé** : A supprime la double saisie mais fait perdre tout ce que l'app
fait avec les matchs. **B ne fait rien perdre.** C est presque aussi bien que
B, sans images ni heure d'ouverture fiable.

### Pour une autre app que BreakEat

| L'app externe… | A | B | C |
|---|---|---|---|
| ne sait qu'ouvrir une adresse (pas de développeur) | **la seule possible** | non | un bouton « Ajouter à mon agenda » |
| a un développeur, peu de temps | oui | quelques jours | oui (format standard) |
| veut une vraie intégration | en complément | **la meilleure** | limitée |

D'où la recommandation : **Flaix propose les trois**, chaque app prend ce
qu'elle sait utiliser.

---

## 3. Ce qui est demandé à Flaix

Ordre de priorité pour le calendrier : **B d'abord**, A est déjà là (à
vérifier), C ensuite. La **passerelle d'accès (D)** est indépendante : elle
peut avancer en parallèle, D1 avant D2.

### A — le lien principal (existe déjà) : trois vérifications

1. **Une adresse par lieu**, stable dans le temps (elle sera enregistrée une
   fois pour toutes dans l'admin BreakEat).
2. La page s'affiche correctement **sur mobile, à l'intérieur d'une autre
   app** (« webview ») :
   - pas d'en-tête qui interdit l'intégration (`X-Frame-Options`,
     `Content-Security-Policy: frame-ancestors`) ;
   - la page **et le paiement** restent si possible sur `flaixlabs.com` ou
     `synertic.net`. Un autre domaine fonctionne (en HTTPS), mais l'app affiche
     alors au client un bandeau « Paiement sur <domaine> ». **Nous dire quel
     prestataire de paiement est utilisé**, et sur quel domaine.
3. Chaque match mène à **sa** page de commande.

### B — le flux de données (le plus important)

**Une adresse par lieu**, en lecture publique, qui renvoie en JSON la liste
des matchs **à venir et des 7 derniers jours**.

Exemple d'adresse (le chemin exact est libre) :

```
GET https://<domaine-flaix>/api/lieux/<identifiant-du-lieu>/evenements
```

Exemple de réponse :

```json
{
  "lieu": { "id": "velodrome", "nom": "Orange Vélodrome" },
  "genereLe": "2026-11-10T09:00:00Z",
  "evenements": [
    {
      "id": "m-123",
      "nom": "Marseille vs Lens",
      "debut": "2026-11-22T21:00:00+01:00",
      "fin": "2026-11-22T23:00:00+01:00",
      "adversaire": "RC Lens",
      "logoAdversaire": "https://<domaine-flaix>/logos/lens.png",
      "affiche": null,
      "ouvertureCommande": "2026-11-22T08:00:00+01:00",
      "lienCommande": "https://<domaine-flaix>/commande/m-123",
      "statut": "actif",
      "modifieLe": "2026-11-09T18:00:00Z"
    }
  ]
}
```

#### Les champs

| Champ | Obligatoire | Exemple | Pourquoi |
|---|---|---|---|
| `id` | **oui** | `m-123` | Identifiant **stable** : BreakEat reconnaît un match modifié au lieu de le créer en double. **Ne jamais le réutiliser** pour un autre match. |
| `nom` | **oui** | `Marseille vs Lens` | Le titre affiché. |
| `debut`, `fin` | **oui** | `2026-11-22T21:00:00+01:00` | Format ISO 8601 **avec le fuseau horaire** (`+01:00` ou `Z`). Sans fuseau, on risque un décalage d'une heure au changement d'heure. |
| `adversaire` | non | `RC Lens` | Affichage du match. |
| `logoAdversaire` | non | `https://…/lens.png` | Image en HTTPS, carrée de préférence. |
| `affiche` | non | `https://…/affiche.jpg` | Pour les concerts et événements sans adversaire. |
| `ouvertureCommande` | **oui** | `2026-11-22T08:00:00+01:00` | L'heure à laquelle **la commande ouvre**. BreakEat affiche « La commande ouvre à 08:00 » en attendant. `null` = ouverte dès maintenant. |
| `lienCommande` | **oui** | `https://…/commande/m-123` | Le bouton « Commander ». Peut accepter des paramètres (identité du client), comme les liens actuels. |
| `statut` | **oui** | `actif` ou `annule` | Un match annulé doit disparaître partout. **Ne pas le retirer de la liste** : le passer en `annule`, sinon BreakEat ne peut pas faire la différence entre « annulé » et « oublié ». |
| `modifieLe` | **oui** | `2026-11-09T18:00:00Z` | Date de la dernière modification du match. |

#### Les règles

- Matchs **triés par date de début**.
- Adresse **sans mot de passe**, en **lecture seule**. Elle ne doit contenir
  **aucune donnée client** (ni nom, ni commande) : seulement le calendrier
  public.
- BreakEat l'interrogera **toutes les 5 à 10 minutes** par lieu, pour une
  cinquantaine de lieux : une réponse **rapide** (moins d'une seconde), mise en
  cache côté Flaix si besoin. Un en-tête `ETag` ou `Last-Modified` est un plus.
- Réponse `200` avec une liste vide s'il n'y a aucun match ; `404` seulement si
  le lieu n'existe pas.
- Encodage UTF-8 (accents des noms de clubs).

### C — le fichier iCal (facultatif, après B)

La même liste au format `.ics`, une adresse par lieu :

```
GET https://<domaine-flaix>/api/lieux/<identifiant-du-lieu>/evenements.ics
```

Correspondance : `UID` = `id`, `SUMMARY` = `nom`, `DTSTART` / `DTEND` =
`debut` / `fin`, `URL` = `lienCommande`, `STATUS:CANCELLED` pour un match
annulé, `LAST-MODIFIED` = `modifieLe`. L'heure d'ouverture de la commande
peut aller dans un champ `X-FLAIX-OUVERTURE-COMMANDE`. Généralement une
demi-journée de travail une fois B fait.

### D — la passerelle d'accès au tableau de bord Flaix

**Le besoin.** Aujourd'hui, le tableau de bord BreakEat d'un lieu propose un
simple lien vers `ops.flaixlabs.com/login` : le responsable doit taper ses
identifiants Flaix à chaque fois, et le lien de rapport de chaque match est
collé à la main après le match. On veut un bouton **« Ouvrir Flaix »** (et
**« Voir le rapport »** sur chaque match) qui l'emmène **directement dans son
espace Flaix, déjà connecté**, sur le bon lieu.

**Ce que BreakEat ne fera jamais** : stocker un mot de passe Flaix, ou
connecter quelqu'un à Flaix sans que Flaix l'accepte. C'est Flaix qui décide
qui entre ; BreakEat ne fait que **demander** l'accès pour un responsable
qu'il a lui-même vérifié.

Deux niveaux, **D1 d'abord** (le plus simple), D2 ensuite si on veut aller
plus loin.

#### D1 — le lien d'accès signé (recommandé pour commencer)

Le serveur BreakEat demande à Flaix un **lien à usage unique**, valable
quelques secondes, pour un lieu donné. Le navigateur du responsable l'ouvre ;
Flaix ouvre la session et redirige vers la page demandée.

```
1. Le responsable clique « Ouvrir Flaix » dans le tableau de bord BreakEat.
2. Le SERVEUR BreakEat vérifie qu'il est responsable (ou manager) de CE lieu.
3. Le serveur BreakEat appelle Flaix (serveur à serveur) :

   POST https://<domaine-flaix>/api/acces/lien
   Authorization: Bearer <clé BreakEat, propre à BreakEat>
   {
     "lieu": "velodrome",              // l'identifiant du lieu côté Flaix
     "destination": "rapport",         // "accueil" | "rapport" | "commandes"
     "evenement": "m-123",             // facultatif : le match visé
     "demandePar": "responsable@club.fr"  // pour le journal de Flaix
   }

4. Flaix répond :
   { "url": "https://ops.flaixlabs.com/acces/9f3c…", "expireLe": "2026-11-22T21:05:30Z" }

5. Le navigateur du responsable ouvre cette adresse (nouvel onglet).
   Flaix vérifie le jeton, ouvre la session, et redirige vers la page demandée.
```

**Ce qui est demandé à Flaix :**

| Élément | Exigence |
|---|---|
| La route `POST /api/acces/lien` | Appelée **uniquement de serveur à serveur**, avec une clé API réservée à BreakEat |
| Le jeton dans l'adresse | **Usage unique**, **expire en 60 secondes au plus**, imprévisible (au moins 128 bits aléatoires) |
| La portée | Le jeton n'ouvre que **le lieu demandé** — jamais un autre lieu, même du même club |
| Les droits | Ceux que Flaix juge bons pour un responsable de lieu (lecture des rapports au minimum) |
| La clé API | **Révocable** et **remplaçable** sans coupure (deux clés valides pendant le changement) |
| Le journal | Flaix garde une trace de chaque accès : lieu, `demandePar`, date, adresse IP |
| Erreurs | `401` clé invalide · `403` lieu non autorisé pour BreakEat · `404` lieu inconnu · réponse en JSON avec un message lisible |

**À ne pas faire :** afficher la page Flaix **dans un cadre** du tableau de
bord BreakEat. Safari et les navigateurs récents bloquent les cookies d'un
site affiché dans le cadre d'un autre : la session ne tiendrait pas. Le lien
s'ouvre dans un **nouvel onglet**.

**Estimation côté Flaix :** de l'ordre de **1 à 2 jours** (une route, une
table de jetons, une page d'entrée qui ouvre la session).

#### D2 — les données Flaix affichées dans BreakEat (plus tard)

Au lieu d'emmener le responsable chez Flaix, BreakEat **affiche lui-même**
les chiffres dans son tableau de bord. Même clé API, routes en lecture :

```
GET https://<domaine-flaix>/api/lieux/<lieu>/ventes?du=2026-11-01&au=2026-11-30
GET https://<domaine-flaix>/api/lieux/<lieu>/evenements/<id>/rapport
```

Champs utiles par match : chiffre d'affaires TTC, nombre de commandes, panier
moyen, ventes par buvette, produits les plus vendus, ruptures. Montants en
**centimes** (entiers), dates **avec fuseau**.

C'est la vraie intégration — le responsable ne quitte plus BreakEat — mais
plus de travail des deux côtés. Elle prépare aussi la **remontée des
commandes Flaix** dans l'app (« Mes commandes », le suivi sur l'écran
verrouillé, la note de la commande), qui attend un flux de ce type.

#### La sécurité, en résumé

- La clé API ne transite **jamais** par le navigateur ni par l'app : seuls les
  deux serveurs la connaissent.
- La clé s'échange par un **canal sûr** (gestionnaire de mots de passe
  partagé, ou message chiffré) — **jamais par e-mail en clair**.
- BreakEat vérifie le droit du responsable sur le lieu ; Flaix vérifie que le
  lieu est bien autorisé pour BreakEat. **Deux contrôles, pas un.**
- Un jeton intercepté ne sert à rien : il a déjà servi, ou il a expiré.

---

### E — Tout piloter depuis Flaix : ce que chaque côté ouvre à l'autre

**Le besoin (Rémi, 10/11).** Le tableau de bord Flaix est riche ; c'est lui
que le responsable de lieu doit utiliser. Il ne devrait plus avoir à se
connecter à BreakEat. Pour cela, **une seule API ne suffit pas** : il en faut
**deux, une dans chaque sens**, et chacune est construite par celui qui
détient les données.

#### La carte complète

| Besoin | Sens | Qui construit | Section |
|---|---|---|---|
| Les matchs, saisis une seule fois | Flaix → BreakEat | Flaix | B |
| **Les commandes Flaix dans l'app** (« Mes commandes », « ta commande est prête », Live Activity, note, fidélité) | Flaix → BreakEat | Flaix | **E1** |
| Les chiffres de vente dans le tableau de bord BreakEat | Flaix → BreakEat | Flaix | D2 |
| Ouvrir Flaix sans se reconnecter | BreakEat → Flaix | Flaix | D1 |
| **Les chiffres de l'app dans le tableau de bord Flaix** (fréquentation, audience, campagnes, avis) | BreakEat → Flaix | BreakEat | **E2** |
| **Lancer une notification depuis Flaix**, régler l'apparence du lieu dans l'app | Flaix → BreakEat (écriture) | BreakEat | **E3** |

Si le responsable ne travaille plus que dans Flaix, D1 et D2 deviennent
inutiles : **B, E1, E2 et E3 suffisent.**

#### E1 — Les commandes Flaix remontent dans BreakEat (à construire par Flaix)

C'est le point le plus important de tout ce document. Aujourd'hui, **une
commande passée dans Flaix ne crée rien chez BreakEat**. Tout ce que l'app
sait déjà faire avec une commande en dépend :

| Ce que le client voit dans l'app | Ce que BreakEat doit recevoir |
|---|---|
| « Mes commandes » : le ticket, la buvette, « Commande n° 142 », le prix, la date | la commande, sa buvette, son numéro, son total, sa date |
| La barre « reçue → en préparation → prête » | chaque changement d'état, **en temps réel** |
| La **Live Activity** (écran verrouillé, Dynamic Island) et son décompte | l'état, et l'**heure estimée** à laquelle elle sera prête |
| « Ta commande est prête » (notification — ajoutée côté BreakEat) | l'état `READY`, dans les secondes qui suivent |
| L'heure de retrait sur le ticket | le créneau choisi, ou « dès que prête » |
| Le **reçu** avec la TVA taux par taux | chaque ligne : produit, quantité, prix TTC, **taux de TVA** |
| Le bandeau « produit manquant » | les lignes qui manquent, et combien |
| Le bandeau de remboursement | le montant remboursé |
| « Noter ma commande », les points de fidélité | l'état `COLLECTED` (récupérée) |
| Les campagnes vers « ceux qui ont commandé » | **qui** a commandé : l'identifiant BreakEat du client |

**Ce qui existe déjà et qu'on garde.** BreakEat reçoit DÉJÀ des événements
signés de Flaix pour la Live Activity (`FLAIX_CONTRACT.md`) : même signature
HMAC-SHA256, même anti-rejeu (5 minutes), même idempotence par `eventId`,
mêmes noms d'événements (`ORDER_STATUS_CHANGED`, `ORDER_READY`,
`ORDER_DELAYED`, `ORDER_CANCELLED`, `ORDER_COLLECTED`, `PICKUP_SLOT_CHANGED`,
`PICKUP_POINT_CHANGED`). Seule limite : ils désignent une commande
**BreakEat** (`orderId`), qui n'existe pas quand on commande chez Flaix.
D'où deux ajouts seulement :

1. **Un événement `ORDER_CREATED`** qui porte toute la commande — la première
   fois que BreakEat en entend parler ;
2. **`flaixOrderId`** à la place de `orderId` dans tous les événements : la
   référence Flaix, stable. BreakEat fait la correspondance.

```
POST https://<api-breakeat>/api/v1/webhooks/flaix
X-Flaix-Signature: <HMAC-SHA256 du corps brut, secret partagé>
{
  "eventId": "evt-5521",                 // unique : clé d'idempotence
  "event": "ORDER_CREATED",
  "timestamp": "2026-11-22T20:12:04Z",   // anti-rejeu
  "flaixOrderId": "c-98765",             // stable, jamais réutilisé
  "lieu": "velodrome",                   // id Flaix du lieu
  "evenement": "m-123",                  // id du match (le même que dans B)
  "client": {
    "breakeatId": "4b1e…",               // rendu par l'étiquette [#breakeatId]
    "email": "client@exemple.fr"         // de secours, pour le rapprochement
  },
  "numero": "142",                       // ce que le client dit au comptoir
  "buvette": { "id": "b-nord", "nom": "Tribune Nord" },
  "retrait": {
    "creneau": "2026-11-22T21:45:00+01:00",   // null = « dès que prête »
    "point": "Comptoir 3"
  },
  "lignes": [
    { "produit": "Hot-dog", "quantite": 2, "totalCentimes": 1200, "tvaPourDixMille": 1000 },
    { "produit": "Coca 50 cl", "quantite": 1, "totalCentimes": 450, "tvaPourDixMille": 550 }
  ],
  "totalCentimes": 1650,
  "payeeLe": "2026-11-22T20:12:01+01:00",
  "status": "CREATED",
  "estimatedReadyAt": "2026-11-22T20:25:00+01:00",
  "lienRecu": null                       // facultatif : le reçu officiel Flaix
}
```

Puis, à chaque étape, un événement court :

```
{ "eventId": "evt-5530", "event": "ORDER_READY", "timestamp": "…",
  "flaixOrderId": "c-98765", "status": "READY", "estimatedReadyAt": null }
```

Deux événements de plus, pour ce que l'app affiche déjà :

- **`ORDER_ITEMS_MISSING`** — `{ "lignes": [{ "produit": "Hot-dog", "manquant": 1 }] }` :
  le bandeau « produit manquant » ;
- **`ORDER_REFUNDED`** — `{ "rembourseCentimes": 600, "total": false }` :
  le bandeau de remboursement (`total: true` = remboursée entièrement).

**Les exigences :**

- **Le client est reconnu** grâce à une nouvelle étiquette dans le lien de
  commande, `[#breakeatId]`, que BreakEat remplit déjà pour `[#firstname]`,
  `[#mail]`, etc. Flaix la garde avec la commande et la renvoie ici. Sans
  elle, la commande ne peut être rattachée à personne : ni « Mes commandes »,
  ni Live Activity.
- **Temps réel** : `ORDER_READY` part **dans les secondes** qui suivent le
  geste du comptoir — c'est lui qui fait sonner le téléphone.
- **Dans l'ordre, sans doublon** : un événement plus ancien qu'un autre déjà
  reçu est ignoré ; un événement rejoué (même `eventId`) aussi.
- **Réessais** en cas d'échec (par exemple 10 s, 1 min, 5 min, 30 min) : une
  coupure de quelques minutes ne doit perdre aucune commande.
- **Une adresse de relecture** : `GET /api/commandes/<flaixOrderId>` côté
  Flaix (même clé que D), pour que BreakEat rattrape une commande dont il a
  manqué un événement.
- **Le taux de TVA par ligne** est indispensable : sans lui, le reçu n'est
  plus un justificatif. Si Flaix émet déjà son propre reçu, `lienRecu` permet
  à l'app de l'afficher à la place du sien.

**Dans l'autre sens (BreakEat → Flaix), un seul signal :** « **Je suis
arrivé** ». Le client le touche quand il est devant le comptoir ; aujourd'hui
il n'arrive qu'à BreakEat. Pour que le comptoir Flaix le voie :
`POST https://<domaine-flaix>/api/commandes/<flaixOrderId>/arrivee` (même clé
que D), sans corps. À Flaix de dire s'il sait l'afficher au comptoir.

#### E2 — Les chiffres de l'app, lus par Flaix (à construire par BreakEat)

```
GET https://<api-breakeat>/api/v1/partenaires/flaix/lieux/<lieu>/statistiques?du=2026-11-01&au=2026-11-30
Authorization: Bearer <clé Flaix, propre à Flaix>
```

Ce que BreakEat est le seul à savoir, **uniquement en nombres** (aucun nom,
aucun e-mail) :

| Bloc | Contenu | Côté BreakEat |
|---|---|---|
| Fréquentation | ouvertures de l'app, visiteurs uniques, vues du lieu, vues de chaque match | déjà mesuré |
| Parcours | vues du lieu → appuis sur « Commander » (Flaix complète avec les paiements) | le comptage de « Commander » est à ajouter |
| Audience | personnes qui ont le lieu en favori, personnes qui acceptent les notifications | les favoris sont aujourd'hui gardés sur le téléphone : à remonter au serveur |
| Notifications | envoyées, reçues, par campagne | en partie mesuré |
| Avis | note moyenne, nombre de notes, signalements | les notes existent ; elles suivront E1 pour les commandes Flaix |

Le même découpage **par match** est possible (`…/evenements/<id>/statistiques`).

#### E3 — Piloter l'app depuis Flaix (à construire par BreakEat)

Même clé, routes en écriture :

```
POST   …/lieux/<lieu>/campagnes        { titre, message, envoiLe, cible: "tous" | "evenement", evenement? }
GET    …/lieux/<lieu>/campagnes        la liste, avec leur état et leurs chiffres
DELETE …/lieux/<lieu>/campagnes/<id>   annuler une campagne pas encore partie
PATCH  …/lieux/<lieu>/apparence        { photo?, logo?, messageInformation? }
```

- « tous » veut dire : les clients qui ont **commandé** dans ce lieu (grâce à
  E1) **ou** qui l'ont mis en **favori**. Jamais tous les téléphones de
  l'app.
- Une **limite** par lieu (par exemple trois notifications par jour) : trop de
  notifications et les clients les coupent, et Apple peut le reprocher à
  l'app.

#### Les règles communes à E

- **Deux clés différentes**, une par sens (la clé que Flaix utilise pour
  appeler BreakEat n'est pas celle que BreakEat utilise pour appeler Flaix).
  Chacune est **limitée aux lieux autorisés**, révocable, remplaçable sans
  coupure, et échangée **par canal sûr — jamais par e-mail en clair**.
- **Données personnelles** : E2 ne renvoie que des **nombres**. Envoyer à
  Flaix la liste nominative des clients demanderait un contrat de traitement
  des données entre les deux sociétés, une mise à jour de la politique de
  confidentialité, et l'accord des clients pour le marketing. **Pas prévu.**
- Une panne d'un côté **n'arrête jamais l'autre** : BreakEat garde ses
  derniers chiffres, Flaix réessaie ses envois.

**Estimation côté BreakEat** : de l'ordre de **4 à 6 jours** pour E2 + E3,
favoris au serveur et comptage de « Commander » compris, plus **1 à 2 jours**
pour recevoir E1 (« Mes commandes », notifications, note et fidélité sur les
commandes Flaix). **Côté Flaix** : E1, et l'affichage de E2 et E3 dans son
tableau de bord — à estimer par son développeur.

---

## 4. Ce que BreakEat fera de son côté (quand le flux existe)

Pour information du développeur Flaix — rien à faire de son côté.

- Un champ **« adresse du flux Flaix »** par lieu dans l'admin BreakEat (le lieu
  porte déjà un champ `flaixVenueId`, prévu pour cela).
- Un **import automatique** toutes les quelques minutes, qui crée ou met à jour
  les matchs du lieu par leur `id` Flaix, et retire les matchs `annule`.
- Correspondance avec la base BreakEat (`Event`) : `nom` → `name`, `debut` /
  `fin` → `startAt` / `endAt`, `adversaire` → `opponentName`,
  `logoAdversaire` → `opponentLogoUrl`, `affiche` → `posterUrl`, `lienCommande`
  → `flaixOrderUrl`, `statut: annule` → `CANCELLED`. Il faudra ajouter à
  `Event` une colonne pour l'`id` Flaix et une pour `ouvertureCommande`
  (aujourd'hui l'heure d'ouverture est réglée **par lieu** dans BreakEat).
- Si le flux ne répond pas, BreakEat **garde les derniers matchs connus** :
  une panne de Flaix ne vide pas l'app.
- Estimation : **1 à 2 jours** une fois une adresse de flux réelle disponible.

**Pour la passerelle (D1)** :

- Le serveur BreakEat porte la clé Flaix dans ses variables d'environnement
  (jamais dans le code, jamais dans l'app).
- Une route `POST /organizations/:id/flaix/acces` : vérifie que l'appelant est
  responsable ou manager du lieu (ou super admin), appelle Flaix, renvoie
  l'adresse à ouvrir.
- Dans le tableau de bord : « Ouvrir Flaix » dans **Pilotage**, et « Voir le
  rapport » sur chaque match — qui remplace le lien de rapport collé à la
  main après chaque match.
- Estimation : **une demi-journée à une journée** une fois la route Flaix
  disponible en préproduction.

## 5. Ce qu'il faut renvoyer à BreakEat

1. Une **adresse réelle** du flux B pour un lieu (même en préproduction).
2. Le **domaine** de la page de commande et celui du **paiement**.
3. La date à laquelle le flux sera disponible.
4. **Pour la passerelle** : l'adresse de la route `POST /api/acces/lien` en
   préproduction, une **clé API de test** (par canal sûr), les valeurs
   acceptées pour `destination`, et l'identifiant Flaix de chaque lieu.
5. **Pour E** : si Flaix peut envoyer E1 (et quand), s'il accepte
   l'étiquette `[#breakeatId]` dans le lien de commande, s'il fournit le
   **taux de TVA par ligne**, s'il émet son propre reçu (`lienRecu`), s'il
   peut afficher « Je suis arrivé » au comptoir, et ce que son tableau de
   bord afficherait de E2 et E3.
6. **Un lieu de test** côté Flaix (préproduction), avec un match et des
   produits, pour passer de vraies commandes de bout en bout.

## 6. Décisions encore ouvertes côté BreakEat

- Ouvrir le lien principal (A) en attendant B, ou rester sur la saisie
  manuelle jusqu'à B.
- Un réglage par lieu **« Ouverture gérée par Flaix »** : le lien de commande
  serait toujours disponible, et c'est la page Flaix qui dirait « commandes pas
  encore ouvertes ». Inutile une fois B en place, puisque `ouvertureCommande`
  arrive avec chaque match.
- Passerelle : **D1 seul**, ou D1 puis D2 — et, pour D2, quels chiffres
  afficher dans le tableau de bord du lieu.
- **Où travaille le responsable de lieu** : dans Flaix (alors B + E1 + E2 +
  E3, et D devient inutile), ou dans les deux.
