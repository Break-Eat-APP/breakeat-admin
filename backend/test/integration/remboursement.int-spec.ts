/**
 * LE REMBOURSEMENT, TEL QUE LE CLIENT LE VOIT.
 *
 * L'application sait afficher un remboursement depuis la phase 44 — bandeau
 * bleu, anneau bleu — et l'API renvoyait déjà `paymentStatus`. Mais rien
 * n'écrivait jamais `REFUNDED` : un remboursement fait depuis le tableau de bord
 * Stripe ne se voyait nulle part. Le client lisait « Récupérée » et nous
 * écrivait pour savoir où était son argent.
 *
 * Sur une VRAIE base, parce que l'état de la commande se déduit de TOUTES ses
 * lignes de paiement — une tournée partagée en compte une par convive — et que
 * c'est une agrégation, pas une règle qu'on peut simuler.
 */
import { PaymentStatus } from '@prisma/client';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { OrderStateMachineService } from '../../src/modules/orders/order-state-machine.service';
import { monterServices, unique, creerOrganisationComplete, creerCommande } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('remboursement enregistré (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);

  const commandes = url
    ? new OrdersService(
        s.prisma,
        new OrderStateMachineService(),
        { emitNewOrder: () => {}, emitOrderUpdated: () => {}, emitOrderReady: () => {} } as never,
        { assignOrderToSlot: async () => ({}) } as never,
        { earnForOrder: async () => 0 } as never,
        { pushOrderUpdate: async () => {} } as never,
      )
    : (null as never);

  let client: string;
  let sa: string;

  beforeAll(async () => {
    sa = (
      await s.prisma.user.create({
        data: {
          email: `${unique('sa')}@test.fr`,
          passwordHash: 'x',
          displayName: 'SA',
          globalRole: 'SUPER_ADMIN',
        },
      })
    ).id;
    client = (
      await s.prisma.user.create({
        data: {
          email: `${unique('client')}@test.fr`,
          passwordHash: 'x',
          displayName: 'Client',
          globalRole: 'CUSTOMER',
        },
      })
    ).id;
  });
  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  /**
   * Une commande payée, avec `combien` lignes de paiement de 700 c chacune.
   *
   * Rend le PREMIER paiement à part : c'est celui qu'on rembourse dans la
   * plupart des cas, et le nommer évite de déballer un index.
   */
  async function commandePayee(combien = 1) {
    const o = await creerOrganisationComplete(s.prisma, unique('bar'), sa);
    const commande = await creerCommande(s.prisma, client, o);

    const ligne = () =>
      s.prisma.payment.create({
        data: {
          orderId: commande.id,
          stripePaymentIntentId: unique('pi'),
          status: PaymentStatus.SUCCEEDED,
          amountCents: 700,
        },
      });

    const premier = await ligne();
    const tous = [premier];
    for (let i = 1; i < combien; i++) tous.push(await ligne());

    return { commande, premier, tous };
  }

  async function etatCommande(id: string): Promise<PaymentStatus> {
    const { paymentStatus } = await s.prisma.order.findUniqueOrThrow({
      where: { id },
      select: { paymentStatus: true },
    });
    return paymentStatus;
  }

  it('un remboursement TOTAL marque la commande REFUNDED', async () => {
    const { commande, premier } = await commandePayee();

    await commandes.recordRefund(
      premier.stripePaymentIntentId,
      { rembourseCents: 700, totalCents: 700 },
      {},
    );

    expect(await etatCommande(commande.id)).toBe(PaymentStatus.REFUNDED);
    const relu = await s.prisma.payment.findUniqueOrThrow({ where: { id: premier.id } });
    expect(relu.status).toBe(PaymentStatus.REFUNDED);
  });

  it('un remboursement PARTIEL le dit, et ne prétend pas avoir tout rendu', async () => {
    const { commande, premier } = await commandePayee();

    await commandes.recordRefund(
      premier.stripePaymentIntentId,
      { rembourseCents: 200, totalCents: 700 },
      {},
    );

    expect(await etatCommande(commande.id)).toBe(PaymentStatus.PARTIALLY_REFUNDED);
  });

  it('rendre la part d’UN convive ne rembourse pas la TOURNÉE', async () => {
    // Une ardoise porte une ligne de paiement par convive. L'état de la commande
    // se recalcule depuis toutes ses lignes : sinon rendre 8,50 € à Marc
    // afficherait « commande remboursée » aux quatre autres.
    const { commande, premier } = await commandePayee(3);

    await commandes.recordRefund(
      premier.stripePaymentIntentId,
      { rembourseCents: 700, totalCents: 700 },
      {},
    );

    expect(await etatCommande(commande.id)).toBe(PaymentStatus.PARTIALLY_REFUNDED);
  });

  it('quand TOUS les convives sont remboursés, la tournée l’est aussi', async () => {
    const { commande, tous } = await commandePayee(3);

    for (const p of tous) {
      await commandes.recordRefund(
        p.stripePaymentIntentId,
        { rembourseCents: 700, totalCents: 700 },
        {},
      );
    }

    expect(await etatCommande(commande.id)).toBe(PaymentStatus.REFUNDED);
  });

  it('le STATUT de la commande ne bouge pas — elle a bien été servie', async () => {
    // Une commande remboursée reste récupérée : c'est une autre information.
    // Le mouvement d'argent est tracé à côté, au journal d'audit.
    const { commande, premier } = await commandePayee();
    await s.prisma.order.update({ where: { id: commande.id }, data: { status: 'PICKED_UP' } });

    await commandes.recordRefund(
      premier.stripePaymentIntentId,
      { rembourseCents: 700, totalCents: 700 },
      {},
    );

    const relue = await s.prisma.order.findUniqueOrThrow({ where: { id: commande.id } });
    expect(relue.status).toBe('PICKED_UP');

    const trace = await s.prisma.orderAuditTrail.findFirst({
      where: { orderId: commande.id, reason: { contains: 'Remboursement' } },
    });
    expect(trace).not.toBeNull();
    expect(trace?.previousState).toBe('PICKED_UP');
    expect(trace?.nextState).toBe('PICKED_UP');
  });

  it('REJEU du webhook : un seul mouvement au journal', async () => {
    // Stripe rejoue ses événements. Un second passage ne doit pas inscrire un
    // second remboursement, ni ré-émettre quoi que ce soit.
    const { commande, premier } = await commandePayee();
    const montants = { rembourseCents: 700, totalCents: 700 };

    await commandes.recordRefund(premier.stripePaymentIntentId, montants, {});
    await commandes.recordRefund(premier.stripePaymentIntentId, montants, {});

    const traces = await s.prisma.orderAuditTrail.count({
      where: { orderId: commande.id, reason: { contains: 'Remboursement' } },
    });
    expect(traces).toBe(1);
  });

  it('un paiement INCONNU ne fait rien tomber', async () => {
    // Une autorisation d'ardoise jamais devenue commande, par exemple. Lever
    // ferait rejouer Stripe indéfiniment sur un cas normal.
    await expect(
      commandes.recordRefund(unique('pi-inconnu'), { rembourseCents: 100, totalCents: 100 }, {}),
    ).resolves.toBeUndefined();
  });
});
