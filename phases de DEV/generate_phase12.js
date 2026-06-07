/**
 * generate_phase12.js
 *
 * Generates PHASE_12_ADMIN_V1_COMPLET.docx — Technical Brief for Phase 12.
 * Updated: 2026-06-02 (post-audit v2, inclut blocs 12.1 → 12.9 + corrections audit)
 *
 * Run from monorepo root:
 *   node "phases de DEV/generate_phase12.js"
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, LevelFormat, TabStopType, TabStopPosition,
} = require('docx');
const fs   = require('fs');
const path = require('path');

// ─── Design tokens ─────────────────────────────────────────────────────────────

const PURPLE = '6d28d9';
const DARK   = '1f2937';
const GRAY   = '6b7280';
const GREEN  = '065f46';
const RED    = '991b1b';
const ORANGE = '92400e';
const bg1    = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
const borders = { top: bg1, bottom: bg1, left: bg1, right: bg1 };

// ─── Helpers ───────────────────────────────────────────────────────────────────

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun({ text, bold: true, color: PURPLE, size: 36, font: 'Arial' })],
  spacing: { before: 400, after: 160 },
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [new TextRun({ text, bold: true, color: DARK, size: 28, font: 'Arial' })],
  spacing: { before: 280, after: 120 },
});

const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  children: [new TextRun({ text, bold: true, color: GRAY, size: 24, font: 'Arial' })],
  spacing: { before: 200, after: 80 },
});

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, size: 22, font: 'Arial', color: DARK, ...opts })],
  spacing: { after: 100 },
});

const pGray = (text) => p(text, { color: GRAY, italics: true });

const code = (text) => new Paragraph({
  children: [new TextRun({ text, font: 'Courier New', size: 18, color: '1e3a5f' })],
  spacing: { after: 60 },
  shading: { fill: 'F3F4F6', type: ShadingType.CLEAR },
  indent: { left: 360 },
});

const bullet = (text, opts = {}) => new Paragraph({
  numbering: { reference: 'bullets', level: 0 },
  children: [new TextRun({ text, size: 22, font: 'Arial', color: DARK, ...opts })],
  spacing: { after: 80 },
});

const spacer = () => new Paragraph({ children: [new TextRun('')], spacing: { after: 160 } });

const kvRow = (key, val, bg = 'FFFFFF') => new TableRow({
  children: [
    new TableCell({
      borders,
      width: { size: 2800, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: key, bold: true, size: 20, font: 'Arial', color: DARK })] })],
    }),
    new TableCell({
      borders,
      width: { size: 6560, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: val, size: 20, font: 'Arial', color: DARK })] })],
    }),
  ],
});

const blocHeader = (num, title, color = 'EDE9FE') => new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [9360],
  rows: [new TableRow({
    children: [new TableCell({
      borders,
      width: { size: 9360, type: WidthType.DXA },
      shading: { fill: color, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 200, right: 120 },
      children: [new Paragraph({
        children: [
          new TextRun({ text: `BLOC ${num} — `, size: 26, bold: true, font: 'Arial', color: PURPLE }),
          new TextRun({ text: title, size: 26, bold: true, font: 'Arial', color: DARK }),
        ],
      })],
    })],
  })],
});

const divider = () => new Paragraph({
  children: [new TextRun('')],
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB', space: 1 } },
  spacing: { after: 200 },
});

const routeRow = (method, route, desc, bg = 'FFFFFF') => new TableRow({
  children: [
    new TableCell({
      borders,
      width: { size: 800, type: WidthType.DXA },
      shading: { fill: method === 'GET' ? 'DBEAFE' : method === 'POST' ? 'D1FAE5' : method === 'PATCH' ? 'FEF3C7' : 'FEE2E2', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 80, right: 80 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: method, size: 18, font: 'Arial', bold: true, color: method === 'GET' ? '1e40af' : method === 'POST' ? '065f46' : method === 'PATCH' ? '92400e' : '991b1b' })] })],
    }),
    new TableCell({
      borders,
      width: { size: 3760, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: route, size: 18, font: 'Courier New', color: '1e3a5f' })] })],
    }),
    new TableCell({
      borders,
      width: { size: 4800, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: desc, size: 18, font: 'Arial', color: DARK })] })],
    }),
  ],
});

const tableHeader = (cols, widths) => new TableRow({
  children: cols.map((h, i) => new TableCell({
    borders,
    width: { size: widths[i], type: WidthType.DXA },
    shading: { fill: '1F2937', type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text: h, size: 20, bold: true, font: 'Arial', color: 'FFFFFF' })] })],
  })),
});

// ─── Document ──────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
  },

  styles: {
    default: {
      document: { run: { font: 'Arial', size: 22 } },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: PURPLE },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: DARK },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: GRAY },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
      },
    ],
  },

  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'BREAK EAT — PHASE 12 : ADMIN V1 COMPLET', size: 18, font: 'Arial', color: GRAY }),
            new TextRun({ text: '\tTechnical Brief v2 — 02/06/2026', size: 18, font: 'Arial', color: GRAY }),
          ],
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 1 } },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'BREAK EAT — Confidentiel', size: 18, font: 'Arial', color: GRAY }),
            new TextRun({ text: '\tPage ', size: 18, font: 'Arial', color: GRAY }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Arial', color: GRAY }),
          ],
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 1 } },
        })],
      }),
    },

    children: [

      // ─── Cover ─────────────────────────────────────────────────────────────────
      new Paragraph({
        children: [new TextRun({ text: 'BREAK EAT', size: 56, bold: true, font: 'Arial', color: PURPLE })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 480, after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'PHASE 12 — ADMIN V1 COMPLET', size: 40, bold: true, font: 'Arial', color: DARK })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', size: 24, font: 'Arial', color: GRAY, italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: '02/06/2026 — Version 2 (post-audit, blocs 12.1-12.9)', size: 22, font: 'Arial', color: GRAY })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
      }),

      divider(),
      spacer(),

      // ─── Section 1: Vue d'ensemble ─────────────────────────────────────────────
      h1('1. Vue d\'ensemble de la Phase 12'),
      p('Phase 12 complete le panel d\'administration pour couvrir tout le flux de demonstration : creation de lieux, fournisseurs avec catalogue complet, evenements enrichis, wizard demo, gestion d\'equipe, branding, et dashboard operateur filtre par fournisseur.'),
      spacer(),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 6560],
        rows: [
          kvRow('Blocs', '12.1 Lieux | 12.2 Fournisseurs | 12.3 Catalogue | 12.4 Evenement enrichi | 12.5 Demo wizard | 12.6 Operator home | 12.7 Equipe | 12.8 Branding | 12.9 Dashboard filtre', 'F9FAFB'),
          kvRow('Status', 'Phase terminee + auditee (post-audit v2)', 'FFFFFF'),
          kvRow('Tests', '273/273 NestJS passent | TypeScript 0 erreurs', 'F9FAFB'),
          kvRow('Correction audit', 'P1 securite fixe (supplierId enforcement) | P2 branding fix (effacement logo)', 'FEF9C3'),
        ],
      }),

      spacer(),
      divider(),

      // ─── Section 2: Schema Prisma ──────────────────────────────────────────────
      h1('2. Evolutions du Schema Prisma'),
      p('Phase 12 ajoute plusieurs migrations Prisma sur le modele existant.'),
      spacer(),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 2200, 4160],
        rows: [
          tableHeader(['Modele', 'Champs ajoutes', 'Notes'], [3000, 2200, 4160]),
          ...[
            ['OrganizationMember', 'supplierId String?', 'FK vers Supplier. onDelete: SetNull. Null si pas d\'assignation.'],
            ['Supplier', 'assignedOperators []', 'Relation inverse vers OrganizationMember.'],
            ['Organization', 'logoUrl, primaryColor, description', 'Branding V1 — URL seulement, pas de upload.'],
            ['Event', 'description, logoUrl, primaryColor', 'Meme champs branding que Organization.'],
          ].map(([model, fields, notes], i) => new TableRow({
            children: [model, fields, notes].map((val, j) => new TableCell({
              borders,
              width: { size: [3000, 2200, 4160][j], type: WidthType.DXA },
              shading: { fill: i % 2 === 0 ? 'F9FAFB' : 'FFFFFF', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: val, size: 18, font: j === 1 ? 'Courier New' : 'Arial', color: DARK })] })],
            })),
          })),
        ],
      }),

      spacer(),
      divider(),

      // ─── Blocs 12.1 + 12.2 ────────────────────────────────────────────────────
      h1('3. BLOC 12.1 — Lieux (Venues) CRUD'),
      blocHeader('12.1', 'Venues CRUD admin', 'EDE9FE'),
      spacer(),
      h2('Objectif'),
      p('Permettre la creation et la liste des lieux (salles, stades) depuis l\'admin panel. Un lieu est un prerequis pour creer un evenement.'),
      h2('Routes backend'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [800, 3760, 4800],
        rows: [
          tableHeader(['', 'Route', 'Description'], [800, 3760, 4800]),
          routeRow('GET', '/organizations/:id/venues', 'Liste tous les lieux de l\'organisation'),
          routeRow('POST', '/organizations/:id/venues', 'Cree un lieu (name, address, timezone?)'),
        ],
      }),
      spacer(),
      h2('Page admin'),
      bullet('Liste des lieux avec adresse et statut'),
      bullet('Formulaire creation en bas de page (nom, adresse, timezone optionnel)'),
      code('apps/admin/src/app/(admin)/venues/page.tsx'),

      spacer(),
      divider(),

      h1('4. BLOCS 12.2 + 12.3 — Fournisseurs et Catalogue'),
      blocHeader('12.2 + 12.3', 'Fournisseurs admin + categories + produits', 'EDE9FE'),
      spacer(),
      h2('Routes backend'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [800, 3760, 4800],
        rows: [
          tableHeader(['', 'Route', 'Description'], [800, 3760, 4800]),
          routeRow('GET', '/organizations/:id/suppliers', 'Liste fournisseurs de l\'org'),
          routeRow('POST', '/organizations/:id/suppliers', 'Cree un fournisseur (name, preparationZone?)'),
          routeRow('GET', '/organizations/:id/suppliers/:sid/products', 'Liste produits d\'un fournisseur'),
          routeRow('POST', '/organizations/:id/suppliers/:sid/products', 'Cree un produit (name, price, categoryId, description?)'),
          routeRow('DELETE', '/organizations/:id/suppliers/:sid/products/:pid', 'Supprime un produit'),
          routeRow('GET', '/organizations/:id/categories', 'Liste categories de l\'org'),
          routeRow('POST', '/organizations/:id/categories', 'Cree une categorie (name, sortOrder?)'),
        ],
      }),
      spacer(),
      h2('Page fournisseur detail (/suppliers/[id])'),
      bullet('Deux sections : Categories (creation) et Produits (creation + suppression)'),
      bullet('Produit : nom, prix (en centimes), categorie, description optionnelle'),
      bullet('Suppression produit avec confirmation confirm()'),
      code('apps/admin/src/app/(admin)/suppliers/[id]/page.tsx'),

      spacer(),
      divider(),

      // ─── Bloc 12.4 ────────────────────────────────────────────────────────────
      h1('5. BLOC 12.4 — Evenement enrichi (Points de retrait, Creneaux, QR)'),
      blocHeader('12.4', 'Event detail : pickup points, slots, QR code, branding', 'EDE9FE'),
      spacer(),
      h2('Sections de la page /events/[id]'),
      bullet('Statut evenement : select + bouton PATCH /events/:id/status'),
      bullet('Fournisseurs attaches : list + bouton attacher/detacher'),
      bullet('Creation fournisseur rapide depuis la page evenement'),
      bullet('Points de retrait : creation (nom + lieu) et liste'),
      bullet('Creneaux horaires : creation (startAt, endAt, capacity) + suppression'),
      bullet('Branding : description, logoUrl (avec preview), color picker + input hex'),
      spacer(),
      h2('Routes backup'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [800, 3760, 4800],
        rows: [
          tableHeader(['', 'Route', 'Description'], [800, 3760, 4800]),
          routeRow('GET', '/organizations/:id/pickup-points', 'Liste points de retrait (filtrable par eventId, venueId)'),
          routeRow('POST', '/organizations/:id/pickup-points', 'Cree un point de retrait'),
          routeRow('GET', '/events/:id/slots', 'Liste creneaux d\'un evenement'),
          routeRow('POST', '/events/:id/slots', 'Cree un creneau'),
          routeRow('DELETE', '/events/:id/slots/:slotId', 'Supprime un creneau'),
          routeRow('PATCH', '/organizations/:id/events/:eid/status', 'Change le statut de l\'evenement'),
        ],
      }),
      code('apps/admin/src/app/(admin)/events/[id]/page.tsx'),

      spacer(),
      divider(),

      // ─── Bloc 12.5 ────────────────────────────────────────────────────────────
      h1('6. BLOC 12.5 — Demo Setup Wizard'),
      blocHeader('12.5', 'Wizard creation demo "Spartiates" en 1 clic', 'EDE9FE'),
      spacer(),
      p('Page /demo-setup : execute en sequence 9 etapes pour creer un environnement de demo complet, pret pour une demonstration en direct.'),
      h2('Etapes du wizard'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [600, 2500, 6260],
        rows: [
          tableHeader(['#', 'Etape', 'Action'], [600, 2500, 6260]),
          ...[
            ['1', 'Lieu', 'Cree "Patinoire des Spartiates" avec adresse et timezone'],
            ['2', 'Evenement', 'Cree "Match Spartiates vs Aigles" avec dates relatives'],
            ['3', 'Fournisseur', 'Cree "Buvette Nord" rattachee a l\'org'],
            ['4', 'Attachement', 'Attache Buvette Nord a l\'evenement'],
            ['5', 'Categories', 'Cree "Boissons" et "Snacks"'],
            ['6', 'Produits', 'Cree Coca-Cola, Hot-Dog, Biere Pression'],
            ['7', 'Points retrait', 'Cree 2 points de retrait pour l\'evenement'],
            ['8', 'Creneaux', 'Cree des creneaux horaires sur la duree de l\'evenement'],
            ['9', 'Activation', 'Passe le statut de l\'evenement de DRAFT a ACTIVE'],
          ].map(([num, step, action], i) => new TableRow({
            children: [num, step, action].map((val, j) => new TableCell({
              borders,
              width: { size: [600, 2500, 6260][j], type: WidthType.DXA },
              shading: { fill: i % 2 === 0 ? 'F9FAFB' : 'FFFFFF', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: val, size: 18, font: 'Arial', color: DARK })] })],
            })),
          })),
        ],
      }),
      spacer(),
      h2('Resultat affiché'),
      bullet('URL de l\'evenement : /events/[eventId]'),
      bullet('URL du dashboard operateur : /dashboard/[eventId] (port 3002)'),
      bullet('Status de chaque etape : pending / running / ok / error (avec message)'),
      code('apps/admin/src/app/(admin)/demo-setup/page.tsx'),

      spacer(),
      divider(),

      // ─── Bloc 12.6 ────────────────────────────────────────────────────────────
      h1('7. BLOC 12.6 — Operator Home V2'),
      blocHeader('12.6', 'Operateur : selection d\'evenement + badge fournisseur', 'EDE9FE'),
      spacer(),
      p('L\'app operateur (apps/operator, port 3002) remplace l\'ancienne page statique par une interface de selection d\'evenement dynamique.'),
      h2('Flux utilisateur'),
      bullet('L\'operateur se connecte (email + password)'),
      bullet('L\'app appelle GET /auth/me/memberships pour obtenir l\'organisation et le fournisseur assigne'),
      bullet('La liste des evenements actifs de l\'organisation est affichee'),
      bullet('L\'operateur clique sur un evenement pour acceder au dashboard des commandes'),
      bullet('Si l\'operateur a un fournisseur assigne : badge "Buvette Nord" affiché en permanence'),
      h2('Stockage localStorage'),
      bullet('operator_token — JWT access token'),
      bullet('operator_supplier_id — UUID du fournisseur assigne (ou absent)'),
      bullet('operator_supplier_name — Nom affiché dans le badge'),
      code('apps/operator/src/app/page.tsx'),

      spacer(),
      divider(),

      // ─── Bloc 12.7 ────────────────────────────────────────────────────────────
      h1('8. BLOC 12.7 — Gestion d\'equipe et invitation par email'),
      blocHeader('12.7', 'Team management : invite par email + assignation fournisseur', 'EDE9FE'),
      spacer(),
      h2('Probleme resolu'),
      p('Avant ce bloc, ajouter un membre d\'organisation necessitait de connaitre son UUID. Les operateurs ne pouvaient pas etre associes a un fournisseur specifique.'),
      h2('Schema'),
      p('OrganizationMember.supplierId String? — FK nullable vers Supplier. onDelete: SetNull (si le fournisseur est supprime, l\'assignation est effacee automatiquement).'),
      h2('Nouveau endpoint : invitation par email'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [800, 3760, 4800],
        rows: [
          tableHeader(['', 'Route', 'Description'], [800, 3760, 4800]),
          routeRow('GET', '/organizations/:id/members', 'Liste membres enrichis (user.email, user.displayName, supplier)'),
          routeRow('POST', '/organizations/:id/invite', 'Invite par email (email, role, supplierId?) — 404 si email inconnu'),
          routeRow('DELETE', '/organizations/:id/members/:memberId', 'Retire un membre (impossible de se retirer soi-meme)'),
        ],
      }),
      spacer(),
      h2('InviteMemberDto'),
      code('email: string (@IsEmail)'),
      code('role: OrgRole (@IsEnum)'),
      code('supplierId?: string | undefined (@IsOptional @IsUUID)'),
      spacer(),
      h2('Validation supplementaire dans inviteByEmail()'),
      bullet('Cherche l\'utilisateur par email.toLowerCase()'),
      bullet('NotFoundException avec message francais si email pas trouve'),
      bullet('ConflictException si l\'utilisateur est deja membre'),
      bullet('Verifie que le supplierId (si fourni) appartient bien a l\'organisation'),
      h2('Page /team'),
      bullet('Tableau : displayName, email, role badge colore, fournisseur assigne, bouton Retirer'),
      bullet('Formulaire invitation : email, role, select fournisseur (affiche uniquement si role = OPERATOR)'),
      bullet('Promise.all pour charger membres + fournisseurs en parallele'),
      code('apps/admin/src/app/(admin)/team/page.tsx'),
      code('backend/src/modules/organizations/dto/invite-member.dto.ts'),
      code('backend/src/modules/organizations/organizations.service.ts — inviteByEmail(), getMembers(), removeMember()'),

      spacer(),
      divider(),

      // ─── Bloc 12.8 ────────────────────────────────────────────────────────────
      h1('9. BLOC 12.8 — Branding (logo, couleur, description)'),
      blocHeader('12.8', 'Branding V1 : logoUrl, primaryColor, description sur Org et Event', 'EDE9FE'),
      spacer(),
      h2('Champs ajoutes'),
      bullet('logoUrl String? — URL HTTPS vers l\'image du logo (validation @IsUrl)'),
      bullet('primaryColor String? — code hex 6 chiffres (#FF5500) (validation @Matches regex)'),
      bullet('description String? — texte libre, max 2000 caracteres'),
      h2('UpdateOrgBrandingDto'),
      p('Tous les champs optionnels. PATCH semantique : seuls les champs fournis sont mis a jour.'),
      bullet('Envoyer champ absent = ne pas modifier ce champ (undefined)'),
      bullet('Envoyer champ vide \'\' = effacer le champ (transforme en null par @Transform)'),
      bullet('Envoyer URL valide = mettre a jour'),
      h2('Fix audit P2 : effacement du logo'),
      p('Bug initial : @IsUrl() rejetait les chaines vides. Fix : @Transform((\'\' -> null)) ajoute sur logoUrl, primaryColor, description dans les deux DTOs. @IsOptional() accepte null et saute les validators suivants.'),
      code('backend/src/modules/organizations/dto/update-org-branding.dto.ts — @Transform + types string | null'),
      code('backend/src/modules/events/dto/update-event.dto.ts — meme correction'),
      spacer(),
      h2('Interface admin'),
      bullet('Organization detail : section Branding avec logo preview (img + onError), color picker natif + input hex, textarea description'),
      bullet('Event detail : meme section Branding, pre-remplie depuis les donnees de l\'evenement'),
      code('apps/admin/src/app/(admin)/organizations/[id]/page.tsx — handleSaveBranding()'),
      code('apps/admin/src/app/(admin)/events/[id]/page.tsx — handleSaveBranding()'),

      spacer(),
      divider(),

      // ─── Bloc 12.9 ────────────────────────────────────────────────────────────
      h1('10. BLOC 12.9 — Dashboard Operateur Filtre par Fournisseur'),
      blocHeader('12.9', 'Dashboard filtre : operateur ne voit que son fournisseur', 'EDE9FE'),
      spacer(),
      h2('Probleme resolu'),
      p('Un operateur de "Buvette Nord" voyait les commandes de tous les fournisseurs de l\'evenement, y compris celles de "Buvette Sud".'),
      h2('Solution : enforcement cote backend (post-audit P1)'),
      p('Critique : l\'enforcement doit etre cote BACKEND, pas seulement cote UI. Le query param ?supplierId peut etre retire ou modifie par l\'operateur.'),
      spacer(),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [9360],
        rows: [new TableRow({
          children: [new TableCell({
            borders,
            width: { size: 9360, type: WidthType.DXA },
            shading: { fill: 'FEF2F2', type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 200, right: 120 },
            children: [
              new Paragraph({ children: [new TextRun({ text: 'CORRECTION AUDIT P1 — Securite', size: 22, bold: true, font: 'Arial', color: RED })] }),
              new Paragraph({ children: [new TextRun({ text: 'Avant le fix : un operateur avec supplierId pouvait retirer ?supplierId= de l\'URL et voir toutes les commandes.', size: 20, font: 'Arial', color: DARK })] }),
              new Paragraph({ children: [new TextRun({ text: 'Apres le fix : findDashboard() lit membership.supplierId depuis la DB. Si l\'operateur a un fournisseur assigne, il est TOUJOURS applique, peu importe le query param.', size: 20, font: 'Arial', color: DARK })] }),
            ],
          })],
        })],
      }),
      spacer(),
      h2('Logique d\'enforcement'),
      code('const effectiveSupplierId = membership.supplierId ?? supplierId ?? undefined;'),
      p('Si membership.supplierId est non-null (operateur assigne) -> toujours utilise. Si null (operateur non assigne) -> query param optionnel utilise. Les deux cas sont geres.'),
      spacer(),
      h2('Flux complet'),
      bullet('1. Operateur se connecte -> app lit membership.supplierId depuis /auth/me/memberships'),
      bullet('2. Stocke operator_supplier_id dans localStorage'),
      bullet('3. Dashboard appelle GET /orders/event/:id/dashboard?supplierId=<uuid>'),
      bullet('4. Backend verifie membership depuis DB, applique l\'enforcement'),
      bullet('5. Seules les commandes du fournisseur assigne sont retournees'),
      spacer(),
      h2('Fichiers cles'),
      code('backend/src/modules/orders/orders.controller.ts — findDashboard() avec enforcement'),
      code('backend/src/modules/orders/orders.service.ts — findDashboardByEvent(eventId, supplierId?)'),
      code('apps/operator/src/lib/api/orders-client.ts — fetchDashboard(eventId, token, supplierId?)'),
      code('apps/operator/src/hooks/useDashboard.ts — option supplierId? transmise a fetchDashboard'),
      code('apps/operator/src/app/dashboard/[eventId]/page.tsx — lit operator_supplier_id depuis localStorage'),

      spacer(),
      divider(),

      // ─── Section 11: Audit ────────────────────────────────────────────────────
      h1('11. Resultats de l\'Audit Phase 12'),
      h2('Tableau des findings'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [700, 2000, 4260, 2400],
        rows: [
          tableHeader(['P', 'Zone', 'Description', 'Statut'], [700, 2000, 4260, 2400]),
          ...[
            ['P1', 'Securite', 'supplierId query param non enforced en backend — operateur pouvait voir tous les fournisseurs', 'CORRIGE'],
            ['P2', 'Branding DTO', '@IsUrl() rejetait \'\' — impossible d\'effacer un logo une fois defini', 'CORRIGE'],
            ['P2', 'Team', 'Pas d\'endpoint PATCH pour modifier le role/fournisseur d\'un membre existant (suppression+re-invitation requise)', 'Backlog P13'],
            ['P2', 'Operator app', 'supplierId en localStorage peut devenir obsolete si l\'admin change l\'assignation sans que l\'operateur se reconnecte', 'Backlog'],
            ['P3', 'Operator page', 'window.location.href au lieu de router.push() — cause un rechargement complet', 'Backlog'],
          ].map(([prio, zone, desc, status], i) => new TableRow({
            children: [prio, zone, desc, status].map((val, j) => new TableCell({
              borders,
              width: { size: [700, 2000, 4260, 2400][j], type: WidthType.DXA },
              shading: { fill: prio === 'P1' ? 'FEF2F2' : prio === 'P2' ? 'FFFBEB' : 'F0FDF4', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: val, size: 18, font: 'Arial', color: prio === 'P1' ? RED : DARK, bold: j === 0 })] })],
            })),
          })),
        ],
      }),

      spacer(),
      divider(),

      // ─── Section 12: Tests ────────────────────────────────────────────────────
      h1('12. Tests et Verification'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4560, 1400, 1400, 2000],
        rows: [
          tableHeader(['Suite de tests', 'Tests', 'Statut', 'Notes'], [4560, 1400, 1400, 2000]),
          ...[
            ['orders.service.spec.ts', '86', 'PASS', 'findDashboardByEvent + transitions'],
            ['organizations.service.spec.ts', '35', 'PASS', 'inviteByEmail, getMembers, removeMember, updateBranding'],
            ['events.service.spec.ts', '28', 'PASS', 'update() avec branding fields'],
            ['users.service.spec.ts', '18', 'PASS', 'findByIdWithMemberships'],
            ['Toutes les suites', '273', 'PASS', 'Aucune regression'],
          ].map(([suite, tests, status, notes], i) => new TableRow({
            children: [suite, tests, status, notes].map((val, j) => new TableCell({
              borders,
              width: { size: [4560, 1400, 1400, 2000][j], type: WidthType.DXA },
              shading: { fill: status === 'PASS' ? (i % 2 === 0 ? 'F0FDF4' : 'F9FAFB') : 'FEF2F2', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ alignment: j === 1 || j === 2 ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: val, size: 18, font: j === 0 ? 'Courier New' : 'Arial', color: j === 2 ? GREEN : DARK, bold: j === 2 })] })],
            })),
          })),
        ],
      }),

      spacer(),
      divider(),

      // ─── Section 13: Regles de modification ───────────────────────────────────
      h1('13. Regles de modification'),
      bullet('Ne jamais modifier l\'ordre des decorateurs @Transform -> @IsUrl (class-transformer execute dans l\'ordre de declaration)'),
      bullet('L\'enforcement supplierId dans findDashboard() lit toujours la DB — ne pas optimiser avec un cache localStorage'),
      bullet('Les champs branding sont nullable en DB (String?) — les Prisma queries doivent accepter null'),
      bullet('inviteByEmail() valide que le supplierId fourni appartient a l\'organisation — ne pas retirer cette validation'),
      bullet('removeMember() a une protection contre l\'auto-suppression — ne pas retirer'),
      bullet('Apres chaque modification de schema.prisma : npx prisma generate pour regenerer le client'),

      spacer(),
    ],
  }],
});

// ─── Write DOCX ───────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, 'PHASE_12_ADMIN_V1_COMPLET.docx');
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated: ${outPath}`);
}).catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
