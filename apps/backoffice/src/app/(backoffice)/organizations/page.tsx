'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import {
  apiListOrganizations,
  apiCreateOrganization,
  apiCreateVenue,
  apiActivateOrganization,
  apiDeactivateOrganization,
  type OrgListItem,
} from '@/lib/api/backoffice-client';
import { StatusBadge } from '@/components/status-badge';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function OrganizationsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery<OrgListItem[]>({
    queryKey: ['backoffice', 'organizations'],
    queryFn: apiListOrganizations,
  });

  const [showForm, setShowForm] = useState(false);

  // Org fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  // Venue fields
  const [vName, setVName] = useState('');
  const [vAddress, setVAddress] = useState('');
  const [vLat, setVLat] = useState('');
  const [vLng, setVLng] = useState('');
  const [vTerms, setVTerms] = useState('');
  const [vFlaixOn, setVFlaixOn] = useState(false);
  const [vFlaixId, setVFlaixId] = useState('');

  const [formError, setFormError] = useState('');
  const [step, setStep] = useState<'idle' | 'org' | 'venue'>('idle');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['backoffice', 'organizations'] });

  const resetForm = () => {
    setName(''); setSlug(''); setSlugTouched(false);
    setVName(''); setVAddress(''); setVLat(''); setVLng('');
    setVTerms(''); setVFlaixOn(false); setVFlaixId('');
    setFormError(''); setStep('idle');
  };

  const createMut = useMutation({
    mutationFn: async () => {
      setStep('org');
      const org = await apiCreateOrganization({ name: name.trim(), slug: slug.trim() });

      if (vName.trim()) {
        setStep('venue');
        const lat = vLat.trim() ? Number(vLat.trim().replace(',', '.')) : null;
        const lng = vLng.trim() ? Number(vLng.trim().replace(',', '.')) : null;
        if ((lat !== null && Number.isNaN(lat)) || (lng !== null && Number.isNaN(lng))) {
          throw new Error('Latitude / longitude invalides (ex. 43.296, 5.370).');
        }
        await apiCreateVenue(org.id, {
          name: vName.trim(),
          address: vAddress.trim(),
          latitude: lat,
          longitude: lng,
          searchTerms: vTerms.trim() || null,
          flaixEnabled: vFlaixOn,
          flaixVenueId: vFlaixId.trim() || null,
        });
      }

      return org;
    },
    onSuccess: () => {
      resetForm();
      setShowForm(false);
      invalidate();
    },
    onError: (e) => {
      setStep('idle');
      setFormError(e instanceof Error ? e.message : 'Échec de la création');
    },
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => apiActivateOrganization(id),
    onSuccess: invalidate,
  });
  const deactivateMut = useMutation({
    mutationFn: (id: string) => apiDeactivateOrganization(id),
    onSuccess: invalidate,
  });

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const pending = createMut.isPending;

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: BRAND.ink, margin: 0 }}>Organisations</h1>
          <p style={{ fontSize: 14, color: BRAND.grey, margin: '6px 0 0' }}>Toutes les organisations de la plateforme.</p>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); if (showForm) resetForm(); }}
          style={primaryBtn}
        >
          {showForm ? 'Annuler' : '+ Créer un club'}
        </button>
      </header>

      {/* ── Formulaire de création ────────────────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}
          style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 24, marginBottom: 28 }}
        >
          {/* Section org */}
          <SectionTitle>Informations du club</SectionTitle>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
            <Field label="Nom du club" style={{ flex: 2, minWidth: 200 }}>
              <input
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Les Spartiates de Marseille"
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Slug (URL interne)" style={{ flex: 1, minWidth: 160 }}>
              <input
                value={slug}
                onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugTouched(true); }}
                placeholder="spartiates-marseille"
                pattern="[a-z0-9\-]+"
                required
                style={inputStyle}
              />
            </Field>
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${BRAND.border}`, margin: '20px 0 16px' }} />

          {/* Section lieu */}
          <SectionTitle>
            Lieu du club{' '}
            <span style={{ fontWeight: 400, color: BRAND.grey, fontSize: 13 }}>(optionnel — visible dans l'app)</span>
          </SectionTitle>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            <Field label="Nom du lieu" style={{ flex: 2, minWidth: 200 }}>
              <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Palais omnisports de Marseille" style={inputStyle} />
            </Field>
            <Field label="Adresse" style={{ flex: 3, minWidth: 240 }}>
              <input value={vAddress} onChange={(e) => setVAddress(e.target.value)} placeholder="1 place Bernard Tapie, Marseille" style={inputStyle} />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            <Field label="Mots-clés de recherche" style={{ flex: 3, minWidth: 240 }}>
              <input value={vTerms} onChange={(e) => setVTerms(e.target.value)} placeholder="marseille, spartiates, patinoire, hockey" style={inputStyle} />
            </Field>
            <Field label="Latitude" style={{ flex: 1, minWidth: 120 }}>
              <input value={vLat} onChange={(e) => setVLat(e.target.value)} placeholder="43.296" style={inputStyle} />
            </Field>
            <Field label="Longitude" style={{ flex: 1, minWidth: 120 }}>
              <input value={vLng} onChange={(e) => setVLng(e.target.value)} placeholder="5.370" style={inputStyle} />
            </Field>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: BRAND.ink, marginBottom: vFlaixOn ? 12 : 0 }}>
            <input type="checkbox" checked={vFlaixOn} onChange={(e) => setVFlaixOn(e.target.checked)} />
            Flaix activé — la commande passe par Flaix
          </label>

          {vFlaixOn && (
            <Field label="Identifiant Flaix du lieu" style={{ maxWidth: 320, marginTop: 12 }}>
              <input value={vFlaixId} onChange={(e) => setVFlaixId(e.target.value)} placeholder="flx_..." style={inputStyle} />
            </Field>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
            <button type="submit" disabled={pending} style={primaryBtn}>
              {pending
                ? step === 'venue' ? 'Création du lieu…' : 'Création du club…'
                : vName.trim() ? 'Créer le club + le lieu' : 'Créer le club'}
            </button>
            {formError && <span style={{ fontSize: 13, color: '#dc2626' }}>{formError}</span>}
          </div>
        </form>
      )}

      {isLoading && <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>}
      {isError && (
        <div style={errorBox}>
          {error instanceof Error ? error.message : 'Impossible de charger les organisations.'}
        </div>
      )}

      {data && data.length === 0 && (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Aucun club pour le moment.</div>
      )}

      {data && data.length > 0 && (
        <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ ...rowStyle, background: BRAND.bgSubtle, fontWeight: 600 }}>
            <div style={{ flex: 2 }}>Club</div>
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
                  <Link href={`/organizations/${org.id}`} style={{ color: BRAND.ink, fontWeight: 600, textDecoration: 'none', fontSize: 14.5 }}>
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
                    onClick={() => isActive ? deactivateMut.mutate(org.id) : activateMut.mutate(org.id)}
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
      {children}
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
  padding: '11px 18px',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const dangerBtnSmall: React.CSSProperties = {
  background: '#fff', color: '#dc2626', border: '1px solid #fca5a5',
  borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit',
};

const successBtnSmall: React.CSSProperties = {
  background: '#fff', color: '#059669', border: '1px solid #6ee7b7',
  borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit',
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', fontSize: 14,
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10,
  padding: '12px 16px', color: '#dc2626', fontSize: 13,
};
