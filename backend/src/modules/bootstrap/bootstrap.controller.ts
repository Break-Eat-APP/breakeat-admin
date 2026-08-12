import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';

/**
 * BootstrapController — reprise de main sur l'accès principal.
 *
 * PAS de JwtAuthGuard, volontairement : cette route sert précisément quand on
 * ne peut plus obtenir de jeton. L'autorisation repose sur un secret partagé
 * (en-tête `x-bootstrap-secret`), défini en variable d'environnement par le
 * propriétaire du serveur.
 *
 * Sans `ADMIN_BOOTSTRAP_SECRET`, la route répond 404 : elle est inerte tant
 * qu'on ne l'a pas explicitement ouverte.
 *
 *   POST /api/v1/bootstrap/super-admin
 */
@Controller('bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrap: BootstrapService) {}

  @Post('super-admin')
  @HttpCode(HttpStatus.OK)
  async createSuperAdmin(
    @Body() dto: BootstrapAdminDto,
    @Headers('x-bootstrap-secret') secret: string,
  ) {
    return this.bootstrap.createSuperAdmin(dto, secret);
  }
}
