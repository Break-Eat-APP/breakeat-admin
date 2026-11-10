'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

/**
 * OUVRIR LE TABLEAU DE BORD D'UN LIEU DONNÉ — la porte du super admin.
 *
 * Décision de Rémi (10/11/2026) : le super admin CRÉE le lieu et l'accès du
 * responsable, et toute la programmation se fait ici, dans le tableau de bord
 * du lieu — plus de seconde saisie dans le back-office. Le bouton « Ouvrir
 * son tableau de bord » du back-office mène ici : `/ouvrir?club=<id>&nom=<nom>`.
 *
 * Rien n'est accordé par cette page : elle ne fait que CHOISIR le club de
 * travail. Chaque appel reste vérifié par le serveur (membre du club, ou super
 * admin) — un identifiant recopié à la main n'ouvre rien de plus.
 */
export default function OuvrirUnLieu() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const club = params.get('club');
    const nom = params.get('nom') ?? '';
    if (!club) {
      router.replace('/dashboard');
      return;
    }
    try {
      if (getToken()) {
        localStorage.setItem('admin_org_id', club);
        localStorage.setItem('admin_org_name', nom);
        router.replace('/dashboard');
      } else {
        // Pas encore connecté : la page de connexion reprendra ce club.
        localStorage.setItem('admin_club_demande', JSON.stringify({ club, nom }));
        router.replace('/login');
      }
    } catch {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div style={{ padding: '30px 36px', fontFamily: BRAND.font, color: BRAND.grey, fontSize: 14 }}>
      Ouverture du tableau de bord du lieu…
    </div>
  );
}
