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
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventStatusDto } from './dto/update-event-status.dto';
import { AttachSupplierDto } from './dto/attach-supplier.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:orgId/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  /** POST /api/v1/organizations/:orgId/events */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventsService.create(orgId, user.sub, dto);
  }

  /** GET /api/v1/organizations/:orgId/events */
  @Get()
  findAll(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.eventsService.findAllByOrg(orgId, user.sub);
  }

  /** GET /api/v1/organizations/:orgId/events/:id */
  @Get(':id')
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.eventsService.findOne(orgId, id, user.sub);
  }

  /** PATCH /api/v1/organizations/:orgId/events/:id */
  @Patch(':id')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(orgId, id, user.sub, dto);
  }

  /** PATCH /api/v1/organizations/:orgId/events/:id/status */
  @Patch(':id/status')
  updateStatus(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateEventStatusDto,
  ) {
    return this.eventsService.updateStatus(orgId, id, user.sub, dto);
  }

  /** POST /api/v1/organizations/:orgId/events/:id/suppliers */
  @Post(':id/suppliers')
  @HttpCode(HttpStatus.CREATED)
  attachSupplier(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AttachSupplierDto,
  ) {
    return this.eventsService.attachSupplier(orgId, id, dto.supplierId, user.sub);
  }

  /** DELETE /api/v1/organizations/:orgId/events/:id/suppliers/:supplierId */
  @Delete(':id/suppliers/:supplierId')
  @HttpCode(HttpStatus.NO_CONTENT)
  detachSupplier(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.eventsService.detachSupplier(orgId, id, supplierId, user.sub);
  }
}
