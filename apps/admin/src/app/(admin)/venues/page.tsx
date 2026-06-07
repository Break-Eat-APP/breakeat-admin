'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiGetVenues, apiCreateVenue, type Venue, getOrgId } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  ACTIVE:   { bg: '#d1fae5', color: '#065f46' },
  INACTIVE: { bg: BRAND.border, color: BRAND.grey },
};

interface CreateForm { name: string; address: string; timezone: string }
const EMPTY_FORM: CreateForm = { name: '', address: '', timezone: '' };

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const orgId = getOrgId();

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGetVenues(orgId);
      setVenues(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      await apiCreateVenue(orgId, {
        name: form.name.trim(),
        address: form.address.trim(),
        timezone: form.timezone.trim() || undefined,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreating(false);
    }
  }

  if (!orgId) return (
    <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>
      Aucune organisation sélectionnée. Reconnectez-vous.
    </div>
  );

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: BRAND.ink, margin: 0 }}>🏟️ Lieux</h1>
          <p style={{ color: BRAND.grey, fontSize: 14, margin: '4px 0 0' }}>
            {venues.length} lieu{venues.length !== 1 ? 'x' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); setCreateError(''); }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.orangeDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.orange; }}
          style={{ background: BRAND.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s ease' }}
        >
          {showForm ? '✕ Annuler' : '+ Nouveau lieu'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          style={{ background: BRAND.bg, borderRadius: 12, padding: 24, boxShadow: BRAND.shadowSoft, marginBottom: 24, border: `2px solid ${BRAND.orange}` }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, margin: '0 0 16px' }}>Créer un lieu</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={lbl}>Nom du lieu *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Patinoire des Spartiates"
                required
                style={inp}
              />
            </div>
            <div>
              <label style={lbl}>Timezone</label>
              <input
                type="text"
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                placeholder="Europe/Paris"
                style={inp}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Adresse *</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="1 Rue du Sport, 75001 Paris"
                required
                style={inp}
              />
            </div>
          </div>
          {createError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{createError}</div>}
          <button
            type="submit"
            disabled={creating}
            style={{ marginTop: 16, background: creating ? BRAND.grey : BRAND.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
          >
            {creating ? 'Création…' : 'Créer'}
          </button>
        </form>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
      ) : venues.length === 0 ? (
        <div style={{ background: BRAND.bg, borderRadius: 12, padding: 40, textAlign: 'center', color: BRAND.grey, boxShadow: '0 1px 3px rgba(28,25,23,0.06)', border: `1px solid ${BRAND.border}` }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏟️</div>
          <div style={{ fontWeight: 600 }}>Aucun lieu</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Créez votre premier lieu ci-dessus.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {venues.map((v) => {
            const st = STATUS_STYLE[v.status] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft };
            return (
              <div
                key={v.id}
                style={{ background: BRAND.bg, borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(28,25,23,0.06)', border: `1px solid ${BRAND.border}`, display: 'flex', alignItems: 'center', gap: 16 }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.ink }}>{v.name}</div>
                  <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>{v.address}</div>
                  <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 2, fontFamily: 'monospace' }}>{v.id}</div>
                </div>
                <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 600 }}>
                  {v.status}
                </span>
                <button
                  onClick={() => void navigator.clipboard?.writeText(v.id)}
                  title="Copier l'ID"
                  style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: BRAND.inkSoft, fontFamily: 'inherit' }}
                >
                  📋 Copier ID
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
