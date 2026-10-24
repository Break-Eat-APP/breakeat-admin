'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BRAND } from '@/lib/brand';

/**
 * LE CALENDRIER DE PÉRIODE — deux clics, et la fenêtre est posée.
 *
 * Les raccourcis (7 jours, 30 jours) sont des fenêtres GLISSANTES : « 30
 * jours » recouvre deux matchs et trois semaines creuses, et le club ne sait
 * pas lesquels. Or un club vit au rythme de ses rencontres. Il doit pouvoir
 * demander « la soirée du 18 » ou « tout septembre » — sinon le chiffre
 * mélange une affluence de match et des jours sans personne, et ne décrit
 * plus rien.
 *
 * Premier clic = début, second = fin. Un clic AVANT le début recommence au
 * lieu d'inverser en silence : quelqu'un qui remonte dans le mois corrige
 * son point de départ, il ne demande pas une plage à l'envers.
 *
 * Les jours à venir sont éteints — il n'y a pas de fréquentation demain.
 */

const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

const debutDeJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const finDeJour = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const memeJour = (a: Date, b: Date) => debutDeJour(a).getTime() === debutDeJour(b).getTime();

export function Calendrier({
  du,
  au,
  onChange,
}: {
  du: Date | null;
  au: Date | null;
  onChange: (du: Date, au: Date) => void;
}) {
  // Le mois affiché s'ouvre sur la sélection si elle existe — on revient là
  // où on était, pas au mois courant.
  const [mois, setMois] = useState(() => {
    const base = du ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  /** Le premier clic en attente du second. */
  const [ancre, setAncre] = useState<Date | null>(null);

  const aujourdhui = debutDeJour(new Date());
  const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  // Lundi en tête : getDay() place dimanche à 0, on le renvoie en fin de semaine.
  const decalage = (premier.getDay() + 6) % 7;
  const cases = Math.ceil((decalage + nbJours) / 7) * 7;

  const cliquer = (d: Date) => {
    if (!ancre || d < ancre) {
      setAncre(d);
      // Une plage d'un seul jour est déjà une réponse valable : le club qui
      // clique « 18 octobre » voit sa soirée sans avoir à cliquer deux fois.
      onChange(debutDeJour(d), finDeJour(d));
      return;
    }
    setAncre(null);
    onChange(debutDeJour(ancre), finDeJour(d));
  };

  return (
    <div
      style={{
        background: BRAND.surface,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 14,
        padding: 14,
        width: 300,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <button
          type="button"
          aria-label="Mois précédent"
          onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}
          style={fleche}
        >
          <ChevronLeft size={17} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: BRAND.ink }}>
          {mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          aria-label="Mois suivant"
          onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}
          style={fleche}
        >
          <ChevronRight size={17} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {JOURS.map((j) => (
          <div
            key={j}
            style={{
              textAlign: 'center',
              fontSize: 11,
              color: BRAND.grey,
              paddingBottom: 4,
            }}
          >
            {j}
          </div>
        ))}

        {Array.from({ length: cases }, (_, i) => {
          const numero = i - decalage + 1;
          const d = new Date(mois.getFullYear(), mois.getMonth(), numero);
          const horsMois = numero < 1 || numero > nbJours;
          const futur = d > aujourdhui;
          const dansPlage = du && au && d >= debutDeJour(du) && d <= debutDeJour(au);
          const borne = (du && memeJour(d, du)) || (au && memeJour(d, au));

          return (
            <button
              key={i}
              type="button"
              disabled={futur}
              onClick={() => cliquer(d)}
              style={{
                aspectRatio: '1',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'inherit',
                fontSize: 13,
                cursor: futur ? 'default' : 'pointer',
                background: borne ? BRAND.orange : dansPlage ? BRAND.orangeTint : 'transparent',
                color: borne
                  ? '#fff'
                  : futur || horsMois
                    ? BRAND.border
                    : dansPlage
                      ? BRAND.orange
                      : BRAND.ink,
                fontWeight: borne || memeJour(d, aujourdhui) ? 700 : 500,
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const fleche: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: BRAND.inkSoft,
  display: 'flex',
  alignItems: 'center',
  padding: 4,
};
