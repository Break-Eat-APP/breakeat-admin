import { EventStatus } from '@prisma/client';
import {
  fenetreDeCommande,
  heureDOuverture,
  type EvenementCommandable,
  type ReglageOuverture,
} from './fenetre-commande';

/**
 * C'est cette fonction qui décide ce qu'un client ouvre en touchant un lieu.
 *
 * Elle remplace le geste qu'on faisait à la main : remplacer LE lien Flaix
 * avant chaque match. Se tromper ici, ce n'est pas un défaut d'affichage —
 * c'est le client du match de samedi envoyé sur la billetterie de mardi.
 */

const H = 60 * 60_000;
const PARIS: ReglageOuverture = { heure: '08:00', timezone: 'Europe/Paris' };

/** Un match d'été : 17/07/2026 à 21 h, heure de Paris (UTC+2). */
const DEBUT_ETE = new Date('2026-07-17T19:00:00.000Z');
const FIN_ETE = new Date('2026-07-17T23:00:00.000Z');

const ev = (over: Partial<EvenementCommandable> = {}): EvenementCommandable => ({
  id: 'e1',
  name: 'OM - Lyon',
  startAt: DEBUT_ETE,
  endAt: FIN_ETE,
  status: EventStatus.ACTIVE,
  isPermanentContainer: false,
  flaixOrderUrl: 'https://commande.flaix.bo.synertic.net/o/e1',
  ...over,
});

describe('l’heure d’ouverture du lien', () => {
  it('8 h à Paris en ÉTÉ, c’est 6 h UTC', () => {
    expect(heureDOuverture(ev(), PARIS).toISOString()).toBe('2026-07-17T06:00:00.000Z');
  });

  it('8 h à Paris en HIVER, c’est 7 h UTC', () => {
    // Le piège : coder « +2 h » une fois pour toutes serait faux la moitié de
    // l'année, et personne ne le verrait avant le premier match de novembre.
    const hiver = ev({
      startAt: new Date('2026-12-05T20:00:00.000Z'),
      endAt: new Date('2026-12-05T23:00:00.000Z'),
    });

    expect(heureDOuverture(hiver, PARIS).toISOString()).toBe('2026-12-05T07:00:00.000Z');
  });

  it('le jour retenu est celui du match DANS LE FUSEAU DU LIEU', () => {
    // Auckland (UTC+12) : un match le 18/07 à 9 h là-bas, c'est le 17/07 à
    // 21 h UTC. Lire la date en UTC retiendrait le 17 et ouvrirait la vente
    // VINGT-QUATRE HEURES trop tôt.
    const auckland: ReglageOuverture = { heure: '08:00', timezone: 'Pacific/Auckland' };
    const matin = ev({
      startAt: new Date('2026-07-17T21:00:00.000Z'), // 18/07 09:00 à Auckland
      endAt: new Date('2026-07-18T01:00:00.000Z'),
    });

    // 8 h le 18 à Auckland = 20 h le 17 en UTC.
    expect(heureDOuverture(matin, auckland).toISOString()).toBe('2026-07-17T20:00:00.000Z');
  });

  it('un match de NUIT ouvre à son coup d’envoi, pas le lendemain matin', () => {
    // 00:30 à Paris : l'heure réglée (8 h le même jour local) tombe APRÈS le
    // début. Le garde-fou ramène l'ouverture au coup d'envoi — sinon la vente
    // n'ouvrirait qu'une fois le match fini.
    const nuit = ev({
      startAt: new Date('2026-07-17T22:30:00.000Z'), // 18/07 00:30 à Paris
      endAt: new Date('2026-07-18T02:00:00.000Z'),
    });

    expect(heureDOuverture(nuit, PARIS).toISOString()).toBe('2026-07-17T22:30:00.000Z');
  });

  it('un match qui commence AVANT l’heure réglée ouvre dès son début', () => {
    // Un tournoi à 7 h du matin. Sans ce garde-fou, la vente n'ouvrirait
    // qu'une heure après le coup d'envoi — ou, pour un match de nuit, jamais.
    const matinal = ev({
      startAt: new Date('2026-07-17T05:00:00.000Z'), // 07:00 à Paris
      endAt: new Date('2026-07-17T10:00:00.000Z'),
    });

    expect(heureDOuverture(matinal, PARIS).toISOString()).toBe('2026-07-17T05:00:00.000Z');
  });

  it('une heure illisible retombe sur le début, pas sur minuit', () => {
    for (const heure of ['', 'huit heures', '25:00', '08:99', '8h00']) {
      expect(heureDOuverture(ev(), { ...PARIS, heure }).toISOString()).toBe(
        DEBUT_ETE.toISOString(),
      );
    }
  });

  it('un fuseau inconnu retombe sur le début', () => {
    expect(
      heureDOuverture(ev(), { heure: '08:00', timezone: 'Mars/Olympus' }).toISOString(),
    ).toBe(DEBUT_ETE.toISOString());
  });

  it('un autre fuseau donne une autre heure', () => {
    const laReunion: ReglageOuverture = { heure: '08:00', timezone: 'Indian/Reunion' };

    // UTC+4 toute l'année : 8 h là-bas, c'est 4 h UTC.
    expect(heureDOuverture(ev(), laReunion).toISOString()).toBe('2026-07-17T04:00:00.000Z');
  });
});

describe('quel événement est ouvert à la commande', () => {
  it('après l’heure d’ouverture, le lien du match du jour', () => {
    const midi = new Date('2026-07-17T10:00:00.000Z'); // 12 h à Paris

    expect(fenetreDeCommande([ev()], midi, PARIS)).toEqual({
      etat: 'ouvert',
      evenement: ev(),
      url: 'https://commande.flaix.bo.synertic.net/o/e1',
    });
  });

  it('AVANT l’heure, on annonce l’heure — on ne dit pas « fermé »', () => {
    const aube = new Date('2026-07-17T04:00:00.000Z'); // 6 h à Paris

    const f = fenetreDeCommande([ev()], aube, PARIS);

    expect(f.etat).toBe('bientot');
    if (f.etat === 'bientot') expect(f.ouvreA.toISOString()).toBe('2026-07-17T06:00:00.000Z');
  });

  it('la veille au soir, le match du lendemain n’est pas encore ouvert', () => {
    const veille = new Date('2026-07-16T20:00:00.000Z');

    expect(fenetreDeCommande([ev()], veille, PARIS).etat).toBe('bientot');
  });

  it('pendant le match, toujours ouvert', () => {
    const pendant = new Date('2026-07-17T20:00:00.000Z');

    expect(fenetreDeCommande([ev()], pendant, PARIS).etat).toBe('ouvert');
  });

  it('après la fin : fermé, même une minute après', () => {
    const apres = new Date(FIN_ETE.getTime() + 60_000);

    expect(fenetreDeCommande([ev()], apres, PARIS).etat).toBe('aucun');
  });

  it('un événement SANS lien ne compte pas — on retombe sur le parcours Break Eat', () => {
    const midi = new Date('2026-07-17T10:00:00.000Z');

    expect(fenetreDeCommande([ev({ flaixOrderUrl: null })], midi, PARIS).etat).toBe('aucun');
  });

  it('un lien sur un BROUILLON n’ouvre rien', () => {
    // Le lien se colle des mois à l'avance : il vit donc longtemps sur un
    // événement non publié. Il ne doit pas ouvrir la vente pour autant.
    const midi = new Date('2026-07-17T10:00:00.000Z');

    expect(fenetreDeCommande([ev({ status: EventStatus.DRAFT })], midi, PARIS).etat).toBe(
      'aucun',
    );
  });

  it('un événement SUSPENDU ferme la commande', () => {
    // `PAUSED`, c'est le geste du club quand la buvette est débordée. Si la
    // fenêtre l'ignorait, le bouton continuerait d'encaisser.
    const midi = new Date('2026-07-17T10:00:00.000Z');

    expect(fenetreDeCommande([ev({ status: EventStatus.PAUSED })], midi, PARIS).etat).toBe(
      'aucun',
    );
  });

  it('un événement ANNULÉ ferme la commande', () => {
    const midi = new Date('2026-07-17T10:00:00.000Z');

    expect(fenetreDeCommande([ev({ status: EventStatus.CANCELLED })], midi, PARIS).etat).toBe(
      'aucun',
    );
  });

  it('parmi plusieurs à venir, LE PLUS PROCHE', () => {
    const veille = new Date('2026-07-16T20:00:00.000Z');
    const samedi = ev({ id: 'samedi' });
    const mardi = ev({
      id: 'mardi',
      startAt: new Date(DEBUT_ETE.getTime() + 96 * H),
      endAt: new Date(FIN_ETE.getTime() + 96 * H),
    });

    const f = fenetreDeCommande([mardi, samedi], veille, PARIS);

    expect(f.etat).toBe('bientot');
    if (f.etat === 'bientot') expect(f.evenement.id).toBe('samedi');
  });

  it('un en cours l’emporte sur un à venir, même saisi après', () => {
    // LE défaut qu'on remplace : six liens collés dans le désordre, et c'est
    // celui du prochain match qui s'ouvrait pendant celui d'aujourd'hui.
    const midi = new Date('2026-07-17T10:00:00.000Z');
    const prochain = ev({
      id: 'prochain',
      startAt: new Date(DEBUT_ETE.getTime() + 48 * H),
      endAt: new Date(FIN_ETE.getTime() + 48 * H),
    });

    const f = fenetreDeCommande([prochain, ev({ id: 'aujourdhui' })], midi, PARIS);

    expect(f.etat).toBe('ouvert');
    if (f.etat === 'ouvert') expect(f.evenement.id).toBe('aujourdhui');
  });

  it('deux qui se chevauchent : celui qui a commencé le premier', () => {
    // Un match qui déborde sur le concert d'après. On sert le public déjà
    // dans les gradins.
    const midi = new Date('2026-07-17T20:00:00.000Z');
    const match = ev({ id: 'match' });
    const concert = ev({
      id: 'concert',
      startAt: new Date(DEBUT_ETE.getTime() + H),
      endAt: new Date(FIN_ETE.getTime() + 2 * H),
    });

    const f = fenetreDeCommande([concert, match], midi, PARIS);

    if (f.etat === 'ouvert') expect(f.evenement.id).toBe('match');
    else fail('la commande devrait être ouverte');
  });

  it('un lieu PERMANENT est toujours ouvert — il n’a pas de coup d’envoi', () => {
    // Un restaurant : un contenant unique et sans fin. Lui appliquer l'heure
    // d'ouverture fermerait sa vente chaque nuit sur une date arbitraire.
    const troisHeuresDuMatin = new Date('2026-07-17T01:00:00.000Z');
    const resto = ev({
      id: 'resto',
      isPermanentContainer: true,
      startAt: new Date('2020-01-01T00:00:00.000Z'),
      endAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    expect(fenetreDeCommande([resto], troisHeuresDuMatin, PARIS).etat).toBe('ouvert');
  });

  it('aucun événement du tout : rien', () => {
    expect(fenetreDeCommande([], new Date(), PARIS)).toEqual({ etat: 'aucun' });
  });
});
