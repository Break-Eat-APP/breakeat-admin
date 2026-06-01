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
import { StockService } from './stock.service';
import { CreateStockDto } from './dto/create-stock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { UpdateStockAvailabilityDto } from './dto/update-stock-availability.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Stock routes — scoped to org:
 * /api/v1/organizations/:orgId/stock
 *
 * All routes require JWT authentication.
 */
@Controller('organizations/:orgId/stock')
@UseGuards(JwtAuthGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  /** POST — create a stock entry for a product */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.stockService.create(orgId, user.sub, dto);
  }

  /** GET — list stock entries for the org (filterable by productId, supplierId, pickupPointId) */
  @Get()
  findAll(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Query('productId') productId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('pickupPointId') pickupPointId?: string,
  ) {
    return this.stockService.findAllByOrg(orgId, user.sub, {
      productId,
      supplierId,
      pickupPointId,
    });
  }

  /** GET /:stockId — single stock entry */
  @Get(':stockId')
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('stockId', ParseUUIDPipe) stockId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.stockService.findOne(orgId, stockId, user.sub);
  }

  /** PATCH /:stockId — update quantity and/or isAvailable (MANAGER/ORG_ADMIN only) */
  @Patch(':stockId')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('stockId', ParseUUIDPipe) stockId: string,
    @Body() dto: UpdateStockDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.stockService.update(orgId, stockId, user.sub, dto);
  }

  /** PATCH /:stockId/availability — toggle availability only (OPERATOR allowed) */
  @Patch(':stockId/availability')
  updateAvailability(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('stockId', ParseUUIDPipe) stockId: string,
    @Body() dto: UpdateStockAvailabilityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.stockService.updateAvailability(orgId, stockId, user.sub, dto);
  }
}
