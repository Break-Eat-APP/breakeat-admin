'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import {
  apiListUsers,
  apiSetUserArchived,
  apiDeleteUser,
  getStoredUser,
  type BackofficeUserListItem,
} from '@/lib/api/backoffice-client';

/**
 * Libellés métier des rôles.
 *
 * Les noms techniques (ORG_ADMIN, MANAGER…) ne disent rien à qui lit la liste :
 * un back-office se lit dans la langue du métier, pas dans celle du schéma.
 *
 * MANAGER et MARKETING manquaient : ces comptes s'affichaient sans étiquette,
 * comme si leur rôle était inconnu.
 */
const ROLE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  SUPER_ADMIN: { label: 'Super Admin',          color: '#7c3aed', bg: '#ede9fe' },
  ORG_ADMIN:   { label: 'Responsable du club',  color: '#0369a1', bg: '#e0f2fe' },
  MANAGER:     { label: 'Responsable F&B',      color: '#0369a1', bg: '#e0f2fe' },
  OPERATOR:    { label: 'Équipier buvette',     color: '#b45309', bg: '#fef3c7' },
  MARKETING:   { label: 'Marketing',            color: '#0369a1', bg: '#e0f2fe' },
  // Un client n'a aucun accès professionnel : il s'inscrit lui-même depuis
  // l'app mobile. On l'affiche, on ne le crée pas d'ici.
  CUSTOMER:    { label: 'Client',               color: BRAND.inkSoft, bg: BRAND.bgSubtle },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [archivesOuverts, setArchivesOuverts] = useState(false);
  const qc = useQueryClient();
  /** Son propre compte : le serveur refuse de l'archiver, autant ne pas le proposer. */
  const moiId = getStoredUser()?.id ?? '';

  const { data, isLoading, isError, error } = useQuery<BackofficeUserListItem[]>({
    queryKey: ['backoffice', 'users'],
    queryFn: apiListUsers,
  });

  const archiveMut = useMutation({
    mutationFn: (vars: { id: string; archived: boolean }) =>
      apiSetUserArchived(vars.id, vars.archived),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backoffice', 'users'] }),
  });

  const filtered = (data ?? []).filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q) ||
      u.memberships.some((m) => m.organization.name.toLowerCase().includes(q))
    );
  });

  // Deux listes distinctes : un compte archivé n'a plus rien à faire au milieu
  // des comptes en service, on ne le retrouverait pas pour le réactiver.
  const actifs = filtered.filter((u) => u.isActive);
  const archives = filtered.filter((u) => !u.isActive);

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDeleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backoffice', 'users'] }),
  });

  /**
   * Suppression définitive.
   *
   * Le serveur refuse tout compte portant des commandes — l'effacer retirerait
   * ce chiffre d'affaires de la comptabilité. La confirmation le rappelle plutôt
   * que de laisser découvrir le refus après coup.
   */
  const supprimer = (u: BackofficeUserListItem) => {
    const question =
      `Supprimer définitivement ${u.email} ?\n\n` +
      'Le compte est effacé de la base : il n’y a pas de retour en arrière.\n\n' +
      'Un compte ayant déjà commandé sera refusé — archivez-le à la place.';
    if (window.confirm(question)) {
      deleteMut.mutate(u.id);
    }
  };

  const basculer = (u: BackofficeUserListItem) => {
    const question = u.isActive
      ? `Archiver ${u.email} ?\n\nSa session s’arrête tout de suite. Le compte et son historique de commandes sont conservés : tu pourras le réactiver.`
      : `Réactiver l’accès de ${u.email} ?`;
    if (window.confirm(question)) {
      archiveMut.mutate({ id: u.id, archived: u.isActive });
    }
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: BRAND.ink, margin: 0 }}>Utilisateurs</h1>
        <p style={{ fontSize: 14, color: BRAND.grey, margin: '6px 0 0' }}>
          Tous les comptes inscrits sur la plateforme.
          {data && <span style={{ marginLeft: 8, fontWeight: 600, color: BRAND.orange }}>{data.length} compte{data.length > 1 ? 's' : ''}</span>}
        </p>
      </header>

      {/* Recherche */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, email ou club…"
          style={searchStyle}
        />
      </div>

      {archiveMut.isError && (
        <div style={{ ...errorBox, marginBottom: 16 }}>
          {archiveMut.error instanceof Error ? archiveMut.error.message : 'Action refusée.'}
        </div>
      )}

      {/* Le refus le plus fréquent — « ce compte porte des commandes » — est une
          information utile, pas un échec : il faut la lire, pas la deviner. */}
      {deleteMut.isError && (
        <div style={{ ...errorBox, marginBottom: 16 }}>
          {deleteMut.error instanceof Error ? deleteMut.error.message : 'Suppression refusée.'}
        </div>
      )}

      {isLoading && <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>}
      {isError && (
        <div style={errorBox}>
          {error instanceof Error ? error.message : 'Impossible de charger les utilisateurs.'}
        </div>
      )}

      {filtered.length === 0 && !isLoading && (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>
          {search.trim() ? 'Aucun utilisateur correspondant.' : 'Aucun utilisateur inscrit.'}
        </div>
      )}

      {actifs.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <SectionHeading
            titre="Comptes actifs"
            compte={actifs.length}
            couleur={BRAND.ink}
          />
          <UserTable
            users={actifs}
            moiId={moiId}
            onToggle={basculer}
            onDelete={supprimer}
            pending={archiveMut.isPending || deleteMut.isPending}
          />
        </section>
      )}

      {/* Comptes archivés — repliés par défaut : c'est une réserve, pas le
          quotidien. On garde le compteur visible pour ne pas les oublier. */}
      {archives.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setArchivesOuverts((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'none',
              border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <span style={{ color: BRAND.grey, fontSize: 12 }}>
              {archivesOuverts ? '▾' : '▸'}
            </span>
            <SectionHeading titre="Comptes archivés" compte={archives.length} couleur="#b91c1c" />
          </button>

          {archivesOuverts && (
            <>
              <p style={{ fontSize: 13, color: BRAND.grey, margin: '0 0 14px', maxWidth: 640, lineHeight: 1.55 }}>
                Ces comptes ne peuvent plus se connecter, nulle part. Leur historique de commandes
                est conservé — les réactiver leur rend tout, à l’identique.
              </p>
              <UserTable
                users={archives}
                moiId={moiId}
                onToggle={basculer}
            onDelete={supprimer}
                pending={archiveMut.isPending || deleteMut.isPending}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function SectionHeading({
  titre,
  compte,
  couleur,
}: {
  titre: string;
  compte: number;
  couleur: string;
}) {
  return (
    <h2 style={{ fontSize: 17, fontWeight: 700, color: couleur, margin: '0 0 12px' }}>
      {titre}
      <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: BRAND.grey }}>
        {compte}
      </span>
    </h2>
  );
}

/**
 * Tableau de comptes. Partagé par les deux sections : une seule définition de
 * colonnes, donc pas de dérive entre la liste des actifs et celle des archivés.
 */
function UserTable({
  users,
  moiId,
  onToggle,
  onDelete,
  pending,
}: {
  users: BackofficeUserListItem[];
  moiId: string;
  onToggle: (u: BackofficeUserListItem) => void;
  onDelete: (u: BackofficeUserListItem) => void;
  pending: boolean;
}) {
  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ ...rowStyle, background: BRAND.bgSubtle, fontWeight: 600, fontSize: 13 }}>
        <div style={{ flex: 2 }}>Utilisateur</div>
        <div style={{ flex: 2 }}>Email</div>
        <div style={{ flex: 1.5 }}>Rôle</div>
        <div style={{ flex: 2 }}>Club(s)</div>
        <div style={{ flex: 1, textAlign: 'right' }}>Inscrit le</div>
        <div style={{ width: 96 }} />
      </div>

      {users.map((u) => {
        const roleInfo = ROLE_LABEL[u.globalRole] ?? {
          label: u.globalRole,
          color: BRAND.grey,
          bg: BRAND.bgSubtle,
        };
        return (
          <div key={u.id} style={{ ...rowStyle, borderTop: `1px solid ${BRAND.border}` }}>
            {/* Avatar + nom */}
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={u.isActive ? avatarStyle : avatarStyleMuted}>
                <span style={u.isActive ? avatarText : avatarTextMuted}>
                  {(u.displayName?.charAt(0) || u.email.charAt(0)).toUpperCase()}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: BRAND.ink, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {u.displayName || '—'}
                </div>
              </div>
            </div>

            {/* Email */}
            <div style={{ flex: 2, fontSize: 13, color: BRAND.inkSoft, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.email}
            </div>

            {/* Rôle */}
            <div style={{ flex: 1.5 }}>
              <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: roleInfo.color, background: roleInfo.bg, padding: '3px 10px', borderRadius: 999 }}>
                {roleInfo.label}
              </span>
            </div>

            {/* Organisations */}
            <div style={{ flex: 2, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {u.memberships.length === 0 ? (
                <span style={{ color: BRAND.grey, fontSize: 12 }}>Aucun</span>
              ) : (
                u.memberships.map((m) => (
                  <span key={m.organization.id} style={orgPill}>
                    {m.organization.name}
                  </span>
                ))
              )}
            </div>

            {/* Date */}
            <div style={{ flex: 1, textAlign: 'right', fontSize: 12, color: BRAND.grey }}>
              {fmtDate(u.createdAt)}
            </div>

            {/* Archivage (réversible) et suppression (définitive). Les deux
                sont refusés sur soi-même : on se fermerait la porte. */}
            <div style={{ width: 168, textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              {u.id === moiId ? (
                <span style={{ fontSize: 11, color: BRAND.grey }}>toi</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onToggle(u)}
                    disabled={pending}
                    style={u.isActive ? archiveBtn : unarchiveBtn}
                  >
                    {u.isActive ? 'Archiver' : 'Réactiver'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(u)}
                    disabled={pending}
                    title="Efface le compte de la base — sans retour"
                    style={deleteBtn}
                  >
                    Supprimer
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', fontSize: 14,
};

const avatarStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 17,
  background: BRAND.orangeTint,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
const avatarText: React.CSSProperties = { color: BRAND.orange, fontWeight: 700, fontSize: 14 };

// Un compte archivé perd l'orange de la marque : il ne fait plus partie du service.
const avatarStyleMuted: React.CSSProperties = { ...avatarStyle, background: BRAND.bgSubtle };
const avatarTextMuted: React.CSSProperties = { ...avatarText, color: BRAND.grey };

const orgPill: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, background: BRAND.bgSubtle,
  color: BRAND.inkSoft, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
};

const searchStyle: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10, border: `1.5px solid ${BRAND.border}`,
  fontSize: 14, color: BRAND.ink, background: '#fff', outline: 'none',
  width: '100%', maxWidth: 400, fontFamily: 'inherit',
};

const actionBtn: React.CSSProperties = {
  borderRadius: 8, padding: '5px 12px', fontSize: 12.5,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: '#fff',
};

const archiveBtn: React.CSSProperties = {
  ...actionBtn, color: '#dc2626', border: '1px solid #fca5a5',
};

const unarchiveBtn: React.CSSProperties = {
  ...actionBtn, color: '#059669', border: '1px solid #6ee7b7',
};

// Fond plein, contrairement à « Archiver » qui reste en contour : la
// suppression est sans retour, elle ne doit pas se confondre au survol.
const deleteBtn: React.CSSProperties = {
  ...actionBtn, color: '#fff', background: '#dc2626', border: '1px solid #dc2626',
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2', border: '1px solid #fca5a5',
  borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontSize: 13,
};
