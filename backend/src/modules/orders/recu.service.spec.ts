import { NotFoundException } from '@nestjs/common';
import { RecuService } from './recu.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * Ce que le reçu doit porter pour valoir justificatif.
 *
 * Un ticket anonyme ne se fait pas rembourser : une note de frais, une
 * comptabilité de club ou une réclamation demandent toutes de savoir à qui le
 * document a été délivré — et une comptabilité classe par NOM, pas par adresse
 * e-mail. Le reçu porte donc le nom de l'inscription, l'adresse sous lui, et
 * rien d'autre : ni domicile ni moyen de paiement.
 */
describe('RecuService — ce que porte le document', () => {
  const COMMANDE = 'aaaaaaaa-1111-4111-8111-111111111111';

  function service(
    overrides: {
      dailyNumber?: number | null;
      email?: string | null;
      client?: Record<string, unknown> | null;
    } = {},
  ) {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: COMMANDE,
          userId: 'user-1',
          supplierId: 'sup-1',
          organizationId: 'org-1',
          publicOrderNumber: 'BE-00000005',
          dailyNumber: overrides.dailyNumber === undefined ? 5 : overrides.dailyNumber,
          totalCents: 700,
          discountCents: 0,
          createdAt: new Date('2026-09-18T12:00:00Z'),
          slot: null,
          items: [
            {
              quantity: 1,
              productNameSnapshot: 'Burger',
              lineTotalCents: 700,
              vatRateBps: 1000,
            },
          ],
        }),
      },
      supplier: { findUnique: jest.fn().mockResolvedValue({ name: 'Buvette Nord' }) },
      organization: { findUnique: jest.fn().mockResolvedValue({ name: 'Stade Vélodrome' }) },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            overrides.client !== undefined
              ? overrides.client
              : overrides.email === null
                ? null
                : { email: overrides.email ?? 'jo@exemple.fr' },
          ),
      },
    } as unknown as PrismaService;
    return new RecuService(prisma);
  }

  it('porte le NOM de l’inscription, et l’adresse sous lui', async () => {
    const html = await service({
      client: {
        email: 'jo@exemple.fr',
        firstName: 'Jo',
        lastName: 'Martin',
        displayName: 'JoJo',
      },
    }).html(COMMANDE);

    // C'est le nom qu'une comptabilite cherche ; l'adresse reste dessous, car
    // c'est elle qui rattache le recu au compte.
    expect(html).toContain('Délivré à Jo Martin');
    expect(html).toContain('jo@exemple.fr');
    // Le nom d'affichage ne sert que de dernier recours : tant qu'un etat
    // civil existe, c'est lui qui vaut sur un justificatif.
    expect(html).not.toContain('JoJo');
  });

  it('se contente du prénom quand le nom manque', async () => {
    const html = await service({
      client: { email: 'jo@exemple.fr', firstName: 'Jo', lastName: null, displayName: null },
    }).html(COMMANDE);

    expect(html).toContain('Délivré à Jo');
  });

  it('retombe sur le nom d’affichage — tout ce qu’Apple laisse parfois', async () => {
    // Apple ne communique l'identite qu'a la toute premiere autorisation :
    // un compte ouvert ainsi n'a souvent qu'un nom d'affichage.
    const html = await service({
      client: { email: 'jo@exemple.fr', firstName: null, lastName: null, displayName: 'Jo M.' },
    }).html(COMMANDE);

    expect(html).toContain('Délivré à Jo M.');
  });

  it('sans aucun nom, « Délivré à » reste — porté par l’adresse', async () => {
    // La regression qu'il fallait eviter : l'etiquette appartient a la ligne,
    // pas au nom. Une adresse posee nue ne dit pas ce qu'elle fait la.
    const html = await service({
      client: { email: 'jo@exemple.fr', firstName: null, lastName: null, displayName: null },
    }).html(COMMANDE);

    expect(html).toContain('Délivré à jo@exemple.fr');
  });

  it('annonce le numéro du jour ET garde la référence longue', async () => {
    const html = await service().html(COMMANDE);

    // Le numéro court est celui que le client entend au comptoir ; la
    // référence longue est la seule unique à vie, et c'est elle que le support
    // retrouvera dans six mois.
    expect(html).toContain('Commande n° 5');
    expect(html).toContain('Reçu n° BE-00000005');
  });

  it('se passe du numéro du jour quand la commande n’en a pas', async () => {
    // Les commandes antérieures au compteur n'en ont pas. Un « Commande n° »
    // suivi d'un vide ferait douter de la validité du document.
    const html = await service({ dailyNumber: null }).html(COMMANDE);
    expect(html).not.toContain('Commande n°');
    expect(html).toContain('Reçu n° BE-00000005');
  });

  it('reste lisible si le compte a disparu', async () => {
    // Un compte supprimé ne doit pas empêcher de rouvrir un vieux reçu : le
    // justificatif d'un achat déjà payé survit à son acheteur.
    const html = await service({ email: null }).html(COMMANDE);
    expect(html).toContain('Reçu n° BE-00000005');
    expect(html).toContain('Total payé');
    // Pas de « Délivré à » suivi du vide : la ligne disparaît entièrement.
    expect(html).not.toContain('Délivré à');
  });

  it('refuse une commande inconnue', async () => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(new RecuService(prisma).html(COMMANDE)).rejects.toBeInstanceOf(NotFoundException);
  });
});
