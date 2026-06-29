'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import { apiListUsers, type BackofficeUserListItem } from '@/lib/api/backoffice-client';

const ROLE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', color: '#7c3aed', bg: '#ede9fe' },
  ORG_ADMIN:   { label: 'Org Admin',   color: '#0369a1', bg: '#e0f2fe' },
  OPERATOR:    { label: 'Opérateur',   color: '#0369a1', bg: '#e0f2fe' },
  CUSTOMER:    { label: 'Client',      color: BRAND.inkSoft, bg: BRAND.bgSubtle },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function UsersPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error } = useQuery<BackofficeUserListItem[]>({
    queryKey: ['backoffice', 'users'],
    queryFn: apiListUsers,
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

      {filtered.length > 0 && (
        <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ ...rowStyle, background: BRAND.bgSubtle, fontWeight: 600, fontSize: 13 }}>
            <div style={{ flex: 2 }}>Utilisateur</div>
            <div style={{ flex: 2 }}>Email</div>
            <div style={{ flex: 1.5 }}>Rôle</div>
            <div style={{ flex: 2 }}>Club(s)</div>
            <div style={{ flex: 1, textAlign: 'right' }}>Inscrit le</div>
          </div>

          {filtered.map((u) => {
            const roleInfo = ROLE_LABEL[u.globalRole] ?? { label: u.globalRole, color: BRAND.grey, bg: BRAND.bgSubtle };
            return (
              <div key={u.id} style={{ ...rowStyle, borderTop: `1px solid ${BRAND.border}` }}>
                {/* Avatar + nom */}
                <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={avatarStyle}>
                    <span style={avatarText}>
                      {(u.displayName?.charAt(0) || u.email.charAt(0)).toUpperCase()}
                    </span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: BRAND.ink, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.displayName || '—'}
                    </div>
                    {!u.isActive && (
                      <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Désactivé</div>
                    )}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', fontSize: 14,
};

const avatarStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 17,
  background: BRAND.orangeTint,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
const avatarText: React.CSSProperties = { color: BRAND.orange, fontWeight: 700, fontSize: 14 };

const orgPill: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, background: BRAND.bgSubtle,
  color: BRAND.inkSoft, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
};

const searchStyle: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10, border: `1.5px solid ${BRAND.border}`,
  fontSize: 14, color: BRAND.ink, background: '#fff', outline: 'none',
  width: '100%', maxWidth: 400, fontFamily: 'inherit',
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2', border: '1px solid #fca5a5',
  borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontSize: 13,
};
