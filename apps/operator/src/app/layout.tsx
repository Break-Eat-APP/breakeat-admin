import type { Metadata } from 'next';
import { Inter, Raleway } from 'next/font/google';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

/**
 * Brand typography (refonte v3) — Inter pour toute l'UI (remplace Fredoka).
 * Police de travail pro, lisible en rush ; tokens partagés via @break-eat/brand.
 * Le logo "B éclair" reste l'artwork officiel (SVG).
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

/**
 * Raleway — reservee aux TITRES DE SECTION du menu.
 *
 * Une seconde famille, employee sur un seul role, donne du rythme sans
 * disperser : l'oeil reconnait la structure a sa forme avant de la lire. Inter
 * garde tout le reste, ou sa neutralite sert la densite de donnees.
 */
const raleway = Raleway({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'BREAKEAT — Opérateur',
  description: 'BREAKEAT — dashboard opérateur',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${raleway.variable}`}>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
