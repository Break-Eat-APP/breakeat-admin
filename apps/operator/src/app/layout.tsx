import type { Metadata } from 'next';
import { Fredoka } from 'next/font/google';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

/**
 * Brand typography (Phase 11 refonte v2) — "Fredoka partout".
 * Le logotype "BREAKEAT" est l'artwork officiel (public/logo-*.png),
 * pas du texte ; tokens partagés via @break-eat/brand.
 */
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fredoka',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BREAKEAT — Opérateur',
  description: 'BREAKEAT — portail opérateur',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={fredoka.variable}>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
