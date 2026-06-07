import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OperatorScreensService } from './operator-screens.service';
import { ApplyEventScreenDto } from './dto/apply-event-screen.dto';
import { UpdateEventScreenDto } from './dto/update-event-screen.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Applies screen templates to an event and exposes the resolved board config:
 *   /api/v1/events/:eventId/operator-screens
 *
 * JWT required; access is resolved through the event's organisation.
 * - GET /resolved : any member (operator board consumer; supplier-pinned)
 * - GET           : list applied screens (config view)
 * - POST/PATCH/DELETE : ORG_ADMIN / MANAGER (configure the event's board)
 */
@Controller('events/:eventId/operator-screens')
@UseGuards(JwtAuthGuard)
export class EventOperatorScreensController {
  constructor(private readonly service: OperatorScreensService) {}

  /**
   * GET /resolved — ordered, normalised screens for the operator board.
   * Optional ?supplierId is overridden by the caller's pinned supplier, if any.
   */
  @Get('resolved')
  resolve(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Query('supplierId') supplierId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.resolveForEvent(eventId, user.sub, supplierId);
  }

  /** GET — list templates applied to this event (config view). */
  @Get()
  list(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() user: JwtPayload) {
    return this.service.listEventScreens(eventId, user.sub);
  }

  /** POST — apply a template to this event. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  apply(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ApplyEventScreenDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.applyToEvent(eventId, user.sub, dto);
  }

  /** PATCH /:linkId — reorder / enable-disable a screen for this event only. */
  @Patch(':linkId')
  update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() dto: UpdateEventScreenDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.updateEventScreen(eventId, linkId, user.sub, dto);
  }

  /** DELETE /:linkId — detach a screen from this event (template untouched). */
  @Delete(':linkId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.removeEventScreen(eventId, linkId, user.sub);
  }
}
