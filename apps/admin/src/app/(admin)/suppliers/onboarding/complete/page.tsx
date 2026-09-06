'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/lib/brand';

/**
 * Retour d'inscription Stripe — ancienne adresse, conservée par prudence.
 *
 * Cette page servait le parcours « une inscription par buvette », retiré le
 * 02/09/2026 : il n'existe plus qu'un compte, celui du CLUB, géré dans
 * Encaissement. Le chemin subsiste tant que `STRIPE_CONNECT_RETURN_URL` peut
 * encore pointer dessus — supprimer le fichier renverrait une 404 à quelqu'un
 * qui vient de terminer son formulaire chez Stripe, ce qui est le pire moment
 * pour lui faire croire que son travail est perdu.
 *
 * Elle ne raconte donc rien : elle renvoie là où l'état réel est affiché.
 */
export default function RetourInscriptionStripe() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/encaissement');
  }, [router]);

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font, color: BRAND.grey, fontSize: 14 }}>
      Retour de Stripe — ouverture de la page Encaissement…
    </div>
  );
}
