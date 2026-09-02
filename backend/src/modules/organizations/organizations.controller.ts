import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ResetMemberPasswordDto } from './dto/reset-member-password.dto';
import { UpdateOrgBrandingDto } from './dto/update-org-branding.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Organizations routes — all under /api/v1/organizations
 * All routes require authentication.
 */
@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  /** POST /organizations — any authenticated user can create an org */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: JwtPayload) {
    return this.organizationsService.create(user.sub, dto);
  }

  /** GET /organizations/:id — members only (SUPER_ADMIN can view any org) */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.organizationsService.findById(id, user.sub, user.globalRole);
  }

  /**
   * PATCH /organizations/:id/branding
   * Updates logoUrl, primaryColor, description. ORG_ADMIN or SUPER_ADMIN only.
   */
  @Patch(':id/branding')
  updateBranding(
    @Param('id') id: string,
    @Body() dto: UpdateOrgBrandingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationsService.updateBranding(id, user.sub, user.globalRole, dto);
  }

  /**
   * GET /organizations/:id/members
   * Returns all members with user info (email, displayName) and assigned supplier.
   * Any member can view; SUPER_ADMIN bypasses membership check.
   */
  /**
   * POST /api/v1/organizations/:id/stripe/onboarding-link
   * Ouvre l'inscription Stripe DU CLUB — une seule pour toutes ses buvettes.
   */
  @Post(':id/stripe/onboarding-link')
  @HttpCode(HttpStatus.CREATED)
  createStripeOnboardingLink(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationsService.createOnboardingLink(id, user.sub);
  }

  /** GET /api/v1/organizations/:id/stripe/status — relit l'état chez Stripe. */
  @Get(':id/stripe/status')
  refreshStripeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationsService.refreshStripeStatus(id, user.sub);
  }

  /**
   * DELETE /api/v1/organizations/:id/stripe
   *
   * Oublie le compte Stripe du club. Ne supprime rien chez Stripe : le compte
   * connecte reste intact, seul le lien disparait. Sert a repartir de zero
   * quand le mauvais compte a ete relie.
   */
  @Delete(':id/stripe')
  delierStripe(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.organizationsService.delierStripe(id, user.sub);
  }

  @Get(':id/members')
  listMembers(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.organizationsService.getMembers(id, user.sub, user.globalRole);
  }

  /** POST /organizations/:id/members — ORG_ADMIN or SUPER_ADMIN (checked in service) */
  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  addMember(
    @Param('id') organizationId: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationsService.addMember(
      organizationId,
      user.sub,
      user.globalRole,
      dto.userId,
      dto.role,
    );
  }

  /**
   * POST /organizations/:id/invite
   * Invite by email — no userId required. Optionally assign a supplier (for OPERATOR role).
   */
  @Post(':id/invite')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Param('id') organizationId: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationsService.inviteByEmail(
      organizationId,
      user.sub,
      user.globalRole,
      dto.email,
      dto.role,
      dto.supplierId,
      dto.temporaryPassword,
    );
  }

  /**
   * POST /organizations/:id/members/:memberId/reset-password
   *
   * Redefinit le mot de passe d'un membre. ORG_ADMIN (sur ses operateurs
   * uniquement) ou SUPER_ADMIN. Jamais sur soi-meme.
   *
   * Sans cette route, un compte dont le mot de passe est perdu restait
   * inaccessible pour toujours : l'invitation ne pose un mot de passe qu'a la
   * creation, et reinviter un membre existant echoue sur « deja membre ».
   */
  @Post(':id/members/:memberId/reset-password')
  @HttpCode(HttpStatus.OK)
  resetMemberPassword(
    @Param('id') organizationId: string,
    @Param('memberId') memberId: string,
    @Body() dto: ResetMemberPasswordDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationsService.resetMemberPassword(
      organizationId,
      memberId,
      user.sub,
      user.globalRole,
      dto.newPassword,
    );
  }
  /**
   * DELETE /organizations/:id/members/:memberId
   * Remove a member. ORG_ADMIN or SUPER_ADMIN only. Cannot remove self.
   */
  @Delete(':id/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id') organizationId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.organizationsService.removeMember(
      organizationId,
      memberId,
      user.sub,
      user.globalRole,
    );
  }
}
