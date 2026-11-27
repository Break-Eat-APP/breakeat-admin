import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StatsController } from './stats.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GlobalRole } from '../../common/enums/role.enum';

/**
 * TOUS LES AVIS DE LA PLATEFORME (27/11/2026) : une lecture ENTRE CLUBS. Elle
 * doit rester réservée au SUPER_ADMIN — un responsable de club n'y lirait pas
 * seulement ses avis, mais ceux de tous les autres.
 */
describe('StatsController — GET backoffice/avis', () => {
  const route = StatsController.prototype.getToutesLesNotes;

  it('est réservée au SUPER_ADMIN', () => {
    expect(Reflect.getMetadata(ROLES_KEY, route)).toEqual([GlobalRole.SUPER_ADMIN]);
    expect(Reflect.getMetadata(GUARDS_METADATA, route)).toContain(RolesGuard);
  });

  it('la route d’un club, elle, reste gardée par club (pas de rôle global exigé)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, StatsController.prototype.getOrgRatings)).toBeUndefined();
  });
});
