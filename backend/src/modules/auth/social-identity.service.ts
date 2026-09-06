import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/**
 * Ce qu'un fournisseur d'identité affirme, et ce qu'on accepte d'en croire.
 *
 * Apple et Google rendent tous deux un jeton d'identité : un JWT signé par
 * leurs clés publiques, publiées à une adresse connue. Le vérifier, ce n'est pas
 * le décoder — c'est contrôler la signature, l'émetteur, le DESTINATAIRE et la
 * date. Sauter le destinataire laisserait passer un jeton parfaitement valide
 * émis pour une autre application : quiconque possède un compte Apple pourrait
 * alors se présenter ici avec le jeton d'un tiers.
 *
 * La vérification passe par `jose` et non par un décodage maison : la confusion
 * d'algorithme (`alg: none`, ou HS256 signé avec la clé publique) est la faute
 * classique du JWT écrit à la main, et elle ne se voit pas aux tests.
 */

/** Les fournisseurs branchés. Facebook n'en est pas : voir plus bas. */
export type Fournisseur = 'apple' | 'google';

export interface IdentiteVerifiee {
  provider: Fournisseur;
  /** Le claim `sub` : stable, contrairement à l'adresse. */
  subject: string;
  email: string | null;
  /** Faux si le fournisseur ne garantit pas l'adresse — on ne rattache pas. */
  emailVerifie: boolean;
}

const APPLE_JWKS = 'https://appleid.apple.com/auth/keys';
const APPLE_ISS = 'https://appleid.apple.com';
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];

@Injectable()
export class SocialIdentityService {
  private readonly logger = new Logger(SocialIdentityService.name);

  /**
   * Les trousseaux, créés UNE fois.
   *
   * `createRemoteJWKSet` garde les clés en mémoire et ne les redemande qu'en
   * croisant un `kid` inconnu — c'est-à-dire lors d'une rotation. En recréer un
   * à chaque connexion irait chercher les clés d'Apple à chaque ouverture de
   * session, et ferait dépendre nos connexions de leur débit.
   */
  private readonly appleKeys = createRemoteJWKSet(new URL(APPLE_JWKS));
  private readonly googleKeys = createRemoteJWKSet(new URL(GOOGLE_JWKS));

  constructor(private readonly config: ConfigService) {}

  /** Les fournisseurs réellement utilisables — l'app n'affiche que ceux-là. */
  disponibles(): Fournisseur[] {
    const liste: Fournisseur[] = [];
    if (this.audiences('apple').length > 0) liste.push('apple');
    if (this.audiences('google').length > 0) liste.push('google');
    return liste;
  }

  async verifier(provider: Fournisseur, jeton: string): Promise<IdentiteVerifiee> {
    const audiences = this.audiences(provider);
    if (audiences.length === 0) {
      // Sans destinataire attendu, la vérification ne vérifierait rien. Mieux
      // vaut refuser que d'accepter un jeton dont on ne sait pas s'il nous est
      // destiné.
      this.logger.error(`Connexion ${provider} demandée sans identifiant client configuré.`);
      throw new UnauthorizedException('Ce mode de connexion n’est pas disponible.');
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(
        jeton,
        provider === 'apple' ? this.appleKeys : this.googleKeys,
        {
          issuer: provider === 'apple' ? APPLE_ISS : GOOGLE_ISS,
          audience: audiences,
          algorithms: ['RS256'],
          // Les horloges dérivent ; une demi-minute évite de refuser un jeton
          // qui vient d'être émis.
          clockTolerance: 30,
        },
      ));
    } catch (e: unknown) {
      this.logger.warn(`Jeton ${provider} refusé : ${(e as Error).message}`);
      throw new UnauthorizedException('Connexion refusée par le fournisseur.');
    }

    const subject = typeof payload.sub === 'string' ? payload.sub : '';
    if (!subject) throw new UnauthorizedException('Connexion refusée par le fournisseur.');

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    // Apple et Google écrivent parfois `"true"` et non `true` : le booléen passe
    // par une chaîne dans certains jetons. Comparer à `true` seul rejetterait
    // des adresses pourtant vérifiées.
    const brut = (payload as { email_verified?: unknown }).email_verified;
    const emailVerifie = brut === true || brut === 'true';

    return { provider, subject, email, emailVerifie };
  }

  /**
   * Les destinataires acceptés pour ce fournisseur.
   *
   * Une application iOS, une application Android et un site web ont chacun leur
   * identifiant client chez Google : le même compte se présente donc sous
   * plusieurs destinataires selon l'appareil. Chez Apple, c'est l'identifiant du
   * paquet en natif et le « Services ID » sur le web.
   */
  private audiences(provider: Fournisseur): string[] {
    const clefs =
      provider === 'apple'
        ? ['APPLE_CLIENT_IDS', 'APPLE_BUNDLE_ID']
        : ['GOOGLE_CLIENT_IDS'];

    return clefs
      .flatMap((clef) => (this.config.get<string>(clef) ?? '').split(','))
      .map((v) => v.trim())
      .filter(Boolean);
  }
}
