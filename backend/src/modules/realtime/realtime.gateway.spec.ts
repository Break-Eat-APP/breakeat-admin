import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { RealtimeGateway } from './realtime.gateway';
import type { Socket } from 'socket.io';

// ─── Helpers ─────────────────────────────────────────────────────

function makeSocket(overrides: Partial<Socket> = {}): jest.Mocked<Socket> {
  return {
    id: 'socket-abc',
    handshake: { auth: {}, headers: {} },
    data: {},
    disconnect: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<Socket>;
}

const VALID_PAYLOAD = { sub: 'user-1', email: 'test@break.eat' };

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        {
          provide: JwtService,
          useValue: { verify: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    gateway = module.get(RealtimeGateway);
    jwtService = module.get(JwtService);
  });

  // ─── handleConnection ─────────────────────────────────────────

  describe('handleConnection', () => {
    it('stores user payload in client.data when token is valid', () => {
      const client = makeSocket({ handshake: { auth: { token: 'valid-jwt' }, headers: {} } as never });
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);

      gateway.handleConnection(client);

      expect(client.data.user).toEqual(VALID_PAYLOAD);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects client when handshake has no token', () => {
      const client = makeSocket({ handshake: { auth: {}, headers: {} } as never });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.data.user).toBeUndefined();
    });

    it('disconnects client when Bearer header token is present but invalid', () => {
      const client = makeSocket({
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer bad-token' },
        } as never,
      });
      jwtService.verify.mockImplementation(() => { throw new Error('invalid'); });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('accepts token from Authorization: Bearer header', () => {
      const client = makeSocket({
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header-token' },
        } as never,
      });
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);

      gateway.handleConnection(client);

      expect(client.data.user).toEqual(VALID_PAYLOAD);
      expect(jwtService.verify).toHaveBeenCalledWith('header-token', expect.any(Object));
    });

    it('prefers handshake.auth.token over Authorization header', () => {
      const client = makeSocket({
        handshake: {
          auth: { token: 'auth-token' },
          headers: { authorization: 'Bearer header-token' },
        } as never,
      });
      jwtService.verify.mockReturnValue(VALID_PAYLOAD);

      gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('auth-token', expect.any(Object));
    });
  });

  // ─── handleDisconnect ─────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('does not throw for any socket', () => {
      const client = makeSocket();
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });

  // ─── handleJoinRoom ───────────────────────────────────────────

  describe('handleJoinRoom', () => {
    it('joins the room and returns { joined } when authenticated', () => {
      const roomId = 'organization:123e4567-e89b-12d3-a456-426614174000';
      const client = makeSocket();
      client.data.user = VALID_PAYLOAD;

      const result = gateway.handleJoinRoom(client, { room: roomId });

      expect(client.join).toHaveBeenCalledWith(roomId);
      expect(result).toEqual({ joined: roomId });
    });

    it('throws WsException when client is not authenticated', () => {
      const client = makeSocket(); // no data.user

      expect(() =>
        gateway.handleJoinRoom(client, { room: 'order:123e4567-e89b-12d3-a456-426614174000' }),
      ).toThrow(WsException);

      expect(client.join).not.toHaveBeenCalled();
    });
  });

  // ─── handleLeaveRoom ──────────────────────────────────────────

  describe('handleLeaveRoom', () => {
    it('leaves the room and returns { left }', () => {
      const roomId = 'event:123e4567-e89b-12d3-a456-426614174000';
      const client = makeSocket();

      const result = gateway.handleLeaveRoom(client, { room: roomId });

      expect(client.leave).toHaveBeenCalledWith(roomId);
      expect(result).toEqual({ left: roomId });
    });
  });
});
