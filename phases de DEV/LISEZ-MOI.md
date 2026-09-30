# Dossier historique — arrêté le 07/06/2026

**Ce dossier ne contient que les 14 premières phases du projet. Il n'est plus
alimenté, et le projet en compte 52 au 30/09/2026.**

## Ce qu'il y a ici

Quatorze cahiers des charges au format Word (`PHASE_1` → `PHASE_14`), écrits
AVANT construction, entre le 25/05 et le 07/06/2026, plus les scripts
`generate_phaseN.js` qui les fabriquaient et le document de refonte design.

C'était la méthode des premières semaines : un document par phase, rédigé
d'avance. Elle s'est arrêtée à la phase 14.

## Où est la suite

| Ce que vous cherchez | Où |
|---|---|
| **Le récit complet, phase par phase** | `brain/ENGINEERING_MANUAL.md` — commencer par son **sommaire des phases** |
| **Ce qui a changé et quand** | `CHANGELOG.md` (racine) |
| **L'état courant, les pièges, les sujets ouverts** | `REPRISE.md` (racine) |
| **Où vit chaque fichier** | `GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md` |

## À ne pas faire

- **Ne pas se fier à ces documents pour comprendre le code d'aujourd'hui.** Ils
  décrivent une intention de mai-juin 2026. Beaucoup de choses ont changé depuis
  — le paiement, l'architecture mobile, la TVA, les lieux ouverts en continu.
- **Ne pas relancer les scripts `generate_*.js`** : ils réécriraient des
  documents qui ne décrivent plus rien de vivant. Aucun build ne lit ce dossier.
- **Ne pas y ajouter de nouvelle phase.** Une phase se documente dans le manuel,
  c'est la règle du manuel lui-même (« Mandatory Rule »).

Ce dossier est gardé parce qu'il raconte d'où vient le projet — rien de plus.
