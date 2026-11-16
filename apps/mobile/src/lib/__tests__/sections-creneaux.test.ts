import { rangerCreneaux, titreEtDetail } from '../sections-creneaux';

const c = (
  id: string,
  debut: string,
  over: Partial<{ label: string | null; kind: string; templateId: string | null }> = {},
) => ({
  id,
  label: null,
  startAt: new Date(debut).toISOString(),
  endAt: new Date(new Date(debut).getTime() + 15 * 60_000).toISOString(),
  ...over,
});

describe('les créneaux rangés par moment', () => {
  it('un créneau « Mi-temps » de la buvette va sous « Mi-temps », même nommé par son heure', () => {
    const sections = rangerCreneaux([
      c('a', '2026-11-16T14:00:00', { label: '14:00 – 14:15' }),
      c('b', '2026-11-16T17:30:00', { label: '17:30', kind: 'PAUSE_1', templateId: 't1' }),
    ]);
    expect(sections.map((s) => s.titre)).toEqual(['Mi-temps', 'Créneaux horaires']);
    expect(sections[0].data.map((x) => x.id)).toEqual(['b']);
  });

  it('un créneau saisi sur l’événement ne se dit pas « Immédiat » : il va sous « Créneaux horaires »', () => {
    const sections = rangerCreneaux([c('a', '2026-11-16T14:00:00', { kind: 'IMMEDIATE', templateId: null })]);
    expect(sections.map((s) => s.titre)).toEqual(['Créneaux horaires']);
  });

  it('dans une section, les créneaux suivent l’heure', () => {
    const sections = rangerCreneaux([
      c('tard', '2026-11-16T15:00:00'),
      c('tot', '2026-11-16T14:00:00'),
    ]);
    expect(sections[0].data.map((x) => x.id)).toEqual(['tot', 'tard']);
  });

  it('l’ordre d’une soirée : tout de suite, mi-temps, deuxième pause, heures, heure précise', () => {
    const sections = rangerCreneaux([
      c('p', '2026-11-16T18:00:00', { kind: 'CUSTOM', templateId: 't' }),
      c('h', '2026-11-16T14:00:00'),
      c('d', '2026-11-16T17:00:00', { kind: 'PAUSE_2', templateId: 't' }),
      c('m', '2026-11-16T16:00:00', { kind: 'PAUSE_1', templateId: 't' }),
      c('i', '2026-11-16T19:00:00', { kind: 'IMMEDIATE', templateId: 't' }),
    ]);
    expect(sections.map((s) => s.cle)).toEqual(['IMMEDIATE', 'PAUSE_1', 'PAUSE_2', 'HORAIRE', 'CUSTOM']);
  });
});

describe('le titre de la carte', () => {
  it('un nom du club en titre, la plage dessous', () => {
    const r = titreEtDetail(c('a', '2026-11-16T17:30:00', { label: 'Entracte' }));
    expect(r.titre).toBe('Entracte');
    expect(r.detail).toBe('17:30 – 17:45');
  });

  it('un nom qui est déjà une heure ne se répète pas', () => {
    expect(titreEtDetail(c('a', '2026-11-16T17:30:00', { label: '17:30' }))).toEqual({
      titre: '17:30',
      detail: null,
    });
  });

  it('sans nom, la plage en titre', () => {
    expect(titreEtDetail(c('a', '2026-11-16T14:00:00')).titre).toBe('14:00 – 14:15');
  });
});
