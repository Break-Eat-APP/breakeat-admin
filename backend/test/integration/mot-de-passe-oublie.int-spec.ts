import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../src/database/prisma.service';
import { PasswordResetService } from '../../src/modules/auth/password-reset.service';
import type { CourrielService } from '../../src/modules/courriel/courriel.service';

/**
 * « MOT DE PASSE OUBLIÉ » — le parcours qui n'existait pas.
 *
 * Le lien de l'écran de connexion affichait « Réinitialisation du mot de passe
 * à venir ». Un client qui perdait son mot de passe perdait son compte.
 *
 * ── POURQUOI D'INTÉGRATION ──────────────────────────────────────
 *
 * Presque tout ce qui compte ici est une propriété de la BASE :
 *
 *   · le code est-il bien HACHÉ dans la colonne, et non en clair ?
 *   · l'usage unique tient-il quand on rejoue le même code ?
 *   · le compteur d'essais monte-t-il vraiment, et par un incrément atomique ?
 *   · les jetons de renouvellement tombent-ils DANS la même transaction que le
 *     mot de passe ?
 *
 * Une doublure de Prisma répondrait oui à tout, puisque c'est elle qu'on aurait
 * programmée. Le seul faux témoin accepté ici est l'ENVOI DE COURRIEL : il
 * appelle un tiers par le réseau, et c'est par lui qu'on récupère le code —
 * exactement comme le ferait le client en ouvrant sa boîte.
 *
 * S'ignore sans `DATABASE_URL_TEST`.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

/** La boîte aux lettres d'essai : elle garde ce qui part. */
function boiteAuxLettres(configure = true) {
  const envoyes: Array<{ a: string; sujet: string; texte: string }> = [];
  const service = {
    estConfigure: () => configure,
    fournisseur: () => (configure ? 'essai' : 'aucun'),
    envoyer: async (m: { a: string; sujet: string; texte: string }) => {
      if (!configure) throw new ServiceUnavailableException('non configuré');
      envoyes.push(m);
    },
  };
  return { envoyes, service: service as unknown as CourrielService };
}

/** Le code à six chiffres, tel que le client le lirait dans son courriel. */
function codeDuCourriel(texte: string): string {
  const trouve = /\b(\d{6})\b/.exec(texte);
  if (!trouve) throw new Error(`aucun code dans le message :\n${texte}`);
  return trouve[1];
}

decrire('mot de passe oublié (PostgreSQL réel)', () => {
  let prisma: PrismaService;

  const DOMAINE = '@essai-oubli.invalid';
  const adresse = () =>
    `oubli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${DOMAINE}`;

  const ANCIEN = 'ancien-mot-de-passe';
  const NOUVEAU = 'nouveau-mot-de-passe';

  /** Un compte avec mot de passe, et une session ouverte. */
  async function creerCompte(avecMotDePasse = true) {
    const email = adresse();
    const user = await prisma.user.create({
      data: {
        email,
        displayName: 'Essai Oubli',
        passwordHash: avecMotDePasse ? await argon2.hash(ANCIEN) : null,
      },
    });
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(`jeton-${user.id}`).digest('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    return { id: user.id, email };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: DOMAINE } } });
    await prisma.$disconnect();
  });

  // ─── Ce que la réponse ne dit pas ───────────────────────────────

  /**
   * UNE ADRESSE INCONNUE NE SE DISTINGUE PAS D'UNE ADRESSE CONNUE.
   *
   * Sans cela, la route devient un annuaire : on y teste une liste d'adresses
   * pour savoir lesquelles ont un compte chez nous. Ça se revend, et ça
   * renseigne un hameçonnage ciblé.
   */
  it('ne révèle pas qu’une adresse est inconnue', async () => {
    const { envoyes, service } = boiteAuxLettres();
    const reset = new PasswordResetService(prisma, service);

    await expect(reset.demander(`inconnu${DOMAINE}`)).resolves.toBeUndefined();
    expect(envoyes).toHaveLength(0);
  });

  it('ne révèle pas qu’un compte est désactivé', async () => {
    const { envoyes, service } = boiteAuxLettres();
    const reset = new PasswordResetService(prisma, service);
    const compte = await creerCompte();
    await prisma.user.update({ where: { id: compte.id }, data: { isActive: false } });

    await expect(reset.demander(compte.email)).resolves.toBeUndefined();
    expect(envoyes).toHaveLength(0);
    expect(await prisma.passwordReset.count({ where: { userId: compte.id } })).toBe(0);
  });

  /**
   * UN COMPTE CRÉÉ PAR APPLE OU GOOGLE n'a pas de mot de passe.
   *
   * Lui en poser un par ce chemin serait une reprise de compte : il suffirait
   * d'accéder à la boîte pour transformer une connexion Apple en connexion par
   * mot de passe. On envoie donc un message qui explique par où se connecter,
   * SANS code — et la réponse de la route reste la même.
   */
  it('n’ouvre pas de code pour un compte sans mot de passe, mais écrit quand même', async () => {
    const { envoyes, service } = boiteAuxLettres();
    const reset = new PasswordResetService(prisma, service);
    const compte = await creerCompte(false);

    await reset.demander(compte.email);

    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].texte).not.toMatch(/\b\d{6}\b/);
    expect(envoyes[0].texte).toMatch(/Apple|Google/);
    expect(await prisma.passwordReset.count({ where: { userId: compte.id } })).toBe(0);
  });

  // ─── Le code, et ce qu'il y a en base ───────────────────────────

  /**
   * LE CODE N'EST PAS EN BASE.
   *
   * Une sauvegarde égarée, un accès de lecture de trop, et tous les comptes
   * ayant une demande en cours seraient repris. On vérifie donc que la colonne
   * ne contient PAS le code, et qu'elle contient bien son empreinte.
   */
  it('stocke l’empreinte du code, jamais le code', async () => {
    const { envoyes, service } = boiteAuxLettres();
    const reset = new PasswordResetService(prisma, service);
    const compte = await creerCompte();

    await reset.demander(compte.email);
    const code = codeDuCourriel(envoyes[0].texte);

    const ligne = await prisma.passwordReset.findFirstOrThrow({
      where: { userId: compte.id },
    });
    expect(ligne.codeHash).not.toContain(code);
    expect(ligne.codeHash).toBe(createHash('sha256').update(code).digest('hex'));
    expect(ligne.usedAt).toBeNull();
    expect(ligne.attempts).toBe(0);
    // Quinze minutes, à la seconde près — pas la peine d'être plus précis.
    expect(ligne.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    expect(ligne.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  // ─── Le chemin qui marche ───────────────────────────────────────

  it('change le mot de passe et ferme toutes les sessions', async () => {
    const { envoyes, service } = boiteAuxLettres();
    const reset = new PasswordResetService(prisma, service);
    const compte = await creerCompte();

    await reset.demander(compte.email);
    const code = codeDuCourriel(envoyes[0].texte);

    await reset.confirmer({ email: compte.email, code, nouveauMotDePasse: NOUVEAU });

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: compte.id } });
    expect(await argon2.verify(apres.passwordHash as string, NOUVEAU)).toBe(true);
    expect(await argon2.verify(apres.passwordHash as string, ANCIEN)).toBe(false);

    /**
     * LES SESSIONS TOMBENT, et c'est le point.
     *
     * On reprend un compte parce qu'on en a perdu l'accès — souvent parce
     * qu'un autre l'a pris. Un jeton de renouvellement encore valide
     * laisserait cet autre connecté, avec un mot de passe changé qu'il n'a
     * pas besoin de connaître pour continuer.
     */
    expect(await prisma.refreshToken.count({ where: { userId: compte.id } })).toBe(0);

    const ligne = await prisma.passwordReset.findFirstOrThrow({ where: { userId: compte.id } });
    expect(ligne.usedAt).not.toBeNull();
  });

  // ─── Les refus ──────────────────────────────────────────────────

  it('refuse un code déjà utilisé', async () => {
    const { envoyes, service } = boiteAuxLettres();
    const reset = new PasswordResetService(prisma, service);
    const compte = await creerCompte();

    await reset.demander(compte.email);
    const code = codeDuCourriel(envoyes[0].texte);
    await reset.confirmer({ email: compte.email, code, nouveauMotDePasse: NOUVEAU });

    await expect(
      reset.confirmer({ email: compte.email, code, nouveauMotDePasse: 'encore-un-autre' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Le mot de passe du premier passage tient toujours.
    const apres = await prisma.user.findUniqueOrThrow({ where: { id: compte.id } });
    expect(await argon2.verify(apres.passwordHash as string, NOUVEAU)).toBe(true);
  });

  it('refuse un code expiré', async () => {
    const { envoyes, service } = boiteAuxLettres();
    const reset = new PasswordResetService(prisma, service);
    const compte = await creerCompte();

    await reset.demander(compte.email);
    const code = codeDuCourriel(envoyes[0].texte);

    // On vieillit la demande en base, plutôt que d'attendre un quart d'heure.
    await prisma.passwordReset.updateMany({
      where: { userId: compte.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      reset.confirmer({ email: compte.email, code, nouveauMotDePasse: NOUVEAU }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: compte.id } });
    expect(await argon2.verify(apres.passwordHash as string, ANCIEN)).toBe(true);
  });

  /**
   * CINQ ESSAIS, ET LE CODE MEURT.
   *
   * Six chiffres ne résistent pas à un million de tentatives. C'est le
   * COMPTAGE qui protège, pas la longueur — et il est en base, pas seulement
   * dans la limite de débit, parce que celle-ci vit dans Redis et que Redis
   * peut être absent.
   */
  it('tue le code après cinq essais ratés, même si le bon arrive ensuite', async () => {
    const { envoyes, service } = boiteAuxLettres();
    const reset = new PasswordResetService(prisma, service);
    const compte = await creerCompte();

    await reset.demander(compte.email);
    const bon = codeDuCourriel(envoyes[0].texte);
    const faux = bon === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      await expect(
        reset.confirmer({ email: compte.email, code: faux, nouveauMotDePasse: NOUVEAU }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    const ligne = await prisma.passwordReset.findFirstOrThrow({ where: { userId: compte.id } });
    expect(ligne.attempts).toBe(5);

    await expect(
      reset.confirmer({ email: compte.email, code: bon, nouveauMotDePasse: NOUVEAU }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const apres = await prisma.user.findUniqueOrThrow({ where: { id: compte.id } });
    expect(await argon2.verify(apres.passwordHash as string, ANCIEN)).toBe(true);
  });

  /**
   * UN SEUL CODE VIVANT À LA FOIS.
   *
   * Sans cela, demander dix fois donnerait dix codes valides simultanément, et
   * multiplierait par dix les chances d'en deviner un.
   */
  it('annule le code précédent à chaque nouvelle demande', async () => {
    const { envoyes, service } = boiteAuxLettres();
    const reset = new PasswordResetService(prisma, service);
    const compte = await creerCompte();

    await reset.demander(compte.email);
    const premier = codeDuCourriel(envoyes[0].texte);
    await reset.demander(compte.email);
    const second = codeDuCourriel(envoyes[1].texte);

    await expect(
      reset.confirmer({ email: compte.email, code: premier, nouveauMotDePasse: NOUVEAU }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await reset.confirmer({ email: compte.email, code: second, nouveauMotDePasse: NOUVEAU });
    const apres = await prisma.user.findUniqueOrThrow({ where: { id: compte.id } });
    expect(await argon2.verify(apres.passwordHash as string, NOUVEAU)).toBe(true);
  });

  it('refuse un mot de passe trop court, sans consommer le code', async () => {
    const { envoyes, service } = boiteAuxLettres();
    const reset = new PasswordResetService(prisma, service);
    const compte = await creerCompte();

    await reset.demander(compte.email);
    const code = codeDuCourriel(envoyes[0].texte);

    await expect(
      reset.confirmer({ email: compte.email, code, nouveauMotDePasse: 'court' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // LE CODE N'A PAS ÉTÉ BRÛLÉ : le client corrige son mot de passe et
    // recommence, sans redemander un courriel.
    await reset.confirmer({ email: compte.email, code, nouveauMotDePasse: NOUVEAU });
    const apres = await prisma.user.findUniqueOrThrow({ where: { id: compte.id } });
    expect(await argon2.verify(apres.passwordHash as string, NOUVEAU)).toBe(true);
  });

  // ─── Sans fournisseur de courriel ───────────────────────────────

  /**
   * TANT QUE RIEN N'EST CONFIGURÉ, LA FONCTION N'EXISTE PAS.
   *
   * On ne répond pas « vérifie tes courriels » sans pouvoir en envoyer : le
   * client attendrait, recommencerait, et finirait par croire son adresse
   * inconnue. C'est pire que le message d'attente que ce parcours remplace.
   */
  it('se déclare indisponible, et refuse, sans fournisseur de courriel', async () => {
    const { service } = boiteAuxLettres(false);
    const reset = new PasswordResetService(prisma, service);
    const compte = await creerCompte();

    expect(reset.estDisponible()).toBe(false);
    await expect(reset.demander(compte.email)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await prisma.passwordReset.count({ where: { userId: compte.id } })).toBe(0);
  });
});
