'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import {
  apiApercuDemo,
  apiPurgerDemo,
  formatEuros,
  type ApercuDemo,
} from '@/lib/api/backoffice-client';

/**
 * Les commandes de l'ancien passage en caisse de démonstration.
 *
 * Elles sont enregistrées comme payées alors qu'aucun paiement n'a eu lieu :
 * elles gonflent le chiffre d'affaires affiché juste en dessous. L'encart ne
 * s'affiche que s'il en reste — une fois la purge faite, il disparaît.
 *
 * La purge est irréversible : la phrase de confirmation doit être recopiée,
 * et le détail par organisation est montré AVANT, pour qu'on sache ce qu'on
 * efface.
 */
export function PurgeDemo() {
  const client = useQueryClient();
  const [phrase, setPhrase] = useState('');

  const { data } = useQuery<ApercuDemo>({
    queryKey: ['backoffice', 'demo'],
    queryFn: apiApercuDemo,
  });

  const purge = useMutation({
    mutationFn: () => apiPurgerDemo(phrase),
    onSuccess: () => {
      setPhrase('');
      // Les indicateurs changent : ils comptaient ces commandes.
      void client.invalidateQueries({ queryKey: ['backoffice'] });
    },
  });

  if (purge.isSuccess) {
    const b = purge.data;
    return (
      <Encart>
        <strong style={{ color: BRAND.ink }}>Démonstration purgée.</strong> {b.commandes} commande
        {b.commandes > 1 ? 's' : ''} et {b.paiements} paiement
        {b.paiements > 1 ? 's' : ''} effacés, {b.soldesCorriges} solde
        {b.soldesCorriges > 1 ? 's' : ''} de points rétabli{b.soldesCorriges > 1 ? 's' : ''},{' '}
        {b.creneaux} créneau{b.creneaux > 1 ? 'x' : ''} libéré{b.creneaux > 1 ? 's' : ''}.
      </Encart>
    );
  }

  if (!data || data.commandes === 0) return null;

  const pret = phrase.trim() === data.phraseConfirmation;

  return (
    <Encart>
      <h2 style={{ fontSize: 16, margin: '0 0 6px', color: BRAND.ink }}>
        {data.commandes} commande{data.commandes > 1 ? 's' : ''} de démonstration faussent ces
        chiffres
      </h2>
      <p style={{ margin: '0 0 12px', color: BRAND.inkSoft, lineHeight: 1.55 }}>
        Créées par l’ancien passage en caisse de démonstration, elles sont enregistrées comme payées
        alors qu’aucun paiement n’a eu lieu : {formatEuros(data.montantCents)} comptés à tort, sur{' '}
        {data.comptes} compte{data.comptes > 1 ? 's' : ''}. Elles apparaissent aussi dans « Mes
        commandes » et empêchent de supprimer les comptes de test qui les portent.
      </p>

      <ul style={{ margin: '0 0 14px', paddingLeft: 18, color: BRAND.inkSoft, fontSize: 13.5 }}>
        {data.parOrganisation.map((o) => (
          <li key={o.organizationId}>
            {o.nom} — {o.commandes} commande{o.commandes > 1 ? 's' : ''},{' '}
            {formatEuros(o.montantCents)}
          </li>
        ))}
      </ul>

      <p style={{ margin: '0 0 8px', fontSize: 13, color: BRAND.grey }}>
        La purge efface ces commandes, leurs paiements et leurs mouvements de points (les soldes
        sont rétablis), et rend les places de créneau. Les vraies commandes ne sont pas touchées.
        C’est définitif. Pour confirmer, recopiez : <strong>{data.phraseConfirmation}</strong>
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          // Pas la phrase elle-même : grisée dans le champ, elle passait pour déjà saisie.
          placeholder="Recopiez la phrase ci-dessus"
          aria-label="Phrase de confirmation"
          style={{
            flex: '1 1 220px',
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${BRAND.border}`,
            fontSize: 14,
          }}
        />
        <button
          type="button"
          disabled={!pret || purge.isPending}
          onClick={() => purge.mutate()}
          style={{
            padding: '10px 18px',
            borderRadius: 999,
            border: 0,
            fontWeight: 700,
            fontSize: 14,
            color: '#fff',
            background: pret ? '#b91c1c' : BRAND.orangeSoft,
            cursor: pret ? 'pointer' : 'not-allowed',
          }}
        >
          {purge.isPending ? 'Purge en cours…' : 'Purger la démonstration'}
        </button>
      </div>

      {purge.isError && (
        <p style={{ margin: '10px 0 0', color: '#b91c1c', fontSize: 13 }}>
          {purge.error instanceof Error ? purge.error.message : 'La purge a échoué.'}
        </p>
      )}
    </Encart>
  );
}

function Encart({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        background: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        borderLeft: '4px solid #b91c1c',
        borderRadius: 14,
        padding: '18px 20px',
        marginBottom: 28,
        fontSize: 14,
        boxShadow: BRAND.shadowCard,
      }}
    >
      {children}
    </section>
  );
}
