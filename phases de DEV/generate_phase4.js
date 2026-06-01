const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, PageOrientation, LevelFormat, TabStopType, TabStopPosition,
  PageBreak, BorderStyle, WidthType, ShadingType, Table, TableRow, TableCell,
} = require('docx');

const ARIAL = 'Arial';

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, font: ARIAL, bold: true, size: 32 })],
    spacing: { before: 360, after: 200 },
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font: ARIAL, bold: true, size: 26 })],
    spacing: { before: 280, after: 140 },
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, font: ARIAL, size: 22, ...opts })],
    spacing: { after: 120 },
  });
}
function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text, font: ARIAL, size: 22 })],
    spacing: { after: 80 },
  });
}
function code(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: 'Consolas', size: 20 })],
    spacing: { after: 80 },
    shading: { fill: 'F2F2F2', type: ShadingType.CLEAR },
  });
}
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

const children = [
  // ─── Cover ─────────────────────────────────────────────────
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 2000, after: 200 },
    children: [new TextRun({ text: 'BRAT EAT', font: ARIAL, bold: true, size: 56 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'PHASE 4 — PRODUCTS, CATEGORIES, STOCK', font: ARIAL, bold: true, size: 36 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', font: ARIAL, italics: true, size: 24 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: '26/05/2026', font: ARIAL, size: 22 })],
  }),
  pageBreak(),

  // ─── Section 1 ────────────────────────────────────────────
  h1('1. OBJECTIF DE LA PHASE 4'),
  p('Phase 4 ajoute le catalogue produit complet de chaque supplier : Catégories, Produits, Stock. C\'est la dernière brique métier avant le pipeline de commande (Phase 5).'),
  p('Sans Phase 4, le panier (Phase 5) n\'a aucun item à référencer, et la décrémentation de stock à la création d\'Order (Phase 6) ne peut pas exister.'),
  h2('Objectifs livrables'),
  bullet('CRUD Category par supplier (ordre, statut)'),
  bullet('CRUD Product par supplier + category (prix en cents, fenêtre horaire, statut)'),
  bullet('Stock par produit (global ou per pickup-point)'),
  bullet('Règles d\'accès : MANAGE_ROLES (ORG_ADMIN, MANAGER) pour modifications ; OPERATOR pour toggle isAvailable uniquement'),
  bullet('Migration Prisma + tests couvrant les invariants critiques'),

  pageBreak(),
  h1('2. SCHÉMA DE DONNÉES'),
  h2('Enums ajoutés'),
  code('CategoryStatus = ACTIVE | INACTIVE | ARCHIVED'),
  code('ProductStatus = ACTIVE | INACTIVE | OUT_OF_STOCK | ARCHIVED'),
  h2('Models'),
  bullet('Category — supplierId, name, sortOrder, status'),
  bullet('Product — supplierId, categoryId, name, description, price (Int = cents), imageUrl, status, availableFrom, availableUntil'),
  bullet('Stock — productId, supplierId, pickupPointId (optional), quantity, isAvailable'),
  h2('Contraintes DB critiques'),
  bullet('products.price >= 0 (CHECK)'),
  bullet('stock.quantity >= 0 (CHECK)'),
  bullet('Index partiel : un seul stock global (pickup_point_id IS NULL) par produit'),
  bullet('Index partiel : un seul stock par (produit, pickup_point) quand pickup_point_id IS NOT NULL'),
  bullet('FK products.category_id ON DELETE RESTRICT — supprimer une catégorie avec produits → erreur P2003 → ConflictException'),

  pageBreak(),
  h1('3. RÈGLES MÉTIER'),
  h2('Prix'),
  bullet('Stocké en CENTIMES (Int). 800 = 8,00 €.'),
  bullet('Jamais Float / Decimal — précision impérative pour la finance.'),
  h2('Disponibilité'),
  bullet('availableFrom / availableUntil : fenêtre horaire optionnelle (ex : menu petit-déjeuner jusqu\'à 11h)'),
  bullet('Validation : availableUntil DOIT être strictement après availableFrom (BadRequestException)'),
  bullet('Stockés mais non appliqués Phase 4 — la vérification se fait Phase 6 au add-to-cart'),
  h2('Stock isAvailable'),
  bullet('quantity = 0 → isAvailable forcé à false automatiquement'),
  bullet('OPERATOR peut toggle isAvailable (route /availability) mais ne peut pas forcer true si quantity = 0'),
  bullet('MANAGER / ORG_ADMIN peuvent modifier la quantité'),
  h2('Sécurité cross-supplier'),
  bullet('categoryId DOIT appartenir au supplier ciblé (BadRequestException sinon)'),
  bullet('pickupPointId : si scopé à un supplier, doit matcher le supplier du stock (BadRequestException sinon)'),

  pageBreak(),
  h1('4. ENDPOINTS'),
  h2('Categories'),
  code('POST   /organizations/:orgId/suppliers/:supplierId/categories'),
  code('GET    /organizations/:orgId/suppliers/:supplierId/categories'),
  code('GET    /organizations/:orgId/suppliers/:supplierId/categories/:id'),
  code('PATCH  /organizations/:orgId/suppliers/:supplierId/categories/:id'),
  code('DELETE /organizations/:orgId/suppliers/:supplierId/categories/:id'),
  h2('Products'),
  code('POST   /organizations/:orgId/suppliers/:supplierId/products'),
  code('GET    /organizations/:orgId/suppliers/:supplierId/products'),
  code('GET    /organizations/:orgId/suppliers/:supplierId/products/:id'),
  code('PATCH  /organizations/:orgId/suppliers/:supplierId/products/:id'),
  code('DELETE /organizations/:orgId/suppliers/:supplierId/products/:id'),
  h2('Stock'),
  code('POST   /organizations/:orgId/stock'),
  code('GET    /organizations/:orgId/stock?productId=&supplierId=&pickupPointId='),
  code('GET    /organizations/:orgId/stock/:id'),
  code('PATCH  /organizations/:orgId/stock/:id          → MANAGER / ORG_ADMIN'),
  code('PATCH  /organizations/:orgId/stock/:id/availability → OPERATOR allowed'),

  pageBreak(),
  h1('5. TESTS LIVRÉS'),
  bullet('categories.service.spec.ts : 9 tests (create, findAll, findOne, update, remove, P2003 conflict)'),
  bullet('products.service.spec.ts : 10 tests (create, supplier 404, category 404, cross-supplier rejet, date window invalide)'),
  bullet('stock.service.spec.ts : 10 tests (global / per-pp, auto-unavailable qty=0, cross-supplier pickup point rejet, OPERATOR toggle)'),
  bullet('Total backend Phase 4 (cumulatif) : 67 tests'),

  pageBreak(),
  h1('6. FICHIERS CLÉS'),
  code('backend/prisma/migrations/20260526_phase4_products_categories_stock/migration.sql'),
  code('backend/src/modules/categories/{categories.service.ts, categories.controller.ts, categories.module.ts}'),
  code('backend/src/modules/products/{products.service.ts, products.controller.ts, products.module.ts}'),
  code('backend/src/modules/stock/{stock.service.ts, stock.controller.ts, stock.module.ts}'),
  code('backend/src/modules/categories/categories.service.spec.ts'),
  code('backend/src/modules/products/products.service.spec.ts'),
  code('backend/src/modules/stock/stock.service.spec.ts'),

  pageBreak(),
  h1('7. POINTS DE VIGILANCE POUR LA SUITE'),
  bullet('La décrémentation de stock à la commande est en Phase 6 — Phase 4 ne touche pas au stock automatiquement (sauf qty=0 → isAvailable=false)'),
  bullet('availableFrom / availableUntil sont stockés mais non appliqués à l\'API Phase 4 — la fenêtre est vérifiée Phase 6 lors du add-to-cart'),
  bullet('Suppression de Category bloquée si produits référencent → utiliser PATCH status=ARCHIVED à la place pour soft-delete'),
  bullet('Prix Product = source de vérité au cart-time, mais Phase 5 snapshote au checkout pour figer le montant Stripe'),
];

const doc = new Document({
  styles: {
    default: { document: { run: { font: ARIAL, size: 22 } } },
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 360 } } } }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, 'PHASE_4_PRODUCTS_CATEGORIES_STOCK.docx');
  fs.writeFileSync(out, buf);
  console.log('Wrote', out);
});
