import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';
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
}
