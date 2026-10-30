import { creerLectureGroupee, GROUPEMENT_MS } from './lecture-groupee';

/**
 * CE QUI SE PASSE AU COMPTOIR UN SOIR À 2 000 COMMANDES.
 *
 * Chaque `new_order` relisait TOUT le tableau. Quatre écrans par buvette, et
 * voilà 8 000 lectures intégrales déclenchées par les mêmes événements, souvent
 * à la même seconde. Plus le serveur ralentissait, plus elles s'empilaient :
 * rien n'attendait que la précédente revienne.
 *
 * Ces tests sont la politique. Chacun décrit une facture que le poste
 * n'envoie plus au serveur.
 */
describe('la lecture groupée du tableau opérateur', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** Une lecture dont on choisit le moment où elle répond. */
  function lecteur() {
    const reponses: Array<(v: string) => void> = [];
    const rejets: Array<(e: unknown) => void> = [];
    const lire = jest.fn(
      () =>
        new Promise<string>((ok, ko) => {
          reponses.push(ok);
          rejets.push(ko);
        }),
    );
    return { lire, reponses, rejets };
  }

  function monter(over: Partial<Parameters<typeof creerLectureGroupee>[0]> = {}) {
    const { lire, reponses, rejets } = lecteur();
    const surSucces = jest.fn();
    const surEchec = jest.fn();
    const g = creerLectureGroupee({ lire, surSucces, surEchec, ...over });
    return { g, lire, reponses, rejets, surSucces, surEchec };
  }

  // ─── Règle 1 — une seule lecture à la fois ────────────────────

  /**
   * LA RÈGLE QUI PROTÈGE LE SERVEUR QUAND IL FAIBLIT. Sans elle, un serveur
   * lent reçoit PLUS de requêtes, pas moins : chaque événement en lance une
   * sans attendre la précédente.
   */
  it('n’envoie qu’UNE requête tant que la précédente n’est pas revenue', async () => {
    const { g, lire, reponses } = monter();

    void g.lire();
    void g.lire();
    void g.lire();

    expect(lire).toHaveBeenCalledTimes(1);

    // La première répond : la relance attendue part, et UNE seule.
    reponses[0]('instantané');
    await Promise.resolve();
    await Promise.resolve();
    expect(lire).toHaveBeenCalledTimes(2);
  });

  /**
   * Règle 2 : dix événements pendant une lecture en vol ne valent qu'UNE
   * relecture — celle qui les verra tous. Au-delà, elles liraient la même
   * chose.
   */
  it('ne garde qu’UNE relecture en attente, pas une par événement', async () => {
    const { g, lire, reponses } = monter();

    void g.lire();
    for (let i = 0; i < 20; i++) void g.lire();

    reponses[0]('a');
    await Promise.resolve();
    await Promise.resolve();
    expect(lire).toHaveBeenCalledTimes(2);

    // Et la relance ne s'enchaîne pas toute seule : plus rien n'attend.
    reponses[1]('b');
    await Promise.resolve();
    await Promise.resolve();
    expect(lire).toHaveBeenCalledTimes(2);
  });

  // ─── Règle 3 — les arrivées sont groupées ─────────────────────

  it('groupe une rafale d’arrivées en UNE seule lecture', () => {
    const { g, lire } = monter();

    for (let i = 0; i < 50; i++) g.lireBientot();
    expect(lire).not.toHaveBeenCalled();

    jest.advanceTimersByTime(GROUPEMENT_MS);
    expect(lire).toHaveBeenCalledTimes(1);
  });

  /**
   * ON BORNE LE RYTHME, ON NE REPORTE PAS L'ÉCHÉANCE. Un vrai « debounce »
   * repousse le minuteur à chaque appel : sous un flot continu de commandes,
   * le tableau ne relirait JAMAIS — exactement le soir où il doit relire.
   */
  it('lit quand même sous un flot continu, au lieu de repousser sans fin', async () => {
    const lire = jest.fn().mockResolvedValue('instantané');
    const g = creerLectureGroupee({ lire, surSucces: jest.fn(), surEchec: jest.fn() });

    // Une arrivée toutes les 100 ms pendant 3 s, sans interruption.
    for (let i = 0; i < 30; i++) {
      g.lireBientot();
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
    }

    // Une lecture environ toutes les 300 ms, pas zéro.
    expect(lire.mock.calls.length).toBeGreaterThanOrEqual(5);
    // Et pas une par arrivée, non plus.
    expect(lire.mock.calls.length).toBeLessThan(15);
  });

  /**
   * CE QUE LE GROUPEMENT NE FAIT PAS — et il vaut mieux l'écrire que le
   * laisser croire.
   *
   * En dessous d'environ trois arrivées par seconde, il ne change RIEN : les
   * commandes sont déjà espacées de plus de 300 ms, chacune garde sa lecture.
   * C'est acceptable — une soirée à 2 000 commandes sur huit buvettes, c'est
   * une commande toutes les quarante secondes par comptoir. Mais quiconque
   * attend de ce groupement qu'il divise la charge d'une soirée normale se
   * trompe, et c'est ce test qui le lui dira.
   */
  it.each([
    ['1 arrivée/s', 60, 1000, 60],
    ['3 arrivées/s', 180, 333, 180],
    ['10 arrivées/s', 600, 100, 200],
  ])('%s : %d arrivées donnent %d lectures', async (_nom, arrivees, espacement, attendu) => {
    const lire = jest.fn().mockResolvedValue('x');
    const g = creerLectureGroupee({ lire, surSucces: jest.fn(), surEchec: jest.fn() });

    for (let i = 0; i < arrivees; i++) {
      g.lireBientot();
      jest.advanceTimersByTime(espacement);
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(lire).toHaveBeenCalledTimes(attendu);
  });

  /**
   * ET LE PLAFOND, QUAND LE SERVEUR NE RÉPOND PLUS.
   *
   * C'est le cas qui comptait vraiment. Un serveur qui ne rend plus la main
   * recevait AUTANT de requêtes que de commandes — chaque événement en lançait
   * une sans attendre. Ici, quelle que soit la cadence des arrivées, il en
   * reste UNE en vol. Le poste ne participe pas à l'effondrement.
   */
  it('plafonne à UNE requête en vol quand le serveur ne répond plus', () => {
    const { g, lire } = monter(); // `lire` ne résout jamais

    for (let i = 0; i < 200; i++) {
      g.lireBientot();
      jest.advanceTimersByTime(50);
    }

    expect(lire).toHaveBeenCalledTimes(1);
  });

  it('une lecture immédiate annule celle qui était programmée', () => {
    const { g, lire } = monter();

    g.lireBientot();
    void g.lire();
    expect(lire).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(GROUPEMENT_MS * 3);
    expect(lire).toHaveBeenCalledTimes(1);
  });

  // ─── La réponse dépassée ──────────────────────────────────────

  /**
   * UNE OPÉRATRICE QUI CHANGE DE BUVETTE NE DOIT PAS VOIR CELLE D'À CÔTÉ.
   *
   * La réponse de l'ancienne cible peut revenir après le changement. Affichée,
   * elle met les commandes du comptoir voisin sur son écran — et elle les y
   * laisse jusqu'à la prochaine lecture.
   */
  it('JETTE une réponse dont la cible a changé entre-temps', async () => {
    let cible = { buvette: 'nord' };
    const { g, reponses, surSucces } = monter({ jeton: () => cible });

    void g.lire();
    cible = { buvette: 'sud' }; // l'opératrice a changé de comptoir
    reponses[0]('les commandes du Nord');
    await Promise.resolve();
    await Promise.resolve();

    expect(surSucces).not.toHaveBeenCalled();
  });

  it('applique une réponse dont la cible n’a PAS changé', async () => {
    const cible = { buvette: 'nord' };
    const { g, reponses, surSucces } = monter({ jeton: () => cible });

    void g.lire();
    reponses[0]('les commandes du Nord');
    await Promise.resolve();
    await Promise.resolve();

    expect(surSucces).toHaveBeenCalledWith('les commandes du Nord');
  });

  // ─── L'échec ne doit rien coincer ─────────────────────────────

  /**
   * LE CAS QUI AURAIT FIGÉ LE COMPTOIR POUR LA SOIRÉE. Si une lecture ratée
   * laissait le verrou posé, le tableau ne relirait plus jamais — ni par
   * événement, ni par sondage. Un écran mort, et personne pour s'en rendre
   * compte avant la fin du match.
   */
  it('ne reste pas verrouillé après un échec', async () => {
    const { g, lire, rejets, surEchec } = monter();

    void g.lire();
    rejets[0](new Error('réseau'));
    await Promise.resolve();
    await Promise.resolve();
    expect(surEchec).toHaveBeenCalled();

    void g.lire();
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it('sert la relecture en attente même si la première échoue', async () => {
    const { g, lire, rejets } = monter();

    void g.lire();
    void g.lire();
    rejets[0](new Error('réseau'));
    await Promise.resolve();
    await Promise.resolve();

    expect(lire).toHaveBeenCalledTimes(2);
  });

  // ─── Le démontage ─────────────────────────────────────────────

  it('n’appelle plus rien après annulation', () => {
    const { g, lire } = monter();

    g.lireBientot();
    g.annuler();
    jest.advanceTimersByTime(GROUPEMENT_MS * 3);

    expect(lire).not.toHaveBeenCalled();
  });

  it('abandonne la relecture en attente quand on annule', async () => {
    const { g, lire, reponses } = monter();

    void g.lire();
    void g.lire(); // une relecture est en attente
    g.annuler();
    reponses[0]('a');
    await Promise.resolve();
    await Promise.resolve();

    expect(lire).toHaveBeenCalledTimes(1);
  });
});
