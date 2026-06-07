'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  apiGetOperatorScreen,
  apiUpdateOperatorScreen,
  apiDeleteOperatorScreen,
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
  templateToDraft,
  EMPTY_DRAFT,
  type ScreenDraft,
} from '@/components/operator-screens/screen-form';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperatorScreenDetailPage() {
  const params = useParams();
  const router = useRouter();
  const screenId = params.id as string;
  const orgId = getOrgId();

  const [template, setTemplate] = useState<OperatorScreenTemplate | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<ScreenDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const [t, sups, cats] = await Promise.all([
        apiGetOperatorScreen(orgId, screenId),
        apiGetSuppliers(orgId),
        apiGetCategories(orgId),
      ]);
      setTemplate(t);
      setDraft(templateToDraft(t));
      setSuppliers(Array.isArray(sups) ? sups : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId, screenId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setSaveError('Le nom est requis.');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const updated = await apiUpdateOperatorScreen(orgId, screenId, draftToInput(draft));
      setTemplate(updated);
      setDraft(templateToDraft(updated));
      setSaveSuccess('Écran mis à jour.');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce modèle d’écran ? Il sera retiré de tous les événements où il est appliqué.')) {
      return;
    }
    setDeleting(true);
    try {
      await apiDeleteOperatorScreen(orgId, screenId);
      router.push('/operator-screens');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setDeleting(false);
    }
  }

  if (!orgId) {
    return (
      <Shell>
        <ErrBanner msg="Aucune organisation sélectionnée. Reconnectez-vous." />
      </Shell>
    );
  }
  if (loading) return <Shell>Chargement…</Shell>;
  if (error && !template) {
    return (
      <Shell>
        <ErrBanner msg={error} />
      </Shell>
    );
  }
  if (!template) return null;

  const appliedCount = template._count?.eventScreens ?? 0;

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Breadcrumb */}
      <Link href="/operator-screens" style={{ fontSize: 13, color: BRAND.grey, textDecoration: 'none' }}>
        ← Tous les écrans
      </Link>

      {/* Header */}
      <div style={{ margin: '12px 0 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{template.icon || '🖥️'}</span>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: BRAND.ink, margin: 0 }}>{template.name}</h1>
        {!template.enabled && <span style={disabledBadge}>désactivé</span>}
      </div>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrBanner msg={error} />
        </div>
      )}

      {appliedCount > 0 && (
        <div style={infoBanner}>
          Appliqué à <strong>{appliedCount}</strong> événement{appliedCount > 1 ? 's' : ''}. Les
          changements ici s&apos;y répercutent (l&apos;ordre et l&apos;activation peuvent être
          ajustés par événement sur sa page).
        </div>
      )}

      {/* Edit form */}
      <Card title="Conditions d'affichage">
        <form onSubmit={handleSave}>
          <ScreenConditionsForm
            draft={draft}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            suppliers={suppliers}
            categories={categories}
          />
          {saveError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 14 }}>{saveError}</div>}
          {saveSuccess && <div style={{ color: '#16a34a', fontSize: 13, marginTop: 14 }}>{saveSuccess}</div>}
          <div style={{ marginTop: 18 }}>
            <button
              type="submit"
              disabled={saving}
              onMouseEnter={(e) => {
                if (!saving) e.currentTarget.style.background = BRAND.orangeDark;
              }}
              onMouseLeave={(e) => {
                if (!saving) e.currentTarget.style.background = BRAND.orange;
              }}
              style={{
                background: saving ? BRAND.grey : BRAND.orange,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 24px',
                fontWeight: 600,
                fontSize: 14,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.15s ease',
              }}
            >
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Card>

      {/* Danger zone */}
      <Card title="Zone de danger">
        <p style={{ color: BRAND.grey, fontSize: 14, margin: '0 0 12px' }}>
          La suppression est définitive. L&apos;écran est retiré de tous les événements où il est
          appliqué.
        </p>
        <button
          onClick={() => void handleDelete()}
          disabled={deleting}
          style={{
            background: '#fff',
            color: '#dc2626',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: '9px 18px',
            fontWeight: 600,
            fontSize: 13.5,
            cursor: deleting ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {deleting ? 'Suppression…' : "Supprimer l'écran"}
        </button>
      </Card>
    </div>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: BRAND.bg,
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(28,25,23,0.06)',
        border: `1px solid ${BRAND.border}`,
        marginBottom: 24,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, margin: '0 0 18px' }}>{title}</h2>
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 32, fontFamily: BRAND.font, color: BRAND.grey }}>{children}</div>;
}

function ErrBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        background: '#fee2e2',
        border: '1px solid #fca5a5',
        borderRadius: 8,
        padding: '12px 16px',
        color: '#dc2626',
        fontSize: 14,
      }}
    >
      {msg}
    </div>
  );
}

const disabledBadge: React.CSSProperties = {
  background: BRAND.border,
  color: BRAND.inkSoft,
  borderRadius: 999,
  padding: '2px 10px',
  fontSize: 11,
  fontWeight: 600,
};

const infoBanner: React.CSSProperties = {
  background: BRAND.orangeTint,
  color: BRAND.inkSoft,
  border: `1px solid ${BRAND.orangeSoft}`,
  borderRadius: 8,
  padding: '12px 16px',
  fontSize: 13,
  marginBottom: 24,
};
