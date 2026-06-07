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
import { OperatorScreensService } from './operator-screens.service';
import { CreateOperatorScreenDto } from './dto/create-operator-screen.dto';
import { UpdateOperatorScreenDto } from './dto/update-operator-screen.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Reusable operator-screen templates, nested under the organisation:
 *   /api/v1/organizations/:orgId/operator-screens
 *
 * JWT required; org-scoped via requireOrgAccess in the service (SUPER_ADMIN
 * bypasses). Read = any member; write = ORG_ADMIN / MANAGER.
 */
@Controller('organizations/:orgId/operator-screens')
@UseGuards(JwtAuthGuard)
export class OperatorScreenTemplatesController {
  constructor(private readonly service: OperatorScreensService) {}

  /** POST — create a reusable screen template. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateOperatorScreenDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.createTemplate(orgId, user.sub, dto);
  }

  /** GET — list templates of the org (with applied-event count). */
  @Get()
  findAll(@Param('orgId', ParseUUIDPipe) orgId: string, @CurrentUser() user: JwtPayload) {
    return this.service.listTemplates(orgId, user.sub);
  }

  /** GET /:screenId — single template. */
  @Get(':screenId')
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('screenId', ParseUUIDPipe) screenId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getTemplate(orgId, screenId, user.sub);
  }

  /** PATCH /:screenId — partial update of conditions / name / order. */
  @Patch(':screenId')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('screenId', ParseUUIDPipe) screenId: string,
    @Body() dto: UpdateOperatorScreenDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateTemplate(orgId, screenId, user.sub, dto);
  }

  /** DELETE /:screenId — removes the template (event links cascade). */
  @Delete(':screenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('screenId', ParseUUIDPipe) screenId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.deleteTemplate(orgId, screenId, user.sub);
  }
}
