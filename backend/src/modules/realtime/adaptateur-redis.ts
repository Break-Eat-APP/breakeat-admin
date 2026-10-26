import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Logger, type INestApplication } from '@nestjs/common';
import type { ServerOptions, Server } from 'socket.io';
import { estEnLigne } from '../../common/helpers/est-en-ligne';

/**
 * LE TEMPS RÉEL À PLUSIEURS INSTANCES.
 *
 * Socket.IO garde ses salons EN MÉMOIRE. Avec une seule instance, cela suffit
 * et personne ne voit le problème. Dès la seconde, chaque instance ne connaît
 * que les sockets qui lui sont connectés : une commande encaissée par
 * l'instance A n'atteint pas le comptoir branché sur l'instance B.
 *
 * Concrètement, un soir de gros match — le moment précis où l'on ajoute des
 * instances : le client paie, la cuisine ne voit rien, et la commande
 * n'apparaît qu'au prochain rafraîchissement REST. Personne ne comprend
 * pourquoi « ça marche une fois sur deux » : cela dépend de l'instance sur
 * laquelle le proxy a posé chaque partie.
 *
 * L'adaptateur Redis fait transiter les émissions par un canal commun : une
 * instance publie, toutes distribuent à LEURS sockets.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ON NE TOMBE PAS SI REDIS MANQUE.
 *
 * Sans `REDIS_URL`, ou si Redis ne répond pas, on garde l'adaptateur mémoire
 * et on le DIT — bruyamment en ligne, discrètement en local. Le raisonnement
 * est celui du reste du démarrage : une API qui sert une seule instance vaut
 * mieux qu'une API qui refuse de démarrer. Ce n'est pas un trou de sécurité,
 * c'est une dégradation visible.
 *
 * En local et dans les tests, `REDIS_URL` n'est pas posé : rien ne change, et
 * aucun développeur n'a besoin d'un Redis pour lancer le projet.
 */
export class AdaptateurRedis extends IoAdapter {
  private readonly logger = new Logger('Realtime');
  private publieur?: Redis;
  private abonne?: Redis;

  constructor(private readonly app: INestApplication) {
    super(app);
  }

  /**
   * Prépare la connexion AVANT que le serveur n'écoute.
   *
   * Séparée du constructeur parce qu'elle attend : il faut savoir si Redis
   * répond avant de décider quel adaptateur poser, et un constructeur ne
   * patiente pas.
   */
  async connecter(url: string | undefined): Promise<boolean> {
    if (!url) {
      this.prevenir('REDIS_URL absente');
      return false;
    }

    try {
      // `lazyConnect` : on veut provoquer la connexion nous-mêmes pour savoir
      // tout de suite si elle échoue, plutôt que de l'apprendre plus tard sur
      // une émission perdue.
      this.publieur = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        // Sans cette borne, un Redis injoignable retient le démarrage.
        connectTimeout: 5_000,
      });
      await this.publieur.connect();
      this.abonne = this.publieur.duplicate();
      await this.abonne.connect();

      // Un Redis qui tombe EN COURS de service ne doit pas couper l'API : le
      // temps réel se dégrade, les commandes continuent de passer par REST.
      for (const client of [this.publieur, this.abonne]) {
        client.on('error', (e: Error) => this.logger.error(`Redis: ${e.message}`));
      }

      this.logger.log('Temps réel : adaptateur Redis actif — plusieurs instances supportées.');
      return true;
    } catch (e) {
      this.prevenir(e instanceof Error ? e.message : String(e));
      await this.fermer();
      return false;
    }
  }

  private prevenir(raison: string): void {
    const message =
      `Temps réel en mémoire (${raison}). ` +
      `Avec plusieurs instances, un événement émis par l'une n'atteindra pas ` +
      `les clients connectés aux autres.`;
    if (estEnLigne()) this.logger.error(message);
    else this.logger.log(message);
  }

  /** Referme ce qui a pu s'ouvrir — un client à moitié connecté fuit. */
  async fermer(): Promise<void> {
    await Promise.allSettled([this.publieur?.quit(), this.abonne?.quit()]);
    this.publieur = undefined;
    this.abonne = undefined;
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.publieur && this.abonne) {
      server.adapter(createAdapter(this.publieur, this.abonne));
    }
    return server;
  }
}
