const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, PageOrientation, LevelFormat,
  PageBreak, ShadingType,
} = require('docx');

const ARIAL = 'Arial';

function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, font: ARIAL, bold: true, size: 32 })], spacing: { before: 360, after: 200 } }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, font: ARIAL, bold: true, size: 26 })], spacing: { before: 280, after: 140 } }); }
function p(text, opts = {}) { return new Paragraph({ children: [new TextRun({ text, font: ARIAL, size: 22, ...opts })], spacing: { after: 120 } }); }
function bullet(text) { return new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun({ text, font: ARIAL, size: 22 })], spacing: { after: 80 } }); }
function code(text) { return new Paragraph({ children: [new TextRun({ text, font: 'Consolas', size: 20 })], spacing: { after: 80 }, shading: { fill: 'F2F2F2', type: ShadingType.CLEAR } }); }
function pageBreak() { return new Paragraph({ children: [new PageBreak()] }); }

const children = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2000, after: 200 }, children: [new TextRun({ text: 'BRAT EAT', font: ARIAL, bold: true, size: 56 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'PHASE 5 — CART, CHECKOUT, STRIPE CONNECT, ORDERS', font: ARIAL, bold: true, size: 32 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', font: ARIAL, italics: true, size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: '27/05/2026 (audit fixes 01/06/2026)', font: ARIAL, size: 22 })] }),
  pageBreak(),

  h1('1. OBJECTIF DE LA PHASE 5'),
  p('Phase 5 implémente le pipeline complet d\'achat customer : Cart → Stripe Checkout → Webhook → Order. C\'est le cœur financier de l\'application : aucun ordre métier n\'existe sans Phase 5.'),
  p('Sans cette phase, BRAT EAT ne peut pas encaisser de paiements, et donc aucune commande ne peut être confirmée et envoyée à un opérateur.'),
  h2('Périmètre V1'),
  bullet('1 cart = 1 supplier (single-vendor — multi-vendor flag OFF)'),
  bullet('Onboarding Stripe Connect Standard pour chaque supplier (KYC géré par Stripe)'),
  bullet('Paiement via Stripe destination charges + application_fee_amount (split marketplace)'),
  bullet('Order créé UNIQUEMENT après payment_intent.succeeded (jamais avant)'),
  bullet('Idempotency à 3 niveaux : Stripe key, webhook event id, payment intent id'),

  pageBreak(),
  h1('2. MODÈLES PRISMA AJOUTÉS'),
  h2('Enums'),
  code('StripeAccountStatus = NOT_ONBOARDED | PENDING | ACTIVE | RESTRICTED'),
  code('CartStatus = OPEN | CHECKOUT_PENDING | CONVERTED | EXPIRED | ABANDONED'),
  code('OrderStatus = PAID | ACCEPTED | PREPARING | READY | PICKED_UP | COMPLETED | CANCELLED | RECOVERED'),
  code('PaymentStatus = NOT_STARTED | REQUIRES_ACTION | PROCESSING | SUCCEEDED | FAILED | REFUNDED | PARTIALLY_REFUNDED'),
  code('OrderActorType = SYSTEM | CUSTOMER | OPERATOR | ADMIN | FLAIX'),
  h2('Models'),
  bullet('Supplier (extended) : stripeAccountId, stripeAccountStatus, stripeChargesEnabled, stripePayoutsEnabled, stripeOnboardedAt'),
  bullet('Cart : userId, eventId, supplierId, pickupPointId, status, paymentIntentId, expiresAt'),
  bullet('CartItem : cartId, productId, quantity, priceSnapshotCents (frozen at checkout)'),
  bullet('Order : publicOrderNumber, userId, organizationId, eventId, venueId, supplierId, pickupPointId, status, paymentStatus, subtotalCents, totalCents'),
  bullet('OrderItem : orderId, productId, productNameSnapshot, unitPriceCentsSnapshot, quantity, lineTotalCents'),
  bullet('Payment : orderId (nullable), stripePaymentIntentId (UNIQUE), status, amountCents, failureReason, rawStripeEvent'),
  bullet('OrderAuditTrail : orderId, actorType, actorId, previousState, nextState, reason, metadata (append-only)'),
  bullet('WebhookEvent : stripeEventId (UNIQUE), eventType, processedAt, rawPayload (idempotency log)'),

  pageBreak(),
  h1('3. FLUX COMPLET CUSTOMER → ORDER'),
  code('1. POST /carts                      → cart OPEN'),
  code('2. POST /carts/:id/items             → ajouts items (validation stock + statut)'),
  code('3. PATCH /carts/:id (pickupPointId)  → set pickup'),
  code('4. POST /carts/:id/checkout          → cart CHECKOUT_PENDING'),
  code('                                       + freeze priceSnapshotCents sur chaque item'),
  code('                                       + Stripe PaymentIntent (idempotencyKey=cart_<id>)'),
  code('5. Client → Stripe Elements         → confirm payment'),
  code('6. Stripe → POST /webhooks/stripe   → payment_intent.succeeded'),
  code('7. StripeWebhooksService             → dispatch + idempotency'),
  code('8. OrdersService.createFromPaymentIntent (transaction unique) :'),
  code('   - Cart → CONVERTED'),
  code('   - Order créé (status PAID, public_order_number BE-XXXXXXXX)'),
  code('   - OrderItems créés avec SNAPSHOTS depuis CartItem.priceSnapshotCents'),
  code('   - Payment upsert (handles retry après FAILED)'),
  code('   - OrderAuditTrail : null → PAID, actor=SYSTEM'),
  code('   - Stock décrémenté atomiquement (WHERE quantity >= item.quantity)'),

  pageBreak(),
  h1('4. GARANTIES CRITIQUES'),
  h2('Idempotency (3 niveaux)'),
  bullet('Stripe idempotencyKey = cart_<cartId> → un cart = 1 PaymentIntent unique'),
  bullet('webhook_events.stripeEventId UNIQUE → duplicate deliveries skip'),
  bullet('payments.stripePaymentIntentId UNIQUE → second call retourne l\'Order existant via Payment.upsert'),
  h2('Cohérence financière (P1 audit 01/06)'),
  bullet('priceSnapshotCents frozen sur chaque CartItem au checkout'),
  bullet('Order.totalCents calculé depuis ces snapshots (jamais depuis Product.price live)'),
  bullet('Vérification défensive : si subtotal != intent.amount → ConflictException, refus de créer l\'Order'),
  h2('Anti-oversell stock (P1 audit 01/06)'),
  bullet('Décrémentation atomique : tx.stock.updateMany({ where: { quantity: { gte: item.quantity } } })'),
  bullet('Si updateMany.count === 0 → ConflictException + rollback transaction (rien créé)'),
  bullet('Garanti race-safe : 2 transactions concurrentes ne peuvent pas faire passer quantity en négatif'),
  h2('Retry après échec (P1 audit 01/06)'),
  bullet('Payment.upsert au lieu de Payment.create dans createFromPaymentIntent'),
  bullet('Si webhook payment_failed a déjà créé une row Payment FAILED, le webhook succeeded la met à jour proprement (pas de P2002)'),

  pageBreak(),
  h1('5. STRIPE CONNECT — ONBOARDING SUPPLIER'),
  h2('Endpoints'),
  code('POST /organizations/:orgId/suppliers/:id/stripe/onboarding-link'),
  code('GET  /organizations/:orgId/suppliers/:id/stripe/status'),
  h2('Flux'),
  bullet('createOnboardingLink : crée Stripe Account si absent + retourne AccountLink URL one-shot'),
  bullet('refreshStripeStatus : pull live l\'état Stripe, mirror sur Supplier (chargesEnabled, payoutsEnabled, status)'),
  bullet('Webhook account.updated met à jour les mêmes champs automatiquement'),
  h2('Status mapping'),
  bullet('ACTIVE = charges_enabled && payouts_enabled'),
  bullet('RESTRICTED = details_submitted mais capabilities manquantes (action supplier requise)'),
  bullet('PENDING = onboarding incomplet'),

  pageBreak(),
  h1('6. CONFIGURATION ENV'),
  code('STRIPE_SECRET_KEY=sk_test_...'),
  code('STRIPE_WEBHOOK_SECRET=whsec_...'),
  code('STRIPE_API_VERSION=2024-12-18.acacia'),
  code('STRIPE_PLATFORM_FEE_BPS=500          # 5% commission'),
  code('STRIPE_CONNECT_RETURN_URL=...'),
  code('STRIPE_CONNECT_REFRESH_URL=...'),

  pageBreak(),
  h1('7. TESTS LIVRÉS'),
  bullet('cart.service.spec.ts : 13 tests (create, addItem, checkout, idempotency, ownership, price freeze)'),
  bullet('orders.service.spec.ts : 9 tests (createFromPaymentIntent, idempotency, oversell guard, divergence guard, payment upsert)'),
  bullet('stripe-webhooks.service.spec.ts : 4 tests (dispatch, idempotency, account.updated)'),
  bullet('Total backend Phase 5 (cumulatif) : 94 tests'),

  pageBreak(),
  h1('8. WIRING CRITIQUE (main.ts)'),
  code('bodyParser: false               // Nest default OFF'),
  code('app.use(\'/webhooks/stripe\', raw({ type: \'application/json\' }))  // raw body avant json'),
  code('app.use(json({ limit: \'1mb\' }))'),
  code('app.setGlobalPrefix(\'api/v1\', { exclude: [\'health\', \'webhooks/(.*)\'] })'),
  p('Ordre des middlewares CRITIQUE : raw body sur /webhooks/stripe DOIT être enregistré AVANT json(), sinon la signature Stripe échoue silencieusement (body parsé en JSON avant la vérification).'),

  pageBreak(),
  h1('9. POINTS DE VIGILANCE POUR LA SUITE'),
  bullet('Realtime / new_order event NON émis Phase 5 — viendra Phase 6 (Outbox)'),
  bullet('Refunds NON gérés V1 — Phase 9'),
  bullet('Cart sweeper (auto-expire) NON implémenté — Phase 9'),
  bullet('Multi-vendor flag reste OFF V1 — Phase 7+ si activation'),
  bullet('Stock SELECT FOR UPDATE non explicite — décrémentation atomique via WHERE gte suffit pour rush V1'),
];

const doc = new Document({
  styles: { default: { document: { run: { font: ARIAL, size: 22 } } } },
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 360 } } } }],
    }],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, 'PHASE_5_CART_CHECKOUT_STRIPE_ORDERS.docx');
  fs.writeFileSync(out, buf);
  console.log('Wrote', out);
});
