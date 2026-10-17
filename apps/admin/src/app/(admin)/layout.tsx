'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  getToken,
  getOrgId,
  getOrgName,
  getStoredUser,
  clearSession,
  apiMeWithMemberships,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import { NAV_GROUPS } from '@/lib/nav';
import { BreakEatLogo } from '@/components/brand/BreakEatLogo';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [userName, setUserName] = useState('');
  // Une organisation suspendue n'apparaît plus dans l'app et ne prend plus de
  // commande. Sans ce bandeau, le club constaterait un silence sans le
  // comprendre — et chercherait la panne du mauvais côté.
  const [suspendue, setSuspendue] = useState(false);

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

    const orgId = getOrgId();
    if (!orgId) return;
    apiMeWithMemberships()
      .then((moi) => {
        const mienne = moi.memberships.find((m) => m.organizationId === orgId);
        setSuspendue(Boolean(mienne) && mienne?.organization.status !== 'ACTIVE');
      })
      .catch(() => {
        // Information secondaire : son absence ne doit pas empêcher de
        // travailler.
      });
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
            {/* Le nom de marque en ORANGE : c'est lui qu'on doit reconnaitre
                d'un coup d'oeil, pas la mention qui le suit. */}
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
              Backoffice manager
            </span>
          </div>
        </div>

        {/*
          LE CLUB SUR LEQUEL ON TRAVAILLE, en évidence.
          Un bandeau gris en haut d'écran se regarde une fois puis s'oublie.
          Une pastille teintée, à la place où FlaiX Expert la met, répond à
          « où suis-je ? » sans qu'on ait à se le demander — et évite les
          gestes faits dans le mauvais club.
        */}
        {orgName && (
          <div style={{ padding: '14px 14px 2px' }}>
            <div style={{ background: BRAND.orangeTint, borderRadius: 14, padding: '12px 14px' }}>
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
                {orgName}
              </div>
              <div
                style={{ fontSize: 11.5, color: BRAND.orange, marginTop: 2, fontWeight: 600 }}
              >
                Ton club
              </div>
            </div>
          </div>
        )}

        {/* Navigation — groupée par intention, icônes Lucide, pastille active arrondie */}
        <nav style={{ flex: 1, padding: '10px 0 14px' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.title} style={{ marginTop: gi === 0 ? 4 : 14 }}>
              {/*
                LE TITRE DE SECTION EST UN LIEN.

                Il ouvre la page des modules de cette section, chacun avec une
                phrase qui dit ce qu'on y fait. Le menu dit OÙ l'on va ; cette
                page dit ce qu'on y trouve. Qui connaît son chemin clique
                directement une entrée et ne passe jamais par là — les deux
                publics sont servis sans se gêner.

                ORANGE et Raleway : un titre qui ne se distingue pas de ses
                entrées ne structure rien, il devient une ligne de plus. La
                couleur ET la famille le séparent, sans grossir le texte dans un
                menu déjà dense.
              */}
              <Link
                href={`/section/${group.slug}`}
                style={{
                  display: 'block',
                  padding: '0 22px 7px',
                  fontFamily: BRAND.fontDisplay,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: BRAND.orange,
                  textDecoration: 'none',
                  opacity: pathname === `/section/${group.slug}` ? 1 : 0.8,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity =
                    pathname === `/section/${group.slug}` ? '1' : '0.8';
                }}
              >
                {group.title}
              </Link>
              {group.items.map(({ href, icon: Icon, label, external }) => {
                // For /organizations, redirect to specific org id if available
                const resolvedHref =
                  href === '/organizations' && getOrgId()
                    ? `/organizations/${getOrgId()}`
                    : href;

                // Un lien externe n'est jamais « actif » : il ne correspond à
                // aucune route de l'admin.
                const isActive =
                  !external &&
                  (pathname === resolvedHref ||
                    (href !== '/dashboard' && pathname.startsWith(href)));

                return (
                  <Link
                    key={href}
                    href={resolvedHref}
                    target={external ? '_blank' : undefined}
                    rel={external ? 'noopener noreferrer' : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      margin: '2px 12px',
                      padding: '10px 14px',
                      // PILULE PLEINE sur l'actif : sur quinze entrées, une
                      // teinte pâle se cherche. Pleine, elle se trouve sans
                      // être lue.
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
      {/* Canevas TEINTÉ : c'est lui qui fait ressortir les cartes blanches. */}
      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0, background: BRAND.canvas }}>
        {suspendue && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid rgba(185, 28, 28, 0.25)',
              borderLeft: '4px solid #b91c1c',
              borderRadius: 12,
              padding: '12px 16px',
              margin: '16px 24px 0',
              color: '#7f1d1d',
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            <strong>Organisation suspendue.</strong> Votre lieu n’apparaît plus dans
            l’application et n’accepte plus de commande. Vos écrans restent ouverts : les
            commandes déjà payées se préparent et se remettent normalement.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
