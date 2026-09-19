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
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { UpdateSupplierStatusDto } from './dto/update-supplier-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/** Le seul choix à faire en dupliquant : comment s'appelle la nouvelle. */
class DupliquerSupplierDto {
  @IsString()
  @IsNotEmpty({ message: 'Donnez un nom à la nouvelle buvette.' })
  @MaxLength(80)
  name!: string;
}

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

  /**
   * POST /api/v1/organizations/:orgId/suppliers/:id/dupliquer
   *
   * Recopie la buvette ET sa carte sous un nouveau nom. Quatre points de
   * retrait qui vendent la même chose ne doivent pas demander quatre saisies.
   */
  @Post(':id/dupliquer')
  @HttpCode(HttpStatus.CREATED)
  dupliquer(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: DupliquerSupplierDto,
  ) {
    return this.suppliersService.dupliquer(orgId, user.sub, id, dto.name);
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

  /**
   * DELETE /api/v1/organizations/:orgId/suppliers/:id
   *
   * Refusé si des commandes y sont rattachées — voir SuppliersService.remove.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.suppliersService.remove(orgId, id, user.sub);
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

}
