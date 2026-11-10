import { ADRESSE_SUPPORT, lienSignalement } from '../support';

const pied = { compte: 'client@exemple.fr', appareil: 'ios 18', version: '1.1.0' };

describe('lienSignalement', () => {
  it('écrit au support, avec la commande dans le sujet', () => {
    const lien = lienSignalement(
      { numero: 'n° 12', reference: 'BE-ABC', buvette: 'Buvette Nord', passeeLe: '2026-11-22T20:10:00Z' },
      pied,
    );
    expect(lien.startsWith(`mailto:${ADRESSE_SUPPORT}?subject=`)).toBe(true);
    const sujet = decodeURIComponent(lien.split('subject=')[1].split('&')[0]);
    expect(sujet).toBe('BreakEat — Problème avec la commande n° 12');
  });

  it('le corps porte tout ce que le support redemanderait', () => {
    const lien = lienSignalement(
      { numero: 'n° 12', reference: 'BE-ABC', buvette: 'Buvette Nord', passeeLe: '2026-11-22T20:10:00Z' },
      pied,
    );
    const corps = decodeURIComponent(lien.split('body=')[1]);
    expect(corps).toContain('Commande : n° 12');
    expect(corps).toContain('Référence du reçu : BE-ABC');
    expect(corps).toContain('Buvette : Buvette Nord');
    expect(corps).toContain('Compte : client@exemple.fr');
  });

  it('sans buvette connue, pas de ligne « Buvette » vide', () => {
    const lien = lienSignalement(
      { numero: 'n° 3', reference: 'BE-X', buvette: null, passeeLe: '2026-11-22T20:10:00Z' },
      { ...pied, compte: null },
    );
    const corps = decodeURIComponent(lien.split('body=')[1]);
    expect(corps).not.toContain('Buvette :');
    expect(corps).toContain('Compte : non connecté');
  });
});
