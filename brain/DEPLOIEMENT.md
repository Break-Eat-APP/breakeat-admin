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
| **app Android** | À la main (EAS, `.aab`), puis dépôt dans la Play Console ; clé d'importation acceptée le 17/11 | Play Console → Vue d'ensemble de la publication |
| **sortie sur les stores** | **Rémi, à la main**, après validation (App Store : publication manuelle ; Google Play : publication gérée) et **jamais avant le passage de Stripe en production** ([ADR-0012](DECISIONS/ADR-0012-publication-manuelle-des-stores.md)) | Fiche publique des stores |
| **mise à jour à distance** | À la main, workflow GitHub | Run vert sur GitHub |

**Branches (gouvernance § 15.3 ; décision de Rémi du 21/11/2026)** : pas de
branche de travail. L'agent pousse **directement sur `main`**, ce qui met en
production : tests, typage et lint lancés en local AVANT, CI verte et
`/health` APRÈS. Une migration écrite à la main que `pnpm db:verifier`
n'a pas rejouée passe par une pull request. Détail et limites : `CLAUDE.md`
§ 6.

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
la build 5 à 10 minutes avant qu'elle n'apparaisse dans TestFlight.

**La règle de version** ([ADR-0005](DECISIONS/ADR-0005-runtime-version-version-de-l-app.md)) :
tout changement **natif** (icône, écran d'ouverture, permission, module natif,
Live Activity, config Expo) → monter `version` dans `apps/mobile/app.config.js`
**avant** la build. Les builds d'une version plus ancienne ne reçoivent plus
les mises à jour à distance.

**Une mise à jour à distance** (JavaScript seulement : écrans, textes,
design) : GitHub → Actions → « Mise a jour a distance » → Run workflow →
message, plateforme `all`. **Pas depuis le poste** (2 à 3 Go nécessaires). Le
téléphone la reçoit au lancement et l'applique au suivant (fermer et rouvrir
l'app, parfois deux fois).

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
caractères au plus) → envoyer pour examen.

**Les captures App Store** : onglet « iPhone avec Dynamic Island (écran
moyen) », **1206 × 2622** ou 1179 × 2556 (les 1320 × 2868 y sont refusées).
Google Play : 1080 × 1920, bannière 1024 × 500, icône 512 × 512.

Au 17/11/2026 : **version 1.1.3** — iOS **build 46** en vérification chez
Apple ; Android **code de version 7** en examen chez Google ; mise à jour à
distance 1.1.3 publiée le 16/11 (`1fbdf46`), à relancer après les corrections
du 17/11.

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
