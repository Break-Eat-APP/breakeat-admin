import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
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
