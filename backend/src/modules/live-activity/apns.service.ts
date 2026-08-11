import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, constants, type ClientHttp2Session } from 'http2';
import { createSign } from 'crypto';

/**
 * Résultat d'un envoi APNs, du point de vue de l'appelant.
 *
 * `tokenInvalid` est distingué d'une erreur générique : c'est le seul cas où il
 * faut cesser d'émettre vers ce token (activité terminée côté iOS, appareil
 * réinitialisé…). Une erreur réseau, elle, est temporaire et peut être rejouée.
 */
export interface ApnsSendResult {
  ok: boolean;
  status: number;
  /** Identifiant APNs de la requête — à citer en cas de support Apple. */
  apnsId?: string;
  reason?: string;
  /** true ⇒ le token est mort, ne plus l'utiliser. */
  tokenInvalid: boolean;
}

/** Événements APNs pour une Live Activity (champ `event` de l'enveloppe). */
export type LiveActivityEvent = 'update' | 'end';

const APNS_HOST_PROD = 'https://api.push.apple.com';
const APNS_HOST_SANDBOX = 'https://api.sandbox.push.apple.com';

/** Réponses APNs signifiant « ce token ne sert plus à rien ». */
const DEAD_TOKEN_REASONS = new Set([
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic',
  'ExpiredToken',
]);

/**
 * ApnsService — client APNs HTTP/2 dédié aux Live Activities.
 *
 * Pourquoi un client maison plutôt qu'Expo Push : l'API Expo
 * (`exp.host/--/api/v2/push/send`) ne sait pas mettre à jour une Live Activity.
 * Apple exige un appel DIRECT avec `apns-push-type: liveactivity` et le topic
 * `<bundleId>.push-type.liveactivity`. Les deux canaux coexistent : Expo pour
 * les notifications classiques, celui-ci pour les Live Activities.
 *
 * Sécurité : la clé privée `.p8` ne vit QUE côté serveur (variable
 * d'environnement). Elle n'est jamais renvoyée par une route ni journalisée.
 * Le client de l'app ne peut donc pas émettre lui-même vers APNs.
 *
 * Le jeton d'autorisation JWT (ES256) est mis en cache : Apple rejette un jeton
 * régénéré trop souvent (TooManyProviderTokenUpdates) et refuse un jeton de
 * plus d'une heure. On le renouvelle donc toutes les ~50 minutes.
 */
@Injectable()
export class ApnsService implements OnModuleDestroy {
  private readonly logger = new Logger(ApnsService.name);

  private session: ClientHttp2Session | null = null;
  private cachedJwt: { token: string; issuedAt: number } | null = null;

  /** Marge de renouvellement du JWT : Apple invalide au-delà de 60 min. */
  private static readonly JWT_TTL_MS = 50 * 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  /** Le programme est-il configurable ? (sinon on n'essaie même pas d'émettre) */
  isConfigured(): boolean {
    return Boolean(this.keyId && this.teamId && this.privateKey && this.bundleId);
  }

  // La configuration passe par `app.config.ts` (règle du projet : jamais de
  // lecture directe de process.env dans un service).
  private get keyId(): string {
    return this.config.get<string>('app.apns.keyId') ?? '';
  }
  private get teamId(): string {
    return this.config.get<string>('app.apns.teamId') ?? '';
  }
  private get bundleId(): string {
    return this.config.get<string>('app.apns.bundleId') ?? '';
  }
  /** Clé `.p8` au format PEM (sauts de ligne déjà restaurés par la config). */
  private get privateKey(): string {
    return this.config.get<string>('app.apns.privateKey') ?? '';
  }
  private get host(): string {
    return this.config.get<string>('app.apns.env') === 'production'
      ? APNS_HOST_PROD
      : APNS_HOST_SANDBOX;
  }

  // ─── JWT (ES256, sans dépendance externe) ───────────────────

  private base64Url(input: Buffer | string): string {
    return Buffer.from(input)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Construit (ou réutilise) le jeton d'autorisation APNs.
   *
   * ES256 impose une signature au format brut R||S : `dsaEncoding:
   * 'ieee-p1363'` produit exactement ça, là où le défaut (DER) serait rejeté
   * par Apple.
   */
  private getAuthToken(): string {
    const now = Date.now();
    if (this.cachedJwt && now - this.cachedJwt.issuedAt < ApnsService.JWT_TTL_MS) {
      return this.cachedJwt.token;
    }

    const header = this.base64Url(JSON.stringify({ alg: 'ES256', kid: this.keyId }));
    const claims = this.base64Url(
      JSON.stringify({ iss: this.teamId, iat: Math.floor(now / 1000) }),
    );
    const signingInput = `${header}.${claims}`;

    const signer = createSign('SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign({
      key: this.privateKey,
      dsaEncoding: 'ieee-p1363',
    });

    const token = `${signingInput}.${this.base64Url(signature)}`;
    this.cachedJwt = { token, issuedAt: now };
    return token;
  }

  // ─── Session HTTP/2 ─────────────────────────────────────────

  /**
   * Session HTTP/2 réutilisée entre les envois (Apple recommande de garder la
   * connexion ouverte plutôt que d'en rouvrir une par notification).
   */
  private getSession(): ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) {
      return this.session;
    }
    const session = connect(this.host);
    session.on('error', (err) => {
      this.logger.warn(`Session APNs en erreur: ${err.message}`);
      this.session = null;
    });
    session.on('close', () => {
      this.session = null;
    });
    this.session = session;
    return session;
  }

  onModuleDestroy(): void {
    this.session?.close();
    this.session = null;
  }

  // ─── Envoi ──────────────────────────────────────────────────

  /**
   * Pousse une mise à jour (ou la fin) d'une Live Activity.
   *
   * @param pushToken  token propre à l'activité (pas le token d'appareil)
   * @param event      'update' pendant la vie de l'activité, 'end' pour la clore
   * @param contentState état affiché (doit correspondre au ContentState Swift)
   * @param options.dismissalDate  quand retirer l'activité de l'écran (event 'end')
   * @param options.staleDate      au-delà, iOS grise l'activité comme périmée
   */
  async sendLiveActivityUpdate(
    pushToken: string,
    event: LiveActivityEvent,
    contentState: Record<string, unknown>,
    options: { dismissalDate?: Date; staleDate?: Date; priority?: 5 | 10 } = {},
  ): Promise<ApnsSendResult> {
    if (!this.isConfigured()) {
      // Non configuré ⇒ échec explicite mais silencieux : en développement, on
      // ne veut ni crash ni bruit à chaque transition de commande.
      return { ok: false, status: 0, reason: 'ApnsNotConfigured', tokenInvalid: false };
    }

    const payload: Record<string, unknown> = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event,
        'content-state': contentState,
        ...(options.staleDate
          ? { 'stale-date': Math.floor(options.staleDate.getTime() / 1000) }
          : {}),
        ...(event === 'end' && options.dismissalDate
          ? { 'dismissal-date': Math.floor(options.dismissalDate.getTime() / 1000) }
          : {}),
      },
    };

    const body = Buffer.from(JSON.stringify(payload));

    return new Promise<ApnsSendResult>((resolve) => {
      let session: ClientHttp2Session;
      try {
        session = this.getSession();
      } catch (err) {
        resolve({
          ok: false,
          status: 0,
          reason: err instanceof Error ? err.message : 'SessionError',
          tokenInvalid: false,
        });
        return;
      }

      const req = session.request({
        [constants.HTTP2_HEADER_METHOD]: 'POST',
        [constants.HTTP2_HEADER_PATH]: `/3/device/${pushToken}`,
        [constants.HTTP2_HEADER_AUTHORITY]: new URL(this.host).host,
        authorization: `bearer ${this.getAuthToken()}`,
        // Topic dédié aux Live Activities — un topic classique serait refusé.
        'apns-topic': `${this.bundleId}.push-type.liveactivity`,
        'apns-push-type': 'liveactivity',
        'apns-priority': String(options.priority ?? 10),
        [constants.HTTP2_HEADER_CONTENT_TYPE]: 'application/json',
        [constants.HTTP2_HEADER_CONTENT_LENGTH]: body.length,
      });

      let status = 0;
      let apnsId: string | undefined;
      let raw = '';

      req.setTimeout(10_000, () => req.destroy(new Error('Timeout APNs')));

      req.on('response', (headers) => {
        status = Number(headers[constants.HTTP2_HEADER_STATUS] ?? 0);
        apnsId = headers['apns-id'] as string | undefined;
      });
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      req.on('error', (err) => {
        resolve({ ok: false, status: 0, reason: err.message, tokenInvalid: false });
      });
      req.on('end', () => {
        if (status === 200) {
          resolve({ ok: true, status, apnsId, tokenInvalid: false });
          return;
        }
        let reason = raw;
        try {
          reason = (JSON.parse(raw) as { reason?: string }).reason ?? raw;
        } catch {
          /* corps non JSON — on garde le brut */
        }
        // 410 = token expiré ; sinon on se fie au motif renvoyé par Apple.
        const tokenInvalid = status === 410 || DEAD_TOKEN_REASONS.has(reason);
        resolve({ ok: false, status, apnsId, reason, tokenInvalid });
      });

      req.end(body);
    });
  }
}
