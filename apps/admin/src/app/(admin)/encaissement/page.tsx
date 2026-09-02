'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  apiGetOrganization,
  apiOrgStripeOnboardingLink,
  apiOrgStripeDelier,
  apiOrgStripeStatus,
  getOrgId,
  type Organization,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

/**
 * Encaissement — le compte Stripe DU CLUB.
 *
 * Une seule inscription pour toutes ses buvettes, et c'est le SEUL endroit où
 * elle se fait. Un compte par comptoir a existé : il obligeait à saisir quatre
 * fois les mêmes coordonnées bancaires, éparpillait la recette sur quatre
 * tableaux de bord, et surtout créait deux écrans annonçant chacun « compte
 * relié » sans que rien ne dise lequel recevait l'argent.
 *
 * Cette page a sa propre entrée de menu parce qu'elle conditionne TOUTE la
 * recette : tant qu'elle n'est pas verte, aucun client ne peut payer, nulle
 * part. La ranger dans les réglages techniques reviendrait à cacher le seul
 * écran qui explique pourquoi rien ne rentre.
 */

const ETATS: Record<string, { label: string; bg: string; color: string; suite: string }> = {
  NOT_ONBOARDED: {
    label: 'Pas encore relié',
    bg: BRAND.bgSubtle,
    color: BRAND.inkSoft,
    suite: 'Vos clients ne peuvent pas payer tant que cette étape n’est pas faite.',
  },
  PENDING: {
    label: 'Inscription en cours',
    bg: '#fef3c7',
    color: '#92400e',
    suite:
      'Stripe attend encore des informations. Reprenez l’inscription, puis vérifiez l’état.',
  },
  ACTIVE: {
    label: '✓ Vous pouvez encaisser',
    bg: '#d1fae5',
    color: '#065f46',
    suite: 'Toutes vos buvettes encaissent sur ce compte.',
  },
  RESTRICTED: {
    label: 'Compte restreint',
    bg: '#fee2e2',
    color: '#991b1b',
    suite:
      'Stripe a limité ce compte. Ouvrez votre tableau de bord Stripe pour voir ce qui manque.',
  },
  REJECTED: {
    label: 'Compte refusé',
    bg: '#fee2e2',
    color: '#991b1b',
    suite: 'Stripe a refusé ce compte. Contactez leur support.',
  },
};

export default function EncaissementPage() {
  const orgId = getOrgId();
  const [org, setOrg] = useState<Organization | null>(null);
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState('');

  const charger = useCallback(async () => {
    try {
      setOrg(await apiGetOrganization(orgId));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setChargement(false);
    }
  }, [orgId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function inscrire() {
    setOccupe(true);
    setMessage('');
    try {
      const { url } = await apiOrgStripeOnboardingLink(orgId);
      // Rearmé AVANT de partir : une redirection qui n'aboutit pas ne doit pas
      // laisser un bouton mort, sans explication.
      setOccupe(false);
      if (!url) {
        setMessage('Stripe n’a pas renvoyé d’adresse d’inscription. Réessayez.');
        return;
      }
      window.location.assign(url);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur');
      setOccupe(false);
    }
  }

  /**
   * Relier un AUTRE compte que celui enregistré.
   *
   * « Reprendre l'inscription » réutilise le compte déjà lié : impossible d'en
   * changer sans cette porte de sortie. Le cas se produit dès qu'on s'est
   * trompé de compte au moment de l'inscription — un doublon, un compte pris
   * dans le mauvais environnement de test.
   *
   * Rien n'est supprimé chez Stripe : le compte garde son historique et son
   * solde. La confirmation le dit, parce que « délier » se lit facilement
   * comme « effacer ».
   */
  async function delier() {
    const ok = window.confirm(
      'Oublier ce compte Stripe ?\n\n' +
        'Le compte n’est PAS supprimé chez Stripe : il garde son historique et son solde. ' +
        'Seul le lien avec votre club est effacé, pour vous permettre d’en relier un autre.\n\n' +
        'Tant qu’un nouveau compte n’est pas relié, vos clients ne pourront plus payer.',
    );
    if (!ok) return;

    setOccupe(true);
    setMessage('');
    try {
      await apiOrgStripeDelier(orgId);
      setMessage('Compte oublié. Appuyez sur « Se connecter à Stripe » pour en relier un autre.');
      await charger();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setOccupe(false);
    }
  }

  async function verifier() {
    setOccupe(true);
    setMessage('');
    try {
      const maj = await apiOrgStripeStatus(orgId);
      setMessage(
        maj.stripeChargesEnabled
          ? '✓ Tout est en ordre : vos buvettes peuvent encaisser.'
          : 'Stripe attend encore des informations.',
      );
      await charger();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setOccupe(false);
    }
  }

  if (chargement) {
    return (
      <div style={{ padding: 32, color: BRAND.grey, fontFamily: BRAND.font }}>Chargement…</div>
    );
  }

  const etat = ETATS[org?.stripeAccountStatus ?? 'NOT_ONBOARDED'] ?? ETATS.NOT_ONBOARDED;

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font, maxWidth: 760 }}>
      <h1
        style={{
          fontSize: 26,
          fontWeight: 600,
          color: BRAND.ink,
          margin: 0,
          letterSpacing: -0.3,
        }}
      >
        Encaissement
      </h1>
      <p style={{ color: BRAND.grey, fontSize: 14, margin: '4px 0 24px' }}>
        L’argent des commandes arrive sur le compte Stripe de votre club — une seule inscription
        pour toutes vos buvettes.
      </p>

      <div
        style={{
          background: BRAND.surface,
          borderRadius: 12,
          padding: 24,
          border: `2px solid ${BRAND.orange}`,
          boxShadow: BRAND.shadowSoft,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          <span
            style={{
              background: etat.bg,
              color: etat.color,
              borderRadius: 999,
              padding: '5px 16px',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {etat.label}
          </span>
          {org?.stripeAccountId && (
            <span style={{ color: BRAND.grey, fontSize: 12, fontFamily: 'monospace' }}>
              {org.stripeAccountId}
            </span>
          )}
        </div>

        <p style={{ color: BRAND.inkSoft, fontSize: 14, margin: '0 0 18px', lineHeight: 1.6 }}>
          {etat.suite}
        </p>

        {message && (
          <div
            style={{
              color: message.startsWith('✓') ? '#065f46' : '#dc2626',
              fontSize: 13.5,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void inscrire()}
            disabled={occupe}
            style={{
              background: occupe ? BRAND.grey : BRAND.orange,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '11px 20px',
              fontWeight: 600,
              fontSize: 14,
              cursor: occupe ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {org?.stripeAccountId ? 'Reprendre l’inscription Stripe' : 'Se connecter à Stripe'}
          </button>

          {org?.stripeAccountId && (
            <button
              type="button"
              onClick={() => void verifier()}
              disabled={occupe}
              style={{
                background: BRAND.surface,
                color: BRAND.ink,
                border: `1px solid ${BRAND.border}`,
                borderRadius: 8,
                padding: '11px 20px',
                fontWeight: 600,
                fontSize: 14,
                cursor: occupe ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Vérifier l’état
            </button>
          )}

          {org?.stripeAccountId && (
            <button
              type="button"
              onClick={() => void delier()}
              disabled={occupe}
              style={{
                background: 'none',
                color: BRAND.grey,
                border: 'none',
                padding: '11px 8px',
                fontWeight: 600,
                fontSize: 13.5,
                cursor: occupe ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'underline',
              }}
            >
              Relier un autre compte
            </button>
          )}
        </div>

        <p style={{ color: BRAND.grey, fontSize: 12.5, margin: '16px 0 0', lineHeight: 1.6 }}>
          L’inscription s’ouvre sur le site de Stripe : vous pouvez vous y connecter avec un compte
          Stripe existant. Le lien ne sert qu’une fois — s’il expire, réappuyez sur le bouton. Au
          retour, cliquez sur « Vérifier l’état ».
        </p>
      </div>

    </div>
  );
}
