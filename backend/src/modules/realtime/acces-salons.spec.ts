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

  // ─── La BUVETTE — la meme porte que les autres salons ──────────

  /**
   * `accesBuvette` lisait la table des membres DIRECTEMENT. Un SUPER_ADMIN
   * n'a pas de ligne d'adhesion : il etait donc refuse ici, alors qu'il
   * franchit la garde partout ailleurs. La supervision marchait sur le
   * tableau de bord d'un club et PAS sur une de ses buvettes — c'est-a-dire
   * precisement la ou on regarde quand un comptoir ne suit plus.
   */
  it('laisse un SUPER_ADMIN ecouter une buvette, comme les autres salons', async () => {
    prisma.user.findUnique.mockResolvedValue({ globalRole: 'SUPER_ADMIN' });
    prisma.supplier.findUnique.mockResolvedValue({ organizationId: AUTRE_CLUB });
    await expect(rejoindre('supplier:b-autre')).resolves.toBeDefined();
  });

  it('REFUSE la buvette d’un autre club a un simple membre', async () => {
    prisma.supplier.findUnique.mockResolvedValue({ organizationId: AUTRE_CLUB });
    await expect(rejoindre('supplier:b-autre')).rejects.toThrow(WsException);
  });

  it('accepte la buvette de SON club', async () => {
    prisma.supplier.findUnique.mockResolvedValue({ organizationId: MON_CLUB });
    await expect(rejoindre('supplier:b-mien')).resolves.toBeDefined();
  });

  /**
   * Le rattachement a UN comptoir reste la regle pour les comptes qui en
   * ont un : l'ouverture au SUPER_ADMIN ne doit pas la lever.
   */
  it('un compte rattache a UN comptoir n’ecoute que le sien', async () => {
    prisma.supplier.findUnique.mockResolvedValue({ organizationId: MON_CLUB });
    prisma.organizationMember.findUnique.mockResolvedValue({
      orgRole: 'OPERATOR',
      supplierId: 'b-le-sien',
    });

    await expect(rejoindre('supplier:b-le-sien')).resolves.toBeDefined();
    await expect(rejoindre('supplier:b-un-autre')).rejects.toThrow(WsException);
  });

  it('REFUSE une buvette qui n’existe pas', async () => {
    prisma.supplier.findUnique.mockResolvedValue(null);
    await expect(rejoindre('supplier:fantome')).rejects.toThrow(WsException);
  });

  // ─── Ce que coute un `join_room` ───────────────────────────────

  /**
   * LE LIMITEUR HTTP NE VOIT PAS SOCKET.IO.
   *
   * Chaque `join_room` declenchait une a deux lectures Prisma, sans aucune
   * borne. Une socket authentifiee pouvait marteler ce message et faire
   * tourner la base autant qu'elle voulait — une amplification SQL offerte
   * a qui a un compte, et il en suffit d'un.
   *
   * Rejoindre deux fois le meme salon est d'ailleurs SANS EFFET cote
   * Socket.IO : la seconde lecture etait deja du travail pour rien, meme
   * sans intention de nuire — une reconnexion en rejoue plusieurs.
   */
  describe('le cout d’un join_room', () => {
    /** Une socket qui VIT : `client.data` porte la memoire des salons. */
    const socket = () => ({ data: { user: { sub: MOI } }, id: 's1', join: jest.fn() });

    it('ne relit PAS la base quand on rejoint le meme salon', async () => {
      const c = socket();
      const salon = `organization:${MON_CLUB}`;

      for (let i = 0; i < 5; i += 1) {
        await gateway.handleJoinRoom(c as never, { room: salon } as never);
      }

      // Une seule verification, cinq entrees : Socket.IO deduplique de son
      // cote, mais c'est la LECTURE qu'on voulait economiser.
      expect(prisma.organizationMember.findUnique).toHaveBeenCalledTimes(1);
      expect(c.join).toHaveBeenCalledTimes(5);
    });

    /**
     * Sans borne, la memoire se retourne contre nous : il suffirait de
     * demander des salons TOUJOURS DIFFERENTS pour relire la base a chaque
     * fois, et faire enfler le cache au passage.
     */
    it('refuse au-dela de 30 salons distincts', async () => {
      const c = socket();
      prisma.event.findUnique.mockResolvedValue({ organizationId: MON_CLUB });

      for (let i = 0; i < 30; i += 1) {
        await gateway.handleJoinRoom(c as never, { room: `event:e${i}` } as never);
      }

      await expect(
        gateway.handleJoinRoom(c as never, { room: 'event:e30' } as never),
      ).rejects.toThrow(WsException);
    });

    /**
     * La borne ne doit pas devenir une porte : un salon refuse ne s'inscrit
     * PAS dans la memoire, sinon un refus ouvrirait l'acces au suivant.
     */
    it('un salon REFUSE ne s’inscrit pas dans la memoire', async () => {
      const c = socket();
      prisma.event.findUnique.mockResolvedValue({ organizationId: AUTRE_CLUB });

      await expect(
        gateway.handleJoinRoom(c as never, { room: 'event:e-autre' } as never),
      ).rejects.toThrow(WsException);
      // Une seconde tentative doit RE-verifier, et refuser de nouveau.
      await expect(
        gateway.handleJoinRoom(c as never, { room: 'event:e-autre' } as never),
      ).rejects.toThrow(WsException);

      expect(prisma.event.findUnique).toHaveBeenCalledTimes(2);
      expect(c.join).not.toHaveBeenCalled();
    });

    /** La memoire est portee par LA SOCKET : une autre repart de zero. */
    it('deux sockets ne partagent pas leur memoire', async () => {
      const a = socket();
      const b = socket();
      const salon = `organization:${MON_CLUB}`;

      await gateway.handleJoinRoom(a as never, { room: salon } as never);
      await gateway.handleJoinRoom(b as never, { room: salon } as never);

      expect(prisma.organizationMember.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
