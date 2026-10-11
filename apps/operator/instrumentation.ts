/**
 * Next.js instrumentation hook — operator app (Phase 10)
 *
 * Next.js calls this file once per runtime (node / edge / browser).
 * We use it to initialise Sentry on each runtime with the correct config.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * LES ERREURS DE RENDU SERVEUR REMONTENT, ELLES AUSSI.
 *
 * Sans ce crochet, Next.js avale les erreurs survenues pendant le rendu côté
 * serveur : elles s'affichent dans les journaux de la plateforme et n'arrivent
 * JAMAIS dans Sentry. Autrement dit, la seule catégorie d'erreur qu'on ne voit
 * pas est celle qui casse une page entière — et le build le signalait à chaque
 * passage (« missing onRequestError hook »).
 *
 * `captureRequestError` est fourni par le SDK : on ne réécrit pas la mise en
 * forme du contexte de requête, elle change avec les versions de Next.
 */
export const onRequestError = Sentry.captureRequestError;
