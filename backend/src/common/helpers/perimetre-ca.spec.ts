import { OrderStatus, PaymentStatus } from '@prisma/client';
import { perimetreCa, PERIMETRE_CA_SQL } from './perimetre-ca';

/**
 * Le périmètre du chiffre d'affaires est une règle de COMPTABILITÉ, pas un
 * détail de requête : plusieurs écrans montrent le même chiffre à des gens
 * différents, et ils doivent compter les mêmes commandes.
 *
 * Le défaut trouvé à l'audit : les statistiques du club, le fichier client et
 * la fréquentation excluaient les commandes annulées ; le back-office les
 * comptait. Le même mois affichait deux chiffres d'affaires selon la page.
 */
describe('perimetreCa — ce qui compte dans le chiffre d’affaires', () => {
  it('exige un paiement réussi ET exclut les commandes annulées', () => {
    expect(perimetreCa()).toEqual({
      paymentStatus: PaymentStatus.SUCCEEDED,
      status: { not: OrderStatus.CANCELLED },
    });
  });

  it('accepte les bornes de l’appelant sans perdre la règle', () => {
    const where = perimetreCa({ organizationId: 'org-1', venueId: 'lieu-1' });

    expect(where.paymentStatus).toBe(PaymentStatus.SUCCEEDED);
    expect(where.status).toEqual({ not: OrderStatus.CANCELLED });
    expect(where.organizationId).toBe('org-1');
    expect(where.venueId).toBe('lieu-1');
  });

  it('rend un objet NEUF à chaque appel', () => {
    // Une constante partagée se ferait modifier par le premier appelant qui
    // ajoute une borne, et tous les autres écrans compteraient autrement.
    const a = perimetreCa();
    const b = perimetreCa({ eventId: 'evt-1' });

    expect(a).not.toBe(b);
    expect(a.eventId).toBeUndefined();
  });

  it('la formulation SQL dit la même chose', () => {
    // Les agrégats par taux de TVA passent par du SQL : les deux écritures
    // vivent côte à côte pour qu'on corrige les deux ensemble.
    expect(PERIMETRE_CA_SQL).toContain("payment_status::text = 'SUCCEEDED'");
    expect(PERIMETRE_CA_SQL).toContain("status::text <> 'CANCELLED'");
  });
});
