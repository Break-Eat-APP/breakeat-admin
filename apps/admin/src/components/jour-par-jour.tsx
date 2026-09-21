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

/**
 * Le détail JOUR PAR JOUR de la période choisie.
 *
 * Répond à la question que les totaux sur 7 ou 30 jours noient : quel jour —
 * quel match — a fait venir le plus de monde, et ce qu'il a rapporté. Le jour
 * est celui du comptoir (il bascule à 4h du matin) : la fin d'un match du soir
 * reste sur son jour.
 */
export function JourParJour({
  jours,
  meilleurJour,
}: {
  jours: TrancheAudience[];
  meilleurJour: string | null;
}) {
  const meilleur = jours.find((j) => j.jour === meilleurJour) ?? null;
  const maxVisiteurs = Math.max(1, ...jours.map((j) => j.visiteursUniques));
  // Le plus récent en haut : c'est le dernier match qu'on vient regarder.
  const lignes = [...jours].sort((a, b) => b.jour.localeCompare(a.jour));

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
              Meilleur jour : {dateLisible(meilleur.jour, true)}
              {meilleur.evenements.length > 0 ? ` — ${meilleur.evenements.join(', ')}` : ''}
            </div>
            <div style={{ color: BRAND.inkSoft }}>
              {INT.format(meilleur.visiteursUniques)} visiteur{meilleur.visiteursUniques > 1 ? 's' : ''}
              {' · '}
              {INT.format(meilleur.commandes)} commande{meilleur.commandes > 1 ? 's' : ''}
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
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: BRAND.inkSoft, textAlign: 'left', fontSize: 12 }}>
                <th style={{ padding: '6px 8px 6px 0' }}>Date</th>
                <th style={{ padding: '6px 8px' }}>Match</th>
                <th style={{ padding: '6px 8px', minWidth: 150 }}>Visiteurs</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Nouveaux</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Visites</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Commandes</th>
                <th style={{ padding: '6px 0 6px 8px', textAlign: 'right' }}>CA TTC</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((j) => {
                const estMeilleur = j.jour === meilleurJour;
                return (
                  <tr
                    key={j.jour}
                    style={{
                      borderTop: `1px solid ${BRAND.border}`,
                      background: estMeilleur ? BRAND.orangeTint : undefined,
                    }}
                  >
                    <td style={{ padding: '9px 8px 9px 0', color: BRAND.ink, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {estMeilleur ? <Trophy size={13} color={BRAND.orange} style={{ marginRight: 6, verticalAlign: -2 }} /> : null}
                      {dateLisible(j.jour)}
                    </td>
                    <td style={{ padding: '9px 8px', color: BRAND.inkSoft, whiteSpace: 'nowrap' }}>
                      {j.evenements.length > 0 ? j.evenements.join(', ') : '—'}
                    </td>
                    <td style={{ padding: '9px 8px' }}>
                      {/* La barre se lit avant le chiffre : on repère le pic
                          d'un coup d'œil, sans comparer des nombres. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 8, background: BRAND.bgSubtle, borderRadius: 4 }}>
                          <div
                            style={{
                              width: `${(j.visiteursUniques / maxVisiteurs) * 100}%`,
                              height: '100%',
                              background: BRAND.orange,
                              borderRadius: 4,
                              opacity: estMeilleur ? 1 : 0.55,
                            }}
                          />
                        </div>
                        <span style={{ minWidth: 34, textAlign: 'right', fontWeight: 600, color: BRAND.ink }}>
                          {INT.format(j.visiteursUniques)}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', color: BRAND.orange, fontWeight: 600 }}>
                      {INT.format(j.nouveauxVisiteurs)}
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', color: BRAND.inkSoft }}>
                      {INT.format(j.visites)}
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'right' }}>{INT.format(j.commandes)}</td>
                    <td style={{ padding: '9px 0 9px 8px', textAlign: 'right', fontWeight: 600 }}>
                      {EUR.format(j.caTtcCents / 100)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
