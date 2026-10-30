import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { adresseAvecPool, resumePool, CONNEXIONS_PAR_INSTANCE } from './pool';
import {
  lireLesConnexions,
  resumeDesConnexions,
  OCCUPATION_ALERTE,
} from './connexions';

/**
 * PrismaService wraps PrismaClient and integrates with NestJS lifecycle.
 * - Connects on module init, disconnects on destroy.
 * - Injected into any service that needs DB access.
 * - Single instance (provided in PrismaModule as global).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * LE POOL EST DÉCIDÉ ICI, PAS DEVINÉ.
   *
   * Sans option, Prisma ouvre `cœurs × 2 + 1` connexions — et dans un
   * conteneur, le nombre de cœurs rapporté est souvent celui de l'hôte. La
   * même image ouvrait donc 9 connexions sur une machine et 33 sur une autre.
   *
   * Multiplié par le nombre d'instances, c'est la panne qui arrive un soir de
   * gros match : on ajoute un replica pour encaisser l'affluence, et c'est lui
   * qui épuise les connexions. Voir `pool.ts` pour le raisonnement complet.
   *
   * L'adresse déjà paramétrée dans `DATABASE_URL` l'emporte : on remplit ce
   * qui n'a pas été dit, on n'écrase rien.
   */
  constructor() {
    const adresse = adresseAvecPool(process.env.DATABASE_URL);
    super(adresse ? { datasources: { db: { url: adresse } } } : {});
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // La valeur retenue se lit au démarrage plutôt que de se déduire d'une
    // panne. Sans l'adresse : cette ligne part dans les journaux.
    this.logger.log(`Database connected — ${resumePool(process.env.DATABASE_URL)}`);

    // ET LE PLAFOND DE LA BASE, qui ne figurait nulle part dans le dépôt.
    //
    // Dix connexions par instance, dix répliques un soir de gros match, et
    // c'est cent connexions — plus les migrations et la sauvegarde. On ajoute
    // un replica pour encaisser l'affluence, et c'est lui qui épuise la base.
    // La question se lit désormais dans les journaux de déploiement.
    const connexions = await lireLesConnexions(this, CONNEXIONS_PAR_INSTANCE);
    const phrase = resumeDesConnexions(connexions);
    if (connexions && connexions.occupation >= OCCUPATION_ALERTE) {
      this.logger.warn(`Connexions de la base À L'ÉTROIT — ${phrase}.`);
    } else {
      this.logger.log(`Connexions de la base — ${phrase}.`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
