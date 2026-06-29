'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import {
  apiListGroups,
  apiListOrganizations,
  apiCreateGroup,
  apiDeleteGroup,
  type GroupListItem,
  type OrgListItem,
} from '@/lib/api/backoffice-client';

export default function GroupsPage() {
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<GroupListItem[]>({
    queryKey: ['backoffice', 'groups'],
    queryFn: apiListGroups,
  });

  const { data: orgs } = useQuery<OrgListItem[]>({
    queryKey: ['backoffice', 'organizations'],
    queryFn: apiListOrganizations,
  });

  const activeOrgs = useMemo(() => orgs?.filter((o) => o.status === 'ACTIVE') ?? [], [orgs]);

  // ── Formulaire de création ────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [gOrgId, setGOrgId]       = useState('');
  const [gName, setGName]         = useState('');
  const [gDesc, setGDesc]         = useState('');
  const [gDomain, setGDomain]     = useState('');
  const [formError, setFormError]  = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['backoffice', 'groups'] });

  const resetForm = () => { setGOrgId(''); setGName(''); setGDesc(''); setGDomain(''); setFormError(''); };

  const createMut = useMutation({
    mutationFn: () => apiCreateGroup({
      orgId: gOrgId,
      name: gName.trim(),
      description: gDesc.trim() || undefined,
      emailDomain: gDomain.trim() || undefined,
    }),
    onSuccess: () => { resetForm(); setShowForm(false); invalidate(); },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Échec'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDeleteGroup(id),
    onSuccess: invalidate,
  });

  // ── Vue groupée par org ───────────────────────────────────────
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
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: BRAND.ink, margin: 0 }}>Groupes &amp; accès</h1>
          <p style={{ fontSize: 14, color: BRAND.grey, margin: '6px 0 0' }}>
            Catégorisez vos abonnés par groupe — accès privés, restauration d'entreprise, domaine email auto.
          </p>
        </div>
        <button onClick={() => { setShowForm((s) => !s); if (showForm) resetForm(); }} style={primaryBtn}>
          {showForm ? 'Annuler' : '+ Créer un groupe'}
        </button>
      </header>

      {/* ── Formulaire création ──────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}
          style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 24, marginBottom: 28 }}
        >
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <Field label="Organisation" style={{ flex: 2, minWidth: 200 }}>
              <select value={gOrgId} onChange={(e) => setGOrgId(e.target.value)} required style={inputStyle}>
                <option value="">Choisir un club…</option>
                {activeOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="Nom du groupe" style={{ flex: 2, minWidth: 200 }}>
              <input value={gName} onChange={(e) => setGName(e.target.value)} placeholder="Salariés du site A" required style={inputStyle} />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <Field label="Description (optionnel)" style={{ flex: 3, minWidth: 200 }}>
              <input value={gDesc} onChange={(e) => setGDesc(e.target.value)} placeholder="Accès cantine du lundi au vendredi" style={inputStyle} />
            </Field>
            <Field label="Domaine email auto-join (optionnel)" style={{ flex: 2, minWidth: 200 }}>
              <input
                value={gDomain}
                onChange={(e) => setGDomain(e.target.value)}
                placeholder="entreprise.com"
                style={inputStyle}
              />
              <span style={{ fontSize: 11, color: BRAND.grey, marginTop: 4 }}>
                Toute inscription avec ce domaine rejoint ce groupe automatiquement.
              </span>
            </Field>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="submit" disabled={createMut.isPending} style={primaryBtn}>
              {createMut.isPending ? 'Création…' : 'Créer le groupe'}
            </button>
            {formError && <span style={{ fontSize: 13, color: '#dc2626' }}>{formError}</span>}
          </div>
        </form>
      )}

      {isLoading && <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>}
      {isError && <div style={errorBox}>{error instanceof Error ? error.message : 'Erreur'}</div>}

      {data && data.length === 0 && (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>
          Aucun groupe pour le moment. Créez-en un avec le bouton ci-dessus.
        </div>
      )}

      {byOrg.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {byOrg.map(({ org, groups }) => (
            <section key={org.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <Link href={`/organizations/${org.id}`} style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, textDecoration: 'none' }}>
                  {org.name}
                </Link>
                <span style={{ fontSize: 12, color: BRAND.grey }}>/{org.slug}</span>
                <span style={{ fontSize: 12, color: BRAND.grey, marginLeft: 'auto' }}>
                  {groups.length} groupe{groups.length > 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ ...rowStyle, background: BRAND.bgSubtle, fontWeight: 600, fontSize: 13 }}>
                  <div style={{ flex: 2 }}>Groupe</div>
                  <div style={{ flex: 2 }}>Domaine email</div>
                  <div style={{ flex: 1, textAlign: 'center' }}>Membres</div>
                  <div style={{ flex: 1, textAlign: 'center' }}>Événements privés</div>
                  <div style={{ flex: 0.5 }} />
                </div>

                {groups.map((g) => (
                  <div key={g.id} style={{ ...rowStyle, borderTop: `1px solid ${BRAND.border}` }}>
                    <div style={{ flex: 2, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: BRAND.ink, fontSize: 14.5 }}>{g.name}</div>
                      {g.description && <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>{g.description}</div>}
                    </div>

                    <div style={{ flex: 2, fontSize: 13 }}>
                      {g.emailDomain ? (
                        <span style={domainPill}>@{g.emailDomain}</span>
                      ) : (
                        <span style={{ color: BRAND.grey }}>Manuel uniquement</span>
                      )}
                    </div>

                    <div style={{ flex: 1, textAlign: 'center', fontSize: 14, color: BRAND.inkSoft }}>{g._count.members}</div>
                    <div style={{ flex: 1, textAlign: 'center', fontSize: 14, color: BRAND.inkSoft }}>{g._count.events}</div>

                    <div style={{ flex: 0.5, display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        disabled={deleteMut.isPending}
                        onClick={() => {
                          if (window.confirm(`Supprimer le groupe "${g.name}" ? Les membres et accès associés seront perdus.`)) {
                            deleteMut.mutate(g.id);
                          }
                        }}
                        style={deleteBtnSmall}
                        title="Supprimer ce groupe"
                      >✕</button>
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

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.inkSoft }}>{label}</span>
      {children}
    </label>
  );
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', fontSize: 14 };

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${BRAND.border}`,
  fontSize: 14, color: BRAND.ink, background: '#fff', outline: 'none', width: '100%', fontFamily: 'inherit',
};

const primaryBtn: React.CSSProperties = {
  background: BRAND.orange, color: '#fff', border: 'none', borderRadius: 10,
  padding: '11px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
};

const deleteBtnSmall: React.CSSProperties = {
  background: '#fff', color: '#dc2626', border: '1px solid #fca5a5',
  borderRadius: 8, padding: '6px 10px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
};

const domainPill: React.CSSProperties = {
  display: 'inline-block', background: BRAND.orangeTint, color: BRAND.orange,
  fontWeight: 600, padding: '3px 10px', borderRadius: 999, fontSize: 12.5,
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontSize: 13,
};
