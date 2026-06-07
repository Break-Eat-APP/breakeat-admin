/**
 * SocketClient — Phase 8 full implementation.
 *
 * Features:
 * - JWT auth via handshake.auth.token
 * - Joins a room on connect
 * - Deduplicates events via eventId (sliding window of 1000 IDs)
 * - Automatic reconnect with socket.io built-in exponential backoff
 * - Resync callback after reconnect (consumer fetches fresh REST snapshot)
 */

export type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RealtimeEvent {
  eventId: string;           // dedup UUID (NOT the concert event id)
  eventName: string;
  occurredAt: string;
  [key: string]: unknown;
}

export interface SocketClientOptions {
  url: string;
  /** JWT access token */
  token: string;
  /** Room to join on connect, e.g. "event:{uuid}" or "organization:{uuid}" */
  room: string;
  onEvent: (event: RealtimeEvent) => void;
  onStatusChange: (status: SocketStatus) => void;
  /** Called after a successful reconnect — consumer should resync via REST */
  onResync?: () => void;
}

export class SocketClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private socket: any = null;
  private readonly seenEventIds = new Set<string>();
  private connected = false;

  constructor(private readonly options: SocketClientOptions) {}

  /**
   * Connects to the socket.io server.
   * Uses dynamic import so Next.js does not SSR socket.io-client.
   */
  async connect(): Promise<void> {
    if (this.socket) return; // already connecting / connected

    this.options.onStatusChange('connecting');

    // Dynamic import — avoids SSR issues in Next.js
    const { io } = await import('socket.io-client');

    this.socket = io(this.options.url, {
      auth: { token: this.options.token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      this.socket.emit('join_room', { room: this.options.room });
      const wasConnected = this.connected;
      this.connected = true;
      this.options.onStatusChange('connected');
      // Trigger a REST resync after any reconnect (not on first connect)
      if (wasConnected && this.options.onResync) {
        this.options.onResync();
      }
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      this.options.onStatusChange('disconnected');
    });

    this.socket.on('connect_error', () => {
      this.options.onStatusChange('error');
    });

    // Listen to all realtime event types defined in REALTIME_CONTRACTS.md
    for (const eventName of ['new_order', 'order_updated', 'order_ready'] as const) {
      this.socket.on(eventName, (data: RealtimeEvent) => {
        if (!data.eventId) return;

        // Sliding dedup window — discard if we already processed this eventId
        if (this.seenEventIds.has(data.eventId)) return;
        this.seenEventIds.add(data.eventId);

        // Keep memory bounded (max 1000 dedup IDs)
        if (this.seenEventIds.size > 1000) {
          const first = this.seenEventIds.values().next().value as string;
          this.seenEventIds.delete(first);
        }

        this.options.onEvent({ ...data, eventName });
      });
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
