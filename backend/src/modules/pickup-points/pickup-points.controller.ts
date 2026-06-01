import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsUUID, IsOptional } from 'class-validator';
import { PickupPointsService } from './pickup-points.service';
import { CreatePickupPointDto } from './dto/create-pickup-point.dto';
import { UpdatePickupPointDto } from './dto/update-pickup-point.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

class PickupPointFilterQuery {
  @IsUUID()
  @IsOptional()
  venueId?: string;

  @IsUUID()
  @IsOptional()
  eventId?: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('organizations/:orgId/pickup-points')
export class PickupPointsController {
  constructor(private readonly pickupPointsService: PickupPointsService) {}

  /** POST /api/v1/organizations/:orgId/pickup-points */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePickupPointDto,
  ) {
    return this.pickupPointsService.create(orgId, user.sub, dto);
  }

  /**
   * GET /api/v1/organizations/:orgId/pickup-points
   * Optional query params: venueId, eventId, supplierId
   */
  @Get()
  findAll(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Query() query: PickupPointFilterQuery,
  ) {
    return this.pickupPointsService.findAllByOrg(orgId, user.sub, {
      venueId: query.venueId,
      eventId: query.eventId,
      supplierId: query.supplierId,
    });
  }

  /** PATCH /api/v1/organizations/:orgId/pickup-points/:id */
  @Patch(':id')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePickupPointDto,
  ) {
    return this.pickupPointsService.update(orgId, id, user.sub, dto);
  }
}
