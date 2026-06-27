'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Receipt,
  Wand2,
  CalendarDays,
  Store,
  Tags,
  Palette,
  Bell,
  Megaphone,
  MonitorSmartphone,
  Building2,
  Users,
  Settings,
  Flag,
  Rocket,
  FlaskConical,
  type LucideIcon,
} from 'lucide-react';
import { getToken, getOrgId, getOrgName, getStoredUser, clearSession } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import { BreakEatLogo } from '@/components/brand/BreakEatLogo';

type NavItem = { href: string; icon: LucideIcon; label: string };
type NavGroup = { title: string; items: NavItem[] };

// Grouped navigation — structure le menu par intention (pilotage / config /
// organisation / système / outils) pour un repérage rapide et un rendu soigné.
const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Pilotage',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
      { href: '/accounting', icon: Receipt, label: 'Comptabilité' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { href: '/wizard', icon: Wand2, label: 'Configurer mon lieu' },
      { href: '/events', icon: CalendarDays, label: 'Événements & config' },
      { href: '/suppliers', icon: Store, label: 'Buvettes' },
      { href: '/groups', icon: Tags, label: 'Groupes' },
      { href: '/operator-screens', icon: MonitorSmartphone, label: 'Écrans opérateur' },
      { href: '/appearance', icon: Palette, label: "Apparence de l'app" },
      { href: '/notifications', icon: Bell, label: 'Notifications' },
      { href: '/campaigns', icon: Megaphone, label: 'Campagnes & push' },
    ],
  },
  {
    title: 'Organisation',
    items: [
      { href: '/organizations', icon: Building2, label: 'Organisation' },
      { href: '/team', icon: Users, label: 'Équipe' },
    ],
  },
  {
    title: 'Système',
    items: [
      { href: '/settings', icon: Settings, label: 'Paramètres' },
      { href: '/feature-flags', icon: Flag, label: 'Feature Flags' },
    ],
  },
  {
    title: 'Outils',
    items: [
      { href: '/simulator', icon: Rocket, label: 'Simulateur' },
      { href: '/demo-setup', icon: FlaskConical, label: 'Démo Spartiates' },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    setOrgName(getOrgName());
    const user = getStoredUser();
    if (user) setUserName(user.displayName ?? user.email);
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
      {/* ─── Sidebar (refonte v3 — rail blanc sur canevas crème) ──────────── */}
      <aside
        style={{
          width: 244,
          background: BRAND.surface,
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
        {/* Logo — the B + éclair mark only (single source: BreakEatLogo) */}
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
              Administration
            </span>
          </div>
        </div>

        {/* Org context */}
        {orgName && (
          <div
            style={{
              padding: '12px 20px',
              borderBottom: `1px solid ${BRAND.border}`,
              background: BRAND.bgSubtle,
            }}
          >
            <div style={{ fontSize: 10, color: BRAND.grey, textTransform: 'uppercase', letterSpacing: 1 }}>
              Organisation
            </div>
            <div style={{ fontSize: 13, color: BRAND.ink, fontWeight: 600, marginTop: 2 }}>
              {orgName}
            </div>
          </div>
        )}

        {/* Navigation — groupée par intention, icônes Lucide, pastille active arrondie */}
        <nav style={{ flex: 1, padding: '10px 0 14px' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.title} style={{ marginTop: gi === 0 ? 4 : 14 }}>
              <div
                style={{
                  padding: '0 22px 6px',
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: BRAND.grey,
                }}
              >
                {group.title}
              </div>
              {group.items.map(({ href, icon: Icon, label }) => {
                // For /organizations, redirect to specific org id if available
                const resolvedHref =
                  href === '/organizations' && getOrgId()
                    ? `/organizations/${getOrgId()}`
                    : href;

                const isActive =
                  pathname === resolvedHref ||
                  (href !== '/dashboard' && pathname.startsWith(href));

                return (
                  <Link
                    key={href}
                    href={resolvedHref}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      margin: '1px 10px',
                      padding: '9px 12px',
                      borderRadius: 10,
                      color: isActive ? BRAND.orange : BRAND.inkSoft,
                      background: isActive ? BRAND.orangeTint : 'transparent',
                      textDecoration: 'none',
                      fontSize: 13.5,
                      fontWeight: isActive ? 600 : 500,
                      transition: 'background 0.12s, color 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = BRAND.bgSubtle;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Icon size={18} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
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
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0, background: BRAND.bg }}>{children}</main>
    </div>
  );
}
