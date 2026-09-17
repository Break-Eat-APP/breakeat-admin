'use client';

import { useCallback, useEffect, useState } from 'react';
import { BRAND } from '@break-eat/brand';
import {
  changerDisponibiliteProduit,
  fetchProduitsBuvette,
  type ProduitCarte,
} from '@/lib/api/orders-client';
import { ROUGE_MANQUANT, FOND_MANQUANT } from './MissingItemsPanel';

/**
 * Les produits de la buvette retirés de la carte (HS).
 *
 * C'est le comptoir qui sait quand un fût est changé ou un carton arrivé : il
 * doit pouvoir remettre un produit en vente sans attendre un manager. Le
 * bandeau n'apparaît que s'il y a quelque chose à remettre — un comptoir sans
 * produit HS n'a rien à lire ici.
 *
 * `version` change à chaque signalement : le bandeau se relit aussitôt, sans
 * attendre son rafraîchissement périodique.
 */
export function ProduitsHsBar({
  orgId,
  supplierId,
  token,
  version,
}: {
  orgId: string | null;
  supplierId: string | null;
  token: string;
  version: number;
}) {
  const [hs, setHs] = useState<ProduitCarte[]>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    if (!orgId || !supplierId) return;
    try {
      const produits = await fetchProduitsBuvette(orgId, supplierId, token);
      setHs(produits.filter((p) => p.status === 'OUT_OF_STOCK'));
    } catch {
      // Un bandeau secondaire ne doit pas faire tomber le poste : on garde le
      // dernier état connu et on réessaie au prochain tour.
    }
  }, [orgId, supplierId, token]);

  useEffect(() => {
    void charger();
    // Un autre poste, ou le manager, peut remettre un produit en vente.
    const t = setInterval(() => void charger(), 60_000);
    return () => clearInterval(t);
  }, [charger, version]);

  if (!orgId || !supplierId || hs.length === 0) return null;

  const remettre = async (p: ProduitCarte) => {
    setEnCours(p.id);
    setErreur('');
    try {
      await changerDisponibiliteProduit(orgId, supplierId, p.id, true, token);
      setHs((liste) => liste.filter((x) => x.id !== p.id));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de remettre ce produit en vente.');
    } finally {
      setEnCours(null);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        background: FOND_MANQUANT,
        borderBottom: `1px solid ${ROUGE_MANQUANT}33`,
        fontFamily: BRAND.font,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 800, color: ROUGE_MANQUANT }}>
        Hors carte ({hs.length})
      </span>
      {hs.map((p) => (
        <span
          key={p.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#fff',
            border: `1px solid ${ROUGE_MANQUANT}44`,
            borderRadius: 999,
            padding: '3px 4px 3px 10px',
            fontSize: 12.5,
            color: BRAND.ink,
          }}
        >
          {p.name}
          <button
            type="button"
            onClick={() => void remettre(p)}
            disabled={enCours === p.id}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '3px 10px',
              background: enCours === p.id ? BRAND.bgSubtle : '#15803d',
              color: enCours === p.id ? BRAND.grey : '#fff',
              fontWeight: 700,
              fontSize: 11.5,
              cursor: enCours === p.id ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {enCours === p.id ? '…' : 'Remettre en vente'}
          </button>
        </span>
      ))}
      {erreur && <span style={{ fontSize: 12, color: ROUGE_MANQUANT }}>{erreur}</span>}
    </div>
  );
}
