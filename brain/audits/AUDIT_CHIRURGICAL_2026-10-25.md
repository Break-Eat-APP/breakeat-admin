# Audit chirurgical de Break Eat — semaine du 19 au 25 octobre 2026

**Date :** 25 octobre 2026
**Révision auditée :** `3a1d58c`
**Périmètre :** phases 63 à 66 — informations légales, notes clients, dates
choisies, et la panne du 23/10. Backend, mobile, admin, back-office, opérateur,
migrations, CI/CD, exploitation.
**Modification du code pendant l'audit :** **oui, une** — `archives.int-spec.ts`
ne compilait plus depuis le 19/10 et a été remis d'équerre (voir P2-1). Le
signaler sans le corriger aurait laissé une suite d'intégration morte un jour
de plus.

---

> **⚠ Lire d'abord la MISE À JOUR DU 25/10 à 16h30, en fin de document.**
> Trois constats de cet audit ont été corrigés le jour même, et la CI passe
> désormais au vert pour la première fois depuis la création du dépôt.

## Verdict général

**La semaine a livré une fonctionnalité complète de bout en bout** — la note
d'une commande, depuis la question au client jusqu'aux deux consoles de
lecture — et **a révélé deux défauts de chaîne de livraison plus graves que
n'importe quel défaut de code** :

1. une migration fautive a bloqué la production **deux jours** sans que rien
   ne le signale ;
2. une suite d'intégration ne compilait plus **depuis six jours**, et le seul
   contrôle qui l'aurait vu n'était pas regardé.

Les deux ont la même forme : **un filet existait, personne ne le regardait.**

> Le code livré cette semaine est sain. La chaîne qui l'amène en production ne
> l'était pas.

**Conclusion :** le périmètre fonctionnel est prêt. Trois réglages
d'exploitation restent à poser — ils ne sont pas dans le code, et sans eux la
plateforme reste exposée à une perte de données et à un déploiement fautif.

---

## Résultats des vérifications

| Vérification | Résultat |
|---|---|
| Tests backend | 58 suites, **796 tests** réussis |
| Tests mobile | 3 suites, **34 tests** réussis |
| Tests back-office | 2 suites, **27 tests** réussis |
| Tests admin | 2 suites, **25 tests** réussis |
| Tests opérateur | 1 suite, **12 tests** réussis |
| **Tests d'intégration PostgreSQL** | 12 suites, **118 tests** réussis *(après correction P2-1 ; 11 suites / 91 tests avant)* |
| Typecheck | Réussi sur les 5 packages |
| Lint | Réussi, **0 erreur** sur 6 packages |
| Build backend | Réussi (`prisma generate && nest build`) |
| Build admin | Réussi — `/avis` 2,81 ko, `/clients` 8,45 ko |
| Build back-office | Réussi — `/avis` 2,38 ko |
| **Migrations sur Postgres 16 vierge** | 47 migrations appliquées, **0 erreur** |
| Sauvegarde + restauration | Répétée en entier : 45 tables, 47 migrations, types `uuid` et contrainte `1..5` restitués à l'identique |
| Production (`breakeat-admin-production`) | `/health` **200**, `POST /orders/:id/avis` **401**, `GET /organizations/:id/avis` **401** |

**Total : 894 tests unitaires + 118 d'intégration = 1 012 tests verts.**

Note d'environnement : la machine de validation a épuisé sa mémoire à deux
reprises (serveur Next en développement, puis démon Docker). Les relances
séquentielles passent. Limite de l'environnement, pas du code.

---

## Problèmes prioritaires

### P1-1 — La déclaration de confidentialité App Store est FAUSSE, et elle est publique

**Constat.** La fiche App Store (`ascAppId 6496204412`, version 1.0.10 « Prête
pour la distribution ») déclare :

> « Données non collectées — Le développeur ne collecte aucune donnée avec
> cette app. »

Break Eat collecte e-mail, nom, prénom, téléphone, historique de commandes,
position, et traite des paiements via Stripe. La déclaration est donc **fausse
et actuellement en ligne**.

De plus, l'URL de politique de confidentialité pointe encore vers
`legal.shapper.com/?app=391f5463…` — la plateforme no-code quittée depuis, non
vers les textes rédigés en phase 63.

**Pourquoi c'est P1.** Une mise à jour soumise avec cette déclaration inchangée
se fait rejeter. Et indépendamment d'Apple, c'est une déclaration inexacte aux
utilisateurs.

**Fichiers concernés :** aucun — c'est une saisie dans App Store Connect.

**Correction attendue.** Créer la version 1.1.0 dans App Store Connect (le
bouton ⊕ à côté d'« App iOS ») : les deux champs sont en lecture seule tant
qu'aucune version n'est ouverte. Puis corriger l'URL et remplir le
questionnaire de collecte. Nécessite un rôle Admin ou Gestionnaire d'app.

---

### P1-2 — Aucune sauvegarde automatique n'existe à ce jour

**Constat.** `.github/workflows/sauvegarde.yml` a été livré en phase 66, mais
il est **inerte** : il exige deux secrets de dépôt qui ne sont pas posés —
`DATABASE_URL_SAUVEGARDE` et `SAUVEGARDE_PASSPHRASE`.

Railway ne sauvegarde pas sur l'offre actuelle : la planification est réservée
au plan Pro (constaté le 18/09, inchangé).

**Pourquoi c'est P1.** Tout le reste de la sécurité protège d'une intrusion.
Ceci protège d'une **perte**, qui est irréversible. À ce jour, si la base
disparaît, c'est un mois de commandes, de comptes et de comptabilité qui
disparaît avec elle.

**Correction attendue.** Poser les deux secrets (Settings → Secrets and
variables → Actions), puis lancer le workflow une fois à la main pour vérifier
qu'il passe. La phrase de chiffrement doit être conservée **hors de GitHub** —
sans elle les sauvegardes sont illisibles, y compris par leur propriétaire.

---

### P1-3 — Railway déploie indépendamment de la CI *(ouvert)*

**Constat.** La CI possède le job qui aurait dû attraper la migration fautive :
`Tests d'intégration (base réelle)` monte un Postgres et applique les
migrations de production.

**Mais ce job n'a jamais pu s'exécuter** — voir P1-5. Et rien n'a empêché
Railway de déployer, parce qu'aucune porte n'existe entre GitHub et Railway.

> Correction apportée le 25/10 après publication : la première version de cet
> audit affirmait que « la CI avait déjà le job qui attrape ce défaut ». C'est
> faux. Le job existait, il ne tournait pas.

**Correction attendue.** Activer **« Wait for CI »** (service backend →
Settings → Source). Deux conditions :

- un workflow déclenché sur `push` vers la branche de déploiement — **remplie**
  (`ci.yml`, `on: push: branches: [main, develop]`, sans filtre de chemins) ;
- les permissions GitHub mises à jour acceptées sur
  `github.com/settings/installations` — **à faire**.

**Conséquence à accepter.** Railway attendra *tous* les workflows du commit.
`deploy-frontends.yml` et `mobile-preview.yml` tournent aussi sur `main` (avec
filtres de chemins) : un échec de déploiement frontend pourra retenir un
déploiement backend.

---

### P1-4 — La migration TEXT/UUID *(RÉSOLU pendant la semaine)*

Consigné ici parce que la cause mérite d'être retenue, pas parce qu'il reste
quelque chose à faire.

```
ERROR:  foreign key constraint "order_ratings_order_id_fkey" cannot be implemented
DETAIL: Key columns "order_id" and "id" are of incompatible types: text and uuid.
```

**Cause.** Prisma rend `String @default(uuid())` en `TEXT`. Cette base déclare
ses clés en `UUID` depuis `20260527_phase5_stripe_connect`. La migration a été
écrite à la main en suivant le défaut de l'outil.

> Le schéma Prisma dit le type du **langage** ; le SQL doit dire celui de la
> **colonne**.

**Portée réelle, au-delà de la contrainte.** Postgres refuse de comparer `uuid`
et `text` : ces colonnes auraient cassé toute jointure vers `orders`, `venues`
ou `organizations` — probablement plus tard, dans un écran de lecture, loin de
la cause.

**Pourquoi deux jours.** `P3009` bloque toutes les migrations suivantes, l'API
ne démarre pas, le healthcheck échoue, et **Railway laisse l'ancienne version
servir**. L'API répondait parfaitement en 6 ms tout en ignorant trois jours de
travail. Les clients n'ont rien vu : ce n'était pas une panne, c'était un
silence.

**Vérifié.** Reproduit sur base jetable : l'ancienne version échoue avec
l'erreur exacte (SQLSTATE 42804) ; `applied_steps_count = 0` confirme que la
transaction Prisma a tout annulé — aucune table à demi créée ; la réparation
(`rolled_back_at` puis reconstruction) restitue la table avec six colonnes
`uuid`.

**Parade livrée.** `pnpm db:verifier` (`backend/scripts/verifier-migrations.js`).

---

### P1-5 — La CI ne générait pas le client Prisma : trois jobs sur six n'ont JAMAIS pu s'exécuter

**Constat.** Les jobs `TypeScript`, `Tests` et `Tests d'intégration` passent de
`pnpm install --frozen-lockfile` directement à leur commande. **Aucun ne lance
`prisma generate`.**

Or les types de Prisma sont **générés**. Sans cette étape, `@prisma/client`
n'expose que son ébauche :

```
error TS2305: Module '"@prisma/client"' has no exported member 'OrderStatus'.
error TS2305: Module '"@prisma/client"' has no exported member 'OrgStatus'.
error TS2694: Namespace '…Prisma' has no exported member 'OrderWhereInput'.
```

Conséquence mesurée sur le run #286 : **43 suites backend sur 58 ne démarrent
pas**, et le typecheck échoue sur une douzaine de fichiers.

**Depuis quand.** `git log -p` sur tout l'historique de `.github/workflows/ci.yml`
rend **zéro** occurrence de `prisma generate` ou `db:generate`. Le fichier a été
créé le 01/06/2026 et modifié pour la dernière fois le 11/10/2026. Ces trois
jobs n'ont donc **jamais** pu réussir.

**Pourquoi personne ne l'a vu.** Parce que personne ne lisait la CI. Les audits
précédents (10/10) ont relevé « typecheck réussi sur les 5 packages » — mesuré
en local, où le client est généré par le dernier build.

**Portée.** C'est le défaut le plus grave de cet audit, et il dépasse la
semaine auditée : **le dépôt n'a jamais eu de filet automatique fonctionnel sur
le typage et les tests.** Les deux incidents de la semaine ont tous deux
traversé une CI qui ne pouvait rien détecter.

**Correction appliquée.** Une étape `pnpm db:generate` ajoutée aux trois jobs.
Le hook `postinstall` a été essayé puis **retiré** : pnpm 11 ne le déclenche
pas, et un réglage qui ne fait rien donne une fausse confiance.

**Vérifié dans les deux sens** : sans le client généré, `pnpm turbo typecheck`
reproduit exactement les erreurs du run #286 ; après `pnpm db:generate`,
5 tâches sur 5 réussissent et les 894 tests passent.

---

## Problèmes importants mais secondaires

### P2-1 — Une suite d'intégration ne compilait plus depuis le 19/10 *(corrigé pendant l'audit)*

**Constat.** `backend/test/integration/archives.int-spec.ts` échouait au
démarrage, pas aux assertions. Trois erreurs TypeScript, toutes dues à des
signatures qui ont changé **en phase 62** sans que le test suive :

| Erreur | Cause |
|---|---|
| `IdentiteVerifiee` manque `firstName`, `lastName` | le type a gagné ces champs pour le pré-remplissage Flaix |
| `deleteOrganization` attend 2 arguments (×4 appels) | la garde « recopier le nom du club » de la phase 62 |

Pire que la compilation : **le test documentait le comportement d'avant la
garde** — « une organisation complète avec commandes se supprime ; les
commandes restent lisibles ». La phase 62 a précisément supprimé ce
comportement, parce que ces commandes devenaient orphelines tout en restant
comptées dans les totaux de la plateforme.

**Pourquoi rien ne l'a vu.** `pnpm typecheck` exclut `test/` ; seul `jest`
compile ces fichiers. Et la CI, qui les compile bien, était rouge pour une
autre raison — personne ne lisait ses courriels.

**Correction appliquée.** Le test assert désormais le **refus**, une assertion
a été ajoutée sur la confirmation incorrecte, et les quatre appels passent le
nom du club. Résultat : 12 suites / **118 tests** au lieu de 11 / 91.

**Recommandation pour Codex.** Ajouter `test/` au périmètre d'un `typecheck`
dédié, ou vérifier que la CI reste le seul garde-fou assumé — mais alors elle
doit être lue.

---

### P2-2 — Le lint du backend ne couvre pas `scripts/`

**Constat.** `backend/package.json` déclare `eslint "{src,test}/**/*.ts"`.
Trois fichiers y échappent, dont deux écrits cette semaine :

- `backend/scripts/sauvegarde.js`
- `backend/scripts/verifier-migrations.js`
- `backend/scripts/migrer.sh` (shell, hors périmètre ESLint par nature)

Les deux premiers sont du JavaScript exécuté en production (`migrer.sh` est lu
au démarrage par `railway.json`), ou en CI. Ils ont été lintés **à la main**
pendant leur écriture, pas par la chaîne.

**Correction attendue.** Étendre le motif à `scripts/**/*.js`, après avoir
vérifié que la configuration ESLint accepte du JS non typé dans ce dossier.

---

### P2-3 — Les écrans d'avis n'ont pas été vus avec des données réelles

**Constat.** Les trois écrans livrés en phase 64 (`/avis` admin, `/avis`
back-office, modale mobile) compilent et leur logique est testée. Mais aucun
n'a été **rendu avec des notes réelles** : la validation navigateur s'est faite
sur une page vide (API de développement injoignable, puis serveur Next à court
de mémoire).

La page des dates (phase 65) a, elle, été vue : calendrier rendu, plage 12 → 18
sélectionnée et reportée. Mais **les écarts (`+3 pts`, `−12 %`) n'ont jamais
été affichés** — ils dépendent de données.

**Correction attendue.** Une recette manuelle sur un club disposant de notes,
ou un jeu de données de démonstration.

---

### P2-4 — Deux colonnes TEXT là où la base utilise UUID *(latent)*

**Constat.** `20260930_fidelite_reservation` a ajouté :

```sql
ALTER TABLE "carts" ADD COLUMN "loyalty_hold_id" TEXT;
ALTER TABLE "loyalty_transactions" ADD COLUMN "cart_id" TEXT;
```

Même classe de défaut que P1-4. Elles sont **en production et fonctionnent** :
ni l'une ni l'autre ne porte de clé étrangère, et le schéma Prisma ne déclare
aucune `@relation` dessus (vérifié).

**Pourquoi c'est noté.** Toute jointure SQL future vers `carts.id` (UUID)
échouerait avec « operator does not exist: uuid = text ». Le défaut est
dormant, pas absent.

**Correction attendue.** Aucune action urgente. À traiter si ces colonnes
doivent un jour être jointes ou contraintes.

---

## Points d'exploitation à confirmer avant production

| Point | État au 25/10 |
|---|---|
| Sauvegardes automatiques | **inertes** — deux secrets manquants (P1-2) |
| « Wait for CI » Railway | **non activé** (P1-3) |
| Confidentialité App Store | **déclaration fausse en ligne** (P1-1) |
| Build iOS TestFlight | build 33 (v1.1.0) livrée et traitée par Apple |
| Routes des avis en production | en ligne depuis le 25/10 à 00h45 environ |
| `watchPatterns` Railway | volontairement **non restreints** — voir ci-dessous |

**Sur les `watchPatterns` :** la proposition de restreindre `/backend/**` a été
examinée puis **écartée**. Une construction de trop coûte des minutes ; une
construction manquée coûte des jours. `scripts/migrer.sh` est d'ailleurs lu au
démarrage — un filtre trop zélé l'aurait exclu et le serveur n'aurait plus
démarré.

**Sur `migrer.sh` :** non modifié, délibérément. Il échoue fort sur une
migration fautive. Une reprise automatique aurait caché le défaut du 23 au lieu
de le dire.

---

## Éléments validés et non bloquants

- **Les gardes de la note sont en base, pas dans le code.**
  `order_ratings_order_id_key` (unicité) et `order_ratings_stars_range`
  (1..5) : une vérification applicative se contourne par deux requêtes
  simultanées, et une moyenne calculée sur un `0` serait fausse sans que rien
  ne le signale. Six tests couvrent les trois refus.
- **Un seul endpoint de lecture** (`GET /organizations/:orgId/avis`,
  `stats.service.ts:155`) sert les deux consoles. Un `SUPER_ADMIN` franchit la
  garde d'organisation. Deux routes auraient donné deux moyennes pour la même
  buvette.
- **Les identifiants de la note sont copiés, pas joints** — une buvette qui
  change de main ne réécrit pas l'histoire des notes déjà laissées.
- **Le commentaire part à la suppression de compte, la note reste**
  (`auth.service.ts:586`). La moyenne d'une buvette ne doit pas bouger parce
  qu'un client s'en va, mais un texte libre peut identifier son auteur.
- **La demande d'avis App Store n'est déclenchée qu'à partir de 4 étoiles**, et
  jamais depuis un bouton — ce que les règles Apple interdisent.
- **Aucune norme de conversion inventée** en phase 65. La comparaison se fait
  contre le passé du club, avec trois précautions explicites (écart brut sous
  dix, points pour un taux, fenêtres dérivées d'une seule lecture de l'heure).
- **La restauration de sauvegarde a été réellement exercée** — pas seulement la
  sauvegarde.

---

## Plan de correction recommandé

| Ordre | Action | Qui | Effort |
|---|---|---|---|
| 1 | Poser les deux secrets de sauvegarde, lancer le workflow une fois | propriétaire | 10 min |
| 2 | Activer « Wait for CI » sur Railway | propriétaire | 10 min |
| 3 | Créer la version 1.1.0 dans App Store Connect, corriger l'URL et le questionnaire de confidentialité | propriétaire | 30 min |
| 3bis | **Vérifier que le run CI redevient vert** après l'ajout de `pnpm db:generate` (P1-5) | Codex | 5 min |
| 4 | Étendre le lint backend à `scripts/**/*.js` (P2-2) | Codex | 15 min |
| 5 | Recette manuelle des trois écrans d'avis avec données (P2-3) | propriétaire | 30 min |
| 6 | Décider si `test/` entre dans un `typecheck` dédié (P2-1) | Codex | à arbitrer |

---

## Conclusion transmissible

Le code livré du 19 au 25 octobre est **sain et testé** : 1 012 tests verts,
zéro erreur de lint ou de typage, tous les builds passent, et les 47 migrations
s'appliquent sur une base vierge.

Les deux incidents de la semaine n'étaient **pas des défauts de
fonctionnalité** — c'étaient des défauts de **chaîne de livraison** : une
migration que rien ne rejouait avant le push, et une CI rouge que personne ne
lisait. Les deux parades sont livrées (`pnpm db:verifier`, sauvegardes
nocturnes) ; la troisième (« Wait for CI ») est un réglage de tableau de bord.

**Rien ne bloque le code. Trois réglages d'exploitation bloquent la
tranquillité.**

---

*Audit mené par Claude Code (architecte) le 25/10/2026. Les corrections
appliquées pendant l'audit se limitent à `archives.int-spec.ts` (P2-1) ; tout
le reste est constat.*

---

## MISE À JOUR DU 25/10/2026, 16h30 — la CI passe au vert pour la première fois

> Cette section est ajoutée après la publication de l'audit. Rien n'y est
> effacé plus haut : on garde ce qui a été constaté, et on dit ce qui a changé
> depuis. Un audit réécrit après coup ne prouve plus rien.

### Ce qui a été réparé dans la journée

| Constat | État |
|---|---|
| **P1-5** — la CI ne générait pas le client Prisma | **RÉSOLU** (`3d7e580`) |
| **P2-5** — course sur le code d'ardoise *(nouveau, ci-dessous)* | **RÉSOLU** (`0ca05ab`) |
| **P2-1** — suite d'intégration qui ne compilait plus | **RÉSOLU** (`f7b065d`) |

**Résultat : les six jobs passent, pour la première fois depuis la création du
dépôt le 01/06/2026.** Deux d'entre eux n'avaient jamais pu s'exécuter, et le
job `Build` n'avait jamais démarré — il attendait un `typecheck` qui ne
réussissait pas.

### P2-5 — Le code d'ardoise collisionnait dans la même milliseconde

**Constat.** `ouvrirArdoise()` fabriquait le code d'une ardoise depuis les
**dix premiers** caractères de `unique('AB')` :

```
AB-<horodatage36>-<aléa6>-<compteur>
^^^^^^^^^^   les 10 premiers s'arrêtent dans l'horodatage
```

La partie aléatoire était donc tranchée avant d'être utilisée. `OrderSplit.code`
étant `@unique` en base, deux appels tombés dans la **même milliseconde**
produisaient le même code, et le second échouait en `P2002`.

Cinq des sept tests de `ardoise-envoi.int-spec.ts` tombaient ensemble, tous sur
le même `orderSplit.create`.

**Pourquoi il a survécu si longtemps.** C'est une **course**, pas une erreur de
logique. Une machine de développement est trop lente pour que deux appels
partagent leur milliseconde ; un runner GitHub y arrive. Et la suite
d'intégration n'avait jamais tourné en CI (P1-5) — personne n'avait donc jamais
atteint ce test dans les conditions qui le révèlent.

**Correction.** Les tirets sont retirés, puis ce sont les dix **derniers**
caractères qui sont pris : l'aléa et le compteur entrent dans le code,
l'horodatage ne décide plus seul.

**Trouvé par Codex**, poussé après vérification sur base réelle.

### Leçon de méthode, qui vaut d'être écrite

Pendant la recherche de ce défaut, trois hypothèses ont été formulées puis
**infirmées par l'expérience** — fuseau horaire, parallélisme à deux workers,
client Prisma manquant dans ce job précis. À chaque fois le test a tranché, pas
le raisonnement.

Et la vraie cause est restée invisible une heure pour une raison bête : le
correctif existait **déjà dans le dossier de travail**, sans être commité. Les
essais locaux passaient donc, pendant que la CI tournait sur la version du
dépôt.

> Devant un échec qu'on ne reproduit pas, `git status` sur le fichier incriminé
> vient avant toute hypothèse.

### État mesuré après corrections

| Vérification | Résultat |
|---|---|
| `pnpm turbo lint` | **5 tâches, 0 erreur** |
| `pnpm turbo typecheck` | **5 tâches, 0 erreur** |
| `pnpm turbo test` | **5 tâches — 894 tests** (796 backend, 34 mobile, 27 back-office, 25 admin, 12 opérateur) |
| Tests d'intégration (base réelle, `TZ=UTC`) | **12 suites, 118 tests** |
| CI GitHub, run du commit `0ca05ab` | **6 jobs verts** |
| Production | `/health` **200**, routes des avis **401** |

**Total : 1 012 tests verts, et une chaîne d'intégration qui les exécute
réellement.**

### Verdict révisé

Le verdict général plus haut tient toujours sur le fond — « le code livré est
sain, la chaîne qui l'amène en production ne l'était pas » — mais sa seconde
moitié n'est plus vraie :

> **La chaîne fonctionne désormais.** Elle compile, elle teste, elle construit,
> et elle le dit. Reste à ce que quelqu'un l'écoute : « Wait for CI » n'était
> pas activable tant que la CI échouait en permanence — l'activer aurait gelé
> tous les déploiements. C'est maintenant possible, et c'est la première chose
> à faire.

### Plan de correction, révisé

| Ordre | Action | Qui | État |
|---|---|---|---|
| 1 | Poser `DATABASE_URL_SAUVEGARDE` et `SAUVEGARDE_PASSPHRASE` | propriétaire | **à faire** |
| 2 | Activer « Wait for CI » — désormais possible | propriétaire | **à faire** |
| 3 | App Store : version 1.1.0, URL de confidentialité, questionnaire | propriétaire | **à faire** |
| 4 | Étendre le lint backend à `scripts/**/*.js` (P2-2) | Codex | ouvert |
| 5 | Recette manuelle des écrans d'avis avec données (P2-3) | propriétaire | ouvert |
| 6 | Passer les actions GitHub en `@v5` (avertissement Node 20 déprécié) | Codex | ouvert |
| 7 | Supprimer `backend/railway.json`, réglage mort et contradictoire | Codex | ouvert |
| ~~P1-5~~ | ~~Générer le client Prisma en CI~~ | — | **fait** |
| ~~P2-1~~ | ~~Suite d'intégration qui ne compile plus~~ | — | **fait** |
| ~~P2-5~~ | ~~Course sur le code d'ardoise~~ | — | **fait** |

---

*Mise à jour rédigée le 25/10/2026 à 16h30, après le premier run entièrement
vert du dépôt.*
