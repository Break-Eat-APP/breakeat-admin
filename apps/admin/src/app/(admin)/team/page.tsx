'use client';

import { useEffect, useState, useCallback } from 'react';
import { Store } from 'lucide-react';
import {
  apiGetOrgMembers,
  apiInviteMember,
  apiRemoveMember,
  apiGetSuppliers,
  getOrgId,
  type OrgMemberWithUser,
  type Supplier,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { value: 'OPERATOR', label: 'Opérateur' },
  { value: 'MANAGER',  label: 'Manager' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'ORG_ADMIN', label: 'Admin organisation' },
];

// Role badges stay categorical so the four roles read apart at a glance.
// OPERATOR — the brand's core role — wears the Break Eat orange.
const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  ORG_ADMIN: { bg: '#fef3c7', color: '#92400e' },
  MANAGER:   { bg: '#ede9fe', color: '#5b21b6' },
  OPERATOR:  { bg: BRAND.orangeTint, color: BRAND.orangeDark },
  MARKETING: { bg: '#d1fae5', color: '#065f46' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const s = ROLE_STYLE[role] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft };
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 12,
        fontWeight: 700,
        display: 'inline-block',
      }}
    >
      {ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role}
    </span>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        background: '#fee2e2',
        border: '1px solid #fca5a5',
        borderRadius: 8,
        padding: '12px 16px',
        color: '#dc2626',
        fontSize: 14,
        marginBottom: 16,
      }}
    >
      {msg}
    </div>
  );
}

function SuccessBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        background: '#d1fae5',
        border: '1px solid #6ee7b7',
        borderRadius: 8,
        padding: '12px 16px',
        color: '#065f46',
        fontSize: 14,
        marginBottom: 16,
      }}
    >
      {msg}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const orgId = getOrgId();

  const [members, setMembers] = useState<OrgMemberWithUser[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('OPERATOR');
  const [inviteSupplierId, setInviteSupplierId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Remove state
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const [membersData, suppliersData] = await Promise.all([
        apiGetOrgMembers(orgId),
        apiGetSuppliers(orgId),
      ]);
      setMembers(membersData);
      setSuppliers(suppliersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setInviting(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      const body: { email: string; role: string; supplierId?: string } = {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
      };
      if (inviteRole === 'OPERATOR' && inviteSupplierId) {
        body.supplierId = inviteSupplierId;
      }
      const newMember = await apiInviteMember(orgId, body);
      setInviteSuccess(`${newMember.user.displayName} (${newMember.user.email}) ajouté avec succès.`);
      setInviteEmail('');
      setInviteRole('OPERATOR');
      setInviteSupplierId('');
      await loadData();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erreur lors de l\'invitation');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(memberId: string, email: string) {
    if (!orgId) return;
    if (!confirm(`Retirer ${email} de l'organisation ?`)) return;
    setRemovingId(memberId);
    try {
      await apiRemoveMember(orgId, memberId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setRemovingId(null);
    }
  }

  if (!orgId) {
    return (
      <div style={{ padding: 32, color: BRAND.grey, fontFamily: BRAND.font }}>
        Aucune organisation sélectionnée. Connectez-vous d&apos;abord.
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 960, fontFamily: BRAND.font }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: '0 0 4px', letterSpacing: -0.3 }}>
          Équipe
        </h1>
        <p style={{ color: BRAND.grey, fontSize: 14, margin: 0 }}>
          Gérez les membres et leurs accès. Les opérateurs peuvent être assignés à un fournisseur spécifique.
        </p>
      </div>

      {/* Error */}
      {error && <ErrorBanner msg={error} />}

      {/* ── Invite form ─────────────────────────────────────────── */}
      <div
        style={{
          background: BRAND.surface,
          borderRadius: 12,
          padding: 24,
          boxShadow: BRAND.shadowCard,
          marginBottom: 24,
          border: `1px solid ${BRAND.border}`,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: '0 0 16px' }}>
          Inviter un membre
        </h2>

        {inviteError && <ErrorBanner msg={inviteError} />}
        {inviteSuccess && <SuccessBanner msg={inviteSuccess} />}

        <form onSubmit={handleInvite}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12,
              marginBottom: 12,
            }}
          >
            {/* Email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>
                Email du compte
              </label>
              <input
                type="email"
                placeholder="jean.dupont@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                style={{
                  padding: '9px 12px',
                  borderRadius: 7,
                  border: `1.5px solid ${BRAND.border}`,
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Role */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>Rôle</label>
              <select
                value={inviteRole}
                onChange={(e) => {
                  setInviteRole(e.target.value);
                  if (e.target.value !== 'OPERATOR') setInviteSupplierId('');
                }}
                style={{
                  padding: '9px 12px',
                  borderRadius: 7,
                  border: `1.5px solid ${BRAND.border}`,
                  fontSize: 14,
                  background: BRAND.surface,
                  fontFamily: 'inherit',
                }}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Supplier — only for OPERATOR */}
            {inviteRole === 'OPERATOR' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>
                  Fournisseur assigné
                </label>
                <select
                  value={inviteSupplierId}
                  onChange={(e) => setInviteSupplierId(e.target.value)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 7,
                    border: `1.5px solid ${BRAND.border}`,
                    fontSize: 14,
                    background: BRAND.surface,
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">— Aucun fournisseur assigné —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              disabled={inviting}
              onMouseEnter={(e) => { if (!inviting) e.currentTarget.style.background = BRAND.orangeDark; }}
              onMouseLeave={(e) => { if (!inviting) e.currentTarget.style.background = BRAND.orange; }}
              style={{
                background: inviting ? BRAND.grey : BRAND.orange,
                color: '#fff',
                border: 'none',
                borderRadius: 7,
                padding: '10px 20px',
                fontWeight: 700,
                fontSize: 14,
                cursor: inviting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.15s ease',
              }}
            >
              {inviting ? 'Invitation…' : '+ Inviter'}
            </button>
            <span style={{ fontSize: 12, color: BRAND.grey }}>
              L&apos;utilisateur doit déjà avoir un compte Break Eat.
            </span>
          </div>
        </form>
      </div>

      {/* ── Members list ────────────────────────────────────────── */}
      <div
        style={{
          background: BRAND.surface,
          borderRadius: 12,
          boxShadow: BRAND.shadowCard,
          border: `1px solid ${BRAND.border}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${BRAND.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: 0 }}>
            Membres ({loading ? '…' : members.length})
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: 32, color: BRAND.grey, textAlign: 'center', fontSize: 14 }}>
            Chargement…
          </div>
        ) : members.length === 0 ? (
          <div style={{ padding: 32, color: BRAND.grey, textAlign: 'center', fontSize: 14 }}>
            Aucun membre. Utilisez le formulaire ci-dessus pour en ajouter.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: BRAND.bgSubtle }}>
                {['Membre', 'Email', 'Rôle', 'Fournisseur assigné', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '10px 20px',
                      color: BRAND.grey,
                      fontWeight: 600,
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderBottom: `1px solid ${BRAND.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  style={{ borderBottom: `1px solid ${BRAND.border}` }}
                >
                  {/* Name */}
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ fontWeight: 600, color: BRAND.ink, fontSize: 14 }}>
                      {m.user.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 2 }}>
                      {m.user.globalRole === 'SUPER_ADMIN' ? 'Super Admin' : ''}
                    </div>
                  </td>

                  {/* Email */}
                  <td style={{ padding: '14px 20px', color: BRAND.inkSoft }}>
                    {m.user.email}
                  </td>

                  {/* Role */}
                  <td style={{ padding: '14px 20px' }}>
                    <RoleBadge role={m.orgRole} />
                  </td>

                  {/* Assigned supplier */}
                  <td style={{ padding: '14px 20px' }}>
                    {m.supplier ? (
                      <span
                        style={{
                          background: BRAND.orangeTint,
                          color: BRAND.orangeDark,
                          borderRadius: 6,
                          padding: '3px 10px',
                          fontSize: 12,
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Store size={13} strokeWidth={2} />
                        {m.supplier.name}
                      </span>
                    ) : (
                      <span style={{ color: BRAND.grey, fontSize: 13 }}>—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    <button
                      onClick={() => void handleRemove(m.id, m.user.email)}
                      disabled={removingId === m.id}
                      style={{
                        background: 'transparent',
                        border: '1px solid #fca5a5',
                        borderRadius: 6,
                        color: '#ef4444',
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: removingId === m.id ? 'not-allowed' : 'pointer',
                        opacity: removingId === m.id ? 0.5 : 1,
                        fontFamily: 'inherit',
                      }}
                    >
                      {removingId === m.id ? 'Retrait…' : 'Retirer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
