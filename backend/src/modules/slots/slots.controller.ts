import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SlotsService } from './slots.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';

interface JwtUser {
  sub: string;
}

/**
 * SlotsController — manages pickup slots for an event.
 *
 * All write operations require MANAGER or ORG_ADMIN role within the event's organisation.
 * Read operations require authentication only.
 */
@Controller('events/:eventId/slots')
@UseGuards(JwtAuthGuard)
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  /**
   * POST /api/v1/events/:eventId/slots
   * Create a new slot for the event. MANAGER/ORG_ADMIN only.
   */
  @Post()
  create(
    @Param('eventId') eventId: string,
    @Body() dto: CreateSlotDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.slotsService.create(eventId, dto, user.sub);
  }

  /**
   * GET /api/v1/events/:eventId/slots
   * List all slots for an event, ordered by startAt asc.
   */
  @Get()
  findByEvent(@Param('eventId') eventId: string) {
    return this.slotsService.findByEvent(eventId);
  }

  /**
   * GET /api/v1/events/:eventId/slots/:id
   * Fetch a single slot.
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.slotsService.findOne(id);
  }

  /**
   * PATCH /api/v1/events/:eventId/slots/:id
   * Update a slot (label, capacity, times, status). MANAGER/ORG_ADMIN only.
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSlotDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.slotsService.update(id, dto, user.sub);
  }

  /**
   * DELETE /api/v1/events/:eventId/slots/:id
   * Remove a slot. Blocked if any orders are assigned. MANAGER/ORG_ADMIN only.
   */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.slotsService.remove(id, user.sub);
  }
}
