'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/lib/brand';

/**
 * Lien d'inscription Stripe expiré — ancienne adresse, conservée par prudence.
 *
 * Stripe appelle cette adresse quand le lien à usage unique a expiré. Il faut
 * en produire un nouveau : c'est le bouton « Reprendre l'inscription Stripe »
 * de la page Encaissement, où l'on renvoie directement.
 *
 * Voir la page `complete` voisine pour la raison du chemin `suppliers/`.
 */
export default function LienInscriptionExpire() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/encaissement');
  }, [router]);

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font, color: BRAND.grey, fontSize: 14 }}>
      Le lien d’inscription a expiré — ouverture de la page Encaissement…
    </div>
  );
}
