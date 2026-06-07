import type { Metadata } from 'next';
import { Fredoka } from 'next/font/google';
import { QueryProvider } from '@/providers/query-provider';
import './globals.css';

/**
 * Brand typography (Phase 11 refonte v2).
 *   - Fredoka → toute l'UI (body, labels, boutons…) — "Fredoka partout".
 *
 * Le logotype "BREAKEAT" n'est PAS du texte : c'est l'artwork officiel
 * (apps/backoffice/public/logo-full.png), donc aucune police web dédiée au
 * wordmark n'est chargée. Voir @break-eat/brand → BreakEatLogo.
 */
const fredoka = Fredoka({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fredoka',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BREAKEAT — Back Office',
  description: 'BREAKEAT platform back office (super admin)',
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
