import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JoinRoomDto } from './dto/join-room.dto';
import { PrismaService } from '../../database/prisma.service';
import { requireOrgAccess } from '../../common/helpers/require-org-access';
import { originesCors } from '../../common/helpers/origines-cors';

/**
 * RealtimeGateway — Socket.IO entry point.
 *
 * Responsibilities:
 *  1. Authenticate clients on connect (JWT from handshake.auth.token or Authorization header).
 *  2. Handle `join_room` / `leave_room` — rooms follow REALTIME_CONTRACTS.md naming:
 *       organization:{uuid}, event:{uuid}, supplier:{uuid},
 *       pickup-point:{uuid}, order:{uuid}, dashboard:{uuid}
 *  3. Expose `server` so RealtimeService can emit to rooms after DB commits.
 *
 * Auth: JWT verified on connect. Unauthenticated sockets are disconnected immediately.
 *
 * AUTORISATION PAR SALON : chaque type a sa regle (voir `peutRejoindre`), et le
 * defaut est le REFUS. Ce commentaire affirmait l'inverse — « room names are
 * UUID-keyed and never published to clients » — et c'etait un pari : un UUID
 * circule dans une URL, un journal, une capture d'ecran. Il identifie, il
 * n'autorise pas.
 */
@WebSocketGateway({
  cors: {
    // LA MEME LECTURE QUE LE HTTP, et c'est tout l'objet de ce helper.
    //
    // Il y avait ici un simple `split(',')` la ou `main.ts` nettoyait les
    // espaces et la barre oblique finale. `CORS_ORIGINS="https://a.fr, https://b.fr"`
    // — ecrit naturellement, avec l'espace — autorisait donc les deux en HTTP
    // et SEULE LA PREMIERE en WebSocket. La console du second club chargeait
    // ses donnees par REST et son temps reel restait muet, sans erreur cote
    // serveur. On cherche ce genre de panne du cote du reseau pendant une heure.
    origin: originesCors(),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
@UsePipes(new ValidationPipe({ whitelist: true }))
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  readonly server!: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Lifecycle ───────────────────────────────────────────────

  /**
   * LE JETON NE SUFFIT PAS : ON RELIT LE COMPTE.
   *
   * La signature et l'expiration etaient verifiees, mais pas l'etat du compte
   * en base — la ou `JwtStrategy` le fait a CHAQUE requete REST.
   *
   * Un compte desactive gardait donc sa connexion temps reel jusqu'a
   * l'expiration de son jeton. Quelqu'un qu'on vient d'ecarter continuait de
   * voir arriver les commandes, leurs montants et les noms des clients —
   * pendant des heures, selon la duree du jeton.
   *
   * Les deux chemins doivent repondre la meme chose, sinon le temps reel
   * redevient une porte derobee vers ce que l'API refuse.
   */
  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`WS [${client.id}] rejected — no token`);
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      const compte = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isActive: true },
      });
      if (!compte?.isActive) {
        this.logger.warn(`WS [${client.id}] rejected — compte absent ou desactive`);
        client.disconnect(true);
        return;
      }

      client.data.user = payload;
      this.logger.debug(`WS [${client.id}] connected — user ${payload.sub}`);
    } catch {
      this.logger.warn(`WS [${client.id}] rejected — invalid/expired token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`WS [${client.id}] disconnected`);
  }

  // ─── Room management ─────────────────────────────────────────

  /**
   * Rejoindre un salon.
   *
   * Les salons de BUVETTE sont verifies. L'ancienne regle -- « les noms de
   * salon sont des UUID et ne sont jamais publies » -- etait fausse : la route
   * publique d'un evenement liste ses buvettes AVEC leur identifiant, pour que
   * le client choisisse son stand. N'importe quel equipier connecte pouvait
   * donc ecouter le flux du comptoir d'a cote, et voir ses commandes arriver.
   *
   * Avec quatre buvettes dans un meme lieu, cette porte ouverte devient une
   * confusion quotidienne autant qu'une fuite : un poste qui recoit les
   * commandes d'un autre les prepare.
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinRoomDto,
  ): Promise<{ joined: string }> {
    const utilisateur = client.data.user as { sub?: string } | undefined;
    if (!utilisateur?.sub) throw new WsException('Unauthorized');

    if (!(await this.peutRejoindre(utilisateur.sub, dto.room))) {
      this.logger.warn(`WS [${client.id}] refuse sur ${dto.room} — pas sa buvette`);
      throw new WsException('Forbidden');
    }

    client.join(dto.room);
    this.logger.debug(`WS [${client.id}] joined room ${dto.room}`);
    return { joined: dto.room };
  }

  /**
   * QUI A LE DROIT D'ECOUTER QUOI — une regle par type de salon.
   *
   * L'ancienne version n'examinait que `supplier:` et laissait passer TOUT le
   * reste. Or `organization:`, `event:`, `order:` et `pickup-point:` portent
   * des commandes, des montants et des noms de clients : un compte
   * authentifie qui connaissait un UUID ecoutait le flux d'un autre club.
   *
   * LE SECRET D'UN IDENTIFIANT N'EST PAS UNE AUTORISATION. Un UUID circule —
   * dans une URL, un journal, une capture d'ecran, un rapport. Il identifie,
   * il n'autorise pas.
   *
   * LE DEFAUT EST LE REFUS. Un prefixe inconnu est rejete, pour qu'un salon
   * ajoute demain reste ferme tant que sa regle n'est pas ecrite ici. Ouvrir
   * par defaut, c'est ce qui a produit ce defaut.
   *
   * Les regles s'appuient sur `requireOrgAccess`, celle du REST : les deux
   * chemins doivent repondre la meme chose, sinon le temps reel devient une
   * porte derobee vers ce que l'API refuse.
   */
  private async peutRejoindre(userId: string, salon: string): Promise<boolean> {
    const separateur = salon.indexOf(':');
    if (separateur <= 0) return false;
    const type = salon.slice(0, separateur);
    const id = salon.slice(separateur + 1);
    if (!id) return false;

    switch (type) {
      case 'supplier':
        return this.accesBuvette(userId, id);

      // Le tableau de bord porte l'identifiant de son club : meme portee.
      case 'organization':
      case 'dashboard':
        return this.membreDu(userId, id);

      case 'event': {
        const evenement = await this.prisma.event.findUnique({
          where: { id },
          select: { organizationId: true },
        });
        return evenement ? this.membreDu(userId, evenement.organizationId) : false;
      }

      case 'pickup-point': {
        const point = await this.prisma.pickupPoint.findUnique({
          where: { id },
          select: { organizationId: true },
        });
        return point ? this.membreDu(userId, point.organizationId) : false;
      }

      // Un client suit SA commande ; le personnel du club la suit aussi.
      case 'order': {
        const commande = await this.prisma.order.findUnique({
          where: { id },
          select: { userId: true, organizationId: true },
        });
        if (!commande) return false;
        if (commande.userId === userId) return true;
        return this.membreDu(userId, commande.organizationId);
      }

      default:
        return false;
    }
  }

  /**
   * Membre du club — la MEME regle que le REST, pas une seconde ecriture.
   *
   * `requireOrgAccess` leve une exception ; ici il faut un booleen. On
   * l'enveloppe plutot que de recopier sa logique : le contournement
   * SUPER_ADMIN et la lecture du role en base vivent a UN endroit.
   */
  private async membreDu(userId: string, organizationId: string): Promise<boolean> {
    try {
      await requireOrgAccess(this.prisma, userId, organizationId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Qui a le droit d'ecouter le flux d'une buvette.
   *
   * Membre de l'organisation qui la detient — et, si le compte est rattache a
   * un comptoir precis, celui-la et aucun autre.
   */
  private async accesBuvette(userId: string, supplierId: string): Promise<boolean> {
    const buvette = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { organizationId: true },
    });
    if (!buvette) return false;

    const membre = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId, organizationId: buvette.organizationId },
      },
      select: { supplierId: true },
    });
    if (!membre) return false;

    return !membre.supplierId || membre.supplierId === supplierId;
  }

  /** Unsubscribe from a room. */
  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinRoomDto,
  ): { left: string } {
    client.leave(dto.room);
    this.logger.debug(`WS [${client.id}] left room ${dto.room}`);
    return { left: dto.room };
  }

  // ─── Internals ───────────────────────────────────────────────

  private extractToken(client: Socket): string | undefined {
    const fromAuth: unknown = client.handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

    const authHeader = client.handshake.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return undefined;
  }
}
