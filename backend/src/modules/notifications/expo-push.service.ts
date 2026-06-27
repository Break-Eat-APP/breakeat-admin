import { Injectable, Logger } from '@nestjs/common';

/**
 * ExpoPushService — envoi de notifications push via le service Expo.
 *
 * Endpoint : POST https://exp.host/--/api/v2/push/send
 * Doc : https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Pas de SDK : on appelle l'API HTTP directement (batches de 100 messages).
 * Les jetons doivent être au format `ExponentPushToken[xxxx]` ou `ExpoPushToken[xxxx]`.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

export interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
}

export interface ExpoSendResult {
  sent: number;
  failed: number;
  /** Jetons rejetés par Expo (DeviceNotRegistered…) — à purger côté appelant. */
  invalidTokens: string[];
}

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  /** Format de jeton Expo valide. */
  static isExpoPushToken(token: string): boolean {
    return /^Expo(nent)?PushToken\[.+\]$/.test(token);
  }

  /**
   * Envoie une liste de messages push. Filtre les jetons invalides, découpe en
   * batches de 100, agrège les résultats. Ne jette jamais : renvoie un résumé.
   */
  async send(messages: ExpoPushMessage[]): Promise<ExpoSendResult> {
    const valid = messages.filter((m) => ExpoPushService.isExpoPushToken(m.to));
    const result: ExpoSendResult = {
      sent: 0,
      failed: messages.length - valid.length,
      invalidTokens: messages.filter((m) => !ExpoPushService.isExpoPushToken(m.to)).map((m) => m.to),
    };
    if (valid.length === 0) return result;

    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify(batch.map((m) => ({ sound: 'default', ...m }))),
        });

        if (!res.ok) {
          this.logger.warn(`Expo push HTTP ${res.status} for batch of ${batch.length}`);
          result.failed += batch.length;
          continue;
        }

        const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
        const tickets = json.data ?? [];
        tickets.forEach((ticket, idx) => {
          if (ticket.status === 'ok') {
            result.sent += 1;
          } else {
            result.failed += 1;
            if (ticket.details?.error === 'DeviceNotRegistered') {
              const tok = batch[idx]?.to;
              if (tok) result.invalidTokens.push(tok);
            }
          }
        });
      } catch (err) {
        this.logger.error(`Expo push batch failed: ${err instanceof Error ? err.message : err}`);
        result.failed += batch.length;
      }
    }

    this.logger.log(`Expo push: ${result.sent} envoyés, ${result.failed} échecs, ${result.invalidTokens.length} jetons invalides`);
    return result;
  }
}
