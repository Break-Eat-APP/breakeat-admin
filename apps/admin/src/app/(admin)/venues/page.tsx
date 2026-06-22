'use client';

// « Lieux » n'est plus une section : un club = un lieu, désormais géré dans
// la page « Organisation ». Cette route ne fait que rediriger (anciens favoris).
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getOrgId } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

export default function VenuesRedirect() {
  const router = useRouter();

  useEffect(() => {
    const orgId = getOrgId();
    router.replace(orgId ? `/organizations/${orgId}` : '/dashboard');
  }, [router]);

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font, color: BRAND.grey, fontSize: 14 }}>
      Le lieu se gère désormais dans « Organisation ». Redirection…
    </div>
  );
}
