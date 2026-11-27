'use client';

import { useEffect, useMemo, useState } from 'react';
import { Star } from 'lucide-react';
import { BRAND } from '@break-eat/brand';
import { apiGetToutesLesNotes, type AvisPlateforme } from '@/lib/api/backoffice-client';
import {
  compterNouveaux,
  estNouveau,
  filtrerAvis,
  lireVuJusquAu,
  plusRecent,
  retenirVuJusquAu,
  type FiltreEtoiles,
} from '@/lib/avis';
import { Carte, TitreCarte } from '@/components/ui';

const CHOIX_ETOILES: { valeur: FiltreEtoiles; libelle: string }[] = [
  { valeur: 'toutes', libelle: 'Toutes' },
  { valeur: 'a-traiter', libelle: '1-2 ★ à traiter' },
  { valeur: 5, libelle: '5 ★' },
  { valeur: 4, libelle: '4 ★' },
  { valeur: 3, libelle: '3 ★' },
  { valeur: 2, libelle: '2 ★' },
  { valeur: 1, libelle: '1 ★' },
];

/**
 * TOUS LES AVIS DE LA PLATEFORME (27/11/2026, demande de Rémi) : les plus
 * récents en haut, chacun avec son club, filtrables, et ceux arrivés depuis la
 * dernière visite marqués « Nouveau ». Plus besoin d'ouvrir les clubs un par
 * un pour savoir s'il s'est passé quelque chose.
 *
 * La moyenne, elle, reste club par club (choisir un club dans la liste du
 * haut) : tous clubs confondus, elle ne voudrait rien dire.
 */
export function TousLesAvis({ clubId }: { clubId: string }) {
  const [notes, setNotes] = useState<AvisPlateforme[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [vuJusquAu, setVuJusquAu] = useState<string | null>(null);
  const [etoiles, setEtoiles] = useState<FiltreEtoiles>('toutes');
  const [avecCommentaire, setAvecCommentaire] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const { notes: lues } = await apiGetToutesLesNotes();
        // La visite PRÉCÉDENTE sert aux repères « Nouveau » de cette visite-ci ;
        // on retient ensuite le plus récent comme « vu ».
        setVuJusquAu(lireVuJusquAu());
        retenirVuJusquAu(plusRecent(lues));
        setNotes(lues);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
      }
    })();
  }, []);

  const visibles = useMemo(
    () => filtrerAvis(notes ?? [], { clubId, etoiles, avecCommentaire }),
    [notes, clubId, etoiles, avecCommentaire],
  );
  const nouveaux = compterNouveaux(notes ?? [], vuJusquAu);

  if (erreur) {
    return (
      <Carte>
        <p style={{ color: BRAND.danger, margin: 0 }}>{erreur}</p>
      </Carte>
    );
  }
  if (!notes) return <p style={{ color: BRAND.grey }}>Chargement…</p>;

  return (
    <Carte>
      <TitreCarte
        titre={clubId ? 'Les avis de ce club' : 'Tous les avis'}
        sous={
          nouveaux > 0
            ? `${nouveaux} nouvel${nouveaux > 1 ? 's' : ''} avis depuis ta dernière visite.`
            : 'Rien de nouveau depuis ta dernière visite. Les plus récents en haut.'
        }
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {CHOIX_ETOILES.map((c) => {
          const actif = etoiles === c.valeur;
          return (
            <button
              key={String(c.valeur)}
              type="button"
              onClick={() => setEtoiles(c.valeur)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: `1px solid ${actif ? BRAND.orange : BRAND.border}`,
                background: actif ? BRAND.orange : '#fff',
                color: actif ? '#fff' : BRAND.inkSoft,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {c.libelle}
            </button>
          );
        })}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: BRAND.inkSoft, marginLeft: 6 }}>
          <input type="checkbox" checked={avecCommentaire} onChange={(e) => setAvecCommentaire(e.target.checked)} />
          Avec commentaire
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: BRAND.grey }}>
          {visibles.length} avis
        </span>
      </div>

      {visibles.length === 0 ? (
        <p style={{ color: BRAND.grey, margin: 0 }}>Aucun avis ne correspond à ces filtres.</p>
      ) : (
        visibles.map((n, i) => {
          const neuf = estNouveau(n, vuJusquAu);
          return (
            <div
              key={n.id}
              style={{
                padding: '12px 10px',
                margin: '0 -10px',
                borderRadius: 10,
                background: neuf ? BRAND.orangeTint : 'transparent',
                borderBottom: i === visibles.length - 1 ? 'none' : `1px solid ${BRAND.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', gap: 1 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} size={14} color={BRAND.orange} fill={s <= n.stars ? BRAND.orange : 'transparent'} />
                  ))}
                </span>
                {neuf ? (
                  <span
                    style={{
                      background: BRAND.orange,
                      color: '#fff',
                      borderRadius: 999,
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    Nouveau
                  </span>
                ) : null}
                <span style={{ fontSize: 13.5, fontWeight: 700, color: BRAND.ink }}>
                  {n.club?.nom ?? 'Club non identifié'}
                </span>
                <span style={{ fontSize: 13, color: BRAND.inkSoft }}>{n.buvette ?? 'Buvette inconnue'}</span>
                <span style={{ fontSize: 12.5, color: BRAND.grey }}>
                  {n.commande != null ? `commande ${n.commande} · ` : ''}
                  {new Date(n.createdAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {n.source === 'flaix' ? ' · via Flaix' : ''}
                </span>
              </div>
              {n.comment?.trim() ? (
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: BRAND.inkSoft,
                    borderLeft: `3px solid ${BRAND.orangeSoft}`,
                    paddingLeft: 12,
                  }}
                >
                  {n.comment}
                </p>
              ) : null}
            </div>
          );
        })
      )}
    </Carte>
  );
}
