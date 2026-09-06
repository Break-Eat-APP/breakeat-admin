import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';
import { PrismaService } from '../../database/prisma.service';

/**
 * ISOLATION DES BUVETTES.
 *
 * Un lieu peut en aligner quatre. Chaque commande doit arriver au comptoir que
 * le CLIENT a choisi, et à lui seul — ni ailleurs, ni en double. Une commande
 * dupliquée se prépare deux fois : deux fois le produit sorti du stock, deux
 * équipiers mobilisés, et un client qui n'en récupère qu'une.
 *
 * Ce fichier verrouille les trois chemins par lesquels une commande atteint un
 * poste. Ils doivent répondre la même chose ; qu'un seul s'écarte, et le
 * cloisonnement ne tient plus.
 */
describe('Isolation des buvettes', () => {
  const CLUB = 'org-1';
  const NORD = 'supplier-nord';
  const SUD = 'supplier-sud';

  // ─── 1. Le temps réel vise LE comptoir concerné ──────────────
  describe('diffusion temps réel', () => {
    function serviceAvecSalons(salons: string[]) {
      // On note QUELS salons sont vises : c'est la seule chose qui decide
      // quel poste sonne.
      const gateway = {
        server: {
          to: (salon: string) => {
            salons.push(salon);
            return { emit: () => undefined };
          },
        },
      };
      return new RealtimeService(gateway as never);
    }

    it('adresse une nouvelle commande au salon de SA buvette', () => {
      const salons: string[] = [];
      serviceAvecSalons(salons).emitNewOrder({
        orderId: 'o1',
        publicOrderNumber: 'BE-1',
        organizationId: CLUB,
        eventId: 'e1',
        supplierId: NORD,
        status: 'PAID',
        totalCents: 250,
        createdAt: new Date().toISOString(),
      } as never);

      expect(salons).toContain(`supplier:${NORD}`);
      // Et jamais celui du voisin.
      expect(salons).not.toContain(`supplier:${SUD}`);
    });
  });

  // ─── 2. Un poste ne peut ÉCOUTER que sa buvette ──────────────
  describe('accès aux salons', () => {
    let gateway: RealtimeGateway;
    let prisma: {
      supplier: { findUnique: jest.Mock };
      organizationMember: { findUnique: jest.Mock };
    };

    beforeEach(async () => {
      prisma = {
        supplier: { findUnique: jest.fn() },
        organizationMember: { findUnique: jest.fn() },
      };
      const module = await Test.createTestingModule({
        providers: [
          RealtimeGateway,
          RealtimeService,
          { provide: PrismaService, useValue: prisma },
          { provide: JwtService, useValue: { verify: jest.fn() } },
          { provide: ConfigService, useValue: { get: jest.fn() } },
        ],
      }).compile();
      gateway = module.get(RealtimeGateway);
    });

    const client = () => ({ id: 'ws-1', data: { user: { sub: 'u1' } }, join: jest.fn() });

    it('laisse entrer un équipier rattaché à CETTE buvette', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ organizationId: CLUB });
      prisma.organizationMember.findUnique.mockResolvedValue({ supplierId: NORD });

      const c = client();
      await gateway.handleJoinRoom(c as never, { room: `supplier:${NORD}` } as never);

      expect(c.join).toHaveBeenCalledWith(`supplier:${NORD}`);
    });

    it('REFUSE le comptoir d’à côté', async () => {
      // Le garde-fou d'origine reposait sur le secret des identifiants. Or la
      // route publique d'un evenement les publie tous, pour que le client
      // choisisse son stand : n'importe quel equipier pouvait ecouter le flux
      // du voisin, et preparer ses commandes.
      prisma.supplier.findUnique.mockResolvedValue({ organizationId: CLUB });
      prisma.organizationMember.findUnique.mockResolvedValue({ supplierId: NORD });

      const c = client();
      await expect(
        gateway.handleJoinRoom(c as never, { room: `supplier:${SUD}` } as never),
      ).rejects.toBeInstanceOf(WsException);
      expect(c.join).not.toHaveBeenCalled();
    });

    it('laisse un responsable NON rattaché écouter n’importe lequel de SES comptoirs', async () => {
      // Un gerant suit ses quatre buvettes : il n'est epingle a aucune.
      prisma.supplier.findUnique.mockResolvedValue({ organizationId: CLUB });
      prisma.organizationMember.findUnique.mockResolvedValue({ supplierId: null });

      const c = client();
      await gateway.handleJoinRoom(c as never, { room: `supplier:${SUD}` } as never);

      expect(c.join).toHaveBeenCalledWith(`supplier:${SUD}`);
    });

    it('REFUSE une buvette d’un autre club', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ organizationId: 'autre-club' });
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      const c = client();
      await expect(
        gateway.handleJoinRoom(c as never, { room: `supplier:${NORD}` } as never),
      ).rejects.toBeInstanceOf(WsException);
    });
  });
});
