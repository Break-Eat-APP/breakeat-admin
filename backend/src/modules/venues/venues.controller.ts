import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:orgId/venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  /** POST /api/v1/organizations/:orgId/venues */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVenueDto,
  ) {
    return this.venuesService.create(orgId, user.sub, dto);
  }

  /** GET /api/v1/organizations/:orgId/venues */
  @Get()
  findAll(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.venuesService.findAllByOrg(orgId, user.sub);
  }

  /** GET /api/v1/organizations/:orgId/venues/:id */
  @Get(':id')
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.venuesService.findOne(orgId, id, user.sub);
  }

  /** PATCH /api/v1/organizations/:orgId/venues/:id */
  @Patch(':id')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateVenueDto,
  ) {
    return this.venuesService.update(orgId, id, user.sub, dto);
  }
}
