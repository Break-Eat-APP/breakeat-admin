'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { MapPin } from 'lucide-react';
import {
  apiGetOrganization,
  apiGetOrgMembers,
  apiUpdateOrgBranding,
  apiGetVenues,
  apiCreateVenue,
  apiUpdateVenue,
  type Organization,
  type OrgMemberWithUser,
  type Venue,
  type VenueOperatingMode,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import { SlotTemplatesPanel } from '@/components/slot-templates-panel';
import { parseCoordsString, parseSingleCoord, fmtCoord } from '@/lib/coords';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Libellés métier, identiques au back-office : un même rôle ne doit pas
// changer de nom selon l'écran où on le lit.
const ROLE_LABELS: Record<string, string> = {
  ORG_ADMIN: 'Responsable du club',
  MANAGER: 'Responsable F&B',
  OPERATOR: 'Équipier buvette',
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
      <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.orange, margin: '0 0 16px' }}>
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

  /**
   * Membres — affichage seul. La gestion des accès (invitation, retrait) vit
   * dans l'onglet Équipe : un seul endroit pour donner des droits.
   */
  const [members, setMembers] = useState<OrgMemberWithUser[]>([]);

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
  const [venueBuvettePlanUrl, setVenueBuvettePlanUrl] = useState('');
  // Phase 22 — un lieu ouvert en continu n'a aucun événement à créer.
  const [venueMode, setVenueMode] = useState<VenueOperatingMode>('EVENT_BASED');
  // Intégration Flaix : quand elle est active, l'app passe la main à Flaix au
  // lieu du parcours de commande Break Eat. Réglable ici pour ne pas dépendre
  // du back-office SUPER_ADMIN (non déployé).
  const [flaixEnabled, setFlaixEnabled] = useState(false);
  const [flaixVenueId, setFlaixVenueId] = useState('');
  // Phase 20 — fidélité (activation + taux), pilotée par le club sur son lieu.
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyPointsPerEuro, setLoyaltyPointsPerEuro] = useState('1');
  const [loyaltyPointValueCents, setLoyaltyPointValueCents] = useState('1');
  const [venueLat, setVenueLat] = useState('');
  const [venueLng, setVenueLng] = useState('');
  const [savingVenue, setSavingVenue] = useState(false);
  const [venueError, setVenueError] = useState('');
  const [venueSuccess, setVenueSuccess] = useState('');

  const loadOrg = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, venues, memberList] = await Promise.all([
        apiGetOrganization(orgId),
        apiGetVenues(orgId),
        apiGetOrgMembers(orgId),
      ]);
      setOrg(data);
      setMembers(Array.isArray(memberList) ? memberList : []);
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
      setVenueBuvettePlanUrl(primary?.buvettePlanUrl ?? '');
      setVenueMode(primary?.operatingMode ?? 'EVENT_BASED');
      setFlaixEnabled(primary?.flaixEnabled ?? false);
      setFlaixVenueId(primary?.flaixVenueId ?? '');
      setLoyaltyEnabled(primary?.loyaltyEnabled ?? false);
      setLoyaltyPointsPerEuro(String(primary?.loyaltyPointsPerEuro ?? 1));
      setLoyaltyPointValueCents(String(primary?.loyaltyPointValueCents ?? 1));
      setVenueLat(primary?.latitude != null ? String(primary.latitude) : '');
      setVenueLng(primary?.longitude != null ? String(primary.longitude) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void loadOrg(); }, [loadOrg]);

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

  /**
   * Saisie d'une coordonnée, avec répartition automatique d'une paire collée.
   *
   * Le geste réel n'est pas « je tape une latitude » : c'est « je copie depuis
   * Google Maps et je colle ». Ce qui arrive alors, c'est
   * « 43.296482, 5.369780 » — deux valeurs dans un champ qui n'en attend
   * qu'une. Exiger de l'utilisateur qu'il découpe lui-même est un travail que
   * le formulaire peut faire seul.
   */
  function onCoordChange(value: string, setSelf: (v: string) => void) {
    const paire = parseCoordsString(value);
    if (paire) {
      setVenueLat(fmtCoord(paire.lat));
      setVenueLng(fmtCoord(paire.lng));
      setVenueError('');
      return;
    }
    setSelf(value);
  }

  async function handleSaveVenue(e: React.FormEvent) {
    e.preventDefault();
    if (!venueName.trim() || !venueAddress.trim()) {
      setVenueError('Le nom et l’adresse du lieu sont requis.');
      return;
    }
    // `Number()` seul ne comprenait que le décimal à point : coller depuis
    // Google Maps (« 43.296482, 5.369780 ») ou une notation DMS
    // (« 43°17'45.6"N ») échouait sans qu'on sache pourquoi. Le parseur accepte
    // les deux, plus la virgule décimale française.
    const lat = venueLat.trim() ? parseSingleCoord(venueLat) : null;
    const lng = venueLng.trim() ? parseSingleCoord(venueLng) : null;
    if ((venueLat.trim() && lat === null) || (venueLng.trim() && lng === null)) {
      setVenueError(
        'Coordonnées non reconnues. Formats acceptés : 43.296 · 43,296 · 43°17\'45.6"N — ' +
          'ou collez la paire complète dans un seul champ.',
      );
      return;
    }
    if ((lat !== null && Math.abs(lat) > 90) || (lng !== null && Math.abs(lng) > 180)) {
      setVenueError(
        'Hors limites : la latitude va de -90 à 90, la longitude de -180 à 180. ' +
          'Les deux valeurs sont peut-être inversées.',
      );
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
        buvettePlanUrl: venueBuvettePlanUrl.trim() || null,
        operatingMode: venueMode,
        flaixEnabled,
        flaixVenueId: flaixVenueId.trim() || null,
        loyaltyEnabled,
        // Bornes basses à 1 : un taux à 0 rendrait le programme inopérant sans
        // que le club comprenne pourquoi (mieux vaut le désactiver franchement).
        loyaltyPointsPerEuro: Math.max(1, Number(loyaltyPointsPerEuro) || 1),
        loyaltyPointValueCents: Math.max(1, Number(loyaltyPointValueCents) || 1),
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
            {/* Rythme d'exploitation — décide s'il faudra créer des événements */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={venueFieldLabel}>Rythme d’exploitation</label>
              {(
                [
                  {
                    value: 'EVENT_BASED' as const,
                    label: 'Par événement',
                    hint: 'Stade, arena, salle de concert : on vend par match ou par concert.',
                  },
                  {
                    value: 'PERMANENT' as const,
                    label: 'Ouvert en continu',
                    hint: 'Restaurant, restauration d’entreprise, aéroport : ouvert tous les jours, aucun événement à créer.',
                  },
                ]
              ).map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '11px 13px',
                    borderRadius: BRAND.radius.control,
                    border: `1.5px solid ${venueMode === opt.value ? BRAND.orange : BRAND.border}`,
                    background: venueMode === opt.value ? BRAND.orangeTint : BRAND.bg,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="venueOperatingMode"
                    checked={venueMode === opt.value}
                    onChange={() => setVenueMode(opt.value)}
                    style={{ marginTop: 3, accentColor: BRAND.orange }}
                  />
                  <span>
                    <span style={{ fontWeight: 600, fontSize: 13.5, color: BRAND.ink }}>
                      {opt.label}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: BRAND.grey, lineHeight: 1.5, marginTop: 2 }}>
                      {opt.hint}
                    </span>
                  </span>
                </label>
              ))}
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
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={venueFieldLabel}>Plan des buvettes (URL de l’image)</label>
              <input
                value={venueBuvettePlanUrl}
                onChange={(e) => setVenueBuvettePlanUrl(e.target.value)}
                placeholder="https://…/plan-buvettes.png"
                style={venueFieldInput}
              />
              <span style={{ color: BRAND.grey, fontSize: 12 }}>
                Image (créée sur Canva puis hébergée) montrant où se situent les buvettes. Affichée dans l’app sur la carte du lieu et après la commande.
              </span>
            </div>

            {/* Intégration Flaix */}
            <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${BRAND.border}`, paddingTop: 14, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={flaixEnabled}
                  onChange={(e) => setFlaixEnabled(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: BRAND.orange, cursor: 'pointer' }}
                />
                <span style={{ ...venueFieldLabel, marginBottom: 0 }}>
                  Passer la commande à Flaix
                </span>
              </label>
              <span style={{ color: BRAND.grey, fontSize: 12, display: 'block', marginTop: 4 }}>
                Quand c’est activé, l’app renvoie vers Flaix au lieu du parcours de commande Break Eat
                (catalogue, panier, suivi, fidélité). À laisser <strong>décoché</strong> tant que
                l’intégration Flaix n’est pas en service.
              </span>
            </div>

            {flaixEnabled && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={venueFieldLabel}>Identifiant du lieu côté Flaix</label>
                <input
                  value={flaixVenueId}
                  onChange={(e) => setFlaixVenueId(e.target.value)}
                  placeholder="réf. fournie par Flaix"
                  style={venueFieldInput}
                />
              </div>
            )}

            {/* Phase 20 — programme de fidélité */}
            <div style={{ gridColumn: '1 / -1', borderTop: `1px solid ${BRAND.border}`, paddingTop: 14, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={loyaltyEnabled}
                  onChange={(e) => setLoyaltyEnabled(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: BRAND.orange, cursor: 'pointer' }}
                />
                <span style={{ ...venueFieldLabel, marginBottom: 0 }}>
                  Activer le programme de fidélité
                </span>
              </label>
              <span style={{ color: BRAND.grey, fontSize: 12, display: 'block', marginTop: 4 }}>
                Tes clients cumulent des points sur leurs commandes et peuvent les convertir en réduction.
              </span>
            </div>

            {loyaltyEnabled && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={venueFieldLabel}>Points gagnés par euro dépensé</label>
                  <input
                    type="number"
                    min={1}
                    value={loyaltyPointsPerEuro}
                    onChange={(e) => setLoyaltyPointsPerEuro(e.target.value)}
                    style={venueFieldInput}
                  />
                  <span style={{ color: BRAND.grey, fontSize: 12 }}>
                    Ex. 1 → une commande de 20 € rapporte 20 points.
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={venueFieldLabel}>Valeur d’un point (en centimes)</label>
                  <input
                    type="number"
                    min={1}
                    value={loyaltyPointValueCents}
                    onChange={(e) => setLoyaltyPointValueCents(e.target.value)}
                    style={venueFieldInput}
                  />
                  <span style={{ color: BRAND.grey, fontSize: 12 }}>
                    Ex. 1 → 100 points = 1 € de réduction.
                  </span>
                </div>
              </>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={venueFieldLabel}>Latitude</label>
              <input
                value={venueLat}
                onChange={(e) => onCoordChange(e.target.value, setVenueLat)}
                placeholder="43.296"
                style={venueFieldInput}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={venueFieldLabel}>Longitude</label>
              <input
                value={venueLng}
                onChange={(e) => onCoordChange(e.target.value, setVenueLng)}
                placeholder="5.370"
                style={venueFieldInput}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', fontSize: 12, color: BRAND.grey, lineHeight: 1.6 }}>
              Collez la paire depuis Google Maps dans n&apos;importe lequel des deux champs — elle
              se répartit toute seule. Formats acceptés : <code>43.296</code>, <code>43,296</code>,{' '}
              <code>43°17&apos;45.6&quot;N</code>.
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

      {/* Créneaux de récupération — n’a de sens qu’une fois le lieu créé,
          puisqu’ils s’y rattachent. */}
      {venue && (
        <SectionCard title="Créneaux de récupération">
          <SlotTemplatesPanel orgId={orgId} venueId={venue.id} />
        </SectionCard>
      )}

      {/* Membres — invitation par e-mail, le compte est créé au passage */}
      <SectionCard title={`Membres (${members.length})`}>
        {members.length === 0 ? (
          <p style={{ color: BRAND.grey, fontSize: 14 }}>Aucun membre pour l’instant.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BRAND.border}` }}>
                <th style={memberTh}>Personne</th>
                <th style={memberTh}>Rôle</th>
                <th style={memberTh}>Point de vente</th>
                <th style={memberTh}>Depuis le</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ color: BRAND.ink, fontWeight: 600, fontSize: 13.5 }}>
                      {m.user.displayName}
                    </div>
                    <div style={{ color: BRAND.grey, fontSize: 12 }}>{m.user.email}</div>
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
                  <td style={{ padding: '10px 12px', color: BRAND.inkSoft, fontSize: 13 }}>
                    {m.supplier?.name ?? '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: BRAND.grey, fontSize: 12 }}>
                    {new Date(m.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p style={{ marginTop: 16, marginBottom: 0, fontSize: 12.5, color: BRAND.grey, lineHeight: 1.55 }}>
          Pour donner ou retirer un accès, passe par l’onglet <strong>Équipe</strong> — les droits
          se gèrent à un seul endroit.
        </p>
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

const memberTh: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  color: BRAND.grey,
  fontWeight: 600,
  fontSize: 12,
};

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
