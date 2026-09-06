import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { libelleTaux, ventilerSurTotal } from '../../common/helpers/tva';

/**
 * Le reçu d'une commande.
 *
 * Rendu en HTML plutôt qu'en PDF, et c'est délibéré : une page s'imprime et
 * s'enregistre en PDF depuis n'importe quel navigateur, sur téléphone comme sur
 * ordinateur, sans embarquer de moteur de rendu côté serveur ni de dépendance
 * native côté application. Le client obtient le même document partout.
 *
 * Le contenu est celui d'un justificatif : qui vend, quoi, à quel prix, quelle
 * TVA, et quand. Rien de plus — un reçu n'a pas à porter l'adresse du client ni
 * son moyen de paiement.
 */
@Injectable()
export class RecuService {
  constructor(private readonly prisma: PrismaService) {}

  async html(orderId: string): Promise<string> {
    // `Order` n'a pas de relation vers l'organisation : elle se lit a part.
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, slot: { select: { label: true, startAt: true } } },
    });
    if (!order) throw new NotFoundException('Commande introuvable');

    const [buvette, club] = await Promise.all([
      this.prisma.supplier.findUnique({
        where: { id: order.supplierId },
        select: { name: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: order.organizationId },
        select: { name: true },
      }),
    ]);

    // La TVA, taux par taux — c'est ce qui fait d'un ticket un justificatif.
    const ventilation = ventilerSurTotal(
      order.items.map((l) => ({ ttcCents: l.lineTotalCents, vatRateBps: l.vatRateBps })),
      order.totalCents,
    );

    const euros = (cents: number) =>
      `${(cents / 100).toFixed(2).replace('.', ',')}\u00a0€`;
    const quand = order.createdAt.toLocaleString('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Paris',
    });

    const lignes = order.items
      .map(
        (l) => `<tr>
          <td class="q">${l.quantity}×</td>
          <td>${echapper(l.productNameSnapshot)}</td>
          <td class="t">${libelleTaux(l.vatRateBps)}</td>
          <td class="p">${euros(l.lineTotalCents)}</td>
        </tr>`,
      )
      .join('');

    const tva = ventilation.tranches
      .map(
        (t) => `<tr>
          <td>TVA ${t.label}</td>
          <td class="p">${euros(t.tvaCents)}</td>
        </tr>`,
      )
      .join('');

    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reçu ${echapper(order.publicOrderNumber)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 20px 64px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #faf8f6; color: #2d2926;
    display: flex; justify-content: center;
  }
  .ticket { background: #fff; width: 100%; max-width: 420px; border-radius: 18px;
            border: 1px solid #eee6e1; padding: 26px 24px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  .club { color: #6b625c; font-size: 13.5px; margin: 0 0 18px; }
  .num { font-size: 13px; color: #6b625c; font-variant-numeric: tabular-nums;
         letter-spacing: .4px; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 7px 0; vertical-align: top; }
  .q { color: #6b625c; width: 34px; font-variant-numeric: tabular-nums; }
  .t { color: #9a918b; font-size: 12px; text-align: right; width: 52px; white-space: nowrap; }
  .p { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sep { border-top: 1px solid #eee6e1; margin: 14px 0; }
  .tva td { color: #6b625c; font-size: 13px; padding: 3px 0; }
  .total { display: flex; justify-content: space-between; align-items: baseline;
           margin-top: 12px; font-weight: 800; font-size: 18px; }
  .quand { color: #9a918b; font-size: 12.5px; margin-top: 20px; line-height: 1.6; }
  .imprimer { display: block; width: 100%; margin: 22px auto 0; max-width: 420px;
              background: #FC4002; color: #fff; border: 0; border-radius: 999px;
              padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer;
              font-family: inherit; }
  @media print {
    body { background: #fff; padding: 0; }
    .ticket { border: 0; max-width: none; }
    .imprimer { display: none; }
  }
</style>
</head>
<body>
  <div>
    <div class="ticket">
      <h1>${echapper(buvette?.name ?? 'Commande')}</h1>
      <p class="club">${echapper(club?.name ?? '')}</p>
      <p class="num">Reçu n° ${echapper(order.publicOrderNumber)}</p>

      <table>${lignes}</table>

      <div class="sep"></div>
      ${
        order.discountCents > 0
          ? `<table><tr><td>Remise fidélité</td><td class="p">−${euros(order.discountCents)}</td></tr></table>`
          : ''
      }
      <table class="tva">
        <tr><td>Total HT</td><td class="p">${euros(ventilation.htCents)}</td></tr>
        ${tva}
      </table>

      <div class="total"><span>Total payé</span><span>${euros(order.totalCents)}</span></div>

      <p class="quand">
        ${quand}${order.slot ? `<br>Retrait : ${echapper(order.slot.label ?? '')}` : ''}
      </p>
    </div>

    <button class="imprimer" onclick="window.print()">Enregistrer en PDF / Imprimer</button>
  </div>
</body>
</html>`;
  }
}

/** Aucune donnée saisie par un club ne doit pouvoir injecter du HTML ici. */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
