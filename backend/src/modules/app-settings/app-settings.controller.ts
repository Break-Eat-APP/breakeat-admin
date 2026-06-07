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
import { AppSettingsService } from './app-settings.service';
import { SetAppSettingDto } from './dto/set-app-setting.dto';

/**
 * AppSettingsController — CRUD API for app settings / basic CMS.
 *
 * All routes require JWT authentication.
 * In V1, any authenticated user can read/write settings.
 * In V2, restrict writes to SUPER_ADMIN / ORG_ADMIN.
 *
 * Routes:
 *   GET  /app-settings          — list all settings (optional ?scope=&scopeId=)
 *   GET  /app-settings/get      — get by key for a context (?key=&orgId=&eventId=)
 *   POST /app-settings          — create or update a setting
 *   DELETE /app-settings/:id    — delete a setting by id
 */
@UseGuards(JwtAuthGuard)
@Controller('app-settings')
export class AppSettingsController {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  /**
   * GET /api/v1/app-settings
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
    return this.appSettingsService.list(scope as FlagScope | undefined, scopeId);
  }

  /**
   * GET /api/v1/app-settings/get?key=xxx&orgId=yyy&eventId=zzz
   * Returns { key, value, resolvedAt } or { key, value: null } if not found.
   */
  @Get('get')
  async get(
    @Query('key') key: string,
    @Query('orgId') orgId?: string,
    @Query('eventId') eventId?: string,
  ) {
    const value = await this.appSettingsService.get(key, { orgId, eventId });
    return { key, value, resolvedAt: new Date().toISOString() };
  }

  /**
   * POST /api/v1/app-settings
   * Creates or updates a setting (upsert).
   */
  @Post()
  set(@Body() dto: SetAppSettingDto) {
    return this.appSettingsService.set(dto);
  }

  /**
   * DELETE /api/v1/app-settings/:id
   * Deletes a setting by id.
   */
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.appSettingsService.remove(id);
  }
}
