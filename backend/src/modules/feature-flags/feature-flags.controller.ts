import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FlagScope } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FeatureFlagsService } from './feature-flags.service';
import { SetFeatureFlagDto } from './dto/set-feature-flag.dto';

/**
 * FeatureFlagsController — CRUD + resolution API for feature flags.
 *
 * All routes require JWT authentication.
 * In V1, any authenticated user can read/write flags.
 * In V2, restrict write access to SUPER_ADMIN / ORG_ADMIN.
 *
 * Routes:
 *   GET  /feature-flags          — list all flags (optional ?scope=&scopeId=)
 *   GET  /feature-flags/resolve  — resolve flag for context (?key=&orgId=&eventId=)
 *   POST /feature-flags          — create or update a flag
 *   DELETE /feature-flags/:id    — delete a flag
 */
@UseGuards(JwtAuthGuard)
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  /**
   * GET /api/v1/feature-flags
   * Optional query: ?scope=GLOBAL|ORGANIZATION|EVENT&scopeId=<uuid>
   */
  @Get()
  list(
    @Query('scope') scope?: string,
    @Query('scopeId') scopeId?: string,
  ) {
    if (scope !== undefined && !Object.values(FlagScope).includes(scope as FlagScope)) {
      throw new BadRequestException(`Invalid scope: "${scope}". Must be one of: ${Object.values(FlagScope).join(', ')}`);
    }
    return this.featureFlagsService.list(scope as FlagScope | undefined, scopeId);
  }

  /**
   * GET /api/v1/feature-flags/resolve?key=xxx&orgId=yyy&eventId=zzz
   * Returns { key, enabled, resolvedAt }.
   * Does not require the caller to know which scope the flag lives in.
   */
  @Get('resolve')
  async resolve(
    @Query('key') key: string,
    @Query('orgId') orgId?: string,
    @Query('eventId') eventId?: string,
  ) {
    const enabled = await this.featureFlagsService.resolve(key, { orgId, eventId });
    return { key, enabled, resolvedAt: new Date().toISOString() };
  }

  /**
   * POST /api/v1/feature-flags
   * Creates or updates a flag (upsert).
   */
  @Post()
  set(@Body() dto: SetFeatureFlagDto) {
    return this.featureFlagsService.set(dto);
  }

  /**
   * DELETE /api/v1/feature-flags/:id
   * Deletes a flag by id.
   */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.featureFlagsService.remove(id);
  }
}
