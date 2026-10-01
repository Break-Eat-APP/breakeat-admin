# Dossier historique — arrêté le 07/06/2026

**Les documents Word de ce dossier ne couvrent que les 14 premières phases du
projet ; le projet en compte 55 au 01/10/2026.** Les suivantes sont dans
`phases generees/`, fabriquées depuis le manuel (voir plus bas).

## Ce qu'il y a ici

Quatorze cahiers des charges au format Word (`PHASE_1` → `PHASE_14`), écrits
AVANT construction, entre le 25/05 et le 07/06/2026, plus les scripts
`generate_phaseN.js` qui les fabriquaient et le document de refonte design.

C'était la méthode des premières semaines : un document par phase, rédigé
d'avance. Elle s'est arrêtée à la phase 14.

## Les phases 15 et suivantes, en Word

Elles sont dans **`phases generees/`** — 38 documents, un par phase, **fabriqués
depuis `brain/ENGINEERING_MANUAL.md`** et non écrits à la main.

```
node "phases de DEV/generer-phases-depuis-manuel.js"
```

Chaque document porte sa date de génération en pied de page. **Ne les modifiez
pas** : une correction se fait dans le manuel, puis on relance la commande —
sinon le document dirait autre chose que le code, et la prochaine génération
effacerait la correction.

La commande a besoin de `node_modules/` dans ce dossier (bibliothèque `docx`,
non suivie par git) : `npm install docx` ici si elle manque.

> Ces documents-là décrivent ce qui a été **construit**. Les quatorze Word
> d'origine, eux, décrivaient ce qui était **prévu** — la nuance compte.

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
