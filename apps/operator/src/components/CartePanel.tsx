'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BRAND } from '@break-eat/brand';
import {
  changerDisponibiliteProduit,
  fetchProduitsBuvette,
  type ProduitCarte,
} from '@/lib/api/orders-client';
import { ROUGE_MANQUANT, FOND_MANQUANT } from './MissingItemsPanel';

/**
 * La carte de la buvette — et le geste qui manquait.
 *
 * Jusqu'ici, un produit ne pouvait passer « en rupture » qu'en RÉACTION : le
 * comptoir signalait un manquant sur une commande déjà passée, et le produit
 * disparaissait de la carte au passage. Autrement dit, il fallait qu'un client
 * ait commandé le Coca pour qu'on puisse dire qu'il n'y en a plus.
 *
 * Or le comptoir sait AVANT. Le fût est vide, le carton est parti : il faut
 * pouvoir retirer le produit tout de suite, sans attendre qu'un client
 * commande ce qu'on ne peut pas lui servir — et sans passer par un manager qui
 * n'est pas derrière le comptoir.
 *
 * Ce que ce panneau NE FAIT PAS : toucher aux autres buvettes. Les produits
 * appartiennent à la buvette ; retirer le sien ne retire celui de personne
 * d'autre, et le serveur refuse tout produit d'une autre buvette.
 */
export function CartePanel({
  orgId,
  supplierId,
  token,
  onChangement,
  onFermer,
}: {
  orgId: string | null;
  supplierId: string | null;
  token: string;
  /** Prévient le bandeau des produits HS qu'il doit se relire. */
  onChangement: () => void;
  onFermer: () => void;
}) {
  const [produits, setProduits] = useState<ProduitCarte[]>([]);
  const [filtre, setFiltre] = useState('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    if (!orgId || !supplierId) return;
    try {
      setProduits(await fetchProduitsBuvette(orgId, supplierId, token));
      setErreur('');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Carte indisponible.');
    } finally {
      setChargement(false);
    }
  }, [orgId, supplierId, token]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const visibles = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    return produits
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [produits, filtre]);

  const basculer = async (p: ProduitCarte, enVente: boolean) => {
    // Le poste n'est pas encore rattaché : il n'y a rien à basculer, et
    // forcer les types ici masquerait le vrai cas (un compte sans buvette).
    if (!orgId || !supplierId) return;

    setEnCours(p.id);
    setErreur('');
    try {
      await changerDisponibiliteProduit(orgId, supplierId, p.id, enVente, token);
      setProduits((liste) =>
        liste.map((x) => (x.id === p.id ? { ...x, status: enVente ? 'ACTIVE' : 'OUT_OF_STOCK' } : x)),
      );
      // Le bandeau du haut liste les produits retirés : il doit suivre.
      onChangement();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Changement impossible.');
    } finally {
      setEnCours(null);
    }
  };

  const enRupture = produits.filter((p) => p.status === 'OUT_OF_STOCK').length;

  return (
    <aside style={panneau}>
      <header style={entete}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: BRAND.ink }}>La carte</div>
          <div style={{ fontSize: 12, color: BRAND.inkSoft, marginTop: 2 }}>
            {enRupture > 0
              ? `${enRupture} produit${enRupture > 1 ? 's' : ''} en rupture`
              : 'Tout est en vente'}
          </div>
        </div>
        <button onClick={onFermer} style={fermer} title="Fermer">
          ✕
        </button>
      </header>

      <input
        value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
        placeholder="Chercher un produit…"
        style={recherche}
      />

      {erreur ? <div style={messageErreur}>{erreur}</div> : null}

      <div style={liste}>
        {chargement ? (
          <div style={{ padding: 16, color: BRAND.inkSoft, fontSize: 13 }}>Lecture de la carte…</div>
        ) : visibles.length === 0 ? (
          <div style={{ padding: 16, color: BRAND.inkSoft, fontSize: 13 }}>
            {filtre ? 'Aucun produit à ce nom.' : 'Cette buvette n’a pas encore de produit.'}
          </div>
        ) : (
          visibles.map((p) => {
            const rupture = p.status === 'OUT_OF_STOCK';
            // INACTIVE / ARCHIVED : masqué par un manager. Le serveur refuse de
            // le basculer — proposer un bouton qui échoue serait pire que de
            // n'en proposer aucun.
            const verrouille = p.status !== 'ACTIVE' && p.status !== 'OUT_OF_STOCK';

            return (
              <div key={p.id} style={ligne}>
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    color: rupture || verrouille ? BRAND.inkSoft : BRAND.ink,
                    textDecoration: rupture ? 'line-through' : 'none',
                  }}
                >
                  {p.name}
                </span>

                {verrouille ? (
                  <span style={{ fontSize: 11.5, color: BRAND.inkSoft }}>
                    masqué par un manager
                  </span>
                ) : (
                  <button
                    onClick={() => void basculer(p, rupture)}
                    disabled={enCours === p.id}
                    style={bouton(rupture, enCours === p.id)}
                  >
                    {enCours === p.id ? '…' : rupture ? 'Remettre en vente' : 'En rupture'}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

const panneau: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(380px, 92vw)',
  background: BRAND.surface,
  borderLeft: `1px solid ${BRAND.border}`,
  boxShadow: '-8px 0 32px rgba(36, 31, 29, 0.12)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 60,
};

const entete: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  padding: '16px 16px 12px',
  borderBottom: `1px solid ${BRAND.border}`,
};

const fermer: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  fontSize: 18,
  cursor: 'pointer',
  color: BRAND.inkSoft,
  lineHeight: 1,
  padding: 4,
};

const recherche: React.CSSProperties = {
  margin: '12px 16px 8px',
  padding: '9px 12px',
  borderRadius: 10,
  border: `1px solid ${BRAND.border}`,
  fontSize: 13.5,
  fontFamily: 'inherit',
  outline: 'none',
};

const liste: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '4px 8px 16px' };

const ligne: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 8px',
  borderBottom: `1px solid ${BRAND.border}`,
};

const messageErreur: React.CSSProperties = {
  margin: '0 16px 8px',
  padding: '8px 10px',
  borderRadius: 8,
  background: FOND_MANQUANT,
  color: ROUGE_MANQUANT,
  fontSize: 12.5,
};

function bouton(rupture: boolean, occupe: boolean): React.CSSProperties {
  return {
    border: `1px solid ${rupture ? BRAND.border : ROUGE_MANQUANT}`,
    background: rupture ? BRAND.surface : FOND_MANQUANT,
    color: rupture ? BRAND.ink : ROUGE_MANQUANT,
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12.5,
    fontWeight: 700,
    cursor: occupe ? 'wait' : 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };
}
