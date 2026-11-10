'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseCoordsString, parseSingleCoord, fmtCoord } from '@/lib/coords';
import { BRAND } from '@break-eat/brand';
import {
  apiListOrganizations,
  apiCreateOrganization,
  apiCreateVenue,
  apiActivateOrganization,
  apiDeactivateOrganization,
  apiDeleteOrganization,
  apiInviteMember,
  VENUE_MODE_OPTIONS,
  type OrgListItem,
  type VenueOperatingMode,
} from '@/lib/api/backoffice-client';
import { lienTableauDeBord, motDePasseProvisoire, TABLEAU_DE_BORD_URL } from '@/lib/acces-lieu';
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

  /**
   * CE QUI A DÉJÀ ÉTÉ CRÉÉ par une tentative restée inachevée.
   *
   * La création se fait en trois écritures (club, lieu, accès) qu'aucune
   * transaction ne réunit. Si la deuxième ou la troisième échoue, les
   * précédentes ont bel et bien eu lieu : relancer sans mémoire produirait un
   * doublon. On reprend là où ça s'est arrêté ; tout se vide quand le
   * formulaire est réinitialisé.
   */
  const orgCreeRef = useRef<{ id: string; name: string } | null>(null);
  const lieuCreeRef = useRef(false);

  /*
    UN SEUL ÉCRAN, CE QUI SE DÉCIDE À LA SIGNATURE (décision de Rémi, 10/11).

    Le reste — photo, plan, mots-clés, fidélité, fuseau, événements, liens
    Flaix, adversaires — se règle dans le tableau de bord du lieu, par le
    responsable ou par le super admin via « Programmer ce lieu ». Le saisir
    ici aussi, c'était deux formulaires pour un même lieu.
  */
  const [nom, setNom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [gpsBrut, setGpsBrut] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [gpsErreur, setGpsErreur] = useState('');
  const [rythme, setRythme] = useState<VenueOperatingMode>('EVENT_BASED');
  const [flaix, setFlaix] = useState(true);
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState(() => motDePasseProvisoire());

  const [formError, setFormError] = useState('');
  const [step, setStep] = useState<'idle' | 'org' | 'venue' | 'acces'>('idle');
  /** Ce qu'on remet au responsable — affiché UNE fois : le mot de passe est ensuite haché. */
  const [cree, setCree] = useState<{
    org: { id: string; name: string };
    email: string;
    motDePasse: string | null;
  } | null>(null);

  const handleGps = useCallback((value: string) => {
    setGpsBrut(value);
    if (!value.trim()) {
      setGpsErreur('');
      setLat('');
      setLng('');
      return;
    }
    const parsed = parseCoordsString(value);
    if (parsed) {
      setLat(fmtCoord(parsed.lat));
      setLng(fmtCoord(parsed.lng));
      setGpsErreur('');
    } else {
      setGpsErreur('Format non reconnu. Essaie « 43.296, 5.404 » ou « 43° 17′ 45.6″ N, 5° 24′ 17.2″ E ».');
    }
  }, []);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['backoffice', 'organizations'] });

  const resetForm = () => {
    setNom('');
    setAdresse('');
    setGpsBrut('');
    setLat('');
    setLng('');
    setGpsErreur('');
    setRythme('EVENT_BASED');
    setFlaix(true);
    setEmail('');
    setMotDePasse(motDePasseProvisoire());
    setFormError('');
    setStep('idle');
    orgCreeRef.current = null;
    lieuCreeRef.current = false;
  };

  const createMut = useMutation({
    mutationFn: async () => {
      // Tout valider AVANT la moindre écriture : une erreur de saisie ne doit
      // jamais laisser un club à moitié créé.
      if (gpsBrut.trim() && (!lat || !lng)) {
        throw new Error('Coordonnées GPS non reconnues — corrige-les ou vide le champ.');
      }
      const latitude = lat ? parseSingleCoord(lat) : null;
      const longitude = lng ? parseSingleCoord(lng) : null;
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        throw new Error('L’adresse e-mail du responsable n’est pas valide.');
      }
      if (motDePasse.trim().length < 8) {
        throw new Error('Le mot de passe doit faire au moins 8 caractères.');
      }

      let org = orgCreeRef.current;
      if (!org) {
        setStep('org');
        const o = await apiCreateOrganization({ name: nom.trim(), slug: slugify(nom) });
        org = { id: o.id, name: o.name };
        orgCreeRef.current = org;
      }

      if (!lieuCreeRef.current) {
        setStep('venue');
        await apiCreateVenue(org.id, {
          name: nom.trim(),
          address: adresse.trim(),
          latitude,
          longitude,
          operatingMode: rythme,
          flaixEnabled: flaix,
        });
        lieuCreeRef.current = true;
      }

      setStep('acces');
      const membre = await apiInviteMember(org.id, {
        email: email.trim(),
        role: 'ORG_ADMIN',
        temporaryPassword: motDePasse.trim(),
      });
      // Le mot de passe ne vaut que pour un compte NEUF : un compte existant
      // garde le sien, et l'afficher enverrait le responsable se connecter
      // avec un mot de passe qui ne marche pas.
      return {
        org,
        email: membre.user.email,
        motDePasse: membre.accountCreated ? motDePasse.trim() : null,
      };
    },
    onSuccess: (resultat) => {
      setCree(resultat);
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
  /**
   * La suppression d'un club : on recopie son nom, et le serveur peut refuser.
   *
   * Le refus n'est pas une panne — « ce club porte 42 commandes, faites une
   * remise à zéro d'abord » dit exactement quoi faire.
   */
  const deleteMut = useMutation({
    mutationFn: ({ id, confirmation }: { id: string; confirmation: string }) =>
      apiDeleteOrganization(id, confirmation),
    onSuccess: invalidate,
    onError: (e: unknown) =>
      window.alert(e instanceof Error ? e.message : 'Suppression impossible.'),
  });

  const pending = createMut.isPending;

  return (
    <div style={{ padding: '30px 36px 56px', maxWidth: 1500 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{
            fontFamily: BRAND.fontDisplay,
            fontSize: 30,
            fontWeight: 800,
            color: BRAND.ink,
            margin: 0,
            letterSpacing: -0.6,
          }}>Organisations</h1>
          <p style={{ fontSize: 14.5, color: BRAND.grey, margin: '7px 0 0', lineHeight: 1.5 }}>
            Crée un lieu et l’accès de son responsable. Tout le reste se programme dans le
            tableau de bord du lieu.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((s) => !s);
            if (showForm) resetForm();
            setCree(null);
          }}
          style={primaryBtn}
        >
          {showForm ? 'Annuler' : '+ Nouveau lieu'}
        </button>
      </header>

      {/* ── Ce qu'on remet au responsable ─────────────────────────────────── */}
      {cree && (
        <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 14, padding: 20, marginBottom: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#065f46', marginBottom: 10 }}>
            « {cree.org.name} » est créé.
          </div>
          <div style={{ fontSize: 14, color: BRAND.ink, lineHeight: 1.8 }}>
            <div>Tableau de bord : <code>{TABLEAU_DE_BORD_URL}</code></div>
            <div>E-mail : <code>{cree.email}</code></div>
            {cree.motDePasse ? (
              <div>Mot de passe : <code>{cree.motDePasse}</code></div>
            ) : (
              <div style={{ color: BRAND.inkSoft }}>
                Cette adresse avait déjà un compte Break Eat : elle garde son mot de passe et
                accède maintenant à ce lieu.
              </div>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: BRAND.grey, margin: '10px 0 14px' }}>
            Le mot de passe ne sera plus affiché : copie-le maintenant. Tu pourras en générer un
            nouveau depuis la fiche du lieu.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={secondaryBtn}
              onClick={() =>
                void navigator.clipboard?.writeText(
                  `Tableau de bord : ${TABLEAU_DE_BORD_URL}\nE-mail : ${cree.email}` +
                    (cree.motDePasse ? `\nMot de passe : ${cree.motDePasse}` : ''),
                )
              }
            >
              Copier les identifiants
            </button>
            <a
              href={lienTableauDeBord(cree.org)}
              target="_blank"
              rel="noreferrer"
              style={{ ...primaryBtn, textDecoration: 'none' }}
            >
              Programmer ce lieu →
            </a>
          </div>
        </div>
      )}

      {/* ── Nouveau lieu ──────────────────────────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate();
          }}
          style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 24, marginBottom: 28 }}
        >
          <SectionTitle>Le lieu</SectionTitle>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            <Field label="Nom du lieu" style={{ flex: 2, minWidth: 200 }}>
              <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Orange Vélodrome" required style={inputStyle} />
            </Field>
            <Field label="Adresse" style={{ flex: 3, minWidth: 240 }}>
              <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="3 boulevard Michelet, 13008 Marseille" required style={inputStyle} />
            </Field>
          </div>

          <div style={{ marginBottom: 14 }}>
            <Field label="Coordonnées GPS (optionnel) — colle-les depuis Google Maps, pour placer le lieu sur la carte">
              <input
                value={gpsBrut}
                onChange={(e) => handleGps(e.target.value)}
                placeholder="ex. 43.2698, 5.3959"
                style={inputStyle}
              />
              {gpsErreur && <span style={{ fontSize: 12, color: '#dc2626', marginTop: 2, display: 'block' }}>{gpsErreur}</span>}
              {lat && lng && !gpsErreur && (
                <span style={{ fontSize: 12, color: '#059669', marginTop: 2, display: 'block' }}>→ Lat {lat} · Lng {lng}</span>
              )}
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
            <Field label="Rythme" style={{ flex: 1, minWidth: 260 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {VENUE_MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      padding: '10px 12px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: '#fff',
                      border: `1.5px solid ${rythme === opt.value ? BRAND.orange : BRAND.border}`,
                    }}
                  >
                    <input
                      type="radio"
                      name="rythme"
                      checked={rythme === opt.value}
                      onChange={() => setRythme(opt.value)}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.ink }}>{opt.label}</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: BRAND.grey, marginTop: 2 }}>{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Commande" style={{ flex: 1, minWidth: 260 }}>
              <label
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: '#fff',
                  border: `1.5px solid ${BRAND.border}`,
                  cursor: 'pointer',
                }}
              >
                <input type="checkbox" checked={flaix} onChange={(e) => setFlaix(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.ink }}>La commande passe par Flaix</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: BRAND.grey, marginTop: 2 }}>
                    Le lieu colle ses liens de commande Flaix dans son tableau de bord. Décoché : la
                    commande et le paiement passent par Break Eat.
                  </span>
                </span>
              </label>
            </Field>
          </div>

          <div style={{ borderTop: `1px solid ${BRAND.border}`, margin: '20px 0 16px' }} />

          <SectionTitle>L’accès du responsable</SectionTitle>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Field label="E-mail" style={{ flex: 2, minWidth: 220 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="responsable@club.fr"
                required
                autoComplete="off"
                style={inputStyle}
              />
            </Field>
            <Field label="Mot de passe provisoire" style={{ flex: 2, minWidth: 220 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
                />
                <button type="button" onClick={() => setMotDePasse(motDePasseProvisoire())} style={secondaryBtn} title="En générer un autre">
                  ↻
                </button>
              </div>
            </Field>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
            <button type="submit" disabled={pending} style={primaryBtn}>
              {pending
                ? step === 'acces'
                  ? 'Création de l’accès…'
                  : step === 'venue'
                    ? 'Création du lieu…'
                    : 'Création…'
                : 'Créer le lieu et son accès'}
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
            const busy = activateMut.isPending || deactivateMut.isPending || deleteMut.isPending;
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
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    disabled={busy}
                    onClick={() => isActive ? deactivateMut.mutate(org.id) : activateMut.mutate(org.id)}
                    style={isActive ? dangerBtnSmall : successBtnSmall}
                  >
                    {isActive ? 'Désactiver' : 'Activer'}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      /*
                        RECOPIER LE NOM, comme pour la remise à zéro.

                        L'ancienne confirmation se validait d'un clic — sur la
                        bonne ligne comme sur sa voisine — et annonçait « et
                        toutes ses données », ce qui était faux : les commandes
                        ne cascadent pas et survivaient, orphelines.

                        Le serveur revérifie, évidemment : cette invite est un
                        garde-fou pour la main, pas une sécurité.
                      */
                      const saisi = window.prompt(
                        `Supprimer définitivement « ${org.name} » ?\n\n` +
                          'Cette action est irréversible. Le serveur refusera tant que ce club ' +
                          'porte des commandes — faites alors une remise à zéro, ou désactivez-le.\n\n' +
                          'Recopiez le nom du club pour confirmer :',
                      );
                      if (saisi === null) return;
                      deleteMut.mutate({ id: org.id, confirmation: saisi });
                    }}
                    style={deleteBtnSmall}
                    title="Supprimer définitivement"
                  >
                    ✕
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

const secondaryBtn: React.CSSProperties = {
  background: '#fff', color: BRAND.ink, border: `1.5px solid ${BRAND.border}`,
  borderRadius: 10, padding: '10px 14px', fontWeight: 600, fontSize: 14,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
};

const deleteBtnSmall: React.CSSProperties = {
  background: '#fff', color: '#dc2626', border: '1px solid #fca5a5',
  borderRadius: 8, padding: '7px 10px', fontWeight: 700, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit',
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
