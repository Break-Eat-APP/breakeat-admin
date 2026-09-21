'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { apiDefinirRapportFlaix } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

/**
 * Le rapport Flaix d'un match.
 *
 * Chaque rapport a sa propre adresse chez Flaix, et il fallait la retrouver
 * soi-même après s'être connecté. Ici, on la colle une fois — le directeur n'a
 * plus qu'à cliquer depuis le match concerné. Flaix lui demande ses
 * identifiants s'il n'est pas connecté : Break Eat ne les voit jamais.
 *
 * Seuls les liens https vers flaixlabs.com passent (vérifié par le serveur) :
 * ce bouton mène à une page où l'on tape un mot de passe, il ne doit jamais
 * pouvoir mener ailleurs.
 */
export function RapportFlaix({
  orgId,
  eventId,
  lien,
  onChange,
}: {
  orgId: string;
  eventId: string;
  lien: string | null;
  onChange: (lien: string | null) => void;
}) {
  const [saisie, setSaisie] = useState(lien ?? '');
  const [edition, setEdition] = useState(!lien);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const enregistrer = async (valeur: string | null) => {
    setEnvoi(true);
    setErreur('');
    try {
      const { flaixReportUrl } = await apiDefinirRapportFlaix(orgId, eventId, valeur);
      onChange(flaixReportUrl);
      setSaisie(flaixReportUrl ?? '');
      setEdition(!flaixReportUrl);
    } catch (e) {
      // Le serveur dit POURQUOI il refuse (pas un lien Flaix, pas en https…).
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  if (lien && !edition) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <a
          href={lien}
          target="_blank"
          // `noopener` : la page ouverte ne peut pas agir sur l'onglet du
          // dashboard. `noreferrer` : Flaix ne reçoit pas l'adresse d'où l'on vient.
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: BRAND.orange,
            color: '#fff',
            borderRadius: 999,
            padding: '9px 18px',
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Voir le rapport Flaix <ExternalLink size={15} />
        </a>
        <button onClick={() => setEdition(true)} style={boutonDiscret}>
          Modifier le lien
        </button>
        <button
          onClick={() => {
            if (window.confirm('Retirer le lien du rapport Flaix de ce match ?')) void enregistrer(null);
          }}
          disabled={envoi}
          style={{ ...boutonDiscret, color: '#b91c1c' }}
        >
          Retirer
        </button>
        <p style={{ width: '100%', margin: '6px 0 0', fontSize: 12.5, color: BRAND.grey }}>
          S&apos;ouvre dans un nouvel onglet. Flaix vous demandera vos identifiants si vous
          n&apos;êtes pas connecté.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 13.5, color: BRAND.inkSoft, lineHeight: 1.5 }}>
        Collez l&apos;adresse du rapport de ce match sur Flaix. Un bouton « Voir le rapport
        Flaix » apparaîtra ici, et le match sera marqué dans la liste des événements.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="url"
          value={saisie}
          onChange={(e) => {
            setSaisie(e.target.value);
            setErreur('');
          }}
          placeholder="https://ops.flaixlabs.com/…"
          style={{
            flex: 1,
            minWidth: 240,
            padding: '9px 12px',
            borderRadius: 10,
            border: `1px solid ${erreur ? '#fca5a5' : BRAND.border}`,
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={() => void enregistrer(saisie.trim() || null)}
          disabled={envoi || !saisie.trim()}
          style={{
            background: BRAND.orange,
            color: '#fff',
            border: 0,
            borderRadius: 999,
            padding: '9px 18px',
            fontSize: 14,
            fontWeight: 700,
            cursor: envoi ? 'wait' : 'pointer',
            opacity: !saisie.trim() ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {lien ? (
          <button
            onClick={() => {
              setSaisie(lien);
              setEdition(false);
              setErreur('');
            }}
            style={boutonDiscret}
          >
            Annuler
          </button>
        ) : null}
      </div>
      {erreur ? <div style={{ marginTop: 8, fontSize: 13, color: '#b91c1c' }}>{erreur}</div> : null}
    </div>
  );
}

const boutonDiscret: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BRAND.border}`,
  color: BRAND.inkSoft,
  borderRadius: 999,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
