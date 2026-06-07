import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlaixDecisionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

// ─── Decision payload types (match FLAIX_CONTRACT.md) ────────

export interface SlotDecisionPayload {
  decisionId: string;
  type: 'slot_decision';
  eventId: string;
  supplierId?: string | null;
  pickupPointId?: string | null;
  recommendedSlotId: string;
  reason: 'rush' | 'capacity' | 'manual' | 'balancing';
  confidence: number;
  createdAt: string;
}

export interface RushDecisionPayload {
  decisionId: string;
  type: 'rush_decision';
  eventId: string;
  rushScore: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: 'normal' | 'slow_orders' | 'pause_orders' | 'expand_slots';
  createdAt: string;
}

export interface RecommendationPayload {
  decisionId: string;
  type: 'recommendation_decision';
  eventId: string;
  userId?: string | null;
  productIds: string[];
  context: 'after_add_to_cart' | 'checkout' | 'rush_optimization';
  createdAt: string;
}

export type FlaixDecisionPayload =
  | SlotDecisionPayload
  | RushDecisionPayload
  | RecommendationPayload;

// ─── Service ─────────────────────────────────────────────────

/**
 * FlaixService — the single integration boundary between BREAK EAT and the Flaix AI engine.
 *
 * Per FLAIX_CONTRACT.md:
 *   - No other module calls Flaix directly — all calls go through this service.
 *   - Every applied decision is stored in flaix_decisions (via recordDecision).
 *   - If Flaix is unavailable, the fallback behaviour is applied and the failure is logged.
 *   - This implementation is a STUB: the HTTP client call is scaffolded but returns null
 *     when FLAIX_API_URL is not set. Wire up the real URL in a future phase.
 *
 * Integration allowed from: orders → flaix, slots → flaix, dashboards → flaix,
 *                            products → flaix (recommendations only).
 */
@Injectable()
export class FlaixService {
  private readonly logger = new Logger(FlaixService.name);
  private readonly apiUrl:    string | undefined;
  private readonly apiKey:    string | undefined;

  constructor(
    private readonly config:  ConfigService,
    private readonly prisma:  PrismaService,
  ) {
    this.apiUrl = this.config.get<string>('app.flaix.apiUrl');
    this.apiKey = this.config.get<string>('app.flaix.apiKey');
  }

  // ─── Availability check ──────────────────────────────────

  /**
   * Returns true if Flaix is configured and presumed reachable.
   * Phase 7 = stub → returns true only when FLAIX_API_URL is set.
   * Phase 8+ will add an actual HTTP health probe.
   */
  isConfigured(): boolean {
    return Boolean(this.apiUrl);
  }

  // ─── Slot decision ───────────────────────────────────────

  /**
   * Asks Flaix for a recommended slot for the given context.
   *
   * Returns null if:
   *   - Flaix is not configured (FLAIX_API_URL not set)
   *   - Flaix returns an error or times out
   *
   * Callers must apply a safe fallback when null is returned.
   */
  async requestSlotDecision(
    eventId: string,
    _context: {
      supplierId?:    string;
      pickupPointId?: string;
      currentLoad?:   number;
    } = {},
  ): Promise<SlotDecisionPayload | null> {
    if (!this.isConfigured()) {
      this.logger.debug('FlaixService: not configured — skipping slot decision request');
      return null;
    }

    try {
      // Stub: real HTTP call goes here
      // const response = await fetch(`${this.apiUrl}/decisions/slot`, {
      //   method: 'POST',
      //   headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ eventId, ...context }),
      // });
      // return (await response.json()) as SlotDecisionPayload;
      this.logger.debug(`FlaixService: stub — would call ${this.apiUrl}/decisions/slot for event ${eventId}`);
      return null;
    } catch (err) {
      this.logger.warn(`FlaixService: slot decision failed for event ${eventId} — falling back`, err);
      return null;
    }
  }

  /**
   * Asks Flaix for a rush assessment of the current event load.
   *
   * Returns null when Flaix is unavailable — callers must treat
   * a null response as "no rush detected" and continue normally.
   */
  async requestRushDecision(eventId: string): Promise<RushDecisionPayload | null> {
    if (!this.isConfigured()) {
      this.logger.debug('FlaixService: not configured — skipping rush decision request');
      return null;
    }

    try {
      // Stub: real HTTP call goes here
      this.logger.debug(`FlaixService: stub — would call ${this.apiUrl}/decisions/rush for event ${eventId}`);
      return null;
    } catch (err) {
      this.logger.warn(`FlaixService: rush decision failed for event ${eventId} — continuing normally`, err);
      return null;
    }
  }

  /**
   * Asks Flaix for product recommendations.
   *
   * Returns an empty array when Flaix is unavailable — the checkout/cart
   * must still work without recommendations.
   */
  async requestRecommendation(
    eventId: string,
    _userId?: string,
    _context: RecommendationPayload['context'] = 'checkout',
  ): Promise<RecommendationPayload | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      // Stub: real HTTP call goes here
      this.logger.debug(`FlaixService: stub — would call ${this.apiUrl}/decisions/recommendation`);
      return null;
    } catch (err) {
      this.logger.warn('FlaixService: recommendation request failed — returning null', err);
      return null;
    }
  }

  // ─── Decision audit ──────────────────────────────────────

  /**
   * Stores an applied Flaix decision in the database.
   * Uses decisionId as an idempotency key — duplicate calls are silently ignored.
   *
   * Call this AFTER the decision has been applied, never before.
   *
   * @param payload    The raw Flaix decision payload
   * @param applied    What the backend did with the decision (e.g. 'slot_assigned')
   * @param affectedIds UUIDs of the entities that were modified (orders, slots, etc.)
   * @param slotId     Optional: the slot affected by this decision
   */
  async recordDecision(
    payload: FlaixDecisionPayload,
    applied: string,
    affectedIds: string[],
    slotId?: string,
  ): Promise<void> {
    const type = this.mapDecisionType(payload.type);

    try {
      await this.prisma.flaixDecision.create({
        data: {
          decisionId:    payload.decisionId,
          type,
          eventId:       payload.eventId,
          slotId:        slotId ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sourcePayload: payload as any,
          appliedAction: applied,
          affectedIds,
        },
      });
      this.logger.debug(
        `FlaixService: recorded decision ${payload.decisionId} (${type}) → ${applied}`,
      );
    } catch (err: unknown) {
      // P2002 = UNIQUE constraint violation → decision already recorded (idempotent)
      const isUniqueViolation =
        typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
      if (isUniqueViolation) {
        this.logger.debug(`FlaixService: decision ${payload.decisionId} already recorded — skipping`);
        return;
      }
      throw err;
    }
  }

  /**
   * Returns the most recent rush decision for an event.
   * Used by dashboards to show current rush level without querying Flaix.
   */
  async getLatestRushDecision(eventId: string) {
    return this.prisma.flaixDecision.findFirst({
      where: { eventId, type: FlaixDecisionType.RUSH_DECISION },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns all Flaix decisions for an event, latest first.
   */
  async listDecisionsForEvent(eventId: string) {
    return this.prisma.flaixDecision.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Private helpers ─────────────────────────────────────

  private mapDecisionType(raw: FlaixDecisionPayload['type']): FlaixDecisionType {
    switch (raw) {
      case 'slot_decision':           return FlaixDecisionType.SLOT_DECISION;
      case 'rush_decision':           return FlaixDecisionType.RUSH_DECISION;
      case 'recommendation_decision': return FlaixDecisionType.RECOMMENDATION_DECISION;
    }
  }
}
