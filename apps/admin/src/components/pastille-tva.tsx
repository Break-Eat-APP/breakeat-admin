'use client';

import { TAUX_TVA, couleurTva, libelleTva } from '@/lib/tva';
import type { Product } from '@/lib/api/admin-client';

/**
 * Le taux de TVA d'un produit, lisible d'un coup d'œil et modifiable sur place.
 *
 * C'est un `select` déguisé en pastille, et non un bouton « Modifier » ouvrant
 * un formulaire : corriger la TVA d'une carte de trente produits ne doit pas
 * demander trente allers-retours. La couleur distingue le 20 % du reste — sur
 * une liste, l'erreur qu'on cherche est presque toujours une bière restée à 10 %.
 */
export function PastilleTva({
  produit,
  occupe,
  onChange,
}: {
  produit: Pick<Product, 'vatRateBps' | 'name'>;
  occupe: boolean;
  onChange: (bps: number) => void;
}) {
  const bps = produit.vatRateBps ?? 1000;
  const { bg, fg } = couleurTva(bps);
  return (
    <select
      value={bps}
      disabled={occupe}
      onChange={(e) => onChange(Number(e.target.value))}
      title={`TVA ${libelleTva(bps)} — cliquez pour changer`}
      aria-label={`Taux de TVA de ${produit.name}`}
      style={{
        background: occupe ? '#e5e7eb' : bg,
        color: occupe ? '#6b7280' : fg,
        border: 'none',
        borderRadius: 999,
        padding: '4px 8px',
        fontSize: 12,
        fontWeight: 700,
        cursor: occupe ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        // Une largeur fixe évite que la liste tressaute en passant de
        // « 5,5 % » à « 10 % » sur chaque ligne.
        width: 74,
        textAlign: 'center',
      }}
    >
      {TAUX_TVA.map((t) => (
        <option key={t.bps} value={t.bps}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
