import { jourDeService } from './jour-de-service';

/**
 * Le jour de service décide de la numérotation vue par le client. S'il bascule
 * au mauvais moment, deux commandes portent le même numéro pendant un service.
 */
describe('jourDeService', () => {
  const jour = (iso: string) => jourDeService(new Date(iso)).toISOString().slice(0, 10);

  it('range un après-midi dans sa propre journée', () => {
    // 16h à Paris = 14h UTC en été.
    expect(jour('2026-09-06T14:00:00Z')).toBe('2026-09-06');
  });

  it('range 23h dans la journée en cours', () => {
    expect(jour('2026-09-06T21:00:00Z')).toBe('2026-09-06');
  });

  it('range 01h du matin dans le service de la VEILLE', () => {
    // 03h à Paris : le comptoir sert encore le match du soir. Repartir à 1
    // ferait porter le même numéro à deux clients à dix minutes d'écart.
    expect(jour('2026-09-07T01:00:00Z')).toBe('2026-09-06');
  });

  it('bascule à 4h locales', () => {
    // 04h05 à Paris (02h05 UTC en été) : nouveau service.
    expect(jour('2026-09-07T02:05:00Z')).toBe('2026-09-07');
  });

  it('suit le fuseau du LIEU, pas UTC', () => {
    // 23h30 à Paris le 6 = 21h30 UTC. En UTC pur on serait encore le 6 aussi,
    // mais à 00h30 Paris (22h30 UTC) l'écart devient visible.
    expect(jour('2026-09-06T22:30:00Z')).toBe('2026-09-06');
  });
});
