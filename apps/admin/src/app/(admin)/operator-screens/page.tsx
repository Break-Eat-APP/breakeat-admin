'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { MonitorSmartphone, ChevronRight } from 'lucide-react';
import {
  apiGetOperatorScreens,
  apiCreateOperatorScreen,
  apiGetSuppliers,
  apiGetCategories,
  getOrgId,
  type OperatorScreenTemplate,
  type Supplier,
  type Category,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import {
  ScreenConditionsForm,
  draftToInput,
  EMPTY_DRAFT,
  KIND_LABELS,
  type ScreenDraft,
} from '@/components/operator-screens/screen-form';

// ─── Conditions summary (list cards) ────────────────────────────────────────────

function summarize(t: OperatorScreenTemplate): string {
  const parts: string[] = [];
  if (t.slotKinds.length) parts.push(`${t.slotKinds.length} créneau${t.slotKinds.length > 1 ? 'x' : ''}`);
  parts.push(t.statuses.length ? `${t.statuses.length} statut${t.statuses.length > 1 ? 's' : ''}` : 'statuts par défaut');
  parts.push(
    t.supplierIds.length
      ? `${t.supplierIds.length} fournisseur${t.supplierIds.length > 1 ? 's' : ''}`
      : 'tous fournisseurs',
  );
  if (t.filters?.categoryIds?.length) parts.push(`${t.filters.categoryIds.length} catégorie(s)`);
  if (t.filters?.showRecap) parts.push('récap');
  return parts.join(' · ');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperatorScreensPage() {
  const orgId = getOrgId();

  const [templates, setTemplates] = useState<OperatorScreenTemplate[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<ScreenDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const [tpls, sups, cats] = await Promise.all([
        apiGetOperatorScreens(orgId),
        apiGetSuppliers(orgId),
        apiGetCategories(orgId),
      ]);
      setTemplates(Array.isArray(tpls) ? tpls : []);
      setSuppliers(Array.isArray(sups) ? sups : []);
      setCategories(Array.isArray(cats) ? cats : []);
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
    if (!draft.name.trim()) {
      setCreateError('Le nom est requis.');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await apiCreateOperatorScreen(orgId, draftToInput(draft));
      setShowForm(false);
      setDraft(EMPTY_DRAFT);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0, letterSpacing: -0.3 }}>
            Écrans opérateur
          </h1>
          <p style={{ color: BRAND.grey, fontSize: 14, margin: '4px 0 0' }}>
            {templates.length} modèle{templates.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => {
            setDraft(EMPTY_DRAFT);
            setCreateError('');
            setShowForm((s) => !s);
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = BRAND.orangeDark)}
          onMouseLeave={(e) => (e.currentTarget.style.background = BRAND.orange)}
          style={primaryBtn}
        >
          {showForm ? '✕ Annuler' : '+ Nouvel écran'}
        </button>
      </div>

      <p style={{ color: BRAND.grey, fontSize: 13, margin: '0 0 24px', maxWidth: 680 }}>
        Les écrans sont des <strong>modèles réutilisables</strong> définis une fois pour
        l&apos;organisation (ex. « Buvette Spartiates — Immédiates »), puis appliqués à chaque
        événement depuis sa page. Les conditions d&apos;affichage (créneaux, statuts, fournisseurs,
        catégories) déterminent les commandes visibles sur le board opérateur.
      </p>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          style={{
            background: BRAND.surface,
            borderRadius: 12,
            padding: 24,
            boxShadow: BRAND.shadowSoft,
            marginBottom: 24,
            border: `2px solid ${BRAND.orange}`,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, margin: '0 0 18px' }}>
            Nouvel écran
          </h2>
          <ScreenConditionsForm
            draft={draft}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            suppliers={suppliers}
            categories={categories}
          />
          {createError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 14 }}>{createError}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button
              type="submit"
              disabled={creating}
              style={{ ...primaryBtn, background: creating ? BRAND.grey : BRAND.orange, cursor: creating ? 'not-allowed' : 'pointer' }}
            >
              {creating ? 'Création…' : "Créer l'écran"}
            </button>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <div style={errBanner}>{error}</div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
      ) : templates.length === 0 ? (
        <div style={emptyCard}>
          <div style={{ width: 52, height: 52, borderRadius: 15, background: BRAND.bgSubtle, color: BRAND.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <MonitorSmartphone size={24} strokeWidth={1.75} />
          </div>
          <div style={{ fontWeight: 600 }}>Aucun écran configuré</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Créez votre premier modèle d&apos;écran ci-dessus.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {templates.map((t) => (
            <Link key={t.id} href={`/operator-screens/${t.id}`} style={{ textDecoration: 'none' }}>
              <div style={listCard}>
                <div style={{ fontSize: 22, width: 28, textAlign: 'center' }}>{t.icon || '🖥️'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: BRAND.ink }}>{t.name}</span>
                    {!t.enabled && (
                      <span style={disabledBadge}>désactivé</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 3 }}>{summarize(t)}</div>
                </div>
                <span style={kindBadge}>{KIND_LABELS[t.kind]}</span>
                <span style={{ fontSize: 13, color: BRAND.inkSoft, minWidth: 86, textAlign: 'right' }}>
                  {t._count?.eventScreens ?? 0} évén.
                </span>
                <ChevronRight size={18} strokeWidth={2} color={BRAND.grey} style={{ flexShrink: 0 }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  background: BRAND.orange,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 20px',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s ease',
};

const listCard: React.CSSProperties = {
  background: BRAND.surface,
  borderRadius: 10,
  padding: '16px 20px',
  boxShadow: BRAND.shadowCard,
  border: `1px solid ${BRAND.border}`,
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  cursor: 'pointer',
};

const kindBadge: React.CSSProperties = {
  background: BRAND.orangeTint,
  color: BRAND.orange,
  borderRadius: 999,
  padding: '3px 12px',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const disabledBadge: React.CSSProperties = {
  background: BRAND.border,
  color: BRAND.inkSoft,
  borderRadius: 999,
  padding: '2px 10px',
  fontSize: 11,
  fontWeight: 600,
};

const errBanner: React.CSSProperties = {
  background: '#fee2e2',
  color: '#dc2626',
  padding: '12px 16px',
  borderRadius: 8,
  marginBottom: 16,
  fontSize: 14,
};

const emptyCard: React.CSSProperties = {
  background: BRAND.surface,
  borderRadius: 12,
  padding: 40,
  textAlign: 'center',
  color: BRAND.grey,
  boxShadow: BRAND.shadowCard,
  border: `1px solid ${BRAND.border}`,
};
