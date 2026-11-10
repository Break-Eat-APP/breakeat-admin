import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

/**
 * Brand typography (refonte v3).
 *   - Inter → toute l'UI (body, labels, boutons…). Police de travail pro,
 *     neutre et lisible (remplace Fredoka, jugée trop "enfant" pour des outils).
 *   - Jost  → textes description / sous-titres dans l'app mobile (éditeur
 *     d'apparence + rendu client). Géométrique, moderne, lisible à petite taille.
 *
 * Le logo "B éclair" reste l'artwork officiel (SVG), non géré ici.
 */
// Servie par l'app (fonts/LISEZ-MOI.md) : plus aucun téléchargement chez
// Google à la compilation. Police VARIABLE : toutes les graisses.
const inter = localFont({
  src: './fonts/inter-latin-wght-normal.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
});

// Servie par l'app (fonts/LISEZ-MOI.md) : plus aucun téléchargement chez
// Google à la compilation. Police VARIABLE : toutes les graisses.
const jost = localFont({
  src: './fonts/jost-latin-wght-normal.woff2',
  variable: '--font-jost',
  display: 'swap',
  weight: '100 900',
});

/**
 * Raleway — reservee aux TITRES DE SECTION du menu.
 *
 * Une seconde famille, employee sur un seul role, donne du rythme sans
 * disperser : l'oeil reconnait la structure a sa forme avant de la lire. Inter
 * garde tout le reste, ou sa neutralite sert la densite de donnees.
 */
// Servie par l'app (fonts/LISEZ-MOI.md) : plus aucun téléchargement chez
// Google à la compilation. Police VARIABLE : toutes les graisses.
const raleway = localFont({
  src: './fonts/raleway-latin-wght-normal.woff2',
  variable: '--font-display',
  display: 'swap',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'BREAKEAT — Admin',
  description: 'BREAKEAT administration panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${jost.variable} ${raleway.variable}`}>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
