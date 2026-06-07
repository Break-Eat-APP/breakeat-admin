'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  apiGetGroups,
  apiCreateGroup,
  type Group,
  getOrgId,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Create group form ──────────────────────────────────────────────────────

interface CreateForm {
  name: string;
  description: string;
  emailDomain: string;
}

const EMPTY_FORM: CreateForm = { name: '', description: '', emailDomain: '' };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const orgId = getOrgId();

  const loadGroups = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGetGroups(orgId);
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      // Normalise the domain: strip a leading @, lowercase. Empty → omit.
      const domain = form.emailDomain.trim().replace(/^@/, '').toLowerCase();
      await apiCreateGroup(orgId, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        emailDomain: domain || undefined,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadGroups();
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: BRAND.ink, margin: 0 }}>
            🏷️ Groupes
          </h1>
          <p style={{ color: BRAND.grey, fontSize: 14, margin: '4px 0 0' }}>
            {groups.length} groupe{groups.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = BRAND.orangeDark;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = BRAND.orange;
          }}
          style={{
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
          }}
        >
          {showForm ? '✕ Annuler' : '+ Nouveau groupe'}
        </button>
      </div>

      <p style={{ color: BRAND.grey, fontSize: 13, margin: '0 0 24px', maxWidth: 620 }}>
        Les groupes segmentent vos membres (ex. « Abonnés », « Staff »). Ils servent à
        donner un accès privé à certains événements. Un domaine email rattache
        automatiquement chaque utilisateur correspondant.
      </p>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          style={{
            background: BRAND.bg,
            borderRadius: 12,
            padding: 24,
            boxShadow: BRAND.shadowSoft,
            marginBottom: 24,
            border: `2px solid ${BRAND.orange}`,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, margin: '0 0 16px' }}>
            Créer un groupe
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Nom du groupe *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Abonnés saison 2026"
                required
                maxLength={80}
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Membres ayant un abonnement à l'année"
                maxLength={280}
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Domaine email (auto-rattachement)</label>
              <input
                type="text"
                value={form.emailDomain}
                onChange={(e) => setForm((f) => ({ ...f, emailDomain: e.target.value }))}
                placeholder="club-sportif.fr"
                maxLength={120}
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 4 }}>
                Optionnel. Tout utilisateur dont l&apos;email se termine par ce domaine
                rejoint le groupe automatiquement.
              </div>
            </div>
          </div>
          {createError && (
            <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{createError}</div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              type="submit"
              disabled={creating}
              style={{
                background: creating ? BRAND.grey : BRAND.orange,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 24px',
                fontWeight: 600,
                fontSize: 14,
                cursor: creating ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {creating ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            background: '#fee2e2',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
      ) : groups.length === 0 ? (
        <div
          style={{
            background: BRAND.bg,
            borderRadius: 12,
            padding: 40,
            textAlign: 'center',
            color: BRAND.grey,
            boxShadow: '0 1px 3px rgba(28,25,23,0.06)',
            border: `1px solid ${BRAND.border}`,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏷️</div>
          <div style={{ fontWeight: 600 }}>Aucun groupe</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Créez votre premier groupe ci-dessus.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: BRAND.bg,
                  borderRadius: 10,
                  padding: '16px 20px',
                  boxShadow: '0 1px 3px rgba(28,25,23,0.06)',
                  border: `1px solid ${BRAND.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.ink }}>{g.name}</div>
                  {g.description && (
                    <div
                      style={{
                        fontSize: 12,
                        color: BRAND.grey,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {g.description}
                    </div>
                  )}
                </div>
                {g.emailDomain ? (
                  <span
                    style={{
                      background: BRAND.orangeTint,
                      color: BRAND.orange,
                      borderRadius: 999,
                      padding: '3px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    @{g.emailDomain}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: BRAND.grey }}>Manuel uniquement</span>
                )}
                <span style={{ fontSize: 13, color: BRAND.inkSoft, minWidth: 86, textAlign: 'right' }}>
                  {g._count?.members ?? 0} membre{(g._count?.members ?? 0) !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 13, color: BRAND.inkSoft, minWidth: 80, textAlign: 'right' }}>
                  {g._count?.events ?? 0} évén.
                </span>
                <span style={{ color: BRAND.grey, fontSize: 18 }}>›</span>
              </div>
            </Link>
          ))}
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
  borderRadius: 6,
  border: `1px solid ${BRAND.border}`,
  fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
