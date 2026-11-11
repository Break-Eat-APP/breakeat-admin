# CLAUDE.md — instructions permanentes pour les agents (Claude Code, Codex, Cursor)

> Ce fichier est lu en premier par tout agent qui travaille sur ce dépôt. Il ne
> remplace aucun document : il dit **quoi lire**, **les règles qui ne se
> discutent pas** et **les pièges déjà payés**. Il est la version publique des
> règles qui ne vivaient jusqu'ici que dans la mémoire d'un agent (11/11/2026).
>
> Il applique la gouvernance `BRAT_EAT_MASTER_ENGINEERING_GOVERNANCE.md`
> (v1.0, 11/11/2026), **adaptée au dépôt** : la documentation vit dans `brain/`,
> `REPRISE.md` et `CHANGELOG.md` — on ne crée pas de `docs/` parallèle.
>
> ⚠️ **Le dépôt est public** (au 11/11/2026, décision en attente). Rien ici, ni
> nulle part dans le dépôt : aucun mot de passe, aucun jeton, aucune clé.

---

## 1. À lire avant de toucher à quoi que ce soit

| Ordre | Lire | Pour |
|---|---|---|
| 1 | [`REPRISE.md`](REPRISE.md) — d'abord « ÉTAT AU … — LIRE D'ABORD », puis « SUJETS OUVERTS » et « Pièges du moment » | L'état réel : ce qui tourne, ce qui reste, ce qui a cassé |
| 2 | [`GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md`](GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md) | Où se trouve quoi |
| 3 | Selon le sujet, dans [`brain/`](brain/) | `ORDER_STATE_MACHINE.md` (commandes), `REALTIME_CONTRACTS.md` (temps réel), `FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md` et `FRONTIERE_FLAIX_OPS.md` (Flaix), `CALENDRIER_SAISON.md` (saison), `DESIGN_SYSTEM.md` |
| 4 | Les derniers éléments de [`CHANGELOG.md`](CHANGELOG.md) | Ce qui vient d'être livré, et pourquoi |
| 5 | `git status` et `git log --oneline -10` | Ne jamais écraser un travail en cours |

⚠️ `brain/ARCHITECTURE.md` et `brain/AGENTS.md` datent du 01/06/2026 et sont
**dépassés** (mise à jour prévue). En cas de doute, **le code fait foi**.

---

## 2. Règles absolues

1. **Ne jamais perdre une commande.** Une commande validée ne disparaît pas ;
   l'état serveur persistant est la référence, le temps réel n'est qu'un
   signal.
2. **Chaque transition de commande est tracée** (`orderAuditTrail`, écrit dans
   la même transaction que le statut — `orders.service.ts`, `transition`).
3. **Ce qui doit partir après un changement d'état est promis DANS la
   transaction**, puis rattrapé : la file `RealtimeOutbox` pour le temps réel,
   `orders.ready_announce_due_at` pour l'annonce « prête ». Jamais de
   « fire-and-forget » seul pour un signal qui compte.
4. **Flaix décide** des créneaux de retrait et du rythme quand il pilote un
   lieu. **Pour une commande Flaix, c'est l'opérateur Flaix qui dit « prête »,
   à la main** (tranché par Rémi le 11/11/2026). BreakEat n'écrase pas ses
   décisions.
5. **Les droits se vérifient côté serveur**, à chaque ressource. Masquer un
   bouton n'est pas une protection. Aucun accès d'une organisation à une
   autre ; le super admin est l'exception voulue (rôle relu en base).
6. **Aucun secret** dans le code, Git, l'app, les journaux ou une conversation.
   Variables d'environnement seulement, documentées dans les `.env.example`
   sans valeur.
7. **Aucune migration destructive non testée** (voir § 5).
8. **Ne jamais affirmer qu'un test passe sans l'avoir exécuté.** Dire ce qui
   n'a pas pu être lancé, et pourquoi.
9. **Ne jamais déclarer « en ligne » ce qui n'est que poussé** : vérifier le
   déploiement (§ 6) avant de dire « à tester ».
10. **Aucun changement de règle métier sans le dire et le noter** (REPRISE,
    puis CHANGELOG).

---

## 3. Méthode de travail

**Diagnostiquer par les journaux, pas par hypothèses.** Devant un bug signalé,
la première action est de demander l'extrait pertinent — jamais de corriger à
partir des symptômes. (Le 06/09/2026, six heures d'hypothèses ; la cause tenait
en une ligne de journal Railway.)

- **Railway** → Deployments → Logs (journal *Deploy*, pas *Build*) : exceptions
  serveur ; une erreur dans l'app porte une `réf. xxxxxxxx` qui s'y retrouve.
- **Stripe** → Développeurs → Webhooks → « Tentatives récentes ». Un 200 vert
  dit seulement que le serveur n'a pas planté.
- **Vercel** → Logs du déploiement (tableaux de bord web).
- **Console du navigateur** : proposer **Ctrl + Maj + I** ou clic droit →
  Inspecter. **Jamais F12** (sur le poste de Rémi, F12 ouvre la calculatrice).

**Petit périmètre.** Une tâche se relit, se teste et s'annule seule. Pas de
refactor hors sujet, pas de dépendance sans justification.

**Vérifier.** Selon le risque : tests unitaires, intégration, lint, typage,
build — puis le rendu réel quand c'est visible (aperçu local, captures).

**Documenter en fin de tâche :**
- `CHANGELOG.md` : une entrée par livraison notable (le *pourquoi*, pas
  seulement le *quoi*), et la ligne de version dans `brain/ROADMAP.md` ;
- `REPRISE.md` : l'état, les sujets ouverts, les pièges découverts ;
- un audit reçu (Codex…) se range dans `brain/audits/` avec la réponse ;
- un compte rendu daté pour les tâches importantes (migration, paiement,
  intégration Flaix, incident) — modèle à venir dans `brain/taches/`.

---

## 4. Vocabulaire devant le client

| Dire | Jamais |
|---|---|
| **« partager l'addition »** | « ardoise », « tournée » (vocabulaire interne du module `order-splits` — y compris dans les messages d'erreur du backend, qui remontent tels quels) |
| **« la commande ouvre à 08:00 »**, avec le jour s'il n'est pas aujourd'hui | « les buvettes ouvrent », « précommander », « réserver » |
| **BreakEat** (l'app, en un mot) | — ; **Break Eat** (deux mots) reste la société (SAS BREAK EAT APP) dans les textes légaux : ne pas « harmoniser » |
| Le client est **tutoyé** dans l'app (« Ta commande est prête ») | — |

Trois moments distincts : le lien du match (le club), **l'ouverture de la
commande** (BreakEat, `Venue.ordersOpenAt`, par lieu), les créneaux de retrait
(**Flaix** — ne jamais les afficher, ils changent sans qu'on l'apprenne).

---

## 5. Base de données et migrations

- Toute modification de schéma = une migration versionnée dans
  `backend/prisma/migrations/`.
- **Les clés de cette base sont en `UUID`, pas en `TEXT`** : Prisma écrit
  `TEXT` par défaut pour `String @default(uuid())`. Une clé étrangère `TEXT`
  vers une colonne `UUID` a arrêté la production du 23 au 25/10/2026. Le SQL
  dit le type de la **colonne**, pas celui du langage.
- Avant de pousser une migration écrite à la main : `pnpm db:verifier` dans
  `backend/` (Docker requis). Sans Docker, la CI la rejoue sur un PostgreSQL
  réel avant les tests d'intégration — **attendre la CI verte**.
- Une migration en échec en production (`P3009`) bloque toutes les suivantes
  et Railway **continue de servir l'ancienne version** : voir la procédure
  dans `REPRISE.md` (« UNE MIGRATION ÉCRITE À LA MAIN SUIT LA BASE »).

---

## 6. Déploiement — qui déploie quoi

| Quoi | Comment | Vérifier |
|---|---|---|
| **backend** | Railway, automatique sur `main` (`watchPatterns: /backend/**`) | `curl -s https://breakeat-admin-production.up.railway.app/health` → le champ `commit` doit égaler `origin/main` |
| admin, back-office, operator, mobile web | Intégration Git de Vercel, automatique | Panneau Deployments de Vercel |
| **app iOS / Android** (natif) | EAS : `npx eas-cli build --platform ios --profile beta`, puis `npx eas-cli submit --platform ios --profile beta --id <build>` | TestFlight |
| **mise à jour à distance** (JavaScript de l'app) | Workflow GitHub « Mise a jour a distance » (lancé à la main ; le poste n'a pas la mémoire pour `eas update`) | Run vert sur GitHub |

**Règle de version (`runtimeVersion` = version de l'app) :** tout changement
**natif** (icône, permission, module natif, Live Activity, config Expo) →
**monter `version` dans `apps/mobile/app.config.js`** avant la build. Sinon une
mise à jour à distance écrite pour la nouvelle build serait envoyée aux
anciennes. Conséquence : les builds d'une version plus ancienne ne reçoivent
plus les mises à jour à distance.

Ne jamais déployer en production ni publier une mise à jour à distance sans
l'accord de Rémi.

---

## 7. Pièges techniques déjà payés

- **L'app réelle est `apps/mobile/App.expo.tsx`** (`"main": "index.expo.js"`),
  sur TOUTES les plateformes (web, iOS, Android). `App.tsx` et
  `root-navigator.tsx` ne sont jamais livrés : y corriger un bug ne change rien.
- **Deux copies de React** = crash iOS « useState of null ». Les singletons
  forcés dans `apps/mobile/metro.config.js` l'empêchent : **ne pas retirer ce
  bloc**.
- **`Alert.alert` ne fait rien sur le web** : utiliser `showAlert` /
  `confirmAction` de `apps/mobile/src/lib/alert.ts`.
- **Tests mobiles** : Jest ne résout pas l'alias `@lib` ; un module importé par
  alias se moque avec `{ virtual: true }`, et les variables utilisées dans
  `jest.mock` doivent commencer par `mock`.
- **L'icône iOS est au format Icon Composer** (`apps/mobile/assets/breakeat.icon`,
  branché par `ios.icon`) — **validée nette sur iPhone le 11/11 (build 44), ne
  pas revenir à un PNG** : iOS 26 habille toute icône PNG de reflets, d'ombre et
  d'un dégradé, et le B paraissait flou. Pour la changer : refaire
  `Assets/b.png` (1024, fond transparent), garder `icon.json`, monter `version`,
  nouvelle build. Détail dans `REPRISE.md` (« L'icône iOS »).
- **Le poste de développement a peu de mémoire** (6 Go, souvent < 600 Mo
  libres) : lancer Jest avec `-i` et `NODE_OPTIONS=--max-old-space-size=1000`,
  tester fichier par fichier ; la suite complète tourne en CI.
- `pnpm` n'est pas dans le PATH Windows : `corepack pnpm …`.

---

## 8. Shell et Git

- **Messages de commit : toujours `git commit -F <fichier>`**, jamais `-m`. Les
  messages citent des chemins entre backticks, que bash *exécute* et efface du
  message.
- Le terminal de Rémi est **PowerShell** : une commande à lui donner ne
  contient **jamais `&&`** — une commande par bloc, sans `cd` en préfixe.
- Pas de `git add .` aveugle : ajouter les fichiers concernés, relire
  `git show --stat` avant de pousser.
- Pas de force-push sur `main`, pas de réécriture d'historique partagé.
- Fin de commit : `Co-Authored-By:` de l'agent qui a écrit le code.

---

## 9. Fin de tâche — la liste

- [ ] Périmètre respecté, diff relu, rien hors sujet.
- [ ] Tests ajoutés ou adaptés, **réellement exécutés** ; ce qui n'a pas pu
      l'être est dit.
- [ ] Lint et typage sur les fichiers touchés.
- [ ] Migration rejouée (local ou CI) si le schéma a changé.
- [ ] Aucun secret ajouté.
- [ ] `CHANGELOG.md` (+ ligne `brain/ROADMAP.md`), `REPRISE.md` à jour.
- [ ] Déploiement vérifié (§ 6) avant de dire « en ligne ».
- [ ] Compte rendu à Rémi : fait, fichiers, tests lancés et résultats, risques,
      suite.
