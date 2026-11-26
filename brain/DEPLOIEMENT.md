# Déploiement, versions, sauvegardes et retour arrière

> Ouvert le 11/11/2026 (gouvernance, étape 4). **Remplace** `DEPLOY-BACKEND.md`
> (25/06) et `DEPLOYMENT_CHECKLIST.md` (07/06), archivés dans
> `brain/archives/` : ils décrivaient des chemins qui n'existent plus. Les
> pièges d'exploitation du moment restent dans `REPRISE.md`.

## Les environnements

| | Existe ? | Où |
|---|---|---|
| Développement | Oui | Le poste de Rémi (Windows, 16 Go, `C:\dev\breakeat-admin` hors OneDrive, depuis le 21/11/2026 : voir `CLAUDE.md` § 7) ; `GUIDE_DEVELOPPEMENT/README.md` pour lancer |
| **Préproduction** | **Non** (BUG-2026-014) | Procédure prête : `GUIDE_DEVELOPPEMENT/ENVIRONNEMENT_BETA.md` |
| Production | Oui | Railway (API + PostgreSQL), Vercel (consoles web), App Store / TestFlight |

Sans préproduction, **la CI est le seul filet** avant la production : la lire
après chaque envoi, et attendre qu'elle soit verte avant de considérer une
migration comme sûre.

## Qui déploie quoi

| Composant | Déclencheur | Vérification |
|---|---|---|
| **backend** | Railway, automatique à chaque envoi sur `main` qui touche `backend/**` (ou `railway.json`, `nixpacks.toml`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`) | `curl -s https://breakeat-admin-production.up.railway.app/health` → `commit` = `git log -1 --format=%h origin/main` |
| admin, back-office, operator, mobile web | Intégration Git de Vercel, automatique | Panneau Deployments de Vercel |
| **app iOS** | À la main (EAS), voir plus bas | TestFlight |
| **app Android** | EAS construit l'`.aab` (`npx eas-cli build --platform android --profile beta`), puis **Rémi le dépose à la main** dans la Play Console. `eas submit` n'est pas utilisé pour Android : il n'existe pas de compte de service Google Play (vérifié le 21/11). Clé d'importation acceptée le 17/11 | Play Console → Vue d'ensemble de la publication |
| **sortie sur les stores** | **Rémi, à la main**, après validation (App Store : publication manuelle ; Google Play : publication gérée) et **jamais avant le passage de Stripe en production** ([ADR-0012](DECISIONS/ADR-0012-publication-manuelle-des-stores.md)) | Fiche publique des stores |
| **mise à jour à distance** | À la main, workflow GitHub | Run vert sur GitHub |

**Branches (gouvernance § 15.3 ; décision de Rémi du 21/11/2026)** : pas de
branche de travail. L'agent pousse **directement sur `main`**, ce qui met en
production : tests, typage et lint lancés en local AVANT, CI verte et
`/health` APRÈS. Une migration écrite à la main que `pnpm db:verifier`
n'a pas rejouée passe par une pull request. Détail et limites : `CLAUDE.md`
§ 6.

**Ce que Rémi valide, et ce qui part seul (21/11/2026)** :

| Action | Accord de Rémi ? | Comment il contrôle |
|---|---|---|
| Pousser du code sur `main` (serveur, consoles) | **Non** : c'est l'accord donné une fois pour toutes le 21/11. Railway et Vercel déploient seuls | Le compte rendu de l'agent (commit, tests lancés) ; GitHub → Commits et Actions (CI) ; `/health` |
| Pousser de la documentation seule | Non | Idem. Railway ne redéploie pas (`watchPatterns`), la CI ne tourne pas |
| Mise à jour à distance de l'app | **Oui, à chaque fois** | C'est Rémi qui lance le workflow, ou l'agent sur son accord écrit |
| Build native (EAS), soumission aux stores | **Oui, à chaque fois** | EAS, TestFlight, Play Console |
| Publication sur les stores | **Rémi la fait lui-même** (ADR-0012) | — |
| Stripe en mode live | **Oui** : Rémi pose les clés lui-même sur Railway | Stripe, Railway |

Avant le 21/11, la validation passait par la **pull request** que Rémi
fusionnait. Pour retrouver un point d'arrêt avant chaque envoi, il y a deux
moyens : revenir aux pull requests (une ligne à changer dans `CLAUDE.md` § 6),
ou régler Claude Code pour qu'il **demande avant chaque `git push`** (règle
« ask » dans `.claude/settings.json`). La seconde garde l'envoi direct, avec un
clic de Rémi à chaque fois. **Rémi a choisi le 21/11 de rester en direct,
sans clic** : ne pas le lui reproposer.

**Ce qui repasse par l'examen d'Apple et de Google** : toute **nouvelle build
native** (nouvelle `version` ou nouveau numéro de build) envoyée sur les
stores, soit un examen de 1 à 7 jours de chaque côté. Sur Android, les pistes
de test ont leur propre examen, plus court. Une **mise à jour à distance**
(JavaScript seul) ne passe par aucun examen. Une build native qui ne change
qu'un détail (les textes de permission de la 1.1.4) coûte donc deux examens :
on la regroupe avec le prochain vrai changement natif.

**`railway.json` fait autorité** pour le démarrage du serveur :
`pnpm db:generate && sh scripts/migrer.sh && node dist/main`. Les migrations
s'appliquent **au démarrage** ; `/health` sert de sonde.

⚠️ Railway déploie **en même temps** que la CI tourne, sans l'attendre
(amélioration conseillée : conditionner le déploiement à la CI verte).

## La CI (`.github/workflows/ci.yml`)

Lint · TypeScript · Tests · **Tests d'intégration sur PostgreSQL réel**
(toutes les migrations rejouées) · Build · Export web de l'app. Environ
10 minutes de machine par passage. **Elle ne tourne pas pour un commit qui ne
touche que de la documentation** (`paths-ignore` : `*.md`, `brain/`,
`GUIDE_DEVELOPPEMENT/`, `documents-legaux/`, `logo/`, Word, PDF…) ; un commit
mixte la déclenche toujours.

Autres workflows : sauvegarde de nuit, **essai de restauration** (1er du
mois), **audit des dépendances** (chaque lundi), mise à jour à distance. L'état se lit sur GitHub → Actions, ou
par l'API publique tant que le dépôt est public.

## Une migration de base

1. Écrire la migration dans `backend/prisma/migrations/<date>_<nom>/` — les
   clés de cette base sont en **UUID** (INC-2026-003, `CLAUDE.md` § 5).
2. `pnpm db:verifier` dans `backend/` (Docker requis) ; sinon, la CI la
   rejoue — attendre le vert.
3. Avant une migration délicate : lancer une **sauvegarde à la demande**
   (GitHub → Actions → « Sauvegarde de la base » → Run workflow).
4. Après le déploiement : `/health` → le `commit` doit être le nouveau. S'il
   reste l'ancien, lire le journal *Deploy* de Railway : une migration en
   échec (`P3009`) bloque tout — procédure dans `REPRISE.md` (« UNE
   MIGRATION ÉCRITE À LA MAIN SUIT LA BASE »).

## L'app mobile

**Une build** (changement natif, ou nouvelle version pour les stores) :

```
cd apps/mobile
npx eas-cli build --platform ios --profile beta --non-interactive --no-wait
npx eas-cli submit --platform ios --profile beta --id <id de la build> --non-interactive
```

Le numéro de build monte tout seul (`appVersionSource: remote`). Apple traite
la build 5 à 30 minutes avant qu'elle n'apparaisse dans TestFlight, puis dans
la section « Build » de la version sur App Store Connect.

**Une build finie sur EAS n'est PAS chez Apple** : tant que `eas submit` n'a
pas tourné, la section « Build » d'App Store Connect reste vide (« Chargez vos
builds… »). Constaté le 26/11 avec la build 49. L'envoi vers Apple se lance
depuis le poste de Rémi. L'agent en a été empêché le 26/11 par le mode
automatique de Claude Code.

**Limite : 15 builds EAS par mois** (forfait de Rémi, rappelé le 26/11). Aucune
build sans son accord explicite. Une build annulée compte aussi. Grouper les
changements natifs.

**iOS 27** : `expo-build-properties` → `ios.enableSceneSupport: true`
(`app.config.js`). Sans lui, une build faite avec le SDK iOS 27 est tuée au
lancement (BUG-2026-049, build 1.1.4). **Ne jamais le retirer.**

**La règle de version** ([ADR-0005](DECISIONS/ADR-0005-runtime-version-version-de-l-app.md)) :
tout changement **natif** (icône, écran d'ouverture, permission, module natif,
Live Activity, config Expo) → monter `version` dans `apps/mobile/app.config.js`
**avant** la build. Les builds d'une version plus ancienne ne reçoivent plus
les mises à jour à distance.

**Une mise à jour à distance** (JavaScript seulement : écrans, textes,
design) : GitHub → Actions → « Mise a jour a distance » → Run workflow →
message, plateforme `all`. Depuis le nouveau poste (16 Go, 21/11), elle part
aussi en local (voir plus bas). Le téléphone la reçoit au lancement et
l'applique au suivant (fermer et rouvrir l'app, parfois deux fois).

**Plusieurs versions installées en même temps : publier une fois PAR
version.** Une mise à jour ne s'installe que sur la version qu'elle vise
(`runtimeVersion` = version de l'app). Au 26/11, il y a trois publications par
livraison :

| Pour | Workflow GitHub | En local (`apps/mobile`) |
|---|---|---|
| 1.1.5 (iOS et Android) | plateforme `all`, version visée vide | `npx eas-cli update --channel production --environment production --platform all --message "…" --non-interactive` |
| iPhones restés en 1.1.4 | plateforme `ios`, version visée `1.1.4` | même commande, précédée de `VERSION_VISEE=1.1.4`, avec `--platform ios` |
| Android restés en 1.1.3 | plateforme `android`, version visée `1.1.3` | même commande, précédée de `VERSION_VISEE=1.1.3`, avec `--platform android` |

En local, charger d'abord les variables `env` du profil `beta` de `eas.json`
et `NODE_OPTIONS=--max-old-space-size=6144`. **EAS refuse un arbre Git sale** :
un fichier non suivi (un audit déposé dans `brain/audits/`, par exemple) bloque
la publication. Le mettre de côté le temps de publier, ou le committer.

Le workflow refuse une version visée avec `all` : une version ancienne n'est
pas la même sur les deux plateformes. On retire une ligne du tableau quand
plus aucun téléphone n'a cette version (tableau de bord EAS → Updates).
Erreur du 24/11 à ne pas refaire : publier « 1.1.4 » pour Android, où personne
n'a la 1.1.4. La mise à jour n'arrive alors à aucun Android.

**Android** (même code, même version) :

```
cd apps/mobile
npx eas-cli build --platform android --profile beta
```

Le profil `beta` produit un **`.aab`** signé avec la clé d'importation EAS
(`F8:C8:BD:86:…:D0:08`). Avant de le déposer : vérifier l'alignement 16 ko des
bibliothèques natives, l'absence de Google Play Billing et de la permission
`AD_ID` (contrôle fait le 17/11, `brain/taches/2026-11-17-soumission-stores-1.1.3.md`).
Dépôt : Play Console → Tests internes ou Production → modifier la version →
déposer l'`.aab` → notes de version entre `<fr-FR>` et `</fr-FR>` (500
caractères au plus) → envoyer pour examen. Le lien de l'`.aab` se lit dans
EAS (`npx eas-cli build:view <id> --json` → `artifacts.buildUrl`). La clé du
compte de service Play (`google-play-service-account.json`) **n'est pas sur le
poste** : pas d'`eas submit` pour Android.

**Les captures App Store** : onglet « iPhone avec Dynamic Island (écran
moyen) », **1206 × 2622** ou 1179 × 2556 (les 1320 × 2868 y sont refusées).
Google Play : 1080 × 1920, bannière 1024 × 500, icône 512 × 512.

Au 26/11/2026 :
- **iOS** : la 1.1.4 (build 47, correctif iOS 27) est sur l'App Store. La
  **1.1.5 (build 49)** est construite, à envoyer à Apple puis en vérification
  par Rémi.
- **Android** : la 1.1.3 (code 7) est sur Play. La **1.1.5 (code 9)** est
  construite, à déposer dans la Play Console.
- Mises à jour à distance : la dernière est la 1.7.71, publiée sur les trois
  versions.

(Au 17/11 : 1.1.3, iOS build 46, Android code 7.)

## Les sauvegardes

- **Chaque nuit à 03 h 00 UTC**, et à la demande :
  `.github/workflows/sauvegarde.yml` — export complet, **chiffré AES-256**,
  déposé en artefact GitHub (90 jours). Secrets : `DATABASE_URL_SAUVEGARDE`,
  `SAUVEGARDE_PASSPHRASE` (la phrase est gardée **ailleurs** que dans GitHub ;
  sans elle, les sauvegardes sont illisibles).
- Filet manuel : `backend/scripts/sauvegarde.js`.
- **Restauration vérifiée** le 18/09 (146 commandes retrouvées), le 25/10
  (cycle complet par le script) et **le 11/11 à partir d'un artefact de nuit
  réel** (exécution 43092415355, sans erreur).
- **Essai automatique** : `.github/workflows/essai-restauration.yml` —
  télécharge la dernière sauvegarde de nuit réussie, la déchiffre avec le
  secret, la restaure dans un PostgreSQL 18 **jetable** et vérifie tables,
  migrations et données (sans rien afficher : le dépôt est public). Le 1er
  de chaque mois, et à la demande (Actions → « Essai de restauration »). Le
  détail chiffré est dans le résumé de l'exécution sur GitHub.

**Restaurer**, sur une base **vide** :

```
gpg --batch --decrypt --passphrase "<la phrase>" --output restauration.dump breakeat_AAAA-MM-JJ_hhmm.dump.gpg
pg_restore --clean --if-exists --no-owner --dbname="<adresse>" restauration.dump
```

## Retour arrière

| Composant | Comment | Attention |
|---|---|---|
| backend | Railway → Deployments → redéployer un déploiement précédent ; ou `git revert` puis envoi | Un retour du code **n'annule pas** une migration déjà appliquée : vérifier que l'ancien code tolère les nouvelles colonnes (c'est le cas d'un ajout de colonne nullable) |
| consoles web | Vercel → Deployments → « Promote » d'un déploiement précédent | — |
| mise à jour à distance | Republier la version précédente (`eas update:republish`) ou publier un correctif | Les téléphones l'appliquent au lancement suivant |
| build iOS | TestFlight : faire tester la build précédente ; App Store : soumettre une nouvelle version | Pas de retour arrière instantané sur l'App Store |
| version Android | Play Console : arrêter le déploiement progressif, ou publier une version au code supérieur | Un code de version ne redescend jamais |
| données | Restauration d'une sauvegarde (ci-dessus) | En dernier recours : tout ce qui a été écrit depuis est perdu |

## Avant et après une mise en production

**Avant** : CI verte · migration rejouée · sauvegarde à la demande si la
migration est délicate · pas la veille d'un match si ce n'est pas urgent.

**Après** : `/health` → bon `commit` · journal *Deploy* de Railway sans
erreur · l'écran concerné vérifié en vrai · `CHANGELOG.md` et `REPRISE.md`
à jour.
