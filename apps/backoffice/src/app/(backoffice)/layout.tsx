'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { BRAND, BreakEatLogo } from '@break-eat/brand';
import {
  getToken,
  getStoredUser,
  clearSession,
  isSuperAdmin,
} from '@/lib/api/backoffice-client';

const NAV_ITEMS = [
  { href: '/overview', icon: '📊', label: "Vue d'ensemble" },
  { href: '/organizations', icon: '🏢', label: 'Organisations' },
  { href: '/groups', icon: '👥', label: 'Groupes & accès' },
];

export default function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const token = getToken();
    const user = getStoredUser();
    // Gate on BOTH a token AND the SUPER_ADMIN role. The backend re-checks the
    // role on every /backoffice route, so this is purely a UX guard.
    if (!token || !isSuperAdmin(user)) {
      clearSession();
      router.replace('/login');
      return;
    }
    setUserName(user?.displayName ?? user?.email ?? '');
    setReady(true);
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND.bg,
          fontFamily: BRAND.font,
          color: BRAND.grey,
        }}
      >
        Chargement…
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        fontFamily: BRAND.font,
        background: BRAND.bg,
        color: BRAND.ink,
      }}
    >
      {/* ─── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: 240,
          background: BRAND.bg,
          borderRight: `1px solid ${BRAND.border}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        {/* Logo — the B + éclair mark only */}
        <div
          style={{
            padding: '18px 20px 16px',
            borderBottom: `1px solid ${BRAND.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 11,
          }}
        >
          <BreakEatLogo size={30} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: BRAND.ink, letterSpacing: -0.2 }}>
              BREAKEAT
            </span>
            <span
              style={{
                fontSize: 10,
                color: BRAND.grey,
                marginTop: 1,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Back Office
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 0' }}>
          {NAV_ITEMS.map(({ href, icon, label }) => {
            const isActive =
              pathname === href || (href !== '/overview' && pathname.startsWith(href));

            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 20px',
                  color: isActive ? BRAND.orange : BRAND.inkSoft,
                  background: isActive ? BRAND.orangeTint : 'transparent',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  borderLeft: isActive ? `3px solid ${BRAND.orange}` : '3px solid transparent',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = BRAND.bgSubtle;
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ fontSize: 16 }}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User + logout */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${BRAND.border}` }}>
          {userName && (
            <div
              style={{
                fontSize: 12,
                color: BRAND.grey,
                marginBottom: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {userName}
            </div>
          )}
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              background: '#fff',
              color: BRAND.inkSoft,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 10,
              padding: '9px 0',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'border-color 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = BRAND.orange;
              e.currentTarget.style.color = BRAND.orange;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BRAND.border;
              e.currentTarget.style.color = BRAND.inkSoft;
            }}
          >
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ─── Main content ─────────────────────────────────────────────────── */}
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0, background: BRAND.bg }}>
        {children}
      </main>
    </div>
  );
}
