const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, LevelFormat, TabStopType, TabStopPosition,
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─── Design tokens ────────────────────────────────────────────────────────────

const TEAL  = '065f46';
const DARK  = '1f2937';
const GRAY  = '6b7280';
const RED   = '991b1b';
const AMBER = '92400e';
const bg1   = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
const borders = { top: bg1, bottom: bg1, left: bg1, right: bg1 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  children: [new TextRun({ text, bold: true, color: DARK, size: 24, font: 'Arial' })],
  spacing: { before: 200, after: 80 },
});

const para = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, size: 22, font: 'Arial', color: DARK, ...opts })],
  spacing: { before: 60, after: 60 },
});

const bullet = (text, level = 0) => new Paragraph({
  numbering: { reference: 'bullets', level },
  children: [new TextRun({ text, size: 22, font: 'Arial', color: DARK })],
  spacing: { before: 40, after: 40 },
});

const code = (text) => new Paragraph({
  children: [new TextRun({ text, font: 'Courier New', size: 18, color: '1a1a2e' })],
  shading: { fill: 'f3f4f6', type: ShadingType.CLEAR },
  spacing: { before: 30, after: 30 },
  indent: { left: 360 },
});

const divider = () => new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 1 } },
  spacing: { before: 200, after: 200 },
  children: [],
});

const sp = () => new Paragraph({ children: [new TextRun('')], spacing: { before: 60, after: 60 } });

function table(headers, rows, widths, headerBg = TEAL) {
  const total = widths.reduce((a, b) => a + b, 0);
  const hRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders, width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: headerBg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', font: 'Arial', size: 20 })] })],
    })),
  });
  const dRows = rows.map(row => new TableRow({
    children: row.map((cell, i) => new TableCell({
      borders, width: { size: widths[i], type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: cell, font: 'Arial', size: 20, color: DARK })] })],
    })),
  }));
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: [hRow, ...dRows] });
}

// ─── Document ────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
      ],
    }],
  },
  styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
      },
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        children: [
          new TextRun({ text: 'BREAK EAT — PHASE 9 : CMS + FEATURE FLAGS', bold: true, color: TEAL, size: 18, font: 'Arial' }),
          new TextRun({ text: '\tBrief Technique + Audit', color: GRAY, size: 18, font: 'Arial' }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 1 } },
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        children: [
          new TextRun({ text: 'Break Eat — Confidentiel', color: GRAY, size: 16, font: 'Arial' }),
          new TextRun({ text: '\tPage ', color: GRAY, size: 16, font: 'Arial' }),
          new TextRun({ children: [PageNumber.CURRENT], color: GRAY, size: 16, font: 'Arial' }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 1 } },
      })] }),
    },
    children: [

      // ── Page de titre ────────────────────────────────────────────────────────

      new Paragraph({
        children: [new TextRun({ text: '🍔 BREAK EAT', bold: true, size: 56, color: TEAL, font: 'Arial' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 480, after: 160 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'PHASE 9 : CMS BASIQUE + FEATURE FLAGS', bold: true, size: 40, color: DARK, font: 'Arial' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', size: 24, color: GRAY, font: 'Arial' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: '2026-06-01', size: 22, color: GRAY, font: 'Arial' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Version post-audit · 250 tests · 20 suites · 0 failure', size: 20, color: GRAY, font: 'Arial', italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 480 },
      }),

      divider(),

      // ── 1. Objectif ──────────────────────────────────────────────────────────

      h1('1. Objectif de la Phase 9'),
      para('Phase 9 livre trois capacités :'),
      bullet('Feature flags — activer/désactiver des fonctionnalités par scope (event, org, global) sans redéploiement.'),
      bullet('CMS basique (AppSettings) — stocker des textes et configs JSON par scope (bannières, descriptions, labels).'),
      bullet('CORS hardening — le gateway Socket.IO utilisait origin:"*" depuis Phase 6. Il est aligné sur CORS_ORIGINS, comme le serveur HTTP.'),
      sp(),
      para('Phase 9 clôt également tous les P2 ouverts par l\'audit Phase 8 (CORS gateway) et produit son propre cycle d\'audit (4 P2 corrigés, 250 tests).'),

      divider(),

      // ── 2. Architecture ──────────────────────────────────────────────────────

      h1('2. Architecture'),

      h2('2.1 Modèle de données'),
      para('Deux nouveaux modèles Prisma partagent un enum commun FlagScope :'),
      sp(),
      table(
        ['Modèle', 'Champs clés', 'Contrainte unique', 'Usage'],
        [
          ['FeatureFlag', 'key, scope, scopeId, enabled, metadata?', 'UNIQUE(key, scope, scopeId)', 'Toggle fonctionnalité'],
          ['AppSetting',  'key, scope, scopeId, value (JSON)',       'UNIQUE(key, scope, scopeId)', 'Config / textes CMS'],
        ],
        [2000, 2800, 2400, 2160],
      ),
      sp(),
      para('scopeId est NULL pour GLOBAL, UUID organisation pour ORGANIZATION, UUID event pour EVENT.'),

      h2('2.2 Algorithme de résolution (EVENT > ORG > GLOBAL)'),
      code('resolve(key, { orgId?, eventId? })'),
      code('  1. eventId fourni → findUnique(key, EVENT,  eventId) → hit? retourne immédiatement'),
      code('  2. orgId fourni   → findUnique(key, ORG,    orgId)   → hit? retourne immédiatement'),
      code('  3.                   findFirst(key, GLOBAL, scopeId: null)   → retourne si trouvé'),
      code('  4. aucun résultat → false (flag) / null (setting)'),
      sp(),
      para('Court-circuit à chaque étape. Le scopeId: null au niveau GLOBAL est explicite — défensif contre des enregistrements incohérents.'),

      h2('2.3 CORS gateway Socket.IO'),
      code('// Avant (Phase 6-8):'),
      code('@WebSocketGateway({ cors: { origin: \'*\' } })'),
      sp(),
      code('// Phase 9:'),
      code('@WebSocketGateway({'),
      code('  cors: { origin: process.env[\'CORS_ORIGINS\']?.split(\',\') ?? [\'http://localhost:3001\'] }'),
      code('})'),

      divider(),

      // ── 3. Fichiers ──────────────────────────────────────────────────────────

      h1('3. Fichiers créés / modifiés'),

      h2('3.1 Nouveaux fichiers'),
      table(
        ['Fichier', 'Rôle'],
        [
          ['prisma/migrations/20260601_phase9_feature_flags_cms/migration.sql', 'CREATE TYPE flag_scope + CREATE TABLE feature_flags / app_settings'],
          ['modules/feature-flags/dto/set-feature-flag.dto.ts',    'DTO : key, scope, scopeId?, enabled, metadata?'],
          ['modules/feature-flags/feature-flags.service.ts',       'resolve() list() set() remove()'],
          ['modules/feature-flags/feature-flags.service.spec.ts',  '13 tests (10 Phase 9 + 3 audit)'],
          ['modules/feature-flags/feature-flags.controller.ts',    '4 endpoints REST + validation scope'],
          ['modules/feature-flags/feature-flags.module.ts',        'Module NestJS'],
          ['modules/app-settings/dto/set-app-setting.dto.ts',      'DTO : key, scope, scopeId?, value'],
          ['modules/app-settings/app-settings.service.ts',         'get() list() set() remove()'],
          ['modules/app-settings/app-settings.service.spec.ts',    '13 tests (11 Phase 9 + 2 audit)'],
          ['modules/app-settings/app-settings.controller.ts',      '4 endpoints REST + validation scope'],
          ['modules/app-settings/app-settings.module.ts',          'Module NestJS'],
          ['apps/operator/src/hooks/useFeatureFlag.ts',             'Hook React — résolution flag via API, fail-closed'],
        ],
        [4400, 4960],
      ),

      h2('3.2 Fichiers modifiés'),
      table(
        ['Fichier', 'Changement'],
        [
          ['backend/prisma/schema.prisma',                         '+enum FlagScope +model FeatureFlag +model AppSetting'],
          ['backend/src/app.module.ts',                            '+FeatureFlagsModule +AppSettingsModule'],
          ['backend/src/modules/realtime/realtime.gateway.ts',     'CORS origin → CORS_ORIGINS env (fix P2 Phase 6)'],
        ],
        [4400, 4960],
      ),

      divider(),

      // ── 4. Endpoints ─────────────────────────────────────────────────────────

      h1('4. Endpoints REST'),
      table(
        ['Méthode', 'URL', 'Description'],
        [
          ['GET',    '/api/v1/feature-flags',                               'Liste les flags (?scope=&scopeId=)'],
          ['GET',    '/api/v1/feature-flags/resolve?key=&orgId=&eventId=',  '{key, enabled, resolvedAt}'],
          ['POST',   '/api/v1/feature-flags',                               'Upsert — crée ou met à jour'],
          ['DELETE', '/api/v1/feature-flags/:id',                           'Supprime un flag'],
          ['GET',    '/api/v1/app-settings',                                'Liste les settings (?scope=&scopeId=)'],
          ['GET',    '/api/v1/app-settings/get?key=&orgId=&eventId=',       '{key, value, resolvedAt}'],
          ['POST',   '/api/v1/app-settings',                                'Upsert — crée ou met à jour'],
          ['DELETE', '/api/v1/app-settings/:id',                            'Supprime un setting'],
        ],
        [900, 4400, 4060],
      ),
      sp(),
      para('Tous les endpoints requièrent un JWT valide. En V2 : restreindre les écritures à SUPER_ADMIN / ORG_ADMIN.'),

      divider(),

      // ── 5. Hook useFeatureFlag ────────────────────────────────────────────────

      h1('5. Hook useFeatureFlag (frontend)'),
      para('Résout un flag côté serveur depuis un composant React (fail-closed — false pendant le chargement et sur erreur) :'),
      code('const { enabled, loading } = useFeatureFlag(\'rush_mode\', {'),
      code('  eventId: \'evt-uuid\','),
      code('  token:   localStorage.getItem(\'operator_token\'),'),
      code('});'),
      code('if (!enabled) return null; // feature gated'),
      sp(),
      para('Options : token (JWT), orgId, eventId. Cleanup automatique via cancelled flag sur démontage React.'),

      divider(),

      // ── 6. Audit Phase 9 ─────────────────────────────────────────────────────

      h1('6. Audit Phase 9 — Corrections P2'),

      para('4 P2 identifiés et corrigés. 0 P1. 5 nouveaux tests d\'audit.', { bold: true }),
      sp(),

      h2('P2-1 — ?scope= non validé dans les contrôleurs (→ Prisma 500)'),
      para('Cause : @Query(\'scope\') scope?: FlagScope acceptait n\'importe quelle chaîne. Passer ?scope=INVALID envoyait une valeur invalide à Prisma → PrismaClientValidationError non interceptée → HTTP 500 (attendu : 400 BadRequest).'),
      para('Fix : guard inline dans list() de chaque contrôleur :'),
      code('if (scope && !Object.values(FlagScope).includes(scope))'),
      code('  throw new BadRequestException(`Invalid scope: "${scope}"`)'),
      para('Fichiers : feature-flags.controller.ts, app-settings.controller.ts'),

      sp(),

      h2('P2-2 — Validation cross-champ absente dans set()'),
      para('Deux états incohérents possibles sans validation :'),
      bullet('scope=GLOBAL + scopeId fourni → flag GLOBAL avec scopeId≠null stocké. resolve() ne le retrouvait pas (filtre scopeId: null). Flag perdu silencieusement.'),
      bullet('scope=ORG/EVENT + scopeId absent → flag stocké avec scopeId=null. resolve() le cherchait dans le bucket GLOBAL, jamais dans ORG/EVENT. Feature flag définitivement injoignable.'),
      para('Fix dans set() des deux services :'),
      code('if (scope === FlagScope.GLOBAL && scopeId)'),
      code('  throw new BadRequestException(\'scopeId must not be set when scope is GLOBAL\')'),
      code('if (scope !== FlagScope.GLOBAL && !scopeId)'),
      code('  throw new BadRequestException(\'scopeId is required when scope is ORGANIZATION or EVENT\')'),

      sp(),

      h2('P2-3 — findFirst(GLOBAL) sans scopeId: null'),
      para('findFirst({ key, scope: GLOBAL }) sans scopeId: null pouvait retourner un enregistrement GLOBAL avec scopeId≠null si la garde P2-2 était contournée (SQL direct, migration de données, etc.).'),
      para('Fix : where: { key, scope: FlagScope.GLOBAL, scopeId: null } dans les deux services.'),

      sp(),

      h2('P2-4 — FeatureFlagsService.remove() → Prisma P2025 non intercepté'),
      para('AppSettingsService.remove() avait le pattern correct (findUnique avant delete + NotFoundException). FeatureFlagsService.remove() appelait delete() directement → Prisma PrismaKnownRequestError P2025 non catchée → HTTP 500.'),
      para('Fix : miroir exact du pattern AppSettings.'),

      sp(),

      h2('P3 — Documentés (pas de fix code en V1)'),
      table(
        ['ID', 'Risque', 'Mitigation prévue'],
        [
          ['9.1', 'Pas de RBAC — tout JWT peut lire/écrire flags et settings', 'Restreindre à SUPER_ADMIN/ORG_ADMIN en V2'],
          ['9.2', 'Pas de cache sur resolve() — 1-3 requêtes DB par appel', 'Cache mémoire TTL 60s ou Redis si haute fréquence'],
          ['9.3', 'UNIQUE PostgreSQL avec NULL non couvert par NULLS NOT DISTINCT — doublons GLOBAL possibles via SQL direct', 'NULLS NOT DISTINCT (PG 15+) ou index partiel en V2'],
        ],
        [600, 4400, 4360],
      ),

      divider(),

      // ── 7. Tests ─────────────────────────────────────────────────────────────

      h1('7. Tests'),
      table(
        ['Suite', 'Phase 9', 'Audit', 'Total', 'Couverture'],
        [
          ['feature-flags.service.spec.ts', '10', '3', '13', 'resolve (5 scénarios), list, set, set cross-field, remove, remove NotFound'],
          ['app-settings.service.spec.ts',  '11', '2', '13', 'get (4 scénarios), list, set, set cross-field, remove, remove NotFound'],
        ],
        [2600, 900, 800, 900, 4160],
      ),
      sp(),
      para('Résultats globaux : 250 tests passants, 20 suites, 0 failure.', { bold: true }),

      divider(),

      // ── 8. Prochaines étapes ─────────────────────────────────────────────────

      h1('8. Phase 10 — QA, Rush Tests, Déploiement'),
      para('Phase 9 clôt le développement fonctionnel V1. Phase 10 (dernière) :'),
      bullet('Rush testing via SimulatorService — 50, 100, 500 commandes simultanées'),
      bullet('Load testing — gateway Socket.IO sous charge'),
      bullet('Sentry — intégration erreurs frontend + backend'),
      bullet('Production logs — format JSON structuré, rotation'),
      bullet('Beta deployment — Vercel (frontend) + Railway/Render (backend)'),
      bullet('Checklist de déploiement — envs, migrations, smoke tests'),

      divider(),

      // ── Annexe ───────────────────────────────────────────────────────────────

      h1('Annexe — Variables d\'environnement Phase 9'),
      table(
        ['Variable', 'Valeur dev', 'Description'],
        [
          ['CORS_ORIGINS', 'http://localhost:3001', 'Origines autorisées HTTP + WS (virgule-séparées en prod)'],
          ['DATABASE_URL', 'postgresql://...',      'Connexion PostgreSQL (inchangée)'],
        ],
        [2400, 2800, 4160],
      ),
    ],
  }],
});

// ─── Output ──────────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, '..', 'PHASE_9_CMS_FEATURE_FLAGS.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log(`✅ Document créé : ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
});
