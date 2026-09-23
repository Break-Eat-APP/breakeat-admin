'use client';

import { Trophy } from 'lucide-react';
import type { TrancheAudience } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const INT = new Intl.NumberFormat('fr-FR');

/**
 * `AAAA-MM-JJ` → « sam. 20 sept. 2026 ».
 *
 * Le jour reçu est une CLÉ (le jour de service du lieu, calé à minuit UTC), pas
 * un instant : on l'affiche en UTC, sinon un navigateur à l'ouest de Greenwich
 * le reculerait d'un jour.
 */
function dateLisible(jour: string, longue = false): string {
  return new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: longue ? 'long' : 'short',
    day: 'numeric',
    month: longue ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** « 1 client » / « 2 clients » — le pluriel porte sur chaque mot. */
const pluriel = (n: number, singulier: string, plurielForme: string) =>
  `${INT.format(n)} ${n > 1 ? plurielForme : singulier}`;

/**
 * Le détail JOUR PAR JOUR de la période choisie.
 *
 * Les MÊMES colonnes que les cartes du haut — anonymes, connectés, nouveaux,
 * ont commandé — pour qu'on lise un jour comme on lit la période. Puis ce que
 * le jour a rapporté.
 *
 * Deux règles pour ne rien afficher de trompeur :
 *  - avant la mise en service de la mesure, la fréquentation est écrite
 *    « non mesurée » : un zéro dirait que personne n'est venu ;
 *  - la colonne des matchs n'apparaît que s'il y en a — une colonne de tirets
 *    n'apprend rien.
 */
export function JourParJour({
  jours,
  meilleurJour,
}: {
  jours: TrancheAudience[];
  meilleurJour: string | null;
}) {
  const meilleur = jours.find((j) => j.jour === meilleurJour) ?? null;
  const maxVisiteurs = Math.max(1, ...jours.map((j) => j.visiteursAnonymes));
  const avecMatchs = jours.some((j) => j.evenements.length > 0);
  // Le plus récent en haut : c'est le dernier match qu'on vient regarder.
  const lignes = [...jours].sort((a, b) => b.jour.localeCompare(a.jour));

  const th: React.CSSProperties = { padding: '6px 8px', textAlign: 'right', fontWeight: 600, verticalAlign: 'bottom' };

  return (
    <section
      style={{
        background: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 14,
        padding: 18,
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: '0 0 12px' }}>
        Jour par jour
      </h2>

      {meilleur ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: BRAND.orangeTint,
            border: `1px solid ${BRAND.orange}33`,
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 14,
          }}
        >
          <Trophy size={22} color={BRAND.orange} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13.5, color: BRAND.ink, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 700 }}>
              Jour le plus fréquenté : {dateLisible(meilleur.jour, true)}
              {meilleur.evenements.length > 0 ? ` — ${meilleur.evenements.join(', ')}` : ''}
            </div>
            <div style={{ color: BRAND.inkSoft }}>
              {pluriel(meilleur.visiteursAnonymes, 'anonyme', 'anonymes')}
              {' · '}
              {pluriel(meilleur.visiteursConnectes, 'connecté', 'connectés')}
              {' · '}
              {pluriel(meilleur.clientsAyantCommande, 'client a', 'clients ont')} commandé
              {' · '}
              {EUR.format(meilleur.caTtcCents / 100)} TTC
            </div>
          </div>
        </div>
      ) : null}

      {lignes.length === 0 ? (
        <p style={{ color: BRAND.inkSoft, fontSize: 13, margin: 0 }}>
          Aucune activité sur cette période.
        </p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: BRAND.inkSoft, fontSize: 12 }}>
                  <th style={{ ...th, textAlign: 'left', paddingLeft: 0 }}>Date</th>
                  {avecMatchs ? <th style={{ ...th, textAlign: 'left' }}>Match</th> : null}
                  <th style={{ ...th, textAlign: 'left', minWidth: 170 }}>Visiteurs anonymes</th>
                  <th style={th}>Clients connectés</th>
                  <th style={th}>Nouveaux</th>
                  <th style={th}>Ont commandé</th>
                  <th style={th}>Commandes</th>
                  <th style={{ ...th, paddingRight: 0 }}>CA TTC</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((j) => {
                  const estMeilleur = j.jour === meilleurJour;
                  const cellule: React.CSSProperties = { padding: '9px 8px', textAlign: 'right' };
                  return (
                    <tr
                      key={j.jour}
                      style={{
                        borderTop: `1px solid ${BRAND.border}`,
                        background: estMeilleur ? BRAND.orangeTint : undefined,
                      }}
                    >
                      <td style={{ padding: '9px 8px 9px 0', color: BRAND.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {estMeilleur ? (
                          <Trophy size={13} color={BRAND.orange} style={{ marginRight: 6, verticalAlign: -2 }} />
                        ) : null}
                        {dateLisible(j.jour)}
                      </td>
                      {avecMatchs ? (
                        <td style={{ padding: '9px 8px', color: BRAND.inkSoft, whiteSpace: 'nowrap' }}>
                          {j.evenements.join(', ')}
                        </td>
                      ) : null}

                      {j.mesure ? (
                        <>
                          <td style={{ padding: '9px 8px' }}>
                            {/* La barre se lit avant le chiffre : on repère le
                                pic d'un coup d'œil, sans comparer des nombres. */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 8, background: BRAND.bgSubtle, borderRadius: 4 }}>
                                <div
                                  style={{
                                    width: `${(j.visiteursAnonymes / maxVisiteurs) * 100}%`,
                                    height: '100%',
                                    background: BRAND.orange,
                                    borderRadius: 4,
                                    opacity: estMeilleur ? 1 : 0.55,
                                  }}
                                />
                              </div>
                              <span style={{ minWidth: 34, textAlign: 'right', fontWeight: 600, color: BRAND.ink }}>
                                {INT.format(j.visiteursAnonymes)}
                              </span>
                            </div>
                          </td>
                          <td style={cellule}>{INT.format(j.visiteursConnectes)}</td>
                          <td style={{ ...cellule, color: j.nouveauxVisiteurs > 0 ? BRAND.orange : BRAND.inkSoft, fontWeight: 600 }}>
                            {INT.format(j.nouveauxVisiteurs)}
                          </td>
                        </>
                      ) : (
                        // Une seule cellule sur les trois colonnes de
                        // fréquentation : « non mesuré », et pas trois zéros.
                        <td
                          colSpan={3}
                          style={{ padding: '9px 8px', color: BRAND.grey, fontStyle: 'italic', fontSize: 12.5 }}
                        >
                          Fréquentation non mesurée à cette date
                        </td>
                      )}

                      <td style={{ ...cellule, fontWeight: 600 }}>
                        {INT.format(j.clientsAyantCommande)}
                        {j.clientsNouveaux > 0 ? (
                          <div style={{ fontSize: 11, fontWeight: 400, color: BRAND.orange }}>
                            dont {INT.format(j.clientsNouveaux)} nouveau{j.clientsNouveaux > 1 ? 'x' : ''}
                          </div>
                        ) : null}
                      </td>
                      <td style={cellule}>{INT.format(j.commandes)}</td>
                      <td style={{ ...cellule, paddingRight: 0, fontWeight: 600 }}>
                        {EUR.format(j.caTtcCents / 100)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 11.5, color: BRAND.inkSoft, margin: '12px 0 0', lineHeight: 1.6 }}>
<strong>Anonymes</strong> et <strong>connectés</strong> ne se recoupent pas : ensemble,
            ils font l&apos;audience du jour. <strong>Ont commandé</strong> : clients différents ;{' '}
            <strong>Commandes</strong> : leur nombre total — un client peut en passer plusieurs.{' '}
            <strong>Dont nouveaux</strong> : première commande chez vous.
            Chaque jour va jusqu&apos;à 4 h du matin : la fin d&apos;un match du soir reste sur son
            jour.
          </p>
        </>
      )}
    </section>
  );
}
