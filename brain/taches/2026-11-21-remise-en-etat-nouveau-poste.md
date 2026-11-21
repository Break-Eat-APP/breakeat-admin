# Compte rendu — remise en état sur le nouveau poste

- **Date :** 21/11/2026
- **Agent / développeur :** Rémi (installation du poste, copie des fichiers) ;
  Claude Code (session cloud, puis session locale) pour la documentation et
  les vérifications
- **Commit(s) :** `9676085`, `12fce0d` (push sur `main`), `1578e0b` (nouveau
  poste), `bf8dbc7` (compte de service Google Play introuvable), `c967dbd`
  (fiche des stores ignorée), `708e938` (REPRISE remise d'aplomb), `2a1b2e5`
  (`eas update`), et le commit de ce compte rendu
- **Bug / décision liés :** aucun ADR. Décisions de Rémi notées dans
  `CLAUDE.md` § 6 (push sur `main`) et dans `REPRISE.md`, note du 21/11
- **Statut :** PARTIEL. Le poste travaille, mais trois points restent ouverts
  (voir « Risques restants »)

## Objectif

Reprendre BreakEat sur un nouveau PC avec **la même méthode de travail**
qu'avant : mêmes règles, même mémoire de l'agent, mêmes outils, sans perdre de
travail ni exposer de secret. La gouvernance (`BRAT_EAT_MASTER_ENGINEERING_GOVERNANCE.md`
§ 18, « Passation ») demande que le projet se reprenne sans dépendre d'une
mémoire orale. Un changement de poste est une passation.

## Avant

- L'ancien poste (6 Go de mémoire, dépôt **dans OneDrive**) est hors service.
  Son disque reste lisible en USB. Dernier commit poussé depuis ce poste : le
  17/11 (`6f601c6`).
- Les règles de travail ne vivaient pas toutes dans le dépôt : une partie
  était dans la mémoire de l'agent, sur l'ancien poste.
- Les documents décrivaient l'ancien poste : 6 Go, Jest fichier par fichier,
  `pnpm` absent du PATH, `eas update` impossible en local.

## Ce qui a été fait

1. **Le dépôt** : cloné dans `C:\dev\breakeat-admin`, **hors de OneDrive**
   (OneDrive abîmait le dossier `.git` et le magasin pnpm).
2. **Les fichiers hors Git** : `backend\.env` et `apps\mobile\.env` recopiés
   depuis l'ancien disque. Il n'y avait pas de `.env` à la racine.
   **`apps/mobile/google-play-service-account.json` est introuvable** sur
   l'ancien disque (voir « Risques restants »).
3. **La mémoire de l'agent** : recopiée, puis triée. 19 fichiers dans
   `C:\Users\notta\.claude\projects\C--dev-breakeat-admin\memory\`, index
   `MEMORY.md`. Les sujets ouverts ne sont tenus que dans `REPRISE.md` ; la
   mémoire n'y renvoie que par un pointeur. La refonte du site vitrine est
   notée **abandonnée** (Rémi, 21/11).
4. **Les règles, mises au poste** :
   - `CLAUDE.md` § 6 : l'agent pousse directement sur `main`, avec ses
     garde-fous ; le workflow GitHub reste la voie normale pour les mises à
     jour à distance, même si le poste peut lancer `eas update` ;
   - `CLAUDE.md` § 7 : le nouveau poste (16 Go, hors OneDrive), `pnpm` dans
     le PATH, Docker, `gh` absent ;
   - `brain/DEPLOIEMENT.md` : l'environnement de développement, et la
     stratégie de branche que demande la gouvernance (§ 15.3) ;
   - `brain/TESTING_STRATEGY.md` : comment les tests tournent sur ce poste.
5. **Qui travaille** : la session locale seule. La session cloud ne pousse
   plus rien. Sa branche `claude/sharp-shannon-4ljkff` est fusionnée (PR #5
   et #6).
6. **Un secret de moins exposé** : `brain/livrables/stores/fiche-stores.md`
   (identifiants du compte de revue) est ignoré par Git (`c967dbd`). Le dépôt
   est public.

## Ce qui a été vérifié sur le poste (21/11, session locale)

| Quoi | Résultat |
|---|---|
| Node | v26.13.1 (le dépôt demande ≥ 22.13.0) |
| Git | 2.56.1 |
| pnpm | 11.3.0 dans le PATH, la version de `packageManager` |
| Docker | Desktop installé, serveur joignable (29.9.3) |
| `gh` | **absent** : lire la CI par l'API publique ou dans le navigateur |
| `backend\.env`, `apps\mobile\.env` | présents |
| `apps\mobile\google-play-service-account.json` | **absent** |
| `node_modules` | présent |
| `git pull` | à jour, arbre propre |

## Tests

| Quoi | Commande | Résultat |
|---|---|---|
| Tests unitaires du serveur, 1er essai | `pnpm --filter @break-eat/backend test` | ❌ 60 suites sur 81 en échec de compilation (`@prisma/client` n'exporte ni `OrderStatus` ni `Prisma.OrderUpdateInput`) : **le client Prisma n'avait jamais été généré sur ce poste**. Les 211 tests qui compilaient passaient |
| Génération du client Prisma | `pnpm db:generate` (dans `backend/`) | ✅ |
| Tests unitaires du serveur, 2e essai | `pnpm test` (dans `backend/`) | ✅ **81 suites, 1 165 tests, 42 s**, suite complète sans `-i` |
| Migrations sur une base vierge (Docker) | `pnpm db:verifier` (dans `backend/`) | ✅ toutes appliquées, jusqu'à `20261121_lieux_favoris`, 24 s ; base d'essai supprimée |

Ce qui n'a **pas** été lancé : la suite mobile, le typage, le lint et l'export
web (sur l'ancien poste, l'export échouait à cause de OneDrive ; jamais essayé
ici).

## Documentation mise à jour

`CLAUDE.md` (§ 6, § 7), `REPRISE.md` (note du 21/11, « Ce qui reste »),
`brain/DEPLOIEMENT.md`, `brain/TESTING_STRATEGY.md`, ce compte rendu.

## Risques restants

1. **Compte de service Google Play introuvable** : sans lui, `eas submit`
   ne peut pas envoyer une build Android à la Play Console. À régler avant la
   prochaine soumission Android (procédure dans `REPRISE.md`).
2. **L'ancien disque n'a pas été comparé à `main`** : des commits ou des
   fichiers modifiés du 18-19/11 jamais poussés peuvent y rester.
3. **`gh` absent** : sans connexion GitHub, l'agent lit la CI par l'API
   publique (60 lectures par heure). Ce ne sera plus possible quand le dépôt
   passera en privé.

## Retour arrière

Rien à défaire côté production : seuls des documents ont changé. L'ancien
disque reste intact tant qu'il n'est pas effacé : **ne pas l'effacer** avant
d'avoir réglé le point 2 ci-dessus.

## Suite — la liste à rejouer sur un prochain poste

1. Installer Git, Node (≥ 22.13), Docker Desktop. `corepack enable` (ou
   `npm i -g pnpm@11.3.0`). Si besoin, `gh`.
2. Cloner **hors de OneDrive** (`C:\dev\breakeat-admin`), puis `pnpm install`,
   puis **`pnpm db:generate` dans `backend/`** : sans client Prisma généré,
   60 suites de tests sur 81 ne compilent pas (constaté le 21/11).
3. Recopier les fichiers hors Git, **par clé USB ou disque, jamais par une
   conversation ni par Git** : `backend\.env`, `apps\mobile\.env`,
   `apps\mobile\google-play-service-account.json`,
   `brain\livrables\stores\fiche-stores.md`.
4. Recopier la mémoire de l'agent
   (`%USERPROFILE%\.claude\projects\C--dev-breakeat-admin\memory\`). Le
   nom du dossier suit le chemin du clone : un autre chemin donne un autre
   dossier.
5. Sur l'ancien poste ou son disque : `git status`, `git log --oneline -5`,
   `git stash list`. Pousser ou comparer ce qui reste **avant** de travailler
   sur le nouveau.
6. Lancer les tests du serveur et `pnpm db:verifier` pour prouver que le
   poste fonctionne. Puis mettre à jour `CLAUDE.md` § 7 et ce type de compte
   rendu.
