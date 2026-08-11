import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { FlaixWebhookService } from './flaix-webhook.service';

/**
 * FlaixWebhookController — entrée des événements métier de Flaix.
 *
 * Points d'attention (calqués sur le webhook Stripe existant) :
 *  - PAS de JwtAuthGuard : Flaix ne porte pas notre JWT. L'authentification se
 *    fait par SIGNATURE HMAC du corps brut.
 *  - Le corps doit rester un Buffer non parsé (cf. `main.ts`) : re-sérialiser
 *    le JSON changerait les octets et casserait la signature.
 *  - On répond 200 même sur doublon : Flaix doit cesser de réessayer un
 *    événement déjà traité.
 *
 *   POST /webhooks/flaix
 */
@Controller('webhooks/flaix')
export class FlaixWebhookController {
  constructor(private readonly flaixWebhook: FlaixWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: Request,
    @Headers('x-flaix-signature') signature: string,
  ): Promise<{ received: true; duplicate: boolean }> {
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody)) {
      // Symptôme classique d'un middleware JSON appliqué par erreur sur cette
      // route : sans octets bruts, la signature ne peut pas être vérifiée.
      throw new BadRequestException(
        'Corps brut attendu — vérifier la configuration du middleware',
      );
    }

    this.flaixWebhook.verifySignature(rawBody, signature);
    const payload = this.flaixWebhook.parsePayload(rawBody);
    const { duplicate } = await this.flaixWebhook.handle(payload);

    return { received: true, duplicate };
  }
}
