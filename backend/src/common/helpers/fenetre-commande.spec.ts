import { EventStatus } from '@prisma/client';
import { fenetreDeCommande, type EvenementCommandable } from './fenetre-commande';

/**
 * C'est cette fonction qui décide ce qu'un client ouvre en touchant un lieu.
 *
 * Elle remplace le geste qu'on faisait à la main : remplacer LE lien Flaix
 * avant chaque match. Se tromper ici, ce n'est pas un défaut d'affichage —
 * c'est le client du match de samedi envoyé sur la billetterie de mardi.
 */

const H = 60 * 60_000;
const MIDI = new Date('2026-10-17T12:00:00.000Z');

const ev = (over: Partial<EvenementCommandable> = {}): EvenementCommandable => ({
  id: 'e1',
  name: 'OM - Lyon',
  startAt: new Date(MIDI.getTime() + 4 * H),
  endAt: new Date(MIDI.getTime() + 8 * H),
  status: EventStatus.ACTIVE,
  isPermanentContainer: false,
  flaixOrderUrl: 'https://ops.flaixlabs.com/e1',
  ...over,
});

describe('quel événement est ouvert à la commande', () => {
  it('pendant l’événement : son lien', () => {
    const e = ev({ startAt: new Date(MIDI.getTime() - H), endAt: new Date(MIDI.getTime() + H) });

    expect(fenetreDeCommande([e], MIDI, 180)).toEqual({
      etat: 'ouvert',
      evenement: e,
      url: 'https://ops.flaixlabs.com/e1',
    });
  });

  it('TROIS HEURES AVANT le début : déjà ouvert', () => {
    // Les portes du stade ouvrent avant le coup d'envoi, et c'est là qu'on
    // commande. Attendre le début, c'est rater l'essentiel du service.
    const e = ev({ startAt: new Date(MIDI.getTime() + 2 * H) });

    expect(fenetreDeCommande([e], MIDI, 180).etat).toBe('ouvert');
  });

  it('… mais pas quatre heures avant, si l’avance est de trois', () => {
    const e = ev({ startAt: new Date(MIDI.getTime() + 4 * H) });
    const f = fenetreDeCommande([e], MIDI, 180);

    expect(f.etat).toBe('bientot');
    // Et on annonce l'heure exacte : « ouvre à 13 h », pas « fermé ».
    if (f.etat === 'bientot') expect(f.ouvreA.toISOString()).toBe('2026-10-17T13:00:00.000Z');
  });

  it('après la fin : fermé, même une minute après', () => {
    const e = ev({
      startAt: new Date(MIDI.getTime() - 4 * H),
      endAt: new Date(MIDI.getTime() - 60_000),
    });

    expect(fenetreDeCommande([e], MIDI, 180).etat).toBe('aucun');
  });

  it('un événement SANS lien ne compte pas — on retombe sur le parcours Break Eat', () => {
    const e = ev({ startAt: new Date(MIDI.getTime() - H), flaixOrderUrl: null });

    expect(fenetreDeCommande([e], MIDI, 180).etat).toBe('aucun');
  });

  it('un lien sur un BROUILLON n’ouvre rien', () => {
    // Le lien se colle des mois à l'avance : il vit donc longtemps sur un
    // événement non publié. Il ne doit pas ouvrir la vente pour autant.
    const e = ev({ startAt: new Date(MIDI.getTime() - H), status: EventStatus.DRAFT });

    expect(fenetreDeCommande([e], MIDI, 180).etat).toBe('aucun');
  });

  it('un événement SUSPENDU ferme la commande', () => {
    // `PAUSED`, c'est le geste du club quand la buvette est débordée. Si la
    // fenêtre l'ignorait, le bouton continuerait d'encaisser.
    const e = ev({ startAt: new Date(MIDI.getTime() - H), status: EventStatus.PAUSED });

    expect(fenetreDeCommande([e], MIDI, 180).etat).toBe('aucun');
  });

  it('un événement ANNULÉ ferme la commande', () => {
    const e = ev({ startAt: new Date(MIDI.getTime() - H), status: EventStatus.CANCELLED });

    expect(fenetreDeCommande([e], MIDI, 180).etat).toBe('aucun');
  });

  it('parmi plusieurs à venir, LE PLUS PROCHE', () => {
    const samedi = ev({ id: 'samedi', startAt: new Date(MIDI.getTime() + 24 * H) });
    const mardi = ev({ id: 'mardi', startAt: new Date(MIDI.getTime() + 96 * H) });

    const f = fenetreDeCommande([mardi, samedi], MIDI, 180);

    expect(f.etat).toBe('bientot');
    if (f.etat === 'bientot') expect(f.evenement.id).toBe('samedi');
  });

  it('un en cours l’emporte sur un à venir, même saisi après', () => {
    // LE défaut qu'on remplace : six liens collés dans le désordre, et c'est
    // celui du prochain match qui s'ouvrait pendant celui d'aujourd'hui.
    const prochain = ev({ id: 'prochain', startAt: new Date(MIDI.getTime() + 48 * H) });
    const aujourdhui = ev({
      id: 'aujourdhui',
      startAt: new Date(MIDI.getTime() - H),
      endAt: new Date(MIDI.getTime() + 2 * H),
    });

    const f = fenetreDeCommande([prochain, aujourdhui], MIDI, 180);

    expect(f.etat).toBe('ouvert');
    if (f.etat === 'ouvert') expect(f.evenement.id).toBe('aujourdhui');
  });

  it('deux qui se chevauchent : celui qui a commencé le premier', () => {
    // Un match qui déborde sur le concert d'après. On sert le public déjà
    // dans les gradins.
    const match = ev({
      id: 'match',
      startAt: new Date(MIDI.getTime() - 2 * H),
      endAt: new Date(MIDI.getTime() + H),
    });
    const concert = ev({
      id: 'concert',
      startAt: new Date(MIDI.getTime() - 30 * 60_000),
      endAt: new Date(MIDI.getTime() + 4 * H),
    });

    const f = fenetreDeCommande([concert, match], MIDI, 180);

    if (f.etat === 'ouvert') expect(f.evenement.id).toBe('match');
    else fail('la commande devrait être ouverte');
  });

  it('un lieu PERMANENT est toujours ouvert — il n’a pas de coup d’envoi', () => {
    // Un restaurant : un contenant unique et sans fin. Lui appliquer la
    // fenêtre, ce serait ouvrir trois heures avant une date arbitraire.
    const resto = ev({
      id: 'resto',
      isPermanentContainer: true,
      startAt: new Date('2020-01-01T00:00:00.000Z'),
      endAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    expect(fenetreDeCommande([resto], MIDI, 180).etat).toBe('ouvert');
  });

  it('une avance de zéro ouvre pile au début', () => {
    const e = ev({ startAt: MIDI, endAt: new Date(MIDI.getTime() + 2 * H) });

    expect(fenetreDeCommande([e], MIDI, 0).etat).toBe('ouvert');
    expect(fenetreDeCommande([e], new Date(MIDI.getTime() - 60_000), 0).etat).toBe('bientot');
  });

  it('une avance NÉGATIVE est ramenée à zéro, pas propagée', () => {
    // Un réglage aberrant ne doit pas fermer la buvette : il ouvrirait APRÈS
    // le début, ce que personne n'a demandé.
    const e = ev({ startAt: MIDI, endAt: new Date(MIDI.getTime() + 2 * H) });

    expect(fenetreDeCommande([e], MIDI, -120).etat).toBe('ouvert');
  });

  it('aucun événement du tout : rien', () => {
    expect(fenetreDeCommande([], MIDI, 180)).toEqual({ etat: 'aucun' });
  });
});
