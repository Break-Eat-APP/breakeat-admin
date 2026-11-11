# ADR-0005 — Mises à jour à distance : `runtimeVersion` = version de l'app

- **Date :** novembre 2026 (mise en place d'EAS Update, build 41)
- **Statut :** ACCEPTÉE
- **Décidée par :** Claude, validée par Rémi
- **Liée à :** `apps/mobile/app.config.js` (commentaire de `runtimeVersion`), workflow `.github/workflows/mise-a-jour-a-distance.yml`

## Contexte
Une mise à jour à distance (EAS Update) ne doit partir que vers les builds
qui ont le code natif qu'elle attend.

## Options étudiées
1. `policy: 'fingerprint'` — l'empreinte du code natif, calculée
   automatiquement.
2. **`policy: 'appVersion'`** — la version de l'app.

## Décision
Option 2, avec une **règle** : tout changement natif (icône, écran
d'ouverture, permission, module natif, Live Activity, configuration Expo) →
**monter `version`** dans `app.config.js` avant la build.

## Pourquoi
Les mises à jour se publient depuis GitHub (Linux) et les builds sur EAS ;
l'empreinte calculée des deux côtés peut différer pour un détail (fin de
ligne, OneDrive) et la mise à jour ne serait **jamais** reçue — sans erreur
visible.

## Ce que ça coûte
- Une discipline : oublier de monter la version enverrait une mise à jour à
  des builds qui n'ont pas le code natif attendu.
- Les builds d'une version plus ancienne ne reçoivent plus rien (au 11/11 :
  seules les 1.1.2 — build 44 — reçoivent les mises à jour).

## Ce qui la remettrait en cause
Une empreinte fiable entre Windows/OneDrive et Linux.

## Où elle vit dans le code
`apps/mobile/app.config.js` (`version`, `runtimeVersion`),
`apps/mobile/eas.json` (profil `beta`).
