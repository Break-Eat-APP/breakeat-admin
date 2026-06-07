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

  /** Subscribe to a room. Clients must be authenticated to join. */
  @SubscribeMessage('join_room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinRoomDto,
  ): { joined: string } {
    if (!client.data.user) throw new WsException('Unauthorized');
    client.join(dto.room);
    this.logger.debug(`WS [${client.id}] joined room ${dto.room}`);
    return { joined: dto.room };
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
