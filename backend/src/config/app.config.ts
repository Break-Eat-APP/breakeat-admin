import { registerAs } from '@nestjs/config';

/**
 * Centralised app configuration.
 * All environment variables are read here — never read process.env directly
 * in services or controllers. Inject ConfigService instead.
 */
export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /**
   * APP_ENV is used for Sentry environment tagging and other context-sensitive
   * features where NODE_ENV is too coarse (e.g. staging vs. production).
   * Values: production | staging | development
   */
  appEnv: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
  /**
   * LOG_LEVEL controls the minimum log level emitted by JsonLogger.
   * Values: verbose | debug | log | warn | error | fatal
   * Defaults to 'log' in production, 'debug' elsewhere.
   */
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'log' : 'debug'),
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigins: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3001'],


  /**
   * Secret d'amorçage du compte principal (POST /bootstrap/super-admin).
   *
   * Vide = route désactivée (404). N'ouvrir que le temps de reprendre la main,
   * puis RETIRER la variable : tant qu'elle est là, qui connaît le secret peut
   * se créer un accès tout-puissant.
   */
  bootstrapSecret: process.env.ADMIN_BOOTSTRAP_SECRET ?? '',

  database: {
    url: process.env.DATABASE_URL ?? '',
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'insecure-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    /**
     * La clé PUBLIABLE (`pk_test_…` / `pk_live_…`), servie à l'application.
     *
     * Elle est publique par construction — elle ne peut qu'ouvrir un paiement,
     * jamais le lire ni le modifier. Elle est servie par l'API plutôt que gelée
     * dans la build : elle suit ainsi le mode du serveur, et passer de test à
     * production ne demande pas de relivrer l'app.
     *
     * Absente, la feuille de paiement native ne peut pas s'ouvrir : le serveur
     * renvoie alors l'ancienne page hébergée, qui marche sans elle.
     */
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    apiVersion: process.env.STRIPE_API_VERSION ?? '2024-12-18.acacia',
    /**
     * Commission prelevee A LA SOURCE, en points de base (500 = 5 %).
     *
     * ZERO par defaut : Break Eat ne prend rien au moment du paiement et
     * facture sa part au club en fin de mois. L'integralite part donc sur le
     * compte Stripe du club.
     */
    platformFeeBps: parseInt(process.env.STRIPE_PLATFORM_FEE_BPS ?? '0', 10),
    /**
     * Ou Stripe renvoie le club apres son inscription.
     *
     * Les deux adresses menent a la page ENCAISSEMENT : c'est la que l'etat du
     * compte s'affiche, que « Verifier l'etat » se trouve, et que le diagnostic
     * compare les deux comptes en presence. Renvoyer ailleurs obligerait a
     * naviguer pour savoir si l'inscription a pris.
     *
     * `refreshUrl` est appelee quand le lien a usage unique a expire : la page
     * porte le bouton qui en produit un nouveau.
     */
    connect: {
      returnUrl:
        process.env.STRIPE_CONNECT_RETURN_URL ?? 'http://localhost:3001/encaissement',
      refreshUrl:
        process.env.STRIPE_CONNECT_REFRESH_URL ?? 'http://localhost:3001/encaissement',
    },
  },

  /**
   * PHASE 25 — « l'ardoise » : composer a plusieurs, chacun regle sa part.
   */
  split: {
    /**
     * Interrupteur. A `false`, le bouton « Partager l'addition » disparait de
     * l'app et les routes refusent : le parcours normal, lui, ne change pas
     * d'une ligne. C'est ce qui permet de retirer la fonction sans deployer.
     */
    enabled: process.env.GROUP_SPLIT_ENABLED === 'true',
    /**
     * Adresse publique de l'app web — c'est la que les convives ouvrent leur
     * part, sans rien installer. Sert aussi de retour apres paiement Stripe.
     */
    webUrl: (process.env.PUBLIC_WEB_URL ?? 'http://localhost:8081').replace(/\/+$/, ''),
  },

  /**
   * L'ENVOI DE COURRIEL — pour la récupération de mot de passe.
   *
   * Le projet n'avait AUCUN moyen d'envoyer un courriel : ni SMTP, ni
   * fournisseur, ni dépendance. Le lien « Mot de passe oublié ? » affichait
   * « Réinitialisation du mot de passe à venir », et un client qui perdait son
   * mot de passe perdait son compte.
   *
   * ── DEUX FOURNISSEURS, PARCE QU'UN SUFFIT ──────────────────────
   *
   * `resend` et `brevo` s'appellent tous deux par un seul POST, avec `fetch`,
   * qui est dans Node. Aucune dépendance ajoutée — et c'est un choix : chaque
   * paquet de plus est une montée à surveiller et un risque de build.
   *
   * ── TANT QUE RIEN N'EST CONFIGURÉ, LA FONCTION N'EXISTE PAS ────
   *
   * Sans clé, `/auth/password-reset/available` répond `false` et l'application
   * n'offre pas le parcours. C'est voulu : promettre « vérifie tes courriels »
   * sans pouvoir en envoyer est pire que le message d'attente d'avant. Rien
   * n'est à moitié livré — c'est éteint, et ça se voit.
   */
  courriel: {
    /** `resend` | `brevo` | '' (éteint). */
    fournisseur: (process.env.MAIL_PROVIDER ?? '').trim().toLowerCase(),
    cle: process.env.MAIL_API_KEY ?? '',
    /**
     * L'expéditeur. Son domaine doit être VÉRIFIÉ chez le fournisseur, sinon
     * le message part en indésirable ou ne part pas du tout — et c'est la
     * première chose qui se remarque quand le parcours ne marche pas.
     */
    expediteur: process.env.MAIL_FROM ?? '',
    /** Ce que le client lit comme nom d'expéditeur. */
    // « BreakEat » en un mot depuis le 31/10 : c'est le nom sous l'icône, et
    // celui que le client lit dans la colonne « De » de sa boîte. Un expéditeur
    // qui ne ressemble pas à l'app qu'il vient d'utiliser fait ouvrir le
    // dossier des indésirables — c'est là qu'il range ce qu'il ne reconnaît pas.
    expediteurNom: process.env.MAIL_FROM_NAME ?? 'BreakEat',
  },

  /**
   * Adresse publique de CETTE API, telle que Stripe doit la rappeler.
   *
   * Elle n'est pas deductible de `PUBLIC_WEB_URL` : le site vit sur Vercel,
   * l'API sur Railway. Sans elle, `success_url` pointerait sur `localhost` et
   * le client resterait bloque sur la page de paiement apres avoir paye.
   * `verifierConfigurationProduction()` le signale au demarrage.
   */
  publicApiUrl: (process.env.PUBLIC_API_URL ?? 'http://localhost:3000/api/v1').replace(
    /\/+$/,
    '',
  ),


  sentry: {
    dsn: process.env.SENTRY_DSN_BACKEND ?? '',
  },

  storage: {
    endpoint: process.env.STORAGE_ENDPOINT ?? '',
    accessKey: process.env.STORAGE_ACCESS_KEY ?? '',
    secretKey: process.env.STORAGE_SECRET_KEY ?? '',
    bucket: process.env.STORAGE_BUCKET ?? 'breakeat-media',
    region: process.env.STORAGE_REGION ?? 'eu-west-1',
  },

  flaix: {
    apiUrl: process.env.FLAIX_API_URL ?? '',
    apiKey: process.env.FLAIX_API_KEY ?? '',
    /**
     * Secret partagé signant les webhooks Flaix → Break Eat (HMAC-SHA256 du
     * corps brut). Vide = webhook refusé : un événement non signé ne doit
     * jamais être accepté « par défaut » faute de configuration.
     */
    webhookSecret: process.env.FLAIX_WEBHOOK_SECRET ?? '',
  },

  /**
   * APNs — mises à jour des Live Activities (phase 21).
   *
   * Canal DISTINCT d'Expo Push : Apple exige un appel direct avec le topic
   * `<bundleId>.push-type.liveactivity`. La clé privée reste strictement
   * serveur ; elle n'est jamais exposée à l'application.
   * Non renseigné ⇒ aucun envoi n'est tenté (pas de crash en local).
   */
  apns: {
    keyId: process.env.APNS_KEY_ID ?? '',
    teamId: process.env.APNS_TEAM_ID ?? '',
    bundleId: process.env.APNS_BUNDLE_ID ?? '',
    /** Contenu du .p8 ; les sauts de ligne échappés `\n` sont restaurés. */
    privateKey: (process.env.APNS_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    /** 'production' ou 'sandbox' (build de développement). */
    env: process.env.APNS_ENV ?? 'sandbox',
  },
}));
