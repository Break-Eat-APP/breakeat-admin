'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Store, ChevronRight } from 'lucide-react';
import { apiGetSuppliers, apiCreateSupplier, type Supplier, getOrgId } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// Statuts de buvette (alignés sur SupplierStatus backend).
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  OPEN: { bg: '#d1fae5', color: '#065f46', label: 'Ouverte' },
  CLOSED: { bg: BRAND.bgSubtle, color: BRAND.inkSoft, label: 'Fermée' },
  PAUSED: { bg: '#fef3c7', color: '#92400e', label: 'En pause' },
  OFFLINE: { bg: BRAND.border, color: BRAND.grey, label: 'Hors ligne' },
};

interface CreateForm {
  name: string;
  isExternal: boolean;
}
const EMPTY_FORM: CreateForm = { name: '', isExternal: false };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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
      const data = await apiGetSuppliers(orgId);
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      await apiCreateSupplier(orgId, { name: form.name.trim(), isExternal: form.isExternal });
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreating(false);
    }
  }

  if (!orgId) {
    return (
      <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>
        Aucune organisation sélectionnée. Reconnectez-vous.
      </div>
    );
  }

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0, letterSpacing: -0.3 }}>Buvettes</h1>
          <p style={{ color: BRAND.grey, fontSize: 14, margin: '4px 0 0' }}>
            {suppliers.length} buvette{suppliers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); setCreateError(''); }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.orangeDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.orange; }}
          style={{
            background: BRAND.orange,
            color: '#fff',
            border: 'none',
            borderRadius: BRAND.radius.control,
            padding: '10px 20px',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.15s ease',
            whiteSpace: 'nowrap',
            boxShadow: BRAND.shadowButton,
          }}
        >
          {showForm ? '✕ Annuler' : '+ Nouvelle buvette'}
        </button>
      </div>

      <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: '0 0 24px', maxWidth: 640, lineHeight: 1.55 }}>
        Configure tes buvettes (ou stands) <strong>une seule fois</strong> — nom, catégories, produits &amp; prix —
        puis rattache-les à chaque événement. Une buvette vit au niveau du club et peut servir <strong>plusieurs événements</strong>.
      </p>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          style={{
            background: BRAND.surface,
            borderRadius: BRAND.radius.card,
            padding: 24,
            boxShadow: BRAND.shadowSoft,
            marginBottom: 24,
            border: `2px solid ${BRAND.orange}`,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, margin: '0 0 16px' }}>Créer une buvette</h2>
          <div>
            <label style={labelStyle}>Nom de la buvette *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Buvette Nord"
              required
              maxLength={100}
              style={inputStyle}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isExternal} onChange={(e) => setForm((f) => ({ ...f, isExternal: e.target.checked }))} style={{ marginTop: 3 }} />
            <span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: BRAND.ink }}>Exploitant externe</span>
              <span style={{ display: 'block', fontSize: 12.5, color: BRAND.inkSoft, marginTop: 2, lineHeight: 1.5 }}>
                Food-truck, traiteur ou prestataire tiers. Un <strong>code de parrainage</strong> sera généré pour le rattacher.
              </span>
            </span>
          </label>
          {createError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{createError}</div>}
          <button
            type="submit"
            disabled={creating}
            style={{
              marginTop: 16,
              background: creating ? BRAND.grey : BRAND.orange,
              color: '#fff',
              border: 'none',
              borderRadius: BRAND.radius.control,
              padding: '10px 24px',
              fontWeight: 600,
              fontSize: 14,
              cursor: creating ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {creating ? 'Création…' : 'Créer la buvette'}
          </button>
        </form>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
      ) : suppliers.length === 0 ? (
        <div
          style={{
            background: BRAND.surface,
            borderRadius: BRAND.radius.card,
            padding: 40,
            textAlign: 'center',
            color: BRAND.grey,
            boxShadow: BRAND.shadowCard,
            border: `1px solid ${BRAND.border}`,
          }}
        >
          <div style={{ width: 52, height: 52, borderRadius: 15, background: BRAND.bgSubtle, color: BRAND.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Store size={24} strokeWidth={1.75} />
          </div>
          <div style={{ fontWeight: 600 }}>Aucune buvette</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Créez votre première buvette ci-dessus.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {suppliers.map((s) => {
            const st = STATUS_STYLE[s.status] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft, label: s.status };
            return (
              <Link key={s.id} href={`/suppliers/${s.id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    background: BRAND.surface,
                    borderRadius: 14,
                    padding: '16px 20px',
                    boxShadow: BRAND.shadowCard,
                    border: `1px solid ${BRAND.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s ease, transform 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = BRAND.shadowSoft; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = BRAND.shadowCard; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: BRAND.orangeTint, color: BRAND.orange, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Store size={19} strokeWidth={1.9} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {s.name}
                      {s.isExternal && (
                        <span style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>Exploitant externe</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
                      {s.isExternal && s.referralCode ? <>Code : <code style={{ fontWeight: 700, color: BRAND.inkSoft }}>{s.referralCode}</code></> : `${s.id.slice(0, 8)}…`}
                    </div>
                  </div>
                  <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {st.label}
                  </span>
                  <ChevronRight size={18} strokeWidth={2} color={BRAND.grey} style={{ flexShrink: 0 }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: BRAND.inkSoft,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: BRAND.radius.control,
  border: `1px solid ${BRAND.border}`,
  fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
