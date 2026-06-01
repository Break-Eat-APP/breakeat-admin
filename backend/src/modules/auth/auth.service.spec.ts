import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Mocks ────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  displayName: 'Test User',
  phone: null,
  globalRole: 'CUSTOMER',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUsersService = {
  create: jest.fn(),
  findByEmailWithPassword: jest.fn(),
  findById: jest.fn(),
  validatePassword: jest.fn(),
};

const mockPrismaService = {
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-access-token'),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-secret'),
};

// ─── Tests ────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('creates a user and returns tokens', async () => {
      mockUsersService.create.mockResolvedValue(mockUser);
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User',
      });

      expect(result.user).toEqual(mockUser);
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(mockUsersService.create).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException if email is taken', async () => {
      mockUsersService.create.mockRejectedValue(
        new ConflictException('Email already in use'),
      );

      await expect(
        service.register({
          email: 'taken@example.com',
          password: 'password123',
          displayName: 'User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns tokens on valid credentials', async () => {
      mockUsersService.findByEmailWithPassword.mockResolvedValue({
        ...mockUser,
        passwordHash: 'hashed',
      });
      mockUsersService.validatePassword.mockResolvedValue(true);
      mockPrismaService.refreshToken.create.mockResolvedValue({});

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
    });

    it('throws UnauthorizedException for unknown email', async () => {
      mockUsersService.findByEmailWithPassword.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'pw' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      mockUsersService.findByEmailWithPassword.mockResolvedValue({
        ...mockUser,
        passwordHash: 'hashed',
      });
      mockUsersService.validatePassword.mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for inactive user', async () => {
      mockUsersService.findByEmailWithPassword.mockResolvedValue({
        ...mockUser,
        isActive: false,
        passwordHash: 'hashed',
      });

      await expect(
        service.login({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('does not reveal whether email exists (same error for wrong email vs wrong password)', async () => {
      mockUsersService.findByEmailWithPassword.mockResolvedValue(null);
      const error1 = await service.login({ email: 'nobody@x.com', password: 'pw' })
        .catch((e: unknown) => e);

      mockUsersService.findByEmailWithPassword.mockResolvedValue({
        ...mockUser,
        passwordHash: 'hashed',
      });
      mockUsersService.validatePassword.mockResolvedValue(false);
      const error2 = await service.login({ email: 'test@example.com', password: 'wrong' })
        .catch((e: unknown) => e);

      expect((error1 as UnauthorizedException).message).toBe(
        (error2 as UnauthorizedException).message,
      );
    });
  });

  describe('logout', () => {
    it('is idempotent — does not throw if token not found', async () => {
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.logout('nonexistent-token')).resolves.not.toThrow();
    });
  });
});
