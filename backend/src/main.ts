import './instrument'; // Sentry must be imported first
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type LoggerService } from '@nestjs/common';
import { json, raw } from 'express';
import helmet from 'helmet';
import { optionsHelmet } from './common/securite/entetes';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { estEnLigne, secretJwtFaible } from './common/helpers/est-en-ligne';
import { originesCors } from './common/helpers/origines-cors';
import { AdaptateurRedis } from './modules/realtime/adaptateur-redis';
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

  // ─── Derrière un proxy : lire la VRAIE adresse du client ───
  //
  // Railway place l'API derrière son routeur. Sans ce réglage, Express voit
  // l'adresse du proxy pour TOUT LE MONDE : la limitation de débit compterait
  // alors les requêtes de tous les clients dans un seul compteur, et le premier
  // client un peu actif bloquerait tous les autres. C'est la faute classique,
  // et elle transforme une protection en panne.
  app.set('trust proxy', 1);

  // En-têtes de sécurité — la politique est écrite et commentée dans
  // `common/securite/entetes.ts`, et tenue par des tests.
  app.use(helmet(optionsHelmet));

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
  // La MEME lecture que la passerelle WebSocket — voir `origines-cors.ts`.
  // Les deux divergeaient : un espace apres une virgule autorisait une origine
  // en HTTP et la refusait en temps reel.
  const corsOrigins = originesCors();

  // Tracé au démarrage : la seule façon de vérifier ce que le serveur a
  // RÉELLEMENT retenu, sans avoir à deviner depuis un échec côté navigateur.
  logger.log(`CORS — origines autorisées : ${corsOrigins.join(' | ') || '(aucune)'}`);

  app.enableCors({ origin: corsOrigins, credentials: true });

  // Global prefix — /health, /ready et /webhooks restent a la racine.
  //
  // /webhooks/stripe doit rester stable pour Stripe ; /health est la preuve
  // de vie interrogee par Railway ; /ready dit si le conteneur peut
  // REELLEMENT prendre une commande (base joignable, migrations finies).
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready', 'webhooks/(.*)'] });

  verifierConfigurationProduction(logger);

  /**
   * LE TEMPS RÉEL AVANT D'ÉCOUTER.
   *
   * Socket.IO garde ses salons en mémoire : avec deux instances, une commande
   * encaissée par l'une n'atteint pas le comptoir branché sur l'autre. Posé
   * ici parce que l'adaptateur doit exister AVANT `listen` — après, le serveur
   * Socket.IO est déjà construit.
   *
   * `REDIS_URL` existait dans la configuration depuis toujours sans qu'aucune
   * ligne ne la lise. Elle sert enfin.
   */
  const adaptateur = new AdaptateurRedis(app);
  await adaptateur.connecter(process.env.REDIS_URL);
  app.useWebSocketAdapter(adaptateur);

  // Un arrêt propre rend ses connexions Redis : sans cela, un redéploiement
  // laisse des clients suspendus le temps de leur expiration.
  app.enableShutdownHooks();
  process.once('beforeExit', () => void adaptateur.fermer());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`BREAK EAT backend running on port ${port}`);
  logger.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  logger.log(`Health check: GET http://localhost:${port}/health`);
  logger.log(`Pret a servir: GET http://localhost:${port}/ready`);
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
 *   • `STRIPE_PUBLISHABLE_KEY` absente ⇒ l'app ne peut pas ouvrir sa feuille de
 *     paiement : le client repart sur la page hébergée, et sort de
 *     l'application le temps de régler ;
 *   • `STRIPE_*` absent ⇒ plus aucun encaissement, donc plus aucune commande.
 *
 * Aucune de ces pannes ne se signale d'elle-même. Ce rapport les rend visibles
 * dans les journaux, au démarrage, avant que quiconque ne commande.
 *
 * ON N'INTERROMPT PAS LE DÉMARRAGE — SAUF POUR LE SECRET JWT.
 *
 * Pour tout le reste, l'arbitrage tient : une API debout mais mal configurée
 * sert encore l'app mobile ; une API refusant de démarrer ne sert plus
 * personne. Une clé Stripe absente empêche d'encaisser, elle n'ouvre rien.
 *
 * `JWT_SECRET` est d'une autre nature. Avec le repli de développement — une
 * chaîne publique, lisible dans ce dépôt — **n'importe qui forge un jeton**,
 * y compris celui d'un SUPER_ADMIN, qui franchit toutes les gardes
 * d'organisation. L'API ne servirait pas « mal » : elle servirait l'attaquant
 * aussi bien que le client. Là, ne pas démarrer est le moindre mal.
 *
 * Le test ne porte PAS sur `NODE_ENV` : il vaut `staging` sur les deux
 * services Railway (constaté le 26/10/2026), donc tout ce qui en dépendait
 * était inactif en ligne. Voir `estEnLigne()`.
 */
function verifierConfigurationProduction(logger: LoggerService): void {
  const enProduction = estEnLigne();

  // ─── Le seul motif de refus ───────────────────────────────────
  const faiblesse = secretJwtFaible(process.env.JWT_SECRET);
  if (enProduction && faiblesse) {
    logger.error(
      `JWT_SECRET ${faiblesse}. Démarrage REFUSÉ : avec ce secret, n'importe qui ` +
        `forge un jeton valide, y compris celui d'un administrateur. ` +
        `Poser une chaîne aléatoire d'au moins 32 caractères dans les variables ` +
        `du service, puis redéployer.`,
    );
    process.exit(1);
  }

  const requises: Array<[string, string | undefined]> = [
    ['DATABASE_URL', process.env.DATABASE_URL],
    ['JWT_SECRET', process.env.JWT_SECRET],
    ['CORS_ORIGINS', process.env.CORS_ORIGINS],
    ['PUBLIC_WEB_URL', process.env.PUBLIC_WEB_URL],
    ['PUBLIC_API_URL', process.env.PUBLIC_API_URL],
    ['STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY],
    ['STRIPE_PUBLISHABLE_KEY', process.env.STRIPE_PUBLISHABLE_KEY],
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
  console.error('[Break Eat] Promesse rejetée sans gestionnaire :', raison);
});

void bootstrap();
