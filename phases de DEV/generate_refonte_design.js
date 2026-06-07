/**
 * generate_refonte_design.js
 *
 * Generates REFONTE_DESIGN_WHITELABEL.docx — Technical Brief documenting the
 * white/orange design refonte (package @break-eat/brand).
 * Created: 2026-06-03
 *
 * Documents COMPLETED work (task #16) : the single-source-of-truth design
 * package, the color-mapping convention, the preserved semantic colors, and
 * the rules that must never be broken.
 *
 * Run from monorepo root:
 *   node "phases de DEV/generate_refonte_design.js"
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

// Generic N-column table
const cell = (text, width, { bg = 'FFFFFF', bold = false, color = INKSOF, font = 'Arial', size = 18, align } = {}) => new TableCell({
  borders, width: { size: width, type: WidthType.DXA },
  shading: { fill: bg, type: ShadingType.CLEAR },
  margins: { top: 70, bottom: 70, left: 110, right: 110 },
  children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold, size, font, color })] })],
});

const headerCell = (text, width) => cell(text, width, { bg: 'FDECE7', bold: true, color: ODARK, size: 18 });

// Swatch row : token name | hex/value | usage
const swatchRow = (token, value, usage, bg = 'FFFFFF') => new TableRow({
  children: [
    cell(token, 2200, { font: 'Courier New', color: INK, size: 17, bold: true, bg }),
    cell(value, 2900, { font: 'Courier New', color: ODARK, size: 16, bg }),
    cell(usage, 4260, { color: INKSOF, size: 17, bg }),
  ],
});

// Mapping row : old → new | usage
const mapRow = (oldv, newv, usage, bg = 'FFFFFF') => new TableRow({
  children: [
    cell(oldv, 2600, { font: 'Courier New', color: GRAY, size: 16, bg }),
    cell(newv, 2600, { font: 'Courier New', color: ODARK, size: 16, bold: true, bg }),
    cell(usage, 4160, { color: INKSOF, size: 17, bg }),
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
    children: [new TextRun({ text: 'REFONTE DESIGN — WHITE-LABEL', bold: true, size: 38, font: 'Arial', color: INK })] }),
  new Paragraph({ spacing: { before: 60, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Package @break-eat/brand  ·  blanc / orange  ·  Fredoka', size: 24, font: 'Arial', color: ODARK })] }),
  new Paragraph({ spacing: { before: 200, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', size: 26, font: 'Arial', color: GRAY, italics: true })] }),
  new Paragraph({ spacing: { before: 120, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '03/06/2026', size: 22, font: 'Arial', color: GRAY })] }),
  new Paragraph({ spacing: { before: 600, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Source unique de vérité du design — partagée par admin · operator · backoffice', size: 20, font: 'Arial', color: INKSOF })] }),
);

// ── 1. Objectif ──
children.push(
  new Paragraph({ pageBreakBefore: true, children: [] }),
  h1('1. Objectif de la refonte'),
  p('La refonte remplace l’ancien thème (bleu, fonds décorés) par une identité white-label sobre — fond blanc, orange vif, police Fredoka — et la centralise dans UN seul package partagé : @break-eat/brand. Avant, chaque écran codait ses couleurs en dur ; désormais, on change une valeur à un seul endroit et elle se propage à toutes les surfaces.'),
  p('Trois objectifs :', { bold: true }),
  numbered('Cohérence : toutes les surfaces (CLUB, OPÉRATEUR, BACK OFFICE) partagent exactement les mêmes tokens, le même logo, la même police.'),
  numbered('Maintenabilité : une seule source de vérité (packages/brand). Plus de chasse aux couleurs écran par écran.'),
  numbered('Identité : orange #FC4002 sur blanc pur, sans formes décoratives — un look premium, neutre et lisible.'),
  spacer(),
  pGray('Statut : refonte LIVRÉE (tâche #16). Ce brief documente ce qui existe et fixe les règles à ne jamais casser.'),
  divider(),
);

// ── 2. Identité visuelle ──
children.push(
  h1('2. Identité visuelle (décisions verrouillées)'),
  bullet('Orange = #FC4002 (vif). C’est LA couleur de marque — accents, CTAs, états actifs.', { bold: true }),
  bullet('Fond = blanc pur (#ffffff), neutre, AUCUNE forme décorative.'),
  bullet('Police = Fredoka pour TOUTE l’UI (Raleway a été retiré). Chaque app câble --font-fredoka dans son app/layout.tsx.'),
  bullet('Wordmark = « BREAKEAT » en UN seul mot. Ce n’est pas du texte mais l’artwork officiel (public/logo-full.png).'),
  bullet('Logo = le « B avec l’éclair » officiel. Login = lockup complet (logo-full.png) ; dashboards = la marque seule (logo-mark.png).'),
  divider(),
);

// ── 3. Tokens ──
children.push(
  h1('3. Les tokens (packages/brand/src/brand.ts)'),
  p('L’objet BRAND est figé en as const et exporte le type Brand = typeof BRAND. Valeurs exactes :'),
  spacer(),
  table([
    new TableRow({ children: [headerCell('Token', 2200), headerCell('Valeur', 2900), headerCell('Usage', 4260)] }),
    swatchRow('orange',       '#FC4002',                      'Primaire / accents / CTAs'),
    swatchRow('orangeDark',   '#DA3702',                      'Hover & pressed', 'FAFAFA'),
    swatchRow('orangeSoft',   '#FDB9A3',                      'Boutons désactivés / fills doux'),
    swatchRow('orangeTint',   'rgba(252,64,2,0.08)',          'Lavis de fond très léger', 'FAFAFA'),
    swatchRow('ink',          '#1c1917',                      'Texte principal / titres'),
    swatchRow('inkSoft',      '#44403c',                      'Labels / texte secondaire', 'FAFAFA'),
    swatchRow('grey',         '#a8a29e',                      'Indices discrets (muted)'),
    swatchRow('border',       '#ece3dd',                      'Bordures hairline', 'FAFAFA'),
    swatchRow('bg',           '#ffffff',                      'Fond blanc neutre (sans formes)'),
    swatchRow('bgSubtle',     '#faf7f5',                      'Cartes / surfaces surélevées', 'FAFAFA'),
    swatchRow('shadowSoft',   '0 12px 44px rgba(252,64,2,.10)', 'Ombre douce (cartes mises en avant)'),
    swatchRow('shadowButton', '0 8px 20px rgba(252,64,2,.28)',  'Ombre de bouton CTA', 'FAFAFA'),
    swatchRow('font',         'var(--font-fredoka), system-ui…', 'Police de toute l’UI'),
  ]),
  divider(),
);

// ── 4. Le package ──
children.push(
  h1('4. Le package @break-eat/brand'),
  p('Un workspace partagé, importé par chaque app via workspace:* et transpilé via transpilePackages: ["@break-eat/brand"] dans next.config.'),
  spacer(),
  h3('Contenu — packages/brand/src/'),
  code('brand.ts          → l’objet BRAND (tokens) + type Brand'),
  code('BreakEatLogo.tsx  → le composant logo (lockup complet / marque seule)'),
  code('index.ts          → ré-exporte BRAND, Brand et BreakEatLogo'),
  spacer(),
  h3('Pattern de shim (rétro-compatibilité des imports admin)'),
  p('Pour ne rien casser dans les écrans existants, l’admin garde ses anciens chemins d’import, qui ré-exportent simplement depuis le package :'),
  code('apps/admin/src/lib/brand.ts'),
  code('   └─ export * from "@break-eat/brand";'),
  code('apps/admin/src/components/brand/BreakEatLogo.tsx'),
  code('   └─ export { BreakEatLogo } from "@break-eat/brand";'),
  spacer(),
  p('Résultat : les écrans importent toujours @/lib/brand ou @/components/brand/BreakEatLogo, mais la vérité vit dans le package. L’operator, lui, consomme @break-eat/brand directement.', { italics: true, color: GRAY }),
  divider(),
);

// ── 5. Convention de mapping ──
children.push(
  h1('5. Convention de mapping des couleurs'),
  p('Règle appliquée à chaque écran lors de la migration : on remplace le chrome de marque (les bleus, les gris d’interface) par les tokens, on garde les couleurs sémantiques (voir §6).'),
  spacer(),
  table([
    new TableRow({ children: [headerCell('Ancien', 2600), headerCell('Nouveau', 2600), headerCell('Quand', 4160)] }),
    mapRow('#2563eb / #3b82f6', 'BRAND.orange',  'Primaire, liens, CTAs (hover → orangeDark)'),
    mapRow('#111827 / #1f2937', 'BRAND.ink',     'CTA sombre secondaire, boutons de nav', 'FAFAFA'),
    mapRow('#111827',           'BRAND.ink',     'Titres (headings)'),
    mapRow('#374151 / #1f2937', 'BRAND.inkSoft', 'Labels, texte secondaire', 'FAFAFA'),
    mapRow('#6b7280 / #9ca3af', 'BRAND.grey',    'Texte muted, indices'),
    mapRow('#d1d5db / #e5e7eb', 'BRAND.border',  'Bordures, séparateurs', 'FAFAFA'),
    mapRow('#f9fafb / #f3f4f6', 'BRAND.bgSubtle','Fonds légers, lignes alternées'),
    mapRow('#ffffff (carte)',   'BRAND.bg + border', 'Cartes : fond blanc + 1px solid border', 'FAFAFA'),
    mapRow('ombre carte',       '0 1px 3px rgba(28,25,23,.06)', 'Ombre carte standard'),
    mapRow('ombre form. mise en avant', 'BRAND.shadowSoft', 'Formulaires emphatiques', 'FAFAFA'),
  ]),
  spacer(),
  h3('Police & hover'),
  bullet('fontFamily: BRAND.font sur le conteneur racine de la page ; "inherit" sur inputs / selects / textareas / boutons (ils héritent ainsi de Fredoka).'),
  bullet('Hover : onMouseEnter / onMouseLeave échangent orange ↔ orangeDark, avec transition: "background 0.15s ease" — et sont neutralisés quand le bouton est disabled.'),
  bullet('Color-picker white-label : la valeur par défaut #2563eb devient BRAND.orange.'),
  divider(),
);

// ── 6. Couleurs sémantiques CONSERVÉES ──
children.push(
  h1('6. Couleurs sémantiques CONSERVÉES (ne pas toucher)'),
  p('Ce ne sont PAS du chrome de marque mais du sens métier. Les remplacer par de l’orange casserait la lisibilité. On les garde telles quelles :'),
  bullet('États d’erreur : rouge (#fee2e2 / #fca5a5 / #dc2626 / #991b1b).'),
  bullet('Succès : vert. Avertissement : ambre.'),
  bullet('Montants / argent : vert #059669.'),
  bullet('Badges catégoriels : rôles & scopes (couleurs distinctes par catégorie).'),
  bullet('Cycle de vie commande (STATUS_COLOR) : PAID #3b82f6, ACCEPTED #8b5cf6, PREPARING #f59e0b, READY #10b981, PICKED_UP #06b6d4, COMPLETED #6b7280, RECOVERED #f97316, CANCELLED #ef4444.'),
  bullet('Simulateur de rush : violet #7c3aed.'),
  spacer(),
  p('Vérification post-refonte : un grep des anciens bleus ne doit plus renvoyer QUE les 2 couleurs lifecycle intentionnelles (#3b82f6 = PAID, #6b7280 = COMPLETED).', { italics: true, color: GRAY }),
  divider(),
);

// ── 7. Surfaces rebrandées ──
children.push(
  h1('7. Surfaces rebrandées'),
  h3('Dashboard CLUB (apps/admin) — chrome + 11 pages internes'),
  p('Le layout (sidebar, header, logo marque) + toutes les pages du groupe (admin) :'),
  bullet('dashboard, events, events/[id], suppliers/[id], venues, team, organizations/[id]'),
  bullet('settings, feature-flags, demo-setup, simulator'),
  bullet('+ login (lockup logo complet) et la page racine de routage.'),
  spacer(),
  h3('Dashboard OPÉRATEUR (apps/operator)'),
  p('Rebrandé sur les mêmes tokens (consomme @break-eat/brand directement). NB : ce dashboard sera reconstruit proprement en tâche #17 — la refonte couvre l’habillage, pas encore le nouveau parcours.'),
  spacer(),
  h3('BACK OFFICE (apps/backoffice)'),
  p('À construire en Phase 14, nativement sur les tokens dès le départ.'),
  divider(),
);

// ── 8. Ce qu’il ne faut JAMAIS changer ──
children.push(
  h1('8. Règles à ne JAMAIS casser'),
  bullet('L’orange reste #FC4002. Ne pas réintroduire d’ancien orange (#FF4D00) ni de bleu de marque.', { bold: true }),
  bullet('Fond blanc pur, aucune forme décorative.'),
  bullet('Fredoka partout. Ne jamais réintroduire Raleway ni une autre police d’UI.'),
  bullet('Wordmark « BREAKEAT » en un seul mot, via l’artwork officiel — jamais retapé en texte.'),
  bullet('Logo officiel « B éclair » uniquement (lockup au login, marque au dashboard).'),
  bullet('Le package est la source unique : ne PAS recoder de couleurs en dur dans un écran. Tout passe par BRAND.', { bold: true }),
  divider(),
);

// ── 9. Comment tester ──
children.push(
  h1('9. Comment vérifier'),
  numbered('Typecheck : pnpm -w typecheck (ou turbo run typecheck) — doit passer au vert.'),
  numbered('Grep des couleurs héritées : chercher #2563eb / #3b82f6 / #111827 / #f9fafb… il ne doit rester QUE les 2 sémantiques lifecycle (#3b82f6 PAID, #6b7280 COMPLETED).'),
  numbered('Visuel : fond blanc, accents orange, Fredoka rendue, logo correct au login et au dashboard.'),
  numbered('Cohérence inter-apps : admin et operator partagent les mêmes tokens (changer une valeur dans brand.ts se voit partout).'),
  spacer(),
  pGray('Fin du brief Refonte Design. Documenté dans CHANGELOG.md (v0.23.0), DEVELOPMENT_LOG.md, brain/TASK_SUMMARY.md et brain/ENGINEERING_MANUAL.md.'),
);

// ─── Build document ────────────────────────────────────────────────────────────

const doc = new Document({
  creator: 'Break Eat',
  title: 'BREAK EAT — Refonte Design white-label (@break-eat/brand)',
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
        children: [new TextRun({ text: 'BREAK EAT  ·  Refonte Design white-label', size: 16, font: 'Arial', color: GRAY })],
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

const outPath = path.join(__dirname, 'REFONTE_DESIGN_WHITELABEL.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log('OK ->', outPath, '(' + buf.length + ' bytes)');
}).catch((e) => { console.error('FAIL', e); process.exit(1); });
