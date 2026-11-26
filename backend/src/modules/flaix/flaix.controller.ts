import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../../database/prisma.service';
import { GlobalRole } from '../../common/enums/role.enum';
import { FlaixService } from './flaix.service';
import { CommandesClientFlaixService, type CommandeFlaix } from './commandes-client-flaix.service';
import { SurveillanceCommandesFlaixService } from './surveillance-commandes-flaix.service';
import { FORME_JETON, NoterCommandeFlaixDto, RegisterLiveActivityFlaixDto } from './dto/live-activity-flaix.dto';

/**
 * FlaixController — read-only endpoints for operator dashboards.
 *
 * All routes require authentication AND org membership on the target event.
 * Flaix write operations (recordDecision) are internal and called
 * programmatically from other services, never via HTTP.
 *
 * Routes:
 *   GET /flaix/event/:eventId/rush-status  — latest rush decision for an event
 *   GET /flaix/event/:eventId/decisions    — full decision audit log for an event
 */
@UseGuards(JwtAuthGuard)
@Controller('flaix')
export class FlaixController {
  constructor(
    private readonly flaixService: FlaixService,
    private readonly prisma: PrismaService,
    private readonly commandesClient: CommandesClientFlaixService,
    private readonly surveillance: SurveillanceCommandesFlaixService,
  ) {}

  /**
   * GET /api/v1/flaix/mes-commandes
   * Les commandes Flaix du client CONNECTÉ, lues chez Flaix par son e-mail
   * (21/11/2026). L'e-mail vient de la base, jamais de l'app : un client ne
   * peut demander que les siennes. Voir `commandes-client-flaix.service.ts`.
   */
  @Get('mes-commandes')
  async mesCommandes(@CurrentUser() user: JwtPayload) {
    const moi = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { email: true },
    });
    const reponse = await this.commandesClient.pourEmail(moi?.email);
    // Les commandes en cours sont surveillées pour « Ta commande est prête ».
    // Un incident de surveillance ne doit pas priver le client de sa liste.
    await this.surveillance.surveiller(user.sub, reponse.commandes).catch(() => undefined);
    // Une COPIE : la liste lue chez Flaix est en cache, partagée.
    return { ...reponse, commandes: await this.avecImagesDuLieu(reponse.commandes).catch(() => reponse.commandes) };
  }

  /**
   * L'IMAGE DU LIEU SUR LE TICKET FLAIX (26/11/2026, demande de Rémi). Flaix ne
   * connaît pas nos photos : on retrouve le lieu BreakEat de chaque commande,
   * d'abord par son événement importé (`Event.flaixEventId`), sinon par le
   * nom court du lieu (`Venue.flaixVenueId`).
   */
  private async avecImagesDuLieu(commandes: CommandeFlaix[]): Promise<CommandeFlaix[]> {
    const evenements = [...new Set(commandes.map((c) => c.evenementId).filter((x): x is string => !!x))];
    const lieux = [...new Set(commandes.map((c) => c.lieuId).filter((x): x is string => !!x))];
    if (evenements.length === 0 && lieux.length === 0) return commandes;
    const choix = { photoUrl: true, organization: { select: { logoUrl: true } } } as const;
    const [parEvenement, parLieu] = await Promise.all([
      evenements.length
        ? this.prisma.event.findMany({
            where: { flaixEventId: { in: evenements } },
            select: { flaixEventId: true, venue: { select: choix } },
          })
        : Promise.resolve([]),
      lieux.length
        ? this.prisma.venue.findMany({ where: { flaixVenueId: { in: lieux } }, select: { flaixVenueId: true, ...choix } })
        : Promise.resolve([]),
    ]);
    const ev = new Map(parEvenement.map((e) => [e.flaixEventId, e.venue]));
    const li = new Map(parLieu.map((v) => [v.flaixVenueId, v]));
    return commandes.map((c) => {
      const v = (c.evenementId && ev.get(c.evenementId)) || (c.lieuId && li.get(c.lieuId)) || null;
      return v ? { ...c, lieuPhotoUrl: v.photoUrl, lieuLogoUrl: v.organization?.logoUrl ?? null } : c;
    });
  }

  /**
   * GET /api/v1/flaix/mes-suivis
   * L'état en direct des commandes Flaix suivies du client CONNECTÉ, lu dans
   * notre base (aucun appel à Flaix) : pour la flamme et « Mes commandes »,
   * relus toutes les 10 s pendant qu'une commande est en cours (25/11/2026).
   */
  @Get('mes-suivis')
  mesSuivis(@CurrentUser() user: JwtPayload) {
    return this.surveillance.mesSuivis(user.sub);
  }

  /**
   * POST /api/v1/flaix/commandes/:jeton/suivi
   * La page de commande Flaix de l'app vient d'afficher ce jeton (fin du
   * paiement, 24/11/2026) : le serveur suit la commande, et rend l'état de
   * départ de la Live Activity. 404 tant que Flaix ne la liste pas encore pour
   * ce client — l'app réessaie. Seules les commandes de SA liste (lue par son
   * e-mail, en base) peuvent être suivies.
   */
  @Post('commandes/:jeton/suivi')
  @HttpCode(200)
  async suivre(@Param('jeton') jeton: string, @CurrentUser() user: JwtPayload) {
    if (!FORME_JETON.test(jeton)) throw new NotFoundException('Commande introuvable pour le moment.');
    const moi = await this.prisma.user.findUnique({ where: { id: user.sub }, select: { email: true } });
    const reponse = await this.commandesClient.pourEmail(moi?.email);
    return this.surveillance.suivreDepuisLApp(user.sub, jeton, reponse.commandes);
  }

  /**
   * POST /api/v1/flaix/commandes/:jeton/note
   * « Note ta commande » pour une commande Flaix récupérée (26/11/2026).
   */
  @Post('commandes/:jeton/note')
  @HttpCode(200)
  noter(@Param('jeton') jeton: string, @CurrentUser() user: JwtPayload, @Body() dto: NoterCommandeFlaixDto) {
    if (!FORME_JETON.test(jeton)) throw new NotFoundException('Commande introuvable.');
    return this.surveillance.noter(user.sub, jeton, dto);
  }

  /**
   * POST /api/v1/flaix/live-activities
   * L'app a démarré la Live Activity d'une commande Flaix qu'elle suit.
   */
  @Post('live-activities')
  @HttpCode(200)
  async enregistrerLiveActivity(@Body() dto: RegisterLiveActivityFlaixDto, @CurrentUser() user: JwtPayload) {
    await this.surveillance.enregistrerActivite({ userId: user.sub, ...dto });
    // Un corps, pas un 204 : l'app lit toujours la réponse en JSON.
    return { ok: true };
  }

  /**
   * GET /api/v1/flaix/event/:eventId/rush-status
   * Returns the most recent RUSH_DECISION for the event, or null if none.
   * Caller must be a member of the event's organization.
   */
  @Get('event/:eventId/rush-status')
  async getRushStatus(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOrgMemberForEvent(eventId, user.sub);
    return this.flaixService.getLatestRushDecision(eventId);
  }

  /**
   * GET /api/v1/flaix/event/:eventId/decisions
   * Returns all Flaix decisions for an event, most recent first.
   * Caller must be a member of the event's organization.
   */
  @Get('event/:eventId/decisions')
  async listDecisions(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertOrgMemberForEvent(eventId, user.sub);
    return this.flaixService.listDecisionsForEvent(eventId);
  }

  // ─── Internals ───────────────────────────────────────────────

  private async assertOrgMemberForEvent(eventId: string, userId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organizationId: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    // Le super admin entre partout (décision de Rémi, 10/11) — lu en base, comme
    // `requireOrgAccess` : un rôle retiré prend effet tout de suite.
    const appelant = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true },
    });
    if (appelant?.globalRole === GlobalRole.SUPER_ADMIN) return;

    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: event.organizationId } },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }
  }
}
