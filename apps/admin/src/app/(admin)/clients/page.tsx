'use client';

/**
 * Mes clients — le fichier du club, et son audience.
 *
 * Le club se sert LUI-MÊME : il choisit son lieu et sa période, lit ses
 * chiffres, et télécharge son fichier. Personne n'a besoin de se connecter à sa
 * place pour le lui envoyer.
 *
 * Deux lectures qui répondent à deux questions différentes :
 *   • la FRÉQUENTATION dit combien de personnes ont ouvert l'application chez
 *     lui — y compris celles qui n'ont rien acheté, que les commandes ne voient
 *     pas ;
 *   • le FICHIER CLIENT dit qui a commandé, combien de fois, pour quel montant.
 */

import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Users, Eye, ShoppingBag, TrendingUp, Sparkles } from 'lucide-react';
import {
  apiGetClients,
  apiGetFrequentation,
  apiGetVenues,
  apiTelechargerClients,
  getOrgId,
  type AudienceClub,
  type FicheClient,
  type FiltreDonnees,
  type Venue,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import { JourParJour } from '@/components/jour-par-jour';

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const INT = new Intl.NumberFormat('fr-FR');

const euros = (cents: number) => EUR.format((cents ?? 0) / 100);
const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

/** Les raccourcis de période. `null` = depuis toujours. */
const PERIODES: { label: string; jours: number | null }[] = [
  { label: '7 jours', jours: 7 },
  { label: '30 jours', jours: 30 },
  { label: '12 mois', jours: 365 },
  { label: 'Tout', jours: null },
];

function pilule(actif: boolean): React.CSSProperties {
  return {
    background: actif ? BRAND.orangeTint : BRAND.surface,
    border: `1px solid ${actif ? BRAND.orange : BRAND.border}`,
    color: actif ? BRAND.orange : BRAND.inkSoft,
    borderRadius: 999,
    padding: '5px 14px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}

const carte: React.CSSProperties = {
  background: BRAND.surface,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 14,
  padding: 18,
};

function Chiffre({
  icone: Icone,
  valeur,
  libelle,
  precision,
}: {
  icone: typeof Users;
  valeur: string;
  libelle: string;
  precision?: string;
}) {
  return (
    <div style={carte}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: BRAND.inkSoft, fontSize: 12.5 }}>
        <Icone size={15} />
        {libelle}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: BRAND.ink, marginTop: 6 }}>{valeur}</div>
      {precision ? (
        <div style={{ fontSize: 11.5, color: BRAND.inkSoft, marginTop: 2 }}>{precision}</div>
      ) : null}
    </div>
  );
}

export default function ClientsPage() {
  const orgId = getOrgId();

  const [lieux, setLieux] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState<string>('');
  const [jours, setJours] = useState<number | null>(30);

  const [clients, setClients] = useState<FicheClient[]>([]);
  const [audience, setAudience] = useState<AudienceClub | null>(null);
  const [chargement, setChargement] = useState(true);
  const [telechargement, setTelechargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const filtre = useCallback((): FiltreDonnees => {
    const f: FiltreDonnees = {};
    if (venueId) f.venueId = venueId;
    if (jours !== null) {
      const debut = new Date();
      debut.setDate(debut.getDate() - jours);
      f.du = debut.toISOString();
    }
    return f;
  }, [venueId, jours]);

  const charger = useCallback(async () => {
    if (!orgId) return;
    setChargement(true);
    setErreur(null);
    try {
      const f = filtre();
      // Les deux lectures ensemble : elles doivent décrire la MÊME fenêtre,
      // sinon le taux de conversion comparerait deux périodes différentes.
      const [liste, mesure] = await Promise.all([
        apiGetClients(orgId, f),
        apiGetFrequentation(orgId, f),
      ]);
      setClients(liste);
      setAudience(mesure);
    } catch (e: unknown) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible');
    } finally {
      setChargement(false);
    }
  }, [orgId, filtre]);

  useEffect(() => {
    if (!orgId) return;
    apiGetVenues(orgId)
      .then(setLieux)
      .catch(() => {
        // Le filtre par lieu est un confort : son absence ne doit pas empêcher
        // de lire ses clients.
      });
  }, [orgId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const telecharger = async () => {
    if (!orgId) return;
    setTelechargement(true);
    try {
      await apiTelechargerClients(orgId, filtre());
    } catch (e: unknown) {
      setErreur(e instanceof Error ? e.message : 'Téléchargement impossible');
    } finally {
      setTelechargement(false);
    }
  };

  if (!orgId) {
    return <p style={{ color: BRAND.inkSoft }}>Aucune organisation sélectionnée.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: BRAND.ink, margin: 0 }}>Mes clients</h1>
          <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: '4px 0 0' }}>
            Qui commande chez vous, à quelle fréquence, et combien de monde regarde sans commander.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => void charger()} style={{ ...pilule(false), display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button
            onClick={() => void telecharger()}
            disabled={telechargement || clients.length === 0}
            style={{
              background: clients.length === 0 ? BRAND.border : BRAND.orange,
              color: '#fff',
              border: 0,
              borderRadius: 999,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 700,
              cursor: clients.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontFamily: 'inherit',
            }}
          >
            <Download size={15} />
            {telechargement ? 'Préparation…' : 'Télécharger (CSV)'}
          </button>
        </div>
      </header>

      {/* ─── Filtres ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: BRAND.inkSoft }}>Période</span>
          {PERIODES.map((p) => (
            <button key={p.label} onClick={() => setJours(p.jours)} style={pilule(jours === p.jours)}>
              {p.label}
            </button>
          ))}
        </div>

        {lieux.length > 1 ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: BRAND.inkSoft }}>Lieu</span>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              style={{
                border: `1px solid ${BRAND.border}`,
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: 12.5,
                color: BRAND.ink,
                background: BRAND.surface,
                fontFamily: 'inherit',
              }}
            >
              <option value="">Tous les lieux</option>
              {lieux.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {erreur ? (
        <div style={{ ...carte, borderColor: '#f3c2c2', background: '#fef4f4', color: '#8a2222', fontSize: 13 }}>
          {erreur}
        </div>
      ) : null}

      {/* ─── Fréquentation ───────────────────────────────────── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <Chiffre
          icone={Eye}
          libelle="Visiteurs anonymes"
          valeur={audience ? INT.format(audience.visiteursAnonymes) : '—'}
          precision="regardent sans compte"
        />
        <Chiffre
          icone={Users}
          libelle="Clients connectés"
          valeur={audience ? INT.format(audience.visiteursConnectes) : '—'}
          precision="comptés une fois, même s'ils reviennent"
        />
        <Chiffre
          icone={Sparkles}
          libelle="Nouveaux visiteurs"
          valeur={audience ? INT.format(audience.nouveauxVisiteurs) : '—'}
          precision="votre lieu est le 1er qu'ils ont ouvert"
        />
        <Chiffre
          icone={ShoppingBag}
          libelle="Ont commandé"
          valeur={audience ? INT.format(audience.clientsAyantCommande) : '—'}
          precision={
            audience && audience.clientsNouveaux > 0
              ? `dont ${INT.format(audience.clientsNouveaux)} nouveau${
                  audience.clientsNouveaux > 1 ? 'x' : ''
                } client${audience.clientsNouveaux > 1 ? 's' : ''}`
              : 'parmi les clients connectés'
          }
        />
        <Chiffre
          icone={TrendingUp}
          libelle="Taux de conversion"
          valeur={audience?.tauxConversion !== null && audience ? `${audience.tauxConversion} %` : '—'}
          precision={
            audience && audience.visiteursConnectes > 0
              ? `${INT.format(audience.connectesAyantCommande)} sur ${INT.format(
                  audience.visiteursConnectes,
                )} visiteur${audience.visiteursConnectes > 1 ? 's' : ''} identifié${
                  audience.visiteursConnectes > 1 ? 's' : ''
                }`
              : 'parmi les visiteurs identifiés'
          }
        />
      </section>

      <p style={{ fontSize: 11.5, color: BRAND.inkSoft, margin: 0, lineHeight: 1.6 }}>
<strong>Anonymes</strong> et <strong>connectés</strong> ne se recoupent jamais, et
        s&apos;additionnent : c&apos;est toute votre audience. Un téléphone qui se connecte en cours
        de route passe du côté des connectés — on le connaît, il n&apos;a plus rien d&apos;anonyme.
        Chacun est compté <em>une seule fois</em> sur la période, même s&apos;il revient dix fois.
        <br />
        <strong>Nouveaux visiteurs</strong> et <strong>Ont commandé</strong> sont des détails des
        deux premiers chiffres, pas des personnes en plus : un nouveau visiteur qui commande apparaît
        dans les deux, et il reste une seule personne. On ne peut pas commander sans être connecté,
        donc « Ont commandé » ne contient jamais d&apos;anonyme. « Dont X nouveaux clients » = ceux
        dont c&apos;est la <em>première commande chez vous</em>.
        <br />
        Les anonymes sont des APPAREILS : un client qui réinstalle l&apos;app compte deux fois. Ce
        sont des ordres de grandeur — le chiffre d&apos;affaires, lui, reste exact.
        <br />
        <strong>Nouveaux visiteurs</strong> = ceux pour qui votre lieu est le tout premier lieu
        ouvert dans l&apos;application : la mesure honnête de « combien nous ont découverts ici ».
        Aucune boutique d&apos;applications ne dit où un téléchargement a eu lieu.
        <br />
        La fréquentation est mesurée depuis le <strong>18 septembre 2026</strong> : sur une période
        qui commence avant, « Ont commandé » peut dépasser les visiteurs — les commandes, elles,
        sont comptées depuis toujours.
      </p>

      {/* ─── Audience par lieu ───────────────────────────────── */}
      {audience && audience.parLieu.length > 0 ? (
        <section style={carte}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: '0 0 12px' }}>
            Fréquentation par lieu
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: BRAND.inkSoft, textAlign: 'left', fontSize: 12 }}>
                <th style={{ padding: '6px 0' }}>Lieu</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Anonymes</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Connectés</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Nouveaux</th>
              </tr>
            </thead>
            <tbody>
              {audience.parLieu.map((l) => (
                <tr key={l.venueId} style={{ borderTop: `1px solid ${BRAND.border}` }}>
                  <td style={{ padding: '8px 0', color: BRAND.ink }}>{l.nom}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{INT.format(l.visiteursAnonymes)}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{INT.format(l.visiteursConnectes)}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: BRAND.orange, fontWeight: 600 }}>
                    {INT.format(l.nouveauxVisiteurs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* ─── Jour par jour ───────────────────────────────────── */}
      {audience ? <JourParJour jours={audience.parJour} meilleurJour={audience.meilleurJour} /> : null}

      {/* ─── Le fichier client ───────────────────────────────── */}
      <section style={carte}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: '0 0 12px' }}>
          Fichier client {clients.length > 0 ? `(${INT.format(clients.length)})` : ''}
        </h2>

        {chargement ? (
          <p style={{ color: BRAND.inkSoft, fontSize: 13 }}>Lecture…</p>
        ) : clients.length === 0 ? (
          <p style={{ color: BRAND.inkSoft, fontSize: 13 }}>
            Aucune commande sur cette période. Élargissez la période ou changez de lieu.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: BRAND.inkSoft, textAlign: 'left', fontSize: 12 }}>
                  <th style={{ padding: '6px 8px 6px 0' }}>Client</th>
                  <th style={{ padding: '6px 8px' }}>E-mail</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Commandes</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Panier moyen</th>
                  <th style={{ padding: '6px 8px' }}>Dernière</th>
                  <th style={{ padding: '6px 8px' }}>Produit préféré</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.userId} style={{ borderTop: `1px solid ${BRAND.border}` }}>
                    <td style={{ padding: '9px 8px 9px 0', color: BRAND.ink, fontWeight: 600 }}>{c.nom}</td>
                    <td style={{ padding: '9px 8px', color: BRAND.inkSoft }}>{c.email}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right' }}>{INT.format(c.commandes)}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontWeight: 600 }}>
                      {euros(c.totalCents)}
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', color: BRAND.inkSoft }}>
                      {euros(c.panierMoyenCents)}
                    </td>
                    <td style={{ padding: '9px 8px', color: BRAND.inkSoft }}>{jour(c.derniereCommande)}</td>
                    <td style={{ padding: '9px 8px', color: BRAND.inkSoft }}>{c.produitPrefere ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
