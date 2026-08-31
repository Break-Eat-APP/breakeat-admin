'use client';

import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/**
 * Retour d'inscription Stripe — la buvette a terminé son formulaire.
 *
 * Stripe renvoie ici (`STRIPE_CONNECT_RETURN_URL`) sans nous dire si
 * l'inscription est complète : il faut relire l'état chez lui. On ne promet
 * donc RIEN à cet écran — on dit ce qui s'est passé et où vérifier.
 *
 * Sans cette page, la personne termine son inscription et tombe sur une 404,
 * sans savoir si son travail a été enregistré.
 */
export default function OnboardingCompletePage() {
  return (
    <div style={{ padding: 32, fontFamily: BRAND.font, maxWidth: 620 }}>
      <div
        style={{
          background: '#d1fae5',
          border: '1px solid #6ee7b7',
          borderRadius: 12,
          padding: '18px 22px',
          marginBottom: 20,
        }}
      >
        <h1 style={{ color: '#065f46', fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
          Formulaire Stripe terminé
        </h1>
        <p style={{ color: '#065f46', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Stripe a enregistré les informations. Il reste à vérifier qu&apos;il ne demande plus
          rien : ouvrez la fiche de la buvette et appuyez sur <strong>« Vérifier l&apos;état »</strong>.
          Elle doit afficher <strong>« ✓ Peut encaisser »</strong>.
        </p>
      </div>

      <p style={{ color: BRAND.grey, fontSize: 13.5, lineHeight: 1.6, marginBottom: 20 }}>
        Tant que l&apos;état n&apos;est pas actif, les clients ne peuvent pas payer sur cette
        buvette — la page de paiement refusera de s&apos;ouvrir.
      </p>

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
