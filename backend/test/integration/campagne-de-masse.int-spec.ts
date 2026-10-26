import { UserNotificationsService } from '../../src/modules/notifications/user-notifications.service';
import { PushTokensService } from '../../src/modules/notifications/push-tokens.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

/**
 * UNE CAMPAGNE DE MASSE PASSE-T-ELLE, DE BOUT EN BOUT ?
 *
 * Un club qui annonce un match à 25 000 abonnés déclenche trois écritures de
 * masse : l'archivage pour la cloche, la relecture des jetons d'appareil, et
 * la purge de ceux qu'Expo a rejetés. Aucune n'avait jamais été exercée à
 * cette échelle.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER A SERVI À ÉTABLIR, ET QUI CONTREDIT L'AUDIT
 *
 * L'audit du 25/10/2026 (P1-3) annonçait qu'à ce volume on dépasserait la
 * limite de 65 535 paramètres du protocole PostgreSQL et que la requête
 * échouerait net. Mesuré ici le 26/10, c'est **faux** : avec le découpage
 * neutralisé, les trois opérations passent quand même. Prisma découpe
 * lui-même ce qu'il envoie.
 *
 * Le découpage de `par-lots.ts` ne corrige donc pas une panne — il évite
 * qu'une seule transaction géante retienne la base pendant que les buvettes
 * servent. C'est une question de DISPONIBILITÉ, pas de capacité.
 *
 * Ces tests gardent leur valeur : ils établissent que le chemin tient à
 * l'échelle réelle, et c'est la première fois qu'on le vérifie. Mais ils ne
 * démontrent pas ce qu'on croyait, et il valait mieux l'écrire que de laisser
 * un commentaire confortable.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 25 000 et pas 100 000 : assez pour sortir du régime des petits nombres,
 * assez peu pour qu'un test qui dure trois minutes ne finisse pas désactivé.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('campagne de masse (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const notifications = url ? new UserNotificationsService(s.prisma) : (null as never);
  const jetons = url ? new PushTokensService(s.prisma) : (null as never);

  const DESTINATAIRES = 25_000;

  let userIds: string[];
  let orgId: string;

  beforeAll(async () => {
    const sa = await s.prisma.user.create({
      data: {
        email: `${unique('sa')}@test.fr`,
        passwordHash: 'x',
        displayName: 'SA',
        globalRole: 'SUPER_ADMIN',
      },
    });
    orgId = (await creerOrganisationComplete(s.prisma, unique('club'), sa.id)).org.id;

    // Les comptes sont le décor, pas l'objet du test.
    const prefixe = unique('foule');
    await s.prisma.user.createMany({
      data: Array.from({ length: DESTINATAIRES }, (_, i) => ({
        email: `${prefixe}-${i}@test.fr`,
        passwordHash: 'x',
        displayName: `Client ${i}`,
        globalRole: 'CUSTOMER' as const,
      })),
    });
    userIds = (
      await s.prisma.user.findMany({
        where: { email: { startsWith: prefixe } },
        select: { id: true },
      })
    ).map((u) => u.id);
  }, 180_000);

  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  it(`archive ${DESTINATAIRES} destinataires, et les compte juste`, async () => {
    const archivees = await notifications.archiver({
      userIds,
      organizationId: orgId,
      title: 'Match ce soir',
      body: 'Les buvettes ouvrent à 19h.',
    });

    // Le compte rendu doit dire la vérité : c'est lui qui s'affichera au club.
    expect(archivees).toBe(DESTINATAIRES);

    const enBase = await s.prisma.userNotification.count({
      where: { organizationId: orgId, title: 'Match ce soir' },
    });
    expect(enBase).toBe(DESTINATAIRES);
  }, 180_000);

  /**
   * Le cas réel : beaucoup de comptes, bien moins d'appareils. Un client sur
   * dix a autorisé les notifications.
   */
  it(`ne rend que les jetons qui existent, sur ${DESTINATAIRES} clients`, async () => {
    const avecJeton = userIds.filter((_, i) => i % 10 === 0);
    await s.prisma.pushToken.createMany({
      data: avecJeton.map((userId, i) => ({
        userId,
        token: `ExponentPushToken[masse-${i}]`,
        platform: 'ios' as const,
      })),
    });

    const tokens = await jetons.tokensForUsers(userIds);
    expect(tokens).toHaveLength(avecJeton.length);
  }, 180_000);

  /**
   * La purge suit la campagne — Expo rend les jetons d'appareils désinstallés,
   * et il faut les retirer sous peine de les réessayer à chaque envoi.
   */
  it('purge en masse, et n’en laisse aucun', async () => {
    const tokens = await jetons.tokensForUsers(userIds);
    await jetons.purgeInvalid(tokens);

    expect(await jetons.tokensForUsers(userIds)).toHaveLength(0);
  }, 180_000);
});
