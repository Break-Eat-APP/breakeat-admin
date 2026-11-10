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
  apiTousLesLieux,
  choisirLieu,
  type LieuPlateforme,
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
  /**
   * LE SUPER ADMIN PASSE D'UN LIEU À L'AUTRE (décision de Rémi, 10/11).
   * `null` : pas super admin, pas de sélecteur. Le serveur laisse le super
   * admin entrer partout — le sélecteur ne fait que choisir le lieu.
   */
  const [lieux, setLieux] = useState<LieuPlateforme[] | null>(null);
  /**
   * CE COMPTE N'A PAS ACCÈS AU LIEU OUVERT (constaté le 10/11 : « Access
   * denied to this organization », brut, sur un compte de responsable arrivé
   * sur un autre lieu). On dit pourquoi et quoi faire, au lieu de l'erreur.
   */
  const [horsLieu, setHorsLieu] = useState<{
    email: string;
    lieu: string;
    sienne: { id: string; name: string } | null;
  } | null>(null);

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
    apiMeWithMemberships()
      .then((moi) => {
        if (moi.globalRole === 'SUPER_ADMIN') {
          apiTousLesLieux()
            .then((tous) => {
              const tries = [...tous].sort((x, y) => x.name.localeCompare(y.name, 'fr'));
              setLieux(tries);
              // Aucun lieu choisi : on ouvre le premier, plutôt qu'un tableau
              // de bord vide. Son nom est affiché en tête, et se change d'un clic.
              if (!orgId && tries[0]) {
                choisirLieu(tries[0]);
                window.location.reload();
              }
            })
            .catch(() => setLieux([]));
          return;
        }
        if (!orgId) return;
        const mienne = moi.memberships.find((m) => m.organizationId === orgId);
        if (!mienne) {
          const premiere = moi.memberships[0];
          setHorsLieu({
            email: moi.email,
            lieu: getOrgName() || 'ce lieu',
            sienne: premiere
              ? { id: premiere.organizationId, name: premiere.organization.name }
              : null,
          });
          return;
        }
        setSuspendue(mienne.organization.status !== 'ACTIVE');
      })
      .catch(() => {
        // Information secondaire : son absence ne doit pas empêcher de
        // travailler — chaque écran affiche sa propre erreur.
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

  /**
   * La section est-elle ACTIVE ?
   *
   * Vrai sur sa page de modules, mais aussi sur chacun des écrans qu'elle
   * contient : le menu ne liste plus les modules, donc sans cela on perdrait
   * tout repère dès qu'on en ouvre un.
   */
  const actif = (slug: string): boolean => {
    const groupe = NAV_GROUPS.find((g) => g.slug === slug);
    if (!groupe) return false;
    if (pathname === `/section/${slug}`) return true;
    return groupe.items.some(
      (i) => !i.external && (pathname === i.href || pathname.startsWith(`${i.href}/`)),
    );
  };

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
        {lieux && lieux.length > 0 ? (
          <div style={{ padding: '14px 14px 2px' }}>
            <div style={{ background: BRAND.orangeTint, borderRadius: 14, padding: '12px 14px' }}>
              <label
                htmlFor="lieu-de-travail"
                style={{ display: 'block', fontSize: 11.5, color: BRAND.orange, fontWeight: 700, marginBottom: 6 }}
              >
                Lieu (super admin)
              </label>
              <select
                id="lieu-de-travail"
                value={getOrgId()}
                onChange={(e) => {
                  const lieu = lieux.find((l) => l.id === e.target.value);
                  if (!lieu) return;
                  choisirLieu(lieu);
                  // Rechargement complet : chaque écran relit SES données
                  // pour le nouveau lieu, rien ne reste de l'ancien.
                  window.location.assign('/dashboard');
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${BRAND.border}`,
                  background: '#fff',
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: BRAND.ink,
                  fontFamily: 'inherit',
                }}
              >
                {lieux.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.status !== 'ACTIVE' ? ' (suspendu)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : orgName && (
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

        {/*
          LE MENU NE LISTE QUE DES SECTIONS.

          Chaque section ouvre la page de ses modules, où chacun porte une
          phrase qui dit ce qu'on y fait. Les entrées directes ont été retirées
          le 17/10 : deux chemins vers le même écran, c'est une duplication à
          tenir à jour — et un menu qui s'allonge sans rien expliquer.
        */}
        <nav style={{ flex: 1, padding: '14px 0 14px' }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  margin: '3px 12px',
                  padding: '12px 16px',
                  borderRadius: BRAND.radius.pill,
                  // Raleway : une seule famille pour toute la navigation et les
                  // titres. Elle donne le ton « moderne » sans qu'on ait à
                  // grossir quoi que ce soit.
                  fontFamily: BRAND.fontDisplay,
                  fontSize: 14,
                  fontWeight: actif(group.slug) ? 800 : 600,
                  letterSpacing: 0.1,
                  color: actif(group.slug) ? '#fff' : BRAND.ink,
                  background: actif(group.slug) ? BRAND.orange : 'transparent',
                  boxShadow: actif(group.slug) ? BRAND.shadowButton : 'none',
                  textDecoration: 'none',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={(e) => {
                  if (!actif(group.slug)) e.currentTarget.style.background = BRAND.bgSubtle;
                }}
                onMouseLeave={(e) => {
                  if (!actif(group.slug)) e.currentTarget.style.background = 'transparent';
                }}
              >
                <group.icon size={18} strokeWidth={2} style={{ flexShrink: 0 }} />
                {group.title}
              </Link>
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
        {horsLieu ? (
          <div
            style={{
              background: '#fff',
              border: `1px solid ${BRAND.border}`,
              borderLeft: `4px solid ${BRAND.orange}`,
              borderRadius: 12,
              padding: '20px 22px',
              margin: '32px 36px',
              maxWidth: 680,
              fontSize: 14.5,
              lineHeight: 1.6,
              color: BRAND.ink,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>
              Ce compte n&apos;a pas accès à « {horsLieu.lieu} »
            </div>
            <div>
              Tu es connecté avec <strong>{horsLieu.email}</strong>, qui n&apos;est pas membre de ce
              lieu et n&apos;est pas super admin.
            </div>
            <div style={{ marginTop: 8 }}>
              Pour programmer <strong>tous les lieux</strong>, déconnecte-toi et reconnecte-toi avec
              ton <strong>adresse super admin</strong> — celle du back-office.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  background: BRAND.orange,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 999,
                  padding: '10px 18px',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Me reconnecter avec une autre adresse
              </button>
              {horsLieu.sienne ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!horsLieu.sienne) return;
                    choisirLieu(horsLieu.sienne);
                    window.location.assign('/dashboard');
                  }}
                  style={{
                    background: '#fff',
                    color: BRAND.ink,
                    border: `1px solid ${BRAND.border}`,
                    borderRadius: 999,
                    padding: '10px 18px',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Revenir à « {horsLieu.sienne.name} »
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
