'use client';

import { useEffect, useState, useCallback } from 'react';
import { Store } from 'lucide-react';
import {
  apiGetOrgMembers,
  apiInviteMember,
  apiRemoveMember,
  apiResetMemberPassword,
  apiGetSuppliers,
  getOrgId,
  getStoredUser,
  type OrgMemberWithUser,
  type Supplier,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Rôles distribuables selon qui regarde.
 *
 * Le backend n'autorise qu'OPERATOR à un responsable de club : proposer les
 * autres ici ne ferait que produire un 403 après coup. Seule la plateforme
 * (SUPER_ADMIN) délivre un accès manager ou responsable.
 */
// Libellés métier, identiques au back-office : un même rôle ne doit pas changer
// de nom selon l'écran où on le lit.
const ROLE_OPTIONS_PLATEFORME = [
  { value: 'OPERATOR', label: 'Équipier buvette' },
  { value: 'MANAGER',  label: 'Responsable F&B' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'ORG_ADMIN', label: 'Responsable du club' },
];

const ROLE_OPTIONS_CLUB = [{ value: 'OPERATOR', label: 'Équipier buvette' }];

// Role badges stay categorical so the four roles read apart at a glance.
// OPERATOR — the brand's core role — wears the Break Eat orange.
const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  ORG_ADMIN: { bg: '#fef3c7', color: '#92400e' },
  MANAGER:   { bg: '#ede9fe', color: '#5b21b6' },
  OPERATOR:  { bg: BRAND.orangeTint, color: BRAND.orangeDark },
  MARKETING: { bg: '#d1fae5', color: '#065f46' },
};

/**
 * Mot de passe provisoire lisible à dicter : alphabet sans caractères
 * ambigus (0/O, 1/l/I), et assez long pour résister à une tentative.
 */
function generateTemporaryPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

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
      {/* Le badge doit savoir nommer TOUS les rôles existants, même ceux que
          l'utilisateur courant n'a pas le droit de distribuer. */}
      {ROLE_OPTIONS_PLATEFORME.find((r) => r.value === role)?.label ?? role}
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
  const isPlatform = getStoredUser()?.globalRole === 'SUPER_ADMIN';
  const roleOptions = isPlatform ? ROLE_OPTIONS_PLATEFORME : ROLE_OPTIONS_CLUB;

  const [members, setMembers] = useState<OrgMemberWithUser[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('OPERATOR');
  const [inviteSupplierId, setInviteSupplierId] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  /**
   * Identifiants à transmettre quand le compte vient d'être créé. Affichés une
   * seule fois : le mot de passe est haché côté serveur et devient irrécupérable.
   */
  const [newCredentials, setNewCredentials] = useState<{ email: string; password: string } | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

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
    setNewCredentials(null);
    // Généré côté navigateur pour pouvoir l'afficher : c'est le seul moment où
    // il est lisible. Sans lui, le backend refuse un e-mail encore inconnu.
    const password = invitePassword.trim() || generateTemporaryPassword();
    try {
      const body: { email: string; role: string; supplierId?: string; temporaryPassword?: string } = {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        temporaryPassword: password,
      };
      if (inviteRole === 'OPERATOR' && inviteSupplierId) {
        body.supplierId = inviteSupplierId;
      }
      const newMember = await apiInviteMember(orgId, body);
      // Le mot de passe n'est actif que si le compte vient d'être créé ; sinon
      // la personne garde le sien et l'afficher induirait en erreur.
      setNewCredentials(
        newMember.accountCreated ? { email: newMember.user.email, password } : null,
      );
      setInvitePassword('');
      setInviteSuccess(
        newMember.accountCreated
          ? `Compte créé pour ${newMember.user.email}.`
          : `${newMember.user.displayName} (${newMember.user.email}) a rejoint l’organisation avec son compte existant.`,
      );
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

  /**
   * Redefinit le mot de passe d'un membre et l'affiche UNE fois.
   *
   * Le mot de passe est genere ici, dans le navigateur, comme a l'invitation :
   * c'est le seul moyen de le montrer. Il n'est jamais relu ensuite — ni
   * l'interface ni le serveur ne savent le restituer.
   */
  async function handleResetPassword(memberId: string, email: string) {
    if (!orgId) return;
    if (!confirm(`Redefinir le mot de passe de ${email} ?

L'ancien cessera immediatement de fonctionner.`)) return;
    setResettingId(memberId);
    setError('');
    setInviteSuccess('');
    setNewCredentials(null);
    const password = generateTemporaryPassword();
    try {
      const res = await apiResetMemberPassword(orgId, memberId, password);
      setNewCredentials({ email: res.email, password });
      setInviteSuccess(`Nouveau mot de passe genere pour ${res.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la redefinition');
    } finally {
      setResettingId(null);
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
        <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.orange, margin: '0 0 6px' }}>
          Inviter un membre
        </h2>
        <p style={{ fontSize: 13, color: BRAND.grey, margin: '0 0 16px', lineHeight: 1.55, maxWidth: 620 }}>
          {isPlatform
            ? 'Compte plateforme : tu peux délivrer tous les rôles, y compris l’accès responsable d’un club.'
            : 'Tu équipes ton équipe de terrain en accès opérateur. Pour un accès responsable ou manager, passe par Break Eat.'}
        </p>

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
                {roleOptions.map((r) => (
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

            {/* Mot de passe provisoire — sert uniquement si le compte n'existe pas encore */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>
                Mot de passe provisoire
              </label>
              <input
                type="text"
                placeholder="généré si laissé vide"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                minLength={8}
                style={{
                  padding: '9px 12px',
                  borderRadius: 7,
                  border: `1.5px solid ${BRAND.border}`,
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          </div>

          {newCredentials && (
            <div
              style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 12,
                fontSize: 14,
                color: '#065f46',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Identifiants à transmettre</div>
              <div>Email : <code>{newCredentials.email}</code></div>
              <div>Mot de passe provisoire : <code>{newCredentials.password}</code></div>
              <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                Passe par un canal sûr et demande-lui de le changer. Il ne sera plus affiché
                une fois cette page quittée.
              </div>
            </div>
          )}

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
              Si la personne n&apos;a pas encore de compte, il est créé avec ce mot de passe.
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
          <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.orange, margin: 0 }}>
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
                      onClick={() => void handleResetPassword(m.id, m.user.email)}
                      disabled={resettingId === m.id}
                      title="Genere un nouveau mot de passe et l'affiche une fois"
                      style={{
                        background: 'transparent',
                        border: `1px solid ${BRAND.border}`,
                        borderRadius: 6,
                        color: BRAND.inkSoft,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: resettingId === m.id ? 'not-allowed' : 'pointer',
                        opacity: resettingId === m.id ? 0.5 : 1,
                        fontFamily: 'inherit',
                        marginRight: 8,
                      }}
                    >
                      {resettingId === m.id ? 'Redefinition…' : 'Mot de passe'}
                    </button>
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
