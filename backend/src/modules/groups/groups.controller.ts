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
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Groups routes — nested under the organisation:
 * /api/v1/organizations/:orgId/groups
 *
 * All routes require JWT auth; access is org-scoped via requireOrgAccess in the
 * service (SUPER_ADMIN bypasses). Read = any member; write = ORG_ADMIN/MANAGER.
 */
@Controller('organizations/:orgId/groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /** POST — create a group (optional emailDomain auto-join rule). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateGroupDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupsService.create(orgId, user.sub, dto);
  }

  /** GET — list groups of the org (with member/event counts). */
  @Get()
  findAll(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupsService.findAllByOrg(orgId, user.sub);
  }

  /** GET /:groupId — single group. */
  @Get(':groupId')
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupsService.findOne(orgId, groupId, user.sub);
  }

  /** PATCH /:groupId — rename / change description / change domain rule. */
  @Patch(':groupId')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupsService.update(orgId, groupId, user.sub, dto);
  }

  /** DELETE /:groupId — removes the group (members & event links cascade). */
  @Delete(':groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupsService.remove(orgId, groupId, user.sub);
  }

  // ─── Members ──────────────────────────────────────────────────

  /** GET /:groupId/members — list members (with user email + display name). */
  @Get(':groupId/members')
  listMembers(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupsService.listMembers(orgId, groupId, user.sub);
  }

  /** POST /:groupId/members — add a member by email (source = MANUAL). */
  @Post(':groupId/members')
  @HttpCode(HttpStatus.CREATED)
  addMember(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: AddGroupMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupsService.addMemberByEmail(orgId, groupId, user.sub, dto.email);
  }

  /** DELETE /:groupId/members/:userId — remove a member. */
  @Delete(':groupId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.groupsService.removeMember(orgId, groupId, user.sub, targetUserId);
  }
}
