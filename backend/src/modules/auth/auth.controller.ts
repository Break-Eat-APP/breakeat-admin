import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from './strategies/jwt.strategy';

/**
 * Auth routes — all under /api/v1/auth
 * Controllers stay thin: validate input, call service, return response.
 * No business logic here.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /auth/register */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** POST /auth/login */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * POST /auth/social — inscription et connexion par Apple ou Google.
   *
   * Une seule route pour les deux gestes : du point de vue du client, « se
   * connecter avec Apple » ne se distingue pas de « s'inscrire avec Apple », et
   * lui demander lequel des deux il fait n'aurait aucun sens.
   */
  @Post('social')
  @HttpCode(HttpStatus.OK)
  social(@Body() dto: SocialLoginDto) {
    return this.authService.connexionSociale(dto);
  }

  /**
   * GET /auth/providers — ce que l'application a le droit de proposer.
   *
   * Un bouton « Continuer avec Google » sans identifiant client derrière mène à
   * une erreur : mieux vaut que l'application ne l'affiche pas du tout.
   */
  @Get('providers')
  providers() {
    return { providers: this.authService.fournisseursDisponibles() };
  }

  /** POST /auth/refresh */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** POST /auth/logout */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  /** GET /auth/me — requires valid JWT */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }

  /**
   * GET /auth/me/memberships — requires valid JWT
   * Returns the current user + all organisation memberships with org name/slug.
   * Used exclusively by the admin panel to resolve which orgs the caller manages.
   */
  @Get('me/memberships')
  @UseGuards(JwtAuthGuard)
  meWithMemberships(@CurrentUser() user: JwtPayload) {
    return this.authService.meWithMemberships(user.sub);
  }
}
