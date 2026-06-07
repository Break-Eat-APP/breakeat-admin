'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  apiGetOrgStats,
  getStoredUser,
  getOrgId,
  getOrgName,
  type OrgStatsOverview,
  type OrgEventStat,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Formatting helpers ─────────────────────────────────────────────────────────

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

/** Integer cents → "1 234,56 €". */
function euros(cents: number): string {
  return EUR.format((cents ?? 0) / 100);
}

const INT = new Intl.NumberFormat('fr-FR');

/** Detect the backend's MANAGE_ROLES 403 (revenue is manager-only). */
function isAccessDenied(message: string): boolean {
  return /access denied/i.test(message);
}

// ─── Event status badge (matches the events list palette) ───────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: '#d1fae5', color: '#065f46' },
  PUBLISHED: { bg: '#d1fae5', color: '#065f46' },
  DRAFT: { bg: BRAND.bgSubtle, color: BRAND.inkSoft },
  PAUSED: { bg: '#fef3c7', color: '#92400e' },
  ENDED: { bg: BRAND.border, color: BRAND.grey },
  COMPLETED: { bg: BRAND.border, color: BRAND.grey },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b' },
};

// ─── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? BRAND.orangeTint : '#fff',
        border: `1px solid ${accent ? BRAND.orangeSoft : BRAND.border}`,
        borderRadius: 14,
        padding: '18px 20px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          color: accent ? BRAND.orange : BRAND.grey,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? BRAND.orange : BRAND.ink, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [userName, setUserName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState('');

  const [stats, setStats] = useState<OrgStatsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (user) setUserName(user.displayName ?? user.email);
    setOrgId(getOrgId());
    setOrgName(getOrgName());
  }, []);

  const load = useCallback(async () => {
    const id = getOrgId();
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    setDenied(false);
    try {
      const data = await apiGetOrgStats(id);
      setStats(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur de chargement';
      if (isAccessDenied(msg)) setDenied(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: BRAND.font }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: BRAND.ink, margin: 0 }}>
            Bonjour{userName ? `, ${userName}` : ''} 👋
          </h1>
          {orgName && (
            <p style={{ color: BRAND.grey, marginTop: 6, fontSize: 14 }}>
              Organisation active : <strong style={{ color: BRAND.inkSoft }}>{orgName}</strong>
            </p>
          )}
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.borderColor = BRAND.orange;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = BRAND.border;
          }}
          style={{
            background: '#fff',
            color: BRAND.inkSoft,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            padding: '8px 14px',
            fontWeight: 600,
            fontSize: 13,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Chargement…' : '↻ Rafraîchir'}
        </button>
      </div>

      {/* ── No org selected ── */}
      {!orgId && !loading && (
        <InfoCard
          icon="🏢"
          title="Aucune organisation sélectionnée"
          text="Reconnectez-vous pour choisir une organisation de travail."
        />
      )}

      {/* ── Access denied (operators / marketing) ── */}
      {denied && (
        <InfoCard
          icon="🔒"
          title="Statistiques réservées aux managers"
          text="Le chiffre d'affaires et les indicateurs de l'organisation sont accessibles aux rôles Administrateur d'organisation et Manager. Utilisez le menu latéral pour accéder aux sections autorisées."
        />
      )}

      {/* ── Error ── */}
      {error && (
        <div
          style={{
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#b91c1c',
            padding: '12px 16px',
            borderRadius: 10,
            fontSize: 14,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && !stats && (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement des statistiques…</div>
      )}

      {/* ── Stats ── */}
      {stats && !denied && (
        <>
          {/* KPI grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 14,
              marginBottom: 28,
            }}
          >
            <KpiCard
              label="Chiffre d'affaires HT"
              value={euros(stats.revenue.caHtCents)}
              sub={`TVA ${Math.round(stats.revenue.vatRate * 100)}% · TTC ${euros(stats.revenue.caTtcCents)}`}
              accent
            />
            <KpiCard label="CA TTC" value={euros(stats.revenue.caTtcCents)} sub="Encaissé (paiements réussis)" />
            <KpiCard label="Commandes" value={INT.format(stats.ordersCount)} sub="Payées et confirmées" />
            <KpiCard
              label="Panier moyen TTC"
              value={euros(stats.averageBasket.ttcCents)}
              sub={`HT ${euros(stats.averageBasket.htCents)}`}
            />
            <KpiCard
              label="Événements"
              value={INT.format(stats.eventsCount)}
              sub={`${stats.activeEventsCount} en cours`}
            />
          </div>

          {/* Per-event breakdown */}
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: BRAND.ink, margin: 0 }}>
              Performance par événement
            </h2>
            <Link href="/events" style={{ fontSize: 13, fontWeight: 600, color: BRAND.orange, textDecoration: 'none' }}>
              Gérer les événements →
            </Link>
          </div>

          {stats.events.length === 0 ? (
            <InfoCard
              icon="🎪"
              title="Aucun événement"
              text="Créez un premier événement pour commencer à suivre vos ventes."
              cta={{ href: '/events', label: 'Créer un événement →' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.events.map((ev) => (
                <EventRow key={ev.id} ev={ev} active={isActive(ev, now)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Quick-access footer */}
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
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function isActive(ev: OrgEventStat, now: number): boolean {
  return new Date(ev.startAt).getTime() <= now && new Date(ev.endAt).getTime() >= now;
}

function EventRow({ ev, active }: { ev: OrgEventStat; active: boolean }) {
  const st = STATUS_STYLE[ev.status] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft };
  return (
    <Link href={`/events/${ev.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '14px 18px',
          border: `1px solid ${active ? BRAND.orangeSoft : BRAND.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = BRAND.shadowSoft;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Name + meta */}
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: BRAND.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {ev.name}
            </span>
            {active && (
              <span
                style={{
                  background: BRAND.orange,
                  color: '#fff',
                  borderRadius: 999,
                  padding: '2px 9px',
                  fontSize: 11,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                ● En cours
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 3 }}>
            {new Date(ev.startAt).toLocaleDateString('fr-FR')} → {new Date(ev.endAt).toLocaleDateString('fr-FR')}
          </div>
        </div>

        {/* Mini stats */}
        <Metric label="CA HT" value={euros(ev.caHtCents)} strong />
        <Metric label="CA TTC" value={euros(ev.caTtcCents)} />
        <Metric label="Cmd." value={INT.format(ev.ordersCount)} />

        {/* Status */}
        <span
          style={{
            background: st.bg,
            color: st.color,
            borderRadius: 999,
            padding: '3px 12px',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {ev.status}
        </span>
        <span style={{ color: BRAND.grey, fontSize: 18 }}>›</span>
      </div>
    </Link>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 84 }}>
      <div style={{ fontSize: 11, color: BRAND.grey, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: strong ? 800 : 600, color: strong ? BRAND.orange : BRAND.ink }}>
        {value}
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  text,
  cta,
}: {
  icon: string;
  title: string;
  text: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: 32,
        textAlign: 'center',
        color: BRAND.grey,
        border: `1px solid ${BRAND.border}`,
        marginBottom: 20,
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: BRAND.ink }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 6, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
        {text}
      </div>
      {cta && (
        <Link
          href={cta.href}
          style={{
            display: 'inline-block',
            marginTop: 16,
            background: BRAND.orange,
            color: '#fff',
            borderRadius: 8,
            padding: '9px 18px',
            fontWeight: 600,
            fontSize: 13,
            textDecoration: 'none',
          }}
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
