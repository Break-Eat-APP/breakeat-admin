'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  apiGetGroup,
  apiUpdateGroup,
  apiDeleteGroup,
  apiGetGroupMembers,
  apiAddGroupMember,
  apiRemoveGroupMember,
  type Group,
  type GroupMember,
  getOrgId,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Components ───────────────────────────────────────────────────────────────

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: BRAND.surface,
        borderRadius: 12,
        padding: 24,
        boxShadow: BRAND.shadowCard,
        border: `1px solid ${BRAND.border}`,
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.id as string;
  const orgId = getOrgId();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emailDomain, setEmailDomain] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaError, setMetaError] = useState('');
  const [metaSuccess, setMetaSuccess] = useState('');

  // Add member
  const [memberEmail, setMemberEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Delete group
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const [g, mem] = await Promise.all([
        apiGetGroup(orgId, groupId),
        apiGetGroupMembers(orgId, groupId),
      ]);
      setGroup(g);
      setName(g.name);
      setDescription(g.description ?? '');
      setEmailDomain(g.emailDomain ?? '');
      setMembers(Array.isArray(mem) ? mem : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId, groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    setSavingMeta(true);
    setMetaError('');
    setMetaSuccess('');
    try {
      const domain = emailDomain.trim().replace(/^@/, '').toLowerCase();
      const updated = await apiUpdateGroup(orgId, groupId, {
        name: name.trim(),
        description: description.trim(),
        emailDomain: domain,
      });
      setGroup(updated);
      setMetaSuccess('Groupe mis à jour.');
      // Domain may have backfilled new members — refresh the list.
      await load();
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError('');
    try {
      await apiAddGroupMember(orgId, groupId, memberEmail.trim());
      setMemberEmail('');
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    try {
      await apiRemoveGroupMember(orgId, groupId, userId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleDeleteGroup() {
    if (!confirm('Supprimer ce groupe ? Les liens vers les événements privés seront retirés.')) {
      return;
    }
    setDeleting(true);
    try {
      await apiDeleteGroup(orgId, groupId);
      router.push('/groups');
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
  if (error && !group) {
    return (
      <Shell>
        <ErrBanner msg={error} />
      </Shell>
    );
  }
  if (!group) return null;

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Breadcrumb */}
      <Link
        href="/groups"
        style={{ fontSize: 13, color: BRAND.grey, textDecoration: 'none' }}
      >
        ← Tous les groupes
      </Link>

      {/* Header */}
      <div style={{ margin: '12px 0 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0 }}>{group.name}</h1>
        {group.emailDomain && (
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
            @{group.emailDomain}
          </span>
        )}
      </div>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <ErrBanner msg={error} />
        </div>
      )}

      {/* Edit metadata */}
      <Card title="Détails du groupe">
        <form onSubmit={handleSaveMeta} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Nom *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Domaine email (auto-rattachement)</label>
            <input
              type="text"
              value={emailDomain}
              onChange={(e) => setEmailDomain(e.target.value)}
              placeholder="club-sportif.fr"
              maxLength={120}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: BRAND.grey }}>
              Laisser vide pour un rattachement manuel uniquement.
            </div>
          </div>
          {metaError && <div style={{ color: '#dc2626', fontSize: 13 }}>{metaError}</div>}
          {metaSuccess && <div style={{ color: '#16a34a', fontSize: 13 }}>{metaSuccess}</div>}
          <div>
            <button
              type="submit"
              disabled={savingMeta}
              onMouseEnter={(e) => {
                if (!savingMeta) e.currentTarget.style.background = BRAND.orangeDark;
              }}
              onMouseLeave={(e) => {
                if (!savingMeta) e.currentTarget.style.background = BRAND.orange;
              }}
              style={{
                background: savingMeta ? BRAND.grey : BRAND.orange,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '9px 20px',
                fontWeight: 600,
                fontSize: 13,
                cursor: savingMeta ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.15s ease',
              }}
            >
              {savingMeta ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Card>

      {/* Members */}
      <Card title={`Membres (${members.length})`}>
        <form onSubmit={handleAddMember} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="email"
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            placeholder="email@membre.fr"
            required
            style={{ flex: 1, minWidth: 220, ...inputStyle }}
          />
          <button
            type="submit"
            disabled={adding || !memberEmail.trim()}
            onMouseEnter={(e) => {
              if (!(adding || !memberEmail.trim())) e.currentTarget.style.background = BRAND.orangeDark;
            }}
            onMouseLeave={(e) => {
              if (!(adding || !memberEmail.trim())) e.currentTarget.style.background = BRAND.orange;
            }}
            style={{
              background: adding ? BRAND.grey : BRAND.orange,
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '9px 18px',
              fontWeight: 600,
              fontSize: 13,
              cursor: adding || !memberEmail.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.15s ease',
            }}
          >
            {adding ? 'Ajout…' : '+ Ajouter'}
          </button>
        </form>
        {addError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{addError}</div>}
        <p style={{ fontSize: 12, color: BRAND.grey, margin: '0 0 16px' }}>
          L&apos;utilisateur doit déjà avoir un compte Break Eat. L&apos;ajout manuel échoue
          sinon (404).
        </p>

        {members.length === 0 ? (
          <p style={{ color: BRAND.grey, fontSize: 14, margin: 0 }}>Aucun membre pour l&apos;instant.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((m) => (
              <div
                key={m.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: BRAND.bgSubtle,
                  borderRadius: 8,
                  border: `1px solid ${BRAND.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.ink }}>
                    {m.user.displayName}
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.grey }}>{m.user.email}</div>
                </div>
                <span
                  style={{
                    background: m.source === 'DOMAIN' ? BRAND.orangeTint : BRAND.border,
                    color: m.source === 'DOMAIN' ? BRAND.orange : BRAND.inkSoft,
                    borderRadius: 999,
                    padding: '2px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {m.source === 'DOMAIN' ? 'Domaine' : 'Manuel'}
                </span>
                <button
                  onClick={() => void handleRemoveMember(m.userId)}
                  style={{
                    background: 'none',
                    border: '1px solid #fca5a5',
                    color: '#dc2626',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Danger zone */}
      <Card title="Zone de danger">
        <p style={{ color: BRAND.grey, fontSize: 14, margin: '0 0 12px' }}>
          La suppression est définitive. Les membres et les liens vers les événements privés
          sont retirés.
        </p>
        <button
          onClick={() => void handleDeleteGroup()}
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
          {deleting ? 'Suppression…' : 'Supprimer le groupe'}
        </button>
      </Card>
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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: BRAND.inkSoft,
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
