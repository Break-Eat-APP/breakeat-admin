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

---

## 7. Le scénario « 50 % » : Break Eat vitrine, Flaix derrière

Hypothèse posée le 09/10 : Break Eat garde **l'accès client et la découverte des
lieux** (géoloc, image, paramètres), et **au clic sur un lieu, Flaix prend tout
le reste**. Break Eat ne serait plus que le support visible.

### Le cadre, précisé par le client le 09/10

Ces quatre faits changent l'analyse, et tranchent la question que les sections
précédentes laissaient ouverte :

| Fait | Conséquence |
|---|---|
| **Flaix est en marque blanche, et fait PARTIE de Break Eat** — c'est son cerveau | Ce n'est pas une frontière avec un partenaire mais un partage interne. Les craintes « on perd le client, on perd la donnée » tombent : c'est la même maison |
| **Flaix fonctionne en WEB** pour le moment | Le relais est une page web dans l'app, pas un écran natif à réécrire |
| **Flaix a son dashboard** : données client, ventes, et le reste | Les statistiques, le fichier client et la fréquentation de Break Eat deviennent un DOUBLON — voir « deux dashboards » plus bas |
| **Flaix fait le paiement Stripe** | ✅ **La question « qui encaisse » est tranchée.** Le « 50 % » est donc un chiffre réaliste, pas optimiste |

### Bonne nouvelle : c'est déjà le plan du projet, et l'interrupteur existe

```prisma
/// PHASE 16.3 — Quand flaixEnabled, l'app passe le relais à Flaix au lieu du
/// parcours Break Eat natif ; flaixVenueId = identifiant du lieu côté Flaix.
flaixEnabled  Boolean  @default(false)
flaixVenueId  String?
```

Et il est câblé **de bout en bout** :

| Maillon | État |
|---|---|
| Case à cocher dans le panneau d'admin | ✅ existe |
| Champ stocké sur le lieu | ✅ existe |
| Renvoyé à l'app par l'API publique des lieux | ✅ existe |
| **L'app AIGUILLE déjà sur Flaix** (`venue-discovery.screen.tsx`) | ✅ **existe, et c'est livré** |
| L'écran d'arrivée `FlaixOrder`, enregistré dans `App.expo.tsx` | ✅ existe |
| **Le CONTENU de cet écran** | ⬜ le seul maillon manquant |

Le code vivant, aujourd'hui, dans la build que portent tes clients :

```ts
// venue-discovery.screen.tsx — « Ouvre un lieu : Flaix > événement actif > Bientôt »
if (v.flaixEnabled) {
  navigation.navigate('FlaixOrder', { venueId: v.id, flaixVenueId: v.flaixVenueId });
}
```

Et l'écran d'arrivée dit : *« Ce lieu utilise Flaix pour la commande.
L'intégration arrive bientôt. »* — 34 lignes, un logo et un message d'attente.

**Il n'y a donc pas un parcours à construire : il y a un écran à remplir.**

Conséquence directe pour la question posée : **oui, ce chemin se développe seul,
en parallèle, sans rien supprimer.** Un lieu avec `flaixEnabled = false` garde le
parcours Break Eat complet ; à `true`, il passe le relais. On bascule **un club à
la fois**, et on revient en arrière d'un clic si ça ne tient pas. C'est l'inverse
d'un chantier de démolition.

> ⚠️ Pour un auditeur : `flaixEnabled` est stocké et exposé mais **lu par
> personne** aujourd'hui. Ce n'est pas du code mort oublié — c'est une décision
> de la phase 16.3 en attente de l'API Flaix, comme le stub décisionnel.

### Qui encaisse : tranché — c'est Flaix

Le « 50 % » tient donc. Mais trois choses changent de main, et ce ne sont pas
des fonctionnalités :

- **la facturation des clubs.** La commission était calculée sur des commandes
  que Break Eat voyait passer (`perimetreCa` : payé, non annulé). Elle se
  calculera désormais sur les données **du dashboard Flaix**. Ce n'est pas une
  adaptation, c'est un changement de source — à vérifier avant la première
  facture, pas après ;
- **l'onboarding Stripe Connect des clubs**, construit et qui marche, devient
  inutile pour les lieux en Flaix. Il reste nécessaire pour les autres ;
- **les reçus et les remboursements** changent de main. Le bandeau bleu que
  l'app sait afficher dépend alors d'un webhook Flaix — voir le point 2 du
  contrat ci-dessous.

### Les trois points à spécifier dans le contrat d'API

Le reste est du travail d'exécution. Ces trois-là, non : mal posés, ils se
paient en retard et en reprise.

**1. L'AUTHENTIFICATION UNIQUE — le piège numéro un de la marque blanche.**

Le client est connecté à Break Eat. Il ne doit **pas** se reconnecter en
arrivant sur Flaix : une marque blanche qui redemande un mot de passe n'est plus
une marque blanche. Deux voies possibles, à trancher :

- Break Eat signe un **jeton court** (le client, le lieu, une expiration de
  quelques minutes) que Flaix vérifie à l'ouverture de la page ;
- ou Flaix accepte directement le **JWT Break Eat** et interroge son
  `/auth/me`.

La première est préférable : elle ne confie pas le jeton de session long à une
page web, et elle expire d'elle-même.

**2. LE RETOUR DE LA COMMANDE — c'est lui qui conditionne les notifications.**

Pour que l'app puisse afficher « Mes commandes », pousser « ta commande est
prête » et animer la Live Activity, Break Eat doit savoir qu'une commande existe
et où elle en est. Le **webhook signé existe déjà** (HMAC, anti-rejeu,
idempotence, journal) — mais il attend un `orderId` **de Break Eat**, et une
commande passée chez Flaix n'en a pas.

Deux voies, à trancher :

- Flaix **crée une trace légère** côté Break Eat à la commande (référence,
  lieu, montant, état) et le webhook existant fonctionne tel quel ;
- ou le webhook porte **ses propres identifiants** Flaix, et Break Eat tient une
  table de correspondance.

⚠️ Sans l'un des deux, l'app devient une vitrine **muette** : le client commande
et n'est plus jamais prévenu. C'est aussi ce qui soutient l'argument App Store
(voir plus bas) — donc ce point n'est pas optionnel.

**3. LA WEBVIEW EST UNE DÉPENDANCE NATIVE.**

`react-native-webview` **n'est pas installé**. L'ajouter, c'est :

- un **nouveau build EAS** (une dépendance native ne passe pas par une mise à
  jour over-the-air) ;
- et le moment exact où le piège des **deux copies de React** peut ressortir —
  les singletons forcés dans `metro.config.js` sont là pour ça, **ne pas y
  toucher** (voir le crash iOS « useState of null »).

À prévoir dans le planning : ce n'est pas « une page web dans l'app », c'est une
livraison complète avec passage en revue Apple.

### Ce qu'on oublie, et qui se paie

1. **Les notifications et la Live Activity appartiennent à l'APP.** Le jeton de
   push est celui de l'appareil, enregistré par Break Eat. Même si Flaix tient la
   commande, c'est Break Eat qui doit dire « ta commande est prête » — donc le
   module notifications et le webhook signé **restent**. Sans cela, la vitrine est
   muette : le client ne sait jamais que sa commande l'attend.
2. **DEUX DASHBOARDS POUR UN CLUB = deux chiffres qui ne se recoupent pas.**
   Flaix a le sien (données client, ventes) ; le panneau d'admin Break Eat
   affiche aussi des statistiques, un fichier client et une fréquentation, tous
   calculés sur **ses** commandes. Pour un lieu passé en Flaix, ces écrans
   deviennent faux — ils ne verront plus rien passer, et un club lira « 0 € »
   là où il a vendu.

   C'est **exactement** le défaut P2 corrigé le 01/10 entre le back-office et
   les stats d'organisation : deux périmètres pour un même chiffre. La leçon
   vaut ici : soit l'admin Break Eat cesse d'afficher des chiffres pour un lieu
   Flaix et **pointe vers le dashboard Flaix** (le lien existe déjà, phase 50),
   soit il lit les chiffres de Flaix par API. **Jamais les deux sources en
   parallèle.**
3. **Le risque App Store, et pourquoi la décision du client est la bonne.**
   Une application dont la seule fonction est de lister des lieux et d'ouvrir
   une page externe tombe sous la règle **4.2 « minimum functionality »**
   d'Apple. Garder les notifications, l'historique, les comptes et la
   découverte — ce qui est décidé — lui donne sa substance. Deux précisions
   utiles :

   - **le paiement externe est autorisé ici.** L'achat intégré d'Apple ne
     s'impose que pour du contenu numérique ; pour de la nourriture, le paiement
     par Stripe dans une page web ne pose pas de problème de règle ;
   - **Sign in with Apple est déjà en place** (`expo-apple-authentication`,
     `usesAppleSignIn`), ce qui retire l'autre motif de refus classique quand
     une app propose une connexion.

   Le relais doit rester **DANS** l'app (webview) et non ouvrir le navigateur :
   une app qui éjecte vers Safari pour sa fonction principale est bien plus
   exposée à 4.2.
4. **Ce qui part au placard** : partager l'addition, la fidélité, le stock, les
   créneaux, le poste opérateur, le temps réel, les statistiques. Ce sont les
   fonctions qui différencient Break Eat d'un annuaire. Elles ne disparaissent pas
   du dépôt — elles dorment derrière le drapeau, et se rallument par lieu.
5. **Les données ne se suppriment jamais.** Les commandes déjà passées portent la
   comptabilité. Un lieu qui bascule chez Flaix garde son historique.
6. **L'altitude n'existe pas** dans le modèle : le lieu porte `latitude`,
   `longitude`, `searchTerms` et son image. Si le positionnement en a besoin,
   c'est une colonne à ajouter — une migration, pas un chantier.

### La méthode

1. Implémenter **le branchement**, pas une seconde app : au clic sur un lieu, si
   `flaixEnabled`, aller chez Flaix avec `flaixVenueId`.
2. Garder les deux chemins vivants derrière le drapeau. **Aucune suppression.**
3. Éprouver sur **un club**, un vrai service, et comparer : ce que le client vit,
   ce que le comptoir vit, ce que la comptabilité voit.
4. Décider ensuite — et seulement ensuite — ce qu'on retire.

### Ce qui n'est pas une question technique

Si Break Eat n'est que la vitrine, son levier auprès des clubs devient le
référencement et les comptes. C'est une position plus mince que « le système qui
encaisse et qui mesure ». Ce choix-là est économique, pas technique : il se prend
en sachant que le code, lui, est prêt à faire les deux.

## En un mot

Le dépôt a été construit avec cette frontière en tête, donc **il n'y a pas de
chantier de démolition à prévoir** : deux morceaux morts à retirer aujourd'hui,
une plomberie de décision à choisir (push, de préférence), et une ambiguïté à
trancher sur qui dit « prête ».

Ce qui coûterait cher, en revanche, c'est de laisser deux systèmes décider la
même chose « au cas où ». C'est le seul scénario où brancher Flaix Ops
dégraderait une application qui marche.
