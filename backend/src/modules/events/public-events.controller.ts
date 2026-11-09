import {
  Controller,
  Get,
  Query,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  ProductStatus,
  SlotStatus,
  FlagScope,
  EventStatus,
  EventVisibility,
  VenueStatus,
} from '@prisma/client';
import { GroupsService } from '../groups/groups.service';
import { SlotTemplatesService } from '../slots/slot-templates.service';
import { jourCalendaireLocal } from '../../common/helpers/jour-de-service';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { OrgStatus } from '@prisma/client';
import {
  aNePasManquer,
  type EvenementANePasManquer,
  type LieuEtSesEvenements,
} from '../../common/helpers/a-ne-pas-manquer';
import { CacheCourt, dureeCacheLieux } from '../../common/helpers/cache-court';

/**
 * Combien de lieux favoris on accepte d'interroger d'un coup.
 *
 * Vingt : bien au-dela de ce qu'un supporter suit, et assez bas pour
 * qu'une liste fabriquee a la main ne fasse pas parcourir la table des
 * evenements. Les identifiants au-dela sont ignores, pas refuses.
 */
const MAX_LIEUX_INTERROGES = 20;

/** Prisma leve sur un UUID mal forme : on filtre avant de l'interroger. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un événement tel que « À ne pas manquer » le lit — exactement la sélection faite plus bas. */
type EvenementLu = {
  id: string;
  name: string;
  startAt: Date;
  opponentName: string | null;
  opponentLogoUrl: string | null;
  posterUrl: string | null;
  venueId: string;
  venue: { name: string };
};

/**
 * PublicEventsController — read-only endpoints for mobile customers.
 *
 * Auth is OPTIONAL (OptionalJwtAuthGuard): any customer can browse a PUBLIC
 * event anonymously, but a logged-in customer is recognised so that PRIVATE
 * events can be gated by group membership.
 *
 * PRIVATE-event rule (Phase 14.4): every route resolves access through
 * GroupsService.canAccessEvent(). A non-member (or anonymous visitor) gets an
 * identical 404 to a non-existent event — the existence of a PRIVATE event is
 * never leaked.
 *
 * Exposed data: event metadata, supplier list, product catalogue, available slots.
 * NOT exposed: financial data, PII, organisation internals, Stripe data.
 *
 * Base path: /api/v1/public/events
 */
@UseGuards(OptionalJwtAuthGuard)
@Controller('public/events')
export class PublicEventsController {
  /** « À ne pas manquer », lu une fois pour tous ceux qui suivent les mêmes lieux. */
  private readonly cacheAVenir = new CacheCourt<EvenementLu[]>(dureeCacheLieux());

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupsService: GroupsService,
    private readonly slotTemplates: SlotTemplatesService,
  ) {}

  /**
   * Throws 404 if the caller may not access this event (unknown event, or a
   * PRIVATE event the caller is not a group member of). Shared by every route.
   */
  private async assertAccessible(eventId: string, user?: JwtPayload): Promise<void> {
    const allowed = await this.groupsService.canAccessEvent(eventId, user?.sub ?? null);
    if (!allowed) throw new NotFoundException('Event not found');

    // Club suspendu : l'événement devient introuvable, comme pour un événement
    // privé auquel on n'est pas invité. On ne dit pas « suspendu » : l'état d'un
    // compte client ne regarde pas le public.
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organization: { select: { status: true } } },
    });
    if (event?.organization.status !== OrgStatus.ACTIVE) {
      throw new NotFoundException('Event not found');
    }
  }

  /**
   * GET /api/v1/public/events/:eventId
   * Returns event info + attached suppliers (any status).
   */
  /**
   * « À NE PAS MANQUER » — les prochains événements des lieux favoris.
   *
   * ⚠️ DÉCLARÉE AVANT `@Get(':eventId')`, ET CE N'EST PAS UN HASARD. Nest
   * essaie les routes dans l'ordre : placée après, « a-venir » serait prise
   * pour un identifiant, et le `ParseUUIDPipe` rendrait un 400 au lieu de
   * laisser passer. Le défaut ne se verrait qu'à l'exécution.
   *
   * UNE SEULE REQUÊTE POUR TOUS LES FAVORIS. L'app aurait pu appeler
   * `/public/venues/:id` une fois par favori — trois requêtes à chaque
   * ouverture de l'accueil, dans un stade où le réseau est déjà saturé. Et
   * surtout, la règle de répartition vivrait alors DANS l'app : la changer
   * demanderait de publier une version.
   *
   * La confidentialité est celle du reste : un événement PRIVÉ n'apparaît que
   * pour un membre d'un groupe qui y donne accès. Un visiteur anonyme ne voit
   * que le public, et rien ne lui dit que le reste existe.
   */
  @Get('a-venir')
  async aVenir(
    @Query('venueIds') venueIds?: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<EvenementANePasManquer[]> {
    // Des identifiants MAL FORMÉS sont ignorés, pas refusés : une liste de
    // favoris vient du téléphone et peut porter une vieille valeur. Refuser
    // tout le lot viderait la section pour une seule entrée périmée. Prisma,
    // lui, lève sur un UUID invalide — d'où le filtre.
    const ids = (venueIds ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => UUID.test(v))
      .slice(0, MAX_LIEUX_INTERROGES);

    if (ids.length === 0) return [];

    // Les événements PRIVÉS auxquels ce client a droit, par ses groupes.
    const prives = new Set<string>();
    if (user?.sub) {
      const appartenances = await this.prisma.groupMember.findMany({
        where: { userId: user.sub },
        select: { group: { select: { events: { select: { eventId: true } } } } },
      });
      for (const a of appartenances) {
        for (const ge of a.group.events) prives.add(ge.eventId);
      }
    }

    // Sans accès privé — anonyme, ou client sans groupe : presque tout le
    // monde —, la lecture est la même pour tous ceux qui suivent ces lieux :
    // gardée quelques secondes (`cache-court.ts`). Avec un accès privé, elle
    // est propre au client et relue à chaque fois.
    const lireEvenements = () => this.prisma.event.findMany({
      where: {
        venueId: { in: ids },
        // À VENIR au sens du calendrier : un match commencé n'y figure plus,
        // c'est l'écran du lieu qui le porte.
        startAt: { gt: new Date() },
        status: { not: EventStatus.CANCELLED },
        // Le contenant d'un lieu PERMANENT n'est pas un événement : il n'a ni
        // adversaire ni fin, et remplirait la section d'une ligne vide.
        isPermanentContainer: false,
        venue: { status: VenueStatus.ACTIVE, organization: { status: OrgStatus.ACTIVE } },
        OR: [
          { visibility: EventVisibility.PUBLIC },
          ...(prives.size > 0 ? [{ id: { in: [...prives] } }] : []),
        ],
      },
      orderBy: { startAt: 'asc' },
      // Borne de sécurité. La répartition ne garde au plus que trois
      // événements par lieu ; ce plafond-ci protège seulement d'un lieu qui
      // aurait programmé trois saisons d'avance.
      take: MAX_LIEUX_INTERROGES * 20,
      select: {
        id: true,
        name: true,
        startAt: true,
        opponentName: true,
        opponentLogoUrl: true,
        posterUrl: true,
        venueId: true,
        venue: { select: { name: true } },
      },
    });
    // La clé ne dépend pas de l'ordre des favoris : deux clients qui suivent
    // les mêmes lieux partagent la même lecture. L'ordre, lui, est rétabli
    // juste en dessous, client par client.
    const evenements =
      prives.size === 0
        ? await this.cacheAVenir.obtenir([...ids].sort().join(','), lireEvenements)
        : await lireEvenements();

    // Regroupés DANS L'ORDRE DES FAVORIS reçus, et non dans celui de la base :
    // à nombre d'événements égal, c'est la liste du client qui décide.
    const parLieu = new Map<string, LieuEtSesEvenements>();
    for (const id of ids) parLieu.set(id, { venueId: id, venueName: '', evenements: [] });

    for (const e of evenements) {
      const lieu = parLieu.get(e.venueId);
      if (!lieu) continue;
      lieu.venueName = e.venue.name;
      (lieu.evenements as Omit<EvenementANePasManquer, 'venueId' | 'venueName'>[]).push({
        id: e.id,
        name: e.name,
        startAt: e.startAt.toISOString(),
        opponentName: e.opponentName,
        opponentLogoUrl: e.opponentLogoUrl,
        posterUrl: e.posterUrl,
      });
    }

    return aNePasManquer([...parLieu.values()]);
  }

  @Get(':eventId')
  async findEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    await this.assertAccessible(eventId, user);

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venue: { select: { id: true, name: true, address: true, buvettePlanUrl: true } },
        organization: { select: { primaryColor: true, logoUrl: true } },
        eventSuppliers: {
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                preparationZone: true,
                status: true,
                planUrl: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    // White-label : la config « Apparence de l'app » (écran d'accueil) est éditée
    // côté dashboard et stockée en app-settings ; l'app cliente la lit ici.
    const appearanceSetting = await this.prisma.appSetting.findFirst({
      where: {
        key: 'app.appearance.home',
        scope: FlagScope.ORGANIZATION,
        scopeId: event.organizationId,
      },
      select: { value: true },
    });

    return {
      id: event.id,
      name: event.name,
      status: event.status,
      // PHASE 22/23 — un lieu ouvert en continu est porte par un contenant
      // invisible dont les dates n'ont AUCUN sens pour le client : sa fin est
      // fixee en 2099. L'app affichait « 22:35 – 00:59 », des horaires qui ne
      // decrivaient rien. Elle doit pouvoir distinguer les deux cas.
      isPermanentContainer: event.isPermanentContainer,
      startAt: event.startAt,
      endAt: event.endAt,
      venue: event.venue,
      // Branding du club : couleur de l'événement en priorité, sinon celle de l'org.
      branding: {
        primaryColor: event.primaryColor ?? event.organization?.primaryColor ?? null,
        logoUrl: event.logoUrl ?? event.organization?.logoUrl ?? null,
      },
      // Config d'apparence (cartes d'accueil) — null si le club n'a rien configuré.
      appearance: appearanceSetting?.value ?? null,
      suppliers: event.eventSuppliers.map((es) => ({
        id: es.supplier.id,
        name: es.supplier.name,
        description: es.supplier.preparationZone ?? null,
        status: es.supplier.status,
        // Plan propre à cette buvette ; à défaut, celui du lieu.
        planUrl: es.supplier.planUrl ?? event.venue?.buvettePlanUrl ?? null,
        // L'enseigne du comptoir. Vide, l'app dessine l'initiale du nom : on ne
        // laisse jamais un trou a la place d'une image.
        imageUrl: es.supplier.imageUrl ?? null,
      })),
    };
  }

  /**
   * GET /api/v1/public/events/:eventId/suppliers/:supplierId/products
   * Returns ACTIVE products grouped by category for a supplier at this event.
   */
  @Get(':eventId/suppliers/:supplierId/products')
  async findProducts(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    await this.assertAccessible(eventId, user);

    // Verify supplier is attached to this event
    const attached = await this.prisma.eventSupplier.findFirst({
      where: { eventId, supplierId },
    });
    if (!attached) throw new NotFoundException('Supplier not attached to this event');

    const products = await this.prisma.product.findMany({
      where: { supplierId, status: ProductStatus.ACTIVE },
      include: { category: { select: { id: true, name: true, sortOrder: true } } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    });

    // Group by category
    const byCategory = new Map<
      string,
      { category: { id: string; name: string; sortOrder: number }; products: typeof products }
    >();

    for (const p of products) {
      const cat = p.category ?? { id: 'uncategorized', name: 'Autres', sortOrder: 999 };
      if (!byCategory.has(cat.id)) {
        byCategory.set(cat.id, { category: cat, products: [] });
      }
      const entry = byCategory.get(cat.id);
      if (entry) entry.products.push(p);
    }

    const groups = Array.from(byCategory.values()).sort(
      (a, b) => a.category.sortOrder - b.category.sortOrder,
    );

    return { supplierId, eventId, groups };
  }

  /**
   * GET /api/v1/public/events/:eventId/slots
   * Returns OPEN slots for the event, ordered by startAt.
   */
  @Get(':eventId/slots')
  async findSlots(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('supplierId') supplierId?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    // assertAccessible also covers event existence (404 for unknown events).
    await this.assertAccessible(eventId, user);

    // PHASE 23 — les créneaux récurrents du jour sont matérialisés ICI, à la
    // première lecture, plutôt que par une tâche planifiée. C'est le seul
    // endroit qu'un client traverse forcément avant de choisir son heure de
    // retrait : brancher ailleurs laisserait des lieux sans créneaux jusqu'à ce
    // que quelqu'un pense à les créer.
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { venueId: true },
    });

    // Journée courante seulement, ET la journée DU LIEU.
    //
    // Un lieu ouvert en continu accumule un jeu de créneaux PAR JOUR : sans ce
    // filtre, le client se verrait proposer le « 17h45 » d'il y a trois
    // semaines. Les créneaux ponctuels d'un événement (`serviceDate` nul) ne
    // sont pas datés et restent visibles tant que l'événement dure.
    //
    // La date vient de la matérialisation, qui la calcule en heure du lieu. Ce
    // filtre employait le jour UTC : entre minuit et 2h à Paris, le client ne
    // voyait aucun créneau du jour — ils venaient d'être créés sous la date du
    // lendemain local.
    const journee = event?.venueId
      ? (await this.slotTemplates.ensureTodaySlots(eventId, event.venueId)).journee
      : jourCalendaireLocal(new Date());

    // Créneaux de LA buvette choisie, et d'elle seule.
    //
    // Sans ce filtre, un lieu à plusieurs comptoirs montrait au client les
    // créneaux de tous : il pouvait réserver « Mi-temps » au comptoir Sud pour
    // une commande passée au Nord. Un créneau sans buvette (`supplierId` nul)
    // vaut pour tout le lieu et reste donc visible.
    return this.prisma.slot.findMany({
      where: {
        eventId,
        status: SlotStatus.OPEN,
        OR: [{ serviceDate: null }, { serviceDate: journee }],
        ...(supplierId
          ? { AND: [{ OR: [{ supplierId }, { supplierId: null }] }] }
          : {}),
      },
      orderBy: { startAt: 'asc' },
      select: {
        id: true,
        label: true,
        startAt: true,
        endAt: true,
        capacity: true,
        currentLoad: true,
        status: true,
        supplierId: true,
      },
    });
  }
}
