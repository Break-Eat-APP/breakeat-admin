import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BackofficeService } from './backoffice.service';
import { CreateBackofficeOrgDto } from './dto/create-backoffice-org.dto';
import { UpdateBackofficeOrgDto } from './dto/update-backoffice-org.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { ScheduleNotificationDto } from './dto/schedule-notification.dto';
import { ResetOrgDataDto } from './dto/reset-org-data.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GlobalRole } from '../../common/enums/role.enum';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * BackofficeController — platform supervision API, base path /api/v1/backoffice.
 *
 * SUPER_ADMIN ONLY. The class-level guards enforce this for every route:
 *   - JwtAuthGuard authenticates the request.
 *   - RolesGuard + @Roles(SUPER_ADMIN) rejects any non-super-admin with 403.
 *
 * All data is cross-tenant; no org-scoping is applied here by design.
 */
@Controller('backoffice')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(GlobalRole.SUPER_ADMIN)
export class BackofficeController {
  constructor(private readonly backoffice: BackofficeService) {}

  /** GET /kpis — platform-wide KPIs (CA HT/TTC, orders, avg basket, accounts). */
  @Get('kpis')
  getKpis() {
    return this.backoffice.getGlobalKpis();
  }

  // ─── Organisations ────────────────────────────────────────────

  /** GET /organizations — list every organisation with counts. */
  @Get('organizations')
  listOrganizations() {
    return this.backoffice.listOrganizations();
  }

  /** POST /organizations — provision a new organisation shell. */
  @Post('organizations')
  @HttpCode(HttpStatus.CREATED)
  createOrganization(@Body() dto: CreateBackofficeOrgDto) {
    return this.backoffice.createOrganization(dto);
  }

  /** GET /organizations/:id — single org with members + counts. */
  @Get('organizations/:id')
  getOrganization(@Param('id', ParseUUIDPipe) id: string) {
    return this.backoffice.getOrganization(id);
  }

  /** PATCH /organizations/:id — update profile / branding. */
  @Patch('organizations/:id')
  updateOrganization(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBackofficeOrgDto,
  ) {
    return this.backoffice.updateOrganization(id, dto);
  }

  /** PATCH /organizations/:id/activate — set status ACTIVE. */
  @Patch('organizations/:id/activate')
  activateOrganization(@Param('id', ParseUUIDPipe) id: string) {
    return this.backoffice.setOrganizationStatus(id, true);
  }

  /** PATCH /organizations/:id/deactivate — set status SUSPENDED. */
  @Patch('organizations/:id/deactivate')
  deactivateOrganization(@Param('id', ParseUUIDPipe) id: string) {
    return this.backoffice.setOrganizationStatus(id, false);
  }

  /** DELETE /organizations/:id — suppression définitive (cascade). */
  @Delete('organizations/:id')
  @HttpCode(HttpStatus.OK)
  deleteOrganization(@Param('id', ParseUUIDPipe) id: string) {
    return this.backoffice.deleteOrganization(id);
  }

  /**
   * POST /organizations/:id/reset-data — remise à zéro des données
   * d'exploitation, l'organisation elle-même étant conservée.
   *
   * Efface événements, buvettes, comptoirs, commandes, paniers et fidélité.
   * CONSERVE le lieu (GPS, mots-clés), les accès et les groupes : sans eux,
   * personne ne pourrait se reconnecter pour reconfigurer.
   *
   * Le nom de l'organisation doit être recopié dans le corps de la requête —
   * seule barrière entre un ménage et une perte sèche.
   */
  @Post('organizations/:id/reset-data')
  @HttpCode(HttpStatus.OK)
  resetOrgData(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetOrgDataDto) {
    return this.backoffice.resetOrgData(id, dto.confirmation);
  }

  // ─── Utilisateurs ─────────────────────────────────────────────

  /** GET /users — liste tous les comptes inscrits (cross-tenant). */
  @Get('users')
  listUsers() {
    return this.backoffice.listUsers();
  }

  /**
   * PATCH /users/:id/archive — coupe l'accès d'un compte (isActive = false).
   *
   * « Archiver » et non « supprimer » : le compte et ses commandes passées
   * restent en base, seul l'accès tombe. Le geste est réversible.
   *
   * `callerId` sert aux verrous du service : on ne s'archive pas soi-même, et
   * on n'archive pas le dernier administrateur plateforme actif.
   */
  @Patch('users/:id/archive')
  archiveUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.backoffice.setUserActive(id, false, user.sub);
  }

  /** PATCH /users/:id/unarchive — réactive l'accès d'un compte. */
  @Patch('users/:id/unarchive')
  unarchiveUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.backoffice.setUserActive(id, true, user.sub);
  }

  /**
   * DELETE /users/:id — efface définitivement un compte de la base.
   *
   * Pendant de l'archivage : archiver coupe l'accès en gardant tout, supprimer
   * efface. Refusé sur soi-même, sur le dernier administrateur plateforme
   * actif, et sur tout compte portant des commandes — l'effacer retirerait ce
   * chiffre d'affaires de la comptabilité.
   */
  @Delete('users/:id')
  @HttpCode(HttpStatus.OK)
  deleteUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.backoffice.deleteUser(id, user.sub);
  }

  // ─── Groups ───────────────────────────────────────────────────

  /** GET /groups — cross-tenant list of all groups. */
  @Get('groups')
  listGroups() {
    return this.backoffice.listGroups();
  }

  /** POST /groups — crée un groupe dans une organisation. */
  @Post('groups')
  @HttpCode(HttpStatus.CREATED)
  createGroup(@Body() body: { orgId: string; name: string; description?: string; emailDomain?: string }) {
    return this.backoffice.createGroup(body);
  }

  /** DELETE /groups/:id — supprime définitivement un groupe. */
  @Delete('groups/:id')
  @HttpCode(HttpStatus.OK)
  deleteGroup(@Param('id', ParseUUIDPipe) id: string) {
    return this.backoffice.deleteGroup(id);
  }

  // ─── Notifications push ───────────────────────────────────────

  /** POST /notifications/send — envoie un push immédiat à tous ou à une org. */
  @Post('notifications/send')
  @HttpCode(HttpStatus.OK)
  sendNotification(@Body() dto: SendNotificationDto) {
    return this.backoffice.sendNotification(dto);
  }

  /** POST /notifications/schedule — programme un push pour une date future. */
  @Post('notifications/schedule')
  @HttpCode(HttpStatus.CREATED)
  scheduleNotification(@Body() dto: ScheduleNotificationDto) {
    return this.backoffice.scheduleNotification(dto);
  }

  /** GET /notifications/scheduled — liste tous les pushs programmés (toutes orgs). */
  @Get('notifications/scheduled')
  listScheduledNotifications() {
    return this.backoffice.listScheduledNotifications();
  }

  /** DELETE /notifications/scheduled/:id — annule un push PENDING. */
  @Delete('notifications/scheduled/:id')
  @HttpCode(HttpStatus.OK)
  cancelScheduledNotification(@Param('id', ParseUUIDPipe) id: string) {
    return this.backoffice.cancelScheduledNotification(id);
  }
}
