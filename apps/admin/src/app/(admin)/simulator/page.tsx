'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  apiGetEvents,
  apiSimulatorSeed,
  apiSimulatorRush,
  apiSimulatorProgress,
  apiSimulatorRandomFailures,
  apiSimulatorClear,
  apiSimulatorStats,
  type AdminEvent,
  type SimulatorStats,
  getOrgId,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Stat bar ─────────────────────────────────────────────────────────────────

// Order-lifecycle colors — a functional legend shared with the operator screens.
const STATUS_COLOR: Record<string, string> = {
  PAID: '#3b82f6', ACCEPTED: '#8b5cf6', PREPARING: '#f59e0b',
  READY: '#10b981', PICKED_UP: '#06b6d4', COMPLETED: '#6b7280',
  RECOVERED: '#f97316', CANCELLED: '#ef4444',
};

function StatBar({ stats, total }: { stats: Record<string, number>; total: number }) {
  return (
    <div style={{ background: BRAND.bgSubtle, borderRadius: 10, padding: 20, border: `1px solid ${BRAND.border}` }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 12 }}>
        {total} commandes au total
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {Object.entries(stats).filter(([, v]) => v > 0).map(([status, count]) => (
          <div
            key={status}
            style={{
              background: STATUS_COLOR[status] ?? BRAND.grey,
              color: '#fff',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {status} : {count}
          </div>
        ))}
        {total === 0 && <span style={{ color: BRAND.grey, fontSize: 13 }}>Aucune commande</span>}
      </div>
    </div>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  label, onClick, color = BRAND.orange, disabled = false, loading = false,
}: {
  label: string; onClick: () => void; color?: string; disabled?: boolean; loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        background: disabled || loading ? BRAND.border : color,
        color: disabled || loading ? BRAND.grey : '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '10px 20px',
        fontWeight: 600,
        fontSize: 14,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.1s',
        fontFamily: 'inherit',
      }}
    >
      {loading ? '…' : label}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const searchParams = useSearchParams();
  const orgId = getOrgId();

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(searchParams.get('eventId') ?? '');
  const [stats, setStats] = useState<SimulatorStats | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [seedCount, setSeedCount] = useState(20);
  const [rushCount, setRushCount] = useState(10);
  const [failRate, setFailRate] = useState(0.2);
  const [error, setError] = useState('');

  // Load events for selector
  useEffect(() => {
    if (!orgId) return;
    void apiGetEvents(orgId).then((ev) => setEvents(Array.isArray(ev) ? ev : [])).catch(() => {});
  }, [orgId]);

  const loadStats = useCallback(async () => {
    if (!selectedEventId) return;
    try {
      const s = await apiSimulatorStats(selectedEventId);
      setStats(s);
    } catch {
      setStats(null);
    }
  }, [selectedEventId]);

  useEffect(() => { void loadStats(); }, [loadStats]);

  function addLog(msg: string) {
    setLog((prev) => [`[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`, ...prev.slice(0, 49)]);
  }

  async function run(label: string, fn: () => Promise<string>) {
    if (!selectedEventId) { setError('Sélectionnez un événement'); return; }
    setBusy(label);
    setError('');
    try {
      const msg = await fn();
      addLog(`✓ ${label} — ${msg}`);
      await loadStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      addLog(`✗ ${label} — ${msg}`);
      setError(msg);
    } finally {
      setBusy(null);
    }
  }

  const disabled = !selectedEventId;

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: '0 0 8px', letterSpacing: -0.3 }}>
        Simulateur
      </h1>
      <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 24, background: '#fee2e2', borderRadius: 6, padding: '8px 12px', display: 'inline-block' }}>
        ⚠️ Réservé aux environnements <strong>DEMO_MODE=true</strong>. Ne jamais utiliser en production.
      </p>

      {/* Event selector */}
      <div style={{ background: BRAND.surface, borderRadius: 12, padding: 20, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}`, marginBottom: 24 }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: BRAND.inkSoft, marginBottom: 8 }}>
          Événement cible
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={{ flex: 1, padding: '9px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, background: BRAND.surface, fontFamily: 'inherit' }}
          >
            <option value="">Sélectionner un événement…</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name} ({ev.status})</option>
            ))}
          </select>
          <input
            type="text"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            placeholder="ou coller un UUID directement"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'monospace' }}
          />
          <ActionBtn label="Stats" onClick={() => void loadStats()} disabled={!selectedEventId} color={BRAND.inkSoft} />
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ marginBottom: 24 }}>
          <StatBar stats={stats.stats} total={stats.total} />
        </div>
      )}

      {/* Error */}
      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}

      {/* Actions grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

        {/* Seed */}
        <div style={{ background: BRAND.surface, borderRadius: 12, padding: 20, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: BRAND.ink }}>Seed</div>
          <p style={{ fontSize: 13, color: BRAND.grey, margin: '0 0 12px' }}>
            Crée un mix d&apos;ordres à différents stades du cycle de vie.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 13, color: BRAND.inkSoft, flexShrink: 0 }}>Nombre :</label>
            <input
              type="number"
              value={seedCount}
              onChange={(e) => setSeedCount(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={200}
              style={{ width: 70, padding: '6px 8px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, fontFamily: 'inherit' }}
            />
          </div>
          <ActionBtn
            label="Lancer Seed"
            loading={busy === 'seed'}
            disabled={disabled}
            color={BRAND.orange}
            onClick={() => void run('seed', async () => {
              const r = await apiSimulatorSeed(selectedEventId, seedCount);
              return `${r.created} commandes créées`;
            })}
          />
        </div>

        {/* Rush */}
        <div style={{ background: BRAND.surface, borderRadius: 12, padding: 20, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: BRAND.ink }}>Rush</div>
          <p style={{ fontSize: 13, color: BRAND.grey, margin: '0 0 12px' }}>
            Injecte N commandes PAID simultanément pour simuler un rush.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 13, color: BRAND.inkSoft, flexShrink: 0 }}>Nombre :</label>
            <input
              type="number"
              value={rushCount}
              onChange={(e) => setRushCount(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={500}
              style={{ width: 70, padding: '6px 8px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, fontFamily: 'inherit' }}
            />
          </div>
          <ActionBtn
            label="Lancer Rush"
            loading={busy === 'rush'}
            disabled={disabled}
            color="#7c3aed"
            onClick={() => void run('rush', async () => {
              const r = await apiSimulatorRush(selectedEventId, rushCount);
              return `${r.created} commandes créées`;
            })}
          />
        </div>

        {/* Progress */}
        <div style={{ background: BRAND.surface, borderRadius: 12, padding: 20, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: BRAND.ink }}>Progresser</div>
          <p style={{ fontSize: 13, color: BRAND.grey, margin: '0 0 16px' }}>
            Avance toutes les commandes actives d&apos;une étape dans le cycle de vie.
          </p>
          <ActionBtn
            label="Progresser toutes"
            loading={busy === 'progress'}
            disabled={disabled}
            color="#059669"
            onClick={() => void run('progress', async () => {
              const r = await apiSimulatorProgress(selectedEventId);
              return `${r.progressed} commandes avancées`;
            })}
          />
        </div>

        {/* Random failures */}
        <div style={{ background: BRAND.surface, borderRadius: 12, padding: 20, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: BRAND.ink }}>Pannes aléatoires</div>
          <p style={{ fontSize: 13, color: BRAND.grey, margin: '0 0 12px' }}>
            Annule ou récupère aléatoirement une fraction des commandes actives.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 13, color: BRAND.inkSoft, flexShrink: 0 }}>Taux (0-1) :</label>
            <input
              type="number"
              value={failRate}
              onChange={(e) => setFailRate(Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))}
              min={0}
              max={1}
              step={0.1}
              style={{ width: 70, padding: '6px 8px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, fontFamily: 'inherit' }}
            />
          </div>
          <ActionBtn
            label="Pannes aléatoires"
            loading={busy === 'failures'}
            disabled={disabled}
            color="#d97706"
            onClick={() => void run('failures', async () => {
              const r = await apiSimulatorRandomFailures(selectedEventId, failRate);
              return `${r.cancelled} annulées, ${r.recovered} récupérées`;
            })}
          />
        </div>
      </div>

      {/* Clear */}
      <div style={{ background: BRAND.surface, borderRadius: 12, padding: 20, boxShadow: BRAND.shadowCard, marginBottom: 24, border: '2px solid #fee2e2' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#dc2626' }}>Nettoyer l&apos;événement</div>
        <p style={{ fontSize: 13, color: BRAND.grey, margin: '0 0 12px' }}>
          Supprime toutes les commandes de démo (<code>DEMO-*</code>) de l&apos;événement. Irréversible.
        </p>
        <ActionBtn
          label="Supprimer toutes les commandes DEMO"
          loading={busy === 'clear'}
          disabled={disabled}
          color="#dc2626"
          onClick={() => {
            if (!confirm('Supprimer toutes les commandes DEMO de cet événement ?')) return;
            void run('clear', async () => {
              const r = await apiSimulatorClear(selectedEventId);
              return `${r.deleted} commandes supprimées`;
            });
          }}
        />
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={{ background: BRAND.ink, borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.grey, marginBottom: 10 }}>
            Journal des opérations
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#d1fae5', lineHeight: 1.6 }}>
            {log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
