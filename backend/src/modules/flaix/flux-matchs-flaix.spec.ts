import { EventStatus } from '@prisma/client';
import {
  actionApercu,
  nomCourtDuLieu,
  cheminDuLien,
  deciderImport,
  ETIQUETTES_IDENTITE,
  lienAvecEtiquettes,
  lireFluxMatchs,
  type EvenementExistant,
} from './flux-matchs-flaix';

/** La réponse réelle du flux, lue le 24/11/2026 (lieu de test). */
const REPONSE = {
  version: 1,
  genereLe: '2026-11-24T17:13:33+01:00',
  fuseau: 'Europe/Paris',
  lieu: { id: 'guillaume-stadium', idInterne: 74, nom: 'Guillaume Stadium', ville: 'Lyon' },
  evenements: [
    {
      id: 'u2',
      idInterne: 108,
      nom: 'U2',
      type: 'concert',
      equipeDomicile: null,
      adversaire: null,
      artiste: 'U2',
      jour: '2026-11-25',
      debut: '2026-11-25T20:30:00+01:00',
      fin: '2026-11-25T23:00:00+01:00',
      finEstimee: false,
      statut: 'a_venir',
      affiche: {
        png: 'https://commande.flaix.bo.synertic.net/api/public/events/108/cover.png',
        svg: 'https://commande.flaix.bo.synertic.net/api/public/events/108/cover.svg',
        source: 'organisateur',
      },
      commande: {
        ouverte: false,
        ouvreLe: '2026-11-25T08:30:00+01:00',
        lien: 'https://commande.flaix.bo.synertic.net/o/u2',
        motif: null,
      },
      modifieLe: '2026-11-17T18:49:15+01:00',
    },
  ],
};

const MAINTENANT = new Date('2026-11-24T17:00:00+01:00');

function existant(p: Partial<EvenementExistant> = {}): EvenementExistant {
  return {
    id: 'ev-1',
    flaixEventId: null,
    name: 'U2',
    startAt: new Date('2026-11-25T20:30:00+01:00'),
    endAt: new Date('2026-11-25T23:00:00+01:00'),
    status: EventStatus.DRAFT,
    isPermanentContainer: false,
    flaixOrderUrl: null,
    opponentName: null,
    posterUrl: null,
    // Déjà alignée sur Flaix par défaut : chaque test ne bouge que ce qu'il vise.
    ordersOpenAt: new Date('2026-11-25T08:30:00+01:00'),
    ...p,
  };
}

describe('flux des matchs Flaix — lecture', () => {
  it('lit la réponse réelle', () => {
    const flux = lireFluxMatchs(REPONSE)!;
    expect(flux.lieu).toBe('guillaume-stadium');
    expect(flux.evenements).toHaveLength(1);
    const e = flux.evenements[0];
    expect(e.cle).toBe('108');
    expect(e.nom).toBe('U2');
    expect(e.debut.toISOString()).toBe('2026-11-25T19:30:00.000Z');
    expect(e.fin.toISOString()).toBe('2026-11-25T22:00:00.000Z');
    expect(e.lien).toBe('https://commande.flaix.bo.synertic.net/o/u2');
    expect(e.affiche).toContain('/events/108/cover.png');
    expect(e.annule).toBe(false);
    expect(e.ouvreLe?.toISOString()).toBe('2026-11-25T07:30:00.000Z');
  });

  it('refuse une réponse sans liste', () => {
    expect(lireFluxMatchs({ lieu: {} })).toBeNull();
    expect(lireFluxMatchs(null)).toBeNull();
  });

  it('écarte un événement sans début, et un lien hors de Flaix', () => {
    const flux = lireFluxMatchs({
      evenements: [
        { idInterne: 1, nom: 'Sans date' },
        { idInterne: 2, nom: 'Piège', debut: '2026-12-01T20:00:00+01:00', commande: { lien: 'https://pirate.fr/o/x' } },
      ],
    })!;
    expect(flux.evenements.map((e) => e.cle)).toEqual(['2']);
    expect(flux.evenements[0].lien).toBeNull();
    expect(flux.ecartes).toHaveLength(2);
  });

  it('donne 3 h à un événement sans fin', () => {
    const e = lireFluxMatchs({ evenements: [{ idInterne: 3, nom: 'X', debut: '2026-12-01T20:00:00Z' }] })!.evenements[0];
    expect(e.fin.toISOString()).toBe('2026-12-01T23:00:00.000Z');
  });

  it('reconnaît un statut annulé', () => {
    const e = lireFluxMatchs({
      evenements: [{ idInterne: 4, nom: 'X', debut: '2026-12-01T20:00:00Z', statut: 'annule' }],
    })!.evenements[0];
    expect(e.annule).toBe(true);
  });
});

describe('flux des matchs Flaix — liens', () => {
  it('ajoute les étiquettes à un lien nu, garde celles déjà là', () => {
    expect(lienAvecEtiquettes('https://f.synertic.net/o/u2')).toBe(`https://f.synertic.net/o/u2?${ETIQUETTES_IDENTITE}`);
    const deja = 'https://f.synertic.net/o/u2?mail=[#mail]';
    expect(lienAvecEtiquettes(deja)).toBe(deja);
  });

  it('compare les liens sans requête ni étiquettes', () => {
    expect(cheminDuLien('https://F.synertic.net/o/u2/?firstname=[#firstname]')).toBe('https://f.synertic.net/o/u2');
  });
});

describe('flux des matchs Flaix — décisions', () => {
  const flux = lireFluxMatchs(REPONSE)!.evenements;

  it('crée un événement inconnu, avec lien étiqueté et affiche', () => {
    const [d] = deciderImport(flux, [], MAINTENANT);
    expect(d.type).toBe('creer');
    if (d.type !== 'creer') return;
    expect(d.data.flaixEventId).toBe('108');
    expect(d.data.flaixOrderUrl).toContain('mail=[#mail]');
    expect(d.data.posterUrl).toContain('cover.png');
    expect(d.data.ordersOpenAt?.toISOString()).toBe('2026-11-25T07:30:00.000Z');
  });

  it('suit l’heure d’ouverture de Flaix, y compris quand il la retire', () => {
    const base = { flaixEventId: '108', posterUrl: flux[0].affiche, flaixOrderUrl: flux[0].lien };
    const [d1] = deciderImport(flux, [existant({ ...base, ordersOpenAt: null })], MAINTENANT);
    expect(d1).toMatchObject({ type: 'modifier', data: { ordersOpenAt: flux[0].ouvreLe } });

    const sansHeure = lireFluxMatchs({
      evenements: [{ ...REPONSE.evenements[0], commande: { ...REPONSE.evenements[0].commande, ouvreLe: null } }],
    })!.evenements;
    const [d2] = deciderImport(sansHeure, [existant(base)], MAINTENANT);
    expect(d2).toMatchObject({ type: 'modifier', data: { ordersOpenAt: null } });
  });

  it('ne fait rien sur un événement déjà à jour (idempotent)', () => {
    const ev = existant({
      flaixEventId: '108',
      flaixOrderUrl: `https://commande.flaix.bo.synertic.net/o/u2?${ETIQUETTES_IDENTITE}`,
      posterUrl: flux[0].affiche,
    });
    expect(deciderImport(flux, [ev], MAINTENANT)).toEqual([{ type: 'ignorer', cle: '108', raison: 'à jour' }]);
  });

  it('suit un changement d’heure chez Flaix', () => {
    const ev = existant({ flaixEventId: '108', startAt: new Date('2026-11-25T19:00:00+01:00'), posterUrl: flux[0].affiche, flaixOrderUrl: flux[0].lien });
    const [d] = deciderImport(flux, [ev], MAINTENANT);
    expect(d).toMatchObject({ type: 'modifier', eventId: 'ev-1', data: { startAt: flux[0].debut } });
  });

  it('adopte un événement saisi à la main avec le même lien, et garde ses étiquettes', () => {
    const lienClub = 'https://commande.flaix.bo.synertic.net/o/u2?mail=[#mail]';
    const ev = existant({ startAt: new Date('2026-11-25T18:00:00+01:00'), flaixOrderUrl: lienClub, posterUrl: flux[0].affiche });
    const [d] = deciderImport(flux, [ev], MAINTENANT);
    expect(d.type).toBe('modifier');
    if (d.type !== 'modifier') return;
    expect(d.adopte).toBe(true);
    expect(d.data.flaixEventId).toBe('108');
    expect(d.data.flaixOrderUrl).toBeUndefined();
  });

  it('adopte par l’heure quand aucun lien ne correspond', () => {
    const ev = existant({ startAt: new Date('2026-11-25T21:00:00+01:00') });
    const [d] = deciderImport(flux, [ev], MAINTENANT);
    expect(d).toMatchObject({ type: 'modifier', adopte: true });
  });

  it('n’adopte pas quand deux événements sont possibles : il crée', () => {
    const a = existant({ id: 'a', startAt: new Date('2026-11-25T20:00:00+01:00') });
    const b = existant({ id: 'b', startAt: new Date('2026-11-25T21:00:00+01:00') });
    const [d] = deciderImport(flux, [a, b], MAINTENANT);
    expect(d.type).toBe('creer');
  });

  it('n’adopte ni un contenant permanent, ni un événement annulé', () => {
    const contenant = existant({ id: 'c', isPermanentContainer: true });
    const annule = existant({ id: 'x', status: EventStatus.CANCELLED });
    expect(deciderImport(flux, [contenant, annule], MAINTENANT)[0].type).toBe('creer');
  });

  it('annule chez nous un événement annulé chez Flaix', () => {
    const annule = lireFluxMatchs({
      evenements: [{ ...REPONSE.evenements[0], statut: 'annule' }],
    })!.evenements;
    const [d] = deciderImport(annule, [existant({ flaixEventId: '108' })], MAINTENANT);
    expect(d).toMatchObject({ type: 'modifier', data: { status: EventStatus.CANCELLED } });
  });

  it('ne crée ni un événement annulé, ni un événement passé', () => {
    const annule = lireFluxMatchs({ evenements: [{ ...REPONSE.evenements[0], statut: 'annule' }] })!.evenements;
    expect(deciderImport(annule, [], MAINTENANT)[0].type).toBe('ignorer');
    expect(deciderImport(flux, [], new Date('2026-12-01T00:00:00Z'))[0].type).toBe('ignorer');
  });

  it('ne touche plus un événement terminé chez nous', () => {
    const [d] = deciderImport(flux, [existant({ flaixEventId: '108', status: EventStatus.ENDED, name: 'Ancien' })], MAINTENANT);
    expect(d.type).toBe('ignorer');
  });

  it('garde l’adversaire du club quand Flaix n’en donne pas', () => {
    const ev = existant({ flaixEventId: '108', opponentName: 'Lens', posterUrl: flux[0].affiche, flaixOrderUrl: flux[0].lien });
    expect(deciderImport(flux, [ev], MAINTENANT)[0].type).toBe('ignorer');
  });
});

describe('flux des matchs Flaix — le lien que le club colle (25/11/2026)', () => {
  it('reconnaît le nom court, la page événements et l’adresse du flux', () => {
    expect(nomCourtDuLieu('guillaume-stadium')).toBe('guillaume-stadium');
    expect(nomCourtDuLieu('https://commande.flaix.bo.synertic.net/l/guillaume-stadium')).toBe('guillaume-stadium');
    expect(nomCourtDuLieu(' https://flaix.bo.synertic.net/api/public/lieux/stade-velodrome/evenements ')).toBe(
      'stade-velodrome',
    );
  });

  it('refuse un lien hors de Flaix, en http, ou sans lieu', () => {
    expect(nomCourtDuLieu('https://pirate.fr/l/guillaume-stadium')).toBeNull();
    expect(nomCourtDuLieu('http://commande.flaix.bo.synertic.net/l/guillaume-stadium')).toBeNull();
    expect(nomCourtDuLieu('https://commande.flaix.bo.synertic.net/o/u2')).toBeNull();
    expect(nomCourtDuLieu('deux mots')).toBeNull();
    expect(nomCourtDuLieu('')).toBeNull();
  });

  it('traduit chaque décision pour l’écran d’aperçu', () => {
    const [creer] = deciderImport(lireFluxMatchs(REPONSE)!.evenements, [], MAINTENANT);
    expect(actionApercu(creer)).toBe('creer');
    const [adopter] = deciderImport(lireFluxMatchs(REPONSE)!.evenements, [existant({ startAt: new Date('2026-11-25T21:00:00+01:00') })], MAINTENANT);
    expect(actionApercu(adopter)).toBe('adopter');
  });
});
