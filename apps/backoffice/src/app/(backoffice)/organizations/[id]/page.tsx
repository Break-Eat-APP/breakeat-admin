'use client';

import { use, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseCoordsString, parseSingleCoord, fmtCoord } from '@/lib/coords';
import { BRAND } from '@break-eat/brand';
import {
  apiGetOrganization,
  apiUpdateOrganization,
  apiActivateOrganization,
  apiDeactivateOrganization,
  apiGetVenues,
  apiCreateVenue,
  apiUpdateVenue,
  apiInviteMember,
  apiRemoveMember,
  apiResetOrgData,
  type ResetOrgDataResult,
  VENUE_MODE_OPTIONS,
  type OrgDetail,
  type Venue,
  type VenueOperatingMode,
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
  const [logoUrl, setLogoUrl] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setSlug(data.slug);
      setDescription(data.description ?? '');
      setPrimaryColor(data.primaryColor ?? '');
      setLogoUrl(data.logoUrl ?? '');
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
        primaryColor: primaryColor.trim() || null,
        logoUrl: logoUrl.trim() || null,
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

  // ── Accès responsable du club ──
  //
  // Seule la plateforme délivre un accès responsable : le backend interdit à un
  // ORG_ADMIN d'en créer un autre. C'est donc ici, et nulle part ailleurs.
  const [accessEmail, setAccessEmail] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  /** Identifiants affichés une seule fois : le mot de passe est ensuite haché. */
  const [accessCreated, setAccessCreated] = useState<{ email: string; password: string } | null>(null);
  const [accessNotice, setAccessNotice] = useState('');

  const inviteMut = useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      apiInviteMember(id, {
        email: vars.email,
        role: 'ORG_ADMIN',
        temporaryPassword: vars.password,
      }),
    onSuccess: (member, vars) => {
      // Le mot de passe n'est actif que sur un compte neuf : sur un compte
      // existant le backend l'ignore, et l'afficher enverrait le responsable
      // se connecter avec un mot de passe qui ne marche pas.
      setAccessCreated(member.accountCreated ? { email: member.user.email, password: vars.password } : null);
      setAccessNotice(
        member.accountCreated
          ? ''
          : `${member.user.email} avait déjà un compte Break Eat : il garde son mot de passe et accède maintenant à ce club.`,
      );
      setAccessEmail('');
      setAccessPassword('');
      invalidate();
    },
  });

  /** Retrait d'un accès. Le compte survit — seul le rattachement au club tombe. */
  const removeMut = useMutation({
    mutationFn: (memberId: string) => apiRemoveMember(id, memberId),
    onSuccess: invalidate,
  });

  // ── Lieu du club (config plateforme — un club = un lieu) ──
  const venuesQuery = useQuery<Venue[]>({
    queryKey: ['backoffice', 'venues', id],
    queryFn: () => apiGetVenues(id),
  });
  const venue = venuesQuery.data?.[0] ?? null;
  const [vName, setVName] = useState('');
  const [vAddress, setVAddress] = useState('');
  const [vLat, setVLat] = useState('');
  const [vLng, setVLng] = useState('');
  const [vTerms, setVTerms] = useState('');
  const [vFlaixOn, setVFlaixOn] = useState(false);
  const [vFlaixId, setVFlaixId] = useState('');
  const [vPlanUrl, setVPlanUrl] = useState('');
  const [vMode, setVMode] = useState<VenueOperatingMode>('EVENT_BASED');
  const [vLoyaltyOn, setVLoyaltyOn] = useState(false);
  const [vPointsPerEuro, setVPointsPerEuro] = useState('1');
  const [vPointValue, setVPointValue] = useState('1');
  const [vCoordsRaw, setVCoordsRaw] = useState('');
  const [vCoordsError, setVCoordsError] = useState('');
  const [venueError, setVenueError] = useState('');
  const [venueSavedAt, setVenueSavedAt] = useState(0);

  const handleCoordsRaw = useCallback((value: string) => {
    setVCoordsRaw(value);
    if (!value.trim()) { setVCoordsError(''); return; }
    const parsed = parseCoordsString(value);
    if (parsed) {
      setVLat(fmtCoord(parsed.lat));
      setVLng(fmtCoord(parsed.lng));
      setVCoordsError('');
    } else {
      setVCoordsError('Format non reconnu. Essayez « 43° 17\' 45.6" N, 5° 24\' 17.2" E » ou « 43.296, 5.404 »');
    }
  }, []);

  useEffect(() => {
    if (venue) {
      setVName(venue.name);
      setVAddress(venue.address);
      setVLat(venue.latitude != null ? String(venue.latitude) : '');
      setVLng(venue.longitude != null ? String(venue.longitude) : '');
      setVTerms(venue.searchTerms ?? '');
      setVFlaixOn(!!venue.flaixEnabled);
      setVFlaixId(venue.flaixVenueId ?? '');
      setVPlanUrl(venue.buvettePlanUrl ?? '');
      setVMode(venue.operatingMode ?? 'EVENT_BASED');
      setVLoyaltyOn(!!venue.loyaltyEnabled);
      setVPointsPerEuro(String(venue.loyaltyPointsPerEuro ?? 1));
      setVPointValue(String(venue.loyaltyPointValueCents ?? 1));
    }
  }, [venue]);

  const saveVenueMut = useMutation({
    mutationFn: () => {
      // Parseur tolérant, comme le champ de collage : `Number()` refusait le
      // DMS, alors que le champ juste au-dessus l'accepte. Deux comportements
      // contradictoires sur le même écran.
      const lat = vLat.trim() ? parseSingleCoord(vLat) : null;
      const lng = vLng.trim() ? parseSingleCoord(vLng) : null;
      if ((vLat.trim() && lat === null) || (vLng.trim() && lng === null)) {
        return Promise.reject(
          new Error(
            'Coordonnées non reconnues. Collez la paire depuis Google Maps dans le champ prévu.',
          ),
        );
      }
      if ((lat !== null && Math.abs(lat) > 90) || (lng !== null && Math.abs(lng) > 180)) {
        return Promise.reject(
          new Error(
            'Hors limites : la latitude va de -90 à 90, la longitude de -180 à 180. ' +
              'Les deux valeurs sont peut-être inversées.',
          ),
        );
      }
      const payload = {
        name: vName.trim(),
        address: vAddress.trim(),
        latitude: lat,
        longitude: lng,
        searchTerms: vTerms.trim() || null,
        buvettePlanUrl: vPlanUrl.trim() || null,
        operatingMode: vMode,
        flaixEnabled: vFlaixOn,
        flaixVenueId: vFlaixId.trim() || null,
        loyaltyEnabled: vLoyaltyOn,
        // Bornes basses à 1 : un taux à zéro rendrait le programme inopérant
        // sans que le club comprenne pourquoi. Mieux vaut le désactiver.
        loyaltyPointsPerEuro: Math.max(1, Number(vPointsPerEuro) || 1),
        loyaltyPointValueCents: Math.max(1, Number(vPointValue) || 1),
      };
      return venue ? apiUpdateVenue(id, venue.id, payload) : apiCreateVenue(id, payload);
    },
    onSuccess: () => {
      setVenueError('');
      setVenueSavedAt(Date.now());
      qc.invalidateQueries({ queryKey: ['backoffice', 'venues', id] });
    },
    onError: (e) => setVenueError(e instanceof Error ? e.message : 'Échec de l’enregistrement'),
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
              <Field label="Logo du club (URL de l'image)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://exemple.com/logo-club.png"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  {logoUrl.trim() && (
                    <img
                      src={logoUrl.trim()}
                      alt="Aperçu logo"
                      style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 8, border: `1px solid ${BRAND.border}`, background: '#f8f8f8', flexShrink: 0 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                </div>
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

          {/* Lieu du club */}
          <section style={{ ...card, marginTop: 20 }}>
            <h2 style={cardTitle}>Lieu du club {venue ? '' : '— non configuré'}</h2>
            <p style={{ fontSize: 13, color: BRAND.grey, margin: '0 0 16px', lineHeight: 1.5 }}>
              Ce lieu apparaît dans l’app cliente (onglet « Lieux »). Renseigne les coordonnées
              pour le tri par proximité, les mots-clés pour la recherche, et active Flaix si la
              commande passe par Flaix.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveVenueMut.mutate();
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <Field label="Nom du lieu">
                <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Patinoire des Spartiates" style={inputStyle} required />
              </Field>
              <Field label="Adresse">
                <input value={vAddress} onChange={(e) => setVAddress(e.target.value)} placeholder="Le Palais omnisports, Marseille" style={inputStyle} required />
              </Field>
              {/* Rythme d'exploitation — le réglage qui décide s'il faudra
                  créer des événements, ou plus jamais y penser. */}
              <Field label="Rythme d’exploitation">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {VENUE_MODE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: `1.5px solid ${vMode === opt.value ? BRAND.orange : BRAND.border}`,
                        background: vMode === opt.value ? BRAND.orangeTint : '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="operatingMode"
                        checked={vMode === opt.value}
                        onChange={() => setVMode(opt.value)}
                        style={{ marginTop: 3, accentColor: BRAND.orange }}
                      />
                      <span>
                        <span style={{ fontWeight: 600, fontSize: 14, color: BRAND.ink }}>
                          {opt.label}
                        </span>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 12.5,
                            color: BRAND.grey,
                            lineHeight: 1.5,
                            marginTop: 2,
                          }}
                        >
                          {opt.hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Mots-clés de recherche">
                <input value={vTerms} onChange={(e) => setVTerms(e.target.value)} placeholder="marseille, spartiates, patinoire" style={inputStyle} />
              </Field>
              {/* Champ de collage GPS — accepte DMS ou décimal, remplit lat/lng auto */}
              <Field label="Coordonnées GPS — coller ici depuis Google Maps ou n'importe quelle source">
                <input
                  value={vCoordsRaw}
                  onChange={(e) => handleCoordsRaw(e.target.value)}
                  placeholder='ex. 43° 17′ 45.6" N, 5° 24′ 17.2" E   ou   43.296, 5.404'
                  style={inputStyle}
                />
                {vCoordsError && <span style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>{vCoordsError}</span>}
                {vLat && vLng && !vCoordsError && <span style={{ fontSize: 12, color: '#059669', marginTop: 2 }}>→ Lat {vLat} · Lng {vLng}</span>}
              </Field>

              {/* Latitude et longitude en LECTURE SEULE.
                  Il y avait deux saisies pour la même donnée, et une seule
                  acceptait le DMS : taper 43° 16' 6.60" N ici échouait, alors
                  que le champ de collage juste au-dessus le comprenait. Deux
                  chemins pour une donnée, dont un cassé — mieux vaut un seul.
                  Ces valeurs affichent ce qui sera enregistré. */}
              {(vLat || vLng) && (
                <div
                  style={{
                    display: 'flex',
                    gap: 24,
                    background: BRAND.bgSubtle,
                    border: `1px solid ${BRAND.border}`,
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: BRAND.grey }}>
                    Latitude <strong style={{ color: BRAND.ink }}>{vLat || '—'}</strong>
                  </span>
                  <span style={{ color: BRAND.grey }}>
                    Longitude <strong style={{ color: BRAND.ink }}>{vLng || '—'}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => { setVLat(''); setVLng(''); setVCoordsRaw(''); setVCoordsError(''); }}
                    style={{
                      marginLeft: 'auto', background: 'none', border: 'none', padding: 0,
                      color: '#dc2626', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Effacer
                  </button>
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: BRAND.ink }}>
                <input type="checkbox" checked={vFlaixOn} onChange={(e) => setVFlaixOn(e.target.checked)} />
                Flaix activé — la commande passe par Flaix (le club n’utilise pas le dashboard Break Eat)
              </label>
              {vFlaixOn && (
                <Field label="Identifiant Flaix du lieu">
                  <input value={vFlaixId} onChange={(e) => setVFlaixId(e.target.value)} placeholder="flx_..." style={inputStyle} />
                </Field>
              )}

              <Field label="Plan des buvettes (URL de l’image)">
                <input
                  value={vPlanUrl}
                  onChange={(e) => setVPlanUrl(e.target.value)}
                  placeholder="https://…/plan-buvettes.png"
                  style={inputStyle}
                />
                <span style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
                  Affiché dans l’app sur la carte du lieu et après la commande. Indépendant de
                  Flaix : il vient du lieu, pas du catalogue.
                </span>
              </Field>

              {/* Fidélité — réglée sur le lieu, soldes portés par le club */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: BRAND.ink }}>
                <input
                  type="checkbox"
                  checked={vLoyaltyOn}
                  onChange={(e) => setVLoyaltyOn(e.target.checked)}
                />
                Programme de fidélité activé
              </label>
              <span style={{ fontSize: 12, color: BRAND.grey, marginTop: -8, lineHeight: 1.5 }}>
                Les points appartiennent au <strong>club</strong>, pas à Break Eat : un client
                cumule séparément chez chaque club, et les garde d’un événement à l’autre.
              </span>

              {vLoyaltyOn && (
                <div style={{ display: 'flex', gap: 16 }}>
                  <Field label="Points gagnés par euro dépensé">
                    <input
                      type="number"
                      min={1}
                      value={vPointsPerEuro}
                      onChange={(e) => setVPointsPerEuro(e.target.value)}
                      style={inputStyle}
                    />
                    <span style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
                      Ex. 1 → une commande de 20 € rapporte 20 points.
                    </span>
                  </Field>
                  <Field label="Valeur d’un point (centimes)">
                    <input
                      type="number"
                      min={1}
                      value={vPointValue}
                      onChange={(e) => setVPointValue(e.target.value)}
                      style={inputStyle}
                    />
                    <span style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
                      Ex. 1 → 100 points = 1 € de réduction.
                    </span>
                  </Field>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button type="submit" disabled={saveVenueMut.isPending} style={primaryBtn}>
                  {saveVenueMut.isPending ? 'Enregistrement…' : venue ? 'Enregistrer le lieu' : 'Créer le lieu'}
                </button>
                {venueSavedAt > 0 && !saveVenueMut.isPending && !venueError && (
                  <span style={{ fontSize: 13, color: '#059669' }}>Enregistré ✓</span>
                )}
                {venueError && <span style={{ fontSize: 13, color: '#dc2626' }}>{venueError}</span>}
              </div>
            </form>
          </section>

          {/* Accès responsable — délivré uniquement ici */}
          <section style={{ ...card, marginTop: 20 }}>
            <h2 style={cardTitle}>Donner l’accès au responsable du club</h2>
            <p style={{ fontSize: 13.5, color: BRAND.grey, margin: '0 0 16px', lineHeight: 1.55, maxWidth: 620 }}>
              Crée le compte du responsable de <strong>{data.name}</strong> et lui ouvre son dashboard
              manager. Il pourra ensuite créer les accès opérateurs de son équipe — mais pas d’autres
              accès responsables : ça reste ta décision.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const email = accessEmail.trim().toLowerCase();
                if (!email) return;
                inviteMut.mutate({ email, password: accessPassword.trim() || generateTemporaryPassword() });
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <Field label="E-mail du responsable">
                  <input
                    type="email"
                    required
                    value={accessEmail}
                    onChange={(e) => setAccessEmail(e.target.value)}
                    placeholder="responsable@spartiates-marseille.fr"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Mot de passe (généré si vide)">
                  <input
                    type="text"
                    minLength={8}
                    value={accessPassword}
                    onChange={(e) => setAccessPassword(e.target.value)}
                    placeholder="laisser vide pour en générer un"
                    style={{ ...inputStyle, fontFamily: 'monospace' }}
                  />
                </Field>
              </div>

              {inviteMut.isError && (
                <div style={{ ...errorBox, marginBottom: 14 }}>
                  {inviteMut.error instanceof Error ? inviteMut.error.message : 'Échec de la création'}
                </div>
              )}

              {accessNotice && (
                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fcd34d',
                    borderRadius: 10,
                    padding: '12px 16px',
                    color: '#92400e',
                    fontSize: 13.5,
                    marginBottom: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {accessNotice}
                </div>
              )}

              {accessCreated && (
                <div
                  style={{
                    background: '#ecfdf5',
                    border: '1px solid #6ee7b7',
                    borderRadius: 10,
                    padding: '14px 16px',
                    color: '#065f46',
                    fontSize: 14,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Accès créé — à transmettre</div>
                  <div>Dashboard : <code>{MANAGER_DASHBOARD_URL}</code></div>
                  <div>Identifiant : <code>{accessCreated.email}</code></div>
                  <div>Mot de passe : <code>{accessCreated.password}</code></div>
                  <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.5 }}>
                    Transmets-le par un canal sûr et demande-lui d’en changer. Il ne sera plus
                    affiché après avoir quitté cette page.
                  </div>
                </div>
              )}

              <button type="submit" disabled={inviteMut.isPending} style={primaryBtn}>
                {inviteMut.isPending ? 'Création…' : 'Créer l’accès responsable'}
              </button>
            </form>
          </section>

          {/* Members */}
          <section style={{ ...card, marginTop: 20 }}>
            <h2 style={cardTitle}>Membres ({data.members.length})</h2>
            {removeMut.isError && (
              <div style={{ ...errorBox, marginBottom: 14 }}>
                {removeMut.error instanceof Error ? removeMut.error.message : 'Échec du retrait'}
              </div>
            )}
            {data.members.length === 0 ? (
              <div style={{ fontSize: 14, color: BRAND.grey }}>
                Aucun membre — commence par donner l’accès au responsable ci-dessus.
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>
                        {m.orgRole}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Retirer l’accès de ${m.user.email} à ${data.name} ?\n\nSon compte Break Eat est conservé : il perd ce club, pas son historique.`,
                            )
                          ) {
                            removeMut.mutate(m.id);
                          }
                        }}
                        disabled={removeMut.isPending}
                        style={{ ...dangerBtn, padding: '5px 12px', fontSize: 12.5 }}
                      >
                        Retirer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <ResetDataSection orgId={id} orgName={data.name} />
        </>
      )}
    </div>
  );
}

/**
 * Remise à zéro des données d'exploitation.
 *
 * Isolée dans son propre composant et placée en dernier : c'est une opération
 * sans retour, elle ne doit pas voisiner avec les champs qu'on modifie tous les
 * jours. Le nom doit être recopié à l'identique — un bouton seul se clique par
 * accident, ou sur la mauvaise organisation.
 */
function ResetDataSection({ orgId, orgName }: { orgId: string; orgName: string }) {
  const qc = useQueryClient();
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [bilan, setBilan] = useState<ResetOrgDataResult | null>(null);

  const resetMut = useMutation({
    mutationFn: () => apiResetOrgData(orgId, confirmation),
    onSuccess: (res) => {
      setBilan(res);
      setErreur('');
      setConfirmation('');
      void qc.invalidateQueries();
    },
    onError: (e: unknown) => {
      setErreur(e instanceof Error ? e.message : 'Erreur');
      setBilan(null);
    },
  });

  const nomExact = confirmation.trim() === orgName;

  return (
    <section style={{ ...card, borderColor: '#fca5a5', marginTop: 8 }}>
      <h2 style={{ ...cardTitle, color: '#dc2626' }}>Remise à zéro des données</h2>

      <p style={{ fontSize: 13.5, color: BRAND.ink, lineHeight: 1.7, margin: '0 0 8px' }}>
        Efface <strong>événements, buvettes, comptoirs, commandes et fidélité</strong> de
        cette organisation. Utile pour repartir d&apos;une base vierge après des essais.
      </p>
      <p style={{ fontSize: 13, color: BRAND.grey, lineHeight: 1.7, margin: '0 0 16px' }}>
        Sont <strong>conservés</strong> : le lieu avec ses coordonnées GPS et ses mots-clés,
        les accès de l&apos;équipe, et les groupes. Sans eux, plus personne ne pourrait se
        reconnecter pour reconfigurer.
      </p>
      <p style={{ fontSize: 13, color: '#dc2626', lineHeight: 1.7, margin: '0 0 16px' }}>
        Cette opération est <strong>définitive</strong> : le chiffre d&apos;affaires effacé
        ne se récupère pas.
      </p>

      {bilan && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 10,
            padding: '12px 16px',
            color: '#065f46',
            fontSize: 13.5,
            marginBottom: 16,
            lineHeight: 1.8,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            « {bilan.organization} » est repartie de zéro.
          </div>
          <div>
            {bilan.supprime.evenements} événement(s), {bilan.supprime.buvettes} buvette(s),{' '}
            {bilan.supprime.comptoirs} comptoir(s), {bilan.supprime.commandes} commande(s),{' '}
            {bilan.supprime.fidelite} compte(s) de fidélité,{' '}
            {bilan.supprime.notifications} notification(s) programmée(s).
          </div>
        </div>
      )}

      {erreur && <div style={{ ...errorBox, marginBottom: 16 }}>{erreur}</div>}

      <label
        style={{ display: 'block', fontSize: 13, color: BRAND.ink, marginBottom: 6 }}
        htmlFor="reset-confirmation"
      >
        Pour confirmer, recopiez <strong>{orgName}</strong> :
      </label>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          id="reset-confirmation"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={orgName}
          autoComplete="off"
          style={{ ...inputStyle, minWidth: 260 }}
        />
        <button
          type="button"
          onClick={() => resetMut.mutate()}
          disabled={!nomExact || resetMut.isPending}
          style={{
            ...dangerBtn,
            opacity: nomExact && !resetMut.isPending ? 1 : 0.45,
            cursor: nomExact && !resetMut.isPending ? 'pointer' : 'not-allowed',
          }}
        >
          {resetMut.isPending ? 'Effacement…' : 'Tout remettre à zéro'}
        </button>
      </div>
    </section>
  );
}

/** Adresse à communiquer au responsable avec ses identifiants. */
const MANAGER_DASHBOARD_URL =
  process.env.NEXT_PUBLIC_MANAGER_URL ?? 'https://breakeat-admin-admin.vercel.app';

/**
 * Mot de passe provisoire dictable : alphabet sans caractères ambigus
 * (0/O, 1/l/I) et assez long pour résister à une tentative.
 */
function generateTemporaryPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
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

// Orange : marque le debut d'une section, la ou sous-titres et libelles
// restent en encre. Un lecteur repere ainsi la structure d'un coup d'oeil.
const cardTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: BRAND.orange,
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
