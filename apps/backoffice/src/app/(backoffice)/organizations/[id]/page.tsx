'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import {
  apiGetOrganization,
  apiUpdateOrganization,
  apiActivateOrganization,
  apiDeactivateOrganization,
  type OrgDetail,
} from '@/lib/api/backoffice-client';
import { StatusBadge } from '@/components/status-badge';

export default function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<OrgDetail>({
    queryKey: ['backoffice', 'organizations', id],
    queryFn: () => apiGetOrganization(id),
  });

  // Editable fields, hydrated once data arrives.
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setSlug(data.slug);
      setDescription(data.description ?? '');
      setPrimaryColor(data.primaryColor ?? '');
    }
  }, [data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['backoffice', 'organizations', id] });
    qc.invalidateQueries({ queryKey: ['backoffice', 'organizations'] });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      apiUpdateOrganization(id, {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        primaryColor: primaryColor.trim(),
      }),
    onSuccess: () => {
      setSaveError('');
      setSavedAt(Date.now());
      invalidate();
    },
    onError: (e) => setSaveError(e instanceof Error ? e.message : 'Échec de l’enregistrement'),
  });

  const activateMut = useMutation({
    mutationFn: () => apiActivateOrganization(id),
    onSuccess: invalidate,
  });
  const deactivateMut = useMutation({
    mutationFn: () => apiDeactivateOrganization(id),
    onSuccess: invalidate,
  });

  return (
    <div style={{ padding: '32px 40px', maxWidth: 900 }}>
      <Link
        href="/organizations"
        style={{ fontSize: 13, color: BRAND.grey, textDecoration: 'none' }}
      >
        ← Toutes les organisations
      </Link>

      {isLoading && <div style={{ color: BRAND.grey, marginTop: 16 }}>Chargement…</div>}
      {isError && (
        <div style={{ ...errorBox, marginTop: 16 }}>
          {error instanceof Error ? error.message : 'Organisation introuvable.'}
        </div>
      )}

      {data && (
        <>
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: '14px 0 26px',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontSize: 25, fontWeight: 700, color: BRAND.ink, margin: 0 }}>
                {data.name}
              </h1>
              <StatusBadge status={data.status} />
            </div>
            <button
              disabled={activateMut.isPending || deactivateMut.isPending}
              onClick={() =>
                data.status === 'ACTIVE' ? deactivateMut.mutate() : activateMut.mutate()
              }
              style={data.status === 'ACTIVE' ? dangerBtn : successBtn}
            >
              {data.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}
            </button>
          </header>

          {/* Counts */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
            <Stat label="Membres" value={data._count.members} />
            <Stat label="Événements" value={data._count.events} />
            <Stat label="Fournisseurs" value={data._count.suppliers} />
            <Stat label="Groupes" value={data._count.groups} />
          </div>

          {/* Edit form */}
          <section style={card}>
            <h2 style={cardTitle}>Profil & marque</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveMut.mutate();
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <Field label="Nom">
                <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required />
              </Field>
              <Field label="Slug">
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  pattern="[a-z0-9\-]+"
                  style={inputStyle}
                  required
                />
              </Field>
              <Field label="Couleur principale (hex, ex : #FC4002)">
                <input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#FC4002"
                  style={inputStyle}
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </Field>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button type="submit" disabled={saveMut.isPending} style={primaryBtn}>
                  {saveMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                {savedAt > 0 && !saveMut.isPending && !saveError && (
                  <span style={{ fontSize: 13, color: '#059669' }}>Enregistré ✓</span>
                )}
                {saveError && <span style={{ fontSize: 13, color: '#dc2626' }}>{saveError}</span>}
              </div>
            </form>
          </section>

          {/* Members */}
          <section style={{ ...card, marginTop: 20 }}>
            <h2 style={cardTitle}>Membres ({data.members.length})</h2>
            {data.members.length === 0 ? (
              <div style={{ fontSize: 14, color: BRAND.grey }}>
                Aucun membre. Invitez un administrateur depuis le dashboard de l’organisation.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.members.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: BRAND.bgSubtle,
                      borderRadius: 10,
                      fontSize: 14,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: BRAND.ink }}>
                        {m.user.displayName}
                      </span>
                      <span style={{ color: BRAND.grey, marginLeft: 8, fontSize: 13 }}>
                        {m.user.email}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>
                      {m.orgRole}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ─── Presentational helpers ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.inkSoft }}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: BRAND.bgSubtle,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: '12px 18px',
        minWidth: 110,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: BRAND.ink }}>{value}</div>
      <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>{label}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${BRAND.border}`,
  borderRadius: 16,
  padding: 24,
};

const cardTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: BRAND.ink,
  margin: '0 0 16px',
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: `1.5px solid ${BRAND.border}`,
  fontSize: 14,
  color: BRAND.ink,
  background: '#fff',
  outline: 'none',
  width: '100%',
  fontFamily: 'inherit',
};

const primaryBtn: React.CSSProperties = {
  background: BRAND.orange,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '11px 20px',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const dangerBtn: React.CSSProperties = {
  background: '#fff',
  color: '#dc2626',
  border: '1px solid #fca5a5',
  borderRadius: 10,
  padding: '9px 16px',
  fontWeight: 600,
  fontSize: 13.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const successBtn: React.CSSProperties = {
  background: '#fff',
  color: '#059669',
  border: '1px solid #6ee7b7',
  borderRadius: 10,
  padding: '9px 16px',
  fontWeight: 600,
  fontSize: 13.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fca5a5',
  borderRadius: 10,
  padding: '12px 16px',
  color: '#dc2626',
  fontSize: 13,
};
