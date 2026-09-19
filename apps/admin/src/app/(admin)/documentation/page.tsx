'use client';

/**
 * Documentation — les pièces contractuelles du club.
 *
 * Le contrat signé entre Break Eat et le lieu, et tout document qu'on veut
 * garder au même endroit : avenant, attestation d'assurance, licence de débit
 * de boissons.
 *
 * Deux partis pris :
 *   • on LIT sans télécharger — le contrat s'ouvre dans la page, parce qu'un
 *     document qu'il faut d'abord enregistrer sur le bureau pour le relire
 *     finit par ne plus être relu ;
 *   • le contenu ne sort que par une requête authentifiée. Pas d'adresse
 *     publique : un contrat n'est pas une image de bannière.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Trash2, Upload, RefreshCw, X } from 'lucide-react';
import {
  apiGetDocuments,
  apiDeposerDocument,
  apiOuvrirDocument,
  apiSupprimerDocument,
  getOrgId,
  type DocumentClub,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

const jour = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

/** « 1,4 Mo » se lit ; « 1 468 006 octets » ne se lit pas. */
function poids(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

const carte: React.CSSProperties = {
  background: BRAND.surface,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 14,
  padding: 18,
};

export default function DocumentationPage() {
  const [documents, setDocuments] = useState<DocumentClub[]>([]);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [suppression, setSuppression] = useState<string | null>(null);

  /** Le document affiché, et l'adresse locale de son contenu. */
  const [ouvert, setOuvert] = useState<{ doc: DocumentClub; adresse: string } | null>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);

  const champFichier = useRef<HTMLInputElement>(null);
  const orgId = getOrgId();

  const charger = useCallback(async () => {
    if (!orgId) return;
    setChargement(true);
    try {
      setDocuments(await apiGetDocuments(orgId));
      setErreur('');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible.');
    } finally {
      setChargement(false);
    }
  }, [orgId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // L'aperçu garde un objet local en mémoire. Il est libéré à la fermeture,
  // et aussi quand on quitte la page sans fermer — sinon le PDF reste en
  // mémoire tant que l'onglet est ouvert.
  useEffect(() => {
    return () => {
      if (ouvert) URL.revokeObjectURL(ouvert.adresse);
    };
  }, [ouvert]);

  const deposer = async (fichier: File) => {
    setEnvoi(true);
    setErreur('');
    try {
      const depose = await apiDeposerDocument(orgId, fichier);
      setDocuments((liste) => [depose, ...liste]);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Dépôt impossible.');
    } finally {
      setEnvoi(false);
      // Le champ est remis à zéro : sans cela, redéposer le MÊME fichier après
      // une erreur ne déclencherait rien — la valeur n'aurait pas changé.
      if (champFichier.current) champFichier.current.value = '';
    }
  };

  const ouvrir = async (doc: DocumentClub) => {
    setOuverture(doc.id);
    setErreur('');
    try {
      const adresse = await apiOuvrirDocument(orgId, doc.id);
      setOuvert((precedent) => {
        if (precedent) URL.revokeObjectURL(precedent.adresse);
        return { doc, adresse };
      });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible.');
    } finally {
      setOuverture(null);
    }
  };

  const supprimer = async (doc: DocumentClub) => {
    // Un contrat ne se supprime pas d'un clic distrait.
    if (!window.confirm(`Supprimer « ${doc.name} » ? Cette action est définitive.`)) return;

    setSuppression(doc.id);
    try {
      await apiSupprimerDocument(orgId, doc.id);
      setDocuments((liste) => liste.filter((d) => d.id !== doc.id));
      if (ouvert?.doc.id === doc.id) {
        URL.revokeObjectURL(ouvert.adresse);
        setOuvert(null);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression impossible.');
    } finally {
      setSuppression(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: BRAND.ink, margin: 0 }}>Documentation</h1>
          <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: '4px 0 0' }}>
            Le contrat signé avec Break Eat et vos pièces à garder sous la main. Tout se lit ici,
            sans téléchargement.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => void charger()}
            style={{ ...bouton(false), display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} /> Actualiser
          </button>
          <button
            onClick={() => champFichier.current?.click()}
            disabled={envoi}
            style={{ ...bouton(true), display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Upload size={14} /> {envoi ? 'Dépôt en cours…' : 'Déposer un document'}
          </button>
          <input
            ref={champFichier}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void deposer(fichier);
            }}
          />
        </div>
      </div>

      {erreur ? (
        <div
          style={{
            ...carte,
            background: '#fef2f2',
            borderColor: '#fecaca',
            color: '#b91c1c',
            fontSize: 13.5,
            padding: '12px 16px',
          }}
        >
          {erreur}
        </div>
      ) : null}

      <div style={carte}>
        {chargement ? (
          <div style={{ color: BRAND.inkSoft, fontSize: 13.5 }}>Lecture des documents…</div>
        ) : documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '28px 12px' }}>
            <FileText size={28} color={BRAND.inkSoft} />
            <div style={{ fontWeight: 600, color: BRAND.ink, marginTop: 10, fontSize: 14.5 }}>
              Aucun document
            </div>
            <div style={{ color: BRAND.inkSoft, fontSize: 13, marginTop: 4 }}>
              Déposez votre contrat signé au format PDF (10 Mo maximum).
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {documents.map((doc, i) => (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 4px',
                  borderTop: i === 0 ? 'none' : `1px solid ${BRAND.border}`,
                }}
              >
                <FileText size={18} color={BRAND.orange} style={{ flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: BRAND.ink,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {doc.name}
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.inkSoft, marginTop: 2 }}>
                    {jour(doc.createdAt)} · {poids(doc.sizeBytes)}
                    {doc.deposePar ? ` · déposé par ${doc.deposePar}` : ''}
                  </div>
                </div>

                <button
                  onClick={() => void ouvrir(doc)}
                  disabled={ouverture === doc.id}
                  style={bouton(false)}
                >
                  {ouverture === doc.id ? 'Ouverture…' : 'Lire'}
                </button>
                <button
                  onClick={() => void supprimer(doc)}
                  disabled={suppression === doc.id}
                  title="Supprimer"
                  style={{ ...bouton(false), padding: '6px 9px', color: '#b91c1c' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {ouvert ? (
        <div style={carte}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: BRAND.ink, fontSize: 14.5 }}>{ouvert.doc.name}</div>
            <button
              onClick={() => {
                URL.revokeObjectURL(ouvert.adresse);
                setOuvert(null);
              }}
              style={{ ...bouton(false), display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <X size={14} /> Fermer
            </button>
          </div>

          {/*
            Le lecteur PDF du navigateur. `sandbox` n'est pas posé : Chrome et
            Firefox refusent d'afficher leur propre lecteur dans un iframe
            cloisonné, et on n'aurait plus qu'une zone blanche.
          */}
          <iframe
            src={ouvert.adresse}
            title={ouvert.doc.name}
            style={{
              width: '100%',
              height: '75vh',
              border: `1px solid ${BRAND.border}`,
              borderRadius: 10,
              background: '#fff',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function bouton(principal: boolean): React.CSSProperties {
  return {
    background: principal ? BRAND.orange : BRAND.surface,
    border: `1px solid ${principal ? BRAND.orange : BRAND.border}`,
    color: principal ? '#fff' : BRAND.inkSoft,
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}
