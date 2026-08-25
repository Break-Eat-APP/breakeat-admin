'use client';

import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { fetchMeWithMemberships } from '@/lib/api/orders-client';
import { BRAND, BreakEatLogo } from '@break-eat/brand';
import { LoginForm } from '@/components/LoginForm';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

interface EventItem {
  id: string;
  name: string;
  status: string;
  startAt: string;
  endAt: string;
}

async function fetchEvents(orgId: string, token: string): Promise<EventItem[]> {
  // `includePermanent` : un lieu ouvert en continu n'a pas d'événement au sens
  // commercial, mais un contenant technique qui porte ses commandes. Sans lui,
  // un restaurant n'offrirait aucun tableau à ouvrir — l'opérateur se
  // connecterait pour arriver sur une page vide.
  const res = await fetch(`${API_URL}/organizations/${orgId}/events?includePermanent=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json() as Promise<EventItem[]>;
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#10b981', DRAFT: '#a8a29e', PAUSED: '#f59e0b', ENDED: '#a8a29e', CANCELLED: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Actif', DRAFT: 'Brouillon', PAUSED: 'Pausé', ENDED: 'Terminé', CANCELLED: 'Annulé',
};

// ─── Event selector ─────────────────────────────────────────────────────────────

function EventSelector({ token }: { token: string }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [orgName, setOrgName] = useState('');
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualId, setManualId] = useState('');
  // Distingue « rien a afficher » de « ca a echoue » : sans cet etat, les deux
  // produisaient le meme ecran vide et aucun diagnostic n'etait possible.
  const [loadError, setLoadError] = useState('');
  const [noMembership, setNoMembership] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetchMeWithMemberships(token);
        const firstMembership = me.memberships[0];
        if (!firstMembership) {
          // Compte valide, mais rattache a aucune organisation : c'est une
          // configuration incomplete, pas une absence d'evenement.
          setNoMembership(true);
          return;
        }

        setOrgName(firstMembership.organization.name);
        // L'identifiant de l'organisation sert au tableau de bord pour ouvrir
        // ou fermer la buvette — la route de statut en a besoin.
        localStorage.setItem('operator_org_id', firstMembership.organization.id);

        // Phase 12.9 — store supplier assignment for filtered dashboard
        const sName = firstMembership.supplier?.name ?? null;
        setSupplierName(sName);
        if (firstMembership.supplierId) {
          localStorage.setItem('operator_supplier_id', firstMembership.supplierId);
          localStorage.setItem('operator_supplier_name', firstMembership.supplier?.name ?? '');
        } else {
          localStorage.removeItem('operator_supplier_id');
          localStorage.removeItem('operator_supplier_name');
        }

        const evs = await fetchEvents(firstMembership.organization.id, token);
        setEvents(Array.isArray(evs) ? evs : []);
      } catch (err) {
        // Ne JAMAIS retomber en silence sur une liste vide : jeton expire,
        // organisation inaccessible ou serveur muet produisaient tous le meme
        // ecran « aucun evenement », rendant la panne indiscernable.
        setEvents([]);
        setLoadError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  function goTo(eventId: string) {
    if (eventId.trim()) {
      window.location.href = `/dashboard/${eventId.trim()}`;
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: BRAND.bg, fontFamily: BRAND.font, padding: 32, color: BRAND.ink }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <BreakEatLogo size={30} />
            <span style={{ fontWeight: 700, fontSize: 16, color: BRAND.ink, letterSpacing: -0.2 }}>BREAKEAT</span>
          </div>
          {orgName && <div style={{ fontSize: 13, color: BRAND.grey, marginTop: 6 }}>{orgName}</div>}
          {supplierName && (
            <div
              style={{
                marginTop: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: BRAND.orangeTint,
                border: `1px solid ${BRAND.orangeSoft}`,
                borderRadius: 8,
                padding: '4px 12px',
                fontSize: 13,
                fontWeight: 700,
                color: BRAND.orangeDark,
              }}
            >
<Store size={14} strokeWidth={2} style={{ flexShrink: 0 }} /> {supplierName}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('operator_token');
            window.location.reload();
          }}
          style={{
            background: '#fff',
            color: BRAND.inkSoft,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 10,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Déconnexion
        </button>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: BRAND.ink, marginBottom: 8 }}>Choisir un événement</h2>
        <p style={{ color: BRAND.grey, fontSize: 14, marginBottom: 24 }}>
          Sélectionnez l&apos;événement à gérer pour accéder au tableau de bord des commandes.
        </p>

        {/* Events list */}
        {loading ? (
          <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement des événements…</div>
        ) : loadError ? (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: 24, color: '#991b1b', fontSize: 14, marginBottom: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Impossible de charger vos événements</div>
            <div style={{ marginBottom: 8 }}>{loadError}</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              Si le message évoque une session expirée, déconnectez-vous puis reconnectez-vous.
              Sinon, transmettez ce texte à votre administrateur : il désigne la cause exacte.
            </div>
          </div>
        ) : noMembership ? (
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: 24, color: '#92400e', fontSize: 14, marginBottom: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Votre compte n’est rattaché à aucune organisation</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              La connexion a réussi, mais aucun club ne vous a encore donné accès.
              Demandez à votre responsable de vous inviter depuis « Équipe » de son tableau de bord.
            </div>
          </div>
        ) : events.length === 0 ? (
          <div style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 24, color: BRAND.grey, fontSize: 14, marginBottom: 24 }}>
            Aucun événement trouvé. Utilisez l&apos;admin panel pour en créer un.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {events.map((ev) => {
              const color = STATUS_COLOR[ev.status] ?? BRAND.grey;
              const label = STATUS_LABEL[ev.status] ?? ev.status;
              const active = ev.status === 'ACTIVE';
              return (
                <button
                  key={ev.id}
                  onClick={() => goTo(ev.id)}
                  style={{
                    background: '#fff',
                    border: `1.5px solid ${active ? BRAND.orange : BRAND.border}`,
                    borderRadius: 12,
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.12s, box-shadow 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = BRAND.shadowSoft;
                    if (!active) e.currentTarget.style.borderColor = BRAND.orangeSoft;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                    if (!active) e.currentTarget.style.borderColor = BRAND.border;
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: BRAND.ink }}>{ev.name}</div>
                    <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 4 }}>
                      {new Date(ev.startAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <span style={{ background: color + '22', color, borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>{label}</span>
                  <span style={{ color: BRAND.grey, fontSize: 18 }}>›</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Manual ID entry */}
        <div style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 10 }}>
            Ou saisir un UUID d&apos;événement manuellement
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${BRAND.border}`, background: '#fff', color: BRAND.ink, fontSize: 13, fontFamily: 'monospace', outline: 'none' }}
            />
            <button
              onClick={() => goTo(manualId)}
              disabled={!manualId.trim()}
              style={{
                background: manualId.trim() ? BRAND.orange : BRAND.orangeSoft,
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 20px',
                fontWeight: 600,
                fontSize: 13,
                cursor: manualId.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Dashboard →
            </button>
          </div>
        </div>

        {/* Public screen link */}
        {events.length > 0 && (
          <div style={{ marginTop: 16, fontSize: 13, color: BRAND.grey }}>
            Écran public (commandes prêtes) :{' '}
            <a href={`/public/${events[0].id}`} style={{ color: BRAND.orange, textDecoration: 'none', fontWeight: 600 }}>
              /public/{events[0].id.slice(0, 8)}…
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

// ─── Root page ─────────────────────────────────────────────────────────────────

export default function OperatorHomePage() {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('operator_token');
    setToken(stored);
    setChecked(true);
  }, []);

  if (!checked) return null;
  if (!token) return <LoginForm onLogin={setToken} />;
  return <EventSelector token={token} />;
}
