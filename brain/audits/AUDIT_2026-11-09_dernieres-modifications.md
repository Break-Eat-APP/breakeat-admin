# Audit des dernières modifications — 09/11/2026

**Périmètre** : les 16 commits du 03/11 au 09/11/2026 (`f259fb7` → `57f0f24`),
40 fichiers de code, 2 600 lignes ajoutées et 565 retirées. Les documents
(`*.md`) et le `pnpm-lock.yaml` ont été lus mais ne sont pas comptés.

**Méthode** : lecture des différences fichier par fichier, en commençant par ce
qui touche aux données ou à l'argent ; comparaison avec les règles du serveur
quand l'app affiche une action ; lecture des résultats de la CI GitHub commit
par commit ; aucune correction faite pendant l'audit (elles sont proposées).

## État vérifié au moment de l'audit

| Contrôle | Résultat | Preuve |
|---|---|---|
| CI GitHub sur `main` (`990a4b8`) | ✅ Build, Tests, Tests d'intégration, Export web, TypeScript, Lint | API GitHub, check-runs du commit |
| CI GitHub sur la branche `maj/expo-57-0-32` (`57f0f24`) | ✅ les mêmes sept jobs | idem |
| Build iOS 38 (`258bd14`) | ✅ compilée, envoyée sur TestFlight | EAS `2d21debb` |
| Build iOS 39 (mise à jour Expo) | ✅ compilée | EAS `f144a6e3` |
| Build Android (mise à jour Expo) | ⏳ en cours au moment de l'audit | EAS `c9d56be3` |
| Serveur en production | sert `acf6187` ; le seul commit plus récent (`990a4b8`) ne touche pas au serveur — le code en ligne est le dernier | `GET /health` → `commit`, 09/11 18 h 42 |

## Constats

Gravité : **Élevée** (à traiter avant publication) · **Moyenne** (défaut visible
par un client) · **Faible** (cas rare ou cosmétique) · **Info** (décision à
connaître).

### Ouverts

| # | Gravité | Constat | Où | Recommandation |
|---|---|---|---|---|
| 1 | **Élevée** | **Le dépôt GitHub est public.** Code, documents, audits, adresses e-mail et fonctionnement Stripe/Flaix lisibles par tous. Aucun secret trouvé : arbre actuel et historique parcourus (`sk_live_`, `whsec_`, clés privées, chaînes Postgres) — seulement des exemples et des valeurs locales. | GitHub → Settings | Passer le dépôt en **privé** (décision de Rémi). |
| 2 | **Moyenne** | **« Noter » proposé sur une commande annulée ou restituée.** L'app l'affiche pour toute commande terminée ; le serveur n'accepte qu'une commande récupérée (`PICKED_UP`, `COMPLETED`) et répond « Cette commande n'a pas encore été récupérée » — faux pour une commande annulée. **Défaut antérieur au ticket** (présent dans `41ee882`), reconduit tel quel. | `apps/mobile/src/screens/order-history.screen.tsx` (`principale`) ; `backend/src/modules/orders/orders.service.ts` (`noterCommande`) | N'afficher « Noter » que pour `PICKED_UP` / `COMPLETED`. |
| 3 | **Moyenne** | **La pastille « Récupérées » montre aussi les commandes annulées et restituées** : elle filtre « tout ce qui n'est pas en cours ». La section, elle, s'appelle « Terminées » — juste. | même écran (`sections`, `FILTRES`) | Soit filtrer `PICKED_UP` / `COMPLETED` seulement, soit renommer la pastille « Terminées ». |
| 4 | Faible | **Favoris : un cœur touché pendant le tout premier chargement est écrasé** par la lecture du stockage (fenêtre de quelques centaines de millisecondes). | `apps/mobile/src/screens/venue-discovery.screen.tsx` | Fusionner la liste lue avec les gestes déjà faits, ou désactiver le cœur jusqu'à `favorisLus`. |
| 5 | Faible | **« À ne pas manquer » lit au plus 400 événements tous lieux confondus**, triés par date. Un lieu qui en programme plus de 400 à l'avance priverait les autres. Théorique aujourd'hui. | `backend/src/modules/events/public-events.controller.ts` (`take`) | Rien à faire tant qu'aucun club ne programme une saison entière à 400 dates. |
| 6 | Info | **Les événements en BROUILLON sont publics** — dans « À ne pas manquer » comme dans le calendrier de saison existant. Cohérent, et probablement voulu : un match créé reste `DRAFT` par défaut et les lieux Flaix ne l'activent pas. Mais la règle n'est écrite nulle part. | `saison-du-lieu.ts`, `public-events.controller.ts` | La documenter (fait dans le manuel le 09/11), ou décider d'exclure `DRAFT` partout à la fois. |
| 7 | Info | **La Live Activity n'a pas encore été vue à l'écran** avec le décompte : le Swift compile (builds 38 et 39), le comportement visuel reste à constater sur un iPhone. | `targets/live-activity/` | Profil → Outils super admin → Aperçu, sur la build 38 ou 39. |
| 8 | Info | **La compilation de l'admin a échoué par intermittence sur la CI** (`f259fb7`, `daa0752`, `f9831e7`, `6e57af4`), y compris sur des commits de documents seuls ; verte depuis. Cause non prouvée — piste : les polices `next/font/google` téléchargées pendant la compilation. | `apps/admin/src/app/layout.tsx` | Lire le journal du job « Build » au prochain échec avant de corriger. |
| 9 | Info | **Les actions GitHub tournent sur Node 20, déprécié** (forcées en Node 24 par GitHub). Sans effet aujourd'hui. | `.github/workflows/ci.yml` | Monter `actions/checkout`, `setup-node`, `pnpm/action-setup` à leur version suivante. |
| 10 | Info | **Clé d'importation Android** : Google Play attendait `B4:0E…` (éditeur précédent), EAS signe avec `F8:C8…`. Réinitialisation demandée par Rémi le 09/11 ; en attente de Google (~48 h). | Play Console | Aucun envoi Android avant la confirmation de Google. |

### Corrigés pendant la période (pour mémoire)

| Constat | Commit |
|---|---|
| CI rouge du 06/11 au 09/11 : un test dépendant du fuseau horaire, un test d'intégration attendant l'ancien message anglais | `acf6187` |
| La clé du compte de service Google Play n'était pas couverte par le `.gitignore` | `f9831e7` |
| Les canaux Google Play inversés (la beta partait en test OUVERT) | `990a4b8` |
| Dépendance cachée `@expo/image-utils` d'`apple-targets` : la mise à jour Expo aurait perdu l'extension Live Activity | `57f0f24` (branche) |
| Messages d'erreur anglais affichés tels quels dans l'admin (dates, statut figé, longueur du nom) | `a6e3813`, `70a04b3` |

## Ce qui a été relu sans constat

- **Route publique `GET /public/events/a-venir`** : identifiants filtrés par
  UUID et plafonnés à 20 ; événements privés servis seulement aux membres
  d'un groupe (`OptionalJwtAuthGuard` présent) ; lieu et club doivent être
  actifs ; règle de répartition testée (11 tests, faute réintroduite).
- **Fiche d'un événement Flaix** (admin) : drapeau lu sur le lieu, fiche
  complète tant que le lieu n'est pas chargé ; un seul composant de saisie
  (`LiensCommandeFlaix`, prop `portee`).
- **Renommage** : nom nettoyé dans le DTO avant la mesure de longueur, testé
  derrière le vrai pipe ; refus en français ; seul le nom est repris de la
  réponse.
- **Notifications par date** : fonction pure, heure locale, semaine du
  calendrier, date illisible conservée ; 16 tests, fautes réintroduites.
- **Live Activity** : même règle de décompte côté serveur
  (`peremption.ts`) et côté Swift (`countdownTarget`) ; borne basse du chrono
  jamais au-dessus de la borne haute ; aperçu sans écriture serveur, jeton
  push écarté par préfixe.
- **Rôle lu dans le jeton** : choix d'affichage, jamais d'autorisation ; ne lève
  jamais sur un jeton illisible.

## Pour remonter à la cause d'un bug

Le guide pas à pas est dans `GUIDE_DEVELOPPEMENT/PHASES_DE_DEVELOPPEMENT.docx`,
section « Remonter à la cause d'un bug ».
