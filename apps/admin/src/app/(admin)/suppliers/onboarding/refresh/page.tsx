'use client';

import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/**
 * Lien d'inscription expiré (`STRIPE_CONNECT_REFRESH_URL`).
 *
 * Les liens Stripe sont à usage unique et de courte durée. Quand l'un d'eux
 * expire, Stripe renvoie ici — et la seule chose à faire est d'en redemander un
 * depuis la fiche de la buvette. On le dit, plutôt que d'afficher une erreur
 * qui laisserait croire que l'inscription a échoué.
 */
export default function OnboardingRefreshPage() {
  return (
    <div style={{ padding: 32, fontFamily: BRAND.font, maxWidth: 620 }}>
      <div
        style={{
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: 12,
          padding: '18px 22px',
          marginBottom: 20,
        }}
      >
        <h1 style={{ color: '#92400e', fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
          Lien d&apos;inscription expiré
        </h1>
        <p style={{ color: '#92400e', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Les liens Stripe ne servent qu&apos;une fois et pour un temps court. Rien n&apos;est
          perdu : rouvrez la fiche de la buvette et appuyez de nouveau sur
          <strong> « Se connecter à Stripe »</strong>. Vous reprendrez où vous en étiez.
        </p>
      </div>

      <Link
        href="/suppliers"
        style={{
          display: 'inline-block',
          background: BRAND.orange,
          color: '#fff',
          borderRadius: 8,
          padding: '11px 20px',
          fontWeight: 600,
          fontSize: 14,
          textDecoration: 'none',
        }}
      >
        Revenir aux buvettes
      </Link>
    </div>
  );
}
