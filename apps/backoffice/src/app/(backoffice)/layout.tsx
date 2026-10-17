'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCircle,
  Bell,
  Link2,
  type LucideIcon,
} from 'lucide-react';
import { BRAND, BreakEatLogo } from '@break-eat/brand';
import {
  getToken,
  getStoredUser,
  clearSession,
  isSuperAdmin,
} from '@/lib/api/backoffice-client';

/**
 * LE MENU, RANGÉ PAR QUESTION PLUTÔT QUE PAR TABLE.
 *
 * Six entrées à plat, c'est six choses à relire à chaque fois. Groupées, on
 * ne lit que le groupe : « je cherche un club » → Clubs ; « je cherche
 * quelqu'un » → Personnes. La structure se reconnaît sans être lue.
 *
 * « Vue d'ensemble » reste SEULE en tête : c'est le point d'entrée, et le
 * seul écran qui parle de toute la plateforme à la fois.
 */
type Entree = { href: string; icon: LucideIcon; label: string };
type Groupe = { titre?: string; entrees: Entree[] };

const NAV: Groupe[] = [
  {
    entrees: [{ href: '/overview', icon: LayoutDashboard, label: "Vue d'ensemble" }],
  },
  {
    titre: 'Clubs',
    entrees: [
      { href: '/organizations', icon: Building2, label: 'Organisations' },
      { href: '/liens-flaix', icon: Link2, label: 'Liens de commande' },
    ],
  },
  {
    titre: 'Personnes',
    entrees: [
      { href: '/users', icon: UserCircle, label: 'Utilisateurs' },
      { href: '/groups', icon: Users, label: 'Groupes & accès' },
    ],
  },
  {
    titre: 'Communication',
    entrees: [{ href: '/notifications', icon: Bell, label: 'Notifications' }],
  },
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
            {/* Le nom de marque en ORANGE : c'est lui qu'on doit reconnaitre
                d'un coup d'oeil, pas la mention qui le suit. Meme traitement
                que le dashboard manager. */}
            <span
              style={{
                fontFamily: BRAND.fontDisplay,
                fontWeight: 800,
                fontSize: 15,
                color: BRAND.orange,
                letterSpacing: -0.2,
              }}
            >
              BREAKEAT
            </span>
            <span
              style={{
                fontSize: 10,
                color: BRAND.inkSoft,
                marginTop: 1,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Back office super admin
            </span>
          </div>
        </div>

        {/*
          QUI EST CONNECTÉ, et sur quoi. Repris de FlaiX Expert : savoir d'un
          coup d'œil qu'on est en super-admin évite les gestes faits « dans le
          mauvais compte », qui sont les plus coûteux à rattraper.
        */}
        <div style={{ padding: '14px 14px 2px' }}>
          <div
            style={{
              background: BRAND.orangeTint,
              borderRadius: 14,
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: BRAND.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {userName || 'Super-admin'}
            </div>
            <div style={{ fontSize: 11.5, color: BRAND.orange, marginTop: 2, fontWeight: 600 }}>
              Accès à tous les clubs
            </div>
          </div>
        </div>

        {/*
          Navigation groupée. L'entrée active est une PILULE PLEINE orange et
          non une teinte : sur une liste de six, une nuance pâle se cherche.
          Pleine, elle se trouve sans la lire.
        */}
        <nav style={{ flex: 1, padding: '10px 0 16px', overflowY: 'auto' }}>
          {NAV.map((groupe, i) => (
            <div key={groupe.titre ?? `g${i}`} style={{ marginBottom: 6 }}>
              {groupe.titre ? (
                <div
                  style={{
                    ...BRAND.sectionTitle,
                    color: BRAND.grey,
                    fontSize: 10.5,
                    margin: '14px 22px 6px',
                  }}
                >
                  {groupe.titre}
                </div>
              ) : null}
              {groupe.entrees.map(({ href, icon: Icon, label }) => {
                const isActive =
                  pathname === href || (href !== '/overview' && pathname.startsWith(href));

                return (
                  <Link
                    key={href}
                    href={href}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      margin: '2px 12px',
                      padding: '10px 14px',
                      borderRadius: BRAND.radius.pill,
                      color: isActive ? '#fff' : BRAND.inkSoft,
                      background: isActive ? BRAND.orange : 'transparent',
                      boxShadow: isActive ? BRAND.shadowButton : 'none',
                      textDecoration: 'none',
                      fontSize: 13.5,
                      fontWeight: isActive ? 700 : 500,
                      transition: 'background 0.12s, color 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = BRAND.bgSubtle;
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Icon size={18} strokeWidth={1.9} style={{ flexShrink: 0 }} />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* La sortie. Le nom est déjà en haut : le répéter ne dit rien de plus. */}
        <div style={{ padding: '12px 14px', borderTop: `1px solid ${BRAND.border}` }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              background: '#fff',
              color: BRAND.inkSoft,
              border: `1px solid ${BRAND.border}`,
              borderRadius: BRAND.radius.pill,
              padding: '10px 0',
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
      {/* Canevas TEINTÉ : c'est lui qui fait ressortir les cartes blanches. */}
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0, background: BRAND.canvas }}>
        {children}
      </main>
    </div>
  );
}
