import { NotFoundException } from '@nestjs/common';
import { PublicOrdersController } from './public-orders.controller';
import type { OrdersService } from './orders.service';
import type { GroupsService } from '../groups/groups.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

/**
 * Regression guard for the private-event leak: GET /public/orders/event/:id/ready
 * must refuse to return order numbers for an event the caller may not access.
 */
describe('PublicOrdersController', () => {
  const eventId = '11111111-1111-1111-1111-111111111111';
  const READY = [
    { id: 'o1', publicOrderNumber: 'BE-00000001', pickupPointId: 'pp1', updatedAt: new Date() },
  ];

  let ordersService: { findReadyByEvent: jest.Mock };
  let groupsService: { canAccessEvent: jest.Mock };
  let controller: PublicOrdersController;

  beforeEach(() => {
    ordersService = { findReadyByEvent: jest.fn().mockResolvedValue(READY) };
    groupsService = { canAccessEvent: jest.fn().mockResolvedValue(true) };
    controller = new PublicOrdersController(
      ordersService as unknown as OrdersService,
      groupsService as unknown as GroupsService,
    );
  });

  it('returns READY orders when access is allowed (anonymous PUBLIC event)', async () => {
    const result = await controller.findReady(eventId);
    expect(groupsService.canAccessEvent).toHaveBeenCalledWith(eventId, null);
    expect(ordersService.findReadyByEvent).toHaveBeenCalledWith(eventId);
    expect(result).toBe(READY);
  });

  it('passes the authenticated user id to the access check', async () => {
    const user = { sub: 'user-1' } as JwtPayload;
    await controller.findReady(eventId, user);
    expect(groupsService.canAccessEvent).toHaveBeenCalledWith(eventId, 'user-1');
  });

  it('throws 404 and never reads orders when access is denied (private-event leak guard)', async () => {
    groupsService.canAccessEvent.mockResolvedValue(false);
    await expect(controller.findReady(eventId)).rejects.toBeInstanceOf(NotFoundException);
    expect(ordersService.findReadyByEvent).not.toHaveBeenCalled();
  });
});
