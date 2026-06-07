'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getOrgId } from '@/lib/api/admin-client';

/**
 * Root redirect — sends authenticated users to /dashboard,
 * unauthenticated users to /login.
 */
export default function AdminRootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    const orgId = getOrgId();
    if (token && orgId) {
      router.replace('/dashboard');
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
        background: '#f9fafb',
        fontFamily: 'system-ui, sans-serif',
        color: '#6b7280',
      }}
    >
      Chargement…
    </div>
  );
}
