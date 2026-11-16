'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  apiAccepterInvitation,
  apiMeWithMemberships,
  apiRefuserInvitation,
  clearSession,
  getToken,
  type InvitationRecue,
  type MeWithMemberships,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import { BreakEatLogo } from '@/components/brand/BreakEatLogo';

/**
 * LES INVITATIONS À ACCEPTER (16/11/2026).
 *
 * Un club qui invite un compte QUI EXISTE DÉJÀ ne le rattache plus d'office :
 * la personne arrive ici à sa connexion et décide. Tant qu'elle n'a pas
 * accepté, elle n'a aucun droit dans ce club.
 */
const LIBELLE_ROLE: Record<string, string> = {
  ORG_ADMIN: 'Responsable',
  MANAGER: 'Manager',
  OPERATOR: 'Opérateur',
  MARKETING: 'Marketing',
};

export default function InvitationsPage() {
  const router = useRouter();
  const [moi, setMoi] = useState<MeWithMemberships | null>(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      setMoi(await apiMeWithMemberships());
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    void charger();
  }, [charger, router]);

  /** Entre dans le tableau de bord d'un club dont on est membre. */
  function entrer(orgId: string, nom: string) {
    localStorage.setItem('admin_org_id', orgId);
    localStorage.setItem('admin_org_name', nom);
    router.replace('/dashboard');
  }

  async function accepter(inv: InvitationRecue) {
    setEnCours(inv.id);
    setErreur('');
    try {
      await apiAccepterInvitation(inv.id);
      entrer(inv.organization.id, inv.organization.name);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Impossible d’accepter cette invitation');
      setEnCours(null);
      await charger();
    }
  }

  async function refuser(inv: InvitationRecue) {
    if (!confirm(`Refuser l’invitation de ${inv.organization.name} ?`)) return;
    setEnCours(inv.id);
    setErreur('');
    try {
      await apiRefuserInvitation(inv.id);
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Impossible de refuser cette invitation');
    } finally {
      setEnCours(null);
    }
  }

  const invitations = moi?.invitations ?? [];
  const premiere = moi?.memberships[0];

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: BRAND.bg,
        fontFamily: BRAND.font,
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: '36px 32px 28px',
          width: 480,
          maxWidth: '100%',
          border: `2px solid ${BRAND.orange}`,
          boxShadow: BRAND.shadowSoft,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <BreakEatLogo size={48} showWordmark />
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 800, color: BRAND.ink, margin: 0, textAlign: 'center' }}>
          {invitations.length > 1 ? 'Des clubs vous invitent' : 'Un club vous invite'}
        </h1>
        <p style={{ fontSize: 14, color: BRAND.grey, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
          Acceptez pour rejoindre son équipe avec votre compte. Tant que vous n’avez pas
          accepté, ce club n’a aucun accès à votre compte, ni vous au sien.
        </p>

        {erreur ? (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 12px', color: '#991b1b', fontSize: 13 }}>
            {erreur}
          </div>
        ) : null}

        {moi === null && !erreur ? (
          <div style={{ color: BRAND.grey, fontSize: 14, textAlign: 'center' }}>Chargement…</div>
        ) : null}

        {invitations.map((inv) => (
          <div
            key={inv.id}
            style={{
              border: `1.5px solid ${BRAND.border}`,
              borderRadius: 14,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {inv.organization.logoUrl ? (
                <img
                  src={inv.organization.logoUrl}
                  alt=""
                  style={{ width: 42, height: 42, objectFit: 'contain', borderRadius: 8 }}
                />
              ) : null}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: BRAND.ink, fontSize: 15.5 }}>{inv.organization.name}</div>
                <div style={{ color: BRAND.grey, fontSize: 13 }}>
                  {LIBELLE_ROLE[inv.orgRole] ?? inv.orgRole}
                  {inv.supplier ? ` · ${inv.supplier.name}` : ''}
                  {' · valable jusqu’au '}
                  {new Date(inv.expiresAt).toLocaleDateString('fr-FR')}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => void accepter(inv)}
                disabled={enCours !== null}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: BRAND.orange,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: enCours ? 'wait' : 'pointer',
                }}
              >
                {enCours === inv.id ? 'Un instant…' : 'Accepter'}
              </button>
              <button
                type="button"
                onClick={() => void refuser(inv)}
                disabled={enCours !== null}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1.5px solid ${BRAND.border}`,
                  background: '#fff',
                  color: BRAND.ink,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: enCours ? 'wait' : 'pointer',
                }}
              >
                Refuser
              </button>
            </div>
          </div>
        ))}

        {moi && invitations.length === 0 ? (
          <div style={{ color: BRAND.grey, fontSize: 14, textAlign: 'center' }}>
            Aucune invitation en attente.
          </div>
        ) : null}

        {/* Plus tard : vers son club actuel s'il en a un ; sinon, se déconnecter. */}
        {moi ? (
          premiere ? (
            <button
              type="button"
              onClick={() => entrer(premiere.organizationId, premiere.organization.name)}
              style={{ background: 'none', border: 'none', color: BRAND.grey, fontSize: 13.5, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Plus tard — aller à {premiere.organization.name}
            </button>
          ) : moi.globalRole === 'SUPER_ADMIN' ? (
            <button
              type="button"
              onClick={() => router.replace('/dashboard')}
              style={{ background: 'none', border: 'none', color: BRAND.grey, fontSize: 13.5, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Plus tard — aller au tableau de bord
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                clearSession();
                router.replace('/login');
              }}
              style={{ background: 'none', border: 'none', color: BRAND.grey, fontSize: 13.5, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Plus tard — se déconnecter
            </button>
          )
        ) : null}
      </div>
    </main>
  );
}
