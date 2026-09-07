# 🔖 POINT DE REPRISE — Break Eat

> **Où trouver quoi** — pour qui reprend le dossier :
>
> | Question | Document |
> |---|---|
> | Où en est-on, que faire ensuite ? | **ce fichier** |
> | Qu'a-t-on livré, quand, et pourquoi ? | `CHANGELOG.md` |
> | Comment le code est-il organisé ? | `GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md` |
> | Pourquoi cette décision technique ? | `brain/ENGINEERING_MANUAL.md` |
> | Quel était le plan, phase par phase ? | `brain/ROADMAP.md` (1→10 planifiées, 11→22 reconstituées) |
> | Résumé d'une session de travail | `brain/TASK_SUMMARY.md` |
> | Ordre de construction initial (phases 1→19) | `DEVELOPMENT_LOG.md` — historique, non tenu au-delà |
>
> Les 4 documents vivants sont `CHANGELOG.md`, `brain/ENGINEERING_MANUAL.md`,
> `brain/TASK_SUMMARY.md` et ce fichier. Le git complète.

_Dernière mise à jour : 2026-09-07 (cloche de notifications, inscription rapide Apple)_

## 🟢 ÉTAT AU 06/09/2026 — LIRE D'ABORD

**Le parcours de commande fonctionne de bout en bout**, vérifié en réel sur le
web : panier → paiement Stripe → commande créée → visible dans « Mes commandes »
ET sur le poste opérateur de la bonne buvette.

Ce que ça a demandé, et qui explique l'état actuel :

| Ce qui bloquait | Où c'était | Corrigé |
|---|---|---|
| Le stock refusait des commandes DÉJÀ PAYÉES | `orders.service` | 06/09 |
| La clé Stripe appartenait au compte encaisseur | configuration | 06/09 |
| Le retour de paiement atterrissait sur l'accueil | liens de l'app | 06/09 |
| Le panier restait plein après paiement | app web | 06/09 |
| Le poste filtrait sur une buvette périmée | poste opérateur | 06/09 |

**Stripe est en mode TEST** (`sk_test_…`). Aucun paiement réel n'est encaissé.
Le serveur l'annonce au démarrage, avec l'identifiant du compte plateforme :

```
Stripe en mode TEST — aucun paiement réel ne sera encaissé.
Stripe — compte PLATEFORME : acct_XXXX
```

Cette seconde ligne compte : le compte du club, affiché dans **Encaissement**,
doit être DIFFÉRENT. Stripe refuse un virement d'un compte vers lui-même, et son
refus ne dit pas lequel des deux est mal renseigné. La page Encaissement affiche
les deux côte à côte.

**Un compte Stripe par CLUB**, créé dans Encaissement. Le compte par buvette a
existé (cas d'un exploitant tiers) : il est retiré, les colonnes restent en base
annotées INERTES.

**Chaque opérateur tient UNE buvette**, rattachée dans le back-office → Équipe.
Le poste ne permet plus d'en changer, et un compte non rattaché ne voit rien.

**La build TestFlight est la 12.** La 13 apporte la cloche de notifications et
l'inscription par Apple ; rien de tout cela n'est sur le téléphone avant elle.

**Les notifications ont un destinataire, enfin.** `expo-notifications` n'était
pas installé et `apiRegisterPushToken` n'avait aucun appelant : les campagnes
partaient vers zéro appareil (`envoyé à 0 appareil(s)` dans les journaux). Le
jeton s'enregistre désormais après connexion, chaque envoi archive le message
pour ses destinataires, et la cloche lit ce compte au serveur.

**« Continuer avec Apple » est branché.** Google attend ses identifiants
clients ; **Facebook ne le sera pas** — son jeton ne certifie pas l'adresse, et
rattacher une inscription rapide à un compte existant sur une adresse non
certifiée donnerait le compte d'un client à qui saurait en déclarer l'adresse.

## 🔎 MÉTHODE — À LIRE AVANT DE CHERCHER UN BUG

**Devant un bug, on lit les journaux. On ne devine pas.**

Le 06/09/2026, une panne « je paie et il ne se passe rien » a occupé la journée.
Cinq hypothèses ont été poursuivies et corrigées à l'aveugle ; quatre étaient
justes et utiles, **aucune ne réglait le problème signalé**. La cause tenait en
une ligne dans Railway : `Stock row missing for product … during order creation`.

| Symptôme | Où regarder |
|---|---|
| L'app affiche une erreur, ou rien ne se passe | **Railway** → Deployments → Logs |
| Un paiement se comporte mal | **Stripe** → Développeurs → Webhooks → *Tentatives récentes* |
| Un dashboard ne charge pas | **Vercel** → Logs du déploiement |
| Un bouton ne réagit pas | **console du navigateur** (F12) |

Deux pièges à connaître :

- un **« 200 vert »** chez Stripe dit seulement que le serveur n'a pas planté,
  pas qu'une commande existe. Le bloc « Événements reçus » de la page
  Encaissement dit ce que NOUS avons reçu, et combien de paiements n'ont produit
  aucune commande ;
- une erreur affichée dans l'app porte une **`réf. xxxxxxxx`** : c'est la clé
  pour retrouver la trace complète dans Railway.

**Et vérifier le DÉPLOIEMENT avant d'annoncer « à tester ».** Un changement dans
le dépôt n'est pas un changement chez le client. Le bundle web se contrôle en
cherchant une chaîne distinctive dans le `.js` servi ; une route serveur en
l'appelant — 401 prouve qu'elle existe, 404 qu'elle manque.

## ⏭️ REPRISE IMMÉDIATE

00. **`APPLE_CLIENT_IDS` sur Railway** —
    `com.shapper.breakeat,com.shapper.breakeat.preview`.
    Ce n'est pas un secret : c'est le destinataire attendu dans le jeton d'Apple
    (`aud`). Sans elle, `/auth/providers` répond une liste vide et le bouton
    « Continuer avec Apple » **ne s'affiche pas** dans l'application — c'est
    voulu : un bouton visible est un bouton qui marche. Les deux identifiants
    car la build `preview` porte le suffixe `.preview` et se présente donc sous
    ce destinataire-là ; n'en mettre qu'un ferait échouer les essais TestFlight
    pendant que la production marche.

0. **`PUBLIC_API_URL` sur Railway** — `https://breakeat-admin-production.up.railway.app/api/v1`.
   Deux usages, tous deux invisibles tant qu'on teste sur le web :
   le **retour de paiement de l'app installée** (Stripe n'accepte que du http(s),
   un pont sur notre API rebondit vers `breakeat://`) et **le lien du reçu**.
   Sur le web, le retour vise le site directement et ne dépend pas d'elle — d'où
   un test web qui passe et une app native qui reste bloquée sur la page de
   Stripe. Le démarrage la réclame dans ses journaux.

1. **`APNS_BUNDLE_ID = com.shapper.breakeat`** sur Railway. La build TestFlight porte l'identifiant réel ; avec une autre valeur, le topic APNs ne correspond pas et **aucune Live Activity ne démarrera**.
2. **La CLÉ APNs (`.p8`) doit couvrir la PRODUCTION.** ← constaté le 06/09/2026

   Journal Railway au moment d'une transition de commande :

   ```
   Échec d'envoi APNs (403 BadEnvironmentKeyInToken) pour l'activité …
   ```

   Ce message ne désigne PAS `APNS_ENV`, qui peut être parfaitement réglé. Il
   dit : *cette clé d'API n'est pas valable pour cet hôte*. Apple permet de
   créer une clé APNs limitée au **Sandbox** ; utilisée contre l'hôte de
   production — celui qu'exige une build TestFlight — elle est refusée à chaque
   envoi. L'activité s'affiche quand même (iOS la crée localement) mais reste
   **figée sur son premier état**.

   Le remède n'est pas une variable : recréer une clé dans le portail Apple
   (Certificates, Identifiers & Profiles → Keys) en cochant **APNs**, valable
   Sandbox ET Production, puis remplacer `APNS_KEY_ID` et `APNS_PRIVATE_KEY`.
   Le serveur nomme désormais la clé refusée dans son avertissement.

   Le `.p8` ne doit JAMAIS être collé dans une conversation ni commité.

3. **`APNS_ENV = production`** sur Railway. Sans cette valeur, le serveur pousse
   vers l'hôte *sandbox* alors que la build TestFlight porte un jeton de
   production : Apple rejette chaque mise à jour (`BadDeviceToken`). La Live
   Activity s'affiche quand même — iOS la crée localement — mais reste **figée
   sur son premier état**, et rien ne la termine. C'est la cause des trois
   symptômes observés le 27/08. Le serveur trace maintenant l'hôte visé au
   démarrage : la ligne `APNs — hôte …` dit lequel est utilisé.
4. **TestFlight** — App Store Connect → onglet TestFlight → remplir les *informations de test* (obligatoire), puis s'ajouter en testeur interne.
5. **Renseigner les coordonnées GPS des lieux** — sans elles, un lieu n'apparaît jamais par proximité. Il reste trouvable par la recherche.
6. **Activer l'ardoise pour la tester** : `GROUP_SPLIT_ENABLED=true` et
   `PUBLIC_WEB_URL=https://breakeat-admin-mobile-rho.vercel.app` sur Railway.
   Exige aussi des clés Stripe valides et une buvette avec un compte Connect
   actif — sans compte, la page de paiement ne peut pas s'ouvrir. À `false`,
   le bouton disparaît et le parcours normal ne change pas.
7. **Décider du sort des tables `operator_screen_templates` et
   `event_operator_screens`.** Le board opérateur est passé à trois colonnes
   fixes : l'interface et l'API de configuration ont été retirées, mais les
   TABLES restent. Les supprimer effacerait les écrans déjà enregistrés par les
   clubs — ça se décide, ça ne se fait pas en passant. Tant qu'elles existent,
   elles ne coûtent rien.
8. **Nettoyer les données de test** du wizard et de « Démo Spartiates » : événements d'abord, puis points de retrait, puis comptes.
9. **Régler la TVA des produits déjà en ligne** — toujours à faire. Toute carte saisie avant le
   01/09/2026 est à **10 %**, bières comprises : c'était le seul taux que
   l'application connaissait. Les taux de la restauration sont trois — 5,5 %
   (à emporter, produit emballé), 10 % (consommation immédiate), 20 % (alcools
   et non-alimentaire). Dashboard → **Buvettes** → une buvette : chaque produit
   porte une **pastille de taux cliquable**. Tant qu'une bière reste à 10 %, la
   page Comptabilité surévalue le CA HT et sous-évalue la TVA collectée. Les
   commandes DÉJÀ passées gardent leur taux d'origine — c'est voulu : on ne
   réécrit pas une déclaration déposée.

10. **Rattacher chaque compte opérateur à SA buvette** — back-office → **Équipe**.
   C'est désormais la seule chose qui détermine ce qu'un poste affiche : le
   sélecteur a été retiré (il permettait d'afficher un comptoir et d'en recevoir
   un autre, le serveur imposant de toute façon celui du compte). Un compte non
   rattaché ne voit rien, et l'écran le dit. **À faire avant d'ouvrir un lieu à
   plusieurs buvettes.**

11. **Supprimer la commande `DEMO-MTBUTM82`** et les autres restes du mode démo,
    qui traînent encore dans « Mes commandes » de certains comptes.

12. **Nettoyer les comptes Stripe connectés inutiles.** Il en subsiste plusieurs
    portant le même nom (« Buvette Nord » en double), créés lors d'inscriptions
    reprises. Un seul reçoit l'argent, celui affiché dans **Encaissement** ;
    chercher un paiement dans un autre fait conclure à tort qu'il n'a pas été
    encaissé. Les renommer suffit.

## 🧱 Montée Expo SDK 53 → 57 (25/08)

**React Native 0.79.6 → 0.86.2.** Apple a rejeté la soumission (ITMS-90725) :
le SDK iOS 26 est obligatoire. Or Xcode 26 ne compile pas le `fmt` embarqué
par RN 0.79. Aucun contournement — monter le SDK était la seule voie.

Trois ruptures, **toutes silencieuses** (rien n'échouait à la compilation) :

1. `@bacons/apple-targets` fait `require('@expo/plist')` **sans le déclarer**.
   Le SDK 57 ne le fournit plus par transitivité ; pnpm n'expose que le
   déclaré. Le plugin échouait *sans casser la build* → **plus de cible Xcode
   pour l'extension Live Activity**. Réparé par `packageExtensions` dans
   `pnpm-workspace.yaml`. **NE PAS RETIRER.**
2. `splash` a été retiré de la racine du schéma Expo → clé ignorée en silence,
   écran de démarrage blanc. Passe désormais par le plugin
   `expo-splash-screen`.
3. `@react-native/typescript-config` 0.86 masque le chemin profond
   `/tsconfig.json` derrière une carte `exports` → l'`extends` échouait sans
   bruit et `tsc` repartait sur ses défauts.

Une quatrième rupture n'est apparue qu'à la compilation Xcode : le podspec du
module Live Activity référençait le contrat Swift partagé par un chemin
**sortant de la racine du pod**. CocoaPods ne garantit pas les sources hors
racine — cela marchait en SDK 53, plus en 57. Le podspec matérialise désormais
lui-même la copie (voir « Pièges connus »).

✅ **SDK 57 validé de bout en bout** (25/08). React Native 0.86 compile avec
Xcode 26 — le blocage `fmt`/consteval est levé, et le rejet ITMS-90725 ne
reviendra pas. Builds 5 et 6 livrées sur TestFlight, **1.1.0 (6) installée et
testée sur iPhone**.

✅ **Géolocalisation native confirmée sur appareil réel.** Elle n'avait JAMAIS
été montée : `navigator.geolocation` n'existe pas sur natif, donc la découverte
par proximité — le parcours d'entrée du produit — était morte sur téléphone,
sans erreur pour l'expliquer. Invisible en test web, où le navigateur fournit
l'API. Pont posé via `@react-native-community/geolocation`, bridé sur
`whenInUse`.

⚠️ **Avertissements ITMS-90683 restants** (non bloquants pour les tests
internes, bloquants pour une mise en ligne publique) : Apple ne révèle ses
exigences de purpose string **qu'une par envoi**. Les clés `Always` sont
ajoutées depuis `d573bc6` — une build 7 les soldera.

Vérifié : typecheck, export web, 3 apps Next.js, 449 tests backend,
`expo-doctor` 20/21. ⚠️ **La compilation native ne se vérifie que sur EAS** :
Windows refuse de générer un projet iOS.

## 🚀 Livraison (24/08 au soir)

**Version 1.1.0 soumise à App Store Connect**, en attente de traitement Apple.
La version publiée reste la **1.0.10** (20/05/2026) : TestFlight est un canal
séparé, seuls les testeurs invités reçoivent la 1.1.0.

**L'extension Live Activity a été compilée et signée pour la première fois.**
Écrite en phase 21, elle n'avait jamais été construite. Un seul défaut à
corriger : `accentColor` masquait un modificateur SwiftUI du même nom.

Les deux cibles sont signées : `com.shapper.breakeat` et
`com.shapper.breakeat.LiveActivity`.

**Une nouvelle version ne demande plus que deux commandes** — certificats, clé
API et profils sont enregistrés chez EAS :

```
eas build  --profile beta --platform ios
eas submit --profile beta --platform ios
```

Le numéro de build s'incrémente seul (`appVersionSource: remote`). `version`
dans `app.config.js` ne bouge que pour une sortie publique.

⚠️ **Android reste bloqué** : l'autolinking génère un import vers
`expo.core.ExpoModulesPackage`, classe supprimée depuis des années, alors que
le paquet installé fournit `expo.modules.ExpoModulesPackage`. Rien dans le
dépôt ni dans `node_modules` ne mentionne l'ancien chemin. `nodeLinker:
hoisted` n'y a rien changé. **Cause non expliquée** — 7 échecs Android contre
4 réussites iOS.

⚠️ Dans PowerShell, **`&&` n'existe pas** : utiliser `;` ou deux commandes séparées.

## 🌐 Environnements

| | Adresse | État |
|---|---|---|
| Backend | `breakeat-admin-production.up.railway.app/api/v1` | ✅ en ligne |
| App mobile (web) | `breakeat-admin-mobile-rho.vercel.app` | ✅ |
| Dashboard manager | `breakeat-admin-admin.vercel.app` | ✅ |
| Back-office | `breakeat-admin-backoffice.vercel.app` | ✅ |
| Poste opérateur | `breakeat-operator-git-main-…vercel.app` | ✅ |
| **Staging** | — | ❌ **n'existe pas** — voir `GUIDE_DEVELOPPEMENT/ENVIRONNEMENT_BETA.md` |

`DEMO_MODE=true` en production : les commandes se créent **sans paiement**. À retirer avant tout encaissement réel.

✅ **`https://breakeat-operator.vercel.app` est autorisée** (re-vérifié le 28/08, requête preflight). Le blocage du 25/08 est levé : c'était bien un rejet CORS, jamais un mot de passe. `https://breakeat-admin-admin.vercel.app` répond également.

**Toute nouvelle adresse doit rejoindre `CORS_ORIGINS`** (Railway → Variables), séparée par des virgules, **sans slash final**. Une entrée malformée bloque silencieusement toute l'app — c'est arrivé le 24/08.

## 📱 Identifiants de build

L'app publiée sur les deux stores porte **`com.shapper.breakeat`** (« Break Eat : Click&Collect », en production depuis le 23/01/2026, ~365 installations). Le dépôt est aligné dessus depuis `bda52d2`.

- Identifiant Apple (soumission) : `6496204412`
- Extension Live Activity : `com.shapper.breakeat.LiveActivity`
- `version` = **1.1.0**, au-dessus de la 1.0.10 publiée. Apple refuse toute soumission dont la version n'est pas supérieure à celle en ligne.
- Le **numéro de build** est tenu par EAS (`appVersionSource: remote`) et s'incrémente seul. Ne pas le remettre dans `app.config.js` : il y serait ignoré, tout en laissant croire qu'il se pilote là.
- ⚠️ **Clé de signature Android non vérifiée** : Play Console → Intégrité de l'app. Si « Signature d'application Play » n'est pas activée, la clé d'origine est probablement chez Shapper — sans elle, mettre à jour l'app publiée est impossible.

## 🧱 Entrées de build — À SAVOIR ABSOLUMENT

- **Tous les builds livrés (web Vercel ET natif EAS) bundlent `apps/mobile/index.expo.js` → `App.expo.tsx`** (champ `package.json` `"main"`).
- **`App.tsx` / `root-navigator.tsx` ne sont JAMAIS livrés** (code mort). Toute modif UI/nav doit se faire dans `App.expo.tsx`.
- `EventHome` **n'est plus un stub** (`3115e05`) — le parcours de commande est enfin atteignable dans les versions livrées. `QRScanner` reste stubbé (caméra indisponible sur web).
- Garde-fou : `src/components/crash-guard.tsx` intercepte erreur au require, au rendu, ou JS fatale.

## ✅ Livré (phases 16 → 22)

- **16** — Découverte des lieux : `GET /public/venues` (Haversine), lieux privés masqués côté serveur.
- **17** — Back-office SUPER_ADMIN : clubs, lieux, utilisateurs, groupes, notifications push.
- **18** — Plan des buvettes par lieu, viewer plein écran.
- **19** — État live des commandes + « Je suis arrivé » (événement realtime dédié `customer_arrived`).
- **20** — Fidélité : activation par lieu, solde par organisation, registre immuable, gain à la récupération.
- **21** — Live Activity iOS : *backend vérifié* (APNs HTTP/2, JWT ES256, webhook Flaix signé HMAC). *Natif compilé et signé le 24/08* — reste à valider sur un appareil réel.
- **22** — **Lieux ouverts en continu** (`Venue.operatingMode`) : un restaurant ou une cantine n'a aucun événement à créer. Break Eat pose un contenant unique et invisible (`isPermanentContainer`), protégé contre toute modification. Le wizard saute alors « Événement » et « Créneaux ».
- **Environnement Beta** : profils EAS séparés, `.env.example`, mode d'emploi Railway.
- **Statistiques par période** : jour / semaine / mois, tranches vides conservées. La vue par défaut suit le rythme du lieu.
- **Gestion** : archiver ou supprimer un événement, supprimer un point de retrait, archiver un compte — chaque suppression **refusée** si des commandes existent.

## 🎯 Direction

L'app Break Eat = **porte d'entrée du click-and-collect Flaix**. Flaix gèrera événements, produits et paiement ; Break Eat garde la **relation client** — découverte des lieux, fidélité, présence, suivi live, Live Activity.

⚠️ **Point d'architecture non résolu** : le webhook Flaix exige une commande Break Eat existante (`LiveActivity.orderId` est une clé étrangère obligatoire). Sans **commande miroir**, la fidélité, « Je suis arrivé » et la Live Activity resteront éteintes sur les lieux Flaix. C'est le prochain vrai chantier.

## ⏳ Reste à faire

1. **Wizard idempotent** — mettre à jour au lieu d'empiler. Faire l'inventaire des doublons déjà créés avant de corriger.
2. **Wizard et demo-setup idempotents** — ils recréent événement, buvettes et comptoirs à chaque passage. Seule chose qui fera revenir les doublons après une remise à zéro.
3. **Commande miroir Flaix** — conditionne toute la valeur ajoutée sur les lieux Flaix.
4. **PaymentSheet mobile** — `@stripe/stripe-react-native` n'est pas installé. Le serveur est prêt : Connect en destination charges, webhook signé, idempotence par panier.
5. **`charge.refunded`** — un remboursement Stripe ne redescend pas dans Break Eat.
6. **Environnement staging** — service et base Railway séparés.
7. **Persistance des favoris** — aujourd'hui locaux au téléphone.
8. **Section « À venir »** — vidée (`9cfc28c`), en attente des données Flaix.
9. **Restyler `order-tracking.screen.tsx`** — encore en thème sombre.
10. **Connexions Apple / Google / Facebook** — masquées derrière `SOCIAL_LOGIN_READY`, jamais branchées.
11. **Comptoirs (`PickupPoint`)** — supprimables uniquement depuis la fiche d'un événement, donc inatteignables sur un lieu permanent.

## 🍏 Ajouter une capability iOS — l'ordre compte

Ajouter `usesAppleSignIn` (ou toute autre capability) dans `app.config.js` ne
suffit pas : le **profil de provisionnement** ne la porte pas, et Xcode refuse
la build en fin de course, après l'upload et vingt minutes d'attente.

```
Provisioning profile "[expo] com.shapper.breakeat AppStore …"
doesn't include the Sign In with Apple capability.
```

L'ordre qui marche :

1. **Portail Apple** — [Identifiers](https://developer.apple.com/account/resources/identifiers/list)
   → `com.shapper.breakeat` → cocher la capability → **Save**.
2. **Relancer la build SANS `--non-interactive`.** C'est le point clé : en
   non-interactif, EAS réutilise le profil existant sans le valider. En
   interactif, il détecte « Provisioning profile is no longer valid », le
   régénère et repart tout seul — avec la clé App Store Connect déjà stockée,
   donc **sans demander le mot de passe Apple**.

Et `autoIncrement` ne recycle pas le numéro d'une build refusée : une tentative
ratée consomme son numéro pour de bon.

## 🧨 Migrations — la convention qui a coûté vingt minutes

**Les identifiants sont des `UUID`, jamais du `TEXT`.** Toutes les tables du
projet suivent `"id" UUID NOT NULL DEFAULT gen_random_uuid()`. Une clé étrangère
`TEXT` vers un `UUID` est refusée par Postgres, et l'échec ne se voit qu'en
production.

**Une migration en échec bloque toutes les suivantes** (`P3009`). Prisma
l'inscrit dans `_prisma_migrations` et refuse tout déploiement ultérieur : le
conteneur redémarre en boucle et **l'ancienne version continue de répondre**.
Symptôme trompeur : une route fraîchement poussée reste en 404 alors que le
build passe en local.

Réflexe : sonder une route livrée à la version PRÉCÉDENTE. Si elle répond, c'est
l'ancienne version qui est en ligne — la question n'est pas « où est ma route »
mais « pourquoi le démarrage échoue-t-il ». Puis lire le journal Railway.

Corriger le SQL ne suffit pas : il faut marquer la ligne annulée
(`prisma migrate resolve --rolled-back <nom>`).

## ⚠️ Dette technique et pièges connus

- **Mot de passe d'un membre** : `inviteByEmail` ne le pose qu'à la CRÉATION du compte. Pour un compte existant, passer par `POST /organizations/:id/members/:memberId/reset-password` (bouton « Mot de passe » sur la page Équipe). Réinviter un membre existant échoue sur « déjà membre » — ce n'est pas un chemin de secours.
- **Ne jamais avaler une erreur dans un `catch` vide.** L'accueil opérateur faisait `catch { setEvents([]); }` : jeton expiré, organisation inaccessible et serveur muet produisaient le même écran « aucun événement ». Le diagnostic a coûté une session entière.
- **Wizard NON idempotent** : il réutilise le lieu mais **recrée** événement, buvettes, points de retrait, catégories et produits à chaque passage. Le relancer empile des doublons et donne l'illusion que « rien ne s'enregistre » — les données le sont, dans un ensemble neuf, pendant que l'app pointe vers l'ancien.
- **Aucun repli silencieux vers `localhost`.** `NEXT_PUBLIC_API_URL` est gravée dans les trois `vercel.json` ; un filet console se déclenche dès qu'une app servie en ligne vise la machine locale. Sans lui, l'app appelle le poste du visiteur et le formulaire présente cet échec réseau comme « identifiant incorrect » — c'est arrivé, et le diagnostic a coûté une journée.
- **Jamais de `catch` vide.** L'accueil opérateur faisait `catch { setEvents([]) }` : jeton expiré, organisation inaccessible et serveur muet produisaient le même écran « aucun événement ». Distinguer « rien à afficher » de « ça a échoué ».
- **Valider AVANT d'écrire.** La création d'organisation validait les coordonnées après avoir créé le club : un échec partiel laissait un club orphelin, et la tentative suivante butait sur « ce slug existe déjà ». Une séquence multi-écritures sans transaction doit être **reprenable**.
- **Chercher les jumeaux d'un bug corrigé.** Le repli localhost avait déjà été réglé côté mobile en août ; ne pas l'avoir reporté sur les apps Next.js a coûté le même diagnostic une seconde fois.
- **`coords.ts` existe en DOUBLE** (`apps/admin` et `apps/backoffice`) — pas de paquet d'utilitaires partagé dans le monorepo. Toute correction vaut pour les deux ; chaque fichier signale son jumeau.
- **Double React (pnpm)** : singletons forcés dans `apps/mobile/metro.config.js`. **NE PAS RETIRER.**
- **Cache Metro** : `EXPO_PUBLIC_*` est inliné **et mis en cache**. `build:web` porte désormais `--clear` (`74ace4a`) — sans lui, changer une variable ne change rien au bundle, et le déploiement semble réussir tout en servant l'ancienne adresse.
- **Adresse d'API** : gravée dans `apps/mobile/vercel.json` (`05afc62`), publique par nature. `env.ts` **refuse de démarrer** une build empaquetée sans adresse explicite plutôt que de viser une IP locale.
- **Sentry** : conditionné au **jeton** (`SENTRY_AUTH_TOKEN`), pas à `APP_ENV` (`a75b1cf`). Se fier à l'environnement faisait échouer toute build « production » sans jeton.
- **Versions Expo** : toujours `npx expo install <paquet>`, jamais `pnpm add` — pnpm résout la dernière publiée, incompatible avec le SDK en place. A déjà cassé le build deux fois.
- **`packageExtensions` (pnpm-workspace.yaml)** : ajoute `@expo/plist` au manifeste de `@bacons/apple-targets`, qui l'utilise sans le déclarer. **NE PAS RETIRER** — sans lui le plugin est ignoré *en silence* et l'extension Live Activity disparaît de la build.
- **`splash`** ne vit plus à la racine d'`app.config.js` (retiré du schéma en SDK 57) mais dans le plugin `expo-splash-screen`. L'y remettre serait ignoré sans avertissement.
- **`expo-modules-core` / `@expo/config-plugins`** ne doivent PAS être des dépendances directes : le SDK les réexporte (`expo`, `expo/config-plugins`). Une copie à part diverge du SDK au premier décalage.
- **TypeScript 5.8.3 volontairement conservé** face aux 6.0.3 recommandés par Expo : les 7 paquets du monorepo la partagent. Acté dans `expo.install.exclude`.
- **Contrat Swift Live Activity** : `BreakEatOrderAttributes.swift` doit exister dans DEUX cibles. La source de vérité est `targets/live-activity/` (ramassée automatiquement par apple-targets, qui ne lit QUE son propre dossier). Le podspec en **matérialise une copie** dans `modules/live-activity/ios/` à chaque `pod install` — copie ignorée par git. Ne pas la commiter, et ne pas revenir à un chemin `../../../` : CocoaPods l'ignore silencieusement, et la build échoue sur « cannot find type … in scope ».
- **`expo prebuild -p ios` échoue sur Windows** : la validation des plugins natifs passe obligatoirement par une build EAS.
- **`Alert.alert` = no-op sur react-native-web** → utiliser `src/lib/alert.ts`. Corrigé partout dans les écrans (`320e72d`), mais le piège reste pour tout nouveau code.
- **Découverte des lieux** : deux chemins, deux seulement — proximité dans 10 km, ou recherche par mot-clé configuré sur le dashboard. Ni position ni recherche ⇒ **liste vide** (`0b67ff7`). Ne pas rouvrir un troisième chemin.
- **Catégories** : elles appartiennent à une **buvette**, pas à l'organisation (`/organizations/:orgId/suppliers/:supplierId/categories`).
- **Validation NestJS** : le pipe global tourne en `whitelist` + `forbidNonWhitelisted`. Un champ volontairement libre a besoin de `@Allow()`, sinon il est supprimé puis rejeté.
- **Contrôle défensif Stripe** : `createFromPaymentIntent` compare au **total remisé**. Le repasser sur le sous-total ferait refuser toute commande utilisant des points.
- **Fidélité** : `balance` est un cache du registre. Les mouvements passent par `increment` / `decrement` côté base — jamais par une lecture suivie d'une écriture absolue, qui perdrait un mouvement sous concurrence.
- **Montant minimum** : une remise laisse toujours `MIN_PAYABLE_CENTS` (0,50 €) à payer, seuil sous lequel le paiement refuse.
- **Migrations SQL manuelles** : les clés primaires existantes sont des `uuid`. Une nouvelle table doit utiliser `UUID … DEFAULT gen_random_uuid()`.
- **Realtime « client arrivé »** : événement **dédié**, surtout pas `order_updated`.
- Après tout changement de schéma Prisma : **arrêter le backend** (DLL Windows verrouillé) → `prisma generate` → relancer.

## 🚀 Lancer l'environnement (Windows)

```
corepack pnpm --filter @break-eat/backend start:dev    # port 3000
corepack pnpm --filter @break-eat/admin dev            # port 3001
corepack pnpm --filter @break-eat/operator dev         # port 3002
corepack pnpm --filter @break-eat/backoffice dev       # port 3003
```

Docker (Postgres/Redis) doit tourner. Base = `breakeat_dev`.

**Tester sur téléphone** : `eas build --profile preview --platform android` (APK, vise la production). Expo Go ne peut PAS ouvrir l'app — `react-native-vision-camera` est un module natif ; il faut un client de développement (`--profile development`).

## 🧹 Remise à zéro et suppressions

- **Vider une organisation** : back-office → Organisations → le club → section rouge en bas. Efface événements, buvettes, comptoirs, commandes et fidélité. **Conserve** le lieu (GPS, mots-clés), les accès et les groupes — sans eux, plus personne ne pourrait se reconnecter pour reconfigurer. Le nom doit être recopié à l'identique.
- **Supprimer un compte** : back-office → Utilisateurs → « Supprimer ». Refusé sur soi-même, sur le dernier SUPER_ADMIN actif, et sur tout compte portant des commandes (`Order.user` n'a pas de cascade — la base refuserait, et le CA disparaîtrait de la comptabilité). Archiver est la réponse dans ce cas.
- **Buvettes, événements, comptoirs, organisations** ont déjà leur suppression, interface comprise. Chaque suppression est refusée si des commandes existent.

## 🔑 Connexion

- **Production** : compte SUPER_ADMIN créé par amorçage (`reminotta@breakeatapp.com`). ⚠️ Retirer `ADMIN_BOOTSTRAP_SECRET` de Railway s'il y est encore.
- **Local** : `admin@breakeat.test` / `BreakEat2026!`
- **Mot de passe oublié d'un membre** : l'invitation ne pose un mot de passe qu'à la CRÉATION du compte, et réinviter un membre existant échoue sur « déjà membre ». Passer par le bouton **« Mot de passe »** de la page Équipe (dashboard manager) — il le régénère et l'affiche une seule fois.
