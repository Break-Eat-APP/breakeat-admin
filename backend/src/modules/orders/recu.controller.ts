import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RecuService } from './recu.service';

/**
 * Le reçu d'une commande, servi en HTML.
 *
 * Route SANS garde d'authentification, et c'est voulu : elle s'ouvre dans un
 * navigateur, qui ne porte pas notre jeton d'accès. L'accès est prouvé par un
 * jeton court passé en adresse — signé, valable quinze minutes, et ne donnant
 * QUE le droit de lire ce reçu-là.
 *
 * Ce n'est pas le jeton de session : celui-là ouvrirait tout le compte, et
 * atterrirait dans l'historique du navigateur et les journaux du serveur. Un
 * jeton d'usage unique, lui, ne vaut rien une fois périmé.
 */
@Controller('orders')
export class RecuController {
  constructor(
    private readonly recu: RecuService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Get(':id/recu')
  @Header('Content-Type', 'text/html; charset=utf-8')
  // Un reçu se consulte, se réimprime, et ne doit pas rester en cache partagé.
  @Header('Cache-Control', 'no-store')
  async html(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('jeton') jeton: string,
  ): Promise<string> {
    if (!jeton) throw new UnauthorizedException('Lien de reçu incomplet');

    let charge: { orderId?: string; usage?: string };
    try {
      charge = this.jwt.verify(jeton, {
        secret: this.config.get<string>('app.jwt.secret'),
      });
    } catch {
      throw new UnauthorizedException(
        'Ce lien de reçu a expiré. Rouvrez la commande dans l’application.',
      );
    }

    // L'usage est vérifié : un jeton de session, s'il atterrissait ici, ne
    // doit pas valoir laissez-passer. Et l'identifiant de commande est celui
    // du jeton, jamais celui de l'adresse — sinon il suffirait d'échanger un
    // numéro pour lire le reçu d'un autre client.
    if (charge?.usage !== 'recu' || charge?.orderId !== id) {
      throw new UnauthorizedException('Ce lien ne correspond pas à cette commande');
    }

    const html = await this.recu.html(id).catch(() => null);
    if (!html) throw new NotFoundException('Commande introuvable');
    return html;
  }
}
