'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import { apiListGroups, type GroupListItem } from '@/lib/api/backoffice-client';

export default function GroupsPage() {
  const { data, isLoading, isError, error } = useQuery<GroupListItem[]>({
    queryKey: ['backoffice', 'groups'],
    queryFn: apiListGroups,
  });

  // Group the rows by organization for a clearer cross-tenant overview.
  const byOrg = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { org: GroupListItem['organization']; groups: GroupListItem[] }>();
    for (const g of data) {
      const entry = map.get(g.organization.id);
      if (entry) entry.groups.push(g);
      else map.set(g.organization.id, { org: g.organization, groups: [g] });
    }
    return Array.from(map.values()).sort((a, b) => a.org.name.localeCompare(b.org.name, 'fr'));
  }, [data]);

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: BRAND.ink, margin: 0 }}>
          Groupes &amp; accès
        </h1>
        <p style={{ fontSize: 14, color: BRAND.grey, margin: '6px 0 0' }}>
          Supervision des groupes de toutes les organisations. Les groupes se créent et se gèrent
          depuis le dashboard de chaque organisation.
        </p>
      </header>

      {isLoading && <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>}
      {isError && (
        <div style={errorBox}>
          {error instanceof Error ? error.message : 'Impossible de charger les groupes.'}
        </div>
      )}

      {data && data.length === 0 && (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>
          Aucun groupe pour le moment. Les groupes apparaîtront ici dès qu&apos;une organisation en
          créera.
        </div>
      )}

      {byOrg.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {byOrg.map(({ org, groups }) => (
            <section key={org.id}>
              {/* Organization heading */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  marginBottom: 10,
                }}
              >
                <Link
                  href={`/organizations/${org.id}`}
                  style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, textDecoration: 'none' }}
                >
                  {org.name}
                </Link>
                <span style={{ fontSize: 12, color: BRAND.grey }}>/{org.slug}</span>
                <span style={{ fontSize: 12, color: BRAND.grey, marginLeft: 'auto' }}>
                  {groups.length} groupe{groups.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Groups table for this org */}
              <div
                style={{
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                <div style={{ ...rowStyle, background: BRAND.bgSubtle, fontWeight: 600 }}>
                  <div style={{ flex: 2 }}>Groupe</div>
                  <div style={{ flex: 2 }}>Domaine email</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Membres</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Événements privés</div>
                </div>

                {groups.map((g) => (
                  <div key={g.id} style={{ ...rowStyle, borderTop: `1px solid ${BRAND.border}` }}>
                    <div style={{ flex: 2, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: BRAND.ink, fontSize: 14.5 }}>
                        {g.name}
                      </div>
                      {g.description && (
                        <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
                          {g.description}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 2, fontSize: 13 }}>
                      {g.emailDomain ? (
                        <span
                          style={{
                            display: 'inline-block',
                            background: BRAND.orangeTint,
                            color: BRAND.orange,
                            fontWeight: 600,
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 12.5,
                          }}
                        >
                          @{g.emailDomain}
                        </span>
                      ) : (
                        <span style={{ color: BRAND.grey }}>Manuel uniquement</span>
                      )}
                    </div>
                    <div style={{ flex: 1, textAlign: 'right', fontSize: 14, color: BRAND.inkSoft }}>
                      {g._count.members}
                    </div>
                    <div style={{ flex: 1, textAlign: 'right', fontSize: 14, color: BRAND.inkSoft }}>
                      {g._count.events}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Presentational helpers ──────────────────────────────────────────────────

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '12px 18px',
  fontSize: 14,
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fca5a5',
  borderRadius: 10,
  padding: '12px 16px',
  color: '#dc2626',
  fontSize: 13,
};
