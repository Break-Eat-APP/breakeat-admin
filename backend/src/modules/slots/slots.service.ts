import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SlotSource, SlotStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { requireOrgAccess } from '../../common/helpers/require-org-access';
import { OrgRole } from '../../common/enums/role.enum';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';

const WRITE_ROLES: OrgRole[] = [OrgRole.ORG_ADMIN, OrgRole.MANAGER];

@Injectable()
export class SlotsService {
  private readonly logger = new Logger(SlotsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── CRUD ────────────────────────────────────────────────────

  async create(
    eventId: string,
    dto: CreateSlotDto,
    callerId: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { organization: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    await requireOrgAccess(
      this.prisma,
      callerId,
      event.organizationId,
      WRITE_ROLES,
    );

    // Validate temporal ordering
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be strictly after startAt');
    }

    // Validate supplierId belongs to event if provided
    if (dto.supplierId) {
      const linked = await this.prisma.eventSupplier.findUnique({
        where: { eventId_supplierId: { eventId, supplierId: dto.supplierId } },
      });
      if (!linked) {
        throw new BadRequestException(
          `Supplier ${dto.supplierId} is not attached to event ${eventId}`,
        );
      }
    }

    // Validate pickupPointId belongs to event if provided
    if (dto.pickupPointId) {
      const pp = await this.prisma.pickupPoint.findUnique({
        where: { id: dto.pickupPointId },
      });
      if (!pp || pp.eventId !== eventId) {
        throw new BadRequestException(
          `PickupPoint ${dto.pickupPointId} does not belong to event ${eventId}`,
        );
      }
    }

    return this.prisma.slot.create({
      data: {
        eventId,
        supplierId:   dto.supplierId   ?? null,
        pickupPointId: dto.pickupPointId ?? null,
        startAt,
        endAt,
        capacity: dto.capacity,
        label:    dto.label ?? null,
        source:   SlotSource.MANUAL,
        status:   SlotStatus.OPEN,
      },
    });
  }

  async findByEvent(eventId: string) {
    return this.prisma.slot.findMany({
      where: { eventId },
      orderBy: { startAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const slot = await this.prisma.slot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException(`Slot ${id} not found`);
    return slot;
  }

  async update(
    id: string,
    dto: UpdateSlotDto,
    callerId: string,
  ) {
    const slot = await this.findOne(id);
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: slot.eventId },
    });
    await requireOrgAccess(
      this.prisma,
      callerId,
      event.organizationId,
      WRITE_ROLES,
    );

    const data: Prisma.SlotUpdateInput = {};

    if (dto.startAt !== undefined) data.startAt = new Date(dto.startAt);
    if (dto.endAt   !== undefined) data.endAt   = new Date(dto.endAt);
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.label    !== undefined) data.label    = dto.label;
    if (dto.status   !== undefined) data.status   = dto.status;

    // Re-validate time window if both or one was changed
    const newStart = data.startAt ? new Date(data.startAt as string | Date) : slot.startAt;
    const newEnd   = data.endAt   ? new Date(data.endAt   as string | Date) : slot.endAt;
    if (newEnd <= newStart) {
      throw new BadRequestException('endAt must be strictly after startAt');
    }

    return this.prisma.slot.update({ where: { id }, data });
  }

  async remove(id: string, callerId: string) {
    const slot = await this.findOne(id);
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: slot.eventId },
    });
    await requireOrgAccess(
      this.prisma,
      callerId,
      event.organizationId,
      WRITE_ROLES,
    );

    // Cannot delete a slot that already has orders assigned
    const orderCount = await this.prisma.order.count({ where: { slotId: id } });
    if (orderCount > 0) {
      throw new ConflictException(
        `Cannot delete slot ${id}: ${orderCount} order(s) are already assigned to it`,
      );
    }

    await this.prisma.slot.delete({ where: { id } });
    return { deleted: id };
  }

  // ─── Capacity management ────────────────────────────────────

  /**
   * Atomically assigns an order to a slot:
   *   1. Increments currentLoad with conditional WHERE (currentLoad < capacity)
   *   2. If no rows updated → slot is full → ConflictException
   *   3. Auto-flips status to FULL when currentLoad reaches capacity
   *
   * Must be called INSIDE a Prisma $transaction when used with other writes.
   */
  async assignOrderToSlot(
    orderId: string,
    slotId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    // Fetch current state within the transaction
    const slot = await tx.slot.findUnique({ where: { id: slotId } });
    if (!slot) throw new NotFoundException(`Slot ${slotId} not found`);
    if (slot.status === SlotStatus.CLOSED) {
      throw new BadRequestException(`Slot ${slotId} is closed`);
    }
    if (slot.status === SlotStatus.FULL) {
      throw new ConflictException(`Slot ${slotId} is full`);
    }

    // Conditional increment — only if still below capacity (race-safe)
    const updated = await tx.slot.updateMany({
      where: {
        id: slotId,
        currentLoad: { lt: slot.capacity },
        status: { not: SlotStatus.CLOSED },
      },
      data: { currentLoad: { increment: 1 } },
    });

    if (updated.count === 0) {
      throw new ConflictException(`Slot ${slotId} is full or was closed concurrently`);
    }

    // Update the order's slotId
    await tx.order.update({ where: { id: orderId }, data: { slotId } });

    // Flip status to FULL if we've reached capacity
    await tx.slot.updateMany({
      where: { id: slotId, currentLoad: slot.capacity },
      data:  { status: SlotStatus.FULL },
    });

    this.logger.debug(`SlotsService: order ${orderId} assigned to slot ${slotId}`);
  }
}
