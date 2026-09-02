import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
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
import { RedeemPointsDto } from './dto/redeem-points.dto';
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
  checkout(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    // D'ou vient l'appel : l'app installee ou un navigateur. Cela ne change que
    // l'adresse de RETOUR apres paiement — rebond vers `breakeat://` d'un cote,
    // page web de l'autre. Valeur libre refusee : voir RetourPaiementController.
    @Query('plateforme') plateforme?: string,
  ) {
    return this.cartService.checkout(id, user.sub, plateforme === 'native' ? 'native' : 'web');
  }

  /**
   * GET /api/v1/carts/:id/commande
   *
   * « Ma commande est-elle nee ? » — interroge par l'app au retour de la page
   * de paiement, en boucle courte. Repond `{ pret: false }` tant que le webhook
   * Stripe n'a pas cree la commande : c'est un delai, pas une erreur.
   */
  @Get(':id/commande')
  commandeDuPanier(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.cartService.commandeDuPanier(id, user.sub);
  }

  /**
   * PATCH /api/v1/carts/:id/loyalty-points
   *
   * PHASE 20 — le client choisit combien de points de fidélité utiliser.
   * Renvoie le panier recalculé (remise + nouveau total).
   */
  @Patch(':id/loyalty-points')
  redeemPoints(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedeemPointsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.cartService.setRedeemedPoints(id, user.sub, dto.points);
  }
}
