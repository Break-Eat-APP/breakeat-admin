# 🔖 POINT DE REPRISE — Break Eat

> **Où trouver quoi** — pour qui reprend le dossier :
>
> | Question | Document |
> |---|---|
> | Où en est-on, que faire ensuite ? | **ce fichier**, section « ÉTAT AU … — LIRE D'ABORD » |
> | Un bug : d'où vient-il ? | **`GUIDE_DEVELOPPEMENT/PHASES_DE_DEVELOPPEMENT.docx`**, section « Remonter à la cause d'un bug » |
> | Qu'a-t-on livré, quand, et pourquoi ? | `CHANGELOG.md` |
> | Toutes les phases et versions, d'un coup d'œil | `GUIDE_DEVELOPPEMENT/PHASES_DE_DEVELOPPEMENT.docx` (Word) ou `brain/ROADMAP.md` |
> | Je découvre le dossier, par où je commence ? | **`README.md`** (racine) puis `GUIDE_DEVELOPPEMENT/` |
> | Comment le code est-il organisé ? | `GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md` |
> | Pourquoi cette décision technique ? | `brain/ENGINEERING_MANUAL.md` |
> | Quel était le plan, phase par phase ? | `brain/ROADMAP.md` (0→10 planifiées, 11→22 reconstituées, index 24→73 puis versions) |
> | Résumé d'une session de travail | `brain/TASK_SUMMARY.md` (le plus récent en haut) |
> | Dernier audit | `brain/audits/AUDIT_2026-11-09_dernieres-modifications.md` |
> | État complet du dépôt, dette, tests (septembre) | `brain/audits/AUDIT_2026-09-18_etat-du-depot.md` |
> | Ordre de construction initial (phases 1→19) | `brain/archives/DEVELOPMENT_LOG.md` — historique, non tenu au-delà |
>
> Les 4 documents vivants sont `CHANGELOG.md`, `brain/ENGINEERING_MANUAL.md`,
> `brain/TASK_SUMMARY.md` et ce fichier. Le git complète.

_Dernière mise à jour : 2026-11-09 (soir) — lire d'abord « ÉTAT AU 09/11/2026 » ci-dessous. Les notes de mise à jour précédentes sont gardées en fin de fichier (« Historique des mises à jour »)._

## 🟢 ÉTAT AU 09/11/2026 (soir) — LIRE D'ABORD

> Cette section remplace « État au 06/09 » plus bas, gardé pour l'historique.
> Le détail de chaque livraison est dans `CHANGELOG.md` ; le pourquoi des
> décisions dans `brain/ENGINEERING_MANUAL.md` ; où vit le code dans
> `GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md` ; **toutes les phases et versions,
> et la méthode pour remonter à la cause d'un bug, dans
> `GUIDE_DEVELOPPEMENT/PHASES_DE_DEVELOPPEMENT.docx`** (régénéré par
> `GUIDE_DEVELOPPEMENT/generer-phases-docx.js`). Dernier audit :
> `brain/audits/AUDIT_2026-11-09_dernieres-modifications.md`.

### Ce qui tourne

| | État | Comment le vérifier |
|---|---|---|
| **CI GitHub** | ✅ **verte** sur `main` (7 jobs : Build, Tests, Tests d'intégration, Export web, TypeScript, Lint) — elle était ROUGE du 06/11 au 09/11 sans que personne ne la lise | `https://github.com/Break-Eat-APP/breakeat-admin/actions`, ou l'API `commits/<sha>/check-runs` (dépôt public) |
| **Serveur (Railway)** | En ligne, sert `acf6187` (le code serveur le plus récent) | `curl -s https://breakeat-admin-production.up.railway.app/health` → `commit`, à comparer à `git log -1 origin/main` |
| **Consoles (Vercel)** | Admin, back-office et opérateur, publiés depuis `main` | Voir « Déploiement des frontends » plus bas |
| **iOS** | **Build 44** (`f446939`, **version 1.1.2**) sur TestFlight le 11/11 — **l'icône est enfin nette, validée par Rémi sur son iPhone** (format Icon Composer, effets « verre » d'iOS 26 coupés : voir « L'icône iOS » dans les pièges). Mise à jour à distance 1.1.2 publiée le 11/11 (`5c993f4` : clavier, bouton « Signaler », encoches, « prête » durable). ⚠️ Les builds 41 à 43 (1.1.0 / 1.1.1) ne reçoivent plus les mises à jour à distance. Pour la vérification Apple : **la 44** | App Store Connect → TestFlight |
| **Android** | **Build 41 compilée** (mise à jour Expo 57.0.32 + mises à jour à distance). **Aucun envoi possible sur Google Play** avant que Google confirme la nouvelle clé d'importation (demandée le 09/11) | Play Console → Intégrité de l'application |
| **Connexion** | E-mail + mot de passe, Apple, Google (iOS vérifié ; Android : clients OAuth créés, pas encore essayé) | — |
| **Mot de passe oublié** | Code prêt, **masqué** tant que l'envoi de courriels n'est pas configuré | `GET /api/v1/auth/password-reset/available` → `false` |

### Ce qui a changé du 03 au 09/11

| Date | Quoi | Où lire |
|---|---|---|
| 05/11 | « Mes commandes » en **tickets** : numéro en orange, pastilles Toutes / En cours / Récupérées + sections | CHANGELOG 1.6.0 |
| 06/11 | **« À ne pas manquer »** : événements des lieux **favoris** (1 → 3, 2 → 2 chacun, 3+ → 1 chacun, 6 max), route `GET /public/events/a-venir` ; favoris gardés sur l'appareil | CHANGELOG 1.6.0 |
| 06/11 | Courriels signés « BreakEat » | CHANGELOG 1.6.0 |
| 06/11 | **Fiche d'un événement Flaix** : lien, adversaire, blason, affiche éditables ; aucune configuration Break Eat proposée ; erreurs de dates en français | CHANGELOG 1.6.0 |
| 09/11 | **Renommer un événement** depuis sa fiche | CHANGELOG 1.6.1 |
| 09/11 | **Notifications rangées par date** | CHANGELOG 1.6.2 |
| 09/11 | **Décompte dans la Live Activity** + **aperçu** super admin | CHANGELOG 1.7.0 |
| 09/11 | Build 38 ; clé Google Play protégée ; fichier Firebase branché | CHANGELOG 1.7.1 |
| 09/11 | **CI remise au vert** ; canaux Play remis dans le bon sens ; clé d'importation Android : réinitialisation demandée ; mise à jour Expo vérifiée (CI + build 39) ; audit ; fichier Word des phases | CHANGELOG 1.7.2 |
| 09/11 | **Ticket d'après la maquette**, « Noter » et « Récupérées » corrigés, **icône vectorielle `#FD4000`** — dans la prochaine build | CHANGELOG 1.7.3 |

### Ce qui reste — dans l'ordre

1. **Essayer la build 41 sur iPhone** : ouverture, connexion Apple
   et Google, notifications par date, puis Profil → Outils super admin →
   Aperçu de la Live Activity (décompte de 3 minutes, puis bascule sur
   l'heure de retrait). Personne n'a encore VU le décompte.
2. ✅ **Mise à jour Expo 57.0.32 fusionnée** (`b15a626`, demande de fusion
   #4) après CI verte, build iOS 39 et build Android `c9d56be3`. Sur un
   poste : `pnpm install --frozen-lockfile`. L'export web peut échouer sur le
   poste OneDrive (environnement) : la CI fait foi.
3. ✅ **Défauts de « Mes commandes » corrigés** (audit, constats 2 et 3), et
   **ticket redessiné d'après la maquette de Rémi**, **icône vectorielle**
   (`#FD4000`) — tout cela attend la **prochaine build iOS** (CHANGELOG 1.7.3).
4. **Passer le dépôt GitHub en privé** (décision de Rémi) — audit, constat 1.
   **Reporté par Rémi le 11/11.** Avant de le faire : (a) régler la CI pour
   qu'elle ne tourne pas sur les commits de documentation seule — mesuré le
   11/11 : ~10 min d'Actions par passage, 65 passages du 1er au 11/11, soit
   ~1 900 min/mois pour 2 000 gratuites en privé ; au-delà, sans moyen de
   paiement, GitHub ARRÊTE les workflows (sauvegarde de nuit et mise à jour à
   distance comprises) ; (b) prévoir que l'agent ne lit plus l'état de la CI
   sans identifiant (API publique) ; (c) vérifier Railway et Vercel au premier
   envoi. Marche à suivre : Settings → General → Danger Zone → Change
   repository visibility.
5. **Le flux des commandes Flaix — côté développeur Flaix.** Une commande
   passée dans Flaix ne crée rien chez BreakEat ; la Live Activity, la note,
   la fidélité et « Je suis arrivé » en dépendent, et les trois lieux en
   production sont en Flaix. Quand le flux arrive : y brancher la Live
   Activity (le décompte est prêt) et la **note du bon de commande** (choix
   de Rémi : la note porte sur la commande remontée — match, heure, numéro).
   Contexte : `brain/FRONTIERE_FLAIX_OPS.md`.
   **Le calendrier Flaix lu par BreakEat** (fin de la double saisie) : le
   cahier des charges à transmettre au développeur Flaix est prêt —
   `brain/FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md` (recommandé : le flux B).
   **La passerelle d'accès Flaix — ⏸️ EN ATTENTE, NE RIEN DÉVELOPPER** (consigne
   de Rémi, 10/11) : ouvrir Flaix depuis le tableau de bord sans se reconnecter.
   Spécifiée en section D du même cahier des charges (D1 lien signé à usage
   unique, D2 chiffres Flaix affichés dans BreakEat). On attend : le feu vert
   de Rémi, son choix D1 seul ou D1 puis D2, et la route + une clé de test
   côté Flaix (par canal sûr). Côté BreakEat, rien n'est commencé.
   **Le lien calendrier Flaix (option A) — ⏸️ EN ATTENTE du point de Rémi avec
   son développeur (10/11)**. Le souhait : un seul lien Flaix par lieu, qui
   ouvre la page Flaix rassemblant tous ses événements, pour ne plus rien
   retaper. Décidé : A maintenant, **B à demander aussi** au développeur Flaix,
   **C (iCal) en option** (« Ajouter les matchs à mon agenda » pour les
   supporters). Accepté par Rémi : le calendrier BreakEat est remplacé par
   celui de Flaix ; logos et affiches se font dans Flaix ; « À ne pas
   manquer » se remplit à la main (des matchs datés sans lien Flaix
   remontent bien, même en continu).
   ⛔ **NE PAS basculer un lieu Flaix en « Ouvert en continu » aujourd'hui** :
   l'écran Saison (`apps/mobile/src/screens/saison.screen.tsx`) n'a PAS de
   bouton « Commander » sans match daté — `saisonDuLieu` écarte le contenant
   permanent, `selection` reste nul, l'écran dit « Ce lieu prend les
   commandes en continu » et le client est bloqué. Même impasse pour tout
   lieu en continu (restaurant), Flaix ou non.
   Deux petits travaux proposés, **à ne lancer qu'après le feu vert** :
   1) l'écran Saison d'un lieu en continu montre un bouton « Commander » qui
   ouvre son lien (le calendrier Flaix) — indispensable pour l'option A ;
   2) une case « Message d'information » sur le lieu (ex. « La commande ouvre
   2 h avant chaque match »), affichée sur sa carte dans l'app — `ordersOpenAt`
   ne vaut que pour les matchs datés.
   **Tout piloter depuis Flaix (section E du cahier des charges, 10/11) — ⏸️ on
   y revient ensemble.** Rémi veut que le responsable de lieu travaille dans
   Flaix seulement. Il faut DEUX API, une par sens : Flaix construit E1 (ses
   commandes remontent chez BreakEat), BreakEat construit E2 (chiffres de
   l'app lus par Flaix) et E3 (campagnes et apparence pilotées depuis Flaix).
   ⚠️ **Aujourd'hui, une campagne lancée par un lieu Flaix n'atteint
   personne** : `scheduled-push.service.ts` (`destinataires`) cible les
   clients qui ont une `Order` dans le club, et les commandes Flaix n'en
   créent pas ; les favoris vivent sur le téléphone, le serveur ne les
   connaît pas. Correctif possible sans Flaix (≈ 1 jour) : remonter les
   favoris au serveur et cibler « a commandé OU a mis en favori ». Pas
   lancé : attendre le feu vert de Rémi.
   **LE PLAN DE DÉVELOPPEMENT DES API FLAIX ↔ BREAKEAT** (validé par Rémi le
   10/11, **à lancer APRÈS son point avec son développeur** — rien avant) :
   0. **Le point avec le développeur Flaix**, cahier des charges en main
      (`brain/FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md`, sections B et E
      surtout). En ressortir : ce que Flaix livre (B, E1, l'étiquette
      `[#breakeatId]`), ses dates, une adresse de préproduction, et les clés
      de test **par canal sûr**. Trancher : le responsable de lieu travaille-
      t-il dans Flaix seulement (alors D devient inutile) ?
   1. **BreakEat, sans attendre Flaix (≈ 1 j)** : favoris remontés au
      serveur, campagnes ciblant « a commandé OU favori ». Débloque les
      campagnes des lieux Flaix pour les supporters.
   ⚖️ **« Qui dit prête » — TRANCHÉ par Rémi le 11/11 : l'opérateur, À LA
      MAIN, dans Flaix.** Pour une commande Flaix, `ORDER_READY` FAIT FOI et
      doit sonner tout de suite. La garde actuelle de `statutAffiche`
      (« Flaix ne dépasse pas le comptoir BreakEat ») ne vaut QUE pour les
      commandes servies au comptoir BreakEat : à l'arrivée de E1, une
      commande portant un `flaixOrderId` doit prendre l'état de Flaix tel
      quel, sinon « prête » resterait bloquée (aucun comptoir BreakEat ne la
      fera avancer).
   2. **BreakEat reçoit E1 (1 à 2 j, dès que Flaix l'envoie)** : les commandes
      Flaix créent leur trace chez BreakEat → « Mes commandes », « ta commande
      est prête », Live Activity, note, fidélité, et campagnes vers ceux qui
      ont commandé. Ajouter l'étiquette `[#breakeatId]` aux liens de commande.
   3. **BreakEat lit le flux B (1 à 2 j)** : les matchs arrivent tout seuls,
      fin de la double saisie et de l'option A provisoire.
   4. **BreakEat ouvre E2 puis E3 (4 à 6 j)** : chiffres de l'app lus par Flaix
      (comptage de « Commander » à ajouter), puis campagnes et apparence
      pilotées depuis Flaix, avec une limite de notifications par lieu.
   5. **D (passerelle)** : seulement si le responsable garde aussi le tableau
      de bord BreakEat.
   Règles : une clé par sens, limitée aux lieux autorisés ; des NOMBRES
   seulement vers Flaix (aucune liste de clients sans contrat de traitement
   des données) ; une panne d'un côté n'arrête jamais l'autre.
6. **Courriels (Brevo)** — à faire par Rémi : compte Brevo, DNS de
   `breakeatapp.com`, `MAIL_PROVIDER=brevo` / `MAIL_API_KEY` / `MAIL_FROM`
   sur Railway. Puis vérifier `/auth/password-reset/available` = `true`, et
   ajouter Brevo à la politique de confidentialité §5 (`documents-legaux/`).
7. **Données de production** — à faire par Rémi dans l'admin : renommer
   l'événement « test » ; deux matchs du Vélodrome ont nom et adversaire
   inversés ; l'Aréna et les Spartiates n'ont aucun match programmé.
8. **Revue Apple 1.1.0** — compte de revue au nom de Rémi (identifiants dans
   App Store Connect, jamais dans le dépôt). Notes : Flaix est un logiciel
   de **la même société** ; l'app vend des **biens physiques** (3.1.3(e)).
9. **Android sur le Play Store** :
   - **Clé d'importation** : Play attendait `B4:0E:…:32:4A` (éditeur
     précédent, introuvable) ; EAS signe avec
     `F8:C8:BD:86:29:3F:1C:1E:9F:AB:04:F0:E7:B3:3A:DB:33:77:D0:08` (créée par
     BreakEat le 21/08/2026). **Réinitialisation demandée par Rémi le 09/11**
     avec le certificat de la clé EAS ; attendre l'e-mail de Google (~48 h).
     Le client OAuth « BreakEat Android — import » a été passé sur `F8:C8…` ;
   - ✅ deux clients OAuth Android (signature Play `C6:53…`, importation) ;
   - ✅ canaux : `beta` → test **interne**, `production` → production en
     **brouillon** ;
   - **Firebase** : app Android `com.shapper.breakeat` dans le projet
     `482274786646`, `google-services.json` en variable EAS de type fichier
     `GOOGLE_SERVICES_JSON`, clé FCM V1 dans EAS ;
   - **Compte de service Google Play** (pour `eas submit`) : clé JSON dans
     `apps/mobile/google-play-service-account.json`, ignorée par git. Le
     PREMIER envoi se fait de toute façon à la main dans la Play Console.
10. **Favoris entre appareils** — sur le téléphone seulement aujourd'hui.
11. Petits points de l'audit : cœur écrasé pendant le premier chargement des
    favoris ; actions GitHub en Node 20 à monter ; compilation de l'admin
    à surveiller sur la CI.

### Pièges du moment

- **Créer un lieu = back-office → Organisations → « + Nouveau lieu »** (lieu + accès du
  responsable en un écran). **Toute la programmation** (événements, liens Flaix, adversaires,
  photo, fidélité…) se fait dans le **tableau de bord du lieu** ; le super admin y entre par
  « Programmer ce lieu → ». La page « Liens de commande » du back-office n'existe plus.
- **Un stade se règle « Par événement »** : en « Ouvert en continu », les champs par match
  (lien, adversaire, blason, affiche) n'existent pas.
- **Panier : le créneau ne change plus après le début du paiement**, et deux
  « Payer » simultanés ne retiennent qu'une fois (audit Codex du 10/11,
  `brain/audits/AUDIT_2026-11-10_codex-multi-lieux-charge.md`). Capacité non
  certifiée : pilote sur un lieu, banc de préproduction avant d'annoncer
  des milliers de commandes BreakEat.
- **La découverte des lieux est en cache 15 s** (`CACHE_LIEUX_MS`, `0` l'éteint) : un lien Flaix
  corrigé ou un club suspendu se voit dans l'app après au plus 15 s. La commande, elle,
  n'est jamais en cache. Audit : `brain/audits/AUDIT_2026-11-09_chirurgical-charge-flaix.md`.
- **Mises à jour à distance (EAS Update)** depuis la build 41 : **se publient depuis GitHub**
  (Actions → « Mise a jour a distance » → Run workflow), PAS depuis le poste : la préparation
  du paquet iOS demande 2 à 3 Go, le poste n'en a que 0,6 de libre (« out of memory » le 09/11).
  Prérequis : le secret `EXPO_TOKEN` dans le dépôt. Les réglages (serveur, Google) sont repris
  du profil `beta` d'`eas.json`, jamais retapés. **Tout changement natif** (icône, écran
  d'ouverture, permission, module natif, Live Activity) → **monter `version`** dans
  `app.config.js` avant la build, sinon la mise à jour partirait vers des builds qui n'ont
  pas le code natif attendu.
- **La page Flaix intégrée accepte le HTTPS hors de Flaix et l'annonce** (« Paiement sur
  … ») : à constater lors d'un vrai paiement avant le 22/11.
- **Lire la CI après CHAQUE poussée.** Elle a été rouge trois jours sans que
  personne ne la regarde. Sans connexion GitHub, l'API publique répond
  (60 lectures par heure).
- **Un test de date se construit à l'heure LOCALE** (`new Date(a, m, j, h)`)
  et se vérifie en `TZ=UTC` : la CI tourne en UTC, le poste à Paris.
- **Traduire un message d'erreur = chercher qui l'attend**, y compris dans
  `backend/test/integration/` (base réelle, lancés par la CI seulement).
- **Le poste de développement n'est pas la référence pour l'export web** :
  OneDrive et le magasin pnpm local (`UNKNOWN: stat`, `unable to open
  database file`) y font échouer des choses qui passent sur la CI Linux.
- **Une route Nest littérale se déclare AVANT `:id`** (`a-venir` avant
  `:eventId`).
- **`eas submit` se lance à la main** après chaque build iOS
  (`eas submit --platform ios --profile beta --id <build>`).
- **Machine à 6 Go de RAM** : `tsc`, `eslint` et `jest` séparément.
- **La fiche d'un événement lit `venue.flaixEnabled`** : sur un lieu Flaix,
  ses réglages Break Eat sont masqués exprès.
- **`liens-commande-flaix.tsx` n'existe plus que dans l'admin** (la copie du
  back-office est supprimée le 10/11 : toute la programmation se fait dans le
  tableau de bord du lieu).
- **La pastille du bandeau orange (écran Saison) change selon le lieu, et
  c'est voulu** — sauf un défaut (constaté par Rémi le 10/11, pas corrigé) :
  commande ouverte → rien ; lien Flaix collé mais pas encore ouvert → « La
  commande ouvre à 08:00 » ; pas de lien collé → « Prochain match … » ; rien
  → « Aucun match programmé ». ✅ Le jour est dit depuis la 1.7.11
  (`quandLaCommandeOuvre`) : « aujourd'hui / demain / ven. 13 nov. à 08:00 ».
- **« Ta commande est prête » SONNE depuis la 1.7.14 (11/11)** — la SEULE
  étape qui sonne. `LiveActivityService.annoncerCommandePrete` : la Live
  Activity est mise à jour AVEC alerte (écran allumé, son) ; si aucune
  activité n'est atteinte (Android, refusée), UNE notification classique
  (`data.type = 'order_ready'`, l'app ouvre « Mes commandes »). Les autres
  étapes restent silencieuses (push par étape retiré le 07/09, il doublait la
  Live Activity). Flaix qui dit « prête » avant le comptoir ne sonne pas
  (`statutAffiche`). Pour les commandes Flaix : dès que E1 arrive.
  **Durable depuis la 1.7.16** (audit Codex) : promesse écrite dans la
  transaction (`orders.ready_announce_due_at`), bail de 2 min, rattrapage
  `@Cron` chaque minute, 5 essais, `ready_announced_at` empêche la double
  sonnerie. Toucher la notification : traité une fois, puis effacé.
- **L'icône iOS — NE PAS REVENIR EN ARRIÈRE (validée par Rémi le 11/11, build
  44).** iOS 26 habille toute icône PNG ordinaire de reflets, d'ombre et d'un
  dégradé : sur l'aplat orange, le B paraissait flou (builds 42 et 43) alors
  que le fichier était net. La seule parade est le format **Icon Composer** :
  `apps/mobile/assets/breakeat.icon/` (`icon.json` : fond blanc plein, calque
  `b.png` — le B à 66 % sur fond transparent —, `specular: false`,
  `shadow.kind: none`, `translucency.enabled: false`, `glass: false`), branché
  par `ios.icon` dans `app.config.js`. L'`icon` racine (`icone-app.png`) ne sert
  plus qu'à Android et au web ; Android garde son premier plan à 44 %
  (`icone-android-premier-plan.png`). **Pour changer l'icône :** refaire
  `Assets/b.png` (même cadre 1024, fond transparent), garder `icon.json`, et
  c'est un changement NATIF → monter `version` + nouvelle build.
- **Test instable `temps-reel-multi-instances` › « SANS canal commun »** : a
  échoué une fois en CI le 10/11 (commit `871d5ff`, documentation seule) puis
  est repassé au vert sur `6d90cfa` sans changement de code. Si ça revient,
  regarder les ports fixes 45021/45022 et les `close()` non attendus dans
  `afterEach`.
- **`@bacons/apple-targets` utilise des paquets qu'il ne déclare pas**
  (`@expo/plist`, `@expo/image-utils`) : ils sont déclarés pour lui dans
  `pnpm-workspace.yaml` (`packageExtensions`). Après toute mise à jour Expo,
  `npx expo config --type prebuild` doit réussir.

---

## 🗄️ ÉTAT AU 06/09/2026 — historique, dépassé (voir « État au 09/11 » au-dessus)

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

**La build TestFlight est la 15** (17/09/2026) : produits manquants dans
« Mes commandes » et dans le widget, ouverture de « Mes commandes » au toucher
de la notification, correction de la déconnexion au retour de Stripe. La 14
avait apporté la cloche de notifications et l'inscription par Apple ; la 13 a
été refusée par Xcode (capability Sign in with Apple absente du profil).

**Les notifications ont un destinataire, enfin.** `expo-notifications` n'était
pas installé et `apiRegisterPushToken` n'avait aucun appelant : les campagnes
partaient vers zéro appareil (`envoyé à 0 appareil(s)` dans les journaux). Le
jeton s'enregistre désormais après connexion, chaque envoi archive le message
pour ses destinataires, et la cloche lit ce compte au serveur.

**« Continuer avec Apple » est branché.** Google attend ses identifiants
clients ; **Facebook ne le sera pas** — son jeton ne certifie pas l'adresse, et
rattacher une inscription rapide à un compte existant sur une adresse non
certifiée donnerait le compte d'un client à qui saurait en déclarer l'adresse.

## ⛔ UNE MIGRATION ÉCRITE À LA MAIN SUIT LA BASE, PAS PRISMA — 25/10/2026

**La production est restée à l'arrêt du 23 au 25 octobre** à cause d'un seul
fichier : `20261023_note_de_commande`. À retenir avant d'écrire la prochaine
migration SQL à la main.

```
ERROR:  foreign key constraint "order_ratings_order_id_fkey" cannot be implemented
DETAIL: Key columns "order_id" and "id" are of incompatible types: text and uuid.
```

**Prisma rend `String @default(uuid())` en TEXT. Cette base déclare ses clés
en UUID** — `orders`, `users`, `suppliers`, `organizations`, `venues`, toutes,
depuis `20260527_phase5_stripe_connect`. Le schéma Prisma dit le type du
LANGAGE ; le SQL doit dire celui de la COLONNE. Écrire la migration en
suivant le défaut de l'outil, c'est écrire contre la base.

Ce n'est pas qu'une contrainte qui saute : **Postgres refuse de comparer
`uuid` et `text`**, donc des colonnes TEXT cassent toute jointure vers les
tables existantes — souvent bien plus tard, dans un écran de lecture.

**Ce qu'on a appris sur la panne elle-même :**

- `P3009` au démarrage = une migration antérieure est marquée en échec et
  bloque toutes les suivantes. L'API ne se met jamais à écouter, le
  healthcheck échoue, et **Railway laisse l'ancienne version servir** — d'où
  une API qui répond parfaitement tout en ignorant le code récent.
- **Prisma exécute chaque migration dans une transaction** : un échec en
  cours de fichier annule tout. Il n'y a pas de table à demi créée à
  nettoyer. (`applied_steps_count = 0` le confirme dans `_prisma_migrations`.)
- La réparation tient en deux gestes : marquer la migration annulée
  (`UPDATE "_prisma_migrations" SET rolled_back_at = now() WHERE
  migration_name = '…' AND finished_at IS NULL`, ou
  `prisma migrate resolve --rolled-back …`), puis **reconstruire** — un
  « Redeploy » rejoue la MÊME image, donc la même migration cassée.
- Des déploiements marqués **SKIPPED** ne sont pas une panne : les
  `watchPatterns` de `railway.json` ne surveillent que `/backend/**`, et un
  commit qui ne touche que `apps/` est ignoré à juste titre.

**La parade, désormais systématique** : avant de pousser une migration écrite
à la main, la rejouer sur un Postgres vierge —

```bash
docker run -d --name mig -e POSTGRES_PASSWORD=test -e POSTGRES_DB=breakeat -p 55432:5432 postgres:16-alpine
cd backend && DATABASE_URL="postgresql://postgres:test@localhost:55432/breakeat?schema=public" npx prisma migrate deploy
```

Toute l'histoire des migrations s'applique en quelques secondes. Ça aurait
coûté une minute et évité deux jours d'arrêt.

`migrer.sh` n'a PAS été modifié : il échoue toujours fort sur une migration
fautive. Une reprise automatique aurait caché ce défaut au lieu de le dire.

## 🚀 DÉPLOIEMENT DES FRONTENDS — un seul chemin depuis le 26/10/2026

**`deploy-frontends.yml` a été supprimé.** Il déployait `admin` et `operator`
sur Vercel via la CLI, en parallèle de l'intégration Git de Vercel qui fait
déjà exactement la même chose.

Deux chemins pour la même mise en ligne, dont un cassé : il échouait sur
`Project not found` — des identifiants de projet périmés — pendant que
l'intégration Git déployait normalement. C'est ainsi qu'on l'a vu : le
workflow était rouge au moment même où le panneau Deployments affichait
`breakeat-admin` et `breakeat-operator` déployés avec succès.

**Qui déploie quoi, désormais :**

| Application | Chemin |
|---|---|
| admin, back-office, operator, mobile (web) | intégration Git de Vercel, automatique |
| backend | Railway, sur `watchPatterns: /backend/**` |
| app native iOS | EAS, à la demande |

**Trois secrets GitHub ne servent plus** et peuvent être retirés :
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_ADMIN`,
`VERCEL_PROJECT_ID_OPERATOR`. Les laisser ne casse rien, mais un secret qui ne
sert plus finit par faire croire qu'il sert.

> Un second chemin de déploiement ne double pas la fiabilité : il double les
> endroits où chercher quand ça casse, et personne ne sait lequel a fait quoi.

## 🔎 L'AUDIT CODEX — état au 30/10/2026

Deux documents dans `brain/audits/` (à la racine jusqu'au 11/11) :
`AUDIT_CHIRURGICAL_REPRISE_2026-10-26.md` (le
constat) et `REVERIFICATION_AUDIT_2026-10-27.md` (Codex a revérifié son
propre audit sur le code corrigé). **Le second remplace le premier** pour
tout ce qu'il revérifie.

### Corrigés — 14

| | |
|---|---|
| P1-1 | test d'intégration obsolète — + garde-fou : `test/` était hors du typecheck |
| P1-3 | une panne Redis coupait les routes protégées |
| P1-5 | **l'outbox** — plus rien ne se perd pour l'opérateur |
| P1 (rev.) | le dépôt n'était pas dans la transaction — il l'est |
| P1 (rev.) | deux instances rejouaient la même ligne — `FOR UPDATE SKIP LOCKED` |
| P1 (rev.) | **600 req/min par IP cassait les stades** — coupe-circuit réglable |
| P1 (rev.) | un accès retiré ne coupait qu'à la reconnexion — une minute désormais |
| P2-1 | l'ardoise ne se coupait que pour tout le monde |
| P2-2 | une socket pouvait marteler la base sans limite |
| P2-3 | un super-admin ne pouvait pas écouter une buvette |
| P2-5 | `/health` ne vérifiait rien — `/ready` le fait |
| P2-6 | une build Vercel sans adresse d'API partait quand même |
| P2-7 | Postgres 16 en local, 18 en production |
| P2 (rev.) | la borne des 30 salons ne tenait pas sous la rafale |
| P3-3 | `sentAt` posé même sur un échec total |

### Écarté après vérification — 1

**P1-2** : le build de l'app opérateur n'est pas cassé. `turbo build` rend
5 succès sur 5, et le fichier prétendu introuvable existe. On ne fabrique pas
un correctif pour un défaut qu'on n'arrive pas à voir.

### Décidé, et assumé — 2

- **`/ready` n'est surveillé par personne, et c'est voulu.** Railway continue
  d'interroger `/health` : un hoquet de base ne doit pas faire tuer un
  conteneur qui vend très bien. `/ready` se consulte quand on doute.
- **« Livré » veut dire « émis », pas « reçu ».** L'outbox garantit que
  l'émission part ; elle ne prouve pas qu'un navigateur l'a reçue. La
  relecture REST du tableau de bord reste le filet de ce dernier mètre.

### Toujours ouverts

| | Pourquoi ça attend |
|---|---|
| ⛔ **« Mot de passe oublié » attend une clé de courriel** | Le parcours est écrit, testé et déployable — **mais il ne part aucun courriel tant que trois lignes manquent** : `MAIL_PROVIDER` (`resend` ou `brevo`), `MAIL_API_KEY`, `MAIL_FROM`. Sans elles, `/auth/password-reset/available` répond `false` et l'app n'affiche pas le lien : c'est volontaire, promettre « vérifie tes courriels » sans pouvoir en envoyer est pire que l'ancien message d'attente. **Le domaine de `MAIL_FROM` doit être VÉRIFIÉ chez le fournisseur** (SPF/DKIM), sinon le message part en indésirable — c'est la première chose à regarder si le parcours ne marche pas. Compter une demi-heure, dont l'essentiel en DNS |
| **P2** inscription par SMS/OTP | **à décider** : ce n'est pas un défaut, c'est une fonction que personne n'a spécifiée. Si elle est voulue : envoi, codes hachés, limites par numéro, et vérification du téléphone — qui permettrait alors de le rendre unique, ce qu'on refuse tant qu'il n'est pas vérifié |
| **P2** panier mobile non persisté | un seul état Zustand pour tous les lieux, remis à zéro au chargement d'un événement. Naviguer vers un autre lieu pendant la composition efface le panier. **Décision à prendre** : un panier par événement et par stand, ou un avertissement avant de le jeter |
| **P2-4** lectures non bornées | l'export CSV appelle la même fonction que l'écran : plafonner tronquerait le fichier client **en silence**. Vraie pagination, backend + interface : une demi-journée propre |
| **P2** rattrapage à 200/min | 10 000 événements en attente mettraient ~50 min. À mesurer en situation avant de dimensionner |
| **P2** intégration de l'outbox | les tests sont unitaires. Manquent : rollback métier + outbox ensemble, deux ouvriers concurrents, crash après commit |
| **P2** charge réelle | 25 000 destinataires validés en écriture ≠ 10 000 clients connectés qui commandent. Aucune affirmation de capacité tant que ce n'est pas mesuré |
| **P3-1 / P3-2** | dépendances et plugin ESLint Next — cosmétique |

## 🔓 SUJETS OUVERTS — à reprendre (liste tenue au 09/11/2026)

Ce qui a été décidé mais pas fait, ou fait mais pas encore éprouvé. **Tenir
cette liste à jour : elle est le premier endroit à relire en reprenant.**

| Sujet | Où on en est | Ce qui manque |
|---|---|---|
| **Sauvegarde nocturne** | Script `backend/scripts/sauvegarde.js` écrit et vérifié ; destination validée par le client | Un stockage SÉPARÉ de Railway + la planification. Rien ne tourne aujourd'hui |
| **Apple Pay** | Retiré proprement de l'app (phase 40) | Créer un identifiant marchand `merchant.com.breakeat.app` À PART, son certificat Stripe, puis reposer `APPLE_MERCHANT_ID`. ⚠️ Ne JAMAIS activer le certificat de `merchant.com.shapper.breakeat` : ça révoquerait celui de l'app publiée |
| **Sécurité, points 4 et 5** | Les trois premiers verrous sont posés (phase 42) | Verrouillage temporaire après plusieurs échecs de connexion, et confirmation d'adresse e-mail |
| **Remboursements** | ✅ **Bouclés le 01/10 (phase 55).** `charge.refunded` est traité : la commande passe en `REFUNDED` ou `PARTIALLY_REFUNDED`, recalculé depuis TOUTES ses lignes de paiement (une addition partagée en compte une par convive). 7 tests unitaires + 7 sur base réelle. L'ardoise, elle, rembourse depuis le 30/09 | À éprouver sur la cible : un remboursement réel en mode test Stripe. La mécanique, elle, est en place et testée |
| **Parrainage** | Partage de lien et QR en place (phase 44) | Trancher l'économie : points de fidélité, remise portée par le club, ou rien. La récompense sortirait de ta poche — les produits appartiennent aux buvettes |
| **Notifications** | Cloche corrigée (phase 52), build 21 envoyé | À ÉPROUVER en vrai : envoyer une campagne, app en arrière-plan, puis relire les journaux Railway (`Push token enregistré…`, `Expo push: N envoyés…`) |
| **Lien calendrier Flaix (option A)** | ⏸️ En attente du point de Rémi avec son développeur (10/11). A maintenant, B aussi, C en option | ⛔ Écran Saison sans bouton « Commander » pour un lieu en continu : à corriger AVANT de basculer un lieu. Plus la case « Message d'information ». Détail dans « Ce qui reste », point 5 |
| **Campagnes des lieux Flaix** | ⚠️ N'atteignent personne (aucune `Order` BreakEat sur un lieu Flaix, favoris gardés sur le téléphone) | Favoris au serveur + cible « a commandé OU favori » (≈ 1 jour), puis E1 côté Flaix. En attente du feu vert de Rémi |
| **Gouvernance technique** (document `BRAT_EAT_MASTER_ENGINEERING_GOVERNANCE.md`, 11/11) | ✅ **Intégrée le 11/11, en 5 commits** : `CLAUDE.md` (racine) ; `brain/BUGS_ET_INCIDENTS.md` ; `brain/DECISIONS/` (ADR 0001 à 0008) ; `brain/ARCHITECTURE.md` et `brain/AGENTS.md` réécrits depuis le code ; `brain/taches/` (modèle + premier compte rendu) ; `brain/SECURITE.md` ; `brain/DEPLOIEMENT.md` ; audits de la racine → `brain/audits/`, documents dépassés → `brain/archives/`. Tout reste dans `brain/` (ADR-0008) | Hors documentation, conseillé : dépôt privé (reporté), préproduction, Railway qui attend la CI, Dependabot. ✅ Restauration depuis une sauvegarde de nuit réussie le 11/11 (essai mensuel automatique) |
| **Passerelle d'accès Flaix** | ⏸️ **Gelée le 10/11 par Rémi** — spécifiée seulement (cahier des charges Flaix, section D) | Feu vert de Rémi, choix D1 seul ou D1 puis D2, route et clé de test côté Flaix. Rien à coder d'ici là |
| **Liens Flaix** | Saisis depuis la liste des événements (toute la saison d'un coup) **ou** depuis la fiche d'un match, même terminé (06/11) | Les coller à la main, un par match, tant que Flaix ne les pousse pas |
| **Envoi EAS** | L'envoi automatique restait en file depuis les builds 19-21 | Toujours `eas submit --platform ios --profile beta --id <build>` à la main — c'est ainsi que la build 37 est partie le 06/11 |
| **Build iOS 37** (1.1.0) | Sur TestFlight depuis le 06/11 | À essayer sur un vrai téléphone : tickets de « Mes commandes », « À ne pas manquer » avec des favoris, connexion Google |
| **Audit — les 5 P1** | ✅ Corrigés le 30/09 (phase 53) et migrations passées sur la base cible le 01/10 | — |
| **Audit — second passage (phase 55)** | ✅ Corrigés le 01/10 : l'envoi d'ardoise interrompu ne reste plus bloqué en SENDING (lien écrit dans la transaction + ronde de rattrapage qui rembourse), `charge.refunded` est enfin traité (le bandeau bleu de l'app pouvait s'afficher, rien n'écrivait jamais `REFUNDED`), et le contenant dormant disparaît aussi des LECTURES publiques | — |
| **CI — premier passage** | Poussé le 06/10 avec l'accord du propriétaire. Les builds ont été vérifiés AVANT le push : backend (`nest build`), app client web (`expo export`), admin, operator et back-office (`next build`) — tous verts | **Lire le résultat de la CI** dans l'onglet Actions (job `integration` : sa première exécution réelle). Je n'ai pas pu le lire depuis la session : la lecture de l'état GitHub a été refusée par le garde-fou. Il faut autoriser `gh` dans les permissions pour que je le fasse |
| **Tests d'intégration** | ✅ **12 suites / 117 tests** verts sur base réelle le 05/10 — trois passages consécutifs — et **lancés par la CI** (job `integration` : Postgres 16 + migrations de production). Quatre fichiers ajoutés : ardoise (index unique, revendication, reprise après interruption), invariant du registre de fidélité, lecture publique du contenant dormant, et remboursements | Pour les relancer à la main : démarrer `breakeat_audit`, puis depuis `backend/` → `DATABASE_URL_TEST=postgresql://audit:audit@localhost:15432/audit pnpm test:integration` (port 15432 depuis le 05/10, voir plus bas) |
| **À éprouver sur la CIBLE** | Les scénarios sensibles sont couverts sur PostgreSQL réel, **pas** sur Railway | Après déploiement : un remboursement en mode test Stripe, et une interruption d'envoi d'ardoise provoquée |
| **Flaix Ops — 3 décisions à prendre** | Un développeur côté client prépare une API Flaix Ops. La frontière est analysée dans `brain/FRONTIERE_FLAIX_OPS.md` : très peu est à jeter, mais **trois décisions** conditionnent tout — 1) **pull ou push** (recommandation : rester en push, le webhook signé existe et ne met pas le parcours client en dépendance), 2) **le comptoir travaille-t-il dans Flaix Ops ou dans Break Eat** (pour les lieux Flaix : dans Flaix, confirmé le 11/11) (c'est elle qui décide du sort d'`apps/operator`), 3) **qui dit « prête »** (✅ tranché le 11/11 : l'opérateur Flaix, à la main — voir le plan des API) | La 3ᵉ est la seule incohérence réelle AUJOURD'HUI : le comptoir écrit `order.status`, mais la Live Activity affiche déjà « prête » sur annonce de Flaix. Un client peut donc se présenter devant un comptoir qui ne l'attend pas. À trancher avant d'écrire l'API |
| **Flaix — le cœur décisionnel** | STUB assumé : `requestSlotDecision`, `assessRush` et `requestRecommendations` rendent `null` et **n'ont aucun appelant**. Ce qui marche avec Flaix vit ailleurs : le webhook signé (Live Activity) et le lien vers le rapport d'événement | Rien à faire tant que l'API Flaix n'existe pas. Le jour venu : un appelant doit traiter `null` comme « pas d'avis » et poursuivre — un parcours de commande qui ATTEND Flaix s'arrêterait le jour où Flaix tombe |
| **Audit — les 9 P2** | ✅ Corrigés le 01/10 (phase 54) : portée buvette du stock et des créneaux, journée locale contre UTC, modèles récurrents bornés au conteneur permanent, périmètre du chiffre d'affaires unifié, session du back-office renouvelable, invitation transactionnelle, journal webhook réclamé en une instruction, identifiants Flaix bornés à la commande | — (tests d'intégration lancés le 05/10, voir la ligne « Tests d'intégration »). Le détail des neuf défauts est dans `brain/audits/AUDIT_2026-09-30_par-phase.md` |
| **Audit — les P3** | ✅ **Soldés.** Les CINQ paquets ont des tests : back-office (12), admin (10), operator (12) — session, renouvellement, numéro crié au comptoir, transitions. Et la CI construit enfin l'**export web** de l'app client, avec contrôle du fichier produit (phases 56 et 57) | — |
| **Audit chirurgical du 10/10** | ✅ Traité le 11/10 (phase 57) : « Mes commandes » qui ne faisait rien, Flaix activable sans parcours, `flaixTakeover` qui éteignait le lieu, Flaix qui dépassait le comptoir, port du script local, lint propre, contradictions de ce fichier | — |
| **⚖️ Mentions légales et confidentialité** | ✅ Écran « Informations légales » dans l'app, textes dans `documents-legaux/` | **Ajouter Brevo** à la politique de confidentialité §5 le jour où les courriels sont activés |
| **Dette : `visites`** | L'API calcule encore les passages | Plus aucun écran ne les affiche. À retirer si rien ne les reprend |
| **Dette : PDF en base** | Contrats en `BYTEA`, 10 Mo max | Tenable à ce volume. À déplacer vers un stockage objet si les clubs en déposent beaucoup |
| **Courriels (Brevo)** | Code prêt, fonction masquée : `MAIL_*` absents de Railway | Compte Brevo + DNS de `breakeatapp.com` + trois variables, par Rémi. Voir « État au 09/11 » |
| **Android — Play Store** | Compile (APK `b2337b52`, 03/11) | Compte de service Play, Firebase + FCM V1, deux clients OAuth Android. Voir « État au 09/11 » |
| **Favoris entre appareils** | Gardés sur le téléphone depuis le 06/11 | Synchronisation serveur — demande un compte |

---


## 📅 LE CALENDRIER DE LA SAISON — ÉCRIT le 26/10/2026, à éprouver en vrai

**Spec : `brain/CALENDRIER_SAISON.md`. Code : phase 70 du CHANGELOG.**

Toucher un lieu ne va plus DIRECTEMENT chez Flaix : il ouvre la **saison du
lieu** — un ruban de blasons, un par match à domicile, groupés par mois. Le
match touché s'écrit en entier dans la carte du bas, avec le bouton.

Vérifié en faisant tourner l'app (bundle web + fausse API locale) : le ruban,
le repli en initiales, le choix d'un match, « Commande ouverte », « La commande
ouvre à 8 h le jour du match », et le lieu dont la suite n'est pas programmée.

### Ce qui reste à faire, dans l'ordre

1. **Relancer Railway.** L'API répond 404 depuis l'expiration de l'essai : sans
   elle, rien de tout ça n'est testable sur un vrai téléphone.
2. **Passer la migration** `20261026_adversaire_du_match` (deux colonnes
   nullables sur `events`, rien à réécrire).
3. **Saisir un adversaire** dans le back-office, sur l'écran des événements :
   le nom et le blason sont sur la même ligne que le lien Flaix.
4. **Build EAS** et retour d'usage.

### Le point à savoir avant de saisir

**Il n'y a pas de téléversement d'image dans Break Eat** — ni ici ni ailleurs :
tous les logos du produit se saisissent en ADRESSE (`https://…/logo.png`). Les
blasons adverses doivent donc être hébergés quelque part avant d'être collés.
L'adresse doit être en **https** : iOS refuse le http simple, et un blason en
http ne s'afficherait sur aucun iPhone — le back-office le refuse à la saisie
plutôt que de laisser un trou le jour du match.

### Les règles posées, à ne pas défaire

- **Domicile uniquement.** Les événements appartiennent au LIEU : les
  déplacements n'y sont pas, et ne doivent pas y entrer. Un match affiché sans
  commande possible est une promesse en l'air.
- **Une seule vue.** Pas de bascule grille/liste : les deux menaient au même
  objet (le nom ne tient pas dans une case de 60 px).
- **La commande part d'UN SEUL endroit**, le bouton de la carte. Toucher un
  blason ne fait que choisir.
- **Ce qui ouvre, c'est LA COMMANDE** (`Venue.ordersOpenAt`, réglé une fois par
  LIEU) — jamais les buvettes, jamais les créneaux de retrait, qui vivent chez
  Flaix et peuvent y changer sans que Break Eat l'apprenne.

---


## 🔐 SÉCURITÉ — fait le 18/09, et ce qui reste

**Fait et vérifié en production** : limitation de débit (deux compteurs — large
par IP, serré par ADRESSE E-MAIL sur l'authentification, parce qu'un stade
partage une IP), en-têtes `helmet`, `trust proxy`, Next.js 15.5.25 (deux failles
critiques corrigées). Détail : `ENGINEERING_MANUAL.md`, phase 42.

**Déjà en place avant cet audit**, et qui n'a pas eu besoin d'être touché :
argon2, jetons de renouvellement hachés en base avec rotation, validation
stricte des entrées, erreurs muettes en production avec référence, CORS fermé,
webhooks signés, aucun secret dans le code, aucun téléversement de fichier.

**À FAIRE, demandé et mis de côté le 18/09 :**

1. **Verrouillage temporaire après plusieurs échecs de connexion.** La
   limitation de débit freine déjà (8 essais par quart d'heure et par adresse) ;
   un verrouillage explicite, avec un message qui le dit au client, va plus loin.
2. **Confirmation d'adresse e-mail.** Aujourd'hui, n'importe qui peut créer un
   compte avec l'adresse de quelqu'un d'autre. Ça compte particulièrement ici :
   la règle de réinscription après archivage repose sur l'adresse. C'est le plus
   gros des deux — il touche le parcours d'inscription.

### ⛔ SAUVEGARDES — constaté le 18/09/2026 : il n'y en a AUCUNE d'automatique

Railway → Postgres → Backups affiche **« No backup schedule »**, et la mention
« Backups and point-in-time recovery are only available for customers on the Pro
plan ». La seule copie existante, « Pre-Security-Patch Backup », datait de
**27 jours** — prise par Railway pour SA maintenance, pas pour nous, et rien ne
garantit qu'elle reste.

**Traduit en clair : si la base est perdue aujourd'hui, c'est un mois de
commandes, de comptes et de comptabilité qui disparaît.** Tout le reste de la
sécurité protège d'une intrusion ; ceci protège d'une perte, qui est
irréversible.

### ✅ AUTOMATISÉ LE 25/10/2026 — reste DEUX secrets à poser

`.github/workflows/sauvegarde.yml` tourne chaque nuit à 03h00 UTC, et à la
demande (Actions → Sauvegarde de la base → Run workflow) **avant un événement
ou une migration délicate**. Il appelle le script du dépôt, chiffre le résultat
en AES-256, efface le clair, vérifie que le fichier pèse quelque chose, et le
dépose en artefact GitHub pour 90 jours.

**Chez GitHub, pas chez Railway, et c'est le point** : une copie rangée chez
l'hébergeur de la base partage son sort — incident de facturation, suspension,
fausse manœuvre sur le projet.

**Le workflow est INERTE tant que ces deux secrets ne sont pas posés**
(Settings → Secrets and variables → Actions) :

| Secret | Contenu |
|---|---|
| `DATABASE_URL_SAUVEGARDE` | Railway → Postgres → Variables → `DATABASE_URL` |
| `SAUVEGARDE_PASSPHRASE` | une phrase longue, gardée AILLEURS que dans GitHub |

Sans la phrase, les sauvegardes sont illisibles — **y compris par nous**.

**Répété en entier le 25/10 sur une base Docker** : sauvegarde → chiffrement →
déchiffrement → restauration dans une base vide. 45 tables, 47 migrations, les
données, les types `uuid` et la contrainte `1..5` sont revenus à l'identique.
La répétition a d'ailleurs révélé que le script n'avait **jamais tourné** :
`pg_dump` refusait le `?schema=public` que Prisma ajoute à l'adresse
(« invalid URI query parameter »). Corrigé le même jour.

**Le filet posé en attendant :** `backend/scripts/sauvegarde.js`. Il exporte la
base entière dans un fichier, passe par Docker quand `pg_dump` n'est pas
installé, refuse un fichier vide, et rappelle où ranger le résultat.

```
$env:DATABASE_URL = "postgresql://..."   # Railway → Postgres → Variables
node scripts/sauvegarde.js
```

**Vérifié le 18/09, cycle complet** : 146 commandes sauvegardées, restaurées
dans une base vide, 146 commandes retrouvées. Une sauvegarde jamais restaurée
n'est pas une sauvegarde.

**Les deux vraies sorties**, à décider :

1. **Railway Pro** — sauvegardes programmées ET récupération à un instant
   précis (PITR), c'est-à-dire revenir à la minute d'avant une fausse
   manœuvre. C'est ce que je recommande pour des données qui portent de
   l'argent : un export nocturne perd jusqu'à 24 heures, PITR n'en perd aucune.
2. **Un export automatique nocturne** que j'écris, vers un stockage séparé. Moins
   cher, mais c'est nous qui le tenons — et il faut l'essayer régulièrement.

⚠️ Un fichier `.dump` contient TOUT : comptes, commandes, comptabilité. Il ne va
ni dans le dépôt (le `.gitignore` le refuse désormais) ni dans un envoi. Il se
range ailleurs que sur la machine qu'il protège.

## 📮 SERVICE CLIENT ET PARRAINAGE — 19/09/2026

**Aide & contact** (profil de l'app) remplace l'ancien « Disponible
prochainement ». Quatre motifs — commande, paiement, compte, autre — qui
ouvrent la messagerie avec un message DÉJÀ PRÉPARÉ : l'amorce rappelle ce
qu'on aura besoin de savoir, et le pied porte le compte, l'appareil et la
version. Sans ça, chaque échange commence par « quel compte ? quelle
version ? », et une réponse qui tenait en un message en demande trois.

L'adresse est **`contact@breakeatapp.com`**, confirmée le 19/09/2026 et posée
dans `apps/mobile/src/screens/aide.screen.tsx` (constante `ADRESSE_SUPPORT`, une
seule ligne à changer). À ne jamais modifier à la légère : une adresse fausse
est pire que pas de bouton du tout — le client croit avoir écrit, personne ne
reçoit rien, et il attend une réponse qui ne viendra jamais.

**Inviter un ami** ouvre la feuille de partage du système — WhatsApp, iMessage,
mail, tout ce que la personne a déjà. Rien à intégrer.

### Le parrainage : ce qu'il faut savoir AVANT d'en décider l'économie

Ce partage ne dit pas QUI a invité QUI, et ce n'est pas un oubli : **un lien
vers l'App Store perd tout paramètre en chemin**. Apple ne transmet rien à
l'application après l'installation. Attribuer automatiquement une installation
à un parrain demande un service tiers de lien différé — payant, et qui piste
l'appareil.

La façon fiable, gratuite et honnête reste le **code que le filleul saisit**
dans l'application après son inscription.

Reste la question que tu as posée toi-même, et qui est la vraie : **une
récompense de parrainage sort de ta poche**, puisque les produits appartiennent
aux buvettes. Trois pistes, à trancher avant d'écrire une ligne :
offrir des POINTS de fidélité (le programme existe déjà, et c'est le club qui
les honore) ; faire porter la remise par le club volontaire, en échange des
nouveaux clients qu'elle lui amène ; ou ne rien offrir du tout et garder le
partage tel quel, qui ne coûte rien et fonctionne déjà.

## 📱 BARRE DU BAS — refonte du 19/09/2026

Cinq places : **Lieux · Panier — la PASTILLE — Alertes · Profil**. À gauche le
parcours d'achat, à droite ce qui appartient au client, au milieu ses commandes.

- **La cloche et le menu ont QUITTÉ le bandeau orange de l'accueil.** Ils n'y
  vivaient que sur l'écran Lieux : depuis le panier ou une commande, le client
  ne pouvait atteindre ni ses notifications ni son profil. Deux cloches sur le
  même écran n'avaient pas de sens — le bandeau ne porte plus que le lockup.
- **Deux compteurs** : les notifications non lues (« 99+ » au-delà) et le nombre
  d'articles au panier. Lus par sélecteur SCALAIRE sur les stores zustand —
  rendre un objet re-rendrait la barre à chaque changement de panier, sur tous
  les écrans.
- **La pastille porte l'éclair de la marque en VECTEUR, sur fond blanc**, et il
  prend la couleur de l'étape (orange au repos, puis jaune, orange, vert ;
  bleu si remboursé). L'éclair néon d'avant était une image : couleurs figées.
  Le tracé vient du fichier Canva du 21/09 — que Canva avait exporté en SVG
  mais avec une IMAGE dedans, donc impossible à recolorer : son contour a été
  retracé (31 sommets) et vérifié par superposition. Copie propre, réutilisable
  dans Canva : `logo/eclair-vectorise.svg`.
- **Les transitions de l'anneau et de la couleur ne passent PAS par `Animated`**
  sur le dessin SVG : sur le web, ces valeurs animées ne se mettent pas à jour
  (l'anneau restait au tiers, l'éclair restait jaune — vu dans l'aperçu web).
  `useGlissement` fait avancer de simples valeurs d'état, image par image.
  Le flottement et l'onde, eux, restent sur `Animated` : ce sont des vues.
- **Deux vues imbriquées pour la pastille**, et ce n'est pas du zèle : sur iOS,
  une ombre posée sur la même vue qu'un `overflow: hidden` est rognée avec le
  contenu. L'extérieure porte l'ombre, l'intérieure découpe l'image en rond.
- **`BOTTOM_BAR_SPACE` est passé de 123 à 120** (la pastille a maigri de 72 à
  64). Les trois constantes en tête du fichier sont la seule source du calcul :
  les changer dans `styles` sans les reporter remettrait un bouton sous la barre.

### L'anneau de suivi autour de la pastille — 21/09/2026

La pastille dit où en est la commande, depuis TOUS les écrans :
**jaune au tiers** (reçue) → **orange aux deux tiers** (préparation) → **vert
plein** (prête, avec une onde verte : le seul moment où le client doit bouger)
→ **vert plein + ✓** (récupérée) → **bleu + flèche** (remboursée en totalité).
L'éclair flotte en permanence dans son disque.

- **Paliers réels, jamais de pourcentage inventé** : on ne sait pas si une
  préparation en est à 30 ou à 50 %.
- **Deux commandes en cours** (deux buvettes) : l'anneau suit la plus AVANCÉE —
  celle qui va demander au client de se déplacer en premier.
- **Le ✓ et le bleu s'effacent dix minutes** après la dernière mise à jour de
  la commande (`DUREE_FIN_MS`).
- **Un remboursement PARTIEL ne passe pas au bleu** : la commande continue
  d'être servie. ⚠️ Aujourd'hui aucun code n'écrit `REFUNDED` — le bleu ne
  s'allumera que lorsque les remboursements seront enregistrés (Flaix ou
  webhook Stripe).
- **Le réseau ne travaille que pendant une commande en cours** : un chargement
  à l'ouverture, au retour au premier plan et après paiement ; sondage toutes
  les 10 s seulement tant qu'une commande est en cours. L'écran « Mes
  commandes » publie ce qu'il charge dans `suivi.store` : pas de double appel.
- **« Réduire les animations »** est respecté (plus de flottement ni d'onde).
- La règle vit dans `lib/suivi-commande.ts`, fonction PURE, couverte par
  `lib/__tests__/suivi-commande.test.ts` (12 essais).
- **La carte de commande a pris les mêmes couleurs** : « Reçue » en jaune au
  lieu de l'anthracite. Deux jaunes : `JAUNE` pour les traits, `JAUNE_TEXTE`
  (plus sourd) pour les libellés — le jaune vif ne se lit pas en texte.
- **Nouvelle dépendance native : `react-native-svg`** — la pastille ne
  s'affichera qu'à partir du build suivant.
- **Jest mobile réparé** : le préréglage React Native ne tournait pas avec pnpm
  (aucun test mobile n'existait). `transformIgnorePatterns` laisse désormais
  Babel transformer les modules de `.pnpm`.

## 🔢 MES CLIENTS — DES CHIFFRES QUI NE SE RECOUPENT PAS — 23/09/2026

Les cartes se chevauchaient : « Visiteurs uniques » contenait les connectés, qui
contenaient les nouveaux, qui contenaient ceux qui avaient commandé. Une même
personne pouvait apparaître quatre fois. Désormais :

- **Visiteurs anonymes** = téléphones venus SANS qu'aucun compte ne s'y connecte.
- **Clients connectés** = comptes différents vus, comptés UNE fois sur la période.
- Les deux **s'additionnent** et ne se recoupent jamais. Un téléphone qui se
  connecte en cours de route bascule du côté des connectés (test dédié).
- **Nouveaux visiteurs** et **Ont commandé** sont des détails de ces deux
  chiffres, pas des personnes en plus — l'intitulé le dit. On ne peut pas
  commander sans être connecté : « Ont commandé » ne contient jamais d'anonyme,
  et additionner les cartes compterait deux fois la même personne.
- **« Dont X nouveaux clients »** sous « Ont commandé » : ceux dont c'est la
  PREMIÈRE commande chez ce club (et non la découverte de l'app). Donnée sûre —
  les commandes existent depuis toujours, la fréquentation depuis le 18/09
  seulement. Le tableau jour par jour le montre aussi, par jour.
- **« Passages » a disparu de l'écran** : un seul chiffre par carte. La fenêtre
  de 30 min reste interne (elle dédoublonne les visites), elle n'est plus
  affichée nulle part.
- Le taux de conversion reste calculé sur les CONNECTÉS : un anonyme ne peut pas
  commander sans se connecter, l'inclure ferait baisser le taux artificiellement.
- Le tableau par lieu et le tableau jour par jour suivent les mêmes colonnes.

## 🧾 MES COMMANDES — EN COURS / TERMINÉES — 23/09/2026

Les cartes se ressemblaient toutes : une commande récupérée affichait encore les
trois étapes (Reçue · Préparation · Prête), pleines, comme une commande en
cours. Deux changements :

- **Le résumé des étapes n'apparaît plus que sur une commande EN COURS.**
  Terminée, il n'apprend plus rien et brouille la lecture.
- **La liste est coupée en deux** (`SectionList`) : « En cours », puis
  « Terminées ». Les titres n'apparaissent que s'il y a les deux — sans commande
  en cours, la liste n'est qu'un historique.

Avant, tout arrivait mélangé, la plus récente en tête : une commande récupérée
hier pouvait passer devant celle qu'on attend au comptoir.

⚠️ Changement d'app : demande une build.

## 🔔 LA CLOCHE ET LE ✓ — 23/09/2026

**La cloche restait muette.** Le compte des non-lues n'était relu qu'à la
connexion, à l'arrivée d'un push APPLICATION OUVERTE, et en revenant sur
l'accueil. Un push reçu app fermée ne déclenche aucun écouteur : le client
voyait la bannière, puis une cloche éteinte. Trois relectures ajoutées
(`App.expo.tsx`) :

- au **retour au premier plan** ;
- **toutes les 5 min** application ouverte — indispensable pour qui a REFUSÉ
  les notifications système : aucun push ne lui parviendra jamais ;
- à l'**ouverture d'une notification touchée**, quel qu'en soit le type.

La cloche elle-même s'allume (pleine + orange) dès qu'il y a du nouveau, en plus
de la pastille chiffrée : un chiffre seul se rate d'un coup d'œil.

**Le ✓ apparaît dès « prête »**, et non plus seulement à « récupérée » : c'est
le moment où le client doit savoir que sa commande l'attend. L'onde verte
distingue les deux — elle s'arrête une fois la commande retirée.

⚠️ Les deux demandent une build : ce sont des changements natifs.

## 📅 MES CLIENTS — JOUR PAR JOUR — 21/09/2026

Sous « Fréquentation par lieu », le tableau **Jour par jour** de la période
choisie : date, match(s) du jour, visiteurs (avec une barre pour repérer le pic),
nouveaux, visites, commandes, CA TTC — et le **meilleur jour** en tête (le plus de
visiteurs ; à égalité, le plus de commandes).

- **Le jour est le JOUR DE SERVICE du lieu** (bascule à 4h, heure du lieu — même
  helper que la numérotation des commandes). Découper à minuit UTC rangeait la fin
  d'un match du soir sur le lendemain.
- Commandes et CA : même périmètre que la comptabilité (payé, non annulé).
- Un match sans une visite ni une commande ne crée pas de ligne.
- **On garde « passages »** : essayé « visites », trop proche de « visiteurs » à
  la lecture. « 1 visiteur unique, 2 passages » = une personne venue deux fois
  (un passage = un téléphone dans une demi-heure).
- **Les colonnes du jour sont celles des cartes du haut** : visiteurs uniques,
  connectés à leur compte, nouveaux, ont commandé, taux de conversion — puis
  commandes et CA TTC. « Ont commandé » compte des CLIENTS, « Commandes » leur
  nombre total.
- **Avant le 18/09/2026, « Fréquentation non mesurée à cette date »** au lieu de
  zéros (`DEBUT_MESURE_FREQUENTATION`) : ces jours-là, personne ne comptait.
- La colonne « Match » n'apparaît que si au moins un jour en a un.
- **« Dont connectés » est devenu « Connectés à leur compte »** : la question a
  été posée, l'intitulé ne suffisait pas.
- **Départage des premiers lieux** : deux lieux ouverts dans la même demi-heure
  ont la même `window_start` ; PostgreSQL tirait au hasard. `created_at` tranche
  désormais — un essai passait ou échouait selon le tirage.

## 📊 RAPPORTS FLAIX — 21/09/2026

Les rapports d'événements vivent chez Flaix, derrière les identifiants Flaix du
directeur, et chaque rapport a sa propre adresse. Deux accès depuis le dashboard :

- **Menu → Pilotage → « Rapports Flaix »** : ouvre `ops.flaixlabs.com/login` dans
  un nouvel onglet.
- **Fiche d'un événement → carte « Rapport Flaix »** : on colle l'adresse du
  rapport de CE match ; un bouton « Voir le rapport Flaix » apparaît, et le match
  porte l'étiquette « 📊 Rapport Flaix » dans la liste.

À savoir :
- **Route à part** (`PATCH …/events/:id/rapport-flaix`) : la modification
  ordinaire refuse un événement terminé, or le rapport arrive APRÈS le match.
  Refusée seulement sur le contenant invisible d'un lieu ouvert en continu.
- **Seuls les liens `https://*.flaixlabs.com` passent** (`events/lien-flaix.ts`) :
  le bouton mène à une page où le directeur tape son mot de passe — un faux
  domaine qui imite Flaix (`flaixlabs.com.pirate.fr`) en ferait un piège.
  Identifiants dans l'adresse refusés aussi. La base exige https en plus.
- **Break Eat ne stocke jamais les identifiants Flaix.**
- Les routes publiques de l'app client construisent leurs réponses champ par
  champ : le lien ne sort pas vers les clients.
- Quand Flaix sera branché, le lien pourra se remplir tout seul depuis
  l'identifiant d'événement Flaix.

## 📄 DOCUMENTATION DU CLUB — 19/09/2026

Dashboard manager → **Mon lieu → Documentation**. Le club dépose son contrat
signé en PDF, le relit **dans la page** (aucun téléchargement), en garde
plusieurs, et peut en supprimer.

Ce qu'il faut savoir avant d'y toucher :

- **Le contenu vit dans la base** (`documents.content`, `BYTEA`), pas dans un
  stockage objet. Choix assumé : un contrat par club, quelques méga-octets, et
  surtout **aucune adresse publique** — la lecture passe par la même
  authentification que le reste, sans lien signé à faire expirer. Le jour où le
  volume l'exigera, seul `documents.service.ts` bougera.
- **Le type est vérifié sur le CONTENU**, pas sur ce que le navigateur annonce :
  un vrai PDF commence par `%PDF-`. Renommer un `.php` en `.pdf` ne passe pas.
- **Borne à 10 Mo posée deux fois** : dans l'intercepteur (le téléversement
  s'arrête avant de traverser le réseau) et **dans la base**
  (`documents_taille_raisonnable`), pour le jour où une route oublierait.
- **L'aperçu ne peut pas être un simple `<iframe src="…/fichier">`** : le jeton
  voyage dans un EN-TÊTE, qu'un iframe ne sait pas poser. On lit le fichier, on
  le remet au navigateur comme objet local, et on **révoque** l'adresse à la
  fermeture — sinon le PDF reste en mémoire tant que l'onglet est ouvert.
- **Réservé aux rôles de direction** (`MANAGE_ROLES`) : un contrat ne regarde ni
  le comptoir ni l'équipe marketing.

**La migration `20260919_documents` part toute seule** : Railway lance
`prisma migrate deploy` au démarrage (`railway.json`). Rien à faire à la main —
mais tant que le backend n'a pas redémarré, la page répond en erreur, la table
n'existant pas encore.

Couvert par `backend/test/integration/documents.int-spec.ts` (8 essais sur base
réelle) : contenu rendu **octet pour octet**, faux PDF refusé, et un club qui
n'atteint jamais le document d'un autre même en connaissant son identifiant.

## 🚀 QUI DÉPLOIE QUOI — vérifié le 18/09/2026

Trois chemins différents, et le confondre fait chercher une panne là où il n'y
en a pas. Un déploiement « manquant » est le plus souvent un déploiement qui
passe par un autre tuyau, ou qui n'est pas encore arrivé.

| Surface | Chemin | Déclencheur |
|---|---|---|
| API | Railway | `watchPatterns` : `backend/**` et les dépendances |
| Tableau de bord manager | GitHub Actions `deploy-frontends.yml` | `apps/admin/**` |
| Poste opérateur | GitHub Actions, second job du même fichier | `apps/operator/**` |
| **Back-office** | **intégration Git de Vercel** — PAS de workflow | tout commit sur `main` |
| App iPhone | rien d'automatique | une build EAS, à lancer à la main |

Compter en minutes, pas en secondes : le 18/09, la page « Mes clients » a mis
plusieurs minutes à apparaître après le push, et la couleur est arrivée sur les
quatre surfaces à des instants différents. **Avant de conclure à une panne, on
vérifie ce qui est SERVI** : `/health` donne le commit de l'API, et pour un
dashboard on cherche une chaîne distinctive dans le `.js` servi — c'est ainsi
qu'on a su que la page était déployée mais pas encore la couleur.

## 📊 DONNÉES CLUB — « Mes clients » (18/09/2026)

Le tableau de bord manager porte une page **Mes clients** : le club y lit son
audience et son fichier, filtre par lieu et par période, et **télécharge son
CSV lui-même**. Plus besoin que quelqu'un se connecte pour le lui envoyer.

| Ce qu'il voit | D'où ça vient |
|---|---|
| Visiteurs uniques, passages, dont connectés | table `frequentation` |
| Ont commandé, taux de conversion | commandes payées non annulées |
| Fréquentation par lieu | `frequentation` + noms des lieux |
| Fichier client (nom, e-mail, téléphone, commandes, total, panier moyen, première/dernière, lieux, produit préféré) | commandes + comptes |

**La fréquentation compte des APPAREILS, pas des personnes.** Une
réinstallation compte double, et rien n'empêcherait de fabriquer de fausses
visites : ce sont des ordres de grandeur d'audience, pas des chiffres certifiés
comme le chiffre d'affaires. La page le dit sous les compteurs — un chiffre dont
on tait les limites finit cité comme une preuve.

**Le taux de conversion ne porte que sur les visiteurs IDENTIFIÉS** (corrigé le
18/09) : parmi ceux qui étaient connectés en regardant, combien ont commandé.
Des comptes au numérateur ET au dénominateur. Le rapport « acheteurs ÷ visiteurs
uniques » divisait des comptes par des appareils — un nombre qu'on ne savait pas
lire, et qui paraissait plus faible qu'il n'était.

**Le réseau n'entre pas dans la mesure.** La clé d'installation vit sur le
téléphone : wifi du stade, 4G ou 5G ne changent rien au comptage des visiteurs.
L'adresse IP ne sert qu'à la limitation de débit, jamais à l'audience.

**Chaque lieu compte à part.** La visite comme la commande portent leur lieu,
déduit par le serveur. Un client qui commande au Vélodrome puis dans une autre
arène est compté une fois dans chacun ; il apparaît dans le fichier du club avec
les deux lieux dans sa colonne « lieux fréquentés » — et si les deux arènes sont
deux clubs distincts, chacun ne voit que la sienne.

**Le téléphone est vide pour presque tout le monde** : le champ existe en base,
mais aucun écran de l'application ne le demande. La colonne se remplira si l'on
décide un jour de le réclamer au profil.

**L'envoi de campagnes à partir de ces segments n'est PAS fait**, volontairement.
La prospection par e-mail vers des particuliers demande un accord préalable, et
commander à un stand n'en est pas un. Il faudra une case d'accord horodatée, un
export qui la respecte, et un lien de désinscription dans chaque message.

**À surveiller :** la table `frequentation` grandit avec le trafic. Une purge
au-delà de 24 mois sera à prévoir — la mesure n'a aucun intérêt rétroactif
au-delà, et c'est aussi une donnée à ne pas garder indéfiniment.

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

00000000. **Les deux points du contrat Flaix, à trancher avec le développeur.**
     Sans eux, le relais marche mais l'app reste MUETTE après la commande :
     (1) l'authentification unique — un jeton court signé par Break Eat, pour
     que le client ne se reconnecte pas chez Flaix ; (2) le retour de la
     commande par webhook — sans lui, ni « Mes commandes », ni notification,
     ni Live Activity, ni décompte. Le webhook signé existe déjà côté
     Break Eat (HMAC, anti-rejeu, idempotence) : il attend un identifiant.

0000000. ✅ **RIEN À FAIRE — les migrations sont AUTOMATIQUES.**
     `backend/railway.json` lance `pnpm db:migrate:prod` avant `node dist/main`
     à chaque déploiement. Vérifié le 16/10 : la production renvoie déjà
     `flaixOrderUrl`, `commandeOuvreA` et `prochainEvenement`, en 200 — donc
     les trois migrations du jour sont passées. Les consignes précédentes
     « passer la migration à la main » étaient erronées.

000. **Purger la démonstration** — back-office → **Vue d'ensemble**. Un encart
     rouge liste les commandes `DEMO-…` par organisation (elles sont comptées
     comme payées alors qu'aucun paiement n'a eu lieu : chiffre d'affaires et
     TVA faussés). Recopier `PURGER LA DEMO`, puis purger. L'encart disparaît
     une fois fait. Remplace l'ancien point « Supprimer la commande
     `DEMO-MTBUTM82` ».

0000. **Le compte `78837af2…`** (celui qu'Apple retrouvait, archivé). Pour le
      GARDER, le réactiver dans back-office → Utilisateurs → Comptes archivés
      AVANT de retenter « Continuer avec Apple ». Sinon, la prochaine connexion
      Apple crée un compte neuf et l'ancien rend son adresse — le réactiver
      ensuite demandera de supprimer d'abord le compte neuf.

00000. ✅ **FAIT le 18/09/2026** — le statut d'organisation est désormais
       respecté : un club suspendu disparaît de la recherche, son événement
       devient introuvable, et ni panier ni paiement ne passent. Ses écrans
       d'équipe restent ouverts (les commandes payées doivent être servies),
       avec un bandeau qui l'explique. Voir `ENGINEERING_MANUAL.md`, phase 37.

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

1. ✅ **VÉRIFIÉ le 16/09/2026** (journal de démarrage : `bundle com.shapper.breakeat`) — **`APNS_BUNDLE_ID = com.shapper.breakeat`** sur Railway. La build TestFlight porte l'identifiant réel ; avec une autre valeur, le topic APNs ne correspond pas et **aucune Live Activity ne démarrera**.
2. ~~**La CLÉ APNs (`.p8`) doit couvrir la PRODUCTION.**~~ ✅ **FAIT le 07/09/2026** — clé recréée valable Sandbox ET Production, `APNS_KEY_ID` et `APNS_PRIVATE_KEY` remplacées. Reste à confirmer par une vraie transition de commande : plus de `BadEnvironmentKeyInToken` dans les journaux. Historique conservé ci-dessous, le symptôme étant trompeur.

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

3. ✅ **VÉRIFIÉ le 16/09/2026** (journal de démarrage : `APNs — hote PRODUCTION`) — **`APNS_ENV = production`** sur Railway. Sans cette valeur, le serveur pousse
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

11. ~~Supprimer la commande `DEMO-MTBUTM82`~~ → remplacé par la purge (point 000).

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

✅ **ANDROID COMPILE** depuis le 03/11/2026 — build `b2337b52`, profil
`preview`, APK livré. C'était la 9ᵉ tentative après huit échecs.

```
eas build --platform android --profile preview   # APK, installable a la main
```

**La cause, après deux semaines de fausse piste** : `expo-store-review` était
en **58.0.2** quand tout le projet est en SDK **57**. Son
`expo-module.config.json` déclarait une publication Maven au format du SDK 58,
sans le champ `version` que le greffon Gradle de SDK 57 exige. Gradle le disait
en toutes lettres — « Field 'version' is required … missing at path:
$.modules[18] » — et le module 18 de la liste d'autolinking était bien celui-là.

**Ce que ce document affirmait jusqu'ici était faux** : « l'autolinking génère
un import vers `expo.core.ExpoModulesPackage`, cause non expliquée ». Cette
classe n'apparaît NULLE PART, vérifié en rejouant l'autolinking hors ligne. La
note a fait chercher au mauvais endroit pendant deux semaines, et surtout elle
décourageait de réessayer.

iOS ne pouvait pas révéler le défaut : une publication Maven est une notion
Android. D'où onze builds iOS réussies pendant que huit Android tombaient, avec
le même arbre de dépendances.

⚠️ **Ce qui manque encore à Android** — et aucun de ces points n'est un
blocage de compilation : `google-services.json` (donc pas de notifications
push), `google-play-service-account.json` (donc `eas submit` impossible), et
deux clients OAuth Android pour la connexion Google (paquet
`com.shapper.breakeat`, un par empreinte SHA-1, voir plus haut).

⚠️ **Et une contrainte de méthode** : cette machine n'a ni JDK ni SDK Android.
Chaque essai coûte donc une heure sur les serveurs EAS, et les logs ne se
lisent que sur le site — `eas` n'a aucune commande pour les récupérer. Les
installer ramènerait la boucle à quelques minutes.

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
7. **Persistance des favoris** — ✅ gardés sur l'appareil depuis le 06/11 ; reste la synchronisation entre appareils.
8. **Section « À venir »** — ✅ devenue « À ne pas manquer » le 06/11, alimentée par les favoris (`GET /public/events/a-venir`).
9. **Restyler `order-tracking.screen.tsx`** — ✅ fait (thème clair, numéro de commande en grand, 4 étapes).
10. **Connexions Apple / Google / Facebook** — ✅ Apple et Google branchés et vérifiés ; Facebook écarté (son jeton ne certifie pas l'adresse).
11. **Comptoirs (`PickupPoint`)** — supprimables uniquement depuis la fiche d'un événement, donc inatteignables sur un lieu permanent.

## 🧃 Produits manquants — ce qui demande une build

Le poste (bouton « Manquant », bandeau « Hors carte »), le dashboard manager
(bouton « En vente / HS ») et le serveur sont en ligne dès le déploiement.

Côté client :
- **Live Activity** : le libellé « Produit manquant · passez au comptoir » et
  l'alerte qui allume l'écran fonctionnent AVEC la build actuelle ;
- **build 15 (livrée le 17/09)** pour : le détail rouge dans le widget et l'îlot, le
  bandeau dans « Mes commandes », l'ouverture de « Mes commandes » au toucher
  de la notification — et, déjà en attente, la correction de la déconnexion au
  retour de Stripe (phase 33).

Le remboursement d'un produit manquant se fait au comptoir : rien d'automatique.
Détail : `brain/ENGINEERING_MANUAL.md`, phase 35.

**Build 16 nécessaire** pour la Live Activity réordonnée (plus de débordement ni
de bouton vert coupé, numéro de commande à la place de l'heure) et le bandeau
dans l'écran « Suivi » (phase 36). La suppression du « Retrait prévu à 00:00 »
et le libellé court sont côté serveur : effectifs dès le déploiement.

Elle emporte aussi la phase 38 : le retour automatique dans l'app après le
paiement (l'app referme elle-même la feuille Safari dès que la commande existe),
« N° 5 » à la place de « BE-00000005 » sur l'écran de confirmation et au
démarrage de la Live Activity, et le nouveau libellé du bouton d'arrivée.
Côté serveur — donc actifs dès le déploiement, sans build : le numéro du jour
rendu à l'app et le reçu (numéro du jour + référence + adresse du client).

Et surtout la **phase 39** : le paiement ne passe plus par une page web du tout.
La feuille de paiement de Stripe s'ouvre DANS l'application. C'est la build 16
qui l'apporte — le serveur, lui, sait déjà ouvrir les deux chemins.

### ⚠️ Avant la build 16 : une variable à poser sur Railway

**`STRIPE_PUBLISHABLE_KEY`** — la clé PUBLIABLE (`pk_test_…` en test,
`pk_live_…` en production), à prendre dans le tableau de bord Stripe, à côté de
la clé secrète. Elle est publique par construction : elle ne peut qu'ouvrir un
paiement, jamais le lire ni le modifier.

Sans elle, l'app retombe sur la page hébergée — donc sort de l'application au
moment de payer. Deux façons de le voir : le journal de démarrage liste la
variable dans « Variables absentes », et chaque paiement écrit
« STRIPE_PUBLISHABLE_KEY absente ».

Vérification en une commande, une fois la variable posée :

```
curl -s https://breakeat-admin-production.up.railway.app/health
```

`"paiementNatif":true` ⇒ l'app paiera dans sa propre feuille. `false` ⇒ elle
retombera sur la page hébergée. Le champ ne montre jamais la clé, seulement si
elle est là.

### Apple Pay — les trois démarches, dans cet ordre

Le code est prêt : il s'allume dès que `APPLE_MERCHANT_ID` existe, et reste
silencieux sans lui. Ce qui manque ne peut se faire que depuis les comptes
Apple et Stripe.

**1. ✅ FAIT** — `merchant.com.shapper.breakeat` existe, créé du temps de
l'application précédente. Il porte maintenant **deux** certificats *Apple Pay
Payment Processing* :

| Certificat | Émis | Expire | Pour |
|---|---|---|---|
| ancien (Synertic) | — | 02/10/2027 | l'application précédente |
| nouveau (Notta LLC) | 18/09/2026 | **17/10/2028** | Break Eat + Stripe |

⚠️ **Deux est le maximum** qu'Apple autorise par identifiant marchand. Si un
troisième devenait nécessaire — par exemple un certificat distinct pour le mode
production de Stripe — il faudrait en révoquer un. **Ne pas révoquer l'ancien
sans vérifier** : l'application publiée sur le store (1.0.10) peut encore s'en
servir, et Apple Pay y tomberait en panne sans le moindre message.

Un certificat expiré n'affiche aucune erreur non plus : Apple Pay disparaît
simplement de la feuille. D'où les dates ci-dessus.

`APPLE_MERCHANT_ID` est posé dans `eas.json`, profils `beta` et `production`
(tous deux sur le bundle `com.shapper.breakeat`). PAS sur `preview`, qui porte
un autre App ID (`…breakeat.preview`) : la capacité devrait y être activée
séparément.

**2. Autoriser l'app à s'en servir** (Identifiers → App IDs →
`com.shapper.breakeat` → capacité **Apple Pay Payment Processing** → cocher
l'identifiant marchand → Save). EAS sait aussi le faire tout seul pendant une
build **interactive** : il lit les droits demandés et synchronise la capacité.

⚠️ Comme pour « Sign In with Apple » en septembre : cocher une capacité rend le
profil de provisionnement périmé. La build suivante doit être lancée **sans
`--non-interactive`**, sinon EAS ne peut pas en régénérer un et la build est
refusée par Xcode.

**3. Le certificat de traitement — à VÉRIFIER, pas à refaire aveuglément.**

Le certificat existant date de l'application précédente. Ce qui compte n'est pas
qu'il existe, mais **qui détient sa clé privée** : elle appartient à celui qui a
produit la demande de certificat. Si ce n'était pas ce compte Stripe, Stripe ne
peut pas déchiffrer les jetons Apple Pay, et le paiement échoue au dernier
instant — après que le client a posé son doigt.

La vérification : Stripe → Paramètres → Moyens de paiement → **Apple Pay**.
`merchant.com.shapper.breakeat` doit y figurer comme application iOS.

- **S'il y figure** : rien à faire.
- **Sinon** : ajouter l'application iOS. Stripe fournit une demande de
  certificat (`.certSigningRequest`), on la téléverse dans Apple sur ce Merchant
  ID (*Apple Pay Payment Processing Certificate* → Create Certificate), Apple
  rend un `.cer` qu'on redonne à Stripe.

**Fait le 18/09/2026** : le certificat a été produit sous l'équipe `2A5L298Q4C`
(Notta LLC), au nom de `merchant.com.shapper.breakeat` — les deux correspondent
à `eas.json`. Il ne reste qu'à le **remettre à Stripe**, sur l'écran même qui a
fourni la demande : un certificat qui reste dans le dossier Téléchargements ne
sert à rien, et Apple Pay échouerait après que le client a posé son doigt.

À vérifier **dans chaque mode** : test et production sont deux comptes distincts
aux yeux de Stripe.

**4. ⏸️ EN ATTENTE — `APPLE_MERCHANT_ID` a été RETIRÉ de `eas.json`.**

Le certificat est déposé chez Stripe mais **pas activé** : Stripe prévient que
l'activer révoquerait les certificats déjà créés sur cet identifiant marchand —
donc potentiellement celui dont se sert l'application publiée.

Tant que Stripe ne peut pas déchiffrer les jetons Apple Pay, l'app ne doit pas
le proposer : le paiement échouerait APRÈS que le client a posé son doigt. La
build 16 part donc **sans Apple Pay** — le paiement par carte, dans l'app,
fonctionne sans lui. Remettre la ligne est une manipulation d'une seconde.

### La sortie propre : un identifiant marchand SÉPARÉ

`merchant.com.shapper.breakeat` est partagé avec l'application précédente. Rien
n'oblige à le partager : un identifiant marchand par application est le cas
normal.

En créer un neuf (par exemple `merchant.com.breakeat.app`) règle tout d'un coup :
l'ancien certificat n'est jamais touché, donc l'app publiée ne risque rien ; le
nouvel identifiant part vierge, donc aucune révocation ; et la limite de deux
certificats se compte par identifiant, donc elle cesse de serrer. Côté code,
c'est une ligne dans `eas.json`.

### La marche à suivre, dans l'ordre

1. **Apple** → Identifiers → *Merchant IDs* → « + » → `merchant.com.breakeat.app`.
2. **Stripe, en mode TEST** → Paramètres → Moyens de paiement → Apple Pay →
   ajouter une application iOS, en donnant CE nouvel identifiant. Stripe rend une
   demande de certificat (`.certSigningRequest`).
3. **Apple** → le nouvel identifiant → *Apple Pay Payment Processing Certificate*
   → Create Certificate → téléverser la demande → récupérer le `.cer`.
4. **Stripe** → téléverser le `.cer` → **activer**. Cette fois l'avertissement de
   révocation ne porte sur rien : ce nouvel identifiant n'a aucun autre
   certificat.
5. **Apple** → App IDs → `com.shapper.breakeat` → capacité *Apple Pay Payment
   Processing* → cocher le NOUVEL identifiant (garder l'ancien coché ne gêne pas).
6. Reposer `APPLE_MERCHANT_ID` dans `eas.json` (une ligne), puis lancer la build
   **sans `--non-interactive`** pour qu'EAS régénère le profil.
7. Refaire 2→4 en mode **production** le jour du passage en réel.

### ⛔ Ne PAS supprimer `merchant.com.shapper.breakeat`

L'identifiant marchand n'a PAS été créé le 18/09 : il existait déjà, créé du
temps de l'application précédente. Ce qui a été créé ce jour-là, c'est un
CERTIFICAT de plus, posé dessus.

Supprimer l'identifiant reviendrait donc à supprimer celui dont se sert
l'application publiée, en emportant ses deux certificats. Révoquer un certificat
se rattrape en en recréant un ; supprimer l'identifiant, non.

| | Action | Effet |
|---|---|---|
| ❌ | Supprimer `merchant.com.shapper.breakeat` | Casse Apple Pay dans l'app publiée |
| ✅ | Révoquer le certificat du 18/09 | Retour à l'état d'avant, rien ne l'utilise |
| ✅ | Créer `merchant.com.breakeat.app` | Repart de zéro pour la nouvelle app |

### Et le certificat créé le 18/09 sur l'identifiant partagé ?

Il ne sert à rien : il n'est pas activé chez Stripe, donc aucun paiement ne s'y
réfère. Le révoquer **remet l'identifiant partagé exactement dans son état
d'avant**, et lève la seule incertitude restante (voir ci-dessous). À faire une
fois le nouvel identifiant en place, pas avant — rien ne presse.

**Incertitude levée le 18/09 par le portail Apple lui-même.** La page du
certificat porte trois boutons : *Activate*, *Revoke*, *Download*. L'activation
est donc un **acte explicite**, et Apple prévient qu'activer révoque le ou les
certificats précédents.

Deux conséquences, et elles règlent la question posée plus haut :

- le certificat du 18/09 **n'est pas activé** : c'est toujours l'ancien
  (Bruno Doucende, exp. 02/10/2027) qui chiffre les paiements de cet identifiant.
  **L'application publiée n'a donc rien subi.** Le seul fait de créer un
  certificat ne change rien — c'est l'activation qui bascule ;
- et c'est bien l'activation qui casserait l'ancienne application, puisqu'elle
  révoquerait son certificat. D'où l'identifiant marchand séparé : sur un
  identifiant neuf, activer ne révoque rien.

⛔ **Ne pas appuyer sur *Activate*** sur `merchant.com.shapper.breakeat`.

La chaîne technique, elle, est vérifiée : `expo config` confirme que le plugin
reçoit l'identifiant, que le droit iOS `com.apple.developer.in-app-payments` le
porte (c'est lui que le profil de provisionnement doit couvrir), et que `extra`
le rend lisible à l'exécution. Les trois répondent à la variable, et disparaissent
tous les trois sans elle.

## 🗃️ Archivés et supprimés — la règle

**Archiver n'est pas bannir.** Un compte archivé ne se connecte plus, mais la
personne peut se réinscrire avec la même adresse (e-mail, Apple, Google) : elle
repart d'un compte NEUF, sans l'historique ni les accès de l'ancien. L'ancien
garde ses commandes (comptabilité) et rend son adresse — le back-office
l'affiche avec « Adresse rendue ». Même chose pour le slug d'une organisation
suspendue. Détail et raisons : `brain/ENGINEERING_MANUAL.md`, phase 34.

Suite d'intégration sur vraie base — **depuis `backend/`**, le script n'existe
pas à la racine du dépôt :

```
cd backend
pnpm test:integration
```

Elle a besoin de `DATABASE_URL_TEST` et d'une base Postgres joignable (le
conteneur `breakeat_audit`, **port 15432**) — voir la phase 34 pour la monter.

⚠️ **Si les douze fichiers échouent d'un coup** avec
`PrismaClientInitializationError`, ce n'est pas le code : c'est le conteneur qui
n'a pas pu prendre son port. Windows réserve des plages dynamiques pour WSL, et
l'ancien port (55432) est tombé dans l'une d'elles le 05/10. Les plages se
voient avec `netsh interface ipv4 show excludedportrange protocol=tcp` et
**changent au redémarrage** — en cas de récidive, recréer le conteneur sur un
port hors de ces plages.

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

---

## 🗄️ Historique des mises à jour

Ces notes étaient écrites en tête du fichier, une par session, et y formaient un seul paragraphe de 34 000 caractères. Gardées ici telles quelles ; l'état courant est en tête du fichier.

_Mise à jour du 2026-11-03 (**Android compile pour la première fois, et deux « corrections » d’avant-hier n’en étaient pas**. **ANDROID PASSE — 9ᵉ TENTATIVE.** `expo-store-review` était en 58.0.2 quand tout le projet est en SDK 57 : sa publication Maven, au format du SDK 58, n’avait pas le champ `version` que le greffon Gradle de SDK 57 exige, et la compilation mourait à l’évaluation des réglages, avant la première ligne compilée. Gradle le disait en toutes lettres ; on cherchait une classe fantôme. Corrigé en une ligne, et VÉRIFIÉ SANS CONSTRUIRE — relire la sortie de `expo-modules-autolinking resolve -p android` coûte dix secondes contre une heure d’essai sur EAS. APK livré (build `b2337b52`). `expo install --check` signale onze autres paquets en retard de quelques CORRECTIFS, dont `expo` lui-même (57.0.16 contre 57.0.31) : aucun n’est à un SDK d’écart, aucun n’empêche rien, et les aligner le soir où une build iOS part sur TestFlight aurait été un pari — ce rattrapage mérite sa propre session. **L’ICÔNE N’ÉTAIT PAS CORRIGÉE** : le 31/10 j’ai écrit « le même dessin, à la bonne résolution » en remplaçant un 480 par un 1024. Le fichier fourni était LUI-MÊME un agrandissement — mesuré : un aller-retour 1024→480→1024 ne le changeait que de 0,42 sur 255, donc les pixels étaient vides d’information et iOS affichait du flou. La vraie source dormait dans le dépôt : `logo/…(4).svg` porte un PNG de 1254×1254 incrusté en base64, ORANGE SUR NOIR et avec le mot « BREAKEAT » sous la marque. Masque par le canal ROUGE (la luminosité, essayée d’abord, donnait un orange délavé à 70 % d’opacité), découpe de la marque seule par la bande vide qui la sépare du texte, et réduction à 1024 — RÉDUIRE préserve la netteté. Cadrage inchangé à 0,83 : on ne change qu’une chose à la fois. **LES BLASONS NON PLUS** : passer de 0,72 à 0,94 du cercle le 01/11 n’avait presque rien changé, parce que LE DÉFAUT N’ÉTAIT PAS DANS NOTRE CODE. Mesuré sur les adresses réellement en production : le logo du PSG occupe 54 % de son fichier, Beşiktaş 53 %, dans des images de 3840×2160 ; Monaco 85 %. `contain` respectait fidèlement cette marge. `cover` rogne ce qui dépasse — et ici, ce qui dépasse EST la marge : recalculé sur les trois, aucun n’est entamé et tous passent de ~55 % à plus de 85 % du rond. Le risque est nommé dans le code : un blason collé au bord de son fichier se ferait rogner. **LEÇON COMMUNE AUX DEUX** : une retouche qui ne change rien à l’écran dit que la cause est ailleurs. Deux fois, j’ai réglé un paramètre au lieu de MESURER la donnée qui entrait. **« PAYÉ » ET « ACCEPTÉE » N’EN FONT PLUS QU’UNE** : du point de vue du client c’est le même moment, et la distinction occupait une étape sur quatre sans appeler le moindre geste. Repli par une TABLE et non par une suppression — sans elle `STEPS.indexOf(‘ACCEPTED’)` rendrait -1, et la barre de progression reviendrait en arrière au moment où le stand accepte. **LE NUMÉRO DE COMMANDE DIT SON NOM, ET EN GRAND** — suivi (encadré à 44 pt au-DESSUS de l’état), historique (« Commande n° 5 » et non « N° 5 » nu), reçu (encadré orange à 38 px, absent quand la commande n’a pas de numéro du jour). C’est le seul chiffre que le client aura à donner, au comptoir, à voix haute. **CE QUI N’A PAS ÉTÉ VÉRIFIÉ À L’ÉCRAN** : l’écran de suivi et le ruban de la saison — la machine n’a pas tenu le montage complet (base semée, API locale, export web), Docker a cessé de répondre. Le reçu, lui, a été rendu dans un navigateur, et l’icône comparée à l’œil avant/après. Avant : 2026-11-02 (**la connexion Google existe de bout en bout, et Android est enfin DIAGNOSTIQUE au lieu d’être supposé**. **GOOGLE EST COMPLET**, du jeton à la build. Le serveur savait déjà vérifier un jeton Google exactement comme un jeton Apple ; il manquait TOUT le côté app. Posé ce soir : le SDK natif (@react-native-google-signin 17), un bouton au « G » officiel dessiné en SVG, et le garde-fou habituel — un bouton visible est un bouton qui marche, ici garanti par TROIS verrous (le serveur annonce « google », les identifiants sont dans la build, et ils ont la FORME d’un identifiant Google ; ce dernier parce qu’Expo sérialise `null` en `{}`, qui est VRAI en JavaScript — le défaut qui avait déjà fait naître `identifiantMarchand`). PAS `expo-auth-session` : il repasserait par un navigateur et un rebond `breakeat://`, exactement le parcours qu’on a QUITTÉ pour Stripe. Le coût est réel et assumé — c’est un module NATIF, donc aucune build antérieure ne le porte. RIEN SUR LE WEB, et ce n’est pas un oubli : le SDK natif n’a pas d’implémentation navigateur, et le web demanderait Google Identity Services, un second chantier. VÉRIFIÉ que le paquet web construit ne contient AUCUNE trace du module natif. CONSOLE GOOGLE CLOUD : projet `breakeat-connexion` (n° 482274786646), client Web (`…-e7vefqek…`) et client iOS (`…-gocqpvlj…`), application PUBLIÉE et validée. Le client WEB est celui qui fait rendre un jeton d’IDENTITÉ, même sur iPhone — son nom trompe. Le schéma d’URL iOS est ce même client écrit à l’envers, et il va dans le GREFFON (il se pose dans la build) quand les deux autres vont dans `extra` (elles se lisent à l’exécution). `GOOGLE_CLIENT_IDS` est posé sur Railway avec les DEUX identifiants ; `/auth/providers` répond désormais `["apple","google"]`. Les trois variables de build sont dans `eas.json`, en clair et versionnées — un identifiant client OAuth N’EST PAS un secret, il est embarqué dans le binaire — et SEULEMENT sur les profils `beta` et `production` : `preview` et `development` construisent avec `.preview` et `.dev`, or un client OAuth iOS est lié à UN SEUL identifiant de paquet. Sans ces variables le bouton ne s’affiche pas du tout sur ces builds — ce qui vaut mieux qu’un bouton qui échoue. VÉRIFIÉ PAR INTROSPECTION (`expo config --type introspect`) : le schéma Google figure bien dans le CFBundleURLTypes natif. **iOS 1.1.0 BUILD 36 EST SUR TESTFLIGHT** — la première qui porte BreakEat, l’icône 1024, les affiches de concert, le calendrier retouché et le bouton Google. La PREMIÈRE tentative a échoué sans toucher au code : Apple avait publié un nouveau contrat de licence et GELAIT le compte (403, « your team’s Account Holder must agree to the latest Program License Agreement »). Impossible d’enregistrer un identifiant de paquet tant qu’il n’est pas signé — à connaître, ça reviendra. **ANDROID : LA QUESTION QUI COMMANDAIT TOUT EST TRANCHÉE.** Le titulaire du compte Play est Rémi Notta, et la **Signature d’application Play est ACTIVÉE** : Google détient la clé, mettre à jour l’app publiée est donc possible sans rien récupérer chez Shapper/Synertic. (Synertic garde un accès utilisateur au compte, `syn_android@synertic.fr`.) LES DEUX EMPREINTES, à ne plus aller chercher : clé de SIGNATURE `C6:53:D7:9C:95:B9:60:B7:68:87:8B:74:2B:D9:75:AB:B5:47:79:7C`, clé d’IMPORTATION `B4:0E:5D:E3:7C:18:C6:18:B3:89:24:33:F2:55:19:2C:E2:F6:32:4A`. Compte développeur n° 6530365775718822841. ⚠️ **LE DIAGNOSTIC ANDROID NOTÉ LE 19/10 EST FAUX** : « l’autolinking génère un import vers `expo.core.ExpoModulesPackage` » ne se reproduit PLUS. Vérifié localement et gratuitement : `expo prebuild --platform android` réussit, `expo-modules-autolinking resolve -p android` lie 21 modules et ne mentionne `expo.core` NULLE PART, et il n’existe qu’UNE copie de `expo`, `expo-modules-autolinking` et `expo-modules-core` — la piste des copies multiples ne tient pas. La 8ᵉ tentative (profil `preview`, commit 13019af) a échoué après **35 MINUTES**, donc tard dans Gradle : une build qui meurt sur la configuration meurt en deux minutes. C’est une AUTRE cause, et elle reste à lire dans les logs EAS. **ET UNE CONTRAINTE DE MÉTHODE** : cette machine n’a ni JDK ni SDK Android, donc chaque essai coûte 35 minutes sur les serveurs EAS et les logs ne se lisent que sur le site — `eas` n’a pas de commande pour les récupérer. Installer le JDK et le SDK ramènerait la boucle à quelques minutes ; c’est le premier geste de la prochaine session Android. **RESTE SUR GOOGLE/ANDROID** : deux clients OAuth Android à créer (paquet `com.shapper.breakeat`, un par empreinte) — ils ne se recopient NULLE PART, le jeton garde le client Web pour destinataire ; vérifier que le keystore EAS (`Build Credentials 3ROr_Gcg8d`) porte bien la clé d’importation ci-dessus, sinon demander une réinitialisation dans Play Console ; `google-services.json` et une clé FCM V1 pour les notifications push Android (Firebase ne sert QU’À ça ici) ; et `google-play-service-account.json` pour qu’`eas submit` fonctionne. Avant : 2026-11-01 (**le calendrier prend forme, l’affiche d’un concert existe, et le nom entre dans l’app**. QUATRE RETOUCHES DU CALENDRIER : le blason passe de 0,72 à 0,94 du cercle — 0,72 était 1/√2, le plus grand CARRÉ qui tienne dans un rond, mathématiquement prudent et visuellement timide ; « Commande ouverte » quitte le bandeau orange, parce que répéter l’état NORMAL occupait la ligne la plus lue pour une information que personne ne cherche ; le mois passe en noir avec sa majuscule, posée DANS la donnée et non par `textTransform` ; et l’heure s’écrit `08:00` et non « 8 h » — on hésite une demi-seconde entre le matin et le soir. **UN CONCERT N’A PAS DE BLASON, IL A UN FLYER** : le calendrier ne savait dessiner qu’un rond de 48 pixels, et une affiche est un portrait 2:3 dont tout le propos vit dans la hauteur — glissée dans le rond, il n’en reste que le centre. `Event.posterUrl` rejoint `opponentLogoUrl` : UN TROISIÈME CHAMP, pas un réemploi, parce que le code doit SAVOIR laquelle des deux images il tient et non la deviner à l’extension du fichier ou aux proportions, deux indices qui se trompent. Quand les deux sont remplis, L’AFFICHE GAGNE — elle a été posée pour CET événement, un blason ne désigne que le camp d’en face ; le serveur, lui, ne tranche pas et rend les deux. Dans le ruban l’affiche prend EXACTEMENT la hauteur du blason (chaque case pose sa date sous son image, une rangée désalignée se voit tout de suite) ; dans la carte elle passe à 88×132 en `contain`, rien n’est rogné — rogner couperait le titre, qui est en haut de tous les flyers du monde. Une affiche PLEINE LARGEUR a été essayée et écartée : dans une carte de 343 pixels, un 2:3 fait 514 de haut et pousse le bouton « Commander » sous le bord de l’écran. LA VALIDATION DES DEUX ADRESSES NE VIT PLUS QU’À UN ENDROIT (`events/image-distante.ts`) : https obligatoire — iOS refuse le http simple et l’image ne s’afficherait sur AUCUN iPhone — et pas d’identifiants dans l’adresse, qui partiraient dans la réponse PUBLIQUE. Le test qui compte envoie les mêmes mauvaises adresses dans les deux portes et exige le même refus. Vérifié À L’ÉCRAN avec les QUATRE cas côte à côte — blason seul, affiche seule, ni l’un ni l’autre, les deux — et le refus du http nomme l’événement ET l’affiche, pas « le logo ». **LE NOM** : « BREAK EAT » devient BreakEat, et l’icône passe de 480×480 à 1024 — elle était AGRANDIE à la construction, donc floue sur la fiche App Store et sur tous les iPhone récents. **Le renommage s’était arrêté à la porte** : huit endroits restaient, dont l’écran de connexion, la feuille de paiement Stripe (`merchantDisplayName`, lu au moment où le client donne sa carte) et surtout « Ouvre Réglages › Break Eat › Notifications » — une ligne qui N’EXISTE PLUS dans iOS depuis le renommage : on envoyait chercher un nom introuvable, l’impasse exacte déjà corrigée dans les phrases d’autorisation. Au passage, la version du pied de message au support était ÉCRITE À LA MAIN (« 1.1.0 »), donc fausse dès la version suivante : elle est lue. PAS TOUCHÉ : le nom LÉGAL — « BREAK EAT APP » est la dénomination de la SAS, la changer est une décision d’entreprise. **LA DÉCLARATION DE CONFIDENTIALITÉ APP STORE EST FAITE** (01/11) : la version 1.1.0 est créée dans App Store Connect, les dix types de données sont déclarés et publiés, et l’URL pointe sur `https://www.breakeatapp.com/rgpd`. Les deux corrections qui ont coûté le plus de temps à trouver : la localisation est une POSITION PRÉCISE et non approximative (`apiSearchVenues` envoie le GPS brut), et le CONTENU UTILISATEUR est bien collecté (`OrderReview.comment`). Flaix étant un logiciel de la MÊME société (même SIREN) et affiché DANS l’app, Apple compte ses données comme collectées par BreakEat — la politique le nomme désormais. **RESTE SUR CE CHANTIER** : un compte de test qui FONCTIONNE pour le relecteur Apple (`compte.test@test.com` n’existe nulle part dans le dépôt — c’est le premier motif de rejet), le contact de revue qui est encore celui de Shapper, et une build EAS 1.1.0 avec le nouveau nom et la nouvelle icône. **PROCHAIN CHANTIER : L’INSCRIPTION PAR GOOGLE.** Le serveur sait déjà le faire — `social-identity.service.ts` vérifie un jeton Google exactement comme un jeton Apple (JWKS, émetteur, audience) ; il manque `GOOGLE_CLIENT_IDS` côté serveur, et SURTOUT le bouton et la dépendance côté app, où rien n’existe. **ANDROID RESTE BLOQUÉ**, et le premier obstacle n’est pas du code : la CLÉ DE SIGNATURE est probablement chez Shapper — à vérifier dans Play Console › Intégrité de l’app avant d’investir quoi que ce soit, car sans elle mettre à jour l’app publiée est impossible. Viennent ensuite `google-services.json` absent (donc pas de notifications push), `google-play-service-account.json` absent (donc `eas submit` impossible) et l’échec d’autolinking non expliqué (7 échecs Android contre 4 réussites iOS). Avant, le même jour : **l'audit de mise en production, et l'écran d'interrupteurs qui manquait**. **LE MÉCANISME DES FLAGS N'AVAIT AUCUNE POIGNÉE** : `apiSetFeatureFlag` était dans le client d'API avec ZÉRO appelant. Pour couper « Partager l'addition » sur un club un samedi soir — la fonction qui REMBOURSE de l'argent encaissé — il fallait appeler l'API en ligne de commande ou écrire du SQL. Écran livré sous Système → Interrupteurs, et il est conçu à l'envers d'un formulaire : les clés viennent d'une LISTE (`lib/interrupteurs.ts`), jamais du clavier, parce qu'une faute de frappe crée une ligne que personne ne lira ; une section à part montre les lignes POSÉES EN BASE QUE PERSONNE NE LIT (l'audit le demandait explicitement) ; et l'écran NE RECALCULE RIEN — il demande l'état à l'adresse que l'application interroge elle-même. **Surtout pas `/feature-flags/resolve`** : il rend `false` quand aucune ligne n'existe, alors que sans ligne c'est la variable d'environnement qui décide — l'écran aurait affiché « inactif » pour une fonction qui marche. D'où le bandeau permanent « aucun réglage posé n'est pas éteint », et la distinction Retirer / Couper répétée jusque dans la confirmation. Vérifié dans un vrai navigateur, base semée et session réelle, en comparant chaque état à `GET /public/order-splits/enabled` : club allumé → le match hérite (Actif) ; coupé sur le match → le club reste allumé, le match Inactif ; retiré → le match réhérite. Le tableau DÉBORDAIT de la fenêtre à 1024 et à 1440, la colonne des actions hors écran : largeurs fixes et boutons qui passent à la ligne. **MESURES DE CAPACITÉ, prises sur le code du jour** (`scripts/banc-de-charge/cout-inscription.js` et `cout-commande.js`, qui n'existaient pas) : l'inscription coûte 107 ms par hachage et SATURE À 16,5/s par instance quelle que soit la concurrence — 4 fils libuv, 296 Mo de pointe, et 2 s de latence à 32 clients simultanés ; la commande tient **134/s répartie sur 30 lieux** contre 44/s sur un seul comptoir, soit **3,08× — les lieux ne se gênent PAS**, le verrou est bien par produit et par point de retrait. **CE QUE LA PRODUCTION DIT D'ELLE-MÊME** : 500 connexions de plafond dont 12 prises (48 instances possibles), Redis CONFIGURÉ ET RÉPONDANT donc plusieurs instances permises — `/ready` le dit désormais, il ne le disait nulle part et ça ne s'apprenait qu'au journal de démarrage. **L'ENCAISSEMENT PASSE PAR FLAIX** : chaque lieu a son compte Flaix et son compte Stripe. Le panier Break Eat, lui, utilise des destination charges (la clé de la PLATEFORME encaisse puis reverse au compte connecté) — donc le mode TEST/RÉEL de la clé Break Eat ne décide du revenu que pour un lieu qui ne passe PAS par Flaix. Il n'y en a aucun aujourd'hui : la production ne montre QU'UN SEUL LIEU, et il est en Flaix. **RESTE AVANT LES STORES** : ~~la déclaration de confidentialité App Store~~ — FAITE le 01/11, voir en tête ; le lien Flaix de CHAQUE match à vérifier avant le coup d'envoi (un événement sans lien rend un 409 et l'app dit « la commande de ce lieu n'est pas ouverte », ce qui est honnête mais silencieux) ; et les 30 lieux annoncés restent à CRÉER — c'est de la saisie, pas du code. Les sauvegardes, elles, sont confirmées en place. Avant : 2026-10-31 (**l'audit chirurgical V3 de Codex, et cinq défauts qui faisaient perdre de l'argent, une commande ou un horaire**. **L'INTERRUPTEUR GLOBAL NE POUVAIT PAS ÊTRE POSÉ DU TOUT** — pire que ce que l'audit signalait. Les services écrivaient par `upsert` sur une clé composée avec `(scopeId ?? null) as string` : le cast fait taire TypeScript, Prisma valide au runtime et refuse (« Argument scopeId must not be null »). `app.split.enabled`, l'interrupteur qui coupe l'ardoise — celle qui REMBOURSE de l'argent, et qu'on a tenu à pouvoir arrêter en secondes — rendait un 500. Aucun test ne pouvait le voir : les deux suites doublent `upsert` par un `jest.fn()` qui accepte tout. Et l'unicité n'était garantie par rien, deux NULL étant DISTINCTS dans un index unique PostgreSQL : index partiel ajouté, pas substitué. **DEUX BIÈRES DEVENAIENT QUATRE** si le paiement échouait une fois : l'écran synchronisait le panier par des ajouts, et `POST /carts` réutilise le panier déjà ouvert. `PUT /carts/:id/items` pose désormais le contenu VOULU, en quantités absolues. **DEUX CLIENTS PAYAIENT LA MÊME DERNIÈRE BIÈRE** : le stock était contrôlé avant Stripe, jamais retenu. Disponible = `quantity - reserved`, retenu au paiement. **Mon premier correctif était faux et le test l'a attrapé** — je comparais `reserved` LU avant, donc cinq clients retenaient sur un stock de trois ; il faut comparer la colonne à elle-même, en SQL brut. **UN CRÉNEAU CHOISI DISPARAISSAIT APRÈS L'ENCAISSEMENT** : la place était prise en créant la commande, et un créneau rempli entre-temps laissait la commande sans heure — le client l'apprenait au comptoir. Prise avant Stripe désormais. **UN VISITEUR PARTAIT CHEZ FLAIX AVEC LES ÉTIQUETTES EN CLAIR** (`phone=[#Votre portable]`) : la substitution ne se faisait que pour un client connecté, et le `#` d'une étiquette ouvre un FRAGMENT d'URL, donc tout ce qui suit n'arrivait jamais chez Flaix. La règle commune aux trois retenues (stock, créneau, points) : on retient AVANT Stripe, où refuser ne coûte qu'un message ; et on REND sur tous les chemins d'échec — paiement refusé, panier périmé, contenu modifié — sinon une étagère annoncée vide serait pleine en fin de soirée. 1 034 tests unitaires sur 72 suites, 204 d'intégration sur 25 suites, 95 côté mobile ; chaque correctif prouvé par retour en arrière. **PUIS LES CINQ P2 DU MÊME AUDIT**, le même jour. **« MOT DE PASSE OUBLIÉ » EXISTE** : le lien affichait « à venir », donc un client qui perdait son mot de passe perdait son compte. Un code à SIX CHIFFRES par courriel, pas un lien — un lien devrait rouvrir l'app depuis une messagerie, donc des liens universels chez Apple et Google ou une page web à héberger. Code HACHÉ en base, quinze minutes, usage unique, cinq essais, et toutes les sessions tombent à la reprise (on reprend un compte souvent parce qu'un autre l'avait pris). AUCUNE DÉPENDANCE AJOUTÉE : Resend et Brevo s'appellent par un seul POST. **IL MANQUE LA CLÉ D'API ET UN DOMAINE D'EXPÉDITION VÉRIFIÉ** — tant qu'ils manquent, `/auth/password-reset/available` répond `false` et l'app n'affiche pas le lien, plutôt que de promettre un courriel qui ne partira pas. Trois lignes dans `.env` (`MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM`), **à faire**. **LE TÉLÉPHONE EST NORMALISÉ EN E.164** : l'ancienne règle acceptait la PONCTUATION SEULE — neuf tirets étaient un numéro valide, des deux côtés — et l'écran exigeait 9 caractères quand le serveur en demandait 7. « 06 12 34 56 78 », « +33 6 12 34 56 78 » et « 0033612345678 » donnaient trois valeurs en base : le comptoir ne pouvait pas rapprocher un client de lui-même. Une seule fonction, écrite DEUX FOIS (serveur et app) parce qu'un paquet partagé ajouterait un lien que Metro doit résoudre — avec un test qui compare le CODE des deux copies, et qui tombe à la première divergence. **PAS D'UNICITÉ sur le numéro, et c'est un choix écrit** : un foyer partage un fixe, et un champ non vérifié rendu unique se retourne en arme (s'inscrire avec le numéro d'un autre l'empêcherait, lui, de s'inscrire). **L'ACCEPTATION DES CGU EST CONSERVÉE** : la case cochée ne quittait pas le téléphone, alors que les CGU affirment la recueillir à l'inscription. On enregistre la VERSION LUE et la date — celle du serveur, une horloge de téléphone se règle à la main — et une contrainte de la base interdit l'une sans l'autre. Nullable pour les comptes antérieurs et pour Apple/Google : une preuve fabriquée serait pire qu'une preuve absente. **L'INSCRIPTION CONCURRENTE REND UN CONFLIT** : `create` lit, calcule Argon2 — plusieurs dizaines de millisecondes — puis insère ; deux requêtes franchissaient la lecture ensemble et le `P2002` du perdant remontait en 500. Le client lisait « Erreur inconnue » pour une adresse déjà prise. Et l'app reconnaissait le conflit AU TEXTE (« already exists », « conflict ») quand le serveur répond « Email already in use » : elle lit le CODE HTTP désormais. **LE FLAG PAR ÉVÉNEMENT EST RÉSOLU AVEC LE CONTEXTE** : le serveur savait résoudre événement > club > global, l'affichage ne lui passait rien. Un club dont l'ardoise venait d'être ACTIVÉE voyait le serveur accepter pendant que le bouton restait caché ; coupée, le bouton restait visible et le refus n'arrivait qu'au clic. **RESTE OUVERT** : l'inscription par SMS/OTP n'existe pas — ce n'est pas un défaut mais une fonction absente, **à décider** ; le panier mobile est unique en mémoire et s'efface au changement d'événement ; `ClientsService.lister` et l'export CSV restent sans pagination (P2-4, reporté sciemment) ; `assertEncoreSurBreakEat` recharge les événements du lieu à chaque panier ; 85 alertes de dépendances à vérifier chemin par chemin ; le banc de charge ne mesure ni Stripe ni les sockets. Avant : 2026-10-30 (**la journée de la mise en charge, et trois défauts qui perdaient de l'argent ou des commandes**. LE CALENDRIER DE LA SAISON est livré — matchs À DOMICILE uniquement, un seul ruban, pas de décompte de buvettes, et le vocabulaire arrêté : c'est LA COMMANDE QUI OUVRE (`Venue.ordersOpenAt`), pas les buvettes ; Flaix tient les créneaux de retrait. Le lien Flaix part TOUJOURS de « Commander ». **LE FILET DE L'OPÉRATEUR** : chaque annonce temps réel est déposée dans `realtime_outbox` et rejouée — avec un BAIL de 120 s (deux répliques rejouaient la même, le comptoir sonnait deux fois) et une colonne `sequence`, parce que `created_at` s'égalise dans une transaction ET que `UPDATE … RETURNING` ignore l'`ORDER BY` du sous-select. Trouvé par le test, pas par la lecture. **MESURÉ, PAS ESTIMÉ** — 50 lieux, 1 950 événements sur un PostgreSQL jetable : le passage vers Flaix tient 427 req/s (le chemin le MOINS cher de l'application, les 20 000 commandes relayées sur dix minutes occupent 8 % d'une instance) ; l'inscription plafonne à 14,5/s et la concurrence n'y change RIEN — c'est `argon2`, coûteux par conception, donc 3 instances pour 20 000 inscriptions en dix minutes. La découverte chargeait TOUS les événements de CHAQUE lieu à chaque requête : bornée à une saison, +78 % de débit. Détail dans `backend/scripts/banc-de-charge/LISEZ-MOI.md`. **LE DRAPEAU FLAIX NE VIVAIT QUE DANS L'ÉCRAN DE DÉCOUVERTE** : le serveur ne refusait RIEN. Une vieille version de l'app ouvrait un panier Break Eat sur un lieu dont le club ne tient plus la carte. Une seule règle désormais (`modeDeCommande`), appliquée à l'ouverture du panier ET au paiement — avec le repli qui sauve un club en pleine bascule : basculé sans lien utilisable, il garde sa vente. **TROIS DÉFAUTS D'ARGENT ET DE COMMANDES**, corrigés le 30 : le `checkout` ne vérifiait PAS le stock (le commentaire affirmait le contraire) — un client payait pour un article qu'un autre venait de prendre, et `decrementerStock` ne faisait que CONSTATER ; le panier ouvert expire à 5 min d'INACTIVITÉ, jamais pendant un paiement engagé (l'expirer là encaisserait sans créer la commande) ; et l'annonce `new_order` était déposée APRÈS le commit — un arrêt dans cette fenêtre donnait une commande PAYÉE que le comptoir n'apprendrait JAMAIS, et le perdant de la course Stripe annonçait une SECONDE fois la commande du gagnant. **LE TABLEAU OPÉRATEUR relisait TOUT à chaque commande**, sans attendre la lecture précédente : un serveur qui ralentit recevait donc PLUS de requêtes. Plafonné à UNE en vol par écran. Le groupement à 300 ms, lui, ne change rien en dessous de 3 arrivées/s — mesuré, et écrit dans le code, parce que mon premier commentaire prétendait le contraire. 966 tests backend sur 70 suites, 27 sur le poste opérateur. **LES SEPT P2 SONT TRAITÉS**, et quatre l'ont été par la MESURE plutôt que par l'opinion. L'outbox rejouait 200 annonces/min, soit cinquante minutes pour dix mille : **deux secondes désormais**, 4 938/s mesurées sur une vraie base — ce qui coûtait n'était pas l'émission mais le marquage, une écriture par ligne. `events` n'avait **aucun index** sur `venue_id` (une clé étrangère n'en crée pas) : ajouté, une recherche de cinq lieux passe de 17,1 ms et 134 pages à 0,78 ms et 13 — **mais 8 % seulement de bout en bout**, le coût de l'écran d'accueil vivant dans le Node, pas dans la base. Le **semeur du banc n'avait aucun garde** et pouvait verser quatre-vingts faux clubs chez de vrais clients : il refuse désormais toute base portant une commande ou un paiement, et le tireur autorise au lieu d'interdire — sa liste de noms interdits laissait passer un domaine de production personnalisé. Quand Redis tombe, **huit essais de mot de passe en devenaient vingt-quatre** (compteurs locaux × répliques) : resserrés à trois, tandis que le coupe-circuit par IP ne bouge PAS — resserrer coûterait la vente d'un stade entier. Le **plafond de connexions** ne figurait nulle part : on le demande à PostgreSQL au démarrage et sur `/ready` (« 6/100 prises, de quoi tenir 9 instances »). Et l'**ordre de l'outbox entre ouvriers** n'est pas promis — c'est une décision écrite, pas un oubli : les annonces d'une même commande partagent leur transaction donc leur lot, et les séparer demanderait quarante millisecondes de retard entre deux gestes d'une équipière. **RESTE OUVERT** : P2-4 (lectures client non bornées, l'export CSV partage la fonction), P3-1 (dépendances) et P3-2 (greffon ESLint de Next). **ET UNE CONTRAINTE DE MACHINE** : 5,86 Go de RAM dont 0,3 à 0,6 libres — les échecs jest `UNKNOWN` sous OneDrive, les manques de mémoire de Metro et de tsc et les arrêts de Docker viennent de là, pas du code. Avant : 2026-10-26 (**l'audit Codex traité de bout en bout** — 4 bloquants et 9 risques élevés. Les plus graves : le TEMPS RÉEL laissait un compte authentifié écouter le flux d'un AUTRE club dès qu'il connaissait un UUID ; deux paiements simultanés RÉSERVAIENT LES POINTS DEUX FOIS, dont la moitié perdue pour toujours ; et `next` 15.5.25 portait une EXÉCUTION DE CODE À DISTANCE non authentifiée — classée P1-9, noyée dans une liste de 108. Socket.IO gardait ses salons en mémoire et les compteurs de limitation étaient par instance : les deux lâchent le jour où l'on ajoute un replica pour encaisser un gros match. `NODE_ENV` valait « staging » EN PRODUCTION, donc la production renvoyait au client le message d'erreur brut de PostgreSQL. **L'AUDIT SE TROMPAIT SUR P1-3, et moi avec** : la limite de paramètres PostgreSQL n'est jamais atteinte, Prisma découpant lui-même — vérifié en neutralisant le correctif pour voir l'échec, qui n'est pas venu. La documentation porte la correction. 0 vulnérabilité critique (contre 4), 840 tests backend, 130 d'intégration sur Postgres 18 + Redis. **À FAIRE AVANT TOUT : les deux secrets de sauvegarde** — sans eux il n'existe AUCUNE sauvegarde automatique. Puis `NODE_ENV=production` et la confidentialité App Store, dont la déclaration « aucune donnée collectée » est fausse et publique. **AUDIT CLOS** : 4 bloquants, 9 risques élevés et 3 P2 traités. Les derniers : l'ardoise se coupe désormais SANS REDÉPLOYER (elle rembourse de l'argent encaissé, il faut pouvoir l'arrêter en secondes) ; un compte DÉSACTIVÉ gardait son temps réel jusqu'à expiration de son jeton ; et HTTP et WebSocket ne lisaient pas la même liste d'origines CORS — un espace après une virgule rendait le temps réel muet pour le second club, sans erreur côté serveur. 857 tests backend. P2-4 (lectures non bornées) reste OUVERT sciemment : il gênera avec le volume, pas aujourd'hui. **PROCHAIN CHANTIER : le calendrier de la saison** — spec dans `brain/CALENDRIER_SAISON.md`. Phases 68 à 70 du manuel. Avant : 2026-10-25 (**semaine des notes clients, et deux jours d'arrêt**. Livré : les informations légales dans l'app et leur export Word (phase 63) ; LA NOTE D'UNE COMMANDE de bout en bout — question au client, lecture du club, lecture de la plateforme, plus la demande d'avis App Store à partir de 4 étoiles (phase 64) ; un CALENDRIER dans « Mes clients » et chaque carte comparée à la période précédente, sans inventer de norme (phase 65). **La production est restée du 23 au 25 sans recevoir une seule mise à jour** : ma migration déclarait ses identifiants en TEXT là où cette base attend UUID, `P3009` a bloqué la file, et Railway a laissé l'ancienne version servir — les clients n'ont rien vu, c'était un silence, pas une panne. Trois parades livrées : `pnpm db:verifier` (rejoue les migrations sur un Postgres jetable en 20 s), les SAUVEGARDES nocturnes chiffrées, et « Wait for CI » documenté. **À faire avant toute chose : poser les deux secrets de sauvegarde** — sans eux il n'existe AUCUNE sauvegarde automatique. **LA CI PASSE AU VERT POUR LA PREMIÈRE FOIS** depuis la création du dépôt : `ci.yml` ne lançait pas `prisma generate`, donc trois de ses six jobs n'avaient JAMAIS pu réussir — 43 suites backend sur 58 ne démarraient même pas, et le job `Build` n'avait jamais démarré. Le filet n'était pas mal réglé, il n'existait pas. Une fois réparée, elle a révélé une COURSE sur le code d'ardoise qu'aucune machine de développement ne déclenche (trouvée par Codex). 1 012 tests verts (894 unitaires + 118 d'intégration). **« Wait for CI » est désormais activable** — l'activer plus tôt aurait gelé tous les déploiements ; le propriétaire le REPORTE (25/10). **STAGING est resté bloqué sur P3009 toute la journée** : la base de production avait été débloquée, pas la sienne — une réparation de base se fait sur CHAQUE environnement. Et il ne protège de rien tant qu'il reçoit la même branche `main` au même instant que la production : la branche `develop`, que la CI attend déjà, N'EXISTE PAS. Audit complet : `brain/audits/AUDIT_CHIRURGICAL_2026-10-25.md`. Avant : 2026-10-19 (**mise en ligne imminente** : backend déployé, build iOS envoyée sur TestFlight. Ajoutés ce jour — la SUPPRESSION DE COMPTE depuis l'app, qu'Apple exige (5.1.1(v)) et qui manquait : c'était un motif de rejet ; le logo officiel v2 décliné partout ; le reçu qui porte le nom du client ; les favoris cliquables (`GET /public/venues/:id`) ; l'état des notifications qui venait de l'API du NAVIGATEUR et annonçait « indisponibles » sur tous les iPhone ; la visibilité d'un lieu et une garde sur la suppression d'un club. 790 tests backend, 34 mobile. **Reste avant la mise en ligne : les deux adresses légales** — « Mentions légales » et « Confidentialité » affichent encore « Disponible prochainement », et Apple regarde ce point de près sur une app qui crée des comptes). Avant : 2026-10-16 (les étiquettes d'identité du lien Flaix — `[#firstname]` etc. — sont remplacées par le serveur : le client ne se reconnecte pas. Avant : audit d'une saison entière : 20 lieux, 400 événements, 15 380 vérifications, aucun écart — un défaut de PERFORMANCE corrigé au passage, l'API passe de 117–210 ms à 27 ms. Voir `brain/audits/AUDIT_SAISON_FLAIX_2026-10-16.md`. Avant : phase 59 : le relais Flaix — un lien de commande par événement, la date choisit, et la page s'affiche dans l'app. 790 tests. Migration `20261016_lien_commande_flaix` à passer, et une build EAS obligatoire : la WebView est une dépendance native). Avant : 2026-10-12 (phase 58 : la carte d'un lieu — barre du bas à encoche, recherche dans le bandeau, grandes cartes, et le champ `Venue.photoUrl` qui manquait. 755 tests. Reste : les deux adresses légales, et la migration `20261012_photo_du_lieu` à passer AVANT de déployer l'API))))))_
