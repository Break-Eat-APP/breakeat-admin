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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GlobalRole } from '../../common/enums/role.enum';

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

  // ─── Utilisateurs ─────────────────────────────────────────────

  /** GET /users — liste tous les comptes inscrits (cross-tenant). */
  @Get('users')
  listUsers() {
    return this.backoffice.listUsers();
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
