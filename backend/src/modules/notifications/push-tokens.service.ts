import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { parLots } from '../../common/helpers/par-lots';
import { ExpoPushService } from './expo-push.service';

/**
 * PushTokensService — gestion des jetons de push Expo par utilisateur.
 *
 * Un appareil enregistre son jeton après connexion ; on l'upsert (un jeton est
 * unique et peut migrer d'un user à l'autre si l'appareil change de compte).
 */
@Injectable()
export class PushTokensService {
  private readonly logger = new Logger(PushTokensService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, token: string, platform?: string, canalCommandes?: boolean) {
    if (!ExpoPushService.isExpoPushToken(token)) {
      throw new BadRequestException('Jeton de push Expo invalide.');
    }
    // Absent = on ne touche pas : une ancienne app qui se réenregistre ne
    // retire pas la catégorie qu'une version plus récente avait déclarée.
    const canal = canalCommandes === undefined ? {} : { canalCommandes };
    const saved = await this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform: platform ?? 'unknown', ...canal },
      create: { userId, token, platform: platform ?? 'unknown', ...canal },
    });
    this.logger.log(`Push token enregistré pour user ${userId} (${saved.platform})`);
    return { ok: true };
  }

  async unregister(userId: string, token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId } });
    return { ok: true };
  }

  /**
   * Retire un jeton par sa SEULE valeur, sans session (22/11/2026,
   * BUG-2026-045, audit Codex du 21/11).
   *
   * Une déconnexion sans réseau laissait le jeton rattaché à l'ancien compte.
   * Le téléphone rejoue le retrait plus tard ; il n'a alors plus de session
   * pour dire qui il était. Le jeton Expo en tient lieu : seul l'appareil le
   * connaît. Le pire qu'en ferait un tiers qui le devinerait : couper les
   * notifications de cet appareil jusqu'à sa prochaine connexion. Aucune
   * donnée n'est rendue, et la route reste sous la limitation globale.
   */
  async retirerParJeton(token: string) {
    if (!ExpoPushService.isExpoPushToken(token)) {
      throw new BadRequestException('Jeton de push Expo invalide.');
    }
    await this.prisma.pushToken.deleteMany({ where: { token } });
    return { ok: true };
  }

  /** Jetons d'un ensemble d'utilisateurs (pour cibler un envoi). */
  async tokensForUsers(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];

    /**
     * PAR LOTS, pour rendre la main — pas pour contourner une limite.
     *
     * Vérifié le 26/10/2026 : un `IN` de 100 000 valeurs passe sans broncher,
     * Prisma découpant lui-même ce qu'il envoie. La raison est ailleurs : une
     * campagne de masse ne doit pas retenir la base pendant que les buvettes
     * servent. Voir `common/helpers/par-lots.ts`.
     */
    const tokens: string[] = [];
    for (const lot of parLots(userIds)) {
      const rows = await this.prisma.pushToken.findMany({
        where: { userId: { in: lot } },
        select: { token: true },
      });
      tokens.push(...rows.map((r) => r.token));
    }
    return tokens;
  }

  /**
   * Les jetons qui ont déclaré la catégorie Android « Commandes » (26/11/2026).
   * Pour eux seuls, un envoi de commande peut viser cette catégorie.
   */
  async canauxCommandes(tokens: string[]): Promise<Set<string>> {
    if (tokens.length === 0) return new Set();
    const rows = await this.prisma.pushToken.findMany({
      where: { token: { in: tokens }, canalCommandes: true },
      select: { token: true },
    });
    return new Set(rows.map((r) => r.token));
  }

  /** Purge les jetons rejetés par Expo (DeviceNotRegistered). */
  async purgeInvalid(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    // Même raison : une purge suit une campagne de masse, donc elle tombe au
    // même moment — celui où la base doit rester disponible.
    for (const lot of parLots(tokens)) {
      await this.prisma.pushToken.deleteMany({ where: { token: { in: lot } } });
    }
  }
}
