import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrderSplitsService } from './order-splits.service';
import { OpenSplitDto } from './dto/open-split.dto';
import { ClaimUnitsDto } from './dto/claim-units.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * « L'ardoise » — composer à plusieurs, chacun règle sa part.
 *
 * Séparation volontaire des accès :
 *
 *   • L'HÔTE est connecté : lui seul ouvre, envoie ou annule la tournée. C'est
 *     son panier, sa commande, son numéro de retrait.
 *
 *   • Les CONVIVES ne le sont pas, et ne le seront jamais. Ils ouvrent un lien
 *     reçu par message, cochent leurs articles et paient sur une page Stripe.
 *     Leur demander un compte reviendrait à leur demander d'installer l'app —
 *     exactement ce que cette fonction évite.
 *
 * Ce que voit un convive : des articles, des prix, des prénoms donnés
 * volontairement. Jamais une adresse, jamais un identifiant.
 */
@Controller()
export class OrderSplitsController {
  constructor(private readonly service: OrderSplitsService) {}

  // ─── Hôte (connecté) ────────────────────────────────────────

  /** POST /api/v1/order-splits — ouvre l'ardoise à partir de mon panier. */
  @UseGuards(JwtAuthGuard)
  @Post('order-splits')
  ouvrir(@CurrentUser() user: JwtPayload, @Body() dto: OpenSplitDto) {
    return this.service.ouvrir(user.sub, dto.cartId);
  }

  /** POST /api/v1/order-splits/:code/send — encaisse tout et envoie au comptoir. */
  @UseGuards(JwtAuthGuard)
  @Post('order-splits/:code/send')
  envoyer(@CurrentUser() user: JwtPayload, @Param('code') code: string) {
    return this.service.envoyer(user.sub, code);
  }

  /** POST /api/v1/order-splits/:code/cancel — libère toutes les autorisations. */
  @UseGuards(JwtAuthGuard)
  @Post('order-splits/:code/cancel')
  annuler(@CurrentUser() user: JwtPayload, @Param('code') code: string) {
    return this.service.annuler(user.sub, code);
  }

  // ─── Convives (sans compte) ─────────────────────────────────

  /**
   * GET /api/v1/public/order-splits/enabled — la fonction est-elle ouverte ?
   *
   * L'app le demande avant d'afficher « Partager l'addition ». Un bouton visible
   * qui répond « non disponible » est pire que pas de bouton du tout, et c'est
   * ce qui arriverait à chaque fois que l'interrupteur est coupé.
   */
  @Get('public/order-splits/enabled')
  estActive() {
    return { enabled: this.service.estActive() };
  }

  /** GET /api/v1/public/order-splits/:code — la liste, telle qu'elle est. */
  @Get('public/order-splits/:code')
  consulter(@Param('code') code: string) {
    return this.service.consulter(code);
  }

  /**
   * POST /api/v1/public/order-splits/:code/claim — je prends ces articles.
   *
   * Renvoie l'adresse de la page de paiement Stripe. Les articles sont réservés
   * le temps du règlement, puis rendus au groupe si le convive abandonne.
   */
  @Post('public/order-splits/:code/claim')
  prendre(@Param('code') code: string, @Body() dto: ClaimUnitsDto) {
    return this.service.prendreSaPart({
      code,
      unitIds: dto.unitIds,
      claimantName: dto.claimantName,
    });
  }
}
