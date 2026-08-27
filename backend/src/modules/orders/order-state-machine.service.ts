import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

/**
 * OrderStateMachineService — pure transition guard.
 *
 * Source of truth: /brain/ORDER_STATE_MACHINE.md
 *
 * Allowed transitions (17 total):
 *   PAID        → PREPARING | ACCEPTED | CANCELLED | RECOVERED
 *   ACCEPTED    → PREPARING | READY | CANCELLED | RECOVERED
 *   PREPARING   → READY | CANCELLED | RECOVERED
 *   READY       → PICKED_UP | RECOVERED
 *   PICKED_UP   → COMPLETED
 *   RECOVERED   → ACCEPTED | PREPARING | READY
 *
 * Terminal states (no outgoing transitions):
 *   COMPLETED, CANCELLED
 *
 * Pourquoi PAID → PREPARING et ACCEPTED → READY, qui « sautent » une étape :
 * le board opérateur ne compte que TROIS colonnes (nouvelle → en préparation →
 * prête à remettre). `ACCEPTED` n'y apparaît pas — accepter une commande et s'y
 * mettre sont le même geste pour la personne au comptoir. Ces deux raccourcis
 * sont donc le parcours NORMAL, pas une exception : sans eux, l'opératrice
 * devrait cliquer deux fois pour un seul mouvement réel.
 *
 * Les transitions d'origine restent ouvertes : une commande déjà en `ACCEPTED`
 * (créée avant ce changement, ou par une autre voie) doit continuer d'avancer.
 */

type TransitionMap = Partial<Record<OrderStatus, OrderStatus[]>>;

export const ALLOWED_TRANSITIONS: TransitionMap = {
  [OrderStatus.PAID]: [
    // Parcours du board à trois colonnes : « Nouvelles » → « En préparation ».
    OrderStatus.PREPARING,
    OrderStatus.ACCEPTED,
    OrderStatus.CANCELLED,
    OrderStatus.RECOVERED,
  ],
  [OrderStatus.ACCEPTED]: [
    OrderStatus.PREPARING,
    // Une commande restée en ACCEPTED est affichée dans « En préparation » :
    // son bouton doit pouvoir la marquer prête sans détour.
    OrderStatus.READY,
    OrderStatus.CANCELLED,
    OrderStatus.RECOVERED,
  ],
  [OrderStatus.PREPARING]: [
    OrderStatus.READY,
    OrderStatus.CANCELLED,
    OrderStatus.RECOVERED,
  ],
  [OrderStatus.READY]: [OrderStatus.PICKED_UP, OrderStatus.RECOVERED],
  [OrderStatus.PICKED_UP]: [OrderStatus.COMPLETED],
  [OrderStatus.RECOVERED]: [
    OrderStatus.ACCEPTED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
  ],
};

@Injectable()
export class OrderStateMachineService {
  /**
   * Throws BadRequestException if the transition is not allowed.
   * Call this before any DB write.
   */
  assertTransition(from: OrderStatus, to: OrderStatus): void {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Order transition ${from} → ${to} is not allowed. Allowed from ${from}: [${allowed.join(', ') || 'none'}]`,
      );
    }
  }

  isAllowed(from: OrderStatus, to: OrderStatus): boolean {
    return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
  }

  allowedFrom(status: OrderStatus): OrderStatus[] {
    return ALLOWED_TRANSITIONS[status] ?? [];
  }
}
