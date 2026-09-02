import './instrument'; // Sentry must be imported first
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type LoggerService } from '@nestjs/common';
import { json, raw } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JsonLogger } from './logger/json-logger';

async function bootstrap(): Promise<void> {
  // Use structured JSON logger in production; NestJS default in other envs.
  // JsonLogger falls back to colour output automatically when NODE_ENV !== production.
  const appLogger = new JsonLogger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: appLogger,
    // Disable Nest's default body parser — we wire express middleware below
    // so the Stripe webhook gets a raw Buffer and the rest of the API gets JSON.
    bodyParser: false,
  });

  // Re-use the same logger instance for post-bootstrap messages.
  const logger = appLogger;

  // Stripe webhook MUST receive raw bytes for signature verification.
  // Must be registered BEFORE the generic JSON parser.
  app.use('/webhooks/stripe', raw({ type: 'application/json' }));
  // Phase 21 — même contrainte pour Flaix : la signature HMAC porte sur les
  // octets bruts, un JSON re-sérialisé ne correspondrait plus.
  app.use('/webhooks/flaix', raw({ type: 'application/json' }));
  app.use(json({ limit: '1mb' }));

  // Toute exception imprevue est journalisee avec sa pile et une reference
  // courte, renvoyee au client. Hors production, le message reel accompagne la
  // reference : sur un environnement d'essai, cacher la cause a celui qui teste
  // n'allonge que la boucle.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe — active for all routes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — origines pilotées par l'environnement. Défaut : les 3 dashboards
  // de développement (admin 3001, opérateur 3002, back office 3003).
  //
  // Le découpage NETTOIE chaque entrée. `split(',')` seul laissait passer
  // l'espace qu'on tape naturellement après une virgule : « a.com, b.com »
  // donnait « ␣b.com », qui ne correspondait à rien. Le slash final est retiré
  // pour la même raison — une origine HTTP n'en porte jamais.
  //
  // Ce n'est pas de la précaution gratuite : une entrée malformée bloque
  // SILENCIEUSEMENT toute une app (le navigateur refuse, le serveur ne dit
  // rien), et c'est arrivé deux fois sur ce projet.
  const corsOrigins = (
    process.env.CORS_ORIGINS?.split(',') ?? [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
    ]
  )
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  // Tracé au démarrage : la seule façon de vérifier ce que le serveur a
  // RÉELLEMENT retenu, sans avoir à deviner depuis un échec côté navigateur.
  logger.log(`CORS — origines autorisées : ${corsOrigins.join(' | ') || '(aucune)'}`);

  app.enableCors({ origin: corsOrigins, credentials: true });

  // Global prefix — /health and /webhooks are excluded so they remain at their root paths.
  // /webhooks/stripe must stay stable for Stripe; /health for Docker/monitoring.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'webhooks/(.*)'] });

  verifierConfigurationProduction(logger);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`BREAK EAT backend running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  logger.log(`Health check: GET http://localhost:${port}/health`);
  logger.log(`Stripe hook:  POST http://localhost:${port}/webhooks/stripe`);
  logger.log(`API base:     http://localhost:${port}/api/v1`);
}

/**
 * Rapport de configuration au démarrage.
 *
 * Chaque variable manquante ici retombe sur une valeur de DÉVELOPPEMENT, et
 * chacune de ces valeurs échoue en silence une fois en ligne :
 *
 *   • `CORS_ORIGINS` absent ⇒ seuls les localhost sont autorisés, et TOUS les
 *     dashboards affichent « identifiants incorrects » — c'est arrivé deux fois
 *     sur ce projet, et on a cherché du côté des mots de passe ;
 *   • `PUBLIC_WEB_URL` absent ⇒ après avoir payé, le client est renvoyé vers
 *     `localhost` : il voit une page morte alors que son argent est parti ;
 *   • `PUBLIC_API_URL` absent ⇒ Stripe rappelle `localhost` au retour du
 *     paiement : l'app native ne revient jamais au premier plan, et le client
 *     reste sur la page de Stripe sans savoir si sa commande existe ;
 *   • `STRIPE_*` absent ⇒ plus aucun encaissement, donc plus aucune commande.
 *
 * Aucune de ces pannes ne se signale d'elle-même. Ce rapport les rend visibles
 * dans les journaux, au démarrage, avant que quiconque ne commande.
 *
 * On n'interrompt PAS le démarrage : une API debout mais mal configurée sert
 * encore l'app mobile ; une API refusant de démarrer ne sert plus personne.
 */
function verifierConfigurationProduction(logger: LoggerService): void {
  const enProduction = process.env.NODE_ENV === 'production';

  const requises: Array<[string, string | undefined]> = [
    ['DATABASE_URL', process.env.DATABASE_URL],
    ['JWT_SECRET', process.env.JWT_SECRET],
    ['CORS_ORIGINS', process.env.CORS_ORIGINS],
    ['PUBLIC_WEB_URL', process.env.PUBLIC_WEB_URL],
    ['PUBLIC_API_URL', process.env.PUBLIC_API_URL],
    ['STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY],
    ['STRIPE_WEBHOOK_SECRET', process.env.STRIPE_WEBHOOK_SECRET],
    ['STRIPE_CONNECT_RETURN_URL', process.env.STRIPE_CONNECT_RETURN_URL],
    ['STRIPE_CONNECT_REFRESH_URL', process.env.STRIPE_CONNECT_REFRESH_URL],
  ];

  const absentes = requises.filter(([, valeur]) => !valeur).map(([nom]) => nom);
  const enLocal = requises
    .filter(([, valeur]) => valeur?.includes('localhost') || valeur?.includes('127.0.0.1'))
    .map(([nom]) => nom);

  if (absentes.length > 0) {
    const message = `Variables absentes (repli de développement actif) : ${absentes.join(', ')}`;
    if (enProduction) logger.error(message);
    else logger.warn(message);
  }
  if (enLocal.length > 0) {
    logger.error(`Variables pointant sur la machine locale : ${enLocal.join(', ')}`);
  }
  if (absentes.length === 0 && enLocal.length === 0) {
    logger.log('Configuration : toutes les variables de production sont renseignées.');
  }

  // Le mode Stripe se lit sur la clé, et lui seul décide si l'argent est réel.
  const cleStripe = process.env.STRIPE_SECRET_KEY ?? '';
  if (cleStripe.startsWith('sk_test')) {
    logger.warn('Stripe en mode TEST — aucun paiement réel ne sera encaissé.');
  } else if (cleStripe.startsWith('sk_live')) {
    logger.log('Stripe en mode RÉEL — les paiements sont encaissés.');
  }
}

/**
 * Filet de dernier recours.
 *
 * Depuis Node 15, une promesse rejetée sans gestionnaire ARRÊTE le processus.
 * Un oubli de `.catch` sur un appel accessoire — une notification, une trace —
 * suffirait donc à couper l'API en plein service, alors que la commande, elle,
 * s'était parfaitement déroulée.
 *
 * On journalise et on reste debout. Ce filet ne dispense pas d'attraper à la
 * source : il évite qu'un oubli ne coûte une soirée.
 */
process.on('unhandledRejection', (raison) => {
  // eslint-disable-next-line no-console
  console.error('[Break Eat] Promesse rejetée sans gestionnaire :', raison);
});

void bootstrap();
