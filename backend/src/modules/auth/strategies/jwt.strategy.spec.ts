import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../../database/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────

function makePayload(sub = 'user-1') {
  return { sub, email: 'test@example.com', globalRole: 'CUSTOMER' };
}

// ─── Tests ────────────────────────────────────────────────────

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: jest.Mocked<PrismaService>;

  const mockConfig = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: mockConfig },
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    prisma = module.get(PrismaService);
  });

  it('returns payload with globalRole refreshed from DB', async () => {
    // DB has SUPER_ADMIN — the JWT payload had CUSTOMER (stale)
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      isActive: true,
      globalRole: 'SUPER_ADMIN',
    });

    const payload = makePayload(); // globalRole: 'CUSTOMER'
    const result = await strategy.validate(payload);

    // Sub and email come from the JWT; globalRole must come from DB
    expect(result.sub).toBe(payload.sub);
    expect(result.email).toBe(payload.email);
    expect(result.globalRole).toBe('SUPER_ADMIN'); // DB value wins
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, isActive: true, globalRole: true },
    });
  });

  it('throws UnauthorizedException when user does not exist', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(strategy.validate(makePayload())).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when user is inactive', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', isActive: false });

    await expect(strategy.validate(makePayload())).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when payload.sub is missing', async () => {
    // @ts-expect-error intentional bad payload for test
    await expect(strategy.validate({ email: 'x@x.com', globalRole: 'CUSTOMER' })).rejects.toThrow(
      UnauthorizedException,
    );
    // DB must NOT be queried when the payload itself is invalid
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
