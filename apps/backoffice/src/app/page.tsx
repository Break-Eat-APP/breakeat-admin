'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api/backoffice-client';

/**
 * Root redirect — authenticated users go to /overview, others to /login.
 */
export default function BackofficeRootPage() {
  const router = useRouter();

  useEffect(() => {
    if (getToken()) {
      router.replace('/overview');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
        fontFamily: 'system-ui, sans-serif',
        color: '#a8a29e',
      }}
    >
      Chargement…
    </div>
  );
}
