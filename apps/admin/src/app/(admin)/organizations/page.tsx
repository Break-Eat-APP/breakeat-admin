'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BRAND } from '@/lib/brand';
import { getOrgId } from '@/lib/api/admin-client';

/**
 * « MON LIEU » MÈNE QUELQUE PART.
 *
 * La fiche du lieu vit à `/organizations/<id>`, et le menu pointait sur
 * `/organizations` tout court — une route qui n'existait pas. Clic, page 404,
 * et aucun moyen de deviner qu'il fallait un identifiant dans l'adresse.
 *
 * Plutôt que de bricoler le lien du menu avec un identifiant lu au moment du
 * rendu (il arrive du navigateur, donc après le premier affichage), cette page
 * fait le relais : elle lit le club actif et renvoie sur sa fiche. Le menu
 * garde une adresse stable, et un lien partagé ou mis en favori continue de
 * fonctionner.
 */
export default function OrganizationsRedirect() {
  const router = useRouter();
  const [sansClub, setSansClub] = useState(false);

  useEffect(() => {
    const orgId = getOrgId();
    if (orgId) router.replace(`/organizations/${orgId}`);
    else setSansClub(true);
  }, [router]);

  return (
    <div style={{ padding: '30px 36px', fontFamily: BRAND.font, color: BRAND.grey, fontSize: 14 }}>
      {sansClub
        ? 'Aucun club actif sur cette session. Reconnecte-toi pour accéder à la fiche de ton lieu.'
        : 'Ouverture de la fiche de ton lieu…'}
    </div>
  );
}
