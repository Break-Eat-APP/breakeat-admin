# ADR-0008 — La documentation vit dans `brain/`, pas dans un `docs/` parallèle

- **Date :** 11/11/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi, sur proposition de Claude
- **Liée à :** `BRAT_EAT_MASTER_ENGINEERING_GOVERNANCE.md` v1.0 (hors dépôt), audit de gouvernance du 11/11

## Contexte
La gouvernance du 11/11 propose une arborescence `docs/engineering/…`. Le
dépôt a déjà sa mémoire : `brain/`, `REPRISE.md`, `CHANGELOG.md`,
`GUIDE_DEVELOPPEMENT/`.

## Décision
On **adapte** la gouvernance au dépôt (elle le prévoit elle-même, § 19) :

| Gouvernance | Dans ce dépôt |
|---|---|
| `CLAUDE.md`, `AGENTS.md` | `CLAUDE.md` (racine), `brain/AGENTS.md` |
| `ENGINEERING_DOCUMENT.md` | `brain/ENGINEERING_MANUAL.md` + `REPRISE.md` (état courant) |
| `ARCHITECTURE.md` | `brain/ARCHITECTURE.md` |
| `SECURITY.md` | `brain/SECURITE.md` |
| `TESTING.md` | `brain/TESTING_STRATEGY.md` |
| `ROADMAP.md` | `brain/ROADMAP.md` |
| `CHANGELOG.md` | `CHANGELOG.md` (racine) |
| `BUGS_AND_INCIDENTS.md` | `brain/BUGS_ET_INCIDENTS.md` |
| `DEPLOYMENT.md`, `RUNBOOK.md` | `brain/DEPLOIEMENT.md` (+ exploitation dans `REPRISE.md`) |
| `DECISIONS/` | `brain/DECISIONS/` |
| `docs/tasks/` | `brain/taches/` |

## Pourquoi
Deux documentations parallèles divergent en quelques semaines, et l'une des
deux finit par mentir.

## Ce que ça coûte
Les noms diffèrent de la gouvernance : ce tableau fait la correspondance.
