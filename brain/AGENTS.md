# Les agents sur BreakEat — qui fait quoi, et comment

> **Réécrit le 11/11/2026** (gouvernance, étape 3). La version du 01/06/2026
> est dans l'historique Git. Les **règles** communes à tous les agents sont
> dans [`CLAUDE.md`](../CLAUDE.md) à la racine — ce fichier-ci dit les
> **rôles**, la **coordination** et le **compte rendu**.

## La règle de base

Tout agent, avant de coder : lit `CLAUDE.md`, puis `REPRISE.md`, puis les
documents de `brain/` utiles à la tâche ; regarde `git status`. Aucun agent
n'invente une règle métier qui contredit `brain/` ou `brain/DECISIONS/` :
s'il pense qu'elle est fausse, il le **dit** à Rémi au lieu de la changer.

## Les rôles, tels qu'ils sont pratiqués

| Qui | Rôle réel | Limites |
|---|---|---|
| **Rémi** | Décide du produit et des règles métier ; valide les déploiements, les mises à jour à distance, les builds ; détient tous les accès (Railway, Stripe, Vercel, Apple, Google, Expo, GitHub) | — |
| **Claude Code** | Agent principal : diagnostic, conception, implémentation, tests, documentation, builds et envois TestFlight à la demande | Ne voit aucun tableau de bord (Railway, Stripe, Vercel) : **demande les journaux** ; ne saisit jamais d'identifiant ; ne publie rien sans l'accord de Rémi |
| **Codex** | **Audits** : relecture du code et des changements récents, rapports datés (`AUDIT_*.md`) | Ne modifie pas le code ; ses rapports se rangent dans `brain/audits/` avec la réponse de Claude (corrigé / écarté / assumé, et pourquoi) |
| **Cursor** | Pas utilisé à ce jour | S'il l'est : mêmes règles, et jamais sur les mêmes fichiers qu'un autre agent en même temps |
| **Développeur Flaix** | Construit côté Flaix ce que décrit `brain/FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md` (dossier PDF : `brain/livrables/`) | N'a pas accès à ce dépôt à ce jour |

## Coordination

- **Un seul agent par tâche et par fichier.** Un autre peut relire et
  commenter, pas écraser.
- Un audit reçu est **vérifié dans le code** avant d'être corrigé : un
  constat peut être faux, déjà corrigé, ou un choix assumé.
- Tout ce qui est décidé en conversation et qui doit durer va dans le dépôt
  (REPRISE, `brain/DECISIONS/`, `brain/BUGS_ET_INCIDENTS.md`, `CLAUDE.md`) —
  jamais seulement dans la mémoire d'un agent.

## Le compte rendu de fin de tâche

**Toujours**, à Rémi, en fin de tâche : ce qui a été fait, les fichiers
touchés, les **tests réellement lancés** et leurs résultats (et ce qui n'a
pas pu l'être), les risques, la suite.

**Dans le dépôt :**

| La tâche | Où l'écrire |
|---|---|
| Toute livraison notable | `CHANGELOG.md` (le pourquoi) + la ligne de version dans `brain/ROADMAP.md` |
| L'état change (ce qui tourne, ce qui reste, un piège découvert) | `REPRISE.md` |
| Un bug ou un incident | `brain/BUGS_ET_INCIDENTS.md` |
| Une décision qui engage | `brain/DECISIONS/` |
| **Tâche importante** : migration, paiement, intégration Flaix, sécurité, incident `SEV-0`/`SEV-1` | Un compte rendu daté dans `brain/taches/`, au [modèle](taches/MODELE.md) |

`brain/TASK_SUMMARY.md` (jusqu'au 09/11/2026) est l'ancien journal des
tâches, gardé pour l'historique ; les nouveaux comptes rendus vont dans
`brain/taches/`.

## La relecture

Avant de pousser : relire le diff (`git show --stat`, puis le détail), rien
hors périmètre, aucun secret, tests et typage sur ce qui a changé. Après :
lire la CI, puis vérifier le déploiement (`/health` → `commit`) avant de
dire « en ligne ».
