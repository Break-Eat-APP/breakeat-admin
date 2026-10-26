import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { RealtimeGateway } from './realtime.gateway';
import { PrismaService } from '../../database/prisma.service';

/**
 * QUI PEUT ÉCOUTER QUOI — un test négatif par type de salon.
 *
 * Avant ce fichier, `peutRejoindre` n'examinait que `supplier:` et laissait
 * passer tout le reste. Or `organization:`, `event:`, `order:` et
 * `pickup-point:` portent des commandes, des montants et des noms de clients.
 * Un compte authentifié qui connaissait un UUID écoutait le flux d'un autre
 * club — sans jamais toucher à l'API REST, qui le lui aurait refusé.
 *
 * Ce qui est en jeu n'est pas une fuite abstraite : c'est le carnet de
 * commandes d'un concurrent, en direct, et les allées et venues de ses
 * clients.
 *
 * **Le secret d'un identifiant n'est pas une autorisation.** Un UUID circule —
 * dans une URL, un journal, une capture d'écran, un rapport. Ces tests
 * existent pour que personne ne refasse ce pari.
 */
describe('Accès aux salons temps réel', () => {
  const MOI = 'user-moi';
  const MON_CLUB = 'org-mien';
  const AUTRE_CLUB = 'org-autre';

  let gateway: RealtimeGateway;
  let prisma: {
    user: { findUnique: jest.Mock };
    organizationMember: { findUnique: jest.Mock };
    supplier: { findUnique: jest.Mock };
    event: { findUnique: jest.Mock };
    pickupPoint: { findUnique: jest.Mock };
    order: { findUnique: jest.Mock };
  };

  /** Rejoindre un salon, comme le ferait un client connecté. */
  const rejoindre = (salon: string) =>
    gateway.handleJoinRoom({ data: { user: { sub: MOI } }, id: 's1', join: () => undefined } as never, {
      room: salon,
    } as never);

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ globalRole: 'CUSTOMER' }) },
      // Membre de MON_CLUB, de rien d'autre.
      organizationMember: {
        findUnique: jest.fn(({ where }: { where: { userId_organizationId: { organizationId: string } } }) =>
          Promise.resolve(
            where.userId_organizationId.organizationId === MON_CLUB
              ? { orgRole: 'MANAGER', supplierId: null }
              : null,
          ),
        ),
      },
      supplier: { findUnique: jest.fn() },
      event: { findUnique: jest.fn() },
      pickupPoint: { findUnique: jest.fn() },
      order: { findUnique: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { verify: () => ({ sub: MOI }) } },
        { provide: ConfigService, useValue: { get: () => 'secret' } },
      ],
    }).compile();

    gateway = module.get(RealtimeGateway);
  });

  // ─── La CONNEXION elle-même ─────────────────────────────────────

  /**
   * LE JETON NE SUFFIT PAS.
   *
   * La passerelle vérifiait la signature et l'expiration, mais pas l'état du
   * compte — là où `JwtStrategy` le relit à chaque requête REST. Un compte
   * désactivé gardait donc sa connexion temps réel jusqu'à l'expiration de
   * son jeton : quelqu'un qu'on venait d'écarter continuait de voir arriver
   * les commandes, leurs montants et les noms des clients.
   */
  describe('connexion', () => {
    const socket = () => ({
      id: 's1',
      handshake: { auth: { token: 'jeton' }, headers: {} },
      data: {} as Record<string, unknown>,
      disconnect: jest.fn(),
    });

    it('REFUSE un compte désactivé, même avec un jeton valide', async () => {
      prisma.user.findUnique.mockResolvedValue({ isActive: false });
      const client = socket();

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.data.user).toBeUndefined();
    });

    it('REFUSE un compte qui n’existe plus', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const client = socket();

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalled();
    });

    it('accepte un compte actif', async () => {
      prisma.user.findUnique.mockResolvedValue({ isActive: true });
      const client = socket();

      await gateway.handleConnection(client as never);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.data.user).toEqual({ sub: MOI });
    });
  });

  // ─── Ce qui doit être REFUSÉ ────────────────────────────────────

  it('REFUSE le salon d’une organisation dont on n’est pas membre', async () => {
    await expect(rejoindre(`organization:${AUTRE_CLUB}`)).rejects.toThrow(WsException);
  });

  it('REFUSE l’événement d’un autre club', async () => {
    prisma.event.findUnique.mockResolvedValue({ organizationId: AUTRE_CLUB });
    await expect(rejoindre('event:e-autre')).rejects.toThrow(WsException);
  });

  it('REFUSE le point de retrait d’un autre club', async () => {
    prisma.pickupPoint.findUnique.mockResolvedValue({ organizationId: AUTRE_CLUB });
    await expect(rejoindre('pickup-point:p-autre')).rejects.toThrow(WsException);
  });

  it('REFUSE la commande d’un autre client, dans un autre club', async () => {
    prisma.order.findUnique.mockResolvedValue({ userId: 'quelqu-un', organizationId: AUTRE_CLUB });
    await expect(rejoindre('order:o-autre')).rejects.toThrow(WsException);
  });

  it('REFUSE le tableau de bord d’un autre club', async () => {
    await expect(rejoindre(`dashboard:${AUTRE_CLUB}`)).rejects.toThrow(WsException);
  });

  it('REFUSE un salon dont l’objet n’existe pas — pas de repli permissif', async () => {
    prisma.event.findUnique.mockResolvedValue(null);
    await expect(rejoindre('event:inexistant')).rejects.toThrow(WsException);
  });

  /**
   * LE DÉFAUT EST LE REFUS. Un salon ajouté demain reste fermé tant que sa
   * règle n'est pas écrite — c'est exactement l'inverse du défaut qui a
   * produit la faille.
   */
  it('REFUSE un préfixe inconnu', async () => {
    await expect(rejoindre('facturation:tout')).rejects.toThrow(WsException);
  });

  it('REFUSE un salon malformé', async () => {
    await expect(rejoindre('organization')).rejects.toThrow(WsException);
    await expect(rejoindre('organization:')).rejects.toThrow(WsException);
  });

  // ─── Ce qui doit PASSER — sinon la correction casse le produit ──

  it('accepte le salon de SON club', async () => {
    await expect(rejoindre(`organization:${MON_CLUB}`)).resolves.toEqual({
      joined: `organization:${MON_CLUB}`,
    });
  });

  it('accepte l’événement de son club', async () => {
    prisma.event.findUnique.mockResolvedValue({ organizationId: MON_CLUB });
    await expect(rejoindre('event:e-mien')).resolves.toBeDefined();
  });

  /**
   * Un client n'est membre d'aucun club : il suit sa commande parce qu'elle
   * est la SIENNE. Sans cette règle, la correction couperait le suivi de
   * commande de tous les clients.
   */
  it('accepte SA PROPRE commande, même sans appartenir au club', async () => {
    prisma.order.findUnique.mockResolvedValue({ userId: MOI, organizationId: AUTRE_CLUB });
    await expect(rejoindre('order:o-mien')).resolves.toBeDefined();
  });

  it('accepte la commande d’un client de son club — le comptoir la suit aussi', async () => {
    prisma.order.findUnique.mockResolvedValue({ userId: 'un-client', organizationId: MON_CLUB });
    await expect(rejoindre('order:o-club')).resolves.toBeDefined();
  });

  /**
   * Un SUPER_ADMIN franchit la garde d'organisation côté REST. Les deux
   * chemins doivent répondre la même chose, sinon l'un des deux ment.
   */
  it('laisse passer un SUPER_ADMIN, comme le REST', async () => {
    prisma.user.findUnique.mockResolvedValue({ globalRole: 'SUPER_ADMIN' });
    await expect(rejoindre(`organization:${AUTRE_CLUB}`)).resolves.toBeDefined();
  });
});
