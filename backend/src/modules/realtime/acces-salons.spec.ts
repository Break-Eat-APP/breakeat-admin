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

    /**
     * LA BORNE DOIT TENIR MEME QUAND TOUT PART EN MEME TEMPS.
     *
     * Compter, attendre la base, puis s'ajouter : trente-et-une demandes
     * lancees ensemble lisaient toutes une taille inferieure a trente,
     * attendaient, et s'ajoutaient toutes. La borne ne tenait que si les
     * demandes arrivaient une par une — c'est-a-dire jamais, dans le cas
     * qu'elle est censee empecher.
     */
    it('tient la borne meme sur 40 demandes SIMULTANEES', async () => {
      const c = socket();
      prisma.event.findUnique.mockImplementation(
        () => new Promise((r) => setTimeout(() => r({ organizationId: MON_CLUB }), 5)),
      );

      const issues = await Promise.allSettled(
        Array.from({ length: 40 }, (_, i) =>
          gateway.handleJoinRoom(c as never, { room: `event:e${i}` } as never),
        ),
      );

      const admis = issues.filter((r) => r.status === 'fulfilled').length;
      expect(admis).toBe(30);
      expect(issues.filter((r) => r.status === 'rejected')).toHaveLength(10);
    });

    /**
     * UNE RESERVATION N'EST PAS UNE AUTORISATION. Poser le salon dans la
     * memoire avant de l'avoir verifie ferait entrer une seconde demande
     * par le chemin rapide — celui qui ne verifie plus rien.
     */
    it('une demande REFUSEE ne laisse pas passer sa jumelle', async () => {
      const c = socket();
      prisma.event.findUnique.mockImplementation(
        () => new Promise((r) => setTimeout(() => r({ organizationId: AUTRE_CLUB }), 5)),
      );

      const issues = await Promise.allSettled([
        gateway.handleJoinRoom(c as never, { room: 'event:e-autre' } as never),
        gateway.handleJoinRoom(c as never, { room: 'event:e-autre' } as never),
      ]);

      expect(issues.every((r) => r.status === 'rejected')).toBe(true);
      expect(c.join).not.toHaveBeenCalled();
    });

    /**
     * Une base qui hoquette ne doit pas consommer les trente places : sans
     * liberation, la socket serait fermee pour de bon apres trente pannes.
     */
    it('libere la place quand la base echoue', async () => {
      const c = socket();
      prisma.event.findUnique.mockRejectedValue(new Error('base injoignable'));

      for (let i = 0; i < 35; i += 1) {
        await gateway
          .handleJoinRoom(c as never, { room: `event:e${i}` } as never)
          .catch(() => undefined);
      }

      // Rien n'a ete autorise, donc rien ne doit etre reserve non plus : une
      // demande valide passe encore.
      prisma.event.findUnique.mockResolvedValue({ organizationId: MON_CLUB });
      await expect(
        gateway.handleJoinRoom(c as never, { room: 'event:e-valide' } as never),
      ).resolves.toBeDefined();
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

  // ─── Retirer un acces sans attendre la reconnexion ─────────────

  /**
   * LA MEMOIRE DES SALONS AVAIT UN PRIX.
   *
   * Elle evite de relire la base a chaque message, mais une autorisation
   * retiree ne prenait effet qu'a la deconnexion : un equipier ecarte d'une
   * buvette continuait d'en voir arriver les commandes, les montants et les
   * noms — parfois des heures.
   *
   * Et rejouer la verification a l'entree n'y aurait rien fait : une fois
   * dans le salon, Socket.IO livre sans plus rien demander. Il faut FAIRE
   * SORTIR la socket.
   */
  describe('la revocation', () => {
    const socketDans = (salons: string[]) => ({
      id: 'ws-1',
      data: { user: { sub: MOI }, salonsAutorises: new Set(salons) },
      join: jest.fn(),
      leave: jest.fn(),
    });

    const brancher = (clients: unknown[]) => {
      (gateway as unknown as { server: unknown }).server = {
        sockets: { sockets: new Map(clients.map((c, i) => [String(i), c])) },
      };
    };

    it('fait SORTIR d’une buvette dont l’acces a ete retire', async () => {
      const c = socketDans(['supplier:b-perdue']);
      brancher([c]);
      prisma.supplier.findUnique.mockResolvedValue({ organizationId: AUTRE_CLUB });

      expect(await gateway.revoquerLesAccesPerdus()).toBe(1);
      expect(c.leave).toHaveBeenCalledWith('supplier:b-perdue');
      // Et la memoire est nettoyee : sinon le chemin rapide le readmettrait.
      expect(c.data.salonsAutorises.has('supplier:b-perdue')).toBe(false);
    });

    it('ne touche PAS a un acces toujours valide', async () => {
      const c = socketDans([`organization:${MON_CLUB}`]);
      brancher([c]);

      expect(await gateway.revoquerLesAccesPerdus()).toBe(0);
      expect(c.leave).not.toHaveBeenCalled();
    });

    /**
     * Un client suit SA commande : cela ne se revoque pas. Et reverifier dix
     * mille salons de commande chaque minute ferait dix mille lectures pour
     * une autorisation qui ne peut pas changer.
     */
    it('ne reverifie jamais le salon d’une commande', async () => {
      const c = socketDans(['order:o-1']);
      brancher([c]);

      expect(await gateway.revoquerLesAccesPerdus()).toBe(0);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
      expect(c.leave).not.toHaveBeenCalled();
    });

    /**
     * Couper un comptoir qui travaille parce qu'une requete a echoue serait
     * pire que le retard qu'on cherche a combler.
     */
    it('ne retire RIEN quand la base est injoignable', async () => {
      const c = socketDans(['supplier:b-1']);
      brancher([c]);
      prisma.supplier.findUnique.mockRejectedValue(new Error('base injoignable'));

      expect(await gateway.revoquerLesAccesPerdus()).toBe(0);
      expect(c.leave).not.toHaveBeenCalled();
    });

    it('ne fait rien tant que la passerelle n’a pas de serveur', async () => {
      (gateway as unknown as { server: unknown }).server = undefined;
      expect(await gateway.revoquerLesAccesPerdus()).toBe(0);
    });
  });
});
