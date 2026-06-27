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
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { UpdateSupplierStatusDto } from './dto/update-supplier-status.dto';
import { CreateOnboardingLinkDto } from './dto/create-onboarding-link.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:orgId/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  /** POST /api/v1/organizations/:orgId/suppliers */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.suppliersService.create(orgId, user.sub, dto);
  }

  /** GET /api/v1/organizations/:orgId/suppliers */
  @Get()
  findAll(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.suppliersService.findAllByOrg(orgId, user.sub);
  }

  /** GET /api/v1/organizations/:orgId/suppliers/:id */
  @Get(':id')
  findOne(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.suppliersService.findOne(orgId, id, user.sub);
  }

  /** PATCH /api/v1/organizations/:orgId/suppliers/:id */
  @Patch(':id')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(orgId, id, user.sub, dto);
  }

  /** PATCH /api/v1/organizations/:orgId/suppliers/:id/status */
  @Patch(':id/status')
  updateStatus(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSupplierStatusDto,
  ) {
    return this.suppliersService.updateStatus(orgId, id, user.sub, dto);
  }

  // ─── Parrainage exploitant externe ───────────────────────────

  /** POST /api/v1/organizations/:orgId/suppliers/:id/referral — (re)génère le code. */
  @Post(':id/referral')
  @HttpCode(HttpStatus.OK)
  regenerateReferral(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.suppliersService.regenerateReferralCode(orgId, id, user.sub);
  }

  /** GET /api/v1/organizations/:orgId/suppliers/referral/:code — recherche par code. */
  @Get('referral/:code')
  findByReferral(
    @Param('code') code: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.suppliersService.findByReferralCode(code, user.sub);
  }

  // ─── Stripe Connect ──────────────────────────────────────────

  /**
   * POST /api/v1/organizations/:orgId/suppliers/:id/stripe/onboarding-link
   * Creates a Stripe Connect account if needed and returns a fresh onboarding URL.
   * The URL is single-use and short-lived — call again to refresh.
   */
  @Post(':id/stripe/onboarding-link')
  @HttpCode(HttpStatus.CREATED)
  createOnboardingLink(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOnboardingLinkDto,
  ) {
    return this.suppliersService.createOnboardingLink(orgId, id, user.sub, dto);
  }

  /**
   * GET /api/v1/organizations/:orgId/suppliers/:id/stripe/status
   * Pulls the live Stripe Account state and mirrors it on the supplier.
   */
  @Get(':id/stripe/status')
  refreshStripeStatus(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.suppliersService.refreshStripeStatus(orgId, id, user.sub);
  }
}
