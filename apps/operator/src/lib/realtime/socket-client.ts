/**
 * WebSocket client stub — Phase 1.
 *
 * This file defines the structure and contract of the realtime client.
 * The actual connection logic is implemented in Phase 6 (Orders + Realtime).
 *
 * Architecture rules (from REALTIME_CONTRACTS.md):
 * - Reconnect with exponential backoff
 * - Visible connection status at all times
 * - Resync full dashboard state after reconnect
 * - Fallback polling if socket disconnected > 5s
 * - Every event has a unique eventId — duplicates must be ignored
 */

export type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RealtimeEvent {
  eventId: string;
  eventName: string;
  occurredAt: string;
  [key: string]: unknown;
}

export interface SocketClientOptions {
  url: string;
  /** Room to join on connect (e.g. "dashboard:uuid") */
  room: string;
  onEvent: (event: RealtimeEvent) => void;
  onStatusChange: (status: SocketStatus) => void;
}

/**
 * Placeholder — replaced with full implementation in Phase 6.
 * Keeps the import path stable so operator components can reference it now.
 */
export class SocketClient {
  private readonly options: SocketClientOptions;

  constructor(options: SocketClientOptions) {
    this.options = options;
  }

  connect(): void {
    // Phase 6 implementation
    this.options.onStatusChange('disconnected');
    console.warn('[SocketClient] Not yet implemented — Phase 6');
  }

  disconnect(): void {
    // Phase 6 implementation
  }
}
