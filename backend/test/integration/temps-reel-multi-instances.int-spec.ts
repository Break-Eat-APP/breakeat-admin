import { createServer, type Server as ServeurHttp } from 'node:http';
import { Server } from 'socket.io';
import { io as connecter, type Socket } from 'socket.io-client';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

/**
 * DEUX INSTANCES PARTAGENT-ELLES LEURS ÉVÉNEMENTS ?
 *
 * Socket.IO garde ses salons EN MÉMOIRE. Avec une seule instance, cela suffit
 * et personne ne voit le problème. Dès la seconde, chaque instance ne connaît
 * que les sockets qui lui sont connectés.
 *
 * Un soir de gros match — le moment précis où l'on ajoute des instances : le
 * client paie sur l'instance A, le comptoir est branché sur la B, et la
 * commande n'apparaît qu'au prochain rafraîchissement REST. Personne ne
 * comprend pourquoi « ça marche une fois sur deux » : cela dépend de
 * l'instance sur laquelle le proxy a posé chaque partie.
 *
 * AUCUNE DOUBLURE NE RÉPOND À CETTE QUESTION. Il faut deux serveurs réels, un
 * client branché sur un seul des deux, et une émission depuis l'autre. Le test
 * monte donc les deux, comme la production le fera.
 *
 * Il s'IGNORE sans `REDIS_URL_TEST`, comme les autres suites d'intégration le
 * font sans base : on ne fait jamais échouer quelqu'un qui n'a pas monté
 * l'infrastructure.
 */
const url = process.env.REDIS_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('temps réel à plusieurs instances (Redis réel)', () => {
  const PORT_A = 45021;
  const PORT_B = 45022;
  const SALON = 'supplier:nord';

  const aFermer: Array<{ serveur: Server; http: ServeurHttp; clients: Redis[] }> = [];
  let comptoir: Socket | undefined;

  /** Une instance de l'API, avec ou sans le canal commun. */
  async function instance(port: number, partage: boolean) {
    const http = createServer();
    const serveur = new Server(http, { cors: { origin: '*' } });
    const clients: Redis[] = [];

    if (partage) {
      const publieur = new Redis(url as string);
      const abonne = publieur.duplicate();
      clients.push(publieur, abonne);
      serveur.adapter(createAdapter(publieur, abonne));
    }

    serveur.on('connection', (socket) => {
      socket.on('join', (salon: string) => void socket.join(salon));
    });
    await new Promise<void>((resoudre) => http.listen(port, resoudre));

    aFermer.push({ serveur, http, clients });
    return serveur;
  }

  /**
   * Branche un comptoir sur UNE instance, le fait rejoindre son salon, puis
   * rend la promesse de ce qu'il recevra — ou `null` au bout de 2,5 s.
   */
  async function comptoirBranchéSur(port: number): Promise<{ recu: Promise<unknown> }> {
    comptoir = connecter(`http://localhost:${port}`, { transports: ['websocket'] });
    await new Promise<void>((resoudre) => comptoir?.on('connect', () => resoudre()));
    comptoir.emit('join', SALON);
    // Le temps que l'instance inscrive le socket dans le salon.
    await new Promise((r) => setTimeout(r, 300));

    // Enveloppée : `await` aplatit une promesse de promesse, et le test
    // recevrait la valeur au lieu de l'attente.
    return {
      recu: new Promise((resoudre) => {
        comptoir?.on('new_order', (donnees: unknown) => resoudre(donnees));
        setTimeout(() => resoudre(null), 2_500);
      }),
    };
  }

  afterEach(async () => {
    comptoir?.close();
    comptoir = undefined;
    for (const { serveur, http, clients } of aFermer) {
      serveur.close();
      http.close();
      await Promise.allSettled(clients.map((c) => c.quit()));
    }
    aFermer.length = 0;
  });

  /**
   * LE DÉFAUT, REPRODUIT. Sans canal commun, l'émission reste dans la mémoire
   * de l'instance qui l'a produite.
   *
   * Ce test verrouille autant que le suivant : il dit POURQUOI l'adaptateur
   * existe. Sans lui, quelqu'un pourrait un jour retirer Redis en pensant
   * simplifier.
   */
  it('SANS canal commun, l’autre instance ne reçoit rien', async () => {
    const a = await instance(PORT_A, false);
    await instance(PORT_B, false);

    const { recu } = await comptoirBranchéSur(PORT_B);
    a.to(SALON).emit('new_order', { numero: 'BE-42' });

    await expect(recu).resolves.toBeNull();
  });

  it('AVEC l’adaptateur Redis, l’événement traverse les instances', async () => {
    const a = await instance(PORT_A, true);
    await instance(PORT_B, true);

    const { recu } = await comptoirBranchéSur(PORT_B);
    a.to(SALON).emit('new_order', { numero: 'BE-42' });

    await expect(recu).resolves.toEqual({ numero: 'BE-42' });
  });

  /**
   * Et il ne diffuse pas à l'aveugle : un comptoir qui n'a pas rejoint le
   * salon ne doit rien recevoir, sans quoi le cloisonnement entre buvettes
   * tomberait dès qu'on ajoute une instance.
   */
  it('ne diffuse qu’au salon visé, même à travers Redis', async () => {
    const a = await instance(PORT_A, true);
    await instance(PORT_B, true);

    const { recu } = await comptoirBranchéSur(PORT_B);
    a.to('supplier:sud').emit('new_order', { numero: 'BE-43' });

    await expect(recu).resolves.toBeNull();
  });
});
