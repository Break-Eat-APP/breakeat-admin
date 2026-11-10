# Cahier des charges — le calendrier Flaix lisible par BreakEat

**À transmettre au développeur Flaix.** Rédigé le 10/11/2026, à partir de la
discussion du 09/11 (options A, B, C). Rien n'est encore développé : ni côté
Flaix, ni côté BreakEat. Ce document fixe le format, pour que les deux côtés
puissent avancer chacun de leur côté.

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

Ordre de priorité : **B d'abord**, A est déjà là (à vérifier), C ensuite.

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

## 5. Ce qu'il faut renvoyer à BreakEat

1. Une **adresse réelle** du flux B pour un lieu (même en préproduction).
2. Le **domaine** de la page de commande et celui du **paiement**.
3. La date à laquelle le flux sera disponible.

## 6. Décisions encore ouvertes côté BreakEat

- Ouvrir le lien principal (A) en attendant B, ou rester sur la saisie
  manuelle jusqu'à B.
- Un réglage par lieu **« Ouverture gérée par Flaix »** : le lien de commande
  serait toujours disponible, et c'est la page Flaix qui dirait « commandes pas
  encore ouvertes ». Inutile une fois B en place, puisque `ouvertureCommande`
  arrive avec chaque match.
