import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'BREAKEAT — Opérateur',
  description: 'BREAKEAT — portail opérateur',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
