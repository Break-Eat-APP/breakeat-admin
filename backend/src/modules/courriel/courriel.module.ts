import { Module } from '@nestjs/common';
import { CourrielService } from './courriel.service';

/**
 * Le seul endroit d'où part un courriel.
 *
 * Exporté plutôt que recopié : le jour où un deuxième parcours en aura besoin
 * — une confirmation de commande, un reçu — il n'aura pas à redécider du
 * fournisseur, de l'expéditeur ni du délai d'abandon.
 */
@Module({
  providers: [CourrielService],
  exports: [CourrielService],
})
export class CourrielModule {}
