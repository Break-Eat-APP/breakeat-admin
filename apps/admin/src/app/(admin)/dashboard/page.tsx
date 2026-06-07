'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStoredUser, getOrgId, getOrgName } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

interface StatCard {
  icon: string;
  label: string;
  href: string;
  description: string;
}

const CARDS: StatCard[] = [
  { icon: '🏢', label: 'Organisation', href: '/organizations/__ORG__', description: 'Paramètres, branding, accès' },
  { icon: '👥', label: 'Équipe', href: '/team', description: 'Membres, rôles, opérateurs assignés' },
  { icon: '🎪', label: 'Événements', href: '/events', description: 'Gérer les événements actifs' },
  { icon: '🏟️', label: 'Lieux', href: '/venues', description: 'Salles et adresses' },
  { icon: '🏳️', label: 'Feature Flags', href: '/feature-flags', description: 'Activer / désactiver des fonctionnalités' },
  { icon: '⚙️', label: 'Paramètres', href: '/settings', description: "Configuration de l'application" },
  { icon: '🚀', label: 'Simulateur', href: '/simulator', description: 'Tester en mode démo (DEMO_MODE)' },
];

export default function DashboardPage() {
  const [userName, setUserName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking');

  useEffect(() => {
    const user = getStoredUser();
    if (user) setUserName(user.displayName ?? user.email);
    setOrgId(getOrgId());
    setOrgName(getOrgName());

    // Quick health check
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3000';
    fetch(`${apiUrl}/health`)
      .then((r) => (r.ok ? setApiStatus('ok') : setApiStatus('error')))
      .catch(() => setApiStatus('error'));
  }, []);

  return (
    <div style={{ padding: 32, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: BRAND.ink, margin: 0 }}>
          Bonjour{userName ? `, ${userName}` : ''} 👋
        </h1>
        {orgName && (
          <p style={{ color: BRAND.grey, marginTop: 6, fontSize: 14 }}>
            Organisation active : <strong style={{ color: BRAND.inkSoft }}>{orgName}</strong>
          </p>
        )}
      </div>

      {/* API status */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: apiStatus === 'ok' ? '#ecfdf5' : apiStatus === 'error' ? '#fef2f2' : BRAND.bgSubtle,
          color: apiStatus === 'ok' ? '#047857' : apiStatus === 'error' ? '#b91c1c' : BRAND.grey,
          border: `1px solid ${apiStatus === 'ok' ? '#a7f3d0' : apiStatus === 'error' ? '#fecaca' : BRAND.border}`,
          borderRadius: 999,
          padding: '5px 13px',
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 28,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: apiStatus === 'ok' ? '#10b981' : apiStatus === 'error' ? '#ef4444' : BRAND.grey,
            display: 'inline-block',
          }}
        />
        Backend {apiStatus === 'ok' ? 'connecté' : apiStatus === 'error' ? 'inaccessible' : 'vérification…'}
      </div>

      {/* Nav cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {CARDS.map(({ icon, label, href, description }) => {
          const resolvedHref = href.replace('__ORG__', orgId || '');
          return (
            <Link key={label} href={resolvedHref} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: '#fff',
                  borderRadius: 14,
                  padding: 22,
                  border: `1px solid ${BRAND.border}`,
                  cursor: 'pointer',
                  transition: 'transform 0.12s, box-shadow 0.12s, border-color 0.12s',
                  height: '100%',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = 'translateY(-2px)';
                  el.style.boxShadow = BRAND.shadowSoft;
                  el.style.borderColor = BRAND.orangeSoft;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = 'translateY(0)';
                  el.style.boxShadow = 'none';
                  el.style.borderColor = BRAND.border;
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: BRAND.orangeTint,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    marginBottom: 14,
                  }}
                >
                  {icon}
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: BRAND.ink, marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontSize: 13, color: BRAND.grey, lineHeight: 1.45 }}>{description}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick links footer */}
      <div style={{ marginTop: 36, padding: '18px 0', borderTop: `1px solid ${BRAND.border}` }}>
        <div style={{ fontSize: 12, color: BRAND.grey }}>
          Accès rapide — Dashboard opérateur :{' '}
          <a
            href="http://localhost:3002/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: BRAND.orange, fontWeight: 600 }}
          >
            localhost:3002
          </a>
          {' · '}
          Backend API :{' '}
          <a
            href={(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1') + '/../health'}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: BRAND.orange, fontWeight: 600 }}
          >
            /health
          </a>
        </div>
      </div>
    </div>
  );
}
