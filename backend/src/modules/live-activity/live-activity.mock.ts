import type { Provider } from '@nestjs/common';
import { LiveActivityService } from './live-activity.service';

/**
 * Provider de test : Live Activity inerte.
 *
 * Les suites commandes testent la machine à états, pas l'affichage iOS. Un
 * service muet garantit qu'aucune transition ne dépend d'APNs (le vrai service
 * est appelé en fire-and-forget, il ne doit jamais influencer le résultat).
 */
export const liveActivityNoopProvider: Provider = {
  provide: LiveActivityService,
  useValue: {
    onOrderStatusChanged: jest.fn().mockResolvedValue(undefined),
    pushOrderUpdate: jest.fn().mockResolvedValue(0),
    buildContentState: jest.fn().mockResolvedValue(null),
    applyOperationalUpdate: jest.fn().mockResolvedValue(undefined),
    register: jest.fn(),
    unregister: jest.fn(),
    mapWidgetStatus: jest.fn().mockReturnValue('CREATED'),
  },
};
