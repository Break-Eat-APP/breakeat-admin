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

**Constat.** La CI possède déjà le job qui aurait attrapé la migration fautive :
`Tests d'intégration (base réelle)` monte un Postgres et applique les
migrations de production. Il est passé au rouge le 23/10.

**Rien ne l'a empêché de déployer**, parce qu'aucune porte n'existe entre
GitHub et Railway.

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
