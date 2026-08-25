# 🔖 POINT DE REPRISE — Break Eat

> Ouvre ce fichier en premier dans une nouvelle session. Tout l'état utile est ici + dans les 4 docs (`CHANGELOG.md`, `DEVELOPMENT_LOG.md`, `brain/ENGINEERING_MANUAL.md`, `brain/TASK_SUMMARY.md`) + le git.

_Dernière mise à jour : 2026-08-25_

## ⏭️ REPRISE IMMÉDIATE

1. **`APNS_BUNDLE_ID = com.shapper.breakeat`** sur Railway. La build TestFlight porte l'identifiant réel ; avec une autre valeur, le topic APNs ne correspond pas et **aucune Live Activity ne démarrera**.
2. **TestFlight** — App Store Connect → onglet TestFlight → remplir les *informations de test* (obligatoire), puis s'ajouter en testeur interne.
3. **Renseigner les coordonnées GPS des lieux** — sans elles, un lieu n'apparaît jamais par proximité. Il reste trouvable par la recherche.
4. **Nettoyer les données de test** du wizard et de « Démo Spartiates » : événements d'abord, puis points de retrait, puis comptes.

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

1. **Commande miroir Flaix** — conditionne toute la valeur ajoutée sur les lieux Flaix.
2. **PaymentSheet mobile** — `@stripe/stripe-react-native` n'est pas installé. Le serveur est prêt : Connect en destination charges, webhook signé, idempotence par panier.
3. **`charge.refunded`** — un remboursement Stripe ne redescend pas dans Break Eat.
4. **Environnement staging** — service et base Railway séparés.
5. **Persistance des favoris** — aujourd'hui locaux au téléphone.
6. **Section « À venir »** — vidée (`9cfc28c`), en attente des données Flaix.
7. **Restyler `order-tracking.screen.tsx`** — encore en thème sombre.
8. **Connexions Apple / Google / Facebook** — masquées derrière `SOCIAL_LOGIN_READY`, jamais branchées.
9. **Comptoirs (`PickupPoint`)** — supprimables uniquement depuis la fiche d'un événement, donc inatteignables sur un lieu permanent.

## ⚠️ Dette technique et pièges connus

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

## 🔑 Connexion

- **Production** : compte SUPER_ADMIN créé par amorçage (`reminotta@breakeatapp.com`). ⚠️ Retirer `ADMIN_BOOTSTRAP_SECRET` de Railway s'il y est encore.
- **Local** : `admin@breakeat.test` / `BreakEat2026!`
