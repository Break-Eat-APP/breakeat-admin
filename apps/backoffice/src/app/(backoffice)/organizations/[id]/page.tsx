'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import {
  apiGetOrganization,
  apiActivateOrganization,
  apiDeactivateOrganization,
  apiGetVenues,
  apiInviteMember,
  apiRemoveMember,
  apiResetMemberPassword,
  apiResetOrgData,
  type ResetOrgDataResult,
  VENUE_MODE_OPTIONS,
  type OrgDetail,
  type Venue,
} from '@/lib/api/backoffice-client';
import { StatusBadge } from '@/components/status-badge';
import { lienTableauDeBord, motDePasseProvisoire, TABLEAU_DE_BORD_URL } from '@/lib/acces-lieu';

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

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['backoffice', 'organizations', id] });
    qc.invalidateQueries({ queryKey: ['backoffice', 'organizations'] });
  };

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

  /**
   * UN NOUVEAU MOT DE PASSE pour un membre — le recours d'un responsable qui a
   * perdu le sien. Généré ici, affiché une fois, comme à la création.
   */
  const resetPwdMut = useMutation({
    mutationFn: (m: { id: string }) => {
      const motDePasse = motDePasseProvisoire();
      return apiResetMemberPassword(id, m.id, motDePasse).then((r) => ({ ...r, motDePasse }));
    },
    onSuccess: (r) => {
      setAccessNotice('');
      setAccessCreated({ email: r.email, password: r.motDePasse });
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

          {/*
            LE LIEU SE PROGRAMME DANS SON TABLEAU DE BORD (décision de Rémi, 10/11).

            Il y avait ici deux formulaires — « Profil & marque » et « Lieu du
            club » — qui doublaient « Mon lieu » et « Apparence » du tableau de
            bord. Deux écrans pour un même lieu, c'était deux saisies, et tôt
            ou tard deux réglages contradictoires. Le back-office crée ; le
            tableau de bord programme.
          */}
          <section style={card}>
            <h2 style={cardTitle}>Le lieu</h2>
            {venue ? (
              <div style={{ fontSize: 14, color: BRAND.ink, lineHeight: 1.8, marginBottom: 16 }}>
                <div><strong>{venue.name}</strong></div>
                <div style={{ color: BRAND.inkSoft }}>{venue.address}</div>
                <div style={{ color: BRAND.inkSoft }}>
                  {VENUE_MODE_OPTIONS.find((o) => o.value === (venue.operatingMode ?? 'EVENT_BASED'))?.label}
                  {' · '}
                  {venue.flaixEnabled ? 'Commande par Flaix' : 'Commande par Break Eat'}
                  {venue.latitude == null || venue.longitude == null ? ' · pas encore sur la carte (GPS manquant)' : ''}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 14, color: BRAND.grey, margin: '0 0 16px' }}>
                Aucun lieu configuré pour ce club.
              </p>
            )}
            <p style={{ fontSize: 13, color: BRAND.grey, margin: '0 0 16px', lineHeight: 1.55, maxWidth: 640 }}>
              Événements, liens de commande Flaix, adversaires, photo, plan des buvettes, fidélité,
              apparence : tout se programme dans le tableau de bord du lieu — le même que celui
              du responsable.
            </p>
            <a
              href={lienTableauDeBord({ id: data.id, name: data.name })}
              target="_blank"
              rel="noreferrer"
              style={{ ...primaryBtn, display: 'inline-block', textDecoration: 'none' }}
            >
              Programmer ce lieu →
            </a>
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
                inviteMut.mutate({ email, password: accessPassword.trim() || motDePasseProvisoire() });
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
                  <div>Dashboard : <code>{TABLEAU_DE_BORD_URL}</code></div>
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
                              `Donner un nouveau mot de passe à ${m.user.email} ?\n\nL’ancien ne fonctionnera plus.`,
                            )
                          ) {
                            resetPwdMut.mutate({ id: m.id });
                          }
                        }}
                        disabled={resetPwdMut.isPending}
                        style={{ ...primaryBtn, background: '#fff', color: BRAND.ink, border: `1px solid ${BRAND.border}`, padding: '5px 12px', fontSize: 12.5 }}
                      >
                        Nouveau mot de passe
                      </button>
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
