/**
 * generate_phase11.js
 *
 * Generates PHASE_11_ADMIN_PANEL.docx — Technical Brief for Phase 11.
 * Updated: 2026-06-02 (post-audit v2)
 *
 * Run from monorepo root:
 *   node "phases de DEV/generate_phase11.js"
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, LevelFormat, TabStopType, TabStopPosition,
} = require('docx');
const fs   = require('fs');
const path = require('path');

// ─── Design tokens ─────────────────────────────────────────────────────────────

const BLUE  = '1d4ed8';
const DARK  = '1f2937';
const GRAY  = '6b7280';
const GREEN = '065f46';
const RED   = '991b1b';
const bg1   = { style: BorderStyle.SINGLE, size: 1, color: 'D1D5DB' };
const borders = { top: bg1, bottom: bg1, left: bg1, right: bg1 };

// ─── Helpers ───────────────────────────────────────────────────────────────────

const h1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  children: [new TextRun({ text, bold: true, color: BLUE, size: 36, font: 'Arial' })],
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

const routeRow = (method, route, guard, desc, bg = 'FFFFFF') => new TableRow({
  children: [
    new TableCell({
      borders,
      width: { size: 900, type: WidthType.DXA },
      shading: { fill: method === 'GET' ? 'DBEAFE' : method === 'POST' ? 'D1FAE5' : method === 'PATCH' ? 'FEF3C7' : 'FEE2E2', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: method, size: 18, font: 'Arial', bold: true, color: method === 'GET' ? '1e40af' : method === 'POST' ? '065f46' : method === 'PATCH' ? '92400e' : '991b1b' })] })],
    }),
    new TableCell({
      borders,
      width: { size: 3200, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: route, size: 18, font: 'Courier New', color: '1e3a5f' })] })],
    }),
    new TableCell({
      borders,
      width: { size: 1500, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: guard, size: 18, font: 'Arial', color: GRAY })] })],
    }),
    new TableCell({
      borders,
      width: { size: 3760, type: WidthType.DXA },
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: desc, size: 18, font: 'Arial', color: DARK })] })],
    }),
  ],
});

const divider = () => new Paragraph({
  children: [new TextRun('')],
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB', space: 1 } },
  spacing: { after: 200 },
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
        run: { size: 36, bold: true, font: 'Arial', color: BLUE },
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
            new TextRun({ text: 'BREAK EAT — PHASE 11 : ADMIN PANEL', size: 18, font: 'Arial', color: GRAY }),
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
        children: [new TextRun({ text: 'BREAK EAT', size: 56, bold: true, font: 'Arial', color: BLUE })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 480, after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'PHASE 11 — ADMIN PANEL', size: 40, bold: true, font: 'Arial', color: DARK })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', size: 24, font: 'Arial', color: GRAY, italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: '02/06/2026 — Version 2 (post-audit)', size: 22, font: 'Arial', color: GRAY })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
      }),

      divider(),
      spacer(),

      // ─── Section 1: Objectif ───────────────────────────────────────────────────
      h1('1. Objectif de la Phase 11'),
      p('Phase 11 construit le panel d\'administration Next.js 15 de Break Eat. Ce panel est l\'outil central de configuration et de supervision : il permet de gerer les utilisateurs, les organisations, les evenements, les feature flags et les parametres applicatifs.'),
      spacer(),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 6560],
        rows: [
          kvRow('Application', 'apps/admin — Next.js 15 App Router, port 3001', 'F9FAFB'),
          kvRow('URL de dev', 'http://localhost:3001', 'FFFFFF'),
          kvRow('Authentification', 'JWT Bearer token — localStorage admin_token', 'F9FAFB'),
          kvRow('Backend', 'NestJS 11 sur http://localhost:3000/api/v1', 'FFFFFF'),
          kvRow('Status', 'Phase terminee + auditee', 'F9FAFB'),
        ],
      }),

      spacer(),
      divider(),

      // ─── Section 2: Bloc 11.1 ─────────────────────────────────────────────────
      h1('2. BLOC 11.1 — Endpoint /auth/me/memberships'),
      h2('Objectif'),
      p('Permettre au panel admin de connaitre a quelle(s) organisation(s) appartient l\'utilisateur connecte, et avec quel role, immediatement apres le login.'),
      h2('Route'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [900, 3200, 1500, 3760],
        rows: [
          new TableRow({
            children: ['Methode', 'Route', 'Guard', 'Description'].map((h, i) => new TableCell({
              borders,
              width: { size: [900, 3200, 1500, 3760][i], type: WidthType.DXA },
              shading: { fill: '1F2937', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: h, size: 20, bold: true, font: 'Arial', color: 'FFFFFF' })] })],
            })),
          }),
          routeRow('GET', '/auth/me/memberships', 'JwtAuth', 'Retourne user + memberships[]. Chaque membership inclut org (id, name, slug) et le supplier assigne (depuis Phase 12.7)', 'FFFFFF'),
        ],
      }),
      spacer(),
      h2('Implementation'),
      bullet('UsersService.findByIdWithMemberships() — Prisma query inclut memberships.organization et memberships.supplier'),
      bullet('Retourne SafeUser (sans passwordHash) + memberships enrichis'),
      bullet('Utilise par le panel admin pour choisir l\'organisation de travail, et par l\'app operateur pour lire supplierId'),
      spacer(),
      h2('Fichiers'),
      code('backend/src/modules/users/users.service.ts — findByIdWithMemberships()'),
      code('backend/src/modules/auth/auth.controller.ts — GET /auth/me/memberships'),

      spacer(),
      divider(),

      // ─── Section 3: Bloc 11.2 ─────────────────────────────────────────────────
      h1('3. BLOC 11.2 — App admin + admin-client.ts'),
      h2('Objectif'),
      p('Creer l\'application Next.js 15 (apps/admin) avec la configuration de base et le client API centralise.'),
      h2('admin-client.ts — Client API centralise'),
      p('Fichier unique: apps/admin/src/lib/api/admin-client.ts. Toutes les fonctions fetch de l\'admin panel passent par ce fichier.'),
      bullet('req<T>() — fetch de base avec Authorization Bearer, gestion 401 (auto-redirect /login), gestion 204 No Content'),
      bullet('Helpers localStorage : getToken(), getOrgId(), getOrgName(), getStoredUser(), clearSession()'),
      bullet('Types TypeScript : AdminUser, Organization, AdminEvent, Supplier, OrgMember, OrgMemberWithUser, etc.'),
      bullet('Fonctions export pour chaque module backend : apiLogin(), apiGetOrganization(), apiGetEvents(), apiGetSuppliers(), apiGetFeatureFlags(), apiGetAppSettings(), etc.'),
      spacer(),
      h2('Comportement 401'),
      p('Toute reponse 401 du backend entraine : clearSession() + window.location.href = /login. L\'utilisateur est redirige vers la page de connexion sans message d\'erreur supplementaire.'),
      spacer(),
      h2('Fichiers'),
      code('apps/admin/src/lib/api/admin-client.ts — client unique'),
      code('apps/admin/next.config.ts — configuration Next.js (pas de config speciale requise)'),
      code('apps/admin/src/app/(admin)/layout.tsx — layout avec sidebar, guard token, redirect /login'),

      spacer(),
      divider(),

      // ─── Section 4: Bloc 11.3 ─────────────────────────────────────────────────
      h1('4. BLOC 11.3 — Pages Admin Panel'),
      h2('Architecture'),
      p('Toutes les pages admin sont sous apps/admin/src/app/(admin)/. Le layout.tsx verifie le token et redirige vers /login si absent. La sidebar contient 9 entrees de navigation.'),
      spacer(),
      h2('Sidebar Navigation'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1800, 3000, 4560],
        rows: [
          new TableRow({
            children: ['Route', 'Label', 'Description'].map((h, i) => new TableCell({
              borders,
              width: { size: [1800, 3000, 4560][i], type: WidthType.DXA },
              shading: { fill: '1F2937', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: h, size: 20, bold: true, font: 'Arial', color: 'FFFFFF' })] })],
            })),
          }),
          ...[
            ['/dashboard', 'Tableau de bord', 'Vue d\'ensemble, statut API, liens rapides'],
            ['/organizations', 'Organisation', 'Detail org : membres, branding (logo, couleur, description)'],
            ['/team', 'Equipe', 'Membres avec roles et fournisseurs assignes, formulaire invitation'],
            ['/venues', 'Lieux', 'CRUD lieux (nom, adresse, timezone)'],
            ['/events', 'Evenements', 'Liste evenements + creation'],
            ['/events/[id]', 'Detail evenement', 'Statut, fournisseurs, points de retrait, creneaux, branding'],
            ['/feature-flags', 'Feature Flags', 'Toggle fonctionnalites par scope'],
            ['/settings', 'Parametres', 'Cles/valeurs de configuration'],
            ['/simulator', 'Simulateur', 'Seed, rush, progress, random-failures, clear'],
            ['/demo-setup', 'Demo Spartiates', 'Wizard creation demo complete en 1 clic'],
          ].map(([route, label, desc], i) => new TableRow({
            children: [route, label, desc].map((val, j) => new TableCell({
              borders,
              width: { size: [1800, 3000, 4560][j], type: WidthType.DXA },
              shading: { fill: i % 2 === 0 ? 'F9FAFB' : 'FFFFFF', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: val, size: 18, font: j === 0 ? 'Courier New' : 'Arial', color: DARK })] })],
            })),
          })),
        ],
      }),

      spacer(),
      h2('Page Login (/login)'),
      bullet('Formulaire email + password'),
      bullet('Appel apiLogin() → stocke admin_token, admin_user, admin_org_id, admin_org_name dans localStorage'),
      bullet('Redirect vers /dashboard apres connexion reussie'),
      code('apps/admin/src/app/login/page.tsx'),

      spacer(),
      h2('Page Dashboard'),
      bullet('Cartes de navigation pour les 7 sections principales (y compris Equipe et Lieux, ajoutes post-audit)'),
      bullet('Indicateur statut backend (health check)'),
      bullet('Lien rapide vers le dashboard operateur'),
      code('apps/admin/src/app/(admin)/dashboard/page.tsx'),

      spacer(),
      h2('Layout Admin (sidebar)'),
      bullet('Guard : verifie token au montage, redirect /login si absent'),
      bullet('Affiche orgName dans la sidebar si defini'),
      bullet('Navigation active detectee via usePathname()'),
      bullet('Bouton deconnexion : clearSession() + redirect /login'),
      code('apps/admin/src/app/(admin)/layout.tsx'),

      spacer(),
      divider(),

      // ─── Section 5: Architecture ───────────────────────────────────────────────
      h1('5. Architecture Frontend'),
      h2('Pattern de page standard'),
      p('Toutes les pages admin suivent le meme pattern :'),
      bullet('\'use client\' — rendu cote client uniquement'),
      bullet('useState pour les donnees, useEffect pour les appels API initiaux'),
      bullet('useCallback pour les fonctions de chargement (evite les re-renders)'),
      bullet('Gestion d\'erreur : state error + affichage d\'une banniere rouge'),
      bullet('Loading state : spinner ou texte "Chargement..."'),
      bullet('Actions : confirm() avant les operations destructrices'),
      spacer(),
      h2('Gestion de l\'organisation active'),
      p('L\'organisation active est stockee dans localStorage sous la cle admin_org_id. Le layout.tsx charge cette valeur et l\'affiche dans la sidebar. Toutes les pages utilisent getOrgId() pour construire les URLs d\'API.'),
      spacer(),
      h2('Styles'),
      p('Pas de framework CSS. Tous les styles sont des objets inline React (style={{ ... }}). Design system tokens : #111827 (dark), #6b7280 (gray), #3b82f6 (blue), #d1fae5 (green bg), #fee2e2 (red bg).'),

      spacer(),
      divider(),

      // ─── Section 6: Audit ─────────────────────────────────────────────────────
      h1('6. Resultats de l\'audit Phase 11'),
      h2('Findings'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [800, 2200, 3760, 2600],
        rows: [
          new TableRow({
            children: ['Priorite', 'Zone', 'Description', 'Statut'].map((h, i) => new TableCell({
              borders,
              width: { size: [800, 2200, 3760, 2600][i], type: WidthType.DXA },
              shading: { fill: '1F2937', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: h, size: 20, bold: true, font: 'Arial', color: 'FFFFFF' })] })],
            })),
          }),
          ...[
            ['P1', 'Aucun', 'Aucun bug critique trouve en Phase 11', 'N/A'],
            ['P2', 'Dashboard', 'URL operateur localhost:3002 hardcodee — ne fonctionnera pas en prod', 'Documente backlog'],
            ['P3', 'Dashboard', 'Cartes Equipe et Lieux absentes de la grille de navigation', 'CORRIGE'],
          ].map(([prio, zone, desc, status], i) => new TableRow({
            children: [prio, zone, desc, status].map((val, j) => new TableCell({
              borders,
              width: { size: [800, 2200, 3760, 2600][j], type: WidthType.DXA },
              shading: { fill: prio === 'P1' ? 'FEF2F2' : prio === 'P2' ? 'FFFBEB' : 'F0FDF4', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: val, size: 18, font: 'Arial', color: prio === 'P1' ? RED : DARK, bold: j === 0 })] })],
            })),
          })),
        ],
      }),
      spacer(),
      h2('Correction appliquee : cartes navigation dashboard'),
      p('Le CARDS array dans dashboard/page.tsx ne referencait pas les sections Equipe (/team) et Lieux (/venues) qui avaient ete ajoutees en Phase 12 dans la sidebar. Les deux cartes ont ete ajoutees.'),
      code('apps/admin/src/app/(admin)/dashboard/page.tsx — +carte Equipe + carte Lieux'),

      spacer(),
      divider(),

      // ─── Section 7: Tests & Verification ──────────────────────────────────────
      h1('7. Tests et Verification'),
      h2('Backend'),
      bullet('273/273 tests NestJS passent apres Phase 11 (aucun test specifique Phase 11 : pas de nouvelles logiques backend)'),
      bullet('TypeScript : 0 erreurs (npx tsc --noEmit)'),
      h2('Frontend'),
      bullet('Aucun test automatise — verification manuelle des pages'),
      bullet('Verification : login fonctionne, sidebar s\'affiche avec orgName, redirect /login si token absent'),
      bullet('Verification : chaque page charge les donnees depuis l\'API et les affiche correctement'),

      spacer(),
      divider(),

      // ─── Section 8: Points d'attention ────────────────────────────────────────
      h1('8. Points d\'attention et regles de modification'),
      bullet('Ne jamais appeler localStorage en dehors d\'un useEffect ou d\'une fonction evenement — cause des erreurs d\'hydratation Next.js'),
      bullet('Le layout.tsx garantit l\'authentification pour toutes les sous-pages — ne pas dupliquer la verification du token dans les pages'),
      bullet('admin-client.ts est le seul endroit ou les appels API sont construits — ne pas creer d\'autres fonctions fetch'),
      bullet('La cle admin_org_id dans localStorage doit etre definie pour que les pages fonctionnent correctement'),
      bullet('Le refresh token n\'est pas implemente — la session expire quand le JWT expire'),

      spacer(),

    ],
  }],
});

// ─── Write DOCX ───────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, 'PHASE_11_ADMIN_PANEL.docx');
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated: ${outPath}`);
}).catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});
