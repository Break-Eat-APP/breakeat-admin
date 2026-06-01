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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Categories routes — nested under supplier:
 * /api/v1/organizations/:orgId/suppliers/:supplierId/categories
 *
 * All routes require JWT authentication.
 */
@Controller('organizations/:orgId/suppliers/:supplierId/categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /** POST — create a category for a supplier */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categoriesService.create(orgId, supplierId, user.sub, dto);
  }

  /** GET — list categories for a supplier */
  @Get()
  findAll(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categoriesService.findAllBySupplier(orgId, supplierId, user.sub);
  }

  /** GET /:categoryId — single category */
  @Get(':categoryId')
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categoriesService.findOne(orgId, supplierId, categoryId, user.sub);
  }

  /** PATCH /:categoryId — update name / sortOrder / status */
  @Patch(':categoryId')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categoriesService.update(orgId, supplierId, categoryId, user.sub, dto);
  }

  /** DELETE /:categoryId — blocked if products exist */
  @Delete(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('supplierId', ParseUUIDPipe) supplierId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.categoriesService.remove(orgId, supplierId, categoryId, user.sub);
  }
}
