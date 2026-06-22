import type { Metadata } from 'next';
import { Inter, Jost } from 'next/font/google';
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
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jost = Jost({
  subsets: ['latin'],
  variable: '--font-jost',
  display: 'swap',
  weight: ['300', '400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'BREAKEAT — Admin',
  description: 'BREAKEAT administration panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${jost.variable}`}>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
