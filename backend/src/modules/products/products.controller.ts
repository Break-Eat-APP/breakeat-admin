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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Products routes — nested under supplier:
 * /api/v1/organizations/:orgId/suppliers/:supplierId/products
 *
 * All routes require JWT authentication.
 */
@Controller('organizations/:orgId/suppliers/:supplierId/products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /** POST — create a product */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: CreateProductDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productsService.create(orgId, supplierId, user.sub, dto);
  }

  /** GET — list all products for a supplier */
  @Get()
  findAll(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productsService.findAllBySupplier(orgId, supplierId, user.sub);
  }

  /** GET /:productId — single product */
  @Get(':productId')
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productsService.findOne(orgId, supplierId, productId, user.sub);
  }

  /** PATCH /:productId — update product fields */
  @Patch(':productId')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productsService.update(orgId, supplierId, productId, user.sub, dto);
  }

  /** DELETE /:productId — hard delete (cascades stock) */
  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productsService.remove(orgId, supplierId, productId, user.sub);
  }
}
