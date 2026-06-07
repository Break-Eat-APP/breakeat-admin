/**
 * JsonLogger — structured JSON logging for Break Eat backend (Phase 10)
 *
 * Extends NestJS's built-in ConsoleLogger to emit one JSON object per line
 * when NODE_ENV=production. This is the format expected by Railway, Datadog,
 * Papertrail and most log aggregation platforms.
 *
 * In development, falls back to the standard NestJS coloured output so that
 * human-readable logs are preserved during local development.
 *
 * Usage (in main.ts):
 *   app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
 *
 * Example production log line:
 *   {"level":"log","timestamp":"2026-06-02T14:00:00.000Z","context":"Bootstrap","message":"Server running on port 3000"}
 */

import { ConsoleLogger, LogLevel } from '@nestjs/common';

type JsonLogEntry = {
  level: string;
  timestamp: string;
  context: string;
  message: string;
  stack?: string;
  [key: string]: unknown;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  log: 2,
  warn: 3,
  error: 4,
  fatal: 5,
};

export class JsonLogger extends ConsoleLogger {
  private readonly isProduction: boolean;
  private readonly minLevel: LogLevel;

  constructor(context?: string) {
    super(context ?? 'App', { timestamp: true });

    this.isProduction = process.env['NODE_ENV'] === 'production';

    // In production default to 'log' unless LOG_LEVEL overrides it.
    // In development default to 'debug' for full visibility.
    const envLevel = (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? null;
    this.minLevel = envLevel ?? (this.isProduction ? 'log' : 'debug');
  }

  // ─── Overrides ──────────────────────────────────────────────────────────────

  override log(message: unknown, ...optionalParams: unknown[]): void {
    if (!this.isProduction) { super.log(message, ...optionalParams); return; }
    this.emit('log', message, optionalParams);
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    if (!this.isProduction) { super.warn(message, ...optionalParams); return; }
    this.emit('warn', message, optionalParams);
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    if (!this.isProduction) { super.error(message, ...optionalParams); return; }
    this.emit('error', message, optionalParams);
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    if (!this.isProduction) { super.debug(message, ...optionalParams); return; }
    this.emit('debug', message, optionalParams);
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    if (!this.isProduction) { super.verbose(message, ...optionalParams); return; }
    this.emit('verbose', message, optionalParams);
  }

  override fatal(message: unknown, ...optionalParams: unknown[]): void {
    if (!this.isProduction) { super.fatal(message, ...optionalParams); return; }
    this.emit('fatal', message, optionalParams);
  }

  // ─── Core emitter ────────────────────────────────────────────────────────────

  private emit(level: LogLevel, message: unknown, params: unknown[]): void {
    if (!this.shouldLog(level)) return;

    // Extract context string (NestJS passes it as last optionalParam when string)
    const context = this.resolveContext(params);

    const entry: JsonLogEntry = {
      level,
      timestamp: new Date().toISOString(),
      context,
      message: this.serializeMessage(message),
    };

    // Attach stack trace for errors
    const stack = this.resolveStack(params);
    if (stack) entry['stack'] = stack;

    // For objects passed as message, merge top-level keys into the log entry
    if (typeof message === 'object' && message !== null && !(message instanceof Error)) {
      Object.assign(entry, message);
      entry['message'] = entry['message'] || '[object]';
    }

    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel];
  }

  private resolveContext(params: unknown[]): string {
    // NestJS appends context string as last parameter when using Logger.log('msg', 'Context')
    const last = params[params.length - 1];
    if (typeof last === 'string') return last;
    return this.context ?? 'App';
  }

  private resolveStack(params: unknown[]): string | undefined {
    for (const p of params) {
      if (p instanceof Error && p.stack) return p.stack;
      if (typeof p === 'string' && p.includes('\n    at ')) return p;
    }
    return undefined;
  }

  private serializeMessage(message: unknown): string {
    if (typeof message === 'string') return message;
    if (message instanceof Error) return message.message;
    try { return JSON.stringify(message); } catch { return String(message); }
  }
}
