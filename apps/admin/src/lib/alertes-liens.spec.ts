import { alertesDeSaisie, type MatchAVerifier } from './alertes-liens';

/**
 * Deux erreurs de saisie ne se voient qu'au stade, le jour du match. Ces
 * tests les font apparaître au moment où on les commet.
 */

const J = (jour: number, heure: number) =>
  new Date(Date.UTC(2026, 10, jour, heure, 0)).toISOString();

const m = (over: Partial<MatchAVerifier> = {}): MatchAVerifier => ({
  id: 'm1',
  name: 'Marseille - Nice',
  startAt: J(14, 18),
  endAt: J(14, 22),
  url: 'https://commande.flaix.bo.synertic.net/o/aller',
  status: 'ACTIVE',
  ...over,
});

describe('les alertes de saisie des liens', () => {
  it('une saisie propre n’alerte sur rien', () => {
    const matchs = [
      m(),
      m({ id: 'm2', startAt: J(21, 18), endAt: J(21, 22), url: 'https://commande.flaix.bo.synertic.net/o/b' }),
    ];

    expect(alertesDeSaisie(matchs)).toEqual([]);
  });

  it('LE MÊME LIEN sur deux matchs est signalé', () => {
    // Le defaut qu'on attrape : le second match enverrait son public sur la
    // page du premier, et Flaix refuserait la commande sans que le client
    // comprenne pourquoi.
    const matchs = [
      m({ id: 'aller', name: 'OM - Nice (aller)' }),
      m({ id: 'retour', name: 'OM - Nice (retour)', startAt: J(21, 18), endAt: J(21, 22) }),
    ];

    const [a] = alertesDeSaisie(matchs);

    expect(a.type).toBe('lien-partage');
    expect(a.ids).toEqual(['aller', 'retour']);
    expect(a.message).toContain('OM - Nice (aller)');
    expect(a.message).toContain('OM - Nice (retour)');
  });

  it('… y compris avec des espaces autour', () => {
    const matchs = [
      m({ id: 'a' }),
      m({ id: 'b', startAt: J(21, 18), endAt: J(21, 22), url: '  https://commande.flaix.bo.synertic.net/o/aller  ' }),
    ];

    expect(alertesDeSaisie(matchs)[0].type).toBe('lien-partage');
  });

  it('trois matchs sur le même lien ne font QU’UNE alerte, qui les nomme tous', () => {
    const matchs = [
      m({ id: 'a', name: 'A' }),
      m({ id: 'b', name: 'B', startAt: J(21, 18), endAt: J(21, 22) }),
      m({ id: 'c', name: 'C', startAt: J(28, 18), endAt: J(28, 22) }),
    ];

    const alertes = alertesDeSaisie(matchs);

    expect(alertes).toHaveLength(1);
    expect(alertes[0].ids).toEqual(['a', 'b', 'c']);
    expect(alertes[0].message).toContain('3 matchs');
  });

  it('deux matchs qui S’ENCHAÎNENT le même jour n’alertent pas', () => {
    // Le lever de rideau finit a 16 h, le match principal commence a 18 h :
    // le relais bascule tout seul. C'est le cas NORMAL d'une journee a deux
    // matchs, et le signaler aurait rendu l'avertissement inaudible.
    const matchs = [
      m({ id: 'lever', name: 'Lever de rideau', startAt: J(14, 14), endAt: J(14, 16), url: 'https://commande.flaix.bo.synertic.net/o/lever' }),
      m({ id: 'principal', name: 'Match principal', startAt: J(14, 18), endAt: J(14, 22), url: 'https://commande.flaix.bo.synertic.net/o/principal' }),
    ];

    expect(alertesDeSaisie(matchs)).toEqual([]);
  });

  it('deux matchs qui se CHEVAUCHENT sont signalés, en disant lequel gagne', () => {
    const matchs = [
      m({ id: 'un', name: 'Un', startAt: J(14, 14), endAt: J(14, 20), url: 'https://commande.flaix.bo.synertic.net/o/un' }),
      m({ id: 'deux', name: 'Deux', startAt: J(14, 18), endAt: J(14, 22), url: 'https://commande.flaix.bo.synertic.net/o/deux' }),
    ];

    const [a] = alertesDeSaisie(matchs);

    expect(a.type).toBe('chevauchement');
    expect(a.ids).toEqual(['un', 'deux']);
    // Le club doit savoir lequel l'application servira.
    expect(a.message).toContain('ouvrira « Un »');
  });

  it('les matchs SANS lien ne declenchent rien', () => {
    // Un match pas encore configure n'est pas une erreur : la saison se
    // remplit au fil de l'eau.
    const matchs = [
      m({ id: 'a', url: '' }),
      m({ id: 'b', url: '   ', startAt: J(14, 19), endAt: J(14, 23) }),
    ];

    expect(alertesDeSaisie(matchs)).toEqual([]);
  });

  it('un match sans lien ne masque pas le chevauchement des autres', () => {
    const matchs = [
      m({ id: 'vide', name: 'Vide', url: '', startAt: J(14, 10), endAt: J(14, 23) }),
      m({ id: 'un', name: 'Un', startAt: J(14, 14), endAt: J(14, 20), url: 'https://commande.flaix.bo.synertic.net/o/un' }),
      m({ id: 'deux', name: 'Deux', startAt: J(14, 18), endAt: J(14, 22), url: 'https://commande.flaix.bo.synertic.net/o/deux' }),
    ];

    const alertes = alertesDeSaisie(matchs);

    expect(alertes).toHaveLength(1);
    expect(alertes[0].ids).toEqual(['un', 'deux']);
  });

  it('une date illisible ne fait pas planter la saisie', () => {
    // Un ecran d'admin ne doit jamais tomber sur une donnee abimee : le club
    // perdrait les dix-neuf autres liens qu'il vient de coller.
    const matchs = [
      m({ id: 'a', endAt: 'pas-une-date' }),
      m({ id: 'b', startAt: 'non plus', url: 'https://commande.flaix.bo.synertic.net/o/b' }),
    ];

    expect(() => alertesDeSaisie(matchs)).not.toThrow();
  });

  it('un seul match ne peut rien chevaucher', () => {
    expect(alertesDeSaisie([m()])).toEqual([]);
    expect(alertesDeSaisie([])).toEqual([]);
  });
});

describe('un match qui n’ouvrira rien', () => {
  it('un lien sur un BROUILLON est signalé', () => {
    // Le cas vécu : lien collé, « Liens enregistrés » en vert, et
    // l'application qui répond « aucun événement ouvert ». Tout était
    // correct — sauf que rien ne disait que le match n'était pas publié.
    const [a] = alertesDeSaisie([m({ id: 'test', name: 'test', status: 'DRAFT' })]);

    expect(a.type).toBe('pas-actif');
    expect(a.ids).toEqual(['test']);
    expect(a.message).toContain('brouillon');
    expect(a.message).toContain('Actif');
  });

  it('suspendu, terminé et annulé le sont aussi, chacun nommé', () => {
    const alertes = alertesDeSaisie([
      m({ id: 'a', name: 'A', status: 'PAUSED' }),
      m({ id: 'b', name: 'B', status: 'ENDED', startAt: J(21, 18), endAt: J(21, 22), url: 'https://commande.flaix.bo.synertic.net/o/b' }),
      m({ id: 'c', name: 'C', status: 'CANCELLED', startAt: J(28, 18), endAt: J(28, 22), url: 'https://commande.flaix.bo.synertic.net/o/c' }),
    ]);

    const [a] = alertes.filter((x) => x.type === 'pas-actif');
    expect(a.ids).toEqual(['a', 'b', 'c']);
    expect(a.message).toContain('suspendu');
    expect(a.message).toContain('terminé');
    expect(a.message).toContain('annulé');
  });

  it('un match ACTIF n’alerte pas', () => {
    expect(alertesDeSaisie([m({ status: 'ACTIVE' })])).toEqual([]);
  });

  it('un brouillon SANS lien n’alerte pas', () => {
    // Coller la saison avant de publier les matchs est l'usage prévu : on ne
    // reproche rien tant qu'aucun lien n'attend.
    expect(alertesDeSaisie([m({ status: 'DRAFT', url: '' })])).toEqual([]);
  });

  it('un statut absent ne déclenche rien', () => {
    // Un appelant qui ne transmet pas le statut ne doit pas voir surgir une
    // alerte qu'il ne peut pas comprendre.
    expect(alertesDeSaisie([m({ status: undefined })])).toEqual([]);
  });
});
