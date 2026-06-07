'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import {
  apiListOrganizations,
  apiCreateOrganization,
  apiActivateOrganization,
  apiDeactivateOrganization,
  type OrgListItem,
} from '@/lib/api/backoffice-client';
import { StatusBadge } from '@/components/status-badge';

export default function OrganizationsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery<OrgListItem[]>({
    queryKey: ['backoffice', 'organizations'],
    queryFn: apiListOrganizations,
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [formError, setFormError] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['backoffice', 'organizations'] });

  const createMut = useMutation({
    mutationFn: () => apiCreateOrganization({ name: name.trim(), slug: slug.trim() }),
    onSuccess: () => {
      setName('');
      setSlug('');
      setShowForm(false);
      setFormError('');
      invalidate();
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Échec de la création'),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => apiActivateOrganization(id),
    onSuccess: invalidate,
  });
  const deactivateMut = useMutation({
    mutationFn: (id: string) => apiDeactivateOrganization(id),
    onSuccess: invalidate,
  });

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: BRAND.ink, margin: 0 }}>
            Organisations
          </h1>
          <p style={{ fontSize: 14, color: BRAND.grey, margin: '6px 0 0' }}>
            Toutes les organisations de la plateforme.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((s) => !s);
            setFormError('');
          }}
          style={primaryBtn}
        >
          {showForm ? 'Annuler' : '+ Créer une organisation'}
        </button>
      </header>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate();
          }}
          style={{
            background: BRAND.bgSubtle,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 14,
            padding: 20,
            marginBottom: 24,
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <Field label="Nom">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Club Sportif X"
              required
              style={inputStyle}
            />
          </Field>
          <Field label="Slug (identifiant)">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="club-sportif-x"
              pattern="[a-z0-9\-]+"
              required
              style={inputStyle}
            />
          </Field>
          <button type="submit" disabled={createMut.isPending} style={primaryBtn}>
            {createMut.isPending ? 'Création…' : 'Créer'}
          </button>
          {formError && (
            <div style={{ flexBasis: '100%', color: '#dc2626', fontSize: 13 }}>{formError}</div>
          )}
        </form>
      )}

      {isLoading && <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>}
      {isError && (
        <div style={errorBox}>
          {error instanceof Error ? error.message : 'Impossible de charger les organisations.'}
        </div>
      )}

      {data && data.length === 0 && (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Aucune organisation pour le moment.</div>
      )}

      {data && data.length > 0 && (
        <div
          style={{
            border: `1px solid ${BRAND.border}`,
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          {/* header row */}
          <div style={{ ...rowStyle, background: BRAND.bgSubtle, fontWeight: 600 }}>
            <div style={{ flex: 2 }}>Organisation</div>
            <div style={{ flex: 1 }}>Statut</div>
            <div style={{ flex: 2, color: BRAND.grey }}>Membres · Événements · Groupes</div>
            <div style={{ flex: 1, textAlign: 'right' }}>Action</div>
          </div>

          {data.map((org) => {
            const isActive = org.status === 'ACTIVE';
            const busy = activateMut.isPending || deactivateMut.isPending;
            return (
              <div key={org.id} style={{ ...rowStyle, borderTop: `1px solid ${BRAND.border}` }}>
                <div style={{ flex: 2, minWidth: 0 }}>
                  <Link
                    href={`/organizations/${org.id}`}
                    style={{ color: BRAND.ink, fontWeight: 600, textDecoration: 'none', fontSize: 14.5 }}
                  >
                    {org.name}
                  </Link>
                  <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>/{org.slug}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <StatusBadge status={org.status} />
                </div>
                <div style={{ flex: 2, fontSize: 13, color: BRAND.inkSoft }}>
                  {org._count.members} · {org._count.events} · {org._count.groups}
                </div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <button
                    disabled={busy}
                    onClick={() =>
                      isActive ? deactivateMut.mutate(org.id) : activateMut.mutate(org.id)
                    }
                    style={isActive ? dangerBtnSmall : successBtnSmall}
                  >
                    {isActive ? 'Désactiver' : 'Activer'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Presentational helpers ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 200 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.inkSoft }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: `1.5px solid ${BRAND.border}`,
  fontSize: 14,
  color: BRAND.ink,
  background: '#fff',
  outline: 'none',
};

const primaryBtn: React.CSSProperties = {
  background: BRAND.orange,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '11px 18px',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const dangerBtnSmall: React.CSSProperties = {
  background: '#fff',
  color: '#dc2626',
  border: '1px solid #fca5a5',
  borderRadius: 8,
  padding: '7px 12px',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const successBtnSmall: React.CSSProperties = {
  background: '#fff',
  color: '#059669',
  border: '1px solid #6ee7b7',
  borderRadius: 8,
  padding: '7px 12px',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '14px 18px',
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
