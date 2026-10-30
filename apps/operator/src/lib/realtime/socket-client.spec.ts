import { SocketClient, type RealtimeEvent } from './socket-client';

/**
 * LE COMPTOIR NE DOIT PAS SONNER DEUX FOIS POUR UNE SEULE COMMANDE.
 *
 * L'outbox livre « AU MOINS une fois », jamais exactement une fois : si
 * l'émission aboutit mais que le marquage échoue, l'ouvrier rejoue la même
 * annonce à la minute suivante. C'est le bon sens du compromis — mieux vaut
 * deux fois que zéro fois — mais il impose au client de reconnaître un
 * doublon, et `brain/REALTIME_CONTRACTS.md` le demande explicitement.
 *
 * ── POURQUOI CE FICHIER EXISTE ──────────────────────────────────
 *
 * Trois audits de suite ont signalé cette déduplication comme ABSENTE. Elle
 * ne l'est pas : elle vit ici, dans le client qui alimente le hook, une
 * fenêtre glissante de mille identifiants. Les audits regardaient
 * `useDashboard`, un étage au-dessus — et ils avaient raison de douter,
 * puisque RIEN dans le dépôt ne le prouvait.
 *
 * Un comportement qu'on affirme sans le tester finit par être re-signalé, ou
 * supprimé par quelqu'un qui ne sait pas qu'il compte. Ces tests le figent.
 */
describe('la déduplication des annonces temps réel', () => {
  /** Un faux socket.io : on garde ses écouteurs pour les déclencher à la main. */
  function fauxSocket() {
    const ecouteurs = new Map<string, (charge: unknown) => void>();
    return {
      socket: {
        on: (nom: string, fn: (charge: unknown) => void) => ecouteurs.set(nom, fn),
        emit: () => undefined,
        disconnect: () => undefined,
      },
      /** Fait arriver une annonce comme le serveur le ferait. */
      recevoir: (nom: string, charge: RealtimeEvent) => ecouteurs.get(nom)?.(charge),
      ecouteurs,
    };
  }

  /** Monte un client avec un socket doublé, sans toucher au réseau. */
  async function monter() {
    const faux = fauxSocket();
    jest.doMock('socket.io-client', () => ({ io: () => faux.socket }));

    const recues: RealtimeEvent[] = [];
    const client = new SocketClient({
      url: 'http://localhost:0',
      token: 'jeton',
      room: 'supplier:nord',
      onEvent: (e) => recues.push(e),
      onStatusChange: () => undefined,
    });
    await client.connect();
    return { client, faux, recues };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('socket.io-client');
  });

  const annonce = (eventId: string, nom = 'new_order'): RealtimeEvent => ({
    eventId,
    eventName: nom,
    occurredAt: new Date().toISOString(),
    orderId: 'cmd-1',
    publicOrderNumber: 'BE-00000001',
  });

  /**
   * LE CAS QUI FAIT SONNER DEUX FOIS : l'outbox rejoue après une émission
   * réussie dont le marquage a échoué.
   */
  it('IGNORE une annonce déjà reçue, même identique', async () => {
    const { faux, recues } = await monter();

    faux.recevoir('new_order', annonce('ev-1'));
    faux.recevoir('new_order', annonce('ev-1'));
    faux.recevoir('new_order', annonce('ev-1'));

    expect(recues).toHaveLength(1);
  });

  it('laisse passer deux annonces DIFFÉRENTES', async () => {
    const { faux, recues } = await monter();

    faux.recevoir('new_order', annonce('ev-1'));
    faux.recevoir('new_order', annonce('ev-2'));

    expect(recues.map((e) => e.eventId)).toEqual(['ev-1', 'ev-2']);
  });

  /**
   * UN MÊME `eventId` NE DOIT PAS PASSER PAR UNE AUTRE PORTE. La fenêtre est
   * partagée par les quatre types d'annonces ; sinon il suffirait qu'un rejeu
   * arrive sous un autre nom pour sonner de nouveau.
   */
  it('la fenêtre est COMMUNE à tous les types d’annonce', async () => {
    const { faux, recues } = await monter();

    faux.recevoir('new_order', annonce('ev-1', 'new_order'));
    faux.recevoir('order_updated', annonce('ev-1', 'order_updated'));

    expect(recues).toHaveLength(1);
  });

  /**
   * UNE ANNONCE SANS IDENTIFIANT EST JETÉE. Sans `eventId`, on ne peut PAS
   * reconnaître un doublon : la laisser passer reviendrait à accepter de
   * sonner deux fois dès le premier rejeu.
   */
  it('JETTE une annonce sans eventId', async () => {
    const { faux, recues } = await monter();

    faux.recevoir('new_order', { eventName: 'new_order' } as RealtimeEvent);

    expect(recues).toHaveLength(0);
  });

  /**
   * LA MÉMOIRE EST BORNÉE. Un poste tenu trois heures de service reçoit des
   * milliers d'annonces ; un ensemble qui grandit sans fin finirait par faire
   * ramer l'écran d'une équipière qui a les mains occupées.
   *
   * La fenêtre GLISSE : au-delà de mille, la plus ancienne sort. Le prix est
   * qu'un rejeu très tardif pourrait repasser — mais l'outbox purge ses lignes
   * livrées, et un poste qui a vu mille commandes a de toute façon rechargé
   * son instantané entre-temps.
   */
  it('oublie les PLUS ANCIENNES au lieu de grossir sans fin', async () => {
    const { faux, recues } = await monter();

    faux.recevoir('new_order', annonce('la-premiere'));
    for (let i = 0; i < 1_000; i++) faux.recevoir('new_order', annonce(`ev-${i}`));

    // La plus ancienne est sortie de la fenêtre : elle repasse.
    faux.recevoir('new_order', annonce('la-premiere'));

    expect(recues.filter((e) => e.eventId === 'la-premiere')).toHaveLength(2);
    // Et la plus récente est bien retenue, elle.
    faux.recevoir('new_order', annonce('ev-999'));
    expect(recues.filter((e) => e.eventId === 'ev-999')).toHaveLength(1);
  });

  /**
   * LA FENÊTRE SURVIT À UNE RECONNEXION, et c'est ce qui compte le plus : une
   * coupure réseau est exactement le moment où l'outbox rejoue. Elle vit sur
   * l'instance du client, pas sur la connexion.
   */
  it('survit à une reconnexion', async () => {
    const { faux, recues } = await monter();

    faux.recevoir('new_order', annonce('ev-1'));
    faux.recevoir('disconnect', {} as RealtimeEvent);
    faux.recevoir('connect', {} as RealtimeEvent);
    faux.recevoir('new_order', annonce('ev-1'));

    expect(recues).toHaveLength(1);
  });

  /** Le nom de l'annonce est posé par le client, jamais pris de la charge. */
  it('nomme l’annonce d’après la porte par laquelle elle arrive', async () => {
    const { faux, recues } = await monter();

    faux.recevoir('order_ready', { ...annonce('ev-1'), eventName: 'mensonge' });

    expect(recues[0].eventName).toBe('order_ready');
  });
});
