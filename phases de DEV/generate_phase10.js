/**
 * generate_phase10.js
 *
 * Generates PHASE_10_QA_DEPLOY.docx — Technical Brief for Phase 10.
 *
 * Run from monorepo root:
 *   node "phases de DEV/generate_phase10.js"
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, LevelFormat, TabStopType, TabStopPosition,
} = require('docx');
const fs   = require('fs');
const path = require('path');

// ─── Design tokens ─────────────────────────────────────────────────────────────

const TEAL  = '065f46';
const DARK  = '1f2937';
const GRAY  = '6b7280';
const GREEN = '065f46';
const bg1   = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
const borders = { top: bg1, bottom: bg1, left: bg1, right: bg1 };

// ─── Helpers ───────────────────────────────────────────────────────────────────

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun({ text, bold: true, color: TEAL, size: 36, font: 'Arial' })],
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

// Two-column key-value row
const kvRow = (key, val, bg = 'FFFFFF') => new TableRow({
  children: [
    new TableCell({
      borders,
      width: { size: 3000, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: key, bold: true, size: 20, font: 'Arial', color: DARK })] })],
    }),
    new TableCell({
      borders,
      width: { size: 6360, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: val, size: 20, font: 'Arial', color: DARK })] })],
    }),
  ],
});

// Test result row
const testRow = (suite, tests, status, bg = 'FFFFFF') => new TableRow({
  children: [
    new TableCell({
      borders,
      width: { size: 4200, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: suite, size: 20, font: 'Courier New', color: DARK })] })],
    }),
    new TableCell({
      borders,
      width: { size: 1200, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: tests, size: 20, font: 'Arial', bold: true })] })],
    }),
    new TableCell({
      borders,
      width: { size: 1200, type: WidthType.DXA },
      shading: { fill: status === 'PASS' ? 'D1FAE5' : 'FEE2E2', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: status, size: 20, font: 'Arial', bold: true, color: status === 'PASS' ? '065f46' : '991b1b' })] })],
    }),
    new TableCell({
      borders,
      width: { size: 2760, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: status === 'PASS' ? 'No failures' : 'See details', size: 20, font: 'Arial', color: GRAY })] })],
    }),
  ],
});

// Section divider
const divider = () => new Paragraph({
  children: [new TextRun('')],
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB', space: 1 } },
  spacing: { after: 200 },
});

// ─── Document ──────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },

  styles: {
    default: {
      document: { run: { font: 'Arial', size: 22, color: DARK } },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: TEAL },
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
        size: { width: 11906, height: 16838 },
        margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
      },
    },

    headers: {
      default: new Header({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: 'BREAK EAT — Phase 10', bold: true, size: 18, font: 'Arial', color: TEAL }),
              new TextRun({ text: '\tQA, Rush Tests & Deploiement', size: 18, font: 'Arial', color: GRAY }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '065f46', space: 1 } },
            spacing: { after: 120 },
          }),
        ],
      }),
    },

    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: 'Break Eat — Confidentiel', size: 16, font: 'Arial', color: GRAY }),
              new TextRun({ text: '\tPage ', size: 16, font: 'Arial', color: GRAY }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: GRAY }),
              new TextRun({ text: ' / ', size: 16, font: 'Arial', color: GRAY }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: 'Arial', color: GRAY }),
            ],
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB', space: 1 } },
            spacing: { before: 120 },
          }),
        ],
      }),
    },

    children: [

      // ── Cover ──────────────────────────────────────────────────────────────
      new Paragraph({
        children: [new TextRun({ text: 'BREAK EAT', bold: true, size: 64, font: 'Arial', color: TEAL })],
        spacing: { before: 800, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'PHASE 10 : QA, Rush Tests & Déploiement', bold: true, size: 36, font: 'Arial', color: DARK })],
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', size: 24, font: 'Arial', color: GRAY, italics: true })],
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: '02/06/2026', size: 22, font: 'Arial', color: GRAY })],
        spacing: { after: 600 },
      }),

      // Status table
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [3000, 6638],
        rows: [
          kvRow('Version',  '0.18.0', 'F9FAFB'),
          kvRow('Phase',    '10 / 10 — Phase finale', 'F9FAFB'),
          kvRow('Statut',   'COMPLETED', 'D1FAE5'),
          kvRow('Tests',    '273 passants — 22 suites — 0 failure', 'D1FAE5'),
          kvRow('Date',     '2026-06-02', 'F9FAFB'),
          kvRow('Auteur',   'Claude Code (Anthropic)', 'F9FAFB'),
        ],
      }),

      spacer(),
      divider(),

      // ── Section 1 : Objectif ───────────────────────────────────────────────
      h1('1. OBJECTIF DE LA PHASE 10'),
      p('La Phase 10 est la phase finale de construction de Break Eat. Elle valide le comportement sous charge, instrumente la production pour la surveillance des erreurs, et livre l\'infrastructure de déploiement complète.'),
      spacer(),
      p('Quatre problèmes sont adressés :', { bold: true }),
      bullet('Charge : est-ce que 50 ou 100 commandes créées en rafale sont toutes conservées ?'),
      bullet('Intégrité : est-ce que les états terminaux (COMPLETED, CANCELLED) sont strictement protégés contre toute régression ?'),
      bullet('Observabilité : est-ce que les erreurs frontend en production remontent dans Sentry sans exposer de données sensibles ?'),
      bullet('Opérations : est-ce qu\'un déploiement production peut se faire de façon reproductible et sécurisée ?'),
      spacer(),

      // ── Section 2 : Blocs ─────────────────────────────────────────────────
      h1('2. BLOCS IMPLÉMENTÉS'),

      h2('BLOC 10.1 — Rush Tests'),
      p('Fichier : backend/src/modules/simulator/rush.spec.ts', { color: '1e3a5f' }),
      spacer(),
      p('Stratégie de test — mock stateful en mémoire :'),
      p('Un tableau orderStore[] est mis à jour en temps réel par les implémentations jest.fn() de Prisma. Cela permet de vérifier l\'invariant "N ordres IN → N ordres OUT" à chaque étape sans base de données réelle.', { color: GRAY }),
      spacer(),
      p('18 tests en 5 suites :', { bold: true }),
      bullet('50-order rush (4 tests) : created=50, prefix DEMO-, status PAID, IDs uniques'),
      bullet('100-order rush (2 tests) : created=100, publicOrderNumbers sans collision de séquence'),
      bullet('progressOrders sans perte (3 tests) : 50 PAID → 6 cycles → 50 COMPLETED, count invariant'),
      bullet('combined rush+failures+progress (2 tests) : total 30 invariant, clearEvent exact'),
      bullet('getStats consistency (2 tests) : sum(stats) = store.length, split après failures'),
      spacer(),

      h2('BLOC 10.2 — Order Loss Tests'),
      p('Fichier : backend/src/modules/orders/order-loss.spec.ts', { color: '1e3a5f' }),
      spacer(),
      p('Stratégie : OrderStateMachineService réel (logique pure) + mocks pour Prisma / RealtimeService / SlotsService.'),
      spacer(),
      p('14 tests en 4 suites :', { bold: true }),
      bullet('Terminal state protection (3 tests) : COMPLETED→any, CANCELLED→any, COMPLETED→CANCELLED → BadRequestException'),
      bullet('Reconnect resilience (3 tests) : findReadyByEvent retourne exactement les ordres READY, post-transition correcte, empty quand tout pickup'),
      bullet('Count conservation (3 tests) : transition() n\'ajoute ni ne supprime d\'ordres, 25 transitions rapides, séquence lifecycle 3 états'),
      bullet('Minimal projection (1 test) : findReadyByEvent ne retourne pas userId, totalCents, items'),
      spacer(),

      h2('BLOC 10.3 — Sentry Frontend (Operator App)'),
      p('Fichiers créés :'),
      code('apps/operator/sentry.client.config.ts  — init navigateur'),
      code('apps/operator/sentry.server.config.ts  — init Node.js'),
      code('apps/operator/sentry.edge.config.ts    — init Edge runtime'),
      code('apps/operator/instrumentation.ts        — hook Next.js 15'),
      spacer(),
      p('Fichiers modifiés :'),
      code('apps/operator/package.json    — +@sentry/nextjs ^9.0.0'),
      code('apps/operator/next.config.ts — withSentryConfig(...)'),
      spacer(),
      p('Décisions clés :', { bold: true }),
      bullet('enabled: Boolean(DSN) → no-op sans DSN en développement local'),
      bullet('tunnelRoute: \'/monitoring\' → évite les bloqueurs de publicité (ad-blockers)'),
      bullet('hideSourceMaps: true → source maps non exposés dans le bundle public'),
      bullet('beforeSend() filtre les faux positifs connus (ResizeObserver loop, Non-Error promises)'),
      bullet('replaysSessionSampleRate: 0.05 en production (5% des sessions) — désactiver si RGPD strict'),
      spacer(),

      h2('BLOC 10.4 — Logging JSON Structuré'),
      p('Fichier créé : backend/src/logger/json-logger.ts', { color: '1e3a5f' }),
      spacer(),
      p('JsonLogger est une sous-classe de ConsoleLogger NestJS. Aucune dépendance externe ajoutée. En développement, le format coloré NestJS est préservé.'),
      spacer(),
      p('Format JSON production :'),
      code('{"level":"log","timestamp":"2026-06-02T14:00:00.000Z","context":"Bootstrap","message":"Server running on port 3000"}'),
      spacer(),
      p('Niveaux (LEVEL_ORDER map) :'),
      code('verbose(0) < debug(1) < log(2) < warn(3) < error(4) < fatal(5)'),
      spacer(),
      p('Variable d\'env LOG_LEVEL : log (prod) | debug (dev/staging)'),
      spacer(),

      h2('BLOC 10.5 — Docker Compose Production + Dockerfile'),
      p('Fichiers créés :'),
      code('backend/Dockerfile              — multi-stage (deps → builder → runner)'),
      code('docker-compose.prod.yml         — PostgreSQL 16 + Redis 7 + backend'),
      spacer(),
      p('Architecture Docker :', { bold: true }),
      bullet('Réseau backend (internal: true) : postgres + redis + service backend — inaccessible depuis l\'extérieur'),
      bullet('Réseau public (bridge) : expose uniquement ${BACKEND_PORT:-3000}:3000'),
      bullet('POSTGRES_PASSWORD et REDIS_PASSWORD obligatoires (:? syntax → échec fail-loud)'),
      bullet('Utilisateur non-root breakeat (uid=1001) dans le runner'),
      bullet('DEMO_MODE forcé à false dans docker-compose.prod.yml'),
      spacer(),
      p('Stages Dockerfile :'),
      bullet('deps : pnpm install --frozen-lockfile (tous deps)'),
      bullet('builder : pnpm db:generate && pnpm build'),
      bullet('runner : pnpm install --prod + artefacts copiés depuis builder'),
      spacer(),

      h2('BLOC 10.6 — Vercel Config'),
      p('Fichier modifié : apps/operator/vercel.json', { color: '1e3a5f' }),
      spacer(),
      p('Headers de sécurité ajoutés :'),
      code('X-Content-Type-Options: nosniff'),
      code('X-Frame-Options: DENY'),
      code('X-XSS-Protection: 1; mode=block'),
      code('Referrer-Policy: strict-origin-when-cross-origin'),
      code('Permissions-Policy: camera=(), microphone=(), geolocation=()'),
      code('Strict-Transport-Security: max-age=63072000; includeSubDomains; preload'),
      spacer(),
      p('Rewrite /monitoring/* → tunnel Sentry (évite le blocage par ad-blockers).'),
      spacer(),

      h2('BLOC 10.7 — Deployment Checklist'),
      p('Fichier créé : DEPLOYMENT_CHECKLIST.md', { color: '1e3a5f' }),
      spacer(),
      p('7 sections, 40+ items :'),
      bullet('0. Pré-vol : secrets non commitées, .env absents, clés non trackées'),
      bullet('1. Backend Railway : variables d\'env, JWT_SECRET, Stripe live keys, CORS, DEMO_MODE'),
      bullet('2. Operator Vercel : NEXT_PUBLIC_API_URL, Sentry DSN/AUTH_TOKEN, SENTRY_ORG/PROJECT'),
      bullet('3. Migrations DB : migrations commitées, dry-run staging, pas de DROP sans plan de rollback'),
      bullet('4. Tests : pnpm test ≥273 passants, rush.spec.ts, order-loss.spec.ts, typecheck'),
      bullet('5. Scan sécurité : pnpm audit, JWT_SECRET ≠ placeholder, Stripe live keys, CORS sans *'),
      bullet('6. Smoke tests post-déploiement : GET /health, WebSocket, login, commande test, dashboard'),
      bullet('Procédure de rollback : Railway redeploy, DB snapshot, jamais prisma migrate reset en prod'),
      spacer(),

      divider(),

      // ── Section 3 : Résultats Tests ──────────────────────────────────────
      h1('3. RÉSULTATS DES TESTS'),
      spacer(),

      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [4200, 1200, 1200, 2760] ,
        rows: [
          // Header
          new TableRow({
            children: [
              new TableCell({
                borders, width: { size: 4200, type: WidthType.DXA },
                shading: { fill: '065f46', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'Suite de test', bold: true, size: 20, font: 'Arial', color: 'FFFFFF' })] })],
              }),
              new TableCell({
                borders, width: { size: 1200, type: WidthType.DXA },
                shading: { fill: '065f46', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tests', bold: true, size: 20, font: 'Arial', color: 'FFFFFF' })] })],
              }),
              new TableCell({
                borders, width: { size: 1200, type: WidthType.DXA },
                shading: { fill: '065f46', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Statut', bold: true, size: 20, font: 'Arial', color: 'FFFFFF' })] })],
              }),
              new TableCell({
                borders, width: { size: 2760, type: WidthType.DXA },
                shading: { fill: '065f46', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'Note', bold: true, size: 20, font: 'Arial', color: 'FFFFFF' })] })],
              }),
            ],
          }),
          testRow('simulator/rush.spec.ts',                    '18', 'PASS', 'F9FAFB'),
          testRow('orders/order-loss.spec.ts',                 '14', 'PASS', 'FFFFFF'),
          testRow('simulator/simulator.service.spec.ts',       '18', 'PASS', 'F9FAFB'),
          testRow('orders/orders.service.spec.ts',             '22', 'PASS', 'FFFFFF'),
          testRow('orders/order-state-machine.service.spec.ts','14', 'PASS', 'F9FAFB'),
          testRow('feature-flags/feature-flags.service.spec.ts','13','PASS', 'FFFFFF'),
          testRow('app-settings/app-settings.service.spec.ts', '13', 'PASS', 'F9FAFB'),
          testRow('realtime/realtime.gateway.spec.ts',         '10', 'PASS', 'FFFFFF'),
          testRow('realtime/realtime.service.spec.ts',         '8',  'PASS', 'F9FAFB'),
          testRow('auth/auth.service.spec.ts',                 '10', 'PASS', 'FFFFFF'),
          testRow('webhooks/stripe-webhooks.service.spec.ts',  '14', 'PASS', 'F9FAFB'),
          testRow('+ 11 autres suites',                        '129','PASS', 'FFFFFF'),
          // Total row
          new TableRow({
            children: [
              new TableCell({
                borders, width: { size: 4200, type: WidthType.DXA },
                shading: { fill: 'D1FAE5', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'TOTAL', bold: true, size: 22, font: 'Arial', color: '065f46' })] })],
              }),
              new TableCell({
                borders, width: { size: 1200, type: WidthType.DXA },
                shading: { fill: 'D1FAE5', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '273', bold: true, size: 22, font: 'Arial', color: '065f46' })] })],
              }),
              new TableCell({
                borders, width: { size: 1200, type: WidthType.DXA },
                shading: { fill: 'D1FAE5', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '22 PASS', bold: true, size: 22, font: 'Arial', color: '065f46' })] })],
              }),
              new TableCell({
                borders, width: { size: 2760, type: WidthType.DXA },
                shading: { fill: 'D1FAE5', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: '0 failure', bold: true, size: 22, font: 'Arial', color: '065f46' })] })],
              }),
            ],
          }),
        ],
      }),
      spacer(),

      divider(),

      // ── Section 4 : Variables d'environnement ─────────────────────────────
      h1('4. VARIABLES D\'ENVIRONNEMENT'),
      p('Variables ajoutées en Phase 10 :'),
      spacer(),

      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [3200, 3200, 3238],
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders, width: { size: 3200, type: WidthType.DXA },
                shading: { fill: '065f46', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'Variable', bold: true, size: 20, font: 'Arial', color: 'FFFFFF' })] })],
              }),
              new TableCell({
                borders, width: { size: 3200, type: WidthType.DXA },
                shading: { fill: '065f46', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'Scope', bold: true, size: 20, font: 'Arial', color: 'FFFFFF' })] })],
              }),
              new TableCell({
                borders, width: { size: 3238, type: WidthType.DXA },
                shading: { fill: '065f46', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: 'Description', bold: true, size: 20, font: 'Arial', color: 'FFFFFF' })] })],
              }),
            ],
          }),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'F9FAFB', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'LOG_LEVEL', font: 'Courier New', size: 18, color: '1e3a5f' })] })] }),
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'F9FAFB', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Backend (Railway)', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 3238, type: WidthType.DXA }, shading: { fill: 'F9FAFB', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'verbose|debug|log|warn|error (defaut: log en prod)', size: 20, font: 'Arial' })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'NEXT_PUBLIC_SENTRY_DSN_OPERATOR', font: 'Courier New', size: 18, color: '1e3a5f' })] })] }),
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Vercel (public)', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 3238, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'DSN Sentry (bundle navigateur)', size: 20, font: 'Arial' })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'F9FAFB', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'SENTRY_DSN_OPERATOR', font: 'Courier New', size: 18, color: '1e3a5f' })] })] }),
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'F9FAFB', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Vercel (serveur)', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 3238, type: WidthType.DXA }, shading: { fill: 'F9FAFB', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'DSN Sentry serveur (non public)', size: 20, font: 'Arial' })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'SENTRY_AUTH_TOKEN', font: 'Courier New', size: 18, color: '1e3a5f' })] })] }),
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Vercel / CI', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 3238, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Upload source maps (optionnel)', size: 20, font: 'Arial' })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'F9FAFB', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'POSTGRES_PASSWORD', font: 'Courier New', size: 18, color: '991b1b' })] })] }),
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'F9FAFB', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Docker Compose prod', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 3238, type: WidthType.DXA }, shading: { fill: 'F9FAFB', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'OBLIGATOIRE — echec si absent', size: 20, font: 'Arial', color: '991b1b' })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'REDIS_PASSWORD', font: 'Courier New', size: 18, color: '991b1b' })] })] }),
            new TableCell({ borders, width: { size: 3200, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Docker Compose prod', size: 20, font: 'Arial' })] })] }),
            new TableCell({ borders, width: { size: 3238, type: WidthType.DXA }, shading: { fill: 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'OBLIGATOIRE — echec si absent', size: 20, font: 'Arial', color: '991b1b' })] })] }),
          ]}),
        ],
      }),
      spacer(),

      divider(),

      // ── Section 5 : Fichiers créés/modifiés ──────────────────────────────
      h1('5. FICHIERS CRÉÉS / MODIFIÉS'),
      spacer(),

      h2('Nouveaux fichiers'),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [5000, 4638],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 5000, type: WidthType.DXA }, shading: { fill: '065f46', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Fichier', bold: true, size: 20, font: 'Arial', color: 'FFFFFF' })] })] }),
            new TableCell({ borders, width: { size: 4638, type: WidthType.DXA }, shading: { fill: '065f46', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Description', bold: true, size: 20, font: 'Arial', color: 'FFFFFF' })] })] }),
          ]}),
          ...([
            ['backend/src/modules/simulator/rush.spec.ts',    '18 tests — rush 50/100, no-loss, combined'],
            ['backend/src/modules/orders/order-loss.spec.ts', '14 tests — terminal, reconnect, count conservation'],
            ['backend/src/logger/json-logger.ts',             'ConsoleLogger subclass JSON prod / coloré dev'],
            ['backend/Dockerfile',                            'Multi-stage build (deps/builder/runner)'],
            ['apps/operator/sentry.client.config.ts',         'Init Sentry navigateur'],
            ['apps/operator/sentry.server.config.ts',         'Init Sentry Node.js'],
            ['apps/operator/sentry.edge.config.ts',           'Init Sentry Edge runtime'],
            ['apps/operator/instrumentation.ts',              'Hook Next.js 15 (charge Sentry selon runtime)'],
            ['docker-compose.prod.yml',                       'Stack prod : PostgreSQL + Redis + backend'],
            ['DEPLOYMENT_CHECKLIST.md',                       '40+ items — pré-vol, Railway, Vercel, migrations'],
          ]).map(([file, desc], i) => new TableRow({ children: [
            new TableCell({ borders, width: { size: 5000, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? 'F9FAFB' : 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: file, font: 'Courier New', size: 18, color: '1e3a5f' })] })] }),
            new TableCell({ borders, width: { size: 4638, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? 'F9FAFB' : 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: desc, size: 20, font: 'Arial' })] })] }),
          ]})),
        ],
      }),

      spacer(),
      h2('Fichiers modifiés'),
      new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: [5000, 4638],
        rows: [
          ...([
            ['apps/operator/package.json',   '+@sentry/nextjs ^9.0.0'],
            ['apps/operator/next.config.ts', 'withSentryConfig (tunnelRoute, hideSourceMaps)'],
            ['apps/operator/vercel.json',    'Headers sécurité + rewrite /monitoring/*'],
            ['backend/src/main.ts',          'new JsonLogger(\'Bootstrap\') comme logger global'],
          ]).map(([file, desc], i) => new TableRow({ children: [
            new TableCell({ borders, width: { size: 5000, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? 'F9FAFB' : 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: file, font: 'Courier New', size: 18, color: '1e3a5f' })] })] }),
            new TableCell({ borders, width: { size: 4638, type: WidthType.DXA }, shading: { fill: i % 2 === 0 ? 'F9FAFB' : 'FFFFFF', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: desc, size: 20, font: 'Arial' })] })] }),
          ]})),
        ],
      }),

      spacer(),
      divider(),

      // ── Section 6 : Risques P3 ───────────────────────────────────────────
      h1('6. RISQUES DOCUMENTÉS (P3)'),
      spacer(),

      bullet('Sentry replays en production (5% sessions) : implique collecte de données navigateur. Désactiver replaysSessionSampleRate si RGPD strict requis.'),
      bullet('Docker Compose prod : 1 instance backend, pas de haute disponibilité. Pour HA : Kubernetes ou Railway scaling horizontal.'),
      bullet('JsonLogger synchrone : process.stdout.write() par ligne de log. Tolérable < 10 000 logs/s. Pour un volume supérieur : stream bufferisé ou winston async.'),
      bullet('Source maps Sentry : uploadés seulement si SENTRY_AUTH_TOKEN présent. Sans token, les stack traces en production sont non lisibles (code minifié).'),
      bullet('@sentry/nextjs v9 : API stable mais relativement récente avec Next.js 15 App Router. Tester lors des upgrades de Next.js.'),
      spacer(),

      divider(),

      // ── Section 7 : Prochaine étape ──────────────────────────────────────
      h1('7. PROCHAINE ÉTAPE'),
      p('Phase 10 est la dernière phase de construction planifiée. Le projet est prêt pour la beta.'),
      spacer(),
      p('Actions recommandées avant la beta :'),
      bullet('Exécuter DEPLOYMENT_CHECKLIST.md complet contre l\'environnement de staging'),
      bullet('Configurer les secrets dans Railway (DATABASE_URL, JWT_SECRET, Stripe live keys)'),
      bullet('Configurer les secrets dans Vercel (NEXT_PUBLIC_API_URL, Sentry DSN)'),
      bullet('Effectuer un déploiement staging complet avec données de test'),
      bullet('Valider les smoke tests de la section 6 de DEPLOYMENT_CHECKLIST.md'),
      bullet('Lancer la beta avec les premiers utilisateurs réels'),
      spacer(),

      pGray('Document généré par Claude Code (Anthropic) le 02/06/2026'),
    ],
  }],
});

// ─── Write ─────────────────────────────────────────────────────────────────────

const outPath = path.resolve(__dirname, '..', 'PHASE_10_QA_DEPLOY.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  const kb = (buf.length / 1024).toFixed(1);
  console.log(`✅  Generated: ${outPath} (${kb} KB)`);
}).catch((err) => {
  console.error('Error generating document:', err);
  process.exit(1);
});
