'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, ShoppingBag, Receipt, BarChart2 } from 'lucide-react';
import { apiGetOrgStats, getOrgId, getOrgName, type OrgStatsOverview } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Formatters ──────────────────────────────────────────────────────────────

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const INT = new Intl.NumberFormat('fr-FR');

function euros(cents: number) { return EUR.format((cents ?? 0) / 100); }
function pct(a: number, b: number) { return b === 0 ? '—' : `${((a / b) * 100).toFixed(1)} %`; }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  ACTIVE:    { bg: '#d1fae5', color: '#065f46', label: 'En cours' },
  PUBLISHED: { bg: '#d1fae5', color: '#065f46', label: 'Publié' },
  DRAFT:     { bg: BRAND.bgSubtle, color: BRAND.inkSoft, label: 'Brouillon' },
  ENDED:     { bg: BRAND.border, color: BRAND.grey, label: 'Terminé' },
  COMPLETED: { bg: BRAND.border, color: BRAND.grey, label: 'Terminé' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b', label: 'Annulé' },
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, accent }: {
  icon: typeof TrendingUp; label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div style={{ background: BRAND.surface, borderRadius: BRAND.radius.card, padding: '20px 24px', boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}`, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: accent ? `${accent}18` : BRAND.orangeTint, color: accent ?? BRAND.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} strokeWidth={2} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.grey, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.ink, marginTop: 2, letterSpacing: -0.5 }}>{value}</div>
        {sub && <div style={{ fontSize: 12.5, color: BRAND.inkSoft, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const orgId = getOrgId();
  const orgName = getOrgName();
  const [data, setData] = useState<OrgStatsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!orgId) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const stats = await apiGetOrgStats(orgId);
      setData(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  if (!orgId) {
    return <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>Aucune organisation sélectionnée.</div>;
  }

  const totalTtc = data?.revenue?.caTtcCents ?? 0;
  const totalHt  = data?.revenue?.caHtCents ?? 0;
  const tva = totalTtc - totalHt;
  const avgBasket = data?.averageBasket?.ttcCents ?? 0;
  const nbOrders = data?.ordersCount ?? 0;

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0, letterSpacing: -0.3 }}>Comptabilité</h1>
          <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: '6px 0 0', lineHeight: 1.55 }}>
            Chiffre d&apos;affaires, TVA et commandes — consolidés sur l&apos;ensemble des événements de <strong>{orgName ?? 'l\'organisation'}</strong>.
            TVA à 10 % (restauration). CA HT = CA TTC ÷ 1,10.
          </p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: BRAND.radius.control, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, color: BRAND.inkSoft, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <RefreshCw size={14} strokeWidth={2.2} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          {refreshing ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14, marginTop: 24 }}>Chargement…</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 20, marginBottom: 28 }}>
            <KpiCard icon={TrendingUp} label="CA TTC total" value={euros(totalTtc)} sub="TVA incluse" />
            <KpiCard icon={Receipt} label="CA HT total" value={euros(totalHt)} sub="TVA 10 % exclue" accent="#059669" />
            <KpiCard icon={BarChart2} label="TVA collectée" value={euros(tva)} sub={`≈ ${pct(tva, totalTtc)} du CA TTC`} accent="#7c3aed" />
            <KpiCard icon={ShoppingBag} label="Commandes" value={INT.format(nbOrders)} sub={avgBasket ? `Panier moyen ${euros(avgBasket)}` : undefined} accent="#0284c7" />
          </div>

          {/* Par événement */}
          <div style={{ background: BRAND.surface, borderRadius: BRAND.radius.card, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${BRAND.border}` }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: 0 }}>Détail par événement</h2>
            </div>
            {!data?.events?.length ? (
              <div style={{ padding: 32, textAlign: 'center', color: BRAND.grey, fontSize: 14 }}>Aucun événement avec des données.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: BRAND.bgSubtle }}>
                    {['Événement', 'Date', 'Statut', 'Commandes', 'CA TTC', 'CA HT', 'TVA'].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Événement' || h === 'Date' || h === 'Statut' ? 'left' : 'right', fontWeight: 700, color: BRAND.inkSoft, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${BRAND.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((ev, i) => {
                    const ht = ev.caHtCents;
                    const tvEv = ev.caTtcCents - ht;
                    const st = STATUS_STYLE[ev.status] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft, label: ev.status };
                    return (
                      <tr key={ev.id} style={{ borderBottom: i < data.events.length - 1 ? `1px solid ${BRAND.border}` : 'none', background: i % 2 === 1 ? BRAND.bg : BRAND.surface }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: BRAND.ink, maxWidth: 200 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</div>
                        </td>
                        <td style={{ padding: '12px 16px', color: BRAND.inkSoft, whiteSpace: 'nowrap' }}>{formatDate(ev.startAt)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: BRAND.ink }}>{INT.format(ev.ordersCount)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: BRAND.ink }}>{euros(ev.caTtcCents)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{euros(ht)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: BRAND.inkSoft }}>{euros(tvEv)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: BRAND.bgSubtle, borderTop: `2px solid ${BRAND.border}` }}>
                    <td colSpan={3} style={{ padding: '12px 16px', fontWeight: 800, color: BRAND.ink, fontSize: 13 }}>TOTAL</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: BRAND.ink }}>{INT.format(nbOrders)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: BRAND.ink }}>{euros(totalTtc)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{euros(totalHt)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: BRAND.inkSoft }}>{euros(tva)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <p style={{ fontSize: 11.5, color: BRAND.grey, marginTop: 12, lineHeight: 1.5 }}>
            * Seules les commandes avec paiement confirmé (PAID, ACCEPTED, PREPARING, READY, PICKED_UP, COMPLETED) entrent dans le calcul du CA.
            Les commandes annulées ou remboursées sont exclues.
          </p>
        </>
      )}
    </div>
  );
}
