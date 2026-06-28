'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { MapPin } from 'lucide-react';
import {
  apiGetOrganization,
  apiAddMember,
  apiUpdateOrgBranding,
  apiGetVenues,
  apiCreateVenue,
  apiUpdateVenue,
  type Organization,
  type OrgMember,
  type Venue,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ORG_ADMIN: 'Admin',
  MANAGER: 'Manager',
  OPERATOR: 'Opérateur',
  MARKETING: 'Marketing',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: '#d1fae5', color: '#065f46' },
  SUSPENDED: { bg: '#fee2e2', color: '#991b1b' },
  PENDING: { bg: '#fef3c7', color: '#92400e' },
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: BRAND.surface,
        borderRadius: BRAND.radius.card,
        padding: 24,
        boxShadow: BRAND.shadowCard,
        border: `1px solid ${BRAND.border}`,
        marginBottom: 20,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, margin: '0 0 16px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrganizationDetailPage() {
  const params = useParams();
  const orgId = params.id as string;

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add member form
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState('OPERATOR');
  const [addingMember, setAddingMember] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  // Branding form
  const [brandingLogoUrl, setBrandingLogoUrl] = useState('');
  const [brandingColor, setBrandingColor] = useState('');
  const [brandingDesc, setBrandingDesc] = useState('');
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingError, setBrandingError] = useState('');
  const [brandingSuccess, setBrandingSuccess] = useState('');

  // Lieu (venue) — un club = un lieu. On gère le lieu principal ici.
  const [venue, setVenue] = useState<Venue | null>(null);
  const [extraVenues, setExtraVenues] = useState<Venue[]>([]);
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueTimezone, setVenueTimezone] = useState('');
  const [venueSearchTerms, setVenueSearchTerms] = useState('');
  const [venueLat, setVenueLat] = useState('');
  const [venueLng, setVenueLng] = useState('');
  const [savingVenue, setSavingVenue] = useState(false);
  const [venueError, setVenueError] = useState('');
  const [venueSuccess, setVenueSuccess] = useState('');

  const loadOrg = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, venues] = await Promise.all([apiGetOrganization(orgId), apiGetVenues(orgId)]);
      setOrg(data);
      // Pre-fill branding form with existing values
      setBrandingLogoUrl(data.logoUrl ?? '');
      setBrandingColor(data.primaryColor ?? '');
      setBrandingDesc(data.description ?? '');
      // Lieu principal = premier lieu (modèle 1 club = 1 lieu)
      const list = Array.isArray(venues) ? venues : [];
      const primary = list[0] ?? null;
      setVenue(primary);
      setExtraVenues(list.slice(1));
      setVenueName(primary?.name ?? '');
      setVenueAddress(primary?.address ?? '');
      setVenueTimezone(primary?.timezone ?? '');
      setVenueSearchTerms(primary?.searchTerms ?? '');
      setVenueLat(primary?.latitude != null ? String(primary.latitude) : '');
      setVenueLng(primary?.longitude != null ? String(primary.longitude) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void loadOrg(); }, [loadOrg]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddingMember(true);
    setAddError('');
    setAddSuccess('');
    try {
      await apiAddMember(orgId, { userId: newUserId.trim(), role: newRole });
      setAddSuccess('Membre ajouté avec succès');
      setNewUserId('');
      await loadOrg();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setAddingMember(false);
    }
  }

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    setSavingBranding(true);
    setBrandingError('');
    setBrandingSuccess('');
    try {
      const body: { logoUrl?: string; primaryColor?: string; description?: string } = {};
      if (brandingLogoUrl.trim()) body.logoUrl = brandingLogoUrl.trim();
      if (brandingColor.trim()) body.primaryColor = brandingColor.trim();
      body.description = brandingDesc.trim();
      await apiUpdateOrgBranding(orgId, body);
      setBrandingSuccess('Branding sauvegardé.');
      await loadOrg();
    } catch (err) {
      setBrandingError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingBranding(false);
    }
  }

  async function handleSaveVenue(e: React.FormEvent) {
    e.preventDefault();
    if (!venueName.trim() || !venueAddress.trim()) {
      setVenueError('Le nom et l’adresse du lieu sont requis.');
      return;
    }
    const lat = venueLat.trim() ? Number(venueLat.trim().replace(',', '.')) : null;
    const lng = venueLng.trim() ? Number(venueLng.trim().replace(',', '.')) : null;
    if ((lat !== null && Number.isNaN(lat)) || (lng !== null && Number.isNaN(lng))) {
      setVenueError('Latitude / longitude invalides (ex. 43.296, 5.370).');
      return;
    }
    setSavingVenue(true);
    setVenueError('');
    setVenueSuccess('');
    try {
      const payload = {
        name: venueName.trim(),
        address: venueAddress.trim(),
        timezone: venueTimezone.trim() || 'Europe/Paris',
        searchTerms: venueSearchTerms.trim() || null,
        latitude: lat,
        longitude: lng,
      };
      if (venue) {
        await apiUpdateVenue(orgId, venue.id, payload);
        setVenueSuccess('Lieu mis à jour.');
      } else {
        await apiCreateVenue(orgId, payload);
        setVenueSuccess('Lieu créé.');
      }
      await loadOrg();
    } catch (err) {
      setVenueError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingVenue(false);
    }
  }

  if (loading) return <PageShell>Chargement…</PageShell>;
  if (error) return <PageShell><ErrorBanner msg={error} /></PageShell>;
  if (!org) return null;

  const statusStyle = STATUS_COLORS[org.status] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft };

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0 }}>
            {org.name}
          </h1>
          <span
            style={{
              background: statusStyle.bg,
              color: statusStyle.color,
              borderRadius: 999,
              padding: '2px 10px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {org.status}
          </span>
        </div>
        <div style={{ color: BRAND.grey, fontSize: 13 }}>
          slug : <code style={{ background: BRAND.bgSubtle, padding: '1px 6px', borderRadius: 4 }}>{org.slug}</code>
          {' · '}
          id : <code style={{ background: BRAND.bgSubtle, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{org.id}</code>
        </div>
      </div>

      {/* Lieu — un club = un lieu */}
      <SectionCard title="Lieu">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: BRAND.orangeTint,
              color: BRAND.orange,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MapPin size={19} strokeWidth={1.9} />
          </div>
          <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: 0, lineHeight: 1.55, maxWidth: 560 }}>
            Le lieu physique de ton club (stade, patinoire, salle). Il porte l’adresse affichée aux clients
            et le fuseau horaire des créneaux — tes événements l’utilisent automatiquement.
          </p>
        </div>

        <form onSubmit={handleSaveVenue}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={venueFieldLabel}>Nom du lieu *</label>
              <input
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="Patinoire des Spartiates"
                style={venueFieldInput}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={venueFieldLabel}>Fuseau horaire</label>
              <input
                value={venueTimezone}
                onChange={(e) => setVenueTimezone(e.target.value)}
                placeholder="Europe/Paris"
                style={venueFieldInput}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={venueFieldLabel}>Adresse *</label>
              <input
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                placeholder="1 Avenue du Sport, 75012 Paris"
                style={venueFieldInput}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={venueFieldLabel}>Mots-clés de recherche</label>
              <input
                value={venueSearchTerms}
                onChange={(e) => setVenueSearchTerms(e.target.value)}
                placeholder="marseille, spartiates, patinoire"
                style={venueFieldInput}
              />
              <span style={{ color: BRAND.grey, fontSize: 12 }}>
                Termes que les clients peuvent taper pour trouver ton club (séparés par des virgules).
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={venueFieldLabel}>Latitude</label>
              <input
                value={venueLat}
                onChange={(e) => setVenueLat(e.target.value)}
                placeholder="43.296"
                style={venueFieldInput}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={venueFieldLabel}>Longitude</label>
              <input
                value={venueLng}
                onChange={(e) => setVenueLng(e.target.value)}
                placeholder="5.370"
                style={venueFieldInput}
              />
            </div>
          </div>
          {venueError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{venueError}</div>}
          {venueSuccess && <div style={{ color: '#16a34a', fontSize: 13, marginBottom: 10 }}>{venueSuccess}</div>}
          <button
            type="submit"
            disabled={savingVenue}
            style={{
              background: savingVenue ? BRAND.grey : BRAND.orange,
              color: '#fff',
              border: 'none',
              borderRadius: BRAND.radius.control,
              padding: '9px 20px',
              fontWeight: 600,
              fontSize: 13.5,
              cursor: savingVenue ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: savingVenue ? 'none' : BRAND.shadowButton,
            }}
          >
            {savingVenue ? 'Enregistrement…' : venue ? 'Enregistrer le lieu' : 'Créer le lieu'}
          </button>
        </form>

        {extraVenues.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${BRAND.border}` }}>
            <div style={{ fontSize: 12, color: BRAND.grey, marginBottom: 6 }}>
              Autres lieux de cette organisation ({extraVenues.length}) — cas multi-sites, gérés au niveau plateforme :
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {extraVenues.map((v) => (
                <span
                  key={v.id}
                  style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: '4px 10px', fontSize: 12, color: BRAND.inkSoft }}
                >
                  {v.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Members */}
      <SectionCard title={`Membres (${org.members?.length ?? 0})`}>
        {!org.members || org.members.length === 0 ? (
          <p style={{ color: BRAND.grey, fontSize: 14 }}>Aucun membre.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BRAND.border}` }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: BRAND.grey, fontWeight: 600, fontSize: 12 }}>User ID</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: BRAND.grey, fontWeight: 600, fontSize: 12 }}>Rôle</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: BRAND.grey, fontWeight: 600, fontSize: 12 }}>Ajouté le</th>
              </tr>
            </thead>
            <tbody>
              {org.members.map((m: OrgMember) => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: BRAND.inkSoft }}>
                    {m.userId}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        background: BRAND.orangeTint,
                        color: BRAND.orange,
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {ROLE_LABELS[m.orgRole] ?? m.orgRole}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: BRAND.grey, fontSize: 12 }}>
                    {new Date(m.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add member form */}
        <form
          onSubmit={handleAddMember}
          style={{
            marginTop: 20,
            padding: '16px',
            background: BRAND.bgSubtle,
            borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 12 }}>
            Ajouter un membre
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="UUID du compte utilisateur"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              required
              style={{
                flex: 1,
                minWidth: 200,
                padding: '8px 12px',
                borderRadius: 6,
                border: `1px solid ${BRAND.border}`,
                fontSize: 13,
                fontFamily: 'monospace',
              }}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: `1px solid ${BRAND.border}`,
                fontSize: 13,
                background: BRAND.bg,
                fontFamily: 'inherit',
              }}
            >
              {Object.entries(ROLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={addingMember}
              style={{
                background: addingMember ? BRAND.grey : BRAND.orange,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 16px',
                fontWeight: 600,
                fontSize: 13,
                cursor: addingMember ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {addingMember ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
          {addError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{addError}</div>}
          {addSuccess && <div style={{ color: '#16a34a', fontSize: 13, marginTop: 8 }}>{addSuccess}</div>}
        </form>
      </SectionCard>

      {/* Branding */}
      <SectionCard title="Branding">
        <form onSubmit={handleSaveBranding}>
          {brandingError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{brandingError}</div>}
          {brandingSuccess && <div style={{ color: '#16a34a', fontSize: 13, marginBottom: 12 }}>{brandingSuccess}</div>}

          {/* Logo preview */}
          {org.logoUrl && (
            <div style={{ marginBottom: 16 }}>
              <img
                src={org.logoUrl}
                alt="Logo"
                style={{ height: 48, borderRadius: 8, border: `1px solid ${BRAND.border}`, objectFit: 'contain', background: BRAND.bgSubtle, padding: 4 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>URL du logo</label>
              <input
                type="url"
                placeholder="https://example.com/logo.png"
                value={brandingLogoUrl}
                onChange={(e) => setBrandingLogoUrl(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>Couleur principale</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={brandingColor || BRAND.orange}
                  onChange={(e) => setBrandingColor(e.target.value)}
                  style={{ width: 40, height: 36, borderRadius: 6, border: `1px solid ${BRAND.border}`, cursor: 'pointer', padding: 2 }}
                />
                <input
                  type="text"
                  placeholder={BRAND.orange}
                  value={brandingColor}
                  onChange={(e) => setBrandingColor(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'monospace' }}
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>Description</label>
            <textarea
              placeholder="Décrivez votre organisation…"
              value={brandingDesc}
              onChange={(e) => setBrandingDesc(e.target.value)}
              rows={3}
              style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <button
            type="submit"
            disabled={savingBranding}
            style={{
              background: savingBranding ? BRAND.grey : BRAND.orange,
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 20px',
              fontWeight: 600,
              fontSize: 13,
              cursor: savingBranding ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {savingBranding ? 'Sauvegarde…' : 'Sauvegarder le branding'}
          </button>
        </form>
      </SectionCard>

      {/* Metadata */}
      <SectionCard title="Informations">
        <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px 16px', fontSize: 14 }}>
          <dt style={{ color: BRAND.grey, fontWeight: 500 }}>ID</dt>
          <dd style={{ margin: 0, fontFamily: 'monospace', fontSize: 12 }}>{org.id}</dd>
          <dt style={{ color: BRAND.grey, fontWeight: 500 }}>Slug</dt>
          <dd style={{ margin: 0 }}>{org.slug}</dd>
          <dt style={{ color: BRAND.grey, fontWeight: 500 }}>Statut</dt>
          <dd style={{ margin: 0 }}>{org.status}</dd>
          <dt style={{ color: BRAND.grey, fontWeight: 500 }}>Créé le</dt>
          <dd style={{ margin: 0 }}>{new Date(org.createdAt).toLocaleString('fr-FR')}</dd>
        </dl>
      </SectionCard>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 32, fontFamily: BRAND.font, color: BRAND.grey }}>
      {children}
    </div>
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
      }}
    >
      {msg}
    </div>
  );
}

const venueFieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: BRAND.inkSoft };
const venueFieldInput: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: BRAND.radius.control,
  border: `1px solid ${BRAND.border}`,
  fontSize: 13.5,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
