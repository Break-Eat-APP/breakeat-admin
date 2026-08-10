import type { Provider } from '@nestjs/common';
import { LoyaltyService, LOYALTY_DISABLED } from './loyalty.service';

/**
 * Provider de test : fidélité DÉSACTIVÉE.
 *
 * Les suites panier/commandes testent le parcours d'achat, pas la fidélité :
 * un programme désactivé garantit `discount = 0`, donc des totaux inchangés et
 * des assertions financières qui restent valables. Les tests spécifiques à la
 * fidélité fournissent leur propre configuration.
 */
export const loyaltyDisabledProvider: Provider = {
  provide: LoyaltyService,
  useValue: {
    getConfigForVenue: jest.fn().mockResolvedValue(LOYALTY_DISABLED),
    getConfigForEvent: jest.fn().mockResolvedValue(LOYALTY_DISABLED),
    getBalance: jest.fn().mockResolvedValue(0),
    getSummary: jest.fn().mockResolvedValue({ organizationId: '', balance: 0, transactions: [] }),
    pointsForAmount: jest.fn().mockReturnValue(0),
    discountForPoints: jest.fn().mockReturnValue({ pointsUsed: 0, discountCents: 0 }),
    earnForOrder: jest.fn().mockResolvedValue(0),
    redeemForOrderTx: jest.fn().mockResolvedValue(undefined),
    assertOrganizationExists: jest.fn().mockResolvedValue(undefined),
  },
};
