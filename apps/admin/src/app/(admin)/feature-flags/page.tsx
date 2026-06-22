'use client';

import { useEffect, useState, useCallback } from 'react';
import { Flag } from 'lucide-react';
import {
  apiGetFeatureFlags,
  apiSetFeatureFlag,
  apiDeleteFeatureFlag,
  type FeatureFlag,
  getOrgId,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

const SCOPES = ['GLOBAL', 'ORGANIZATION', 'EVENT'] as const;

const SCOPE_STYLE: Record<string, { bg: string; color: string }> = {
  GLOBAL:       { bg: '#e0e7ff', color: '#3730a3' },
  ORGANIZATION: { bg: '#dcfce7', color: '#166534' },
  EVENT:        { bg: '#fef9c3', color: '#854d0e' },
};

interface FlagForm {
  key: string;
  scope: string;
  scopeId: string;
  enabled: boolean;
}

const EMPTY_FORM: FlagForm = { key: '', scope: 'GLOBAL', scopeId: '', enabled: true };

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FlagForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [filterScope, setFilterScope] = useState<string>('');

  const orgId = getOrgId();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGetFeatureFlags(filterScope ? { scope: filterScope } : undefined);
      setFlags(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [filterScope]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      await apiSetFeatureFlag({
        key: form.key.trim(),
        scope: form.scope,
        scopeId: form.scope !== 'GLOBAL' && form.scopeId ? form.scopeId.trim() : undefined,
        enabled: form.enabled,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(flag: FeatureFlag) {
    try {
      await apiSetFeatureFlag({
        key: flag.key,
        scope: flag.scope,
        scopeId: flag.scopeId ?? undefined,
        enabled: !flag.enabled,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce flag ?')) return;
    try {
      await apiDeleteFeatureFlag(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0, letterSpacing: -0.3 }}>Feature Flags</h1>
          <p style={{ color: BRAND.grey, fontSize: 14, margin: '4px 0 0' }}>
            {flags.length} flag{flags.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); setSaveError(''); }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.orangeDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.orange; }}
          style={{ background: BRAND.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s ease' }}
        >
          {showForm ? '✕ Annuler' : '+ Nouveau flag'}
        </button>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['', ...SCOPES] as string[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterScope(s)}
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              border: '1px solid',
              borderColor: filterScope === s ? BRAND.orange : BRAND.border,
              background: filterScope === s ? BRAND.orangeTint : BRAND.bg,
              color: filterScope === s ? BRAND.orange : BRAND.grey,
              fontSize: 13,
              fontWeight: filterScope === s ? 600 : 400,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {s || 'Tous'}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleSave}
          style={{ background: BRAND.surface, borderRadius: 12, padding: 24, boxShadow: BRAND.shadowSoft, marginBottom: 24, border: `2px solid ${BRAND.orange}` }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: '0 0 16px' }}>
            Créer / mettre à jour un flag
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Clé (key) *</label>
              <input
                type="text"
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="nouvelle_fonctionnalite"
                required
                style={inp}
              />
            </div>
            <div>
              <label style={lbl}>Scope *</label>
              <select
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value, scopeId: '' }))}
                style={{ ...inp, background: BRAND.bg }}
              >
                {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {form.scope !== 'GLOBAL' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>
                  {form.scope === 'ORGANIZATION' ? 'Organisation ID' : 'Événement ID'} (UUID) *
                </label>
                <input
                  type="text"
                  value={form.scopeId}
                  onChange={(e) => setForm((f) => ({ ...f, scopeId: e.target.value }))}
                  placeholder={orgId || 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'}
                  style={{ ...inp, fontFamily: 'monospace', fontSize: 12 }}
                />
                {form.scope === 'ORGANIZATION' && orgId && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, scopeId: orgId }))}
                    style={{ marginTop: 4, fontSize: 12, color: BRAND.orange, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                  >
                    Utiliser mon org ({orgId.slice(0, 8)}…)
                  </button>
                )}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ ...lbl, margin: 0 }}>Activé</label>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: BRAND.orange }}
              />
              <span style={{ fontSize: 13, color: form.enabled ? '#16a34a' : BRAND.grey }}>
                {form.enabled ? 'Oui' : 'Non'}
              </span>
            </div>
          </div>
          {saveError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 10 }}>{saveError}</div>}
          <button
            type="submit"
            disabled={saving}
            style={{ marginTop: 16, background: saving ? BRAND.grey : BRAND.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}

      {/* Error */}
      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}

      {/* List */}
      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
      ) : flags.length === 0 ? (
        <div style={{ background: BRAND.surface, borderRadius: 12, padding: 40, textAlign: 'center', color: BRAND.grey, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}` }}>
          <div style={{ width: 52, height: 52, borderRadius: 15, background: BRAND.bgSubtle, color: BRAND.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Flag size={24} strokeWidth={1.75} />
          </div>
          <div style={{ fontWeight: 600 }}>Aucun feature flag</div>
        </div>
      ) : (
        <div style={{ background: BRAND.surface, borderRadius: 12, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BRAND.border}`, background: BRAND.bgSubtle }}>
                <th style={th}>Clé</th>
                <th style={th}>Scope</th>
                <th style={th}>Scope ID</th>
                <th style={th}>Activé</th>
                <th style={th}>Mis à jour</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => {
                const sStyle = SCOPE_STYLE[f.scope] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft };
                return (
                  <tr key={f.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                    <td style={td}>
                      <code style={{ background: BRAND.bgSubtle, padding: '2px 8px', borderRadius: 4, fontSize: 13 }}>{f.key}</code>
                    </td>
                    <td style={td}>
                      <span style={{ background: sStyle.bg, color: sStyle.color, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                        {f.scope}
                      </span>
                    </td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: BRAND.grey }}>
                      {f.scopeId ? f.scopeId.slice(0, 8) + '…' : '—'}
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => void handleToggle(f)}
                        style={{
                          background: f.enabled ? '#d1fae5' : '#fee2e2',
                          color: f.enabled ? '#065f46' : '#991b1b',
                          border: 'none',
                          borderRadius: 999,
                          padding: '3px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        {f.enabled ? '✓ Activé' : '✗ Désactivé'}
                      </button>
                    </td>
                    <td style={{ ...td, color: BRAND.grey, fontSize: 12 }}>
                      {new Date(f.updatedAt).toLocaleDateString('fr-FR')}
                    </td>
                    <td style={td}>
                      <button
                        onClick={() => void handleDelete(f.id)}
                        style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Suppr.
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 16px', color: BRAND.grey, fontWeight: 600, fontSize: 12 };
const td: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' };
