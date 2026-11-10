# Polices — servies par l'app, jamais téléchargées à la compilation

`next/font/google` téléchargeait ces polices chez Google À CHAQUE COMPILATION.
Quand Google répondait mal (limite de débit des machines de GitHub), la
compilation s'arrêtait sur « An error occurred in `next/font`. Cannot read
properties of null (reading '1') » — trois fois le 10/11/2026, sur des
changements qui ne touchaient même pas cette app. Le déploiement en ligne
dépendait du même téléchargement.

Les fichiers sont donc ici, chargés par `next/font/local` dans
`../layout.tsx`. Ce sont les polices VARIABLES (une seule par famille couvre
toutes les graisses, de 100 à 900), sous-ensemble « latin » — le même que
`subsets: ['latin']` auparavant, accents français compris.

Source : paquets `@fontsource-variable/<famille>@5.3.0` (npm). Licence : SIL
Open Font License 1.1 (fichiers `*-LICENCE.txt` à côté de chaque police).

Pour mettre à jour : `npm pack @fontsource-variable/<famille>`, et reprendre
`files/<famille>-latin-wght-normal.woff2`.
