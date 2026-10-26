import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventStatus, EventVisibility } from '@prisma/client';
import { EventsService } from './events.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const EVENT_ID = 'event-1';
const VENUE_ID = 'venue-1';
const SUPPLIER_ID = 'supplier-1';

function mockEvent(
  overrides: Partial<{ status: EventStatus; visibility: EventVisibility }> = {},
) {
  return {
    id: EVENT_ID,
    organizationId: ORG_ID,
    venueId: VENUE_ID,
    name: 'Test Event',
    startAt: new Date('2026-06-01T09:00:00Z'),
    endAt: new Date('2026-06-01T18:00:00Z'),
    status: EventStatus.DRAFT,
    visibility: EventVisibility.PUBLIC,
    activeFeatureFlags: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockMember(orgRole = 'ORG_ADMIN') {
  return { userId: USER_ID, organizationId: ORG_ID, orgRole };
}

// ─── Tests ────────────────────────────────────────────────────

describe('EventsService', () => {
  let service: EventsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: PrismaService,
          useValue: {
            // requireOrgAccess now queries user.globalRole first
            user: { findUnique: jest.fn() },
            organizationMember: { findUnique: jest.fn() },
            venue: { findFirst: jest.fn() },
            order: { count: jest.fn() },
            event: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            supplier: { findFirst: jest.fn() },
            eventSupplier: {
              findUnique: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
            },
            // Phase 14.7 — group access wiring
            group: { count: jest.fn() },
            eventGroup: { deleteMany: jest.fn(), createMany: jest.fn() },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prisma = module.get(PrismaService);
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('creates an event when caller is ORG_ADMIN and venue belongs to org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue({ id: VENUE_ID });
      const created = mockEvent();
      (prisma.event.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(ORG_ID, USER_ID, {
        venueId: VENUE_ID,
        name: 'Test Event',
        startAt: '2026-06-01T09:00:00Z',
        endAt: '2026-06-01T18:00:00Z',
      });

      expect(result).toEqual(created);
      expect(prisma.event.create).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException when caller is not an org member', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, {
          venueId: VENUE_ID,
          name: 'Test Event',
          startAt: '2026-06-01T09:00:00Z',
          endAt: '2026-06-01T18:00:00Z',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when venue does not belong to org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, {
          venueId: 'wrong-venue',
          name: 'Test Event',
          startAt: '2026-06-01T09:00:00Z',
          endAt: '2026-06-01T18:00:00Z',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when endAt <= startAt', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue({ id: VENUE_ID });

      await expect(
        service.create(ORG_ID, USER_ID, {
          venueId: VENUE_ID,
          name: 'Test Event',
          startAt: '2026-06-01T18:00:00Z',
          endAt: '2026-06-01T09:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update (Phase 14.7 — visibility + group access) ─────────

  // PHASE 22 — le contenant d'un lieu permanent est hors de portée.
  //
  // Il est déjà écarté des listes, donc invisible ; ces tests couvrent l'appel
  // direct à l'API. Le clore ou le renommer priverait le lieu de son seul point
  // d'ancrage : plus aucune commande possible, sans explication côté club.
  describe('contenant permanent', () => {
    const conteneur = { ...mockEvent(), isPermanentContainer: true };

    it('refuse de le modifier', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(conteneur);

      await expect(
        service.update(ORG_ID, EVENT_ID, USER_ID, { name: 'Renommé' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('refuse d’en changer le statut', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue({
        ...conteneur,
        status: EventStatus.ACTIVE,
      });

      await expect(
        service.updateStatus(ORG_ID, EVENT_ID, USER_ID, { status: EventStatus.ENDED }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('refuse de le supprimer', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(conteneur);

      await expect(service.remove(ORG_ID, EVENT_ID, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it('l’écarte de la liste des événements de l’organisation', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllByOrg(ORG_ID, USER_ID);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isPermanentContainer: false }),
        }),
      );
    });

    it('le réintègre pour qui doit travailler dessus (poste opérateur)', async () => {
      // Sans cette porte, un restaurant n'offre aucun tableau de commandes :
      // l'opérateur se connecte et tombe sur une page vide.
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findMany as jest.Mock).mockResolvedValue([]);

      await service.findAllByOrg(ORG_ID, USER_ID, { includePermanent: true });

      const where = (prisma.event.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where).not.toHaveProperty('isPermanentContainer');
      expect(where.organizationId).toBe(ORG_ID);
    });
  });

  describe('update', () => {
    it('sets event visibility to PRIVATE', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      const updated = mockEvent({ visibility: EventVisibility.PRIVATE });
      (prisma.event.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.update(ORG_ID, EVENT_ID, USER_ID, {
        visibility: EventVisibility.PRIVATE,
      });

      expect(result.visibility).toBe(EventVisibility.PRIVATE);
      expect(prisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EVENT_ID },
          data: expect.objectContaining({ visibility: EventVisibility.PRIVATE }),
        }),
      );
      // No group set provided → must not touch the join table.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.eventGroup.deleteMany).not.toHaveBeenCalled();
    });

    it('replaces the event group set when groupIds are provided', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      // Both groups belong to the org.
      (prisma.group.count as jest.Mock).mockResolvedValue(2);
      (prisma.event.update as jest.Mock).mockResolvedValue(
        mockEvent({ visibility: EventVisibility.PRIVATE }),
      );
      (prisma.eventGroup.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.eventGroup.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      // Run the transaction callback against the same prisma mock.
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(prisma));

      await service.update(ORG_ID, EVENT_ID, USER_ID, {
        visibility: EventVisibility.PRIVATE,
        groupIds: ['group-1', 'group-2'],
      });

      expect(prisma.group.count).toHaveBeenCalledWith({
        where: { id: { in: ['group-1', 'group-2'] }, organizationId: ORG_ID },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.eventGroup.deleteMany).toHaveBeenCalledWith({
        where: { eventId: EVENT_ID },
      });
      expect(prisma.eventGroup.createMany).toHaveBeenCalledWith({
        data: [
          { eventId: EVENT_ID, groupId: 'group-1' },
          { eventId: EVENT_ID, groupId: 'group-2' },
        ],
        skipDuplicates: true,
      });
    });

    it('clears all group links when groupIds is an empty array', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.event.update as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventGroup.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(prisma));

      await service.update(ORG_ID, EVENT_ID, USER_ID, { groupIds: [] });

      // Empty set: no ownership check needed, wipe links, create nothing.
      expect(prisma.group.count).not.toHaveBeenCalled();
      expect(prisma.eventGroup.deleteMany).toHaveBeenCalledWith({
        where: { eventId: EVENT_ID },
      });
      expect(prisma.eventGroup.createMany).not.toHaveBeenCalled();
    });

    it('rejects groupIds that do not all belong to the org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      // Only 1 of the 2 requested groups is owned by this org.
      (prisma.group.count as jest.Mock).mockResolvedValue(1);

      await expect(
        service.update(ORG_ID, EVENT_ID, USER_ID, {
          groupIds: ['group-1', 'foreign-group'],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.eventGroup.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus ────────────────────────────────────────────

  describe('updateStatus', () => {
    it('transitions DRAFT → ACTIVE', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent({ status: EventStatus.DRAFT }));
      const updated = mockEvent({ status: EventStatus.ACTIVE });
      (prisma.event.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateStatus(ORG_ID, EVENT_ID, USER_ID, {
        status: EventStatus.ACTIVE,
      });

      expect(result.status).toBe(EventStatus.ACTIVE);
    });

    it('rejects invalid transition ENDED → ACTIVE', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent({ status: EventStatus.ENDED }));

      await expect(
        service.updateStatus(ORG_ID, EVENT_ID, USER_ID, { status: EventStatus.ACTIVE }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects any modification on a CANCELLED event', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(
        mockEvent({ status: EventStatus.CANCELLED }),
      );

      await expect(
        service.updateStatus(ORG_ID, EVENT_ID, USER_ID, { status: EventStatus.ACTIVE }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── attachSupplier ──────────────────────────────────────────

  describe('attachSupplier', () => {
    it('attaches a supplier to an event', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue({ id: SUPPLIER_ID });
      (prisma.eventSupplier.findUnique as jest.Mock).mockResolvedValue(null);
      const es = { id: 'es-1', eventId: EVENT_ID, supplierId: SUPPLIER_ID, createdAt: new Date() };
      (prisma.eventSupplier.create as jest.Mock).mockResolvedValue(es);

      const result = await service.attachSupplier(ORG_ID, EVENT_ID, SUPPLIER_ID, USER_ID);
      expect(result).toEqual(es);
    });

    it('throws ConflictException when supplier already attached', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue({ id: SUPPLIER_ID });
      (prisma.eventSupplier.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(
        service.attachSupplier(ORG_ID, EVENT_ID, SUPPLIER_ID, USER_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── remove ───────────────────────────────────────────────────
  //
  // Archiver et supprimer repondent a deux besoins distincts : le premier sort
  // l'evenement de la circulation en gardant tout, le second efface la ligne.
  // Les confondre ferait disparaitre un chiffre d'affaires sans trace.

  describe('remove', () => {
    it('supprime un evenement qui n’a jamais rien vendu', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.order.count as jest.Mock).mockResolvedValue(0);

      await service.remove(ORG_ID, EVENT_ID, USER_ID);

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: EVENT_ID } });
    });

    it('refuse des qu’une commande y est rattachee', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.order.count as jest.Mock).mockResolvedValue(12);

      await expect(service.remove(ORG_ID, EVENT_ID, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      // Le chiffre d'affaires de la saison reste intact.
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it('renvoie 404 sur un evenement inconnu', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.remove(ORG_ID, EVENT_ID, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── liens de commande Flaix ────────────────────────────────

  describe('definirLiensCommandeFlaix', () => {
    const LIEN = 'https://ops.flaixlabs.com/commande/om-lyon';

    beforeEach(() => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.$transaction as jest.Mock).mockImplementation(async (ops: unknown[]) => ops);
    });

    it('pose les liens de plusieurs evenements en une fois', async () => {
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
        { id: 'e2', name: 'OM - Nice', isPermanentContainer: false },
      ]);

      const res = await service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
        { eventId: 'e1', url: LIEN },
        { eventId: 'e2', url: 'https://ops.flaixlabs.com/commande/om-nice' },
      ]);

      expect(res).toEqual([
        { id: 'e1', flaixOrderUrl: LIEN },
        { id: 'e2', flaixOrderUrl: 'https://ops.flaixlabs.com/commande/om-nice' },
      ]);
      expect(prisma.event.update).toHaveBeenCalledTimes(2);
    });

    it('un lien vide RETIRE le lien', async () => {
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
      ]);

      const res = await service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
        { eventId: 'e1', url: '   ' },
      ]);

      expect(res).toEqual([{ id: 'e1', flaixOrderUrl: null }]);
    });

    it('TOUT OU RIEN : un seul lien invalide, et rien n’est ecrit', async () => {
      // A dix lignes saisies ensemble, un enregistrement partiel laisserait le
      // club croire que tout est passe — et c'est le match dont le lien a ete
      // rejete qui s'ouvrirait sur le mauvais parcours, un samedi soir.
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
        { id: 'e2', name: 'OM - Nice', isPermanentContainer: false },
      ]);

      await expect(
        service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
          { eventId: 'e1', url: LIEN },
          { eventId: 'e2', url: 'https://faux-flaix.example.com/commande' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('le refus NOMME l’evenement fautif', async () => {
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e2', name: 'OM - Nice', isPermanentContainer: false },
      ]);

      await expect(
        service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
          { eventId: 'e2', url: 'http://ops.flaixlabs.com/x' },
        ]),
      ).rejects.toThrow(/OM - Nice/);
    });

    it('refuse un lien qui n’est pas chez Flaix', async () => {
      // Cette adresse mene a une page ou le client PAIE. Accepter n'importe
      // quel domaine, c'est offrir un hameconnage parfait, signe Break Eat.
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
      ]);

      await expect(
        service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
          { eventId: 'e1', url: 'https://flaixlabs.com.pirate.io/commande' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuse le meme evenement cite deux fois', async () => {
      await expect(
        service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
          { eventId: 'e1', url: LIEN },
          { eventId: 'e1', url: 'https://ops.flaixlabs.com/autre' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('un evenement d’une AUTRE organisation est traite comme inexistant', async () => {
      // Repondre « pas a vous » confirmerait son existence a qui devine un UUID.
      (prisma.event.findMany as jest.Mock).mockResolvedValue([]);

      await expect(
        service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [{ eventId: 'e-ailleurs', url: LIEN }]),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuse un appelant qui n’est pas du club', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [{ eventId: 'e1', url: LIEN }]),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // ─── L'ADVERSAIRE — nom et blason, saisis avec le lien ────────

    /**
     * Lien et blason partent ENSEMBLE, parce qu'ils se saisissent ensemble.
     * Deux enregistrements separes, c'est deux fois plus d'occasions d'en
     * oublier un — et un calendrier a moitie rempli.
     */
    it('enregistre le lien, le nom et le blason en un seul geste', async () => {
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
      ]);

      const res = await service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
        {
          eventId: 'e1',
          url: LIEN,
          opponentName: '  Racing 92  ',
          opponentLogoUrl: 'https://cdn.example.com/r92.png',
        },
      ]);

      expect(res).toEqual([
        {
          id: 'e1',
          flaixOrderUrl: LIEN,
          opponentName: 'Racing 92',
          opponentLogoUrl: 'https://cdn.example.com/r92.png',
        },
      ]);
    });

    /**
     * UN CHAMP ABSENT NE S'EFFACE PAS.
     *
     * Avant, une ligne qui omettait `url` VIDAIT le lien du match : un club
     * venu corriger un blason perdait sa commande du samedi, sans un mot.
     * Corriger un champ ne doit jamais toucher les autres.
     */
    it('ne touche PAS au lien quand la ligne ne parle que du blason', async () => {
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
      ]);

      const res = await service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
        { eventId: 'e1', opponentName: 'Stade Rochelais' },
      ]);

      expect(res).toEqual([{ id: 'e1', opponentName: 'Stade Rochelais' }]);
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { opponentName: 'Stade Rochelais' },
      });
    });

    it('un nom fait d’espaces EFFACE le nom, il n’est pas enregistre tel quel', async () => {
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
      ]);

      const res = await service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
        { eventId: 'e1', opponentName: '   ' },
      ]);

      expect(res).toEqual([{ id: 'e1', opponentName: null }]);
    });

    /**
     * iOS refuse le http simple : un blason en http ne s'afficherait sur
     * AUCUN iPhone, et le club chercherait la panne du cote de son image.
     * On refuse a la saisie, ou le message se lit.
     */
    it('refuse un blason en http — il ne s’afficherait pas sur iPhone', async () => {
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
      ]);

      await expect(
        service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
          { eventId: 'e1', opponentLogoUrl: 'http://cdn.example.com/r92.png' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    /**
     * Le blason, lui, part dans la reponse PUBLIQUE de l'app : une adresse
     * porteuse d'identifiants les y exposerait.
     */
    it('refuse un blason qui porte des identifiants', async () => {
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
      ]);

      await expect(
        service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
          { eventId: 'e1', opponentLogoUrl: 'https://moi:secret@cdn.example.com/r92.png' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /**
     * Un blason refuse ne doit pas enregistrer le LIEN de la meme ligne :
     * le club verrait sa commande posee et son calendrier vide, sans savoir
     * ce qui est passe.
     */
    it('TOUT OU RIEN s’applique aussi au blason', async () => {
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
        { id: 'e2', name: 'OM - Nice', isPermanentContainer: false },
      ]);

      await expect(
        service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [
          { eventId: 'e1', url: LIEN, opponentName: 'Racing 92' },
          { eventId: 'e2', opponentLogoUrl: 'pas-une-adresse' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    /**
     * Une ligne qui ne demande rien ne doit pas toucher `updatedAt` : le
     * club verrait son match « modifie » sans l'avoir change.
     */
    it('une ligne sans aucun champ n’ecrit rien', async () => {
      (prisma.event.findMany as jest.Mock).mockResolvedValue([
        { id: 'e1', name: 'OM - Lyon', isPermanentContainer: false },
      ]);

      const res = await service.definirLiensCommandeFlaix(ORG_ID, USER_ID, [{ eventId: 'e1' }]);

      expect(res).toEqual([]);
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
