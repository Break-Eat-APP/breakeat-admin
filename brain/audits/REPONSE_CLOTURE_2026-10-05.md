# Réponse à la demande de clôture d'audit

**En réponse à** `brain/audits/DOSSIER_AUDIT_CLOUD_CODE_2026-10-04.docx` (section 7).
**Date** : 5 octobre 2026.
**Portée** : les six points de clôture, vérifiés un par un.

> Chaque réponse ci-dessous est **vérifiée**, pas affirmée : la commande ou la
> preuve est donnée à côté. Deux points ne sont pas acquis, et sont marqués comme
> tels — un audit qu'on clôt sur des déclarations ne sert à rien.

---

## En un écran

| # | Point demandé | Réponse |
|---|---|---|
| 1 | Commits 53-54-55 sur la branche de déploiement | ⛔ **NON** — 8 commits sont en local, jamais poussés |
| 2 | La CI exécute migrations puis les suites d'intégration | ✅ Le job est conforme — ⛔ mais il n'a **jamais tourné** (voir 1) |
| 3 | Pas d'exécution sur une base non désignée | ✅ Prouvé : sans la variable, 12 suites / 117 tests s'ignorent |
| + | Fragilités de la suite trouvées en la relançant | ✅ Deux faux échecs corrigés (port réservé par Windows, collision d'identifiants entre fichiers) |
| 4 | Scénarios remboursement / reprise d'ardoise / mode de lieu | ⚠️ Couverts sur PostgreSQL réel — **pas** sur l'environnement cible |
| 5 | Validations appareils réels + sauvegarde/restauration | ⛔ Non planifiées : décision du propriétaire du projet |
| 6 | Textes obsolètes synchronisés | ✅ Fait (phase 54, ancien rapport, `REPRISE.md`) |

**Conséquence : l'audit ne peut pas être clôturé en l'état.** Le point 1 commande
les points 2 et 4 : rien n'est déployé, et la CI n'a donc jamais vu une seule de
ces corrections.

---

## 1. Les commits sont-ils sur la branche destinée au déploiement ?

**Non.** Ils sont sur `main` en local ; `main` est en avance de **8 commits** sur
`origin/main`.

```
git status -sb
## main...origin/main [ahead 8]
```

Les huit, du plus ancien au plus récent :

| Commit | Contenu |
|---|---|
| `b2dea21` | les cinq défauts P1 (phase 53) |
| `3844403` | ardoise : libérer l'autorisation du convive dont la carte a échoué |
| `228f9ba` | quatre P2 : cloisonnement buvette, journée des créneaux (phase 54) |
| `1928d73` | les cinq P2 restants (phase 54) |
| `791692e` | phases 53-54 en Word |
| `ece5530` | second passage : ardoise bloquée, remboursements, contenant dormant (phase 55) |
| `b4ba946` | la suite d'intégration passe, et la CI la lance |
| *(celui-ci)* | réponse de clôture, tests de remboursement, textes synchronisés |

**Ce que cela implique, et qui n'est pas anodin :** la CI n'a jamais exécuté ces
corrections, aucun déploiement ne les porte, et un `git push` déclenchera d'un
coup la CI **et** les déploiements automatiques (Vercel pour les apps web). La
décision de pousser appartient au propriétaire du projet — elle n'a pas été
prise à sa place.

## 2. La CI exécute-t-elle réellement les migrations puis les suites ?

**Le job est conforme**, vérifié ligne par ligne dans
`.github/workflows/ci.yml` :

| Contrôle | Résultat |
|---|---|
| `needs:` qui pourrait le court-circuiter | aucun — il tourne toujours |
| Service PostgreSQL | `postgres:16-alpine` |
| Attente de disponibilité | `--health-cmd pg_isready` |
| Migrations **avant** les tests | oui (`db:migrate:prod` puis `test:integration`) |
| `DATABASE_URL` pour les migrations | présent |
| `DATABASE_URL_TEST` pour la suite | présent |

Deux choix à relever :

- ce sont les **migrations de production** (`prisma migrate deploy`) et non
  `db push` : c'est leur SQL qu'on veut éprouver, avec les contraintes que le
  schéma Prisma n'exprime pas ;
- la commande passe par le script du dépôt, pour qu'elle ne vive qu'à un endroit.

**Mais le job n'a jamais tourné**, puisque rien n'est poussé (point 1). Ce qui
est vérifié ici est sa définition, pas une exécution.

## 3. La suite peut-elle tourner sur une base non désignée ?

**Non, et c'est prouvé par l'exécution.** Les douze fichiers portent le même
garde-fou (`const url = process.env.DATABASE_URL_TEST` puis
`url ? describe : describe.skip`), et sans la variable :

```
Test Suites: 12 skipped, 0 of 12 total
Tests:       117 skipped, 117 total
```

Aucune connexion n'est ouverte. La suite ne « passe » pas pour autant : elle
**s'ignore**, ce qui est la seule manière de garantir qu'elle ne touche jamais
une base de production par distraction. C'est aussi pour cela que la variable
d'environnement du job de CI est ce qui *fait exister* ce job.

## 4. Les scénarios sensibles sont-ils vérifiés sur l'environnement cible ?

**Distinction nécessaire : oui sur PostgreSQL réel, non sur l'environnement
cible.** Personne n'a exercé ces parcours sur Railway.

Ce qui EST vérifié, sur une base PostgreSQL 16 réelle montée avec les migrations
de production — **12 suites / 117 tests** :

**Remboursement** (`remboursement.int-spec.ts`, 7 tests, ajoutés pour cette
clôture — le sujet n'avait que des tests unitaires) : un remboursement total
marque `REFUNDED` ; un partiel le dit sans prétendre avoir tout rendu ; rendre la
part d'UN convive ne rembourse pas la tournée, et quand tous le sont elle l'est
aussi ; le **statut** de la commande ne bouge pas (une commande remboursée a bien
été servie — le mouvement d'argent est tracé à côté) ; un rejeu du webhook
n'inscrit qu'un seul mouvement ; un paiement inconnu ne fait rien tomber.

**Reprise d'ardoise après interruption** (`ardoise-envoi.int-spec.ts`, 7 tests) :
l'index unique refuse une seconde commande sur la même tournée ; les ardoises
ouvertes ne se gênent pas (les `order_id` nuls sont bien distincts) ; la
revendication `OPEN → SENDING` n'est gagnée **qu'une fois** sur deux appels
*réellement* simultanés ; la ronde rembourse un envoi interrompu, et **ne touche
jamais** une tournée en train de partir ni une ardoise qui porte déjà sa
commande.

**Changement de mode d'un lieu** (`contenant-dormant.int-spec.ts`, 5 tests) : le
contenant s'endort, un ancien lien profond ne permet plus ni d'ouvrir un panier
ni de **lire** le lieu, un événement ponctuel du même lieu reste lisible, et le
contenant se réveille au retour en mode permanent.

**Et la fidélité** (`fidelite-reservation.int-spec.ts`, 7 tests), parce que
l'invariant ne se démontre pas autrement : **la somme du registre égale toujours
le solde**, après chaque opération ; et deux paniers du même client ne peuvent
pas dépenser les mêmes points.

Ce qui reste à faire sur l'environnement cible : un remboursement réel en mode
test Stripe, et une interruption d'envoi provoquée. Les deux demandent un
déploiement — donc le point 1.

### Deux fragilités de la suite, trouvées en la relançant

Ces tests ont été exécutés **cinq fois** pour cette clôture, pas une. Deux faux
échecs sont apparus, tous deux corrigés — ils auraient fait rougir la CI sans
qu'aucun code soit en cause :

- **le port du conteneur d'essai était réservé par Windows.** 55432 est tombé
  dans une plage dynamique de WSL (`55397-55496`) : le conteneur perdait sa
  liaison, et les douze fichiers échouaient d'un coup sur un
  `PrismaClientInitializationError`. Ça ressemble à une panne de code et n'en
  est pas. Base d'essai recréée sur le **port 15432**, cause et symptôme
  documentés dans le manuel (phase 34) et `REPRISE.md` — ces plages changent au
  redémarrage, donc ça reviendra. La CI n'est pas concernée : elle tourne sous
  Linux ;
- **les identifiants uniques des tests pouvaient collisionner entre FICHIERS.**
  Jest donne à chaque fichier son propre registre de modules, donc son propre
  compteur repartant de zéro : deux fichiers démarrant dans la même milliseconde
  produisaient la même valeur, et `archives.int-spec.ts` — qui teste la
  réinscription par adresse e-mail — échouait sur une adresse déjà prise. Un
  fragment aléatoire ferme la porte. Le défaut existait avant, mais passer de 9
  à 12 fichiers le rendait probable.

Après correction : **trois passages complets consécutifs à 117/117**.

## 5. Appareils réels et sauvegarde/restauration

**Non planifiés.** Ce sont des décisions et des actes qui appartiennent au
propriétaire du projet ; ils sont tenus à jour dans `REPRISE.md` → « SUJETS
OUVERTS » :

- **appareils réels** : les builds 20 et 21 sont chez Apple, pas encore validés
  sur un iPhone (cloche, ✓ « prête », liste En cours / Terminées, Live Activity,
  retour après paiement). La partie native iOS ne se compile pas sous Windows ;
- **sauvegardes** : le script `backend/scripts/sauvegarde.js` existe et a été
  vérifié, mais **rien ne tourne** : il manque un stockage séparé de Railway et
  une planification. Et comme le dossier d'audit le dit justement, il faudra
  tester une **restauration**, pas seulement la génération d'un fichier — une
  sauvegarde jamais restaurée n'est pas une sauvegarde.

## 6. Les textes obsolètes sont-ils synchronisés ?

**Oui, les trois endroits signalés.**

| Endroit | Ce qui était faux | Traitement |
|---|---|---|
| Manuel, fin de phase 54 | « les tests d'intégration n'ont pas pu tourner », « les migrations restent à passer » | Encadré de mise à jour daté, et la phrase d'origine conservée au passé |
| `brain/audits/AUDIT_2026-09-30_par-phase.md` | tout le document décrit l'état d'avant corrections | En-tête « DOCUMENT HISTORIQUE » avec la table de renvoi vers ce qui décrit l'état actuel |
| `REPRISE.md` | état des tests et des migrations | Lignes refaites : migrations passées, 12 suites / 117 tests verts, CI qui les lance |

Un mot sur la méthode, parce qu'elle vaut pour la suite : la phrase périmée de la
phase 54 a été **gardée au passé** sous un encadré daté, pas réécrite. Un manuel
qui se corrige en silence cesse d'être relisible — on ne sait plus ce qui était
vrai quand la décision a été prise. Les documents d'ÉTAT (`REPRISE.md`) se
réécrivent ; les documents de RÉCIT (le manuel) s'annotent.

---

## Ce qui bloque la clôture, et dans quel ordre

1. **Pousser les huit commits** (décision du propriétaire) — la CI s'exécute
   alors pour la première fois sur ces corrections, et les déploiements
   automatiques partent.
2. **Lire le résultat de la CI**, en particulier le job `integration` : c'est sa
   première exécution réelle.
3. **Exercer sur la cible** un remboursement en mode test Stripe et une
   interruption d'envoi d'ardoise.
4. Alors seulement : les points 1, 2 et 4 deviennent verts, et l'audit peut être
   clôturé. Les points 3 et 6 le sont déjà ; le point 5 reste une décision
   d'exploitation, pas un défaut de code.

**Ce qui n'est pas un défaut** et n'a pas à bloquer : le cœur décisionnel de
Flaix rend `null` sans appelant — un stub assumé en attente du contrat réel, dit
comme tel dans l'en-tête du service.

**Le P3 le plus rentable qui reste** : admin, operator et back-office n'ont aucun
test automatisé. La CI lance maintenant l'intégration backend ; c'est le front
qui n'a aucun filet.
