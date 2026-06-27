'use client';

import { useQuery } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import { apiGetKpis, formatEuros, type GlobalKpis } from '@/lib/api/backoffice-client';

export default function OverviewPage() {
  const { data, isLoading, isError, error } = useQuery<GlobalKpis>({
    queryKey: ['backoffice', 'kpis'],
    queryFn: apiGetKpis,
  });

  const vatPct = data ? Math.round(data.revenue.vatRate * 100) : 10;

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: BRAND.ink, margin: 0 }}>
          Vue d&apos;ensemble
        </h1>
        <p style={{ fontSize: 14, color: BRAND.grey, margin: '6px 0 0' }}>
          Indicateurs consolidés de toute la plateforme Break Eat.
        </p>
      </header>

      {isLoading && <Muted>Chargement des indicateurs…</Muted>}
      {isError && (
        <ErrorBox>
          {error instanceof Error ? error.message : 'Impossible de charger les indicateurs.'}
        </ErrorBox>
      )}

      {data && (
        <>
          {/* Revenue row */}
          <SectionTitle>Chiffre d&apos;affaires</SectionTitle>
          <Grid>
            <KpiCard
              label="CA total TTC"
              value={formatEuros(data.revenue.caTtcCents)}
              accent
            />
            <KpiCard
              label="CA total HT"
              value={formatEuros(data.revenue.caHtCents)}
              hint={`TVA ${vatPct}% (resto sur place)`}
            />
            <KpiCard label="Nombre de commandes" value={data.ordersCount.toLocaleString('fr-FR')} />
          </Grid>

          {/* Average basket row */}
          <SectionTitle>Panier moyen</SectionTitle>
          <Grid>
            <KpiCard label="Panier moyen TTC" value={formatEuros(data.averageBasket.ttcCents)} />
            <KpiCard label="Panier moyen HT" value={formatEuros(data.averageBasket.htCents)} />
          </Grid>

          {/* Platform row */}
          <SectionTitle>Plateforme</SectionTitle>
          <Grid>
            <KpiCard label="Comptes" value={data.accountsCount.toLocaleString('fr-FR')} />
            <KpiCard
              label="Organisations"
              value={data.organizationsCount.toLocaleString('fr-FR')}
            />
          </Grid>
        </>
      )}
    </div>
  );
}

// ─── Presentational helpers ──────────────────────────────────────────────────

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}
    >
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? BRAND.orangeTint : BRAND.surface,
        border: `1px solid ${accent ? BRAND.orangeSoft : BRAND.border}`,
        borderRadius: BRAND.radius.card,
        padding: '20px 22px',
        boxShadow: accent ? 'none' : BRAND.shadowCard,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: BRAND.grey,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: accent ? BRAND.orange : BRAND.ink,
          marginTop: 8,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: BRAND.inkSoft,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        margin: '0 0 12px',
      }}
    >
      {children}
    </h2>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 14, color: BRAND.grey }}>{children}</div>;
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#fef2f2',
        border: '1px solid #fca5a5',
        borderRadius: 10,
        padding: '12px 16px',
        color: '#dc2626',
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}
