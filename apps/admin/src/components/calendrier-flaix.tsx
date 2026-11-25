'use client';

import { useEffect, useState } from 'react';
import {
  apiApercuFluxFlaix,
  apiReglageFluxFlaix,
  apiReglerFluxFlaix,
  type LigneApercuFlaix,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

/**
 * LE CALENDRIER FLAIX D'UN LIEU (25/11/2026).
 *
 * Le club colle le lien de sa page événements Flaix, VOIT ce que la
 * synchronisation ferait (créer, relier un match saisi à la main, mettre à
 * jour), puis l'active. Ensuite, toutes les 10 minutes, ses événements suivent
 * Flaix tout seuls — plus de double saisie. Le nom, les horaires, le lien de
 * commande et l'heure d'ouverture se modifient alors dans Flaix ; le reste
 * (visibilité, points de retrait, blason) reste réglable ici. ADR-0018.
 */

const ACTION: Record<LigneApercuFlaix['action'], { texte: string; fond: string; couleur: string }> = {
  creer: { texte: 'Nouveau', fond: '#d1fae5', couleur: '#065f46' },
  adopter: { texte: 'Déjà présent — sera relié', fond: '#e0f2fe', couleur: '#075985' },
  modifier: { texte: 'Sera mis à jour', fond: '#fef3c7', couleur: '#92400e' },
  a_jour: { texte: 'À jour', fond: BRAND.bgSubtle, couleur: BRAND.inkSoft },
  ignorer: { texte: 'Ignoré', fond: BRAND.bgSubtle, couleur: BRAND.grey },
};

const dateCourte = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function CalendrierFlaix({
  orgId,
  venueId,
  venueName,
  onSynchronise,
}: {
  orgId: string;
  venueId: string;
  venueName: string;
  /** Appelé après une synchronisation : la liste des événements doit se recharger. */
  onSynchronise: () => void;
}) {
  const [lien, setLien] = useState('');
  const [actif, setActif] = useState(false);
  const [lieu, setLieu] = useState<string | null>(null);
  const [apercu, setApercu] = useState<LigneApercuFlaix[] | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    void apiReglageFluxFlaix(orgId, venueId)
      .then((r) => {
        setActif(r.actif);
        setLieu(r.lieu);
        if (r.lieu) setLien(r.lieu);
      })
      .catch(() => undefined);
  }, [orgId, venueId]);

  const voir = async () => {
    setEnvoi(true);
    setErreur('');
    setMessage('');
    try {
      const r = await apiApercuFluxFlaix(orgId, venueId, lien);
      setApercu(r.evenements);
      setLieu(r.lieu);
    } catch (e) {
      setApercu(null);
      setErreur(e instanceof Error ? e.message : 'Lecture impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const regler = async (activer: boolean) => {
    if (activer && !confirm(
      `Activer la synchronisation du calendrier Flaix pour « ${venueName} » ?\n\n` +
        'Les événements de Flaix seront créés ou reliés maintenant, puis suivis toutes les 10 minutes. ' +
        'Leur nom, leurs horaires et leur lien de commande se modifieront ensuite dans Flaix.',
    )) return;
    setEnvoi(true);
    setErreur('');
    setMessage('');
    try {
      const r = await apiReglerFluxFlaix(orgId, venueId, { lien: lien || null, actif: activer });
      setActif(r.actif);
      setLieu(r.lieu);
      if (r.bilan?.erreur) {
        setErreur(`Réglage enregistré, mais Flaix n’a pas répondu (${r.bilan.erreur}). Nouvel essai dans 10 minutes.`);
      } else if (activer && r.bilan) {
        setMessage(`Synchronisé : ${r.bilan.crees} créé(s), ${r.bilan.modifies} mis à jour. Suivi toutes les 10 minutes.`);
      } else {
        setMessage('Synchronisation coupée. Les événements déjà importés restent en place.');
      }
      setApercu(null);
      onSynchronise();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const bouton = (principal: boolean): React.CSSProperties => ({
    background: principal ? BRAND.orange : '#fff',
    color: principal ? '#fff' : BRAND.ink,
    border: principal ? 'none' : `1px solid ${BRAND.border}`,
    borderRadius: 8,
    padding: '9px 16px',
    fontWeight: 600,
    fontSize: 13.5,
    cursor: envoi ? 'default' : 'pointer',
    opacity: envoi ? 0.6 : 1,
    fontFamily: 'inherit',
  });

  return (
    <section
      style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 20, marginBottom: 24 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: BRAND.ink, margin: 0 }}>
          Calendrier Flaix — {venueName}
        </h2>
        {actif ? (
          <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 999, padding: '2px 10px', fontSize: 11.5, fontWeight: 700 }}>
            Synchronisé toutes les 10 min{lieu ? ` · ${lieu}` : ''}
          </span>
        ) : null}
      </div>
      <p style={{ fontSize: 12.5, color: BRAND.grey, margin: '0 0 14px', lineHeight: 1.5 }}>
        Colle le lien de ta page événements Flaix. Tu vois d’abord ce qui sera importé ; rien ne change avant que tu
        actives la synchronisation.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={lien}
          onChange={(e) => setLien(e.target.value)}
          placeholder="https://commande.flaix…/l/ton-lieu"
          style={{
            flex: '1 1 320px',
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            padding: '9px 12px',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
        <button type="button" disabled={envoi || !lien.trim()} onClick={() => void voir()} style={bouton(false)}>
          Voir les événements
        </button>
        {actif ? (
          <button type="button" disabled={envoi} onClick={() => void regler(false)} style={bouton(false)}>
            Couper la synchronisation
          </button>
        ) : null}
      </div>

      {erreur ? <p style={{ color: '#b91c1c', fontSize: 13, margin: '10px 0 0' }}>{erreur}</p> : null}
      {message ? <p style={{ color: '#065f46', fontSize: 13, margin: '10px 0 0' }}>{message}</p> : null}

      {apercu ? (
        <div style={{ marginTop: 16 }}>
          {apercu.length === 0 ? (
            <p style={{ fontSize: 13.5, color: BRAND.inkSoft }}>Aucun événement à venir dans ce calendrier Flaix.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {apercu.map((l) => {
                const a = ACTION[l.action];
                return (
                  <div
                    key={l.cle}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                      border: `1px solid ${BRAND.border}`,
                      borderRadius: 10,
                      padding: '10px 12px',
                      opacity: l.action === 'ignorer' ? 0.7 : 1,
                    }}
                  >
                    {l.affiche ? (
                      <img src={l.affiche} alt="" style={{ width: 34, height: 46, objectFit: 'cover', borderRadius: 4 }} />
                    ) : null}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5, color: BRAND.ink }}>
                        {l.nom}
                        {l.annule ? <span style={{ color: '#991b1b', fontWeight: 600 }}> · annulé chez Flaix</span> : null}
                      </div>
                      <div style={{ fontSize: 12.5, color: BRAND.grey, marginTop: 2 }}>
                        {dateCourte(l.debut)}
                        {l.ouvreLe ? ` · la commande ouvre ${dateCourte(l.ouvreLe)}` : ''}
                        {l.raison ? ` · ${l.raison}` : ''}
                      </div>
                    </div>
                    <span style={{ background: a.fond, color: a.couleur, borderRadius: 999, padding: '3px 10px', fontSize: 11.5, fontWeight: 700 }}>
                      {a.texte}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button type="button" disabled={envoi} onClick={() => void regler(true)} style={bouton(true)}>
              {actif ? 'Synchroniser maintenant' : 'Activer la synchronisation'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
