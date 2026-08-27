# CHANGELOG — BREAK EAT

Chaque entrée correspond à une session de travail ou une phase.
Format : fichiers créés (`+`), modifiés (`~`), supprimés (`-`).

---

## [0.52.0] — 2026-08-28 — Trois colonnes, et plus rien a configurer

### Le board opérateur passe de cinq colonnes à trois
Nouvelles → En préparation → Prêtes à remettre, puis « Remise au client » fait
sortir la commande du board. « Acceptées » n'était pas un geste réel : accepter
une commande et s'y mettre sont le même mouvement au comptoir, et la colonne
imposait deux clics pour un seul.

Deux transitions rejoignent la machine à états (`PAID → PREPARING`,
`ACCEPTED → READY`). Ce ne sont pas des exceptions : c'est le parcours normal
du board à trois colonnes. Les anciennes restent ouvertes — une commande déjà
en `ACCEPTED` doit continuer d'avancer.

Chaque colonne regroupe plusieurs statuts, à dessein : **un statut sans colonne
est une commande invisible**. `ACCEPTED` s'affiche dans « En préparation »,
`RECOVERED` revient dans « Nouvelles ».

### Le configurateur d'écrans opérateur disparaît
Il permettait de composer des écrans (statuts, créneaux, fournisseurs,
catégories) — beaucoup de réglages pour un board qui n'en demande aucun. Le
board est désormais fixe : 1 038 lignes d'interface de configuration en moins,
l'entrée de menu retirée, et le bouton « Récap produits » enfin toujours
visible (il ne s'affichait que si un écran était configuré, donc jamais).

L'API `operator-screens` du serveur reste en place, sans appelant.

### Deux textes qui décrivaient un manque
« Aucun créneau sélectionné » s'affichait dans le panier **avant** l'étape de
choix du créneau : il présentait le parcours normal comme un défaut. Et
l'accueil d'un lieu affichait « Service continu » — le nom du contenant
technique — au-dessus d'horaires que personne n'avait saisis. Le titre nomme
maintenant l'étape (« Choisir un stand ») et les horaires ne s'affichent que
lorsqu'ils existent.

- `~ backend/src/modules/orders/order-state-machine.service.ts` — deux raccourcis
- `~ apps/operator/src/app/dashboard/[eventId]/page.tsx` — trois voies fixes
- `~ apps/operator/src/components/{OrderCard,DashboardColumn}.tsx` — un geste par carte
- `- apps/operator/src/lib/screens/filter.ts`
- `- apps/admin/src/app/(admin)/operator-screens/`, `- apps/admin/src/components/operator-screens/`
- `~ apps/mobile/src/screens/{cart,event-home}.screen.tsx`

---

## [0.51.0] — 2026-08-27 — La Live Activity répond enfin

### Trois symptômes, trois causes différentes

**1. Les étapes n'avancent pas.** `APNS_ENV` vaut « sandbox » par défaut, alors
qu'une build TestFlight porte un jeton de **production**. Apple refuse chaque
mise à jour (`BadDeviceToken`) — mais l'activité, elle, démarre : iOS la crée
localement, sans réseau. D'où un symptôme qui ne ressemble pas à une panne, une
carte figée sur son premier état. Le réglage est côté Railway ; le code, lui,
trace désormais l'hôte visé au démarrage et nomme ce réglage dans le rejet.

**2. « Mes commandes » ne se met pas à jour seul.** iOS **suspend les minuteurs
JavaScript** dès que l'écran se verrouille. Le sondage de 10 s était correct :
il ne tournait simplement plus. Les deux écrans rechargent maintenant au retour
au premier plan, et la liste aussi au retour sur l'onglet.

**3. La notification ne disparaît jamais.** La fin est poussée par le serveur
(`end` + date de retrait). Si cette poussée n'arrive pas — cause n° 1 — rien ne
conclut l'activité. L'app balaie donc elle-même, à chaque lecture de
« Mes commandes », les activités dont la commande est terminée. Prudence
assumée : seule une commande **présente dans la liste ET terminée** ferme son
activité ; une commande absente n'est pas une commande finie.

### « Je suis arrivé » depuis l'écran verrouillé
Un bouton vert apparaît sur la carte quand la commande attend au comptoir, et
seulement là. Il ouvre l'app par `breakeat://order/<id>/arrived` ; l'app signale
la présence, le serveur repousse l'état, la carte affiche « Le stand sait que tu
es là ».

Pourquoi un lien et non un bouton interactif (`Button(intent:)`) : une intention
s'exécute hors de l'app, sans sa session. Il faudrait convoyer un jeton
d'authentification jusqu'à l'extension — un secret de plus à faire vivre, pour
gagner une seconde.

`breakeat://` n'était en réalité géré nulle part : le commentaire du widget
affirmait le contraire. Les liens entrants sont maintenant traités pour de bon,
ce qui répare aussi l'appui sur la carte (il ouvre le suivi de la commande).

### Les barres flottantes passaient sous le menu
« Voir mon panier » etait cale a `bottom: 32`. La barre du bas, elle, flotte a
`insets.bottom + 16`, mesure 70 et sa pastille centrale deborde de 37 : elle
occupe donc jusqu'a `insets.bottom + 123`. Le bouton etait entierement dedans.

La geometrie n'est plus recopiee a la main : trois constantes decrivent la barre
(`ECART_BAS`, `HAUTEUR_BARRE`, `DEBORD_PASTILLE`) et alimentent `BOTTOM_BAR_SPACE`
et `useFloatingBarBottom()`. La pastille y est enfin comptee — elle ne l'etait
pas, et mordait la moitie basse du bouton « Choisir un creneau ».

### Refonte visuelle
Rail de progression continu à dégradé (au lieu de trois segments), icône d'état
dans un disque teinté, numéro de commande en pastille, heure de retrait en
chiffres alignés, action pleine largeur. L'île dynamique reprend le bouton.

- `~ backend/src/config` — rien : `APNS_ENV` est un réglage d'environnement
- `~ backend/src/modules/live-activity/apns.service.ts` — hôte tracé, `environmentLabel()`
- `~ backend/src/modules/live-activity/live-activity.service.ts` — `customerArrived` au contrat
- `~ backend/src/modules/orders/orders.service.ts` — l'arrivée repousse l'état
- `~ apps/mobile/targets/live-activity/*` — contrat + refonte de la carte
- `~ apps/mobile/modules/live-activity/*` — le drapeau traverse le pont natif
- `+ apps/mobile/src/lib/hooks/use-deep-links.ts` — liens `breakeat://`
- `~ apps/mobile/src/screens/order-history.screen.tsx` — reprise + balayage
- `~ apps/mobile/src/screens/order-tracking.screen.tsx` — reprise au premier plan
- `~ apps/mobile/src/components/app-bottom-bar.tsx` — geometrie unique de la barre
- `~ apps/mobile/src/screens/supplier-catalog.screen.tsx` — barre de panier remontee
- `~ apps/mobile/src/screens/event-home.screen.tsx` — bandeau de connexion remonte

---

## [0.50.0] — 2026-08-25 — L'accès opérateur : ce n'était pas un mot de passe

### La cause, enfin
`https://breakeat-operator.vercel.app` **est absente de `CORS_ORIGINS`**.
Vérifié par requête preflight : la réponse ne porte aucun
`access-control-allow-origin`, alors que l'admin, le back-office et le mobile
en ont un. Seule l'URL longue `breakeat-operator-git-main-…` est autorisée.

Sur l'adresse courte — la naturelle — le navigateur bloque donc chaque requête
**avant** qu'elle n'atteigne l'API. Et le code attrapait tout :

```ts
if (!res.ok) throw new Error('Identifiants incorrects');
} catch { setError('Identifiants incorrects'); }
```

Mot de passe faux, panne serveur, coupure réseau, rejet CORS : un seul message,
et le plus trompeur possible.

**Coût réel de cette imprécision** : une journée de diagnostic, et une
réinitialisation de mot de passe construite pour un problème qui n'en était pas
un. La fonctionnalité reste utile — le trou était réel — mais elle ne répondait
pas à la panne.

### Chaque échec se nomme désormais
- **401** → « E-mail ou mot de passe incorrect. »
- **Erreur réseau** → l'adresse visée, l'origine appelante, et `CORS_ORIGINS`
  cité explicitement comme cause probable.
- **Autre code** → le statut HTTP et le début de la réponse serveur.

Le formulaire affiche le message **réel** au lieu de le réécrire.

L'e-mail est aussi normalisé (minuscules, sans espaces) : les comptes sont créés
ainsi côté serveur, une majuscule suffisait à faire échouer la comparaison.

⚠️ **Action requise côté Railway** — ajouter l'adresse à `CORS_ORIGINS`. Le code
ne peut pas s'auto-autoriser.

### Coordonnées GPS : une seule saisie
Le formulaire de lieu du back-office avait **deux saisies pour la même donnée** :
un champ « coller depuis Google Maps », puis deux champs
« Latitude (décimal) » / « Longitude (décimal) ». Le premier acceptait le DMS,
les seconds non — taper `43° 16' 6.60" N` dans « Latitude » échouait, alors que
la même valeur collée juste au-dessus passait.

Latitude et longitude passent en **lecture seule** : elles affichent ce qui sera
enregistré, avec un bouton pour effacer. La saisie se fait par le champ de
collage, qui comprend tous les formats.

**Un écran avait été oublié** au passage précédent : le correctif `a8135a4` ne
touchait que la page de *création* d'organisation ; le formulaire de lieu de la
page *détail* gardait son `Number()` et son message périmé. Corriger un écran
sans chercher ses jumeaux — exactement ce que le manuel d'ingénierie reproche.

### Documentation
- **`brain/ROADMAP.md`** — les **phases 11 à 22 sont reconstituées** après coup.
  Elles n'existaient jusqu'ici que dans le changelog, par ordre chronologique :
  un développeur qui reprenait le dossier voyait *ce qui avait été fait*, pas
  *l'arc du produit*. Les chantiers de mise en service d'août y figurent aussi.
- **`REPRISE.md`** — une table **« Où trouver quoi »** en tête, et l'action
  `CORS_ORIGINS` en tête de la reprise immédiate.

### Fichiers
- `~ apps/operator/src/lib/api/orders-client.ts` — chaque échec se nomme
- `~ apps/operator/src/components/LoginForm.tsx` — affiche le message réel
- `~ apps/backoffice/.../organizations/[id]/page.tsx` — saisie GPS unique
- `~ brain/ROADMAP.md` — phases 11→22
- `~ REPRISE.md` — table d'orientation, action CORS

---

## [0.49.0] — 2026-08-25 — Ce qui échoue en silence

### Le fil commun
Quatre correctifs, une même faute sous quatre formes : **une erreur avalée
devient indiagnosticable**. Chaque symptôme rapporté par le client pointait
ailleurs que sa cause.

### « Erreur identifiant » — l'app opérateur appelait la machine du visiteur
Les trois apps web partageaient ce repli :

```
process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'
```

`NEXT_PUBLIC_*` est gravée à la **compilation**. Absente ce jour-là, le repli
local part en production — et l'app déployée tape sur la machine du *visiteur*.
`apps/operator/vercel.json` ne la définissait pas ; admin et back-office s'en
sortaient parce qu'elle avait été posée à la main dans leur projet Vercel.

Le formulaire présentait cet échec réseau comme **« identifiant incorrect »**.
Nous avons cherché du côté des comptes pendant des heures ; le mot de passe n'a
jamais été en cause.

C'est le défaut exact déjà corrigé côté mobile (`05afc62`), jamais reporté sur
les apps Next.js. L'adresse est désormais gravée dans les trois `vercel.json`,
et un filet console se déclenche dès qu'une app servie en ligne vise localhost.

### Remise à zéro des données d'une organisation
`POST /backoffice/organizations/:id/reset-data`, SUPER_ADMIN uniquement.

**Efface** événements, buvettes, comptoirs, commandes, fidélité, notifications —
plus tout ce qui cascade. **Conserve** le lieu (GPS, mots-clés), les accès et les
groupes : sans eux, plus personne ne pourrait se reconnecter pour reconfigurer
après le ménage.

Deux garde-fous : le nom de l'organisation doit être **recopié à l'identique**
(un bouton seul se clique par accident, ou sur la mauvaise ligne), et tout se
joue dans **une transaction** — un échec à mi-parcours laisserait une
organisation à moitié vidée, état pire que celui de départ.

### Suppression définitive d'un compte
Un compte s'archivait mais ne se supprimait jamais. Après vérification, c'était
le **seul** trou réel : événements, buvettes et organisations avaient déjà leur
suppression, interface comprise.

`DELETE /backoffice/users/:id`, refusé sur soi-même, sur le dernier SUPER_ADMIN
actif, et sur tout compte portant des **commandes** — `Order.user` n'a pas de
cascade, la base refuserait de toute façon, et effacer un client retirerait son
chiffre d'affaires de la comptabilité.

### Les rôles portent leur nom
ORG_ADMIN = **Responsable du club**, MANAGER = **Responsable F&B**,
OPERATOR = **Équipier buvette**, MARKETING = **Marketing**.

MANAGER et MARKETING n'avaient aucune étiquette : ces comptes s'affichaient comme
si leur rôle était inconnu. Mêmes libellés des deux côtés — un rôle ne doit pas
changer de nom selon l'écran.

Un **Client** reste affiché, jamais créé depuis le back-office : il s'inscrit
lui-même depuis l'app mobile.

### Coordonnées : accepter ce qu'on colle
Le dashboard manager faisait un simple `Number()`. Coller « 43.296482, 5.369780 »
depuis Google Maps échouait, comme toute notation DMS. Le back-office possédait
déjà un parseur complet — il n'avait jamais été porté.

Désormais : décimal à point ou à virgule, DMS, et une **paire collée dans
n'importe lequel des deux champs se répartit toute seule**. Le geste réel n'est
pas « je tape une latitude », c'est « je copie et je colle ».

Ajout d'un contrôle de bornes : une latitude hors de [-90, 90] signale surtout
deux valeurs inversées, ce que le message dit explicitement.

### Doublons de clubs — un échec partiel jamais repris
La création enchaînait deux écritures sans transaction (organisation, puis lieu)
et validait les coordonnées **après** la première. Une virgule mal placée
suffisait : le club était créé, le lieu échouait. La tentative suivante butait
sur « ce slug existe déjà » — puisqu'il existait. Changer le slug faisait naître
une **seconde** organisation, laissant la première orpheline.

Tout est désormais validé **avant** la moindre écriture, et la création **reprend
là où elle s'est arrêtée** au lieu de refabriquer.

### Fichiers
- `+ backend/src/modules/backoffice/dto/reset-org-data.dto.ts`
- `~ backend/src/modules/backoffice/backoffice.service.ts` — `resetOrgData`, `deleteUser`
- `~ backend/src/modules/backoffice/backoffice.controller.ts` — deux routes
- `+ apps/admin/src/lib/coords.ts` — **jumeau** de celui du back-office
- `~ apps/{admin,backoffice,operator}/vercel.json` — adresse d'API gravée
- `~ apps/{admin,backoffice,operator}/src/lib/api/*-client.ts` — filet localhost
- `~ apps/backoffice/.../organizations/page.tsx` — reprise sur échec partiel
- `~ apps/backoffice/.../users/page.tsx` — suppression + libellés
- `~ apps/admin/.../organizations/[id]/page.tsx` — coordonnées tolérantes
- `~ apps/mobile/PREVIEW.md` — consigne « SDK 53 » périmée, corrigée

### Vérifié
465 tests backend (11 nouveaux sur les garde-fous), admin 21 pages,
back-office 10, opérateur 4.

⚠️ Les interfaces n'ont **pas** été vues dans un navigateur : cela demande une
session authentifiée sur le back-office.

---

## [0.48.0] — 2026-08-25 — Accès opérateur : un compte perdu pour toujours

### Le trou
Aucune réinitialisation de mot de passe n'existait dans le système.

`inviteByEmail` ne pose un mot de passe qu'à la **création** du compte. Dès
qu'une adresse existait déjà, son mot de passe n'était modifiable nulle part —
et réinviter la personne échouait sur « déjà membre ». Un opérateur qui
oubliait son mot de passe devenait définitivement inaccessible, sans aucun
recours dans l'interface.

### La route
`POST /organizations/:id/members/:memberId/reset-password`, calquée sur les
garde-fous de `removeMember` :

- SUPER_ADMIN partout ; sinon ORG_ADMIN de **cette** organisation ;
- un ORG_ADMIN ne peut viser qu'un rôle délégable (**opérateur**) — sans quoi
  il prendrait la main sur le compte d'un autre manager ;
- **jamais sur soi-même**.

Le mot de passe est généré par le **navigateur** et envoyé, comme à
l'invitation : c'est ce qui permet de l'afficher une fois. Le générer côté
serveur obligerait à le renvoyer dans la réponse, donc à le faire transiter par
les journaux en cas de débogage. Le serveur ne renvoie que l'e-mail.

### L'écran qui mentait par omission
L'accueil opérateur faisait `catch { setEvents([]); }` — un jeton expiré, une
organisation inaccessible ou un serveur muet produisaient **le même écran
« aucun événement »**. La panne était indiscernable de la normalité, pour
l'utilisateur comme pour nous : c'est ce qui a rendu ce diagnostic si long.

Trois états distincts désormais : erreur de chargement **avec son message**,
compte rattaché à aucune organisation, et liste réellement vide.

### Aussi
`assertRoleDelegable` accepte une chaîne : le rôle vient tantôt d'un DTO
(énumération de l'app), tantôt d'une ligne Prisma (énumération générée) —
mêmes valeurs, types distincts. Un cast aurait masqué un vrai écart le jour où
elles divergeraient.

### Fichiers
- `+ backend/src/modules/organizations/dto/reset-member-password.dto.ts`
- `~ backend/src/modules/organizations/organizations.service.ts` — `resetMemberPassword`
- `~ backend/src/modules/organizations/organizations.controller.ts` — la route
- `~ apps/admin/src/lib/api/admin-client.ts` — `apiResetMemberPassword`
- `~ apps/admin/src/app/(admin)/team/page.tsx` — bouton « Mot de passe »
- `~ apps/operator/src/app/page.tsx` — trois états au lieu d'un écran vide

### Vérifié
455 tests backend (6 nouveaux sur les garde-fous), admin 21 pages, operator 4.
⚠️ Le bouton n'a **pas** été vu dans un navigateur : cela demande une session
authentifiée sur le back-office.

### Connu, non corrigé
**Le wizard empile.** Il réutilise le lieu mais **recrée** événement, buvettes,
points de retrait, catégories et produits à chaque passage. D'où l'impression
que « rien ne s'enregistre » : les modifications le sont, dans un ensemble neuf,
pendant que l'app pointe vers l'ancien.
---

## [0.47.0] — 2026-08-25 — Expo SDK 53 → 57 (React Native 0.79.6 → 0.86.2)

### Pourquoi
Apple a rejeté la soumission TestFlight (ITMS-90725) : le SDK iOS 26 est
désormais obligatoire. Or Xcode 26 ne compile pas le `fmt` embarqué par React
Native 0.79 — `call to consteval function … is not a constant expression`.
Aucun contournement côté projet : monter le SDK était la seule voie.

SDK 57 plutôt qu'un saut minimal en 54 : les étapes intermédiaires auraient
coûté la même vérification, pour un socle déjà ancien.

### Trois ruptures, toutes silencieuses

**`@bacons/apple-targets` perdait `@expo/plist`.** Le paquet fait
`require('@expo/plist')` sans le déclarer — il comptait sur le hoisting de
npm/yarn. Le SDK 57 ne le fournit plus par transitivité, et pnpm n'expose que
le déclaré. Le plugin échouait alors **sans casser la build** : plus de cible
Xcode pour l'extension Live Activity, écrite en phase 21. Réparé via
`packageExtensions` dans `pnpm-workspace.yaml`, qui ajoute la dépendance au
manifeste du tiers.

**`@react-native/typescript-config` 0.86** publie une carte `exports` qui
n'expose plus le chemin profond `/tsconfig.json`. L'`extends` échouait sans
bruit et `tsc` repartait sur ses défauts — ni `jsx`, ni `esModuleInterop`, ni
`lib`. Le spécificateur nu passe par `exports["."]`.

**Le preset Jest de React Native** a déménagé dans `@react-native/jest-preset`.

### Ce que le SDK 57 a invalidé sans prévenir

`splash` a été **retiré de la racine du schéma**. La clé était ignorée sans le
moindre avertissement : l'app aurait démarré sur l'écran blanc par défaut,
logo compris. La configuration passe par le plugin `expo-splash-screen`, qui
n'était même pas installé.

`expo-modules-core` et `@expo/config-plugins` ne doivent plus être des
dépendances directes — le SDK les réexporte, et une copie à part diverge du SDK
au premier décalage. `requireOptionalNativeModule` vient d'`expo`, le type
`EventSubscription` de `react-native` qui l'expose depuis la 0.86.

### Décisions
- **Plancher iOS 16.4** — imposé par le SDK 57, qui refuse toute valeur en
  deçà. Reste sous le minimum 16.6 de l'app publiée : aucun utilisateur exclu.
- **TypeScript reste en 5.8.3.** Expo recommande la 6.0.3, mais les 7 paquets
  du monorepo la partagent ; en faire diverger le seul mobile créerait deux
  versions concurrentes. Ajouté à `expo.install.exclude` pour acter le choix.
- **`app.json` laissé en place** — il ne sert qu'à la CLI React Native
  (`name`/`displayName`) et n'est pas lu par `app.config.js`. Même famille de
  piège qu'`App.tsx` : présent, mais absent de tout ce qui est livré. Seul
  avertissement `expo-doctor` restant, assumé.

### Fichiers
- `~ apps/mobile/package.json` — SDK 57, RN 0.86.2, React 19.2.3, `@react-native/*` alignés en 0.86.2
- `~ apps/mobile/app.config.js` — plugins `expo-font` / `expo-splash-screen` / `expo-build-properties`, plancher iOS 16.4
- `~ apps/mobile/tsconfig.json` — `extends` via le spécificateur nu
- `~ apps/mobile/plugins/withLiveActivity.js` — `expo/config-plugins`
- `~ apps/mobile/modules/live-activity/index.ts` — imports rebranchés
- `~ pnpm-workspace.yaml` — `packageExtensions` pour `@expo/plist`

### Vérifié
Typecheck mobile, export web (1,5 Mo), admin 21 pages, backoffice 10 pages,
operator 4 pages, 449 tests backend, `expo-doctor` 20/21.
---

## [0.46.0] — 2026-08-24 — Test réel : rendre le parcours atteignable

### Objectif
Passer du « ça compile » au « ça s'utilise ». Une série de défauts empêchait tout test en conditions réelles, chacun masquant le suivant.

### Le parcours de commande était inaccessible
`App.expo.tsx` — le fichier que **toutes** les builds embarquent — enregistrait un `EventHomeStub` à la place du vrai écran. Cliquer sur un lieu ouvrait un placeholder : ni points de retrait, ni carte, ni commande. Le vrai écran existait depuis longtemps, jamais relié.

C'est aussi ce qui donnait l'impression qu'aucune configuration ne s'enregistrait : le lieu était bien configuré, l'app n'avait aucun écran pour le montrer.

### L'app appelait l'IP du poste de développement
Trois causes empilées, toutes avec le même symptôme (`Failed to fetch`) :

1. `CORS_ORIGINS` contenait une entrée malformée — deux URL collées par un `/`.
2. `expo export` tournait **sans `--clear`** : Metro inline `EXPO_PUBLIC_*` puis met le résultat en cache. Définir la variable sur Vercel ne changeait donc rien au bundle produit.
3. La variable n'existait pas dans le projet Vercel. Elle est désormais gravée dans `apps/mobile/vercel.json` — publique par nature.

`env.ts` refuse maintenant de démarrer une build empaquetée sans adresse explicite, plutôt que de retomber en silence sur une IP locale.

### Alertes muettes
`Alert.alert` de React Native **ne fait rien sur le web**. Sept appels en dépendaient, dont « Email ou mot de passe incorrect » et « Impossible de passer la commande ». L'app paraissait morte là où elle refusait une action.

### Découverte des lieux — deux chemins, deux seulement
Sans position **et** sans recherche, aucun filtre ne s'appliquait : l'API renvoyait tout le catalogue. Un troisième chemin non voulu, et trompeur.

La règle est rétablie : proximité dans 10 km, ou recherche par mot-clé configuré sur le dashboard. Une recherche l'emporte sur la distance — chercher un nom exact doit le trouver, à 2 comme à 400 km.

### Faux événements
La section « À venir » affichait trois matchs écrits en dur, avec des photos aléatoires. Ils n'existaient dans aucune base : aucun écran d'administration ne pouvait les supprimer.

### Aussi
- Identifiants alignés sur l'app publiée (`com.shapper.breakeat`) — une build créait sinon une **nouvelle** application au lieu d'une mise à jour.
- Sentry conditionné au jeton et non à `APP_ENV` : toute build « production » sans `SENTRY_AUTH_TOKEN` échouait pendant Gradle.
- Titres de section en orange dans les deux dashboards ; menu regroupé par objet ; « Buvettes » devient « Points de retrait ».
- Suppression d'un point de retrait et archivage/suppression d'un événement — **refusés** dès qu'une commande existe.
- Deux liens vers le poste opérateur pointaient sur `localhost:3002`.

### Vérifications
449 tests backend · typecheck et lint des cinq paquets · builds web et dashboards.

---

## [0.45.0] — 2026-08-17 — Environnement Beta séparé de la production

### Objectif
Pouvoir faire tester la nouvelle app sans écrire dans les données réelles.

Le cloisonnement repose sur un fait simple : **l'adresse du backend est compilée dans chaque build**. Une build Beta ne connaît pas l'adresse de la production, elle en est donc incapable de l'atteindre.

- Profils EAS distincts (`development` / `beta` / `preview` / `production`), chacun portant son adresse **en toutes lettres**. Plus de valeur par défaut partagée : les confondre demande un geste délibéré.
- `.env.example` pour le backend et le mobile — noms de variables uniquement.
- `GUIDE_DEVELOPPEMENT/ENVIRONNEMENT_BETA.md` : mode d'emploi Railway, tableau des variables, pièges (base distincte, `JWT_SECRET` différent, `DEMO_MODE` à retirer).
- `autoIncrement` sur `beta` et `production` : deux envois de suite portaient le même numéro, et le second était refusé.

**Non traité, documenté comme tel** : PaymentSheet mobile n'existe pas, `charge.refunded` n'est pas écouté, et le service staging reste à créer sur Railway.

---

## [0.44.0] — 2026-08-12 — Phase 22 : lieux ouverts en continu

### Objectif
Un stade vend par match. Un restaurant, une cantine d'entreprise ou un point de vente d'aéroport vendent tous les jours. Leur imposer un événement daté — donc un par jour — rendait la configuration absurde.

### Décision : garder `Event`, le rendre invisible
`Order.eventId` et `Cart.eventId` sont obligatoires, et huit tables dépendent d'`Event`. Le supprimer aurait signifié réécrire le cœur du parcours de commande pour un gain visible nul.

Le lieu porte désormais son **rythme d'exploitation** (`Venue.operatingMode`). En `PERMANENT`, Break Eat crée tout seul **un contenant unique et sans fin** pour porter les commandes.

Ce contenant est invisible par construction : écarté des listes d'événements et des statistiques, refusé par toute mutation. Le renommer ou le clore priverait le lieu de son seul point d'ancrage. Un index unique partiel impose un seul contenant par lieu, au niveau de la base.

Repasser en `EVENT_BASED` ne le supprime jamais : des commandes y sont rattachées. Il devient dormant.

### Aussi
- Le wizard saute « Événement » et « Créneaux » en mode continu, et affiche 4 étapes au lieu de 6.
- Statistiques **par période** (jour / semaine / mois), avec les tranches vides conservées — un jour sans vente est une information.
- Le contenant reste accessible au **poste opérateur** (`?includePermanent=true`) : sans quoi un restaurant n'offrirait aucun tableau de commandes.

---

## [0.43.2] — 2026-08-12 — Audit Codex : atomicité de la fidélité

### Le point grave
Le service lisait le solde puis écrivait une valeur absolue. En *read committed* (défaut PostgreSQL), deux commandes simultanées lisent le même solde : au crédit l'une écrase l'autre, au débit les deux passent le contrôle et **dépensent les mêmes points deux fois**.

Le calcul est rendu à la base : `increment` au crédit, et au débit un `updateMany` dont le `WHERE` porte `balance >= points` — contrôle et prélèvement en une seule instruction.

### Règle du montant nul
L'app laissait la remise couvrir 100 % du panier tandis que le serveur refusait tout total à zéro : un client ayant assez de points restait bloqué au dernier écran. La remise laisse désormais toujours `MIN_PAYABLE_CENTS` à payer, seuil sous lequel le paiement refuse de toute façon.

### Aussi
- `markCustomerArrived` ne distingue plus 404 et 403 — l'écart révélait l'existence d'une commande à qui n'y a pas droit.
- Le board opérateur reçoit une **sélection explicite** de champs : un champ ajouté un jour à `Order` n'atterrira plus sur un écran partagé sans décision.
- 15 tests de fidélité (le module n'en avait aucun), 5 sur `customer_arrived`, contrat realtime et modèle métier mis à jour.

**Non retenu** : l'audit signalait la phase 21 non commitée. Elle l'était depuis `0bf0931`.

## [0.43.1] — 2026-08-11 — Phase 21 : Live Activity iOS

### Objectif
Suivre sa commande sur l'écran verrouillé et dans la Dynamic Island, sans rouvrir l'application. Contrainte posée dès la spécification : **événementiel, pas de sondage**.

### Backend (vérifié)
- Client **APNs HTTP/2** sans dépendance, JWT ES256 signé avec le module `crypto` de Node. `dsaEncoding: 'ieee-p1363'` est indispensable : le DER par défaut est rejeté par Apple.
- Appel **direct** à Apple, pas Expo Push : le topic `<bundleId>.push-type.liveactivity` et l'en-tête `apns-push-type: liveactivity` ne passent pas autrement.
- **Webhook Flaix** signé HMAC-SHA256 sur le corps brut, comparaison en temps constant, anti-rejeu 5 minutes, idempotence par `eventId`.
- Tables `LiveActivity` et `FlaixWebhookEvent`. Endpoint de diagnostic `apns-health`, qui distingue une clé fausse d'un jeton d'appareil factice.
- **Deux sources, un seul pipeline** : transitions Break Eat (actif) et webhooks Flaix (prêt, en attente du contrat).

### Natif (écrit, jamais compilé)
Extension WidgetKit SwiftUI (écran verrouillé + trois vues Dynamic Island), module Expo local, config plugin (`NSSupportsLiveActivities`, `aps-environment` déduit d'`APP_ENV`, cible iOS 16.2).

⚠️ `expo prebuild -p ios` ne tourne pas sous Windows et **aucun build iOS n'a été lancé**. Une Live Activity ne fonctionne ni en simulateur ni dans Expo Go.

### Aussi
Module `bootstrap` : reprise de l'accès principal par une route inerte tant qu'`ADMIN_BOOTSTRAP_SECRET` n'est pas défini (404, comparaison à temps constant, secret d'au moins 24 caractères).

---

## [0.43.0] — 2026-08-11 — Phase 20 : Programme de fidélité (gain + utilisation)

### Objectif
Permettre à un club d'activer un programme de points : le client en gagne sur ses commandes et peut les convertir en réduction. Implémentation **réelle** (pas de mode démo) — seul le branchement Stripe reste à faire.

### Modèle
- `+` backend/prisma/migrations/20260728_phase20_loyalty/migration.sql (UUID/`gen_random_uuid()` — convention des tables existantes ; du TEXT rendait les FK impossibles)
- `~` backend/prisma/schema.prisma — `Venue.loyaltyEnabled` / `loyaltyPointsPerEuro` / `loyaltyPointValueCents` (config **par lieu**) ; `LoyaltyAccount` (solde **par organisation**) ; `LoyaltyTransaction` + enum `LoyaltyEntryKind` (registre immuable, `@@unique([orderId, kind])`) ; `Cart.redeemedPoints` ; `Order.discountCents` / `pointsRedeemed` / `pointsEarned`

### Backend
- `+` backend/src/modules/loyalty/{loyalty.service.ts, loyalty.controller.ts, loyalty.module.ts, loyalty.mock.ts}
- `+` backend/src/modules/cart/dto/redeem-points.dto.ts
- `~` backend/src/modules/cart/cart.service.ts — totaux remisés dans `computeView`, `setRedeemedPoints`, débit dans la transaction de `demoCheckout`
- `~` backend/src/modules/cart/cart.controller.ts — `PATCH /carts/:id/loyalty-points`
- `~` backend/src/modules/orders/orders.service.ts — gain à `PICKED_UP` (`awardLoyaltyPoints`) ; **contrôle défensif Stripe recalculé sur le total remisé** + débit dans la transaction de `createFromPaymentIntent`
- `~` backend/src/modules/venues/{dto/create-venue.dto.ts, dto/update-venue.dto.ts, venues.service.ts} — champs de config
- `~` backend/src/app.module.ts, modules/{cart,orders}/*.module.ts — câblage `LoyaltyModule`
- `~` 3 specs (`cart.service`, `orders.service`, `order-loss`) — `loyaltyDisabledProvider` partagé

### Admin
- `~` apps/admin/src/app/(admin)/organizations/[id]/page.tsx — bloc « Activer le programme de fidélité » + taux (points/euro, valeur du point), bornes ≥ 1
- `~` apps/admin/src/lib/api/admin-client.ts — champs `loyalty*` sur `Venue`/`VenueInput`

### Mobile
- `~` apps/mobile/src/screens/checkout.screen.tsx — section « Mes points » (solde, interrupteur, réduction, points à gagner) + total détaillé sous-total/remise/dû
- `~` apps/mobile/src/lib/api/mobile-api.ts — `apiGetLoyaltyStatus`, `apiSetCartPoints`, `LoyaltyStatus`, `BackendCart.loyalty`
- `~` apps/mobile/src/store/cart.store.ts (+`venueId`), src/screens/event-home.screen.tsx

### Invariants tenus (à vérifier en audit)
- Solde jamais négatif — contrôlé **au débit**, pas seulement à la saisie.
- Une commande ne crédite qu'une fois et ne débite qu'une fois (`@@unique([orderId, kind])`) → rejeu sans effet.
- Remise plafonnée au montant du panier ; ne consomme que les points nécessaires.
- Points gagnés sur le montant **réellement payé** (remise déduite).
- Gain à la **récupération** (PICKED_UP), pas au paiement : une commande annulée avant retrait ne rapporte rien.
- `balance` (cache) et le registre écrits dans la **même** transaction.

### Vérifs
- Bout en bout sur backend local : activation via API admin (2 pts/€, 1 c/point) ; commande 250 c récupérée → +5 pts (`Order.pointsEarned = 5`) ; panier 500 c avec 5 pts → remise 5 c → payé 495 c, solde 5 → 0 ; 9999 pts avec solde 0 → 400 ; points négatifs → 400 ; **solde en cache == somme du registre**.
- typecheck backend/admin/mobile **0** · lint **0** · jest **336/336** · `expo export -p web` OK.

### Reste
- Branchement Stripe réel (le contrôle défensif et le débit transactionnel sont déjà en place).
- ⚠️ L'écran de paiement n'a **pas** été vérifié visuellement : `EventHome` est stubbé dans `App.expo.tsx`, le parcours d'achat n'est donc pas atteignable en preview web.

---

## [0.42.0] — 2026-08-10 — Phase 19 : état live des commandes + « Je suis arrivé »

### Module C — état live dans « Mes commandes »
- `~` apps/mobile/src/screens/order-history.screen.tsx — 3 étapes visibles (Reçue → Préparation **orange** → Prête **vert**), barre de progression, pastille de statut, créneau de retrait affiché, rafraîchissement auto 10 s **uniquement s'il reste une commande en cours**, badge « en direct ». Passage à la typo Raleway (`HEAD.*`).
- `~` backend/src/modules/orders/orders.controller.ts — `GET /orders` et `/orders/:id` exposent le créneau (`CUSTOMER_SLOT_SELECT` : id/startAt/endAt/label/status seulement — `capacity`/`currentLoad` restent internes)
- `~` apps/mobile/App.expo.tsx — `OrderTracking` n'est plus stubbé (aucune dépendance native ; taper une commande menait à « Aperçu non disponible »)

### Module A — « Je suis arrivé »
- `+` backend/prisma/migrations/20260728_phase19_order_customer_arrived/migration.sql
- `~` backend/prisma/schema.prisma — `Order.customerArrivedAt` (horodatage et non booléen : la buvette peut trier par ancienneté d'attente)
- `~` backend/src/modules/orders/orders.service.ts — `markCustomerArrived` : propriétaire uniquement, refuse une commande terminée (400), **idempotent**, **ne change pas le statut**
- `~` backend/src/modules/orders/orders.controller.ts — `POST /orders/:id/arrived`
- `~` backend/src/modules/realtime/realtime.service.ts — événement **dédié** `customer_arrived` (et non `order_updated` : le board applique une maj optimiste sur `nextStatus` et ignorerait une transition vide)
- `~` apps/operator/{src/components/OrderCard.tsx, src/hooks/useDashboard.ts, src/lib/realtime/socket-client.ts, src/app/globals.css, src/app/dashboard/[eventId]/page.tsx} — carte qui pulse en orange (`.breakeat-arrived`, neutralisée sous `prefers-reduced-motion`) + encart « Client présent · X min »
- `~` apps/mobile/src/screens/order-history.screen.tsx — bouton orange tant que la commande est en cours, maj optimiste + rollback si échec

### Note Flaix
`FLAIX_CONTRACT.md` attribue les dashboards opérateur à Break Eat et ne définit **aucune** décision « client arrivé » ; l'API Flaix n'est pas branchée. La fonctionnalité est donc 100 % Break Eat ; prévenir Flaix en plus pourra se greffer sur `markCustomerArrived`.

### Vérifs
- Bout en bout (backend local + preview web) : statut PAID → PREPARING → READY **sans action utilisateur** (poll 10 s), couleurs mesurées `rgb(252,64,2)` / `rgb(22,163,74)`, créneau « Retrait 16:34 – 16:54 », clic « Je suis arrivé » → badge + `customer_arrived_at` persisté, 2ᵉ POST = même horodatage, 400 sur commande récupérée.
- typecheck backend/mobile/operator **0** · lint **0** · jest orders+realtime **107/107**.

---

## [0.41.1] — 2026-07-25 — Outillage : lancement local en un double-clic
- `+` demarrer-local.bat — démarre Docker (Postgres/Redis) + backend (3000) + manager (3001) + back-office (3003) dans des fenêtres indépendantes. Contexte : l'essai Railway a expiré, le développement se fait en local (cf. `REPRISE.md`).

---

## [0.41.0] — 2026-07-25 — Phase 18 : Plan des buvettes par lieu

### Objectif
Associer à chaque lieu un **plan des buvettes** (image créée sur Canva puis hébergée), affiché dans l'app pour aider le client à localiser la/les buvette(s). Deux emplacements : pastille sur la carte du lieu (découverte) + bouton sur la confirmation de commande. Viewer plein écran zoomable.

### Backend
- `~` backend/prisma/schema.prisma (`Venue.buvettePlanUrl`)
- `+` backend/prisma/migrations/20260725_phase18_venue_buvette_plan/migration.sql (`ALTER TABLE venues ADD COLUMN buvette_plan_url`)
- `~` backend/src/modules/venues/dto/create-venue.dto.ts, update-venue.dto.ts (`buvettePlanUrl?`)
- `~` backend/src/modules/venues/venues.service.ts (create + update)
- `~` backend/src/modules/venues/public-venues.controller.ts (select + sortie `buvettePlanUrl`)
- `~` backend/src/modules/events/public-events.controller.ts (`venue.buvettePlanUrl`)

### Admin
- `~` apps/admin/src/lib/api/admin-client.ts (`Venue`/`VenueInput` + `buvettePlanUrl`)
- `~` apps/admin/src/app/(admin)/organizations/[id]/page.tsx (champ « Plan des buvettes (URL) »)

### Mobile
- `+` apps/mobile/src/components/buvette-plan-viewer.tsx (Modal plein écran, ScrollView pinch-zoom iOS, web-safe)
- `~` apps/mobile/src/lib/api/mobile-api.ts (`PublicVenue.buvettePlanUrl` + `PublicEvent.venue.buvettePlanUrl`)
- `~` apps/mobile/src/screens/venue-discovery.screen.tsx (renommage « Lieux près de toi », CTA plan sous la carte, cartes de taille égale, cœur = CTA favori, « Gérer » retiré)
- `~` apps/mobile/src/screens/order-confirmation.screen.tsx (bouton « Voir le plan des buvettes »)
- `~` apps/mobile/src/store/cart.store.ts (`venueBuvettePlanUrl`, `initCart` 3ᵉ arg)
- `~` apps/mobile/src/screens/checkout.screen.tsx, event-home.screen.tsx, navigation/root-navigator.tsx (transport du plan jusqu'à la confirmation)

### Vérifs
- tsc backend/admin/mobile **0**, `expo export -p web` ✓, rendu web du CTA + viewer validé (pastille, ouverture plein écran, alignement des cartes 210px).
- ⚠️ **Démo** : les lieux de l'accueil sont encore des placeholders → le plan affiché vient de `placehold.co`. La plomberie backend/admin est réelle (le vrai plan remontera quand l'accueil sera câblé sur `/public/venues`).

---

## [0.40.0] — 2026-07-04 — Build iOS interne (EAS) + résolution de la saga des crashs

### Objectif
Livrer une **app iOS de test** installable via QR code (distribution interne, sans Mac, sans App Store) et faire qu'elle **s'ouvre** (série de crashs au démarrage).

### Cause racine des crashs (documentée dans REPRISE.md)
1. **Install pods KO** : `react-native-screens` résolvait en 4.25.2 (plage ouverte) → codegen incompatible RN 0.79 → versions alignées sur Expo SDK 53.
2. **Crash après splash #1** : composant racine enregistré sous `appName` (« BratEat ») au lieu de « main » attendu par l'AppDelegate → `registerRootComponent`.
3. **Crash après splash #2 (le vrai)** : **2 copies de React** dans le bundle (hoist pnpm) → `useState of null` dans `useFonts` → **singletons forcés dans `metro.config.js`**.

### Fichiers
- `~` apps/mobile/metro.config.js (`resolveRequest` : react/react-dom/react-native forcés depuis apps/mobile) — **fix principal**
- `~` apps/mobile/index.expo.js, index.js (`registerRootComponent` + garde-fou try/catch)
- `+` apps/mobile/src/components/crash-guard.tsx (ErrorBoundary + handler global `ErrorUtils` → écran d'erreur au lieu de crash)
- `~` apps/mobile/src/instrument.ts (`Sentry.init` en try/catch)
- `~` apps/mobile/src/navigation/root-navigator.tsx (QRScanner lazy via `getComponent`)
- `~` apps/mobile/package.json (deps alignées SDK 53 : react 19.0.0, react-native 0.79.6, screens ~4.11.1, safe-area ~5.4.0, async-storage ~2.1.2, @sentry/react-native ~6.14.0 ; `expo.install.exclude` = @types/react)
- `~` apps/mobile/app.config.js (icône/splash = logo-mark-orange, Sentry plugin prod-only, EAS projectId + owner break-eat-app-spe)
- `~` apps/mobile/eas.json (profil preview interne, appleTeamId 2A5L298Q4C)

---

## [0.39.0] — 2026-07 — Hébergement Vercel + typographie Raleway + refonte nav mobile

- **Migration Netlify → Vercel** (app web + admin) : `+` apps/mobile/vercel.json (SPA rewrites, region cdg1), `~` scripts/fix-web-assets.cjs (assets `.pnpm` → `/vendor` pour hôte statique), CORS backend + URL Vercel.
- **Typographie Raleway** : `~` apps/mobile/src/lib/theme.ts (`HEAD` Raleway, `BLOC` Oswald), `~` App.expo.tsx + App.tsx (chargement polices + défaut Raleway_500Medium), tous les écrans `FONT.*` → `HEAD.*`. `~` login.screen.tsx (Fredoka → Raleway).
- **Refonte nav mobile** : Panier en bas, Menu dans le bandeau orange, cœur favori sur les cartes, données d'accueil (favoris + à venir), flèche retour partout.

---

## [0.38.0] — 2026-06/07 — Phases 16-17 : découverte des lieux (géoloc) + back office SUPER_ADMIN

### Phase 16 — Découverte des lieux (mobile)
- `~` backend/prisma/schema.prisma + migrations `20260624_phase16_venue_geo`, `20260628_phase16_2_venue_search_terms`, `20260628_phase16_3_venue_flaix` (`latitude`/`longitude`, `searchTerms`, `flaixEnabled`/`flaixVenueId`).
- `+` backend/src/modules/venues/public-venues.controller.ts (`GET /public/venues?q=&lat=&lng=&radiusKm=`, Haversine, tri proximité, **lieux privés masqués côté serveur**).
- `~` apps/mobile/src/screens/venue-discovery.screen.tsx (recherche + géoloc), `src/lib/hooks/use-user-location.ts`, `src/lib/api/mobile-api.ts` (`apiSearchVenues`, `PublicVenue`).
- Handoff Flaix stubbé + demande de localisation au démarrage.

### Phase 17 — Back office SUPER_ADMIN (`apps/backoffice`, port 3003)
- Création club + lieu en un formulaire, logo club, **notifications push** (composer + programmées : `ScheduledNotification`), **suppression d'org**, **utilisateurs + groupes** CRUD, parser coordonnées GPS (DMS + décimal), rayon 10 km.
- Migration `20260628_phase17_scheduled_push_backoffice`.

### Note
Détail fichier par fichier de 16-17 non reconstitué ici (voir git : commits `d70c463` → `984218a`). Les phases 18, iOS et Vercel ci-dessus sont, elles, exhaustives.

---

## [0.37.0] — 2026-06-15 — Bloc B (pages, retraits, créneaux) + C4 (parrainage exploitant)

### Bloc B — Configuration enrichie
- **Pages multiples dans l'app** (B1) : le modèle `HomeAppearance` accepte désormais `pages: AppPage[]` (illimité). Nouveau type d'action carte `'page'` (ouvre une page in-app) en plus de `'url'` (Instagram, YouTube…). Éditeur admin : section « Pages secondaires » + composant `CardEditor` réutilisable + aperçu multi-écrans. Mobile : navigation interne entre accueil et pages dans `AppearanceHome`.
- **1–4 points de retrait par buvette** (B2) : `pickup-points.service` plafonne à 4 par supplier/event + endpoint DELETE (refusé si commandes liées). Event page : select buvette + suppression + regroupement visuel.
- **Créneaux personnalisables / illimités** (B3) : générateur en lot (N créneaux consécutifs de durée fixe) sur la page événement, en plus de l'ajout unitaire. Aucune limite de nombre.

### Bloc C4 — Exploitant externe (code de parrainage)
- Schéma : `Supplier.isExternal` + `Supplier.referralCode` (unique). Migration appliquée en SQL (drift PK pré-existant → ALTER direct).
- Backend : génération de code `BE-XXXXXX` unique, endpoints `POST /suppliers/:id/referral` (régénérer) et `GET /suppliers/referral/:code` (lookup).
- Admin : checkbox « Exploitant externe » à la création + carte « Parrainage » (affichage/copie/régénération du code) + badge dans la liste.

### Bloc C — fondation push Expo (canal choisi par le client)
- **Backend** `NotificationsModule` : `ExpoPushService` (envoi via l'API Expo, batches de 100, purge des jetons invalides), `PushTokensService` + endpoints `POST/DELETE /push-tokens`. Table `push_tokens` (migration SQL directe) + modèle Prisma `PushToken`. Test unitaire vert.
- **Mobile** : `apiRegisterPushToken` / `apiUnregisterPushToken` (sans dépendance native).
- ⚠️ **App mobile = React Native bare** (pas Expo-managed) : l'obtention du jeton Expo nécessite d'installer les modules Expo + config FCM (Android) / APNs (iOS) + rebuild natif — étape côté client avant activation.

### Bloc C — logique livrée (C1, C2, C3) sur la fondation Expo
- **C1 — Notifs par étape** : `OrderNotificationsService` envoie un push au client à chaque transition de commande, selon des modèles éditables (clé app-settings `app.notifications`). Hook dans `OrdersService.transition` (fire-and-forget). Page admin **Notifications** (toggle + titre/message par étape, variable `{orderNumber}`).
- **C2 — Push programmés** : modèle `ScheduledPush` + cron `@nestjs/schedule` (chaque minute) qui envoie les pushs dont l'heure est passée. Endpoints CRUD + page admin **Campagnes & push** (date/heure, ciblage org ou événement, multiples).
- **C3 — Campagne -50 % auto** : même système, `kind=DISCOUNT_CAMPAIGN` + `discountPercent` ; déclenchement auto à l'heure (ex. fin de match) → push d'annonce. ⚠️ L'**application réelle de la remise au panier** se branche au checkout (invariant Stripe) — pièce de suivi identifiée, non incluse.

### Reste (suivi)
- Application de la remise C3 au checkout (cart → snapshot prix → PaymentIntent).
- Mobile : setup natif Expo (modules + FCM/APNs + rebuild) puis `registerForPushNotificationsAsync` → `apiRegisterPushToken`.

---

## [0.36.0] — 2026-06-12 — Bloc A : Comptabilité + images produits + opérateur amélioré

### Nouvelles fonctionnalités
- **Section Comptabilité** (`/accounting`) : CA TTC, CA HT, TVA collectée (10 %), panier moyen, tableau détaillé par événement. Accessible depuis le groupe "Pilotage" de la nav (icône Receipt).
- **Images produits** : champ URL dans le formulaire de création produit (aperçu live). Thumbnail affiché dans la liste. `apiCreateProduct` accepte `imageUrl?`.
- **Opérateur — résumé produits par colonne** : bandeau "Coca-Cola ×8 · Hot-Dog ×3" en tête de chaque colonne du board — vue d'ensemble de ce qu'il y a à préparer.
- **Zone de préparation supprimée** de l'UI buvettes (champ retiré du formulaire création + page détail). Le champ reste en base pour compatibilité.

### Corrections
- Mot de passe `admin@breakeat.test` réinitialisé directement en base (argon2id).
- `apiCreateProduct` : signature étendue avec `imageUrl?: string`.

---

## [0.35.0] — 2026-06-08 — « Apparence de l'app » v2 : Flaix toggle, réordonnancement cartes, Jost, wording optionnel

### Contexte
Spec complète du client pour le configurateur d'écran d'accueil :
police Jost pour les descriptions, aucun wording obligatoire (icône/image seule valide), réordonnancement des cartes (↑/↓), toggle Flaix (désactive l'interface et passe la main à Flaix — plan du stade), mise à jour mobile.

### Admin — appearance/page.tsx — 6 améliorations
~ `apps/admin/src/app/(admin)/appearance/page.tsx`
  - **Toggle Flaix** : carte dédiée « Intégration Flaix » avec switch ON/OFF animé + description complète (Phase 11.5 à venir).
  - **Réordonnancement cartes** : boutons ▲/▼ sur chaque carte ; `moveCard(id, dir)` swap propre dans le tableau.
  - **Wording non-obligatoire** : `addCard` crée avec `title: ''` ; input `placeholder="Titre (optionnel)"` ; le preview masque le `<div>` si le titre est vide → carte icône-seule ou image-seule valide.
  - **Normalisation** : `flaixTakeover: v.flaixTakeover ?? false` ajouté dans le bloc de chargement (compat configs antérieures).
  - **Sous-titre en Jost** dans le preview (`var(--font-jost), "Jost", sans-serif`, weight 400).
  - **`patchFlaix(v)`** helper pour mettre à jour `appearance.flaixTakeover`.
~ `apps/admin/src/app/layout.tsx` — chargement de la police **Jost** (Google Fonts, subsets latin, weights 300/400/500/600, variable `--font-jost`) aux côtés d'Inter.

### Mobile — types + chemin Flaix
~ `apps/mobile/src/lib/api/mobile-api.ts` — `flaixTakeover?: boolean` ajouté à `HomeAppearance`.
~ `apps/mobile/src/screens/event-home.screen.tsx` — si `appearance.flaixTakeover === true`, affiche un écran placeholder « Plan du lieu / Intégration Flaix à venir » (Phase 11.5) avant de tomber sur l'AppearanceHome standard.

### Reste (prochaine itération)
- Cartes icône côté app (lucide-react-native — module natif, rebuild requis).
- Upload d'image (S3/local — URL en attendant).
- Écran carte/menu style Burger King (2ᵉ écran).
- Phase 11.5 — intégration SDK Flaix (attendu côté Flaix).

---

## [0.34.0] — 2026-06-08 — « Apparence de l'app » : éditeur de cartes (accueil) + branding exposé à l'app

### Contexte
Point 3 du plan (brancher le branding sur l'app), élargi par le client en un **configurateur d'écran d'accueil** : le manager compose des cartes (icône OU image, couleurs, taille, disposition), avec presets par type de lieu. Choix validés : **les deux écrans** (accueil d'abord), styles **globaux + surcharge par carte**, image par **upload** (infra de stockage à venir ; URL en attendant).

### Admin — éditeur « Apparence de l'app » (accueil) — aligné sur le cahier des charges client
+ `apps/admin/src/app/(admin)/appearance/page.tsx` — éditeur avec **aperçu live** (maquette téléphone) :
  - **En-tête configurable** : logo centré (toggle), **titre MAJUSCULE**, **sous-titre minuscule**, couleurs titre/sous-titre (cf. maquettes Le Mans FC / BoursoBank).
  - **Cartes** : 3 visuels — **texte seul** (ex. TRIBUNE NORD/SUD/EST/OUEST en doré), **icône** (set Lucide fourni), ou **image** (photo plein cadre + titre en surimpression). Surcharge couleur texte/icône par carte.
  - **Disposition** : 1 colonne (vertical) ou 2 côte à côte ; taille de carte sm/md/lg.
  - **Presets** : Stade (cartes texte tribunes), Restauration entreprise (cartes photo), Festival/Concert (cartes icône) — points de départ à affiner ensemble.
  - Sauvegarde/chargement en app-settings (`app.appearance.home`, ORGANIZATION) ; **normalisation** au chargement (compat configs antérieures).
~ `apps/admin/src/app/(admin)/layout.tsx` — item **« Apparence de l'app »** (`Palette`) dans Configuration.

### Backend — branding + apparence exposés à l'app cliente
~ `backend/src/modules/events/public-events.controller.ts` — `GET /public/events/:id` renvoie `branding { primaryColor, logoUrl }` (événement puis org en fallback) + `appearance` (config `app.appearance.home` de l'org, ou `null`). **Vérifié live** (4 cartes + titre).

### App mobile — RENDU de l'écran d'accueil configurable (boucle fermée)
~ `apps/mobile/src/lib/api/mobile-api.ts` — types `HomeAppearance`/`AppCard`/`AppCardAction` + `branding`/`appearance` sur `PublicEvent`.
~ `apps/mobile/src/screens/event-home.screen.tsx` — si une apparence est définie, rend le **gabarit** (logo centré → titre MAJUSCULE → sous-titre → grille de cartes), sinon **repli** sur la sélection de stand actuelle. **Actions** mappées : `supplier` → menu de la buvette, `scan` → QR, `url` → lien ; `orders` no-op (pas d'écran liste). Cartes **texte + image** en RN core (cartes icône en v2 avec `lucide-react-native`).

### Qualité — boucle dashboard → backend → app vérifiée
- Admin `typecheck` 0 · `lint` 0 · Backend `typecheck` 0 · **Mobile `typecheck` 0**.
- Backend **relancé en watch** : `GET /public/events/:id` expose bien `branding` + `appearance` (4 cartes « TRIBUNE »).

### Reste (point 3)
- **Cartes icône côté app** (corporate/festival) — v2 : `lucide-react-native` + `react-native-svg` (module natif → rebuild). Le **Stade** (cartes texte) marche déjà.
- **Upload d'image** (stockage S3/local — infra à brancher ; URL en attendant).
- **Écran carte/menu** (2ᵉ écran, style Burger King — pur frontend admin).
- **Définir ensemble** le contenu fin de chaque template + l'action de chaque carte.

---

## [0.33.0] — 2026-06-08 — Section « Buvettes » (config une fois → rattacher aux événements)

### Contexte
Demande client : pouvoir **configurer les buvettes une fois** (au niveau du club) puis les **attribuer à chaque événement**, avec un **accès direct** à l'ensemble d'une buvette. Le modèle le supportait déjà (Supplier = org-level, Event↔Supplier M:N) mais il **manquait une section dédiée** dans le menu (les buvettes ne se créaient que dans le wizard ou la fiche événement). **Aucun changement backend** (CRUD fournisseur déjà complet : GET / GET :id / PATCH :id / PATCH :id/status).

### Livré (frontend admin)
+ `apps/admin/src/app/(admin)/suppliers/page.tsx` — **liste des buvettes** (nouvelle section) : création (nom + zone), cartes premium (`surface`/`shadowCard`, icône `Store`, badge de statut Ouverte/En pause/Fermée/Hors ligne), description « config une fois → rattacher ».
~ `apps/admin/src/app/(admin)/layout.tsx` — item **« Buvettes »** (`Store`) dans le groupe Configuration.
~ `apps/admin/src/app/(admin)/suppliers/[id]/page.tsx` — fil d'Ariane `← Événements` → `← Buvettes` ; dé-emoji `🏪` + badge de statut dans l'en-tête ; **carte « Réglages »** (édition nom/zone via `apiUpdateSupplier` + bascule de **statut** OPEN/PAUSED/CLOSED/OFFLINE via `apiUpdateSupplierStatus`) ; **carte « Rattacher à un événement »** (dropdown événements + `apiAttachSupplier`). Gestion produits/catégories/prix : **inchangée** (déjà présente).
~ `apps/admin/src/lib/api/admin-client.ts` — `apiUpdateSupplier(orgId, id, {name?, preparationZone?})` (`PATCH /…/suppliers/:id`) + `apiUpdateSupplierStatus(orgId, id, status)` (`PATCH /…/suppliers/:id/status`).

### Qualité
- Admin `typecheck` exit 0 · `lint` 0. Endpoint `PATCH …/suppliers/:id/status` **vérifié en live** (HTTP 200). Aucune migration, aucun changement backend.

### Consolidation des buvettes dupliquées (fait, avec accord)
- **Données** : 3 « Buvette Nord » CLOSED **orphelines** (0 référence : 0 produit/commande/comptoir/attache) supprimées en transaction → **1 seule** « Buvette Nord » (OPEN, 5 produits, 20 commandes, comptoirs + événement intacts).
~ `apps/admin/src/app/(admin)/demo-setup/page.tsx` — Step 2 **réutilise** une buvette nommée « Buvette Nord » si elle existe (`apiGetSuppliers` → find), sinon la crée. Plus de doublons à l'avenir (comme le lieu).

---

## [0.32.0] — 2026-06-07 — Refonte v3 « chaleureux premium » : Inter + Lucide + canevas crème (bloc 1)

### Contexte
Pivot de direction artistique (client) : Fredoka jugée « trop enfant » pour des outils pro → on **abandonne Fredoka** au profit d'**Inter** ; emojis de navigation remplacés par un **jeu d'icônes Lucide** (ligne fines) ; direction **« chaleureux premium »** (canevas blanc cassé chaud, cartes blanches qui ressortent, profondeur DOUCE et NEUTRE, orange maîtrisé). Le logo « B éclair » est laissé tel quel (revu plus tard). **Bloc 1** = fondations + sidebar admin + dashboard manager ; les autres pages suivront.

### Fondations (package brand + 3 apps)
~ `packages/brand/src/brand.ts` — `font` → Inter via `--font-sans` (était Fredoka) ; `bg` `#ffffff` → `#fcfaf8` (crème) ; `inkSoft` `#44403c` → `#57514c` ; nouveaux tokens `surface #ffffff` (cartes), `shadowCard` + `shadowSoft` **neutres en couches** (fini l'ombre orangée générique), `radius {card:16, control:12, pill:999}`.
~ `apps/{admin,operator,backoffice}/src/app/layout.tsx` — `next/font/google` Fredoka → **Inter** (variable font, `--font-sans`).
~ `apps/{admin,operator,backoffice}/src/app/globals.css` — body `font-family` → `var(--font-sans)` + fallback système ; `background #fcfaf8` ; `color #2d2926`.
+ `lucide-react` ajouté aux 3 apps (vérifié authentique : registry npm officiel, repo `lucide-icons/lucide`, licence ISC).

### Admin — sidebar + dashboard
~ `apps/admin/src/app/(admin)/layout.tsx` — nav **groupée** (Pilotage / Configuration / Organisation / Système / Outils), **icônes Lucide** (fini les emojis), **pastille active arrondie** (au lieu du filet gauche), rail **blanc** sur canevas crème.
~ `apps/admin/src/app/(admin)/events/page.tsx` — section renommée **« Événements & configuration »** + description grise (le centre de paramétrage : buvettes, créneaux, retraits, écrans, stats).
~ `apps/admin/src/app/(admin)/dashboard/page.tsx` — dé-emoji (greeting ; `InfoCard` 🏢/🔒/🎪 → `Building2`/`Lock`/`CalendarDays` ; bouton ↻ → `RefreshCw` ; chevron `›` → `ChevronRight`) ; cartes `surface` + `shadowCard` (hover `shadowSoft` + lift) ; typo resserrée (letter-spacing négatif sur les chiffres).

### Admin — « Lieu » intégré à Organisation (section « Lieux » retirée)
Décision produit (client) : **un club = un lieu**. La section multi-lieux n'a plus de sens et le formulaire d'événement demandait de **coller un UUID de venue** — supprimé.
~ `apps/admin/src/app/(admin)/layout.tsx` — item « Lieux » retiré du menu (import `MapPin` retiré).
~ `apps/admin/src/app/(admin)/organizations/[id]/page.tsx` — **carte « Lieu »** (nom + adresse + fuseau) : crée le lieu s'il n'existe pas, sinon le met à jour ; `SectionCard` passé en `surface`/`shadowCard` ; cas multi-sites résiduel affiché en chips (lecture seule).
~ `apps/admin/src/app/(admin)/events/page.tsx` — fini l'UUID : le formulaire **utilise le lieu du club automatiquement** (0 lieu → invite vers Organisation + submit désactivé ; 1 → affichage lecture seule ; >1 → menu déroulant).
~ `apps/admin/src/lib/api/admin-client.ts` — `apiUpdateVenue(orgId, venueId, {name?,address?,timezone?})` → `PATCH /organizations/:orgId/venues/:id` (endpoint backend **déjà existant**).
~ `apps/admin/src/app/(admin)/venues/page.tsx` — réduit à une **redirection** vers Organisation (anciens favoris).

### Qualité
- Admin / Operator / Backoffice : `typecheck` exit 0 · `lint` 0.
- Aucune migration, aucun changement backend (réutilise le `PATCH` venue existant).

### Consolidation des lieux dupliqués + correction de la cause racine
La base de démo avait **4 lieux dupliqués** « Patinoire des Spartiates » (cause réelle : la page **Démo Spartiates** — et le wizard — créaient un nouveau lieu à chaque run).
- **Données** (transaction SQL, données de démo, avec accord explicite) : 3 événements repointés sur le lieu canonique (celui des 20 commandes + 2 comptoirs), **3 doublons supprimés** → **1 seul lieu** (`UPDATE 3` events · `DELETE 3` venues · commandes/comptoirs intacts).
- **Cause racine** : `wizard/page.tsx` **et** `demo-setup/page.tsx` **réutilisent désormais** le lieu existant de l'org (via `apiGetVenues` → `apiUpdateVenue`) au lieu d'en créer un nouveau. Plus de doublons à l'avenir.
- **Événements dupliqués nettoyés** (accord explicite) : 3 événements « Match Spartiates Hockey » en double (DRAFT/CANCELLED, 0 commande) supprimés en transaction (FK vérifiées : `event_suppliers` CASCADE, le reste à 0). État final démo : **1 lieu · 1 événement actif · 20 commandes · 2 comptoirs**.

### Admin — sweep premium des pages (dé-emoji + cartes surface/shadowCard)
Application de la recette « chaleureux premium » aux pages de liste/config : titres dé-emoji (texte net + letter-spacing), cartes `BRAND.bg` → `BRAND.surface` (blanc sur canevas crème) + `shadowCard`, emojis d'état vide → icônes Lucide en pastille, chevrons `›` → `ChevronRight`.
~ `dashboard` (déjà), `events` (en-tête), `organizations/[id]` (carte Lieu) — faits plus haut.
~ `settings` (Paramètres) · `groups` (Groupes) · `team` (Équipe) · `operator-screens` (Écrans opérateur) · `feature-flags` · `simulator` — dé-emoji + surface/shadowCard ; chips fournisseur 🏪 → `Store`, badges, etc.
- **Piège évité** : `replace_all` `background: BRAND.bg` sans virgule capture `BRAND.bgSubtle` → toujours inclure la virgule (`background: BRAND.bg,`).

### Sweep complet (3 apps)
~ **Admin** — toutes les pages : fiche événement (8 titres de cartes dé-emoji + visibilité/copie en Lucide), détails (groupe/écran/fournisseur), wizard (icônes templates → Lucide Trophy/Tent/Building2, recap + labels dé-emoji, push → Zap), démo-setup, renommage **« Configurer mon lieu »**.
~ **Backoffice** — sidebar refonte (Lucide + pastille active), KPI cards `surface`/`shadowCard`.
~ **Operator** (console rush, design conservé) — chips fournisseur 🏪 → `Store`, en-têtes de colonnes dé-emoji, « 🍔 BREAK EAT » → « BREAKEAT », popup `CheckCircle2`/`Bell`, ombres adoucies.
- **Qualité finale** : admin / operator / backoffice `typecheck` 0 · `lint` 0.

### Reste (hors sweep — prochaines features validées)
Section **« Buvettes »** dédiée (config une fois → rattacher aux événements), puis **câbler la couleur** sur l'app mobile. *(Toggle Flaix parqué — attend le code Flaix. Option non retenue : fusion Organisation + Équipe.)*

---

## [0.31.0] — 2026-06-07 — Admin : allègement typographique (Fredoka) + Wizard multi-buvettes

### Contexte
Deux ajustements du panel manager dans la même session. (1) Le dashboard manager paraissait « trop noir / gras » : Fredoka **conservée** mais **poids allégés** et near-black `#1c1917` adouci en anthracite chaud. (2) Le wizard guidé ne configurait qu'**un seul** point de vente ; or un même lieu/stade peut exploiter **plusieurs buvettes ou stands**. Le parcours configure désormais **N buvettes** en une fois (1 lieu → N fournisseurs), chacune avec sa zone de préparation, son point de retrait, ses catégories et son menu.

### Design — allègement Fredoka (package brand, propagé aux 3 apps)
~ `packages/brand/src/brand.ts` — `ink` `#1c1917` → `#2d2926` (anthracite chaud adouci). Token **unique** → admin + operator + backoffice.
~ 16 pages admin — `fontWeight: 800` → `600` (dashboard, events, events/[id], venues, groups, groups/[id], settings, feature-flags, simulator, team, operator-screens, operator-screens/[id], organizations/[id], suppliers/[id], demo-setup, wizard). Fredoka est chargée en `['400','500','600','700']` → un `800` inline clampait déjà à 700 ; on descend volontairement à 600.

### Admin — Wizard multi-buvettes
~ `apps/admin/src/app/(admin)/wizard/page.tsx` — refonte de l'étape « Produits » en **« Buvettes & produits »** :
  - nouveau type `Buvette { id, name, prepZone, pickupPoint, categories[], products[] }` ; `WizardData.buvettes: Buvette[]` (remplace les champs à plat `supplierName`/`prepZone`/`categories`/`products`/`pickupPoints`).
  - étape 2 : N cartes buvette (ajout/retrait, min. 1) via `BuvetteCard`, chacune avec nom, zone de prépa, point de retrait, catégories et table produits/prix **indépendants**. Le `<select>` catégorie d'un produit n'expose que les catégories de **sa** buvette.
  - étape 3 (« Créneaux ») : le point de retrait étant désormais par buvette, l'étape ne gère plus que le générateur de créneaux (partagés par l'événement) + un encart **lecture seule** « buvette → point de retrait ».
  - exécution : 1 lieu + 1 événement, **catégories dédupliquées** sur toutes les buvettes (créées une fois → `catMap`), puis **une tâche par buvette** (fournisseur + attachement + point de retrait + produits), puis créneaux / notifs / push / activation. Log de progression dynamique.
  - templates (Stade/Festival/Entreprise) pré-remplissent 2 buvettes (Stade Nord/Sud, Festival Food Truck/Bar) ou 1 (Entreprise).

### Qualité
- Admin : `typecheck` exit 0 · `lint` 0.
- **Aucune migration, aucune dépendance npm, aucun changement backend** — le multi-fournisseur par événement était déjà supporté (Org→Suppliers N, Event↔Supplier M:N, `PickupPoint` rattachable à un `supplierId`). Le wizard orchestre l'existant.

---

## [0.30.0] — 2026-06-07 — Phase 15 : Dashboard Manager (analytics org/événement, lecture seule)

### Contexte
Le board opérateur était riche (réception temps réel), mais le **manager** n'avait **aucune visibilité opérationnelle** : le `/dashboard` admin n'était qu'un lanceur de navigation. Cette phase livre la première brique d'analytics **lecture seule** au service du client payant (le gérant de club) : un module backend `stats` (aucune migration), la **transformation du dashboard admin** en tableau de bord opérationnel, et un bloc **stats par événement** sur la fiche événement. Les chiffres se **réconcilient avec le back office** SUPER_ADMIN (mêmes règles CA).

### Règle de revenu (source unique, calquée sur BackofficeService)
Une commande compte au CA **seulement** si `paymentStatus = SUCCEEDED`. `Order.totalCents` est **TTC** ; `CA HT = round(CA TTC / (1 + vatRate))`, `vatRate` lu depuis `app.reporting.vatRate` (fallback **0.1** = 10 %). `Order` porte `organizationId` **et** `eventId` directement → agrégations sans jointure. Top produits via `orderItem.groupBy` scoppé par `order: { eventId, paymentStatus: SUCCEEDED }` (`productNameSnapshot` + `lineTotalCents`).

### Backend — module stats (lecture seule, aucune migration)
+ `backend/src/modules/stats/stats.service.ts` — `getOrgOverview(orgId, userId)` (KPIs org : CA HT/TTC, nb commandes, panier moyen HT/TTC, nb événements + **événements en cours** `startAt ≤ now ≤ endAt`, rollup revenu par événement) et `getEventStats(eventId, userId)` (revenu, panier moyen, **répartition complète par statut** zéro-seedée sur les 8 `OrderStatus`, **top 10 produits**). Privés : `toHtCents(ttc)=round(ttc/(1+vat))`, `averageBasket()` avec garde division-par-zéro. Accès gaté **MANAGE_ROLES** (ORG_ADMIN, MANAGER) — le CA est sensible, OPERATOR/MARKETING exclus ; SUPER_ADMIN bypass.
+ `backend/src/modules/stats/stats.controller.ts` — `@UseGuards(JwtAuthGuard)`, base path vide ; `GET organizations/:orgId/stats` et `GET events/:eventId/stats` (`ParseUUIDPipe` + `@CurrentUser().sub`).
+ `backend/src/modules/stats/stats.module.ts` — provider `StatsService` + controller.
+ `backend/src/modules/stats/stats.service.spec.ts` — **7 tests** : math CA à 10 %, merge rollup + comptage « en cours », org vide (zéros + pas de division par zéro), refus OPERATOR (403 + **aucune** requête revenu), breakdown statut complet + top produits, 404 événement inconnu **avant** tout check d'accès, non-membre 403.
~ `backend/src/app.module.ts` — `StatsModule` enregistré (Phase 15).

### Admin — dashboard opérationnel + stats par événement
~ `apps/admin/src/lib/api/admin-client.ts` — section stats : interfaces `RevenueBlock`/`BasketBlock`/`OrgEventStat`/`OrgStatsOverview`/`TopProduct`/`EventStats` (statut typé via l'union `OperatorOrderStatus`) + `apiGetOrgStats(orgId)` / `apiGetEventStats(eventId)`.
~ `apps/admin/src/app/(admin)/dashboard/page.tsx` — **réécrit** : de lanceur de navigation → tableau de bord org. KPIs (CA HT avec « TVA 10 % », CA TTC, Commandes, Panier moyen TTC, Événements + « N en cours »), liste **Performance par événement** (badge « ● En cours » calculé client), accès rapide board opérateur. Dégradation propre : OPERATOR/MARKETING (403) voient une carte « Statistiques réservées aux managers » au lieu d'une erreur.
~ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — carte **📊 Statistiques de l'événement** (KPIs + répartition par statut + top produits). Fetch **isolé** du `Promise.all` principal → un 403 manager-only n'altère jamais le reste de la fiche.

### Qualité
- Backend : **26 suites / 313 tests** (306 → +7) · `typecheck` exit 0 · `lint` 0
- Admin : `typecheck` exit 0 · `lint` 0 · `build` ✓ (15 routes · `/dashboard` 4.97 kB · `/events/[id]` 8.71 kB)
- Opérateur (régression) : `typecheck` exit 0 · `lint` 0 — **aucune** migration, **aucune** dépendance npm ajoutée

---

## [0.29.0] — 2026-06-07 — Corrections post-audit Codex (sécurité écran public + hygiène Git + batch résilient)

### Contexte
Audit Codex (frontière précédente : 2026-06-02). Trois correctifs livrés ; un quatrième finding (pipeline racine Turbo) **vérifié sain** et documenté plutôt que « corrigé ».

### Sécurité (P1)
~ `backend/src/modules/orders/public-orders.controller.ts` — `GET /public/orders/event/:eventId/ready` était **sans garde** : connaître l'UUID d'un événement **privé** suffisait à lire les n° publics de ses commandes prêtes. Ajout `@UseGuards(OptionalJwtAuthGuard)` + `groupsService.canAccessEvent(eventId, user?.sub ?? null)` → PUBLIC : anonyme OK ; PRIVATE : membre authentifié seulement ; sinon **404** identique (pas de fuite d'existence). Parité avec `PublicEventsController` (Phase 14.4).
~ `backend/src/modules/orders/orders.module.ts` — `imports: [..., GroupsModule]`
+ `backend/src/modules/orders/public-orders.controller.spec.ts` — 3 tests (anonyme autorisé · propagation `sub` · **404 + `findReadyByEvent` jamais appelé** quand refusé)

### Robustesse UX (P2)
~ `apps/operator/src/app/dashboard/[eventId]/page.tsx` — `batchAdvance` : `Promise.all` → **`Promise.allSettled`** + `loadSnapshot()` **toujours** exécuté + bannière ambre dismissible (`batchError`) « N/total commandes n'ont pas pu être avancées ». Un échec en milieu de lot ne laisse plus un état mixte silencieux.

### Hygiène Git (P2)
~ `.gitignore` — `*.tsbuildinfo` ajouté (section Build outputs)
- `apps/admin/tsconfig.tsbuildinfo`, `apps/operator/tsconfig.tsbuildinfo` — **dé-suivis** (`git rm --cached`, fichiers conservés sur disque)

### Pipeline racine Turbo (P1 audit — non-bug)
- `turbo run typecheck/build/lint` **vérifié sain** ici (3× exit 0, pnpm 11.3.0 = `packageManager`). CI (`.github/workflows/ci.yml` via `pnpm/action-setup@v4`), Vercel (`vercel.json` → `pnpm install` + `pnpm build`) et Railway (`nixpacks.toml` → `corepack prepare pnpm@11.3.0`) provisionnent tous pnpm. L'échec Codex « Unable to find package manager binary » = **sandbox** sans pnpm au PATH, pas le dépôt. Fallback fiable : builds **package par package** (`pnpm --filter`).

### Qualité
- Backend : **25 suites / 306 tests** (303 → +3) · `typecheck` exit 0
- Opérateur : `typecheck` exit 0 · `lint` 0 · `build` ✓ (`/dashboard/[eventId]` 10.5 kB)

---

## [0.28.0] — 2026-06-07 — Phase 11.4c : regroupement visuel « X commandes similaires » (cartes empilées + batch)

### Contexte
En plein rush, le même panier est commandé en boucle (dix « Burger + Frites »). Les préparer carte par carte gaspille des gestes. Cet incrément **empile les paniers identiques** d'une colonne en une seule carte groupée — composition affichée une fois, badges de n° de commande, et un bouton **batch** qui fait avancer tout le lot au statut suivant d'un clic (« se préparent ensemble »). Affichage **pur owned by Break** : aucune commande n'est fusionnée, chacune garde son cycle de vie. Distinct de la difficulté Flaix (11.5, en attente du code Flaix). Toggle **désactivé par défaut** → rétrocompat totale.

### Client opérateur
+ `apps/operator/src/lib/screens/grouping.ts` — `groupSimilarOrders(orders)` : cluster par signature de composition (`productId:quantity` trié, FIFO-préservé) ; `compositionSignature` ; types `OrderGroup`/`GroupedLine`. Singletons = groupe de 1 → board groupé = **sur-ensemble** strict du board plat.
+ `apps/operator/src/components/OrderGroupCard.tsx` — carte « empilée » (faux stack en profondeur) : chip `🧩 N commandes`, total articles + âge de la plus ancienne, badges `#n°` (max 10 + `+K`), composition partagée (`× total`), bouton **batch** contextuel (`Accepter/Préparer/… les N`) + dépliage `Voir les N` → `OrderCard` individuelles (actions par commande conservées). Groupe de 1 → `OrderCard` normale.
~ `apps/operator/src/components/DashboardColumn.tsx` — nouvelle API : `orders: Order[]` + `toCardProps` + `grouped?` + `onBatchAdvance?` ; rend des `OrderGroupCard` quand `grouped`, cartes plates sinon (compteur d'en-tête = nombre de **commandes**, pas de groupes)
~ `apps/operator/src/components/OrderCard.tsx` — `elapsed` exporté (réutilisé par la carte de groupe)
~ `apps/operator/src/app/dashboard/[eventId]/page.tsx` — toggle header « 🧩 Grouper » (off par défaut) ; `batchAdvance(orders)` → transition du statut courant pour tout le groupe en parallèle (`Promise.all`) puis `loadSnapshot()`
~ `apps/operator/src/stories/DashboardColumn.stories.tsx` — migrées vers la nouvelle API (`Order[]` + `toCardProps`) + story « 6 commandes identiques (groupées) »

### Qualité
- `pnpm --filter @break-eat/operator typecheck` → **exit 0** · lint **0 erreur** · `build` → **✓** (`/dashboard/[eventId]` 10.3 kB)
- Aucun changement backend → suites jest inchangées (**88/88** orders)

---

## [0.27.0] — 2026-06-07 — Phase 11.4 : board opérateur rendu des écrans configurables (onglets + filtrage + Récap produits)

### Contexte
La fondation backend (`0.25.0`) et l'UI admin (`0.26.0`) permettaient de **définir** des écrans opérateur. Cet incrément les **rend** enfin sur le board : le dashboard opérateur affiche désormais **un onglet par écran configuré** (« Commandes Immédiates », « 1ère mi-temps », « Prêtes », « Récupérées », « Écran Général »…), chacun filtrant le flux de commandes temps réel par **statut + créneau (slotKind) + catégorie/produit**. Ajout du **panneau Récap produits** (agrégation par catégorie) et de l'**Accès rapide** (recherche par n° de commande ou nom client) — la moitié droite de la capture de référence. Hors périmètre (différé) : le **regroupement « X commandes similaires »** (11.4c) et l'affichage du **plan de préparation Flaix** (11.5, en attente du code Flaix).

### Backend — enrichissement du payload dashboard (11.4a)
~ `backend/src/modules/orders/orders.service.ts` — `findDashboardByEvent` enrichi pour que les écrans puissent filtrer/afficher côté client : chaque **commande** porte `slotKind` (aplati depuis `order.slot.kind`, défaut `IMMEDIATE`) + `customerName` (`user.displayName` uniquement — jamais email/téléphone sur le board partagé) ; chaque **ligne** porte `categoryId` + `categoryName` (résolus via **un seul** `product.findMany` batché sur les `productId` distincts — `OrderItem` n'a pas de relation `product`). `PICKED_UP` ajouté à `DASHBOARD_STATUSES` (l'écran « récupérées » a pour défaut `[PICKED_UP, RECOVERED]`). Forme `{ eventId, counts, orders }` conservée.
~ `backend/src/modules/orders/orders.service.spec.ts` — `product: { findMany }` ajouté au mock Prisma ; 2 nouveaux tests (enrichissement slotKind/customerName/categoryId/categoryName + lookup batché dédupliqué ; skip du lookup produit quand aucune ligne) ; test statuts mis à jour (inclut `PICKED_UP`). **88/88** sur le module orders.

### Client opérateur (11.4a)
~ `apps/operator/src/lib/api/orders-client.ts` — `OrderItem` (+`categoryId`/`categoryName`), `Order` (+`slotKind`/`customerName`) ; types `OperatorScreenKind`/`SlotKind`/`ScreenFilters`/`ResolvedOperatorScreen`/`ResolvedScreensResponse` ; `fetchResolvedScreens(eventId, token, supplierId?)` → `GET /events/:eventId/operator-screens/resolved`
+ `apps/operator/src/lib/screens/filter.ts` — helpers **purs** (testables) : `itemMatchesFilters` (include/exclude catégorie+produit), `hasActiveFilters`, `orderMatchesScreen` (gate créneau + ≥1 ligne passant les filtres), `buildScreenColumns` (mini-Kanban scoppé à l'écran), `countScreenOrders` (badge d'onglet)

### UI board opérateur (11.4a + 11.4b)
~ `apps/operator/src/app/dashboard/[eventId]/page.tsx` — fetch des écrans résolus (config statique, 1 fois) ; **barre d'onglets** `ScreenTabBar` (icône + nom + compteur live) ; le board rend les **colonnes de l'écran actif** via `buildScreenColumns`, **fallback** sur le Kanban fixe historique quand aucun écran configuré ; toggle header « 📊 Récap » (initialisé depuis `filters.showRecap` de l'écran)
+ `apps/operator/src/components/RecapPanel.tsx` — panneau droit : **Accès rapide** (input → max 8 résultats #numéro + nom + StatusBadge) et **Récap produits** (agrégation `catégorie → produits` avec totaux, en-tête `N cmd · N u`, tri par quantité)

### Qualité
- `pnpm --filter @break-eat/backend typecheck` → **exit 0** · lint **0 erreur** · `jest orders` → **88/88**
- `pnpm --filter @break-eat/operator typecheck` → **exit 0** · lint **0 erreur** · `build` → **✓** (`/dashboard/[eventId]` 9.37 kB)

---

## [0.26.0] — 2026-06-07 — Phase 11.3 : UI admin des écrans opérateur (CRUD templates + application par événement)

### Contexte
La fondation backend (`0.25.0`) exposait deux surfaces de routes (templates org-scoped + jonction par événement). Cet incrément livre l'**UI admin** qui les pilote : un développeur/manager peut créer des **modèles d'écran réutilisables** au niveau organisation, définir leurs **conditions d'affichage**, puis les **appliquer/réordonner/activer par événement**. Périmètre frontend admin uniquement — le rendu opérateur (11.4) et le contrat FlaixPrepPlan (11.5) restent en attente.

### Client API + navigation
~ `apps/admin/src/lib/api/admin-client.ts` — section « Operator Screens (Phase 11) » : types `OperatorScreenKind`/`SlotKind`/`OperatorOrderStatus`/`ScreenFilters`/`OperatorScreenTemplate`/`EventOperatorScreen`/`CreateOperatorScreenInput`/`UpdateOperatorScreenInput` + 9 fonctions (`apiGetOperatorScreens`/`apiGetOperatorScreen`/`apiCreateOperatorScreen`/`apiUpdateOperatorScreen`/`apiDeleteOperatorScreen` ; `apiGetEventScreens`/`apiApplyEventScreen`/`apiUpdateEventScreen`/`apiRemoveEventScreen`) ; ajout de `kind?: SlotKind` à l'interface `Slot`
~ `apps/admin/src/app/(admin)/layout.tsx` — entrée de nav « 🖥️ Écrans opérateur » (`/operator-screens`) entre Groupes et Feature Flags

### Builder de conditions partagé
+ `apps/admin/src/components/operator-screens/screen-form.tsx` — source unique des libellés (`KIND_LABELS`/`SLOT_KIND_LABELS`/`STATUS_LABELS` + ordres) ; `ScreenDraft` (forme plate) + `EMPTY_DRAFT` + `templateToDraft`/`draftToInput` ; composant `<ScreenConditionsForm>` (nom, kind, icône, sortOrder, enabled, puis chips multi-toggle créneaux/statuts/fournisseurs/catégories + case « récap »). Réutilisé par les pages création **et** édition pour éviter ~150 lignes dupliquées. **Note** : filtres niveau produit (`productIds`/`excludeProductIds`) + `excludeCategoryIds` câblés côté serveur mais **différés** dans l'UI (seuls `categoryIds` (inclusion) + `showRecap` exposés).

### Pages CRUD templates (org-scoped)
+ `apps/admin/src/app/(admin)/operator-screens/page.tsx` — liste + création inline ; cartes (icône, nom, badge « désactivé », résumé `summarize()` des conditions, badge kind, compteur d'événements appliqués) liant vers le détail
+ `apps/admin/src/app/(admin)/operator-screens/[id]/page.tsx` — édition (via `<ScreenConditionsForm>`) + suppression (zone de danger) ; bannière indiquant le nombre d'événements où le modèle est appliqué

### Application par événement
~ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — carte « 🖥️ Écrans opérateur » : `load()` étendu (`apiGetEventScreens` + `apiGetOperatorScreens` dans le `Promise.all`) ; sélecteur des modèles non encore appliqués → `apiApplyEventScreen` ; liste triée par ordre effectif (`lien.sortOrder ?? template.sortOrder`) avec réordonnancement ▲/▼ (persiste un ordre explicite `0..n-1` uniquement pour les lignes dont le `sortOrder` a dérivé), bascule Activer/Désactiver et Retirer ; lien « Gérer les modèles → » vers `/operator-screens`

### Qualité
- `pnpm --filter @break-eat/admin typecheck` → **exit 0**
- `pnpm --filter @break-eat/admin lint` → **0 erreur**
- `pnpm --filter @break-eat/admin build` → **✓ 15 routes** (`/operator-screens` 2.41 kB, `/operator-screens/[id]` 2.17 kB, `/events/[id]` 7.45 kB)

---

## [0.25.0] — 2026-06-07 — Phase 11 (fondation backend) : écrans opérateur configurables (templates réutilisables)

### Contexte
Le board opérateur doit devenir **paramétrable** : ajouter des écrans, les afficher seulement pour certains créneaux, avec conditions d'affichage (statuts, fournisseurs, catégories/produits). Décision de co-conception : on commence par les **écrans configurables** modélisés comme **templates réutilisables au niveau organisation** (définis une fois — ex. « Spartiates buvette » — puis appliqués à plusieurs événements). Cet incrément livre **uniquement la fondation backend** (schéma + migration + module CRUD + résolution). L'UI admin (11.3), le rendu opérateur (11.4) et le contrat FlaixPrepPlan (11.5) restent en attente.

### Schéma & migration (bloc 11.1)
~ `backend/prisma/schema.prisma` — `enum SlotKind {IMMEDIATE|PAUSE_1|PAUSE_2|GENERAL|CUSTOM}` + `Slot.kind` (@default IMMEDIATE, moment de récupération **portable** entre événements) ; `enum OperatorScreenKind {ORDERS_QUEUE|READY|RECOVERED|GENERAL}` ; `model OperatorScreenTemplate` (org-scoped : `name`, `kind`, `icon?`, `sortOrder`, `enabled`, `slotKinds[]`, `statuses[]` (`OrderStatus`), `supplierIds[]`, `filters Json`, timestamps) ; `model EventOperatorScreen` (jonction `eventId`+`templateId`, `sortOrder?`/`enabled` override par événement, `@@unique([eventId,templateId])`) ; `Organization.operatorScreenTemplates` + `Event.operatorScreens`
+ `backend/prisma/migrations/20260606_phase11_operator_screens/migration.sql` — `CREATE TYPE slot_kind` + `operator_screen_kind` ; `ALTER TABLE slots ADD COLUMN kind` (NOT NULL DEFAULT 'IMMEDIATE') ; `CREATE TABLE operator_screen_templates` (arrays `slot_kind[]`/`order_status[]`/`text[]`, `filters JSONB DEFAULT '{}'`, `TIMESTAMP(3)`) + `event_operator_screens` ; FK `ON DELETE CASCADE` + unique `(event_id, template_id)` + index. Appliquée via `prisma migrate deploy` (non destructif) puis `prisma generate`.

### Backend — OperatorScreensModule (bloc 11.2)
+ `backend/src/modules/operator-screens/operator-screens.service.ts` — cœur : `createTemplate`/`listTemplates`/`getTemplate`/`updateTemplate`/`deleteTemplate` (org-scoped, écriture `ORG_ADMIN`/`MANAGER`, lecture tout membre, SUPER_ADMIN bypass) ; `applyToEvent`/`listEventScreens`/`updateEventScreen`/`removeEventScreen` (jonction, résout event→org) ; `resolveForEvent(eventId, userId, supplierIdParam?)` (consommateur board : pin fournisseur `membership.supplierId ?? param`, statuts par défaut depuis `kind` via `DEFAULT_STATUSES`, `sortOrder` effectif = lien ?? template, tri, masquage des écrans d'un autre fournisseur quand épinglé) ; statiques `sanitizeFilters` (whitelist clés connues + dédup) et `mapKnownError` (P2002→Conflict) ; exporte `ScreenFilters` + `ResolvedOperatorScreen`
+ `backend/src/modules/operator-screens/operator-screen-templates.controller.ts` — `organizations/:orgId/operator-screens` (POST/GET/GET :screenId/PATCH/DELETE)
+ `backend/src/modules/operator-screens/event-operator-screens.controller.ts` — `events/:eventId/operator-screens` (GET `/resolved` ?supplierId, GET liste, POST apply, PATCH/DELETE :linkId)
+ `backend/src/modules/operator-screens/operator-screens.module.ts`
+ `backend/src/modules/operator-screens/dto/create-operator-screen.dto.ts` · `update-operator-screen.dto.ts` · `apply-event-screen.dto.ts` · `update-event-screen.dto.ts`
+ `backend/src/modules/operator-screens/operator-screens.service.spec.ts` — 10 tests (sanitizeFilters ×3, createTemplate ×2, resolveForEvent ×3, applyToEvent ×2)
~ `backend/src/app.module.ts` — `OperatorScreensModule` enregistré (section « Phase 11 »)

### Qualité
- `pnpm --filter @break-eat/backend typecheck` → **exit 0**
- `pnpm --filter @break-eat/backend lint` → **0 erreur**
- `operator-screens.service.spec.ts` → **10/10**
- Migration appliquée via `prisma migrate deploy` (non destructif, conforme au garde-fou Prisma) ; client régénéré

---

## [0.24.1] — 2026-06-06 — Refonte design : board opérateur + STATUS_COLORS centralisé + LoginForm partagé

### Contexte
La refonte white-label `0.23.0` avait rebrandé le **login** et le **shell** de l'app operator, mais le **board opérateur** (page dashboard + composants kanban) était resté sur l'ancienne palette sombre et la table des couleurs de statut était **dupliquée 3×**. Cet incrément termine l'alignement white/orange du board et établit `StatusBadge.tsx` comme **source de vérité unique** des couleurs + libellés de statut. **Périmètre : alignement de marque uniquement** — la restructuration **par créneau** (#17) reste en attente de la démonstration du workflow par le product owner.

### Centralisation statut (source de vérité unique)
~ `apps/operator/src/components/StatusBadge.tsx` — exporte `STATUS_COLORS` + `STATUS_LABELS` (8 statuts) ; palette raffinée (`PAID` orange `#FC4002`, `ACCEPTED` bleu, `PREPARING` violet, `READY` vert, `PICKED_UP` cyan, `COMPLETED` stone, `CANCELLED` rouge, `RECOVERED` ambre)

### Composants kanban (tokens BRAND + dédup)
~ `apps/operator/src/components/OrderCard.tsx` — import `BRAND` + `STATUS_COLORS` ; suppression du `STATUS_COLORS` local dupliqué ; carte `border BRAND.border` + `borderLeft 4px solid color` ; boutons d'action mappés sur `STATUS_COLORS`
~ `apps/operator/src/components/DashboardColumn.tsx` — import `BRAND` + `STATUS_COLORS` ; suppression des maps `COLUMN_BG`/`HEADER_COLOR` ; `headerColor = STATUS_COLORS[status]` ; conteneur `bgSubtle` + `borderTop 3px headerColor`
~ `apps/operator/src/components/NotificationPopup.tsx` — import `BRAND` + `STATUS_COLORS` ; `bg = isReady ? STATUS_COLORS.READY : BRAND.orange`

### LoginForm opérateur partagé
+ `apps/operator/src/components/LoginForm.tsx` — login unique (lockup `BreakEatLogo` + « Portail opérateur » + CTA orange), stocke `operator_token` ; consommé par home + dashboard
~ `apps/operator/src/app/page.tsx` — utilise le `LoginForm` partagé (suppression du LoginForm inline)
~ `apps/operator/src/app/dashboard/[eventId]/page.tsx` — header blanc de marque (`BreakEatLogo` + wordmark « BREAKEAT » + sous-titre `grey`), chip fournisseur orange (🏪), compteur en `grey`, helper `HeaderButton` (blanc, hover orange) pour ↺ / plein écran ⊞⊠ / Déconnexion ; wrapper `bgSubtle` + Fredoka ; suppression de l'ancien LoginForm sombre inline (`#1f2937`/« 🍔 BREAK EAT »)

### Qualité
- `pnpm --filter @break-eat/operator typecheck` → **exit 0**
- `pnpm --filter @break-eat/operator lint` → **exit 0**
- `pnpm --filter @break-eat/operator build` → **✓ 4 routes** (`/dashboard/[eventId]` 7.56 kB)
- `STATUS_COLORS`/`STATUS_LABELS` ne sont plus définis qu'à **un seul endroit** (était : 3 copies)

---

## [0.24.0] — 2026-06-03 — Phase 14 : Groupes, accès privé aux événements & Back Office (SUPER_ADMIN)

### Contexte
Trois livrables liés : (1) **groupes/segments** rattachés à l'organisation avec adhésion manuelle + auto-rattachement par **domaine email** ; (2) **accès privé** au niveau de l'événement (`EventVisibility PUBLIC|PRIVATE` + liaison `EventGroup`), **enforcé côté serveur** (404 pour non-membre) ; (3) **Back Office** plateforme (`apps/backoffice`, port 3003, garde `SUPER_ADMIN`) avec KPIs globaux, gestion des organisations et supervision des groupes. Codes promo ciblés par groupe : conçus, **non construits**.

### Schéma & migration (bloc 14.1)
~ `backend/prisma/schema.prisma` — `enum EventVisibility {PUBLIC|PRIVATE}` ; `Event.visibility` (@default PUBLIC) + `Event.groups` ; `model Group` (`organizationId`, `name`, `description?`, `emailDomain?`, `@@unique([organizationId,name])`) ; `model GroupMember` (`source GroupMemberSource @default MANUAL`, `@@unique([groupId,userId])`) ; `model EventGroup` (`@@id([eventId,groupId])`, `@@index([groupId])`) ; `enum GroupMemberSource {MANUAL|DOMAIN}`
+ `backend/prisma/migrations/20260603_phase14_groups_event_visibility/migration.sql`

### Backend — GroupsModule (blocs 14.2 → 14.4)
+ `backend/src/modules/groups/groups.module.ts`
+ `backend/src/modules/groups/groups.controller.ts` — base `organizations/:orgId/groups` (`JwtAuthGuard`) ; 8 routes (CRUD groupe + CRUD membres)
+ `backend/src/modules/groups/groups.service.ts` — CRUD, membres par email, `applyDomainMembershipsForUser()` (auto-rattachement `DOMAIN`), `canAccessEvent()` (enforcement privé)
+ `backend/src/modules/groups/dto/create-group.dto.ts` · `update-group.dto.ts` · `add-group-member.dto.ts`
~ `backend/src/modules/events/public-events.controller.ts` — `canAccessEvent()` → **404** identique pour non-membre (aucune fuite d'existence)

### Backend — BackofficeModule (bloc 14.5)
+ `backend/src/modules/backoffice/backoffice.module.ts`
+ `backend/src/modules/backoffice/backoffice.controller.ts` — base `/backoffice`, `@Roles(SUPER_ADMIN)`
+ `backend/src/modules/backoffice/backoffice.service.ts` — `getGlobalKpis()` : `revenue{caTtcCents, caHtCents, vatRate}`, `ordersCount`, `averageBasket{htCents, ttcCents}`, `accountsCount`, `organizationsCount` ; **CA HT = round(TTC / (1 + vatRate))**, `vatRate = 0.10` (resto sur place) ; + orgs CRUD/activation cross-tenant
+ `backend/src/modules/backoffice/backoffice.service.spec.ts`
+ `backend/src/modules/backoffice/dto/create-backoffice-org.dto.ts` · `update-backoffice-org.dto.ts`

### Back Office app (bloc 14.6) — apps/backoffice, port 3003
+ App Next.js 15 dédiée (TanStack Query, `@break-eat/brand`), auth `SUPER_ADMIN` (clés `backoffice_token`/`backoffice_user`)
+ `(backoffice)/overview/page.tsx` (KPIs) · `organizations/page.tsx` + `organizations/[id]/page.tsx` · `groups/page.tsx` (supervision cross-tenant lecture seule)
+ `components/status-badge.tsx` (badge statut org — hors route App Router) · `login/page.tsx` · `layout.tsx`
+ `public/logo-full.png` · `logo-mark.png` · `.gitignore`

### Bloc 14.7 — Dashboard CLUB : visibilité + groupes
~ `backend/src/modules/events/dto/update-event.dto.ts` — +`visibility?` (EventVisibility) +`groupIds?` (UUID[])
~ `backend/src/modules/events/events.service.ts` — `update()` : set `visibility` + **remplacement transactionnel** du set `EventGroup` (validation appartenance org → 400 sinon) ; `findOne()` inclut `groups{groupId}` ; `EventWithSuppliers.groups?` optionnel
~ `backend/src/modules/events/events.service.spec.ts` — +4 tests (set visibility, remplacement groupes, vidage `[]`, rejet groupe cross-org)
~ `apps/admin/src/lib/api/admin-client.ts` — +`type EventVisibility`, `AdminEvent.visibility?`/`groups?` ; `apiUpdateEvent` +`visibility?`/`groupIds?` ; +types `Group`/`GroupMember` + 8 fonctions (`apiGetGroups`…`apiRemoveGroupMember`)
~ `apps/admin/src/app/(admin)/layout.tsx` — +entrée nav `{ /groups, 🏷️, "Groupes" }`
+ `apps/admin/src/app/(admin)/groups/page.tsx` — liste + création (nom, description, domaine)
+ `apps/admin/src/app/(admin)/groups/[id]/page.tsx` — édition méta, membres (ajout/retrait, badge Manuel/Domaine), suppression
~ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — +carte « 🔒 Accès & visibilité » (radios public/privé + multi-select groupes si privé)
~ `apps/admin/src/app/(admin)/events/page.tsx` — +badge « 🔒 Privé »

### Qualité (bloc 14.8)
- `pnpm typecheck` (backend) → **exit 0** ; `pnpm test` (backend) → **291/291 — 23 suites — 0 failure**
- `pnpm typecheck` (admin) → **exit 0** ; `pnpm build` (admin) → **✓ 14 routes** (+`/groups` +`/groups/[id]`)
- `groupIds` **remplace** le set quand fourni (`[]` = vide ; omis = inchangé) ; écriture en `$transaction`

---

## [0.23.0] — 2026-06-03 — Refonte design white-label : package @break-eat/brand (white/orange)

### Contexte
Refonte visuelle complète des surfaces web (admin + operator) vers l'identité Break Eat : fond **blanc** neutre (zéro forme décorative), **orange vif `#FC4002`**, police **Fredoka** sur toute l'UI, wordmark officiel **« BREAKEAT »** (artwork PNG) et logo **« B éclair »** (lockup complet sur login, mark seul sur dashboard). Objectif : centraliser tous les tokens de design dans un package partagé pour garantir **une seule source de vérité** white-label réutilisable par les 3 surfaces.

### Package partagé (nouveau)
+ `packages/brand/package.json` — `@break-eat/brand` (consommé via `workspace:*`)
+ `packages/brand/src/brand.ts` — objet `BRAND` : orange `#FC4002`, orangeDark `#DA3702`, orangeSoft, orangeTint, ink `#1c1917`, inkSoft `#44403c`, grey `#a8a29e`, border `#ece3dd`, bg `#ffffff`, bgSubtle `#faf7f5`, shadowSoft, shadowButton, font Fredoka + `type Brand`
+ `packages/brand/src/BreakEatLogo.tsx` — composant logo (lockup complet `logo-full.png` + mark seul `logo-mark.png`)
+ `packages/brand/src/index.ts` — barrel export (`BRAND`, `Brand`, `BreakEatLogo`)
~ `apps/admin/next.config.ts` + `apps/operator/next.config.ts` — `transpilePackages: ['@break-eat/brand']`
~ `apps/admin/package.json` — dépendance `@break-eat/brand: workspace:*`

### Shims admin (re-export — compat imports existants)
+ `apps/admin/src/lib/brand.ts` — re-export depuis `@break-eat/brand`
+ `apps/admin/src/components/brand/BreakEatLogo.tsx` — re-export

### Rebrand admin — chrome
~ `apps/admin/src/app/layout.tsx` — `next/font/google` Fredoka, wordmark PNG (Raleway retiré)
~ `apps/admin/src/app/(admin)/layout.tsx` — sidebar blanche, entrée nav active orange, logo mark
~ `apps/admin/src/app/(admin)/dashboard/page.tsx` — cartes nav + health badge BRAND
~ `apps/admin/src/app/login/page.tsx` — lockup complet sur login
~ `apps/admin/src/app/globals.css` + `apps/admin/src/app/page.tsx`

### Rebrand admin — 10 pages internes (tokens BRAND)
~ `(admin)/team/page.tsx` · `(admin)/venues/page.tsx` · `(admin)/events/page.tsx` · `(admin)/events/[id]/page.tsx` · `(admin)/feature-flags/page.tsx` · `(admin)/settings/page.tsx` · `(admin)/demo-setup/page.tsx` · `(admin)/suppliers/[id]/page.tsx` · `(admin)/organizations/[id]/page.tsx` · `(admin)/simulator/page.tsx`

**Convention de mapping appliquée à l'identique sur les 10 pages :**
- Bleus primaires `#2563eb`/`#3b82f6` → `BRAND.orange` (hover → `orangeDark`) ; CTA sombres « + Nouveau… » → orange + hover ; boutons navigation sombres `#111827`/`#1f2937` → `BRAND.ink`
- `#111827` (titres) → `ink` ; `#374151`/`#1f2937` (labels) → `inkSoft` ; `#6b7280`/`#9ca3af` (muted) → `grey`
- Bordures `#d1d5db`/`#e5e7eb` → `border` ; fonds clairs `#f9fafb`/`#f3f4f6` → `bgSubtle` ; cartes `#fff` → `bg` **+ `border`** ; ombres → `rgba(28,25,23,0.06)` / `shadowSoft`
- color-picker white-label (org + event) default `#2563eb` → `BRAND.orange` ; `fontFamily: BRAND.font` sur conteneur, `inherit` sur inputs/selects/buttons/textarea

**Couleurs sémantiques PRÉSERVÉES (hors palette historique) :** erreur rouge, succès vert, warning ambre, money `#059669`, badges rôle/scope catégoriels, légende lifecycle `STATUS_COLOR` (PAID/ACCEPTED/PREPARING/READY/PICKED_UP/COMPLETED/RECOVERED/CANCELLED — partagée avec l'opérateur), `#7c3aed` rush simulateur.

### Rebrand operator
~ `apps/operator/src/app/page.tsx` (login) · `apps/operator/src/app/layout.tsx` (shell) · `apps/operator/src/app/globals.css` — même identité white/orange + Fredoka

### Qualité
- `pnpm --filter @break-eat/admin typecheck` → **exit 0 — 0 erreur**
- `grep (admin)` chrome bleu/gris/bordure → **0 résiduel** ; seules subsistent les couleurs lifecycle sémantiques (`#3b82f6` PAID, `#6b7280` COMPLETED) dans la légende `STATUS_COLOR` du simulateur — **intentionnel**

---

## [0.22.1] — 2026-06-02 — Audit Phase 11 & 12 — P1 fix + P2/P3 corrections

### Audit P1 — Sécurité : enforcement supplierId dashboard

**Bug** : un opérateur avec supplierId assigné pouvait retirer/modifier le paramètre `?supplierId=` dans l'URL pour voir les commandes des autres fournisseurs.

~ `backend/src/modules/orders/orders.controller.ts` — `findDashboard()` : lit maintenant `membership.supplierId` depuis la DB ; si l'opérateur a un fournisseur assigné, ce fournisseur est **toujours appliqué** (ignoring query param). Les opérateurs sans assignment gardent l'accès complet.

### Audit P2 — Branding : vidage des champs logoUrl / primaryColor

**Bug** : envoyer une chaîne vide `''` pour effacer `logoUrl` échouait la validation `@IsUrl()`. Impossible de supprimer un logo une fois défini.

~ `backend/src/modules/organizations/dto/update-org-branding.dto.ts` — `@Transform('' → null)` sur `logoUrl`, `primaryColor`, `description` ; types passent à `string | null`
~ `backend/src/modules/events/dto/update-event.dto.ts` — même correction

### Audit P3 — Dashboard admin : cartes de navigation incomplètes

**Amélioration** : les cartes de la page d'accueil admin ne référençaient pas les sections Équipe et Lieux ajoutées en Phase 12.

~ `apps/admin/src/app/(admin)/dashboard/page.tsx` — +cartes Équipe (`/team`) et Lieux (`/venues`)

---

## [0.22.0] — 2026-06-02 — Phase 12 complétée : Blocs 12.7 · 12.8 · 12.9

### BLOC 12.7 — Invitation opérateur & gestion d'équipe

**Schéma**
~ `backend/prisma/schema.prisma` — `OrganizationMember.supplierId` (FK vers Supplier) + relation `Supplier.assignedOperators`
+ `backend/prisma/migrations/20260602_phase12_7_operator_supplier_assignment/migration.sql`

**Backend**
+ `backend/src/modules/organizations/dto/invite-member.dto.ts` — `InviteMemberDto` (email + role + supplierId?)
~ `backend/src/modules/organizations/organizations.service.ts` — +`inviteByEmail()` +`getMembers()` +`removeMember()` +`updateBranding()`
~ `backend/src/modules/organizations/organizations.controller.ts` — +`GET /:id/members` +`POST /:id/invite` +`DELETE /:id/members/:memberId` +`PATCH /:id/branding`
~ `backend/src/modules/users/users.service.ts` — `findByIdWithMemberships()` inclut maintenant `supplier` pour l'opérateur

**Admin panel**
~ `apps/admin/src/lib/api/admin-client.ts` — +`OrgMemberWithUser` +`apiGetOrgMembers()` +`apiInviteMember()` +`apiRemoveMember()`
+ `apps/admin/src/app/(admin)/team/page.tsx` — page équipe : tableau membres (email/rôle/fournisseur), formulaire invitation par email
~ `apps/admin/src/app/(admin)/layout.tsx` — +entrée nav "Équipe"

### BLOC 12.8 — Branding (logo, couleur, description)

**Schéma**
~ `backend/prisma/schema.prisma` — `Organization` +`logoUrl` +`primaryColor` +`description` ; `Event` +`description` +`logoUrl` +`primaryColor`
+ `backend/prisma/migrations/20260602_phase12_8_branding/migration.sql`

**Backend**
+ `backend/src/modules/organizations/dto/update-org-branding.dto.ts` — `UpdateOrgBrandingDto`
~ `backend/src/modules/events/dto/update-event.dto.ts` — +`description` +`logoUrl` +`primaryColor`
~ `backend/src/modules/events/events.service.ts` — `update()` persiste les champs branding
~ `backend/src/modules/organizations/organizations.service.ts` — +`updateBranding()`
~ `backend/src/modules/organizations/organizations.controller.ts` — +`PATCH /:id/branding`

**Admin panel**
~ `apps/admin/src/lib/api/admin-client.ts` — branding fields dans `Organization` et `AdminEvent` +`apiUpdateOrgBranding()` +`apiUpdateEvent()`
~ `apps/admin/src/app/(admin)/organizations/[id]/page.tsx` — section Branding (logo preview, color picker, description)
~ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — section Branding (description événement, logo, couleur)

### BLOC 12.9 — Dashboard opérateur filtré par fournisseur

**Backend**
~ `backend/src/modules/orders/orders.controller.ts` — `GET /event/:id/dashboard` accepte `?supplierId=uuid`
~ `backend/src/modules/orders/orders.service.ts` — `findDashboardByEvent()` filtre par `supplierId` si fourni

**Operator app**
~ `apps/operator/src/lib/api/orders-client.ts` — +`fetchMeWithMemberships()` +`OperatorMembership` ; `fetchDashboard()` accepte `supplierId?`
~ `apps/operator/src/app/page.tsx` — après login : lit `memberships[0].supplierId`, stocke `operator_supplier_id` + `operator_supplier_name` dans localStorage, affiche badge fournisseur
~ `apps/operator/src/app/dashboard/[eventId]/page.tsx` — lit `operator_supplier_id`, badge fournisseur dans header
~ `apps/operator/src/hooks/useDashboard.ts` — option `supplierId?` transmise à `fetchDashboard()`

---

## [0.21.0] — 2026-06-02 — Phase 13 : Mobile V1 — Parcours Client Complet

### Contexte
Implémentation du parcours client end-to-end sur l'application mobile React Native : scanner un QR code → choisir un stand → ajouter des articles → sélectionner un créneau → passer une commande demo → suivre la commande en temps réel.

### Backend — BLOC 13.1 (Endpoints publics)
+ `backend/src/modules/events/public-events.controller.ts` — 3 routes sans auth : GET /public/events/:id, GET /public/events/:id/suppliers/:supplierId/products, GET /public/events/:id/slots
~ `backend/src/modules/events/events.module.ts` — +PublicEventsController

### Backend — BLOC 13.2 (Demo Checkout)
~ `backend/src/modules/cart/cart.service.ts` — +demoCheckout() : crée un Order PAID sans Stripe (DemoGuard)
~ `backend/src/modules/cart/cart.controller.ts` — +POST /carts/:id/demo-checkout (DemoGuard + JwtAuthGuard)

### Mobile — BLOC 13.3 (Stores)
+ `apps/mobile/src/store/auth.store.ts` — token + user state avec AsyncStorage persistence
+ `apps/mobile/src/store/cart.store.ts` — panier local (items, slot, supplierId, eventId)

### Mobile — BLOC 13.4 (API Client)
+ `apps/mobile/src/lib/api/mobile-api.ts` — toutes les fonctions API mobiles (auth, public events, cart, orders)

### Mobile — BLOC 13.5 (Screens × 9)
+ `apps/mobile/src/screens/login.screen.tsx` — Login / Register dark theme
+ `apps/mobile/src/screens/qr-scanner.screen.tsx` — Scanner QR (VisionCamera v4) + saisie manuelle
+ `apps/mobile/src/screens/event-home.screen.tsx` — Accueil événement + sélecteur de stand
+ `apps/mobile/src/screens/supplier-catalog.screen.tsx` — Catalogue produits par catégorie + ajout panier
+ `apps/mobile/src/screens/cart.screen.tsx` — Panier (quantités, total, slot sélectionné)
+ `apps/mobile/src/screens/slot-selector.screen.tsx` — Sélection créneau horaire avec barre de capacité
+ `apps/mobile/src/screens/checkout.screen.tsx` — Récapitulatif + fake card + demo checkout
+ `apps/mobile/src/screens/order-confirmation.screen.tsx` — Confirmation animée avec N° de commande
+ `apps/mobile/src/screens/order-tracking.screen.tsx` — Suivi temps réel (polling 5s) avec étapes visuelles

### Mobile — BLOC 13.6 (Navigation + Deep Links)
~ `apps/mobile/src/navigation/root-navigator.tsx` — Stack complet 9 screens + deep link breakeat://event/:eventId + rehydrate auth
~ `apps/mobile/app.config.js` — +react-native-vision-camera plugin + camera permission iOS/Android

### Dépendances installées
+ `react-native-vision-camera@^4.7.3` — scanner QR natif (useCodeScanner)
+ `@react-native-async-storage/async-storage@^3.1.1` — persistance du token JWT

### Qualité
- pnpm typecheck (mobile) : exit 0 — 0 erreur
- pnpm lint (mobile) : exit 0 — 0 erreur
- pnpm typecheck (backend) : exit 0 — 0 erreur
- pnpm lint (backend) : exit 0 — 0 warning
- pnpm test (backend) : 273/273 — 22 suites — 0 failure

---

## [0.20.0] — 2026-06-02 — Phase 12 : Admin Panel V1 Complet + Operator Home V2

### Contexte
Complétion du panel admin pour le parcours démo end-to-end. Ajout de la gestion des lieux, catégories, produits, points de retrait, créneaux et QR codes. Wizard "Spartiates Hockey" en 1 clic. Refonte complète de l'accueil opérateur avec sélecteur d'événements.

### Fichiers créés / modifiés

#### Admin App — BLOC 12.1 (admin-client.ts)
~ `apps/admin/src/lib/api/admin-client.ts` — +12 fonctions API : Venue, Category, Product, PickupPoint, Slot (CRUD complet)

#### Admin App — BLOC 12.2 (Venues)
+ `apps/admin/src/app/(admin)/venues/page.tsx` — CRUD lieux avec copie UUID

#### Admin App — BLOC 12.3 (Produits par fournisseur)
+ `apps/admin/src/app/(admin)/suppliers/[id]/page.tsx` — Détail fournisseur : catégories + produits CRUD (prix €, catégorie, description)

#### Admin App — BLOC 12.4 (Event Detail enrichi)
~ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — +Venue info +Pickup Points +Time Slots +QR Code +Lien dashboard opérateur +Liens fournisseurs vers /suppliers/[id]

#### Admin App — BLOC 12.5 (Nav + Demo Wizard)
~ `apps/admin/src/app/(admin)/layout.tsx` — +Lieux +Démo Spartiates dans sidebar
+ `apps/admin/src/app/(admin)/demo-setup/page.tsx` — Wizard one-click "Spartiates Hockey" (9 étapes : venue → event → supplier → categories → products → pickup points → slots → activate)

#### Operator App — BLOC 12.6 (Home V2)
~ `apps/operator/src/app/page.tsx` — Home refaite : login dark + sélecteur d'événements auto-chargé depuis /auth/me/memberships + saisie UUID manuelle

### Score final
**TypeScript : 0 erreur | ESLint : 0 erreur | Tests : 273/273 — 22 suites — 0 failure**

---

## [0.19.0] — 2026-06-02 — Phase 11 : Admin Panel

### Contexte
Panel d'administration Next.js 15 complet pour gérer les organisations, événements, feature flags, paramètres et le simulateur. Authentification JWT propre, layout protégé, API client centralisé.

### Fichiers créés / modifiés

#### Backend — BLOC 11.1 (Auth + Users)
~ `backend/src/modules/users/users.service.ts` — +`findByIdWithMemberships(id)` (inclut memberships + organizations)
~ `backend/src/modules/auth/auth.service.ts` — +`meWithMemberships(userId)` délègue à UsersService
~ `backend/src/modules/auth/auth.controller.ts` — +`GET /auth/me/memberships` (JwtAuthGuard)

#### Admin App — BLOC 11.2 (Infrastructure)
~ `apps/admin/next.config.ts` — +`NEXT_PUBLIC_API_URL` dans env block
+ `apps/admin/src/lib/api/admin-client.ts` — client API complet (auth, orgs, events, suppliers, feature-flags, settings, simulator)

#### Admin App — BLOC 11.3 (Pages)
~ `apps/admin/src/app/page.tsx` — redirect client-side (token → /dashboard, sinon /login)
+ `apps/admin/src/app/login/page.tsx` — formulaire login → JWT → memberships → localStorage
+ `apps/admin/src/app/(admin)/layout.tsx` — layout protégé, sidebar nav, logout
+ `apps/admin/src/app/(admin)/dashboard/page.tsx` — health badge, 5 nav cards
+ `apps/admin/src/app/(admin)/organizations/[id]/page.tsx` — détail org, membres, add member
+ `apps/admin/src/app/(admin)/events/page.tsx` — liste + création événements
+ `apps/admin/src/app/(admin)/events/[id]/page.tsx` — détail événement, status, suppliers
+ `apps/admin/src/app/(admin)/feature-flags/page.tsx` — CRUD feature flags, toggle rapide
+ `apps/admin/src/app/(admin)/settings/page.tsx` — CRUD app settings, JSON value parsing
+ `apps/admin/src/app/(admin)/simulator/page.tsx` — seed/rush/progress/failures/clear + stat bar

#### Documentation
~ `.env.example` — +`NEXT_PUBLIC_API_URL` (admin app)

### Score final
**TypeScript : 0 erreur | ESLint : 0 erreur | Tests : 273/273 — 22 suites — 0 failure**

---

## [0.18.1] — 2026-06-02 — Audit Global Phases 1→10

### Contexte
Audit complet de toutes les phases 1 à 10. Objectif : 0 erreur TypeScript, 0 erreur ESLint, 100 % tests verts, structure parfaite.

### Bugs corrigés (TypeScript — 4 erreurs)
- `backend/src/logger/json-logger.ts` — méthode privée `formatMessage` renommée `serializeMessage` (conflict avec `ConsoleLogger.formatMessage` publique)
- `backend/src/modules/flaix/flaix.controller.ts:73` — clé composée Prisma `organizationId_userId` → `userId_organizationId`
- `backend/src/modules/orders/orders.controller.ts:227` — même correction
- `apps/operator/next.config.ts` — `hideSourceMaps: true` → `sourcemaps: { deleteSourcemapsAfterUpload: true }` (API @sentry/nextjs v9)

### Bugs corrigés (ESLint — 8 erreurs)
~ `backend/src/modules/flaix/flaix.service.ts` — params inutilisés `context` → `_context`, `userId` → `_userId`
~ `backend/src/modules/flaix/flaix.service.spec.ts` — import `TestingModule` supprimé
~ `backend/src/modules/realtime/realtime.gateway.spec.ts` — variable `configService` supprimée
~ `backend/src/modules/simulator/simulator.controller.ts` — import `Body` supprimé
~ `backend/src/modules/simulator/simulator.service.spec.ts` — import `OrderActorType` supprimé
~ `backend/src/modules/simulator/rush.spec.ts` — imports `NotFoundException` + `OrderActorType` supprimés
~ `backend/src/modules/orders/order-loss.spec.ts` — assertion `!` → safe conditional
~ `apps/operator/src/hooks/useDashboard.ts` — commentaire eslint-disable supprimé (plugin non installé)

### Améliorations
~ `backend/src/config/app.config.ts` — +`appEnv` (APP_ENV) +`logLevel` (LOG_LEVEL) dans registerAs
~ `.env.example` — +APP_ENV, +LOG_LEVEL, +NEXT_PUBLIC_SENTRY_DSN_OPERATOR, +SENTRY_AUTH_TOKEN, +SENTRY_ORG, +SENTRY_PROJECT

### Score final
**TypeScript : 0 erreur | ESLint : 0 erreur | Tests : 273/273 — 22 suites — 0 failure**

---

## [0.18.0] — 2026-06-02 — Phase 10 : QA, Rush Tests, Déploiement

### Contexte
Validation sous charge (rush 50/100 commandes, invariant de count), tests d'intégrité order-loss, Sentry frontend Next.js, logging JSON structuré, Docker Compose production, déploiement Vercel, checklist de déploiement.

### Ajouté (backend — tests)
+ backend/src/modules/simulator/rush.spec.ts — 18 tests (rush 50/100, progressOrders no-loss, combined, getStats)
+ backend/src/modules/orders/order-loss.spec.ts — 14 tests (terminal states, reconnect, count conservation, projection minimale)

### Ajouté (backend — infrastructure)
+ backend/src/logger/json-logger.ts — ConsoleLogger subclass JSON one-line (prod) / coloré (dev)
+ backend/Dockerfile — multi-stage build (deps → builder → runner, node:22-alpine, non-root)

### Ajouté (frontend — operator)
+ apps/operator/sentry.client.config.ts — init Sentry navigateur (DSN, replays, beforeSend)
+ apps/operator/sentry.server.config.ts — init Sentry Node.js
+ apps/operator/sentry.edge.config.ts — init Sentry Edge
+ apps/operator/instrumentation.ts — hook Next.js 15 (charge sentry selon NEXT_RUNTIME)

### Ajouté (déploiement)
+ docker-compose.prod.yml — PostgreSQL 16 + Redis 7 + backend (réseau interne, volumes nommés)
+ DEPLOYMENT_CHECKLIST.md — 7 sections, 40+ items (secrets, Railway, Vercel, migrations, tests, smoke)

### Modifié
~ apps/operator/package.json — +@sentry/nextjs ^9.0.0
~ apps/operator/next.config.ts — withSentryConfig (tunnelRoute, hideSourceMaps, telemetry:false)
~ apps/operator/vercel.json — headers sécurité (HSTS, X-Frame-Options, CSP...) + rewrite /monitoring/*
~ backend/src/main.ts — new JsonLogger('Bootstrap') comme logger NestJS global; LOG_LEVEL par env

### Tests
**Total backend Phase 10 : 273 tests passants — 22 suites — 0 failure** (+23 nouveaux tests)

---

## [0.16.0] — 2026-06-01 — Phase 8 : Dashboards + Public Screens

### Contexte
Dashboard kanban temps réel pour l'opérateur + écran public des commandes prêtes pour les clients. Couche frontend complète : socket.io-client, hooks réactifs, composants Storybook.

### Ajouté (backend)
+ backend/src/modules/orders/dto/assign-slot.dto.ts
+ backend/src/modules/flaix/flaix.controller.ts — GET rush-status + GET decisions
+ backend/src/modules/simulator/simulator.service.spec.ts — 15 tests

### Modifié (backend)
~ backend/src/modules/orders/orders.service.ts — +findDashboardByEvent() +assignOrderToSlot()
~ backend/src/modules/orders/orders.service.spec.ts — +5 tests (dashboard + assignSlot)
~ backend/src/modules/orders/orders.controller.ts — +GET /event/:eid/dashboard +PATCH /:id/assign-slot
~ backend/src/modules/orders/orders.module.ts — import SlotsModule
~ backend/src/modules/flaix/flaix.module.ts — controllers: [FlaixController]
~ backend/src/modules/simulator/simulator.service.ts — +progressOrders() +randomFailures() +getStats()
~ backend/src/modules/simulator/simulator.controller.ts — +3 nouveaux endpoints

### Ajouté (frontend)
+ apps/operator/src/lib/realtime/socket-client.ts — socket.io-client dynamique, JWT, dedup
+ apps/operator/src/lib/api/orders-client.ts — REST API client complet
+ apps/operator/src/components/StatusBadge.tsx
+ apps/operator/src/components/OrderCard.tsx
+ apps/operator/src/components/DashboardColumn.tsx
+ apps/operator/src/components/NotificationPopup.tsx
+ apps/operator/src/components/PublicScreenRow.tsx
+ apps/operator/src/hooks/useSound.ts — Web Audio API (beeps)
+ apps/operator/src/hooks/useDashboard.ts — useReducer + socket + polling fallback
+ apps/operator/src/app/dashboard/[eventId]/page.tsx — kanban opérateur
+ apps/operator/src/app/public/[eventId]/page.tsx — écran public sans auth
+ apps/operator/src/stories/DashboardColumn.stories.tsx
+ apps/operator/src/stories/NotificationPopup.stories.tsx
+ apps/operator/src/stories/PublicScreenRow.stories.tsx

### Modifié (frontend)
~ apps/operator/src/app/page.tsx — landing page (liens dashboard + public)
~ apps/operator/src/stories/OrderCard.stories.tsx — 7 stories (uses real component)
~ apps/operator/package.json — socket.io-client ^4.8.1

### Notes techniques
- Dynamic import socket.io-client → évite erreur SSR Next.js App Router
- `new_order` socket → resync REST complet (payload socket ne contient pas les items)
- `order_ready` socket → NotificationPopup + son (Web Audio OscillatorNode)
- Polling fallback toutes les 10s quand socket déconnecté
- PublicScreenRow = ZÉRO PII (pas de nom, prix, articles)
- Auto-prune écran public : commandes >5 min purgées toutes les 30s

### Tests
42 tests backend passants dans les 2 suites modifiées (Phase 8 ajout : 20 tests)
**Total backend : 221 tests passants, 18 suites, 0 failure**

---

## [0.17.1] — 2026-06-01 — Audit Phase 9 : P2 fixes

### P2 — ?scope= query param non validé (→ Prisma 500)
~ feature-flags.controller.ts — guard inline : BadRequestException si scope ∉ FlagScope
~ app-settings.controller.ts — idem

### P2 — Validation cross-champ absente dans set()
~ feature-flags.service.ts — BadRequestException si GLOBAL+scopeId ou ORG/EVENT sans scopeId
~ app-settings.service.ts — idem

### P2 — findFirst(GLOBAL) sans scopeId: null (fallback défensif)
~ feature-flags.service.ts — where: { key, scope: GLOBAL, scopeId: null }
~ app-settings.service.ts — idem

### P2 — FeatureFlagsService.remove() sans NotFound guard (→ Prisma P2025 non intercepté)
~ feature-flags.service.ts — findUnique avant delete + NotFoundException (miroir AppSettings)

### Tests (+5)
~ feature-flags.service.spec.ts — +3 (GLOBAL+scopeId, ORG sans scopeId, NotFoundException remove)
~ app-settings.service.spec.ts — +2 (GLOBAL+scopeId, EVENT sans scopeId)
**Total : 250 tests passants, 20 suites, 0 failure**

---

## [0.17.0] — 2026-06-01 — Phase 9 : CMS + Feature Flags

### Contexte
Feature flags sans redéploiement avec résolution EVENT > ORG > GLOBAL. CMS basique (AppSettings) key-value JSON par scope. CORS hardening gateway Socket.IO. Hook frontend `useFeatureFlag`.

### Ajouté (backend)
+ backend/prisma/migrations/20260601_phase9_feature_flags_cms/migration.sql
+ backend/src/modules/feature-flags/dto/set-feature-flag.dto.ts
+ backend/src/modules/feature-flags/feature-flags.service.ts — resolve() list() set() remove()
+ backend/src/modules/feature-flags/feature-flags.service.spec.ts — 10 tests
+ backend/src/modules/feature-flags/feature-flags.controller.ts — 4 endpoints
+ backend/src/modules/feature-flags/feature-flags.module.ts
+ backend/src/modules/app-settings/dto/set-app-setting.dto.ts
+ backend/src/modules/app-settings/app-settings.service.ts — get() list() set() remove()
+ backend/src/modules/app-settings/app-settings.service.spec.ts — 11 tests
+ backend/src/modules/app-settings/app-settings.controller.ts — 4 endpoints
+ backend/src/modules/app-settings/app-settings.module.ts

### Modifié (backend)
~ backend/prisma/schema.prisma — +enum FlagScope +model FeatureFlag +model AppSetting
~ backend/src/app.module.ts — +FeatureFlagsModule +AppSettingsModule
~ backend/src/modules/realtime/realtime.gateway.ts — CORS_ORIGINS env (fix P2 depuis Phase 6)

### Ajouté (frontend)
+ apps/operator/src/hooks/useFeatureFlag.ts — hook useFeatureFlag(key, options)

### Tests
**Total backend : 245 tests passants, 20 suites, 0 failure** (+21 nouveaux tests Phase 9)

---

## [0.16.1] — 2026-06-01 — Audit Phase 8 : P1 + P2 fixes

### Contexte
Audit post-Phase 8. 1 bug P1 (écran public vide), 3 issues P2 (failRate non borné, flaix sans contrôle org, fullscreen desync).

### P1 — Écran public : 401 silencieux au chargement
**Cause :** `GET /orders/event/:id/dashboard` est protégé par `JwtAuthGuard`. L'écran public appelait cet endpoint sans token → 401 silencieux → liste vide.
**Fix :**
+ backend/src/modules/orders/public-orders.controller.ts — nouveau contrôleur `@Controller('public/orders')` sans guard, retourne seulement `{id, publicOrderNumber, pickupPointId, updatedAt}` (zéro PII)
~ backend/src/modules/orders/orders.service.ts — +`findReadyByEvent()` avec `select` minimal
~ backend/src/modules/orders/orders.module.ts — ajout `PublicOrdersController` dans `controllers`
~ apps/operator/src/app/public/[eventId]/page.tsx — endpoint `GET /public/orders/event/:id/ready`

### P2 — failRate non borné dans randomFailures()
~ backend/src/modules/simulator/simulator.service.ts — `const rate = Math.max(0, Math.min(1, failRate))`

### P2 — FlaixController : endpoints accessibles à n'importe quel utilisateur JWT
~ backend/src/modules/flaix/flaix.controller.ts — injection `PrismaService` + `assertOrgMemberForEvent()` vérifie membership avant chaque réponse

### P2 — isFullscreen désynchronisé si l'utilisateur sort via Echap
~ apps/operator/src/app/dashboard/[eventId]/page.tsx — listener `fullscreenchange` + toggle sans `setState` manuel
~ apps/operator/src/app/public/[eventId]/page.tsx — idem

### Tests
+ 3 tests pour `findReadyByEvent` dans `orders.service.spec.ts`
**Total backend : 224 tests passants, 18 suites, 0 failure**

---

## [0.15.0] — 2026-06-01 — Phase 7 : Slots + Flaix Foundation

### Contexte
Gestion des créneaux de retrait et fondation de l'intégration Flaix.

### Ajouté
+ backend/prisma/migrations/20260601_phase7_slots_flaix/migration.sql
+ backend/src/modules/slots/dto/create-slot.dto.ts
+ backend/src/modules/slots/dto/update-slot.dto.ts
+ backend/src/modules/slots/slots.service.ts — CRUD + gestion capacité atomique + assignOrderToSlot
+ backend/src/modules/slots/slots.service.spec.ts — 21 tests
+ backend/src/modules/slots/slots.controller.ts — GET/POST/PATCH/DELETE /events/:eventId/slots
+ backend/src/modules/slots/slots.module.ts
+ backend/src/modules/flaix/flaix.service.ts — stub HTTP + fallback + recordDecision
+ backend/src/modules/flaix/flaix.service.spec.ts — 12 tests
+ backend/src/modules/flaix/flaix.module.ts

### Modifié
~ backend/prisma/schema.prisma — enums SlotStatus/SlotSource/FlaixDecisionType ; modèles Slot + FlaixDecision ; selectedSlotId sur Cart ; relation slot sur Order ; reverse relations Event/Supplier/PickupPoint
~ backend/src/app.module.ts — SlotsModule + FlaixModule enregistrés (Phase 7)

### Notes techniques
- Flaix = stub Phase 7 — HTTP call scaffoldé mais retourne null tant que FLAIX_API_URL n'est pas renseigné
- Incrémentation currentLoad atomique via updateMany + WHERE conditionnel (race-safe, même pattern que stock)
- FlaixDecision.decisionId = clé d'idempotence Flaix (UNIQUE en DB) — double application silencieusement ignorée
- FK orders.slot_id existait depuis Phase 5 (colonne sans contrainte) — Phase 7 attache la contrainte FK

### Tests
203 passing, 0 failures (17 suites — +2 nouvelles : slots: 21, flaix: 12)

---

## [0.14.0] — 2026-06-01 — Bloc 6.3 : Storybook + Mobile Pipeline + Simulator

### Contexte
Infrastructure de validation Phase 6 : Storybook (admin + operator), pipeline EAS Build mobile, toggle DEMO_MODE, et skeleton simulateur d'événements.

### Ajouté
+ apps/admin/.storybook/ — config @storybook/nextjs (main.ts + preview.ts)
+ apps/admin/src/stories/StatusBadge.stories.tsx — 8 variants + AllStatuses story
+ apps/operator/.storybook/ — idem
+ apps/operator/src/stories/OrderCard.stories.tsx — 4 états PAID/ACCEPTED/PREPARING/READY
+ apps/mobile/eas.json — profils EAS : development / preview / production
+ apps/mobile/app.config.js — config Expo bare workflow (iOS + Android)
+ .github/workflows/mobile-preview.yml — build EAS sur push mobile/**, post QR en commentaire commit
+ backend/src/common/guards/demo.guard.ts — 403 sauf DEMO_MODE=true
+ backend/src/modules/simulator/ — seedEvent(), simulateRush(), clearEvent()

### Modifié
~ apps/admin/package.json + apps/operator/package.json — scripts storybook:6006 / storybook:6007
~ backend/src/main.ts — garde sécurité : exit(1) si DEMO_MODE=true ET NODE_ENV=production
~ backend/src/app.module.ts — SimulatorModule enregistré
~ pnpm-workspace.yaml — esbuild + core-js-pure autorisés

### Notes techniques
- SimulatorModule toujours chargé, DemoGuard retourne 403 en prod (pas de chargement conditionnel)
- Commandes demo préfixées DEMO- pour purge facile
- EAS projectId=FILL_IN à remplir via `eas init`, EXPO_TOKEN secret GitHub requis

### Tests
170 passing, 0 failures (inchangé — pas de nouveaux tests backend pour ce bloc)

---

## [0.13.0] — 2026-06-01 — Bloc 6.2 : Socket.IO Gateway + Outbox Realtime

### Contexte
Couche temps réel complète : gateway Socket.IO avec auth JWT, gestion des rooms, et émission outbox-compliant après chaque commit DB.

### Ajouté
+ backend/src/modules/realtime/realtime.gateway.ts — gateway Socket.IO, JWT auth au connect, join_room / leave_room
+ backend/src/modules/realtime/realtime.service.ts — emitNewOrder, emitOrderUpdated, emitOrderReady
+ backend/src/modules/realtime/realtime.module.ts — JwtModule.registerAsync + export RealtimeService
+ backend/src/modules/realtime/dto/join-room.dto.ts — validation nom de room (type:uuid)
+ backend/src/modules/realtime/realtime.gateway.spec.ts — 11 tests
+ backend/src/modules/realtime/realtime.service.spec.ts — 8 tests

### Modifié
~ backend/src/modules/orders/orders.service.ts — inject RealtimeService + emit outbox
~ backend/src/modules/orders/orders.service.spec.ts — mock RealtimeService + assertions outbox
~ backend/src/modules/orders/orders.module.ts — import RealtimeModule
~ backend/src/app.module.ts — import RealtimeModule (Phase 6)
~ backend/package.json + pnpm-lock.yaml — socket.io packages ajoutés

### Règles respectées
- Outbox rule : guard avant $transaction, emit après commit (jamais inversé)
- eventId payload = UUID de dédup realtime (≠ concert eventId — conflit nommage résolu)
- Token handshake.auth prioritaire sur Authorization header
- Disconnect immédiat si JWT invalide ou absent

### Tests
170 tests passing, 0 failures (15 suites)

---

## [0.12.0] — 2026-06-01 — Bloc 6.1 : Order State Machine + Audit Trail

### Contexte
Implémentation de la machine d'états des commandes côté opérateur : guard de transitions, 6 endpoints PATCH, snapshot pour le dashboard, enregistrement de l'audit trail atomique.

### Ajouté
+ backend/src/modules/orders/order-state-machine.service.ts — garde pur, 15 transitions autorisées
+ backend/src/modules/orders/order-state-machine.service.spec.ts — 30 tests (map, 15 paths valides, 12 invalides, isAllowed, allowedFrom)
+ backend/src/modules/orders/dto/transition-order.dto.ts — champ `reason` optionnel (max 500 chars)

### Modifié
~ backend/src/modules/orders/orders.service.ts — transition(), findActiveByEvent(), findAuditTrail() ; fix orderBy → createdAt
~ backend/src/modules/orders/orders.service.spec.ts — 35 tests (existants + nouveaux blocs transition/find)
~ backend/src/modules/orders/orders.controller.ts — réécriture complète : 6 PATCH opérateur + GET dashboard + 2 GET client
~ backend/src/modules/orders/orders.module.ts — OrderStateMachineService ajouté providers/exports

### Garanties techniques
- assertTransition() tire avant tout écrit DB → la transaction n'est jamais ouverte si la transition est invalide
- transition() utilise $transaction([order.update, audit.create]) → atomique
- 15 transitions réelles (correction du commentaire "17" erroné dans le service)
- État READY non annulable — oblige le chemin recovery

### Tests
151 tests passing, 0 failures (13 suites)

---

## [0.11.0] — 2026-06-01 — Bloc 6.0 : Infrastructure Staging complète

### Contexte
Déploiement complet de l'infrastructure staging : Vercel (admin + operator), Railway (NestJS backend + PostgreSQL + Redis), GitHub Secrets, wiring cross-env.

### URLs actives
- Admin :    https://breakeat-admin-admin.vercel.app ✅
- Operator : https://breakeat-operator-git-main-breakeatapp-1555s-projects.vercel.app ✅
- Backend :  https://breakeat-admin-production.up.railway.app — GET /health → {"status":"ok"} ✅

### Ajouté
+ nixpacks.toml (racine) — build Railway : COREPACK_INTEGRITY_KEYS='', corepack, pnpm --filter backend
+ railway.json (racine) — builder NIXPACKS, healthcheckPath /health, restart ON_FAILURE

### Modifié
~ apps/admin/vercel.json — pattern propre : installCommand cd ../.. && pnpm install, buildCommand pnpm build
~ apps/operator/vercel.json — idem
~ apps/admin/src/app/layout.tsx + page.tsx — titre BREAK EAT corrigé
~ apps/operator/src/app/layout.tsx + page.tsx — idem
~ backend/package.json — express ajouté en dépendance directe (fix Cannot find module 'express')
~ pnpm-lock.yaml — mis à jour

### Fixes techniques notables
- COREPACK_INTEGRITY_KEYS='' : contourne le bug Node.js 22 / corepack signing key mismatch
- Root Directory Railway vidé : pnpm-lock.yaml doit être accessible depuis la racine
- express déclaré explicitement : pnpm strict mode ne remonte pas les deps transitives
- Prisma generate dans le build script : évite les 44 erreurs TypeScript en CI

### GitHub Secrets configurés
VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID_ADMIN, VERCEL_PROJECT_ID_OPERATOR, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET

---

## [0.10.3] — 2026-06-01 — Codex Audit Phase 5 (2e passe) : 3 P1 + 2 P2 fixes

### Contexte
Deuxième audit Codex après les corrections [0.10.2]. Les gros correctifs Phase 5 sont validés ; 3 P1 + 2 P2 bloquaient le passage à l'étape infra/design. Tout est corrigé ci-dessous.

### Modifié (P1 fixes)
~ backend/src/modules/cart/cart.service.ts :
    - **P1 #1 (snapshot prix écrit trop tôt)** — le freeze des prix se fait MAINTENANT après le succès Stripe, dans UNE transaction unique avec la bascule CHECKOUT_PENDING. Un échec Stripe laisse donc le cart OPEN, sans snapshot.
    - computeView() : garde défensive — tant que status === OPEN, on lit TOUJOURS le prix live (un snapshot résiduel ne peut plus fausser le total au retry).
~ backend/src/modules/cart/cart.service.spec.ts :
    - test renommé "freezes prices + transitions ONLY after Stripe succeeds"
    - + nouveau test "does NOT freeze/transition when Stripe fails" (régression P1 #1)
~ package.json :
    - **P1 #2 (pipeline cassé via corepack)** — build/lint/typecheck/test → `turbo run X`. turbo est dans node_modules/.bin (donc résolvable par corepack/pnpm), alors que `pnpm -r` appelé depuis un script ne l'était pas → c'était LA cause racine.
    - build:turbo supprimé (redondant), clean → `turbo run clean`
~ backend/package.json :
    - **P1 #2** — jest `maxWorkers: 1` → tests déterministes, plus de flakiness en parallèle, plus besoin de `--runInBand`
~ .gitignore :
    - **P1 #3 (sécurité)** — ignore explicite : firebase-app-distribution-key.json, firebase-adminsdk-*.json, **/google-services.json, **/GoogleService-Info.plist, service-account*.json, gcp-*.json, *.p8, *.p12, *.mobileprovision, *.cer, *.certSigningRequest, *.keystore, *.jks
    - PAS de `*.json` en bloc (package.json / tsconfig.json / vercel.json préservés)
    - + .claude/settings.local.json (config locale machine, ne doit pas être partagée)
~ BLOC_6_0_SETUP_GUIDE.md :
    - ligne 168 : fausse affirmation "`*.json` protège la clé Firebase" corrigée (la vérité : ignore nominatif + patterns ciblés, vérifier via `git status`)
    - **P2 (contradiction Vercel)** — build/install/output : source de vérité unique = `apps/*/vercel.json` ; le dashboard Vercel reste vide

### Ajouté
+ .gitattributes (normalisation LF pour les builds Linux Railway/Vercel ; binaires .docx/.pdf/.p8/etc. marqués binary)
+ **Repo git initialisé en local** (branche `main`) + commit initial `fbf6147` (P2 "pas de repo") — AUCUN remote, AUCUN push (attend que le product owner crée le repo GitHub)

### Vérifications
- **95 tests backend ✅** (12 suites, séquentiel ~16s, 0 flaky)
- `corepack pnpm typecheck` + `corepack pnpm lint` → **VERTS via les scripts** (la commande exacte que Codex disait cassée passe maintenant)
- turbo run typecheck/lint : 4/4 packages OK
- .gitignore vérifié via `git check-ignore` : 10 chemins sensibles ignorés, 0 fichier de config ignoré par erreur ; seul `.env.example` (placeholders) serait suivi

### Reste (hors P1, acté avec le product owner)
- P2 : push GitHub à faire (créer le repo distant, puis `git remote add` + push) avant import Vercel/Railway
- P2 : Phase 6 métier (OrderStatus state machine, realtime) pas commencée — vient après Bloc 6.0

---

## [0.10.2] — 2026-06-01 — Codex Audit Phase 5 : P1/P2/P3 fixes

### Ajouté
+ backend/prisma/migrations/20260601_phase5_codex_audit/migration.sql (cart_items.price_snapshot_cents + CHECK)
+ phases de DEV/PHASE_4_PRODUCTS_CATEGORIES_STOCK.docx
+ phases de DEV/PHASE_5_CART_CHECKOUT_STRIPE_ORDERS.docx
+ phases de DEV/generate_phase4.js
+ phases de DEV/generate_phase5.js

### Modifié (P1 fixes)
~ backend/prisma/schema.prisma (CartItem.priceSnapshotCents ajouté)
~ backend/src/modules/cart/cart.service.ts (freeze prix au checkout + use snapshot in computeView)
~ backend/src/modules/cart/cart.service.spec.ts (test "freezes prices on every CartItem" ajouté)
~ backend/src/modules/orders/orders.service.ts :
    - utilise priceSnapshotCents pour les snapshots OrderItem (P1 #2)
    - vérification défensive subtotal === intent.amount (P1 #2)
    - décrémentation atomique tx.stock.updateMany WHERE quantity >= item.quantity (P1 #1)
    - tx.payment.upsert au lieu de create (P1 #3 retry après FAILED)
~ backend/src/modules/orders/orders.service.spec.ts (+4 tests audit guards : no-snapshot, divergence, oversell, upsert)
~ backend/src/modules/payments/stripe.service.ts (P3 #7 — commentaire destination charges corrigé)
~ package.json (build: turbo → pnpm -r run, build:turbo conservé en backup)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md
~ CHANGELOG.md

### Résultat
- 94 tests backend ✅ (+5 nouveaux audit guards)
- Pipeline racine : typecheck + lint + build TOUS verts (4 packages chacun)
- 5 DOCX phases livrés (1, 2, 3, 4, 5)

---

## [0.10.1] — 2026-05-28 — Bloc 6.0 scaffolding (infrastructure)

### Ajouté
+ BLOC_6_0_SETUP_GUIDE.md (guide pas-à-pas pour le product owner : Vercel + Railway + Firebase + GitHub Secrets)
+ apps/admin/vercel.json (config monorepo Vercel)
+ apps/operator/vercel.json (config monorepo Vercel)
+ backend/railway.json (config Railway + healthcheck /health)
+ .github/workflows/deploy-frontends.yml (CI auto-deploy Vercel sur push main)
+ .github/workflows/mobile-preview.yml (placeholder Fastlane + Firebase, activé quand iOS/Android natifs initialisés)

### Modifié
~ backend/src/config/app.config.ts (demoMode + stagingToken)
~ .env.example (DEMO_MODE + STAGING_ONLY_TOKEN)
~ brain/REMINDERS.md (décisions infra actées : Vercel + Railway + Firebase + Fastlane)

### À faire (côté product owner — voir BLOC_6_0_SETUP_GUIDE.md)
- Étape 1 : créer projets Vercel admin + operator
- Étape 2 : créer projet Railway avec PostgreSQL + Redis
- Étape 3 : créer projet Firebase + App Distribution
- Étape 4 : configurer GitHub Secrets
- Étape 5 (optionnelle) : domaines custom

---

## [0.10.0] — 2026-05-28 — Process update: Visual Validation Contract

### Ajouté
+ brain/PRODUCT_VALIDATION.md (contrat v1.0.0 : visual validation, Storybook, preview builds, staging, fake data, demo mode, QR codes, approval flow)
+ brain/REMINDERS.md (notes internes assistant : Cursor timing, design inputs, infra à prévoir)

### Modifié
~ brain/ROADMAP.md (Visual Validation Rule ajoutée + deliverables Phase 6 + Phase 8 enrichis)
~ brain/TASK_SUMMARY.md (entrée process update)
~ CHANGELOG.md (cette entrée)

### Impact
- À partir de Phase 6 : tout deliverable frontend doit inclure screenshots + preview build + QR code
- Phase 6 enrichie : ajoute setup staging + Storybook + EAS Build + simulateur fake data
- Phases 1-5 exemptes (backend-only) — validation technique acceptée

---

## [0.9.0] — 2026-05-27 — Phase 5: Cart, Checkout, Stripe Connect, Orders

### Ajouté
+ backend/prisma/migrations/20260527_phase5_stripe_connect/migration.sql
+ backend/src/modules/payments/stripe.service.ts
+ backend/src/modules/payments/payments.module.ts
+ backend/src/modules/suppliers/dto/create-onboarding-link.dto.ts
+ backend/src/modules/cart/dto/create-cart.dto.ts
+ backend/src/modules/cart/dto/update-cart.dto.ts
+ backend/src/modules/cart/dto/add-cart-item.dto.ts
+ backend/src/modules/cart/dto/update-cart-item.dto.ts
+ backend/src/modules/cart/cart.service.ts
+ backend/src/modules/cart/cart.service.spec.ts (12 tests)
+ backend/src/modules/cart/cart.controller.ts
+ backend/src/modules/cart/cart.module.ts
+ backend/src/modules/orders/orders.service.ts
+ backend/src/modules/orders/orders.service.spec.ts (5 tests)
+ backend/src/modules/orders/orders.controller.ts
+ backend/src/modules/orders/orders.module.ts
+ backend/src/modules/webhooks/stripe-webhooks.controller.ts
+ backend/src/modules/webhooks/stripe-webhooks.service.ts
+ backend/src/modules/webhooks/stripe-webhooks.service.spec.ts (4 tests)
+ backend/src/modules/webhooks/webhooks.module.ts

### Modifié
~ backend/package.json (+stripe 17.7.0)
~ backend/prisma/schema.prisma (StripeAccountStatus, CartStatus, OrderStatus, PaymentStatus, OrderActorType enums; Cart, CartItem, Order, OrderItem, Payment, OrderAuditTrail, WebhookEvent models; Supplier extended with stripeAccountStatus + mirrors)
~ backend/src/main.ts (raw body for /webhooks/stripe; bodyParser disabled; prefix exclude webhooks)
~ backend/src/config/app.config.ts (stripe.apiVersion, platformFeeBps, connect.returnUrl/refreshUrl)
~ backend/src/app.module.ts (PaymentsModule, CartModule, OrdersModule, WebhooksModule)
~ backend/src/modules/suppliers/suppliers.service.ts (Stripe Connect onboarding + status refresh)
~ backend/src/modules/suppliers/suppliers.controller.ts (POST /stripe/onboarding-link, GET /stripe/status)
~ .env.example (STRIPE_API_VERSION, STRIPE_PLATFORM_FEE_BPS, STRIPE_CONNECT_RETURN_URL, STRIPE_CONNECT_REFRESH_URL)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md
~ CHANGELOG.md

---

## [0.8.0] — 2026-05-26 — Codex Audit Phase 4 : P1/P2/P3

### Ajouté
+ backend/src/modules/categories/categories.service.spec.ts (8 tests)

### Modifié
~ backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql (TEXT → UUID sur tous les IDs et FKs)
~ backend/src/modules/stock/stock.service.ts (BadRequestException import ; requirePickupPointInOrg vérifie supplier)
~ backend/src/modules/stock/stock.service.spec.ts (test cross-supplier pickup point ajouté)
~ backend/src/modules/products/products.service.ts (validateDateWindow() : availableUntil > availableFrom)
~ backend/src/modules/products/products.service.spec.ts (test date window invalide ajouté)
~ package.json (typecheck/lint : turbo → pnpm -r run)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ CHANGELOG.md

---

## [0.7.0] — 2026-05-26 — Codex Audit P1: globalRole + corepack

### Ajouté
+ .npmrc (package-manager-strict=false)

### Modifié
~ backend/src/modules/auth/strategies/jwt.strategy.ts (globalRole dans select + return { ...payload, globalRole: user.globalRole })
~ backend/src/modules/auth/strategies/jwt.strategy.spec.ts (test: DB globalRole écrase le JWT globalRole)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ CHANGELOG.md

---

## [0.6.0] — 2026-05-26 — Phase 4: Products, Categories, Stock

### Ajouté
+ backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql
+ backend/src/modules/categories/dto/create-category.dto.ts
+ backend/src/modules/categories/dto/update-category.dto.ts
+ backend/src/modules/categories/categories.service.ts
+ backend/src/modules/categories/categories.controller.ts
+ backend/src/modules/categories/categories.module.ts
+ backend/src/modules/products/dto/create-product.dto.ts
+ backend/src/modules/products/dto/update-product.dto.ts
+ backend/src/modules/products/products.service.ts
+ backend/src/modules/products/products.service.spec.ts
+ backend/src/modules/products/products.controller.ts
+ backend/src/modules/products/products.module.ts
+ backend/src/modules/stock/dto/create-stock.dto.ts
+ backend/src/modules/stock/dto/update-stock.dto.ts
+ backend/src/modules/stock/dto/update-stock-availability.dto.ts
+ backend/src/modules/stock/stock.service.ts
+ backend/src/modules/stock/stock.service.spec.ts
+ backend/src/modules/stock/stock.controller.ts
+ backend/src/modules/stock/stock.module.ts

### Modifié
~ backend/prisma/schema.prisma (enums CategoryStatus, ProductStatus ; modèles Category, Product, Stock ; relations Supplier + PickupPoint)
~ backend/src/app.module.ts (ajout CategoriesModule, ProductsModule, StockModule)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ CHANGELOG.md

---

## [0.5.0] — 2026-05-26 — Codex Audit Phase 2/3

### Ajouté
+ backend/src/modules/auth/strategies/jwt.strategy.spec.ts
+ backend/src/modules/organizations/organizations.service.spec.ts
+ backend/src/modules/pickup-points/pickup-points.service.spec.ts

### Modifié
~ turbo.json (test.dependsOn: [] — indépendant du build)
~ apps/mobile/package.json (lint: eslint src/, build: tsc --noEmit)
~ backend/src/common/helpers/require-org-access.ts (SUPER_ADMIN DB bypass)
~ backend/src/modules/organizations/organizations.service.ts (SUPER_ADMIN + NotFoundException targetUser)
~ backend/src/modules/organizations/organizations.controller.ts (user.globalRole passé)
~ backend/src/modules/auth/strategies/jwt.strategy.ts (async validate + isActive DB check)
~ backend/src/modules/pickup-points/pickup-points.service.ts (venueId === event.venueId)
~ backend/src/modules/suppliers/suppliers.service.ts (OrgRole.OPERATOR)
~ backend/src/modules/events/events.service.spec.ts (user mock ajouté)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md

---

## [0.4.0] — 2026-05-25 — Phase 3: Events, Venues, Suppliers

### Ajouté
+ backend/prisma/schema.prisma (enums: VenueStatus, EventStatus, SupplierStatus, PickupPointStatus ; modèles: Venue, Event, EventSupplier, Supplier, PickupPoint)
+ backend/prisma/migrations/20260525_phase3_events_venues_suppliers/migration.sql
+ backend/src/common/helpers/require-org-access.ts
+ backend/src/modules/venues/dto/create-venue.dto.ts
+ backend/src/modules/venues/dto/update-venue.dto.ts
+ backend/src/modules/venues/venues.service.ts
+ backend/src/modules/venues/venues.controller.ts
+ backend/src/modules/venues/venues.module.ts
+ backend/src/modules/suppliers/dto/create-supplier.dto.ts
+ backend/src/modules/suppliers/dto/update-supplier.dto.ts
+ backend/src/modules/suppliers/dto/update-supplier-status.dto.ts
+ backend/src/modules/suppliers/suppliers.service.ts
+ backend/src/modules/suppliers/suppliers.controller.ts
+ backend/src/modules/suppliers/suppliers.module.ts
+ backend/src/modules/events/dto/create-event.dto.ts
+ backend/src/modules/events/dto/update-event.dto.ts
+ backend/src/modules/events/dto/update-event-status.dto.ts
+ backend/src/modules/events/dto/attach-supplier.dto.ts
+ backend/src/modules/events/events.service.ts
+ backend/src/modules/events/events.service.spec.ts
+ backend/src/modules/events/events.controller.ts
+ backend/src/modules/events/events.module.ts
+ backend/src/modules/pickup-points/dto/create-pickup-point.dto.ts
+ backend/src/modules/pickup-points/dto/update-pickup-point.dto.ts
+ backend/src/modules/pickup-points/pickup-points.service.ts
+ backend/src/modules/pickup-points/pickup-points.controller.ts
+ backend/src/modules/pickup-points/pickup-points.module.ts

### Modifié
~ backend/src/app.module.ts (ajout VenuesModule, SuppliersModule, EventsModule, PickupPointsModule)
~ brain/ENGINEERING_MANUAL.md (section Phase 3 ajoutée)
~ brain/TASK_SUMMARY.md (entrée Phase 3 ajoutée)
~ DEVELOPMENT_LOG.md (Phase 3 marquée terminée)
~ CHANGELOG.md (cette entrée)

---

## [0.3.0] — 2026-05-25 — Codex Audit Corrections

### Ajouté
+ apps/mobile/src/lib/config/env.ts
+ apps/mobile/src/types/globals.d.ts

### Modifié
~ apps/mobile/src/instrument.ts (process.env → ENV.*)
~ apps/mobile/src/lib/api/api-client.ts (process.env.API_URL → ENV.API_URL)
~ apps/admin/package.json (lint: next lint → eslint src/)
~ apps/operator/package.json (lint: next lint → eslint src/)
~ backend/src/modules/auth/auth.service.ts (import argon2 supprimé — unused)
~ backend/src/modules/organizations/dto/add-member.dto.ts (import IsString supprimé — unused)
~ backend/src/main.ts (setGlobalPrefix exclude health)
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md

---

## [0.2.0] — 2026-05-25 — Phase 2: Auth + Organizations

### Ajouté
+ backend/prisma/schema.prisma (User, Organization, OrganizationMember, RefreshToken)
+ backend/prisma/migrations/20260525_phase2_auth_organizations/migration.sql
+ backend/src/database/prisma.service.ts
+ backend/src/database/prisma.module.ts
+ backend/src/common/enums/role.enum.ts
+ backend/src/common/decorators/current-user.decorator.ts
+ backend/src/common/decorators/roles.decorator.ts
+ backend/src/common/guards/jwt-auth.guard.ts
+ backend/src/common/guards/roles.guard.ts
+ backend/src/modules/users/users.service.ts
+ backend/src/modules/users/users.module.ts
+ backend/src/modules/auth/dto/register.dto.ts
+ backend/src/modules/auth/dto/login.dto.ts
+ backend/src/modules/auth/dto/refresh.dto.ts
+ backend/src/modules/auth/strategies/jwt.strategy.ts
+ backend/src/modules/auth/auth.service.ts
+ backend/src/modules/auth/auth.controller.ts
+ backend/src/modules/auth/auth.module.ts
+ backend/src/modules/auth/auth.service.spec.ts
+ backend/src/modules/organizations/dto/create-organization.dto.ts
+ backend/src/modules/organizations/dto/add-member.dto.ts
+ backend/src/modules/organizations/organizations.service.ts
+ backend/src/modules/organizations/organizations.controller.ts
+ backend/src/modules/organizations/organizations.module.ts

### Modifié
~ backend/package.json
~ backend/src/app.module.ts
~ pnpm-workspace.yaml
~ brain/ENGINEERING_MANUAL.md
~ brain/TASK_SUMMARY.md
~ DEVELOPMENT_LOG.md

---

## [0.1.0] — 2026-05-25 — Phase 1: Foundation

### Ajouté
+ package.json
+ pnpm-workspace.yaml
+ turbo.json
+ .prettierrc / .prettierignore
+ eslint.config.mjs
+ .gitignore
+ .env.example
+ docker-compose.yml
+ .github/workflows/ci.yml
+ DEVELOPMENT_LOG.md
+ backend/package.json + tsconfig + nest-cli.json
+ backend/src/main.ts
+ backend/src/instrument.ts
+ backend/src/app.module.ts
+ backend/src/config/app.config.ts
+ backend/src/health/health.module.ts
+ backend/src/health/health.controller.ts
+ backend/src/health/health.controller.spec.ts
+ apps/admin/ (Next.js 15 shell)
+ apps/operator/ (Next.js 15 shell + WebSocket stub)
+ apps/mobile/ (React Native CLI shell)
+ brain/ENGINEERING_MANUAL.md
+ brain/TASK_SUMMARY.md
