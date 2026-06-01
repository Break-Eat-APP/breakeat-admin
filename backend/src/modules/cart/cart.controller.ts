import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { CreateCartDto } from './dto/create-cart.dto';
import { UpdateCartDto } from './dto/update-cart.dto';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@UseGuards(JwtAuthGuard)
@Controller('carts')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /** POST /api/v1/carts */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCartDto) {
    return this.cartService.create(user.sub, dto);
  }

  /** GET /api/v1/carts/:id */
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.cartService.findOne(id, user.sub);
  }

  /** PATCH /api/v1/carts/:id */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCartDto,
  ) {
    return this.cartService.update(id, user.sub, dto);
  }

  /** POST /api/v1/carts/:id/items */
  @Post(':id/items')
  @HttpCode(HttpStatus.CREATED)
  addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(id, user.sub, dto);
  }

  /** PATCH /api/v1/carts/:id/items/:itemId */
  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(id, itemId, user.sub, dto);
  }

  /** DELETE /api/v1/carts/:id/items/:itemId */
  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cartService.removeItem(id, itemId, user.sub);
  }

  /**
   * POST /api/v1/carts/:id/checkout
   * Transitions the cart to CHECKOUT_PENDING and returns a Stripe PaymentIntent
   * client_secret for the customer to confirm with Stripe Elements.
   *
   * Idempotent: calling twice for the same cart returns the same PaymentIntent.
   */
  @Post(':id/checkout')
  @HttpCode(HttpStatus.OK)
  checkout(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.cartService.checkout(id, user.sub);
  }
}
