import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GlobalRole } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { LiveActivityService } from './live-activity.service';
import { ApnsService } from './apns.service';
import { RegisterLiveActivityDto } from './dto/register-live-activity.dto';

/**
 * LiveActivityController — surface exposée à l'APP.
 *
 * L'application ne peut QUE déclarer ses activités ; elle n'émet jamais vers
 * APNs elle-même (les identifiants Apple restent côté serveur). L'utilisateur
 * est toujours pris dans le JWT, jamais dans l'URL ni le corps : c'est ce qui
 * empêche un client d'enregistrer une activité sur la commande d'un autre.
 *
 *   POST   /live-activities              — déclare une activité + son token
 *   DELETE /live-activities/:activityId  — l'activité est terminée côté iOS
 */
@UseGuards(JwtAuthGuard)
@Controller('live-activities')
export class LiveActivityController {
  constructor(
    private readonly liveActivity: LiveActivityService,
    private readonly apns: ApnsService,
  ) {}

  /**
   * GET /live-activities/apns-health — diagnostic des identifiants Apple.
   *
   * Réservé au SUPER_ADMIN : permet de valider la clé APNs sans lancer un build
   * iOS complet. Ne renvoie AUCUN secret, seulement un verdict et l'environnement
   * visé (sandbox / production), qui doit correspondre au profil de build.
   */
  @Get('apns-health')
  @UseGuards(RolesGuard)
  @Roles(GlobalRole.SUPER_ADMIN)
  async apnsHealth() {
    return this.apns.checkCredentials();
  }

  /**
   * Enregistre (ou met à jour) une Live Activity. Le même appel sert à la
   * ROTATION du token : iOS peut en émettre un nouveau pendant la vie de
   * l'activité, l'app le renvoie ici.
   */
  @Post()
  async register(@Body() dto: RegisterLiveActivityDto, @CurrentUser() user: JwtPayload) {
    const activity = await this.liveActivity.register({
      userId: user.sub,
      orderId: dto.orderId,
      activityId: dto.activityId,
      pushToken: dto.pushToken,
    });
    // On ne renvoie pas le token : le client vient de nous le donner, et il n'a
    // aucune raison de circuler à nouveau.
    return { id: activity.id, orderId: activity.orderId, status: activity.status };
  }

  /** L'activité est terminée côté iOS : on cesse d'émettre vers son token. */
  @Delete(':activityId')
  async unregister(
    @Param('activityId') activityId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const activity = await this.liveActivity.unregister({ userId: user.sub, activityId });
    return { id: activity.id, status: activity.status };
  }
}
