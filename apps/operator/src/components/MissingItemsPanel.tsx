'use client';

import { useState } from 'react';
import { BRAND } from '@break-eat/brand';

/** Rouge d'alerte, partagé avec la carte : un manque se voit de loin. */
export const ROUGE_MANQUANT = '#b91c1c';
export const FOND_MANQUANT = '#fef2f2';

export interface LigneSignalable {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  missingQuantity?: number;
}

export interface LigneManquante {
  orderItemId: string;
  missingQuantity: number;
}

/**
 * Le panneau « Produit manquant » d'une carte de commande.
 *
 * Pensé pour un comptoir en plein service : une touche par ligne pour la
 * déclarer manquante en entier, un compteur seulement quand le client en a
 * pris plusieurs. « Retirer de la carte » est coché d'emblée — si le produit
 * manque pour ce client, il manquera pour le suivant.
 *
 * Le panneau reprend l'état déjà signalé : rouvrir la carte permet de corriger
 * une erreur (remettre une ligne à zéro retire le signalement).
 */
export function MissingItemsPanel({
  lignes,
  onValider,
  onFermer,
}: {
  lignes: LigneSignalable[];
  onValider: (lignes: LigneManquante[], retirerDeLaCarte: boolean) => Promise<void>;
  onFermer: () => void;
}) {
  const [manquants, setManquants] = useState<Record<string, number>>(() =>
    Object.fromEntries(lignes.map((l) => [l.id, l.missingQuantity ?? 0])),
  );
  const [retirer, setRetirer] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const initial = (id: string) => lignes.find((l) => l.id === id)?.missingQuantity ?? 0;
  const modifiees = lignes.filter((l) => (manquants[l.id] ?? 0) !== initial(l.id));
  const auMoinsUn = Object.values(manquants).some((n) => n > 0);
  // « Retirer le signalement » n'a de sens que s'il y en avait un : sinon le
  // bouton, même grisé, annoncerait une action qui n'existe pas.
  const dejaSignale = lignes.some((l) => (l.missingQuantity ?? 0) > 0);

  const regler = (l: LigneSignalable, n: number) =>
    setManquants((m) => ({ ...m, [l.id]: Math.max(0, Math.min(l.quantity, n)) }));

  const valider = async () => {
    if (modifiees.length === 0 || envoi) return;
    setEnvoi(true);
    setErreur('');
    try {
      await onValider(
        modifiees.map((l) => ({ orderItemId: l.id, missingQuantity: manquants[l.id] ?? 0 })),
        retirer,
      );
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le signalement a échoué.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${ROUGE_MANQUANT}55`,
        background: FOND_MANQUANT,
        borderRadius: 10,
        padding: 10,
        marginBottom: 10,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 800, color: ROUGE_MANQUANT, marginBottom: 6 }}>
        Qu’est-ce qui manque ?
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px' }}>
        {lignes.map((l) => {
          const n = manquants[l.id] ?? 0;
          const actif = n > 0;
          return (
            <li
              key={l.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 0',
                fontSize: 13,
              }}
            >
              <button
                type="button"
                onClick={() => regler(l, actif ? 0 : l.quantity)}
                aria-pressed={actif}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  border: `1px solid ${actif ? ROUGE_MANQUANT : BRAND.border}`,
                  background: actif ? ROUGE_MANQUANT : '#fff',
                  color: actif ? '#fff' : BRAND.ink,
                  borderRadius: 8,
                  padding: '6px 8px',
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {l.productNameSnapshot}
                <span style={{ fontWeight: 400, opacity: 0.85 }}>
                  {' '}
                  · {l.quantity} commandé{l.quantity > 1 ? 's' : ''}
                </span>
              </button>

              {/* Le compteur n'a de sens que si le client en a pris plusieurs. */}
              {l.quantity > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Pas label="−" onClick={() => regler(l, n - 1)} disabled={n === 0} />
                  <span
                    aria-label={`${n} manquant(s)`}
                    style={{
                      minWidth: 22,
                      textAlign: 'center',
                      fontWeight: 800,
                      color: actif ? ROUGE_MANQUANT : BRAND.grey,
                    }}
                  >
                    {n}
                  </span>
                  <Pas label="+" onClick={() => regler(l, n + 1)} disabled={n === l.quantity} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: BRAND.inkSoft,
          marginBottom: 8,
        }}
      >
        <input type="checkbox" checked={retirer} onChange={(e) => setRetirer(e.target.checked)} />
        Retirer ces produits de la carte (HS)
      </label>

      {erreur && (
        <div style={{ fontSize: 12, color: ROUGE_MANQUANT, marginBottom: 6 }}>{erreur}</div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => void valider()}
          disabled={modifiees.length === 0 || envoi}
          style={{
            flex: 1,
            background: modifiees.length === 0 || envoi ? BRAND.bgSubtle : ROUGE_MANQUANT,
            color: modifiees.length === 0 || envoi ? BRAND.grey : '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '7px 0',
            fontWeight: 700,
            fontSize: 12.5,
            cursor: modifiees.length === 0 || envoi ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {envoi
            ? 'Envoi…'
            : !auMoinsUn && dejaSignale
              ? 'Retirer le signalement'
              : 'Prévenir le client'}
        </button>
        <button
          type="button"
          onClick={onFermer}
          style={{
            background: '#fff',
            color: BRAND.inkSoft,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            padding: '7px 10px',
            fontWeight: 600,
            fontSize: 12.5,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

function Pas({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        border: `1px solid ${BRAND.border}`,
        background: disabled ? BRAND.bgSubtle : '#fff',
        color: disabled ? BRAND.grey : BRAND.ink,
        fontWeight: 800,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}
