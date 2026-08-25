import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SlotTemplatesService } from './slot-templates.service';
import { CreateSlotTemplateDto } from './dto/create-slot-template.dto';
import { UpdateSlotTemplateDto } from './dto/update-slot-template.dto';

interface JwtUser {
  sub: string;
}

/**
 * SlotTemplatesController — créneaux de récupération récurrents d'un lieu.
 *
 * Base : /api/v1/venues/:venueId/slot-templates
 *
 * Ces créneaux se configurent une fois et se rejouent chaque jour. Le créneau
 * du jour est matérialisé à la lecture, jamais par une tâche planifiée.
 *
 * Lecture ouverte à l'équipier (il doit voir ses créneaux pour les ouvrir ou
 * les fermer) ; écriture réservée au club.
 */
@UseGuards(JwtAuthGuard)
@Controller('venues/:venueId/slot-templates')
export class SlotTemplatesController {
  constructor(private readonly service: SlotTemplatesService) {}

  /** GET — les créneaux types du lieu, buvette par buvette. */
  @Get()
  findAll(@Param('venueId') venueId: string, @CurrentUser() user: JwtUser) {
    return this.service.findByVenue(venueId, user.sub);
  }

  /** POST — ajoute un créneau récurrent sur une buvette. Club uniquement. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('venueId') venueId: string,
    @Body() dto: CreateSlotTemplateDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(venueId, dto, user.sub);
  }

  /** PATCH — modifie horaires, libellé, capacité ou activation. Club uniquement. */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSlotTemplateDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  /**
   * DELETE — retire le motif. Les créneaux déjà engendrés SURVIVENT : ils
   * portent peut-être des commandes. Pour cesser d'en produire sans rien
   * perdre, préférer `isActive: false`.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.sub);
  }
}
