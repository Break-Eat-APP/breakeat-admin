import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { RecuController } from './recu.controller';
import { RecuService } from './recu.service';

/**
 * Le reçu est un document PRIVÉ servi sans garde d'authentification.
 *
 * Il s'ouvre dans un navigateur, qui ne porte pas le jeton de session : l'accès
 * repose donc entièrement sur le jeton passé en adresse. Chacune des règles
 * ci-dessous est la seule chose qui empêche de lire le ticket d'un autre client
 * en changeant un numéro dans l'URL.
 */
describe('RecuController — qui peut lire un reçu', () => {
  const COMMANDE = '11111111-1111-4111-8111-111111111111';
  const AUTRE = '22222222-2222-4222-8222-222222222222';

  let controller: RecuController;
  let jwt: { verify: jest.Mock };

  beforeEach(async () => {
    jwt = { verify: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [RecuController],
      providers: [
        { provide: RecuService, useValue: { html: jest.fn().mockResolvedValue('<html></html>') } },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('secret') } },
      ],
    }).compile();
    controller = module.get(RecuController);
  });

  it('sert le reçu avec un jeton valide', async () => {
    jwt.verify.mockReturnValue({ orderId: COMMANDE, usage: 'recu' });
    await expect(controller.html(COMMANDE, 'jeton-ok')).resolves.toContain('<html>');
  });

  it('refuse sans jeton', async () => {
    await expect(controller.html(COMMANDE, '')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuse un jeton expiré ou falsifié', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    await expect(controller.html(COMMANDE, 'perime')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuse le jeton d’UNE AUTRE commande', async () => {
    // Sans cette verification, il suffirait d'echanger le numero dans
    // l'adresse pour lire le ticket d'un autre client avec son propre jeton.
    jwt.verify.mockReturnValue({ orderId: AUTRE, usage: 'recu' });
    await expect(controller.html(COMMANDE, 'jeton-dautrui')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuse un jeton de SESSION', async () => {
    // Un jeton d'acces ouvre tout le compte. S'il atterrissait ici -- copie
    // depuis un journal, une capture -- il ne doit pas valoir laissez-passer.
    jwt.verify.mockReturnValue({ sub: 'user-1', orderId: COMMANDE });
    await expect(controller.html(COMMANDE, 'jeton-de-session')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
