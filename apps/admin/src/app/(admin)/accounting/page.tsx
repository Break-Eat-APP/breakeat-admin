'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, ShoppingBag, Receipt, BarChart2, Percent } from 'lucide-react';
import {
  apiGetOrgStats,
  apiGetPeriodStats,
  apiGetVenues,
  getOrgId,
  getOrgName,
  type OrgStatsOverview,
  type PeriodGranularity,
  type PeriodStats,
  type TrancheTva,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Formatters ──────────────────────────────────────────────────────────────

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const INT = new Intl.NumberFormat('fr-FR');

function euros(cents: number) { return EUR.format((cents ?? 0) / 100); }
function pct(a: number, b: number) { return b === 0 ? '—' : `${((a / b) * 100).toFixed(1)} %`; }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function pill(active: boolean): React.CSSProperties {
  return {
    background: active ? BRAND.orangeTint : BRAND.surface,
    border: `1px solid ${active ? BRAND.orange : BRAND.border}`,
    color: active ? BRAND.orange : BRAND.inkSoft,
    borderRadius: 999,
    padding: '5px 14px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

const GRANULARITES: { value: PeriodGranularity; label: string }[] = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

/** Libellé d'une tranche : le serveur ne renvoie qu'une date de début. */
function labelBucket(iso: string, g: PeriodGranularity) {
  const d = new Date(iso);
  if (g === 'month') {
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  if (g === 'week') {
    const fin = new Date(d);
    fin.setDate(fin.getDate() + 6);
    const fmt = (x: Date) => x.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    return `${fmt(d)} → ${fmt(fin)}`;
  }
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
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

// ─── Ventilation TVA ──────────────────────────────────────────────────────────

const COULEUR_TAUX: Record<number, string> = {
  550: '#059669',
  1000: '#0284c7',
  2000: '#7c3aed',
};

/**
 * Le chiffre d'affaires taux par taux.
 *
 * C'est la seule lecture qui permette de remplir une déclaration : la CA3 se
 * remplit par taux, pas en moyenne. Un total global à « 10 % » suffisait tant
 * que la buvette ne vendait que des sandwichs ; dès qu'elle sert une bière
 * (20 %) ou vend une bouteille capsulée à emporter (5,5 %), ce chiffre unique
 * est simplement faux — HT surévalué, TVA collectée sous-évaluée.
 */
function VentilationTva({ tranches }: { tranches: TrancheTva[] }) {
  const totalTtc = tranches.reduce((n, t) => n + t.ttcCents, 0);
  const totalHt = tranches.reduce((n, t) => n + t.htCents, 0);
  const totalTva = tranches.reduce((n, t) => n + t.tvaCents, 0);

  return (
    <div style={{ background: BRAND.surface, borderRadius: BRAND.radius.card, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}`, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ padding: '16px 22px', borderBottom: `1px solid ${BRAND.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Percent size={16} strokeWidth={2.2} color={BRAND.orange} />
        <h2 style={{ ...BRAND.sectionTitle, margin: 0 }}>TVA par taux</h2>
        <span style={{ color: BRAND.grey, fontSize: 12.5 }}>
          Le taux suit le produit : 5,5 % à emporter emballé, 10 % consommation immédiate, 20 % alcools.
        </span>
      </div>

      {tranches.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', color: BRAND.grey, fontSize: 14 }}>
          Aucune vente sur la période.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: BRAND.bgSubtle }}>
              {['Taux', 'Part du CA', 'CA TTC', 'CA HT (base imposable)', 'TVA collectée'].map((h) => (
                <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Taux' ? 'left' : 'right', fontWeight: 700, color: BRAND.inkSoft, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${BRAND.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tranches.map((t, i) => {
              const couleur = COULEUR_TAUX[t.vatRateBps] ?? BRAND.inkSoft;
              return (
                <tr key={t.vatRateBps} style={{ borderBottom: i < tranches.length - 1 ? `1px solid ${BRAND.border}` : 'none', background: i % 2 === 1 ? BRAND.bg : BRAND.surface }}>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: `${couleur}18`, color: couleur, borderRadius: 999, padding: '3px 12px', fontSize: 13, fontWeight: 800 }}>
                      {t.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: BRAND.inkSoft }}>{pct(t.ttcCents, totalTtc)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: BRAND.ink }}>{euros(t.ttcCents)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{euros(t.htCents)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: couleur }}>{euros(t.tvaCents)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: BRAND.bgSubtle, borderTop: `2px solid ${BRAND.border}` }}>
              <td colSpan={2} style={{ padding: '12px 16px', fontWeight: 800, color: BRAND.ink, fontSize: 13 }}>TOTAL</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: BRAND.ink }}>{euros(totalTtc)}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{euros(totalHt)}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: BRAND.ink }}>{euros(totalTva)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const orgId = getOrgId();
  const orgName = getOrgName();
  const [data, setData] = useState<OrgStatsOverview | null>(null);
  const [periods, setPeriods] = useState<PeriodStats | null>(null);
  const [granularity, setGranularity] = useState<PeriodGranularity>('day');
  /**
   * Lecture affichée. Le rythme du lieu décide du défaut : « par événement »
   * n'apprend rien sur un restaurant, « par période » masquerait le découpage
   * par match sur un stade. Les deux restent accessibles.
   */
  const [view, setView] = useState<'periods' | 'events' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!orgId) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const [stats, venues] = await Promise.all([
        apiGetOrgStats(orgId),
        // Le mode ne sert qu'à choisir la vue par défaut : son indisponibilité
        // ne doit pas priver le manager de ses chiffres.
        apiGetVenues(orgId).catch(() => []),
      ]);
      setData(stats);
      const permanent = Array.isArray(venues) && venues[0]?.operatingMode === 'PERMANENT';
      // Ne se recalcule qu'au premier chargement : un rafraîchissement ne doit
      // pas ramener le manager sur la vue qu'il vient de quitter.
      setView((v) => v ?? (permanent ? 'periods' : 'events'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId]);

  // Les tranches se rechargent seules quand la granularité change.
  useEffect(() => {
    if (!orgId || view !== 'periods') return;
    let annule = false;
    void apiGetPeriodStats(orgId, { granularity })
      .then((r) => { if (!annule) setPeriods(r); })
      .catch((err: unknown) => {
        if (!annule) setError(err instanceof Error ? err.message : 'Erreur de chargement');
      });
    return () => { annule = true; };
  }, [orgId, view, granularity]);

  useEffect(() => { void load(); }, [load]);

  if (!orgId) {
    return <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>Aucune organisation sélectionnée.</div>;
  }

  // La ventilation suit la vue : « par période » lit la fenêtre choisie,
  // « par événement » lit tout l'historique. Afficher le total de toujours
  // sous un tableau des trente derniers jours ferait dire au gérant que ses
  // chiffres ne tombent pas juste.
  const source = view === 'periods' && periods ? periods : data;
  const totalTtc = source?.revenue?.caTtcCents ?? 0;
  const totalHt  = source?.revenue?.caHtCents ?? 0;
  const tva = totalTtc - totalHt;
  const tranches = source?.revenue?.vatBreakdown ?? [];
  const sousTitreTva =
    tranches.length > 1
      ? `${tranches.map((t) => t.label).join(' · ')} — détail ci-dessous`
      : `≈ ${pct(tva, totalTtc)} du CA TTC`;
  const avgBasket = source?.averageBasket?.ttcCents ?? 0;
  const nbOrders = source?.ordersCount ?? 0;
  // Le pied du tableau « par événement » totalise TOUS les événements, quelle
  // que soit la fenêtre choisie plus haut : c'est sa propre somme.
  const totalTtcEvenements = data?.revenue?.caTtcCents ?? 0;
  const totalHtEvenements = data?.revenue?.caHtCents ?? 0;
  const nbOrdersEvenements = data?.ordersCount ?? 0;

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0, letterSpacing: -0.3 }}>Comptabilité</h1>
          <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: '6px 0 0', lineHeight: 1.55 }}>
            Chiffre d&apos;affaires, TVA et commandes — consolidés sur l&apos;ensemble des événements de <strong>{orgName ?? 'l\'organisation'}</strong>.
            La TVA est calculée <strong>produit par produit</strong> : 5,5 %, 10 % ou 20 % selon ce qui est vendu.
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
            <KpiCard icon={Receipt} label="CA HT total" value={euros(totalHt)} sub="Base imposable, TVA exclue" accent="#059669" />
            <KpiCard icon={BarChart2} label="TVA collectée" value={euros(tva)} sub={sousTitreTva} accent="#7c3aed" />
            <KpiCard icon={ShoppingBag} label="Commandes" value={INT.format(nbOrders)} sub={avgBasket ? `Panier moyen ${euros(avgBasket)}` : undefined} accent="#0284c7" />
          </div>

          {/* La ventilation par taux — la lecture qui sert à déclarer. */}
          <VentilationTva tranches={tranches} />

          {/* Détail — par période ou par événement */}
          <div style={{ background: BRAND.surface, borderRadius: BRAND.radius.card, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${BRAND.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <h2 style={{ ...BRAND.sectionTitle, margin: 0 }}>
                {view === 'periods' ? 'Détail par période' : 'Détail par événement'}
              </h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {view === 'periods' &&
                  GRANULARITES.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => setGranularity(g.value)}
                      style={pill(granularity === g.value)}
                    >
                      {g.label}
                    </button>
                  ))}
                <button
                  onClick={() => setView(view === 'periods' ? 'events' : 'periods')}
                  style={{ ...pill(false), marginLeft: 8, color: BRAND.orange, borderColor: BRAND.orange }}
                >
                  {view === 'periods' ? 'Voir par événement' : 'Voir par période'}
                </button>
              </div>
            </div>

            {view === 'periods' ? (
              !periods ? (
                <div style={{ padding: 32, textAlign: 'center', color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ background: BRAND.bgSubtle }}>
                      {['Période', 'Commandes', 'CA TTC', 'CA HT', 'TVA'].map((h) => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Période' ? 'left' : 'right', fontWeight: 700, color: BRAND.inkSoft, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${BRAND.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.buckets.map((b, i) => {
                      const tvB = b.caTtcCents - b.caHtCents;
                      // Une tranche sans vente reste affichée, en gris : c'est
                      // une information, pas un trou dans le tableau.
                      const creux = b.ordersCount === 0;
                      return (
                        <tr key={b.startAt} style={{ borderBottom: i < periods.buckets.length - 1 ? `1px solid ${BRAND.border}` : 'none', background: i % 2 === 1 ? BRAND.bg : BRAND.surface }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: creux ? BRAND.grey : BRAND.ink, whiteSpace: 'nowrap' }}>
                            {labelBucket(b.startAt, periods.granularity)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: creux ? BRAND.grey : BRAND.ink }}>{INT.format(b.ordersCount)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: creux ? BRAND.grey : BRAND.ink }}>{euros(b.caTtcCents)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: creux ? BRAND.grey : '#059669' }}>{euros(b.caHtCents)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', color: BRAND.inkSoft }}>{euros(tvB)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: BRAND.bgSubtle, borderTop: `2px solid ${BRAND.border}` }}>
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: BRAND.ink, fontSize: 13 }}>
                        TOTAL — {formatDate(periods.from)} → {formatDate(periods.to)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: BRAND.ink }}>{INT.format(periods.ordersCount)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: BRAND.ink }}>{euros(periods.revenue.caTtcCents)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{euros(periods.revenue.caHtCents)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: BRAND.inkSoft }}>
                        {euros(periods.revenue.caTtcCents - periods.revenue.caHtCents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )
            ) : !data?.events?.length ? (
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
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: BRAND.ink }}>{INT.format(nbOrdersEvenements)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: BRAND.ink }}>{euros(totalTtcEvenements)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{euros(totalHtEvenements)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: BRAND.inkSoft }}>{euros(totalTtcEvenements - totalHtEvenements)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          <p style={{ fontSize: 11.5, color: BRAND.grey, marginTop: 12, lineHeight: 1.5 }}>
            * Seules les commandes avec paiement confirmé (PAID, ACCEPTED, PREPARING, READY, PICKED_UP, COMPLETED) entrent dans le calcul du CA.
            Les commandes annulées ou remboursées sont exclues. Le taux de TVA appliqué est celui figé sur chaque
            ligne au moment du paiement : changer le taux d&apos;un produit aujourd&apos;hui ne modifie pas les
            commandes déjà passées. Les colonnes CA HT des tableaux ci-dessous sont indicatives — c&apos;est la
            ventilation par taux qui sert à déclarer.
          </p>
        </>
      )}
    </div>
  );
}
