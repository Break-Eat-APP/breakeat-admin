import { BadRequestException } from '@nestjs/common';
import { PushTokensService } from './push-tokens.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * Le retrait d'un jeton SANS session (22/11/2026, BUG-2026-045) : rejoué par
 * le téléphone après une déconnexion faite sans réseau.
 */
describe('PushTokensService — retrait par jeton', () => {
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const service = new PushTokensService({ pushToken: { deleteMany } } as unknown as PrismaService);

  beforeEach(() => deleteMany.mockClear());

  it('retire le jeton, quel que soit le compte qui le porte', async () => {
    await expect(service.retirerParJeton('ExponentPushToken[abc123]')).resolves.toEqual({ ok: true });
    expect(deleteMany).toHaveBeenCalledWith({ where: { token: 'ExponentPushToken[abc123]' } });
  });

  it('refuse ce qui n’est pas un jeton Expo, sans toucher la base', async () => {
    await expect(service.retirerParJeton('nimporte-quoi')).rejects.toBeInstanceOf(BadRequestException);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('la déconnexion normale ne retire que le jeton du compte connecté', async () => {
    await service.unregister('u1', 'ExponentPushToken[abc123]');
    expect(deleteMany).toHaveBeenCalledWith({ where: { token: 'ExponentPushToken[abc123]', userId: 'u1' } });
  });
});
