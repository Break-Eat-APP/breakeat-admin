/**
 * generate_phase14.js
 *
 * Generates PHASE_14_BACKOFFICE_GROUPES.docx — Technical Brief for Phase 14.
 * Created: 2026-06-03
 *
 * Couvre : Back Office SUPER_ADMIN (apps/backoffice, port 3003)
 *          + Groupes rattachés à l'organisation (accès privé par événement).
 *
 * Run from monorepo root:
 *   node "phases de DEV/generate_phase14.js"
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, LevelFormat, PageOrientation,
} = require('docx');
const fs   = require('fs');
const path = require('path');

// ─── Design tokens (BREAK EAT — refonte white/orange) ───────────────────────────

const ORANGE = 'FC4002';
const ODARK  = 'DA3702';
const INK    = '1C1917';
const INKSOF = '44403C';
const GRAY   = '6B7280';
const GREEN  = '065F46';
const RED    = '991B1B';
const b1   = { style: BorderStyle.SINGLE, size: 1, color: 'E5E1DD' };
const borders = { top: b1, bottom: b1, left: b1, right: b1 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun({ text, bold: true, color: ORANGE, size: 36, font: 'Arial' })],
  spacing: { before: 400, after: 160 },
});

const h2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  children: [new TextRun({ text, bold: true, color: INK, size: 28, font: 'Arial' })],
  spacing: { before: 280, after: 120 },
});

const h3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  children: [new TextRun({ text, bold: true, color: GRAY, size: 24, font: 'Arial' })],
  spacing: { before: 200, after: 80 },
});

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, size: 22, font: 'Arial', color: INKSOF, ...opts })],
  spacing: { after: 100 },
});

const pGray = (text) => p(text, { color: GRAY, italics: true });

const code = (text) => new Paragraph({
  children: [new TextRun({ text, font: 'Courier New', size: 18, color: INK })],
  spacing: { after: 40 },
  shading: { fill: 'FAF7F5', type: ShadingType.CLEAR },
  indent: { left: 360 },
});

const bullet = (text, opts = {}) => new Paragraph({
  numbering: { reference: 'bullets', level: 0 },
  children: [new TextRun({ text, size: 22, font: 'Arial', color: INKSOF, ...opts })],
  spacing: { after: 80 },
});

const numbered = (text, opts = {}) => new Paragraph({
  numbering: { reference: 'numbers', level: 0 },
  children: [new TextRun({ text, size: 22, font: 'Arial', color: INKSOF, ...opts })],
  spacing: { after: 80 },
});

const spacer = () => new Paragraph({ children: [new TextRun('')], spacing: { after: 160 } });

const divider = () => new Paragraph({
  children: [new TextRun('')],
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'ECE3DD', space: 1 } },
  spacing: { after: 200 },
});

// Key/value 2-col row
const kvRow = (key, val, bg = 'FFFFFF') => new TableRow({
  children: [
    new TableCell({
      borders, width: { size: 2800, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: key, bold: true, size: 20, font: 'Arial', color: INK })] })],
    }),
    new TableCell({
      borders, width: { size: 6560, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: val, size: 20, font: 'Arial', color: INKSOF })] })],
    }),
  ],
});

// Generic N-column table
const cell = (text, width, { bg = 'FFFFFF', bold = false, color = INKSOF, font = 'Arial', size = 18, align } = {}) => new TableCell({
  borders, width: { size: width, type: WidthType.DXA },
  shading: { fill: bg, type: ShadingType.CLEAR },
  margins: { top: 70, bottom: 70, left: 110, right: 110 },
  children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold, size, font, color })] })],
});

const headerCell = (text, width) => cell(text, width, { bg: 'FDECE7', bold: true, color: ODARK, size: 18 });

const methodColor = (m) => m === 'GET' ? '1e40af' : m === 'POST' ? '065f46' : m === 'PATCH' ? '92400e' : m === 'DELETE' ? '991b1b' : INK;
const methodBg    = (m) => m === 'GET' ? 'DBEAFE' : m === 'POST' ? 'D1FAE5' : m === 'PATCH' ? 'FEF3C7' : m === 'DELETE' ? 'FEE2E2' : 'F3F4F6';

const routeRow = (method, route, guard, desc, bg = 'FFFFFF') => new TableRow({
  children: [
    new TableCell({
      borders, width: { size: 900, type: WidthType.DXA },
      shading: { fill: methodBg(method), type: ShadingType.CLEAR },
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: method, size: 16, font: 'Arial', bold: true, color: methodColor(method) })] })],
    }),
    cell(route, 3300, { font: 'Courier New', color: INK, size: 16, bg }),
    cell(guard, 1700, { color: GRAY, size: 16, bg }),
    cell(desc, 3460, { color: INKSOF, size: 16, bg }),
  ],
});

const table = (rows) => new Table({ width: { size: 9360, type: WidthType.DXA }, rows });

// ─── Document content ────────────────────────────────────────────────────────

const children = [];

// Cover
children.push(
  new Paragraph({ spacing: { before: 1200, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'BREAK EAT', bold: true, size: 64, font: 'Arial', color: ORANGE })] }),
  new Paragraph({ spacing: { before: 80, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'PHASE 14 — BACK OFFICE & GROUPES', bold: true, size: 40, font: 'Arial', color: INK })] }),
  new Paragraph({ spacing: { before: 200, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', size: 26, font: 'Arial', color: GRAY, italics: true })] }),
  new Paragraph({ spacing: { before: 120, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '03/06/2026', size: 22, font: 'Arial', color: GRAY })] }),
  new Paragraph({ spacing: { before: 600, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Back Office SUPER_ADMIN (apps/backoffice · port 3003)  ·  Groupes rattachés à l’organisation  ·  Accès privé par événement', size: 20, font: 'Arial', color: INKSOF })] }),
  new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: false }),
);

// ── 1. Objectif ──
children.push(
  new Paragraph({ pageBreakBefore: true, children: [] }),
  h1('1. Objectif de la phase'),
  p('La Phase 14 construit le troisième dashboard de la plateforme — le BACK OFFICE — et introduit la notion de GROUPES d’utilisateurs rattachés à une organisation. C’est le socle qui transforme Break Eat en plateforme multi-tenant à deux marchés : l’événementiel grand public (clubs sportifs) et la restauration corporate privée (entreprises).'),
  p('Deux livrables principaux :', { bold: true }),
  numbered('Le Back Office : un tableau de bord SÉPARÉ, réservé au SUPER_ADMIN (toi). C’est une vue « Dieu » transverse à TOUS les clubs et entreprises de la plateforme. Aucun mélange d’accès ni de paramètres avec les dashboards club ou opérateur.'),
  numbered('Les Groupes : un mécanisme de segmentation des comptes, propre à chaque organisation, qui permet (V1) de réserver l’accès à un événement à un public privé — et (plus tard) de cibler des codes promo.'),
  spacer(),
  p('Cas d’usage concret du privé : l’entreprise Boursorama active sa restauration interne. Tous les comptes en « @boursorama.com » rejoignent automatiquement le groupe « Boursorama ». L’événement « Boursorama Resto » est marqué PRIVÉ et réservé à ce groupe : il est invisible et non commandable pour le grand public, mais visible pour les salariés.'),
  divider(),
);

// ── 2. Architecture : 3 surfaces ──
children.push(
  h1('2. Architecture — les 3 surfaces étanches'),
  p('Trois applications distinctes, trois ports, trois périmètres d’accès qui ne se chevauchent jamais. La Phase 14 ajoute la troisième.'),
  spacer(),
  table([
    new TableRow({ children: [headerCell('Surface', 2300), headerCell('App / Port', 2300), headerCell('Qui', 1900), headerCell('Périmètre', 2860)] }),
    new TableRow({ children: [cell('Dashboard CLUB', 2300, { bold: true, color: INK }), cell('apps/admin · 3001', 2300, { font: 'Courier New', size: 16 }), cell('Admin d’une org', 1900), cell('Uniquement SON organisation : events, fournisseurs, équipe, branding, groupes', 2860)] }),
    new TableRow({ children: [cell('Dashboard OPÉRATEUR', 2300, { bold: true, color: INK }), cell('apps/operator · 3002', 2300, { font: 'Courier New', size: 16 }), cell('Staff fournisseur', 1900), cell('Les commandes temps réel de SON stand', 2860)] }),
    new TableRow({ children: [cell('BACK OFFICE', 2300, { bold: true, color: ODARK, bg: 'FDECE7' }), cell('apps/backoffice · 3003', 2300, { font: 'Courier New', size: 16, bg: 'FDECE7' }), cell('SUPER_ADMIN (toi)', 1900, { bg: 'FDECE7' }), cell('Vue transverse sur TOUS les tenants : KPIs globaux, gestion des orgs, supervision des groupes', 2860, { bg: 'FDECE7' })] }),
  ]),
  spacer(),
  p('Règle d’or : un club ne voit que lui-même ; le SUPER_ADMIN voit tout. La séparation est garantie côté serveur (guards), jamais seulement côté UI.', { italics: true, color: GRAY }),
  divider(),
);

// ── 3. Modèle de données ──
children.push(
  h1('3. Modèle de données (Prisma)'),
  p('Trois ajouts au schéma : le modèle Group, sa table de membres GroupMember, et le passage des événements en public/privé via une enum + une table de liaison EventGroup.'),

  h2('3.1 — Group (rattaché à l’organisation)'),
  code('model Group {'),
  code('  id             String        @id @default(uuid()) @db.Uuid'),
  code('  organizationId String        @db.Uuid'),
  code('  name           String'),
  code('  description    String?'),
  code('  emailDomain    String?       // règle d’adhésion auto (ex: "boursorama.com")'),
  code('  createdAt      DateTime      @default(now())'),
  code('  updatedAt      DateTime      @updatedAt'),
  code('  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)'),
  code('  members        GroupMember[]'),
  code('  events         EventGroup[]'),
  code('  @@unique([organizationId, name])'),
  code('  @@index([organizationId])'),
  code('  @@index([emailDomain])'),
  code('}'),
  spacer(),

  h2('3.2 — GroupMember (adhésion manuelle ou par domaine)'),
  code('enum GroupMemberSource { MANUAL  DOMAIN }'),
  code(''),
  code('model GroupMember {'),
  code('  id        String            @id @default(uuid()) @db.Uuid'),
  code('  groupId   String            @db.Uuid'),
  code('  userId    String            @db.Uuid'),
  code('  source    GroupMemberSource @default(MANUAL)'),
  code('  createdAt DateTime          @default(now())'),
  code('  group     Group             @relation(fields: [groupId], references: [id], onDelete: Cascade)'),
  code('  user      User              @relation(fields: [userId], references: [id], onDelete: Cascade)'),
  code('  @@unique([groupId, userId])'),
  code('  @@index([userId])'),
  code('}'),
  spacer(),

  h2('3.3 — Event : visibilité publique / privée'),
  code('enum EventVisibility { PUBLIC  PRIVATE }'),
  code(''),
  code('model Event {'),
  code('  // ... champs existants'),
  code('  visibility  EventVisibility @default(PUBLIC)'),
  code('  groups      EventGroup[]'),
  code('}'),
  code(''),
  code('model EventGroup {            // quels groupes peuvent accéder à un event PRIVATE'),
  code('  eventId String @db.Uuid'),
  code('  groupId String @db.Uuid'),
  code('  event   Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)'),
  code('  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)'),
  code('  @@id([eventId, groupId])'),
  code('}'),
  spacer(),
  p('Migration : 20260603_phase14_groups_event_visibility. Les events existants restent PUBLIC par défaut — aucune régression de visibilité.', { italics: true, color: GRAY }),
  divider(),
);

// ── 4. Backend ──
children.push(
  h1('4. Backend (NestJS)'),

  h2('4.1 — GroupsModule (org-scoped, géré par le club)'),
  p('CRUD des groupes + gestion des membres. Toutes les routes passent par requireOrgAccess — un club ne touche QUE ses propres groupes. Le SUPER_ADMIN bypass déjà en place lui donne l’accès transverse.'),
  spacer(),
  table([
    new TableRow({ children: [headerCell('Méthode', 900), headerCell('Route', 3300), headerCell('Guard', 1700), headerCell('Rôle', 3460)] }),
    routeRow('GET',    '/organizations/:id/groups',                'OrgAccess', 'Lister les groupes de l’org'),
    routeRow('POST',   '/organizations/:id/groups',                'OrgAccess', 'Créer un groupe (+ emailDomain optionnel)', 'FAFAFA'),
    routeRow('PATCH',  '/organizations/:id/groups/:gid',           'OrgAccess', 'Renommer / changer la règle de domaine'),
    routeRow('DELETE', '/organizations/:id/groups/:gid',           'OrgAccess', 'Supprimer un groupe', 'FAFAFA'),
    routeRow('GET',    '/organizations/:id/groups/:gid/members',   'OrgAccess', 'Lister les membres'),
    routeRow('POST',   '/organizations/:id/groups/:gid/members',   'OrgAccess', 'Ajouter un membre (email → user, source=MANUAL)', 'FAFAFA'),
    routeRow('DELETE', '/organizations/:id/groups/:gid/members/:uid', 'OrgAccess', 'Retirer un membre'),
  ]),
  spacer(),

  h2('4.2 — Adhésion automatique par domaine'),
  p('À l’inscription (ou à la première connexion), si l’email du compte correspond au emailDomain d’un groupe de l’organisation concernée, on crée un GroupMember(source=DOMAIN). Hook dans UsersService / AuthService, idempotent (le @@unique([groupId, userId]) empêche les doublons).'),
  spacer(),

  h2('4.3 — Application de l’accès privé (le cœur sécurité)'),
  p('La visibilité d’un événement est filtrée CÔTÉ SERVEUR. Jamais de confiance au client.'),
  bullet('Listing public : les events PRIVATE sont exclus pour un visiteur non membre. Un membre d’un groupe autorisé les voit.'),
  bullet('Détail / accès direct (deep link) : GET d’un event PRIVATE → 404 (et non 403, pour ne pas révéler l’existence) si l’utilisateur n’appartient à aucun groupe lié.'),
  bullet('Commande : la création de panier / checkout revérifie l’appartenance — un event privé ne peut pas être commandé par un non-membre, même avec l’UUID.'),
  bullet('Endpoints concernés : public-events.controller (qui devient « events accessibles » et requiert un token pour les privés) + cart.service / orders.service (garde d’éligibilité).'),
  spacer(),

  h2('4.4 — BackofficeModule (SUPER_ADMIN uniquement)'),
  p('Nouveau module protégé par un guard de rôle global SUPER_ADMIN. Agrège les données de TOUS les tenants.'),
  spacer(),
  table([
    new TableRow({ children: [headerCell('Méthode', 900), headerCell('Route', 3300), headerCell('Guard', 1700), headerCell('Rôle', 3460)] }),
    routeRow('GET',   '/backoffice/kpis',                 'SuperAdmin', 'KPIs globaux : CA HT/TTC, nb commandes, panier moyen, comptes — filtres org + période'),
    routeRow('GET',   '/backoffice/organizations',        'SuperAdmin', 'Lister tous les tenants + statut + compteurs', 'FAFAFA'),
    routeRow('POST',  '/backoffice/organizations',        'SuperAdmin', 'Créer une organisation (club / entreprise)'),
    routeRow('PATCH', '/backoffice/organizations/:id',    'SuperAdmin', 'Activer / désactiver / éditer un tenant', 'FAFAFA'),
    routeRow('GET',   '/backoffice/groups',               'SuperAdmin', 'Supervision transverse des groupes (tous tenants)'),
  ]),
  spacer(),
  p('CA HT vs TTC : le CA TTC = somme des montants payés ; le CA HT se déduit du taux de TVA applicable (à stocker par produit ou par org). Le panier moyen = CA / nb commandes. Comptes inscrits = count(User).', { italics: true, color: GRAY }),
  divider(),
);

// ── 5. App Back Office ──
children.push(
  h1('5. Application Back Office (apps/backoffice · port 3003)'),
  p('Next.js 15 App Router, mêmes conventions que les autres surfaces : styles inline, tokens partagés via @break-eat/brand (fond blanc, orange #FC4002, police Fredoka), logo « B éclair ». Accès strictement SUPER_ADMIN.'),
  spacer(),
  table([
    new TableRow({ children: [headerCell('Route', 3200), headerCell('Page', 6160)] }),
    new TableRow({ children: [cell('/login', 3200, { font: 'Courier New', size: 16 }), cell('Connexion SUPER_ADMIN (lockup logo complet)', 6160)] }),
    new TableRow({ children: [cell('/(backoffice)/overview', 3200, { font: 'Courier New', size: 16, bg: 'FAFAFA' }), cell('KPIs globaux : cartes CA HT/TTC, commandes, panier moyen, comptes + filtres club/période', 6160, { bg: 'FAFAFA' })] }),
    new TableRow({ children: [cell('/(backoffice)/organizations', 3200, { font: 'Courier New', size: 16 }), cell('Liste de tous les tenants : créer, activer/désactiver, accéder au détail', 6160)] }),
    new TableRow({ children: [cell('/(backoffice)/organizations/[id]', 3200, { font: 'Courier New', size: 16, bg: 'FAFAFA' }), cell('Détail d’un tenant : infos, KPIs de l’org, ses groupes', 6160, { bg: 'FAFAFA' })] }),
    new TableRow({ children: [cell('/(backoffice)/groups', 3200, { font: 'Courier New', size: 16 }), cell('Supervision transverse : tous les groupes de tous les tenants (lecture + correction)', 6160)] }),
  ]),
  divider(),
);

// ── 6. Dashboard CLUB additions ──
children.push(
  h1('6. Ajouts au Dashboard CLUB (apps/admin)'),
  p('Le club gère ses propres groupes et la visibilité de ses événements depuis son dashboard existant.'),
  bullet('Nouvelle page /(admin)/groups : liste des groupes de l’org, création (nom, description, règle domaine email), gestion des membres (ajout manuel par email + visualisation des membres auto-rejoints).'),
  bullet('Entrée « Groupes » dans la sidebar.'),
  bullet('Page événement (create + /(admin)/events/[id]) : sélecteur de visibilité PUBLIC / PRIVÉ ; si PRIVÉ, multi-select des groupes autorisés (EventGroup).'),
  bullet('Badge « Privé » sur les events réservés dans la liste.'),
  divider(),
);

// ── 7. Impact mobile ──
children.push(
  h1('7. Impact application mobile'),
  bullet('Les événements PRIVATE n’apparaissent jamais dans une liste publique.'),
  bullet('Un deep link breakeat://event/:id vers un event privé : si l’utilisateur est membre d’un groupe autorisé → accès normal ; sinon → écran « événement introuvable » (le serveur renvoie 404).'),
  bullet('Aucun changement de parcours pour les events publics existants.'),
  divider(),
);

// ── 8. Sécurité & cloisonnement ──
children.push(
  h1('8. Sécurité & cloisonnement'),
  bullet('Back office : guard de rôle global SUPER_ADMIN sur TOUTES les routes /backoffice/*. Un OrgRole (même ORG_ADMIN) ne peut pas y accéder.'),
  bullet('Groupes : requireOrgAccess sur toutes les routes — cloisonnement strict par tenant. Le SUPER_ADMIN bypass (déjà implémenté) reste la seule porte transverse.'),
  bullet('Accès privé : l’appartenance est revérifiée à chaque étape sensible (détail event, panier, checkout). Le client n’est jamais la source de vérité.'),
  bullet('PII : les KPIs du back office sont des agrégats — pas de données nominatives exposées dans les compteurs.'),
  divider(),
);

// ── 9. Plan de tests ──
children.push(
  h1('9. Plan de tests'),
  bullet('groups.service.spec : CRUD, unicité (org, name), ajout/retrait membre, idempotence de l’adhésion par domaine.'),
  bullet('Domain auto-join : un nouvel utilisateur « x@boursorama.com » rejoint bien le groupe « Boursorama » (source=DOMAIN) ; un « x@gmail.com » non.'),
  bullet('Event gating : un non-membre reçoit 404 sur un event privé ; un membre y accède ; un non-membre ne peut pas créer de panier dessus.'),
  bullet('Backoffice KPIs : agrégats corrects sur jeu de données multi-tenant ; guard SUPER_ADMIN refuse un ORG_ADMIN.'),
  bullet('Régression : les events publics restent visibles de tous (visibility défaut = PUBLIC).'),
  divider(),
);

// ── 10. Hors scope V1 ──
children.push(
  h1('10. Hors scope V1 (phases ultérieures)'),
  bullet('Codes promo ciblés par groupe — reporté après le back office V1, côté dashboard club (le modèle Group est conçu pour les accueillir).'),
  bullet('Facturation / commissions plateforme dans le back office.'),
  bullet('Règles d’adhésion avancées (multi-domaines, listes d’emails importées en masse).'),
  spacer(),
  pGray('Fin du brief Phase 14. Les blocs seront documentés dans CHANGELOG.md, DEVELOPMENT_LOG.md, brain/TASK_SUMMARY.md et brain/ENGINEERING_MANUAL.md au fil de l’implémentation.'),
);

// ─── Build document ────────────────────────────────────────────────────────────

const doc = new Document({
  creator: 'Break Eat',
  title: 'BREAK EAT — Phase 14 : Back Office & Groupes',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: INKSOF } } },
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: 'BREAK EAT  ·  Phase 14 — Back Office & Groupes', size: 16, font: 'Arial', color: GRAY })],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'ECE3DD', space: 4 } },
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Page ', size: 16, font: 'Arial', color: GRAY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: GRAY }),
          new TextRun({ text: ' / ', size: 16, font: 'Arial', color: GRAY }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: 'Arial', color: GRAY }),
        ],
      })] }),
    },
    children,
  }],
});

const outPath = path.join(__dirname, 'PHASE_14_BACKOFFICE_GROUPES.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log('OK ->', outPath, '(' + buf.length + ' bytes)');
}).catch((e) => { console.error('FAIL', e); process.exit(1); });
