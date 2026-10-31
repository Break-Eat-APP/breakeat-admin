import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { CourrielService } from '../courriel/courriel.service';

/**
 * « MOT DE PASSE OUBLIÉ » — le parcours qui n'existait pas.
 *
 * Le lien de l'écran de connexion affichait « Réinitialisation du mot de passe
 * à venir ». Un client qui perdait son mot de passe perdait son compte : son
 * historique, ses points de fidélité, ses lieux favoris. Son seul recours
 * était de s'inscrire avec une autre adresse.
 *
 * ── CE QUE LA RÉPONSE NE DIT JAMAIS ────────────────────────────
 *
 * `demander()` rend LE MÊME CORPS ET LE MÊME CODE HTTP que l'adresse existe ou
 * non. Sans cela, la route devient un annuaire : on y teste une liste
 * d'adresses pour savoir lesquelles ont un compte chez nous — ce qui se
 * revend, et ce qui renseigne un hameçonnage ciblé.
 *
 * LE TEMPS DE RÉPONSE, LUI, N'EST PAS ÉGALISÉ, et il ne faut pas le croire :
 * une adresse connue coûte une écriture et un appel au fournisseur de
 * courriel, une adresse inconnue ne coûte qu'une lecture. L'écart est
 * mesurable en principe. On ne le masque pas, pour deux raisons : la latence
 * d'un tiers varie bien plus que cet écart, et une temporisation artificielle
 * tiendrait des requêtes ouvertes sans rien garantir. Ce qui ferme vraiment
 * l'annuaire est la limite de débit par adresse — huit par quart d'heure.
 *
 * C'est aussi pour ça qu'un compte sans mot de passe (créé par Apple ou
 * Google) reçoit la même réponse neutre, et un courriel qui lui explique par
 * où se connecter. Répondre « ce compte n'a pas de mot de passe » révélerait
 * qu'il existe.
 *
 * ── TROIS BARRIÈRES, PARCE QU'UNE SEULE TOMBE ──────────────────
 *
 *  1. LE NOMBRE D'ESSAIS SUR LE CODE (`attempts`), en base. Six chiffres ne
 *     résistent pas à un million de tentatives, mais ne survivent pas à cinq.
 *  2. LA DURÉE DE VIE : quinze minutes. Un code lu dans une boîte ouverte
 *     trois jours plus tard ne vaut plus rien.
 *  3. LA LIMITE DE DÉBIT par adresse e-mail, posée en amont dans
 *     `common/securite/limitation.ts` — huit requêtes par quart d'heure. Elle
 *     vit dans Redis, qui peut être absent : c'est pourquoi elle est la
 *     TROISIÈME barrière et non la seule.
 *
 * ── UN SEUL CODE VIVANT À LA FOIS ──────────────────────────────
 *
 * Une nouvelle demande annule les précédentes. Sinon, demander dix fois
 * donnerait dix codes valides simultanément, et multiplierait par dix les
 * chances d'en deviner un.
 */

/** Quinze minutes : le temps d'aller chercher un courriel, pas celui d'oublier. */
const VALIDITE_MS = 15 * 60 * 1000;

/** Au-delà, le code meurt. Cinq essais pour six chiffres, c'est 1 sur 200 000. */
const ESSAIS_MAX = 5;

/** Le mot de passe neuf doit valoir celui qu'il remplace. */
const LONGUEUR_MOT_DE_PASSE_MIN = 8;

/**
 * SIX CHIFFRES, tirés par `randomInt`.
 *
 * `randomInt` puise dans le générateur cryptographique du système ;
 * `Math.random` est prédictible et n'a rien à faire ici. Le code est formaté
 * sur six positions : un tirage de 42 doit donner « 000042 », sinon la
 * longueur du code trahit sa valeur.
 */
function genererCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Le code, haché. On ne stocke jamais le code lui-même. */
function hacher(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Comparaison à TEMPS CONSTANT.
 *
 * Un `===` sur des chaînes s'arrête au premier caractère différent : le temps
 * de réponse révèle alors combien de caractères du début sont justes, et six
 * chiffres se devinent un par un. Les deux empreintes ont la même longueur
 * (SHA-256 en hexadécimal), donc la comparaison est toujours définie.
 */
function memeEmpreinte(a: string, b: string): boolean {
  const ta = Buffer.from(a, 'utf8');
  const tb = Buffer.from(b, 'utf8');
  if (ta.length !== tb.length) return false;
  return timingSafeEqual(ta, tb);
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly courriel: CourrielService,
  ) {}

  /**
   * Le parcours est-il offert ?
   *
   * L'application le demande avant d'afficher « Mot de passe oublié ? ». Sans
   * fournisseur de courriel configuré, la réponse est `false` et le lien garde
   * son message d'attente — plutôt que de promettre un courriel qui ne
   * partira pas.
   */
  estDisponible(): boolean {
    return this.courriel.estConfigure();
  }

  /**
   * Une demande de réinitialisation.
   *
   * NE DIT RIEN de ce qu'elle a trouvé. Le retour est le même pour une adresse
   * inconnue, un compte archivé, un compte Apple sans mot de passe et un envoi
   * qui échoue.
   */
  async demander(emailBrut: string): Promise<void> {
    if (!this.courriel.estConfigure()) {
      // Ici on PARLE, parce que ce n'est pas une information sur un compte :
      // c'est l'état de notre propre installation. Et le taire ferait croire
      // à un courriel envoyé.
      throw new ServiceUnavailableException(
        'La réinitialisation du mot de passe n’est pas disponible pour le moment.',
      );
    }

    const email = emailBrut.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, isActive: true, displayName: true },
    });

    if (!user || !user.isActive) {
      // RIEN. Pas de courriel, pas d'erreur, pas de trace nominative dans le
      // journal : une adresse inconnue ne doit pas se distinguer d'une
      // adresse connue, y compris pour qui lit les journaux.
      this.logger.log('Demande de réinitialisation sur une adresse sans compte actif');
      return;
    }

    /**
     * UN COMPTE SANS MOT DE PASSE — créé par Apple ou Google.
     *
     * Lui poser un mot de passe par ce chemin serait une reprise de compte :
     * il suffirait d'avoir accès à la boîte pour transformer une connexion
     * Apple en connexion par mot de passe. On envoie donc un courriel qui
     * explique par où se connecter, et la réponse de la route reste la même.
     */
    if (!user.passwordHash) {
      await this.envoyerSansRien(user.email);
      return;
    }

    // Un seul code vivant : la demande d'avant ne doit plus servir.
    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = genererCode();
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        codeHash: hacher(code),
        expiresAt: new Date(Date.now() + VALIDITE_MS),
      },
    });

    try {
      await this.courriel.envoyer({
        a: user.email,
        sujet: 'Break Eat — code de réinitialisation',
        texte: [
          `Voici le code pour choisir un nouveau mot de passe :`,
          ``,
          `    ${code}`,
          ``,
          `Il est valable 15 minutes, et ne sert qu'une fois.`,
          ``,
          `Si vous n'avez rien demandé, ignorez ce message : votre mot de passe`,
          `actuel reste valable et personne n'a pu y accéder.`,
          ``,
          `— Break Eat`,
        ].join('\n'),
      });
    } catch {
      /**
       * L'ÉCHEC D'ENVOI NE REMONTE PAS AU CLIENT.
       *
       * Le service de courriel a déjà journalisé la cause. Faire échouer la
       * route ici rendrait la réponse DIFFÉRENTE selon que l'adresse existe
       * ou non — un refus pour une adresse connue, un succès pour une adresse
       * inconnue — et offrirait exactement l'annuaire qu'on refuse de donner.
       *
       * Le code posé en base expirera seul.
       */
    }
  }

  /**
   * Le client a reçu son code et choisit un nouveau mot de passe.
   *
   * Ici, on PARLE : le client est en train de taper un code qu'il croit avoir,
   * et un refus muet le laisserait réessayer sans comprendre. Mais on ne
   * distingue jamais « code faux » de « adresse inconnue » — sinon la route
   * redevient un annuaire.
   */
  async confirmer(entree: { email: string; code: string; nouveauMotDePasse: string }): Promise<void> {
    const email = entree.email.trim().toLowerCase();
    const code = entree.code.trim();

    if (entree.nouveauMotDePasse.length < LONGUEUR_MOT_DE_PASSE_MIN) {
      throw new BadRequestException(
        `Le mot de passe doit contenir au moins ${LONGUEUR_MOT_DE_PASSE_MIN} caractères.`,
      );
    }

    /** Le seul message de refus. Un code faux et une adresse inconnue sont indistinguables. */
    const refus = () =>
      new BadRequestException('Code invalide ou expiré. Demandez-en un nouveau.');

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) throw refus();

    const demande = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!demande) throw refus();

    if (demande.expiresAt.getTime() <= Date.now() || demande.attempts >= ESSAIS_MAX) {
      // On le ferme : un code expiré ou épuisé ne doit pas rester lisible par
      // la requête suivante, ne serait-ce que pour compter un essai de plus.
      await this.prisma.passwordReset.update({
        where: { id: demande.id },
        data: { usedAt: new Date() },
      });
      throw refus();
    }

    if (!memeEmpreinte(demande.codeHash, hacher(code))) {
      /**
       * L'ESSAI RATÉ EST COMPTÉ EN BASE, par un incrément atomique.
       *
       * `attempts: demande.attempts + 1` écrirait un nombre calculé à partir
       * d'une lecture : cinq requêtes simultanées liraient toutes `0` et
       * écriraient toutes `1`. Le compteur ne monterait jamais, et six
       * chiffres finiraient par tomber.
       */
      await this.prisma.passwordReset.update({
        where: { id: demande.id },
        data: { attempts: { increment: 1 } },
      });
      throw refus();
    }

    const passwordHash = await argon2.hash(entree.nouveauMotDePasse);

    /**
     * TOUT OU RIEN, et les sessions tombent avec.
     *
     * Quelqu'un reprend un compte parce qu'il en a perdu l'accès — souvent
     * parce qu'un autre l'a pris. Laisser vivre les jetons de renouvellement
     * existants laisserait cet autre connecté, avec un mot de passe changé
     * qu'il n'a pas besoin de connaître pour continuer.
     *
     * Et le code est marqué utilisé DANS la même transaction : si la mise à
     * jour du mot de passe échouait après, le code aurait été consommé pour
     * rien et le client serait bloqué.
     */
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.passwordReset.update({
        where: { id: demande.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);

    this.logger.log(`Mot de passe réinitialisé sur le compte ${user.id}`);
  }

  /**
   * Le courriel envoyé à un compte qui n'a PAS de mot de passe.
   *
   * Il ne porte aucun code : il n'y a rien à réinitialiser. Il dit par où se
   * connecter, ce qui est la seule chose utile — et il part pour que la
   * réponse de la route reste indistinguable des autres cas.
   */
  private async envoyerSansRien(adresse: string): Promise<void> {
    try {
      await this.courriel.envoyer({
        a: adresse,
        sujet: 'Break Eat — votre connexion',
        texte: [
          `Vous avez demandé à réinitialiser votre mot de passe.`,
          ``,
          `Ce compte n'en a pas : il a été créé avec « Continuer avec Apple » ou`,
          `« Continuer avec Google ». Utilisez le même bouton dans l'application`,
          `pour vous reconnecter — il n'y a rien à retenir.`,
          ``,
          `Si vous n'avez rien demandé, ignorez ce message.`,
          ``,
          `— Break Eat`,
        ].join('\n'),
      });
    } catch {
      // Déjà journalisé par le service de courriel.
    }
  }
}
