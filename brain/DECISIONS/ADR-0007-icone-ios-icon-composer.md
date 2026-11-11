# ADR-0007 — L'icône iOS est au format Icon Composer

- **Date :** 11/11/2026
- **Statut :** ACCEPTÉE — validée sur iPhone par Rémi (build 44)
- **Décidée par :** Rémi, instruite par Claude
- **Liée à :** BUG-2026-001, CHANGELOG 1.7.15

## Contexte
L'icône paraissait floue sur iPhone (builds 42 et 43) alors que le fichier
livré était un aplat orange net : iOS 26 habille toute icône PNG ordinaire de
reflets, d'ombre et d'un dégradé.

## Options étudiées
1. Retoucher le PNG (taille, marges) — essayé (build 43), insuffisant.
2. **Le format Icon Composer d'Apple (`.icon`)**, le seul qui permette de
   couper ces effets.

## Décision
`apps/mobile/assets/breakeat.icon/` (`icon.json` + `Assets/b.png`), branché
par `ios.icon` dans `app.config.js` : fond blanc plein, le B à 66 % sur fond
transparent, `specular: false`, `shadow.kind: none`,
`translucency.enabled: false`, calque `glass: false`. Android et le web
gardent `icone-app.png` (premier plan Android à 44 %).

## Ce que ça coûte
Le fichier a été écrit à la main (pas d'Icon Composer sous Windows), d'après
le schéma public de la communauté : à revérifier si Apple fait évoluer le
format.

## Pour changer l'icône
Refaire `Assets/b.png` (cadre 1024, fond transparent), garder `icon.json`,
monter `version` (changement natif, ADR-0005), nouvelle build. **Ne pas
revenir à un PNG pour iOS.**
