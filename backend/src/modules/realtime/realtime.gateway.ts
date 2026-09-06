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
 * No per-room authorization: room names are UUID-keyed and never published to clients.
 */
@WebSocketGateway({
  cors: {
    // Mirror the HTTP-level CORS_ORIGINS env: same origins allowed for WS and HTTP.
    // Falls back to localhost:3001 (local dev operator app) if env is unset.
    origin: process.env['CORS_ORIGINS']?.split(',') ?? ['http://localhost:3001'],
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

  handleConnection(client: Socket): void {
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
   * Qui a le droit d'ecouter le flux d'une buvette.
   *
   * Membre de l'organisation qui la detient — et, si le compte est rattache a
   * un comptoir precis, celui-la et aucun autre. La meme regle que le tableau
   * de bord applique deja cote REST : les deux chemins doivent repondre la
   * meme chose, sinon le temps reel devient une porte derobee vers ce que
   * l'API refuse.
   */
  private async peutRejoindre(userId: string, salon: string): Promise<boolean> {
    const prefixe = 'supplier:';
    if (!salon.startsWith(prefixe)) return true;

    const supplierId = salon.slice(prefixe.length);
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
