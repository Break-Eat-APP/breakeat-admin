/**
 * Generate PHASE_8_DASHBOARDS_PUBLIC_SCREENS.docx
 * Run: NODE_PATH="C:\Users\notta\AppData\Roaming\npm\node_modules" node generate_phase8.js
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, LevelFormat, PageBreak,
} = require('docx');
const fs = require('fs');
const path = require('path');

// ─── helpers ────────────────────────────────────────────────────────────────

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, size: 32, font: 'Arial' })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, bold: true, size: 26, font: 'Arial' })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 60 },
    children: [new TextRun({ text, bold: true, size: 22, font: 'Arial', color: '1e40af' })],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 20, ...opts })],
  });
}

function bold(text) {
  return para(text, { bold: true });
}

function code(text) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
    children: [new TextRun({ text, font: 'Courier New', size: 18, color: '1e293b' })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: 'Arial', size: 20 })],
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 60 }, children: [new TextRun('')] });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function statusRow(status, color, description) {
  return new TableRow({
    children: [
      new TableCell({
        borders: BORDERS,
        width: { size: 2200, type: WidthType.DXA },
        shading: { fill: color, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: status, bold: true, font: 'Arial', size: 18 })] })],
      }),
      new TableCell({
        borders: BORDERS,
        width: { size: 7160, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: description, font: 'Arial', size: 18 })] })],
      }),
    ],
  });
}

function twoColTable(col1Header, col2Header, rows) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        borders: BORDERS,
        width: { size: 4680, type: WidthType.DXA },
        shading: { fill: '1e3a5f', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: col1Header, bold: true, color: 'FFFFFF', font: 'Arial', size: 18 })] })],
      }),
      new TableCell({
        borders: BORDERS,
        width: { size: 4680, type: WidthType.DXA },
        shading: { fill: '1e3a5f', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: col2Header, bold: true, color: 'FFFFFF', font: 'Arial', size: 18 })] })],
      }),
    ],
  });

  const dataRows = rows.map(([c1, c2]) => new TableRow({
    children: [
      new TableCell({
        borders: BORDERS,
        width: { size: 4680, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: c1, font: 'Courier New', size: 18 })] })],
      }),
      new TableCell({
        borders: BORDERS,
        width: { size: 4680, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: c2, font: 'Arial', size: 18 })] })],
      }),
    ],
  }));

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: [headerRow, ...dataRows],
  });
}

function threeColTable(h1, h2, h3, rows) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [h1, h2, h3].map((text, i) => new TableCell({
      borders: BORDERS,
      width: { size: [3120, 3120, 3120][i], type: WidthType.DXA },
      shading: { fill: '1e3a5f', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', font: 'Arial', size: 18 })] })],
    })),
  });

  const dataRows = rows.map(([c1, c2, c3]) => new TableRow({
    children: [c1, c2, c3].map((text, i) => new TableCell({
      borders: BORDERS,
      width: { size: [3120, 3120, 3120][i], type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text, font: 'Arial', size: 18 })] })],
    })),
  }));

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3120, 3120, 3120],
    rows: [headerRow, ...dataRows],
  });
}

// ─── document ────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '-', alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } } },
        ],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: 'Arial', size: 20 } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children: [

      // ═══════════════════════════════════════════════════════════════════
      // COVER PAGE
      // ═══════════════════════════════════════════════════════════════════
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1440, after: 200 },
        children: [new TextRun({ text: 'BREAK EAT', bold: true, size: 64, font: 'Arial', color: '1e3a5f' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: 'PHASE 8 : DASHBOARDS + PUBLIC SCREENS', bold: true, size: 36, font: 'Arial', color: '2563eb' })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', size: 24, font: 'Arial', color: '64748b', italics: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: '2026-06-01', size: 22, font: 'Arial', color: '94a3b8' })],
      }),
      spacer(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
        children: [new TextRun({ text: 'CONFIDENTIEL — Usage interne uniquement', size: 18, font: 'Arial', color: 'ef4444', bold: true })],
      }),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2200, 7160],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'dbeafe', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Version', bold: true, font: 'Arial', size: 18 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 7160, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: '0.16.0', font: 'Arial', size: 18 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'dbeafe', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Phase', bold: true, font: 'Arial', size: 18 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 7160, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: '8 / 10', font: 'Arial', size: 18 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'dbeafe', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Stack', bold: true, font: 'Arial', size: 18 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 7160, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Next.js 15 (App Router) + NestJS 11 + socket.io-client + Web Audio API', font: 'Arial', size: 18 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'dbeafe', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Tests', bold: true, font: 'Arial', size: 18 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 7160, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: '~223 tests backend passants (19 suites, 0 failure)', font: 'Arial', size: 18 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'dbeafe', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Storybook', bold: true, font: 'Arial', size: 18 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 7160, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: '19 stories (DashboardColumn, NotificationPopup, PublicScreenRow, OrderCard)', font: 'Arial', size: 18 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'dbeafe', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Précédent', bold: true, font: 'Arial', size: 18 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 7160, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Phase 7 — Slots + Flaix Foundation (203 tests)', font: 'Arial', size: 18 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, shading: { fill: 'dbeafe', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Suivant', bold: true, font: 'Arial', size: 18 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 7160, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Phase 9 — CMS basique + Feature Flags', font: 'Arial', size: 18 })] })] }),
          ]}),
        ],
      }),

      pageBreak(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 1 — OBJECTIF
      // ═══════════════════════════════════════════════════════════════════
      h1('1. Objectif de la Phase 8'),
      para("La Phase 8 livre les deux interfaces utilisateur temps réel principales de Break Eat :"),
      spacer(),
      bullet("Le dashboard opérateur — un tableau kanban en 5 colonnes mis à jour via Socket.IO, avec alertes sonores, mode plein écran et gestion des mutations (accept, préparer, prêt, récupéré, annuler)."),
      bullet("L'écran public — une page sans authentification qui affiche uniquement les numéros de commandes prêtes, destinée à être affichée sur un écran dans le lieu (stade, festival, arena)."),
      spacer(),
      para("Côté backend, la phase ajoute :"),
      bullet("GET /orders/event/:eventId/dashboard — snapshot groupé par statut"),
      bullet("PATCH /orders/:id/assign-slot — assignation atomique de créneau"),
      bullet("GET /flaix/event/:eventId/rush-status + decisions — consultation de l'IA Flaix"),
      bullet("Simulator étendu : progressOrders(), randomFailures(), getStats()"),
      spacer(),
      para("La Phase 8 consomme les fondations posées par les phases 6 (realtime, state machine) et 7 (slots, Flaix) sans les modifier."),

      spacer(), spacer(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 2 — ARCHITECTURE
      // ═══════════════════════════════════════════════════════════════════
      h1('2. Architecture — Vue d\'ensemble'),

      h2('2.1 Nouveaux endpoints backend'),
      twoColTable('Route', 'Description', [
        ['GET  /orders/event/:eid/dashboard', 'Snapshot groupé par statut (PAID/ACCEPTED/PREPARING/READY/RECOVERED)'],
        ['PATCH /orders/:id/assign-slot', 'Assignation atomique d\'un Slot à une commande (via SlotsService)'],
        ['GET  /flaix/event/:eid/rush-status', 'Derniere decision RUSH Flaix pour cet evenement'],
        ['GET  /flaix/event/:eid/decisions', 'Historique complet des decisions Flaix'],
        ['POST /internal/simulator/events/:eid/progress', 'Avance toutes les commandes DEMO- d\'un etat'],
        ['POST /internal/simulator/events/:eid/random-failures', 'Annule ou recupere aleatoirement des commandes'],
        ['GET  /internal/simulator/events/:eid/stats', 'Statistiques par statut (commandes DEMO- uniquement)'],
      ]),
      spacer(),

      h2('2.2 Nouveaux fichiers frontend'),
      twoColTable('Fichier', 'Role', [
        ['src/lib/realtime/socket-client.ts', 'Couche socket.io-client (dynamic import, JWT, dedup, onResync)'],
        ['src/lib/api/orders-client.ts', 'REST API client (fetchDashboard + toutes mutations commandes)'],
        ['src/components/StatusBadge.tsx', '8 variants de badge de statut (labels francais)'],
        ['src/components/OrderCard.tsx', 'Carte commande avec boutons d\'action contextuels'],
        ['src/components/DashboardColumn.tsx', 'Colonne kanban avec indicateur hasNew et empty state'],
        ['src/components/NotificationPopup.tsx', 'Overlay notification avec auto-dismiss 4s'],
        ['src/components/PublicScreenRow.tsx', 'Ligne ecran public (ZERO PII)'],
        ['src/hooks/useSound.ts', 'Beeps Web Audio API (OscillatorNode, zero dependance)'],
        ['src/hooks/useDashboard.ts', 'Hook principal (useReducer + socket + polling fallback)'],
        ['src/app/dashboard/[eventId]/page.tsx', 'Page dashboard operateur (JWT, kanban, fullscreen)'],
        ['src/app/public/[eventId]/page.tsx', 'Page ecran public (sans auth, auto-prune 5min)'],
      ]),
      spacer(),

      pageBreak(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 3 — BACKEND
      // ═══════════════════════════════════════════════════════════════════
      h1('3. Backend — Bloc 8.1'),

      h2('3.1 Dashboard API'),
      para('L\'endpoint GET /orders/event/:eventId/dashboard retourne les commandes actives groupées par statut. Une seule requête Prisma suffit, le groupement est fait en mémoire.'),
      spacer(),
      code('GET /api/v1/orders/event/:eventId/dashboard'),
      code('Authorization: Bearer <operator_token>'),
      spacer(),
      para('Réponse :'),
      code('{'),
      code('  "eventId": "uuid",'),
      code('  "counts": { "PAID": 3, "ACCEPTED": 5, "PREPARING": 2, "READY": 1, "RECOVERED": 0 },'),
      code('  "orders": {'),
      code('    "PAID": [...],  // include: { items: true }'),
      code('    "ACCEPTED": [],'),
      code('    "PREPARING": [],'),
      code('    "READY": [],'),
      code('    "RECOVERED": []'),
      code('  }'),
      code('}'),
      spacer(),
      para('Seuls les 5 statuts "live" sont retournés. COMPLETED, CANCELLED, PICKED_UP ne figurent pas dans le dashboard.'),

      spacer(),
      h2('3.2 Assign Slot'),
      para('PATCH /orders/:id/assign-slot délègue à SlotsService.assignOrderToSlot() dans une $transaction Prisma. La méthode est race-safe (même pattern updateMany + WHERE conditionnel que Phase 7).'),
      spacer(),
      code('PATCH /api/v1/orders/:id/assign-slot'),
      code('{ "slotId": "uuid" }'),
      spacer(),

      h2('3.3 Endpoints Flaix'),
      para('Deux endpoints en lecture seule exposant l\'audit FlaixDecision. Utiles pour le dashboard opérateur avancé (Phase 9).'),
      spacer(),
      code('GET /api/v1/flaix/event/:eventId/rush-status'),
      code('GET /api/v1/flaix/event/:eventId/decisions'),
      spacer(),

      h2('3.4 Simulator étendu'),

      h3('progressOrders()'),
      para('Avance chaque commande DEMO- d\'un état selon la map NEXT_STATUS. Chaque transition utilise une $transaction individuelle pour respecter l\'outbox rule.'),
      code('NEXT_STATUS = {'),
      code('  PAID       → ACCEPTED'),
      code('  ACCEPTED   → PREPARING'),
      code('  PREPARING  → READY'),
      code('  RECOVERED  → ACCEPTED'),
      code('  // READY, PICKED_UP, COMPLETED, CANCELLED → skippés'),
      code('}'),
      spacer(),

      h3('randomFailures(failRate = 0.2)'),
      para('Applique un taux d\'échec aléatoire sur les commandes actives DEMO- (PAID/ACCEPTED/PREPARING). 60% des affectés → CANCELLED, 40% → RECOVERED.'),
      code('POST /internal/simulator/events/:eid/random-failures?failRate=0.3'),
      spacer(),

      h3('getStats()'),
      para('Retourne un comptage par statut de toutes les commandes DEMO- de l\'événement.'),
      code('GET /internal/simulator/events/:eid/stats'),
      code('→ { "stats": { "PAID": 5, "ACCEPTED": 3, ... }, "total": 20, "eventId": "..." }'),

      spacer(),
      h2('3.5 Tests backend Phase 8'),
      twoColTable('Suite de tests', 'Couverture', [
        ['simulator.service.spec.ts (15 tests)', 'seed/rush/clear, progressOrders (PAID->ACCEPTED, PREPARING->READY, COMPLETED skip), randomFailures (failRate=1 tous, =0 aucun), getStats'],
        ['orders.service.spec.ts (+5 tests)', 'findDashboardByEvent: groups orders, empty groups, queries 5 statuses; assignOrderToSlot: assigns+returns, NotFoundException'],
      ]),
      spacer(),

      pageBreak(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 4 — SOCKET CLIENT
      // ═══════════════════════════════════════════════════════════════════
      h1('4. Frontend — Bloc 8.2 : Socket Client'),

      h2('4.1 Dynamic import (SSR safety)'),
      para('Next.js App Router exécute les modules côté serveur. socket.io-client utilise window/WebSocket qui n\'existent pas en SSR. La solution est le dynamic import JavaScript :'),
      spacer(),
      code('// apps/operator/src/lib/realtime/socket-client.ts'),
      code('const { io } = await import(\'socket.io-client\');'),
      code('const socket = io(SOCKET_URL, {'),
      code('  auth: { token: this.options.token },'),
      code('  transports: [\'websocket\', \'polling\'],'),
      code('});'),
      spacer(),
      para('L\'import dynamique garantit que socket.io-client n\'est jamais évalué en contexte Node.js.'),

      spacer(),
      h2('4.2 Déduplication des événements'),
      para('Le gateway peut émettre le même événement plusieurs fois (reconnexions, retry). La déduplication utilise un Set glissant de 1000 eventIds :'),
      spacer(),
      code('private readonly seenEventIds = new Set<string>();'),
      code(''),
      code('private isDuplicate(eventId: string): boolean {'),
      code('  if (this.seenEventIds.has(eventId)) return true;'),
      code('  if (this.seenEventIds.size >= 1000) {'),
      code('    // Retire le plus ancien (premier inséré)'),
      code('    const first = this.seenEventIds.values().next().value;'),
      code('    this.seenEventIds.delete(first);'),
      code('  }'),
      code('  this.seenEventIds.add(eventId);'),
      code('  return false;'),
      code('}'),
      spacer(),

      h2('4.3 onResync callback'),
      para('Lors d\'une reconnexion (pas du premier connect), le client déclenche le callback onResync. Dans useDashboard, ce callback déclenche un fetchSnapshot() complet pour récupérer l\'état manqué pendant la déconnexion.'),
      spacer(),
      code('socket.on(\'connect\', () => {'),
      code('  socket.emit(\'join_room\', { room: `event:${eventId}` });'),
      code('  if (this.connected) {          // deuxieme connect = reconnexion'),
      code('    this.options.onResync?.();'),
      code('  }'),
      code('  this.connected = true;'),
      code('});'),

      spacer(), spacer(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 5 — HOOKS
      // ═══════════════════════════════════════════════════════════════════
      h1('5. Frontend — Bloc 8.4 : Hooks'),

      h2('5.1 useDashboard — Architecture useReducer'),
      para('Le hook useDashboard est le chef d\'orchestre du dashboard. Il utilise useReducer plutôt que useState pour la prévisibilité et la testabilité.'),
      spacer(),

      h3('11 types d\'actions du reducer'),
      twoColTable('Action', 'Effet', [
        ['FETCH_START', 'isLoading = true'],
        ['FETCH_SUCCESS', 'data = payload, isLoading = false'],
        ['FETCH_ERROR', 'error = message, isLoading = false'],
        ['SOCKET_STATUS', 'socketStatus = \'connected\' | \'disconnected\''],
        ['NEW_ORDER', 'Declenche un resync REST complet (payload socket sans items)'],
        ['ORDER_UPDATED', 'Retire la commande de son ancienne colonne, l\'insere dans la nouvelle'],
        ['ORDER_READY', 'SET_NOTIFICATION + son playOrderReady()'],
        ['SET_NOTIFICATION', 'notification = payload (affiche NotificationPopup)'],
        ['CLEAR_NOTIFICATION', 'notification = null'],
        ['ORDER_LOADING', 'loadingOrderIds.add(orderId) — indicateur optimiste'],
        ['ORDER_LOADED', 'loadingOrderIds.delete(orderId)'],
      ]),
      spacer(),

      h3('Pourquoi NEW_ORDER declenche un resync REST ?'),
      para('Le payload socket de new_order ne contient que {orderNumber, orderStatus, eventId (dedup)}. Il ne contient PAS les items de la commande. Or OrderCard a besoin des items pour afficher le contenu. Un resync REST est plus simple qu\'un second socket event dédié aux items.'),
      spacer(),

      h3('Polling fallback'),
      code('const startPolling = () => {'),
      code('  clearInterval(pollRef.current);'),
      code('  pollRef.current = setInterval(loadSnapshot, pollInterval ?? 10_000);'),
      code('};'),
      code(''),
      code('// Actif seulement si socket deconnecte'),
      code('if (socketStatus === \'disconnected\') startPolling();'),
      code('else clearInterval(pollRef.current);'),
      spacer(),

      h3('withLoading — indicateur optimiste'),
      code('const withLoading = async (orderId: string, fn: () => Promise<void>) => {'),
      code('  dispatch({ type: \'ORDER_LOADING\', orderId });'),
      code('  try { await fn(); }'),
      code('  finally { dispatch({ type: \'ORDER_LOADED\', orderId }); }'),
      code('};'),

      spacer(),
      h2('5.2 useSound — Web Audio API'),
      para('Aucune dépendance externe pour les alertes sonores. L\'API Web Audio du navigateur permet de générer des beeps via OscillatorNode + GainNode.'),
      spacer(),

      twoColTable('Methode', 'Son genere', [
        ['playNewOrder()', '880 Hz + 1100 Hz (deux beeps de 0.18s)'],
        ['playOrderReady()', '880 Hz + 1100 Hz + 1320 Hz (gamme montante — commande prete)'],
      ]),
      spacer(),
      code('// Lazy init + gestion suspended (politique navigateur)'),
      code('const ctx = new AudioContext();'),
      code('if (ctx.state === \'suspended\') await ctx.resume();'),
      code('const osc = ctx.createOscillator();'),
      code('const gain = ctx.createGain();'),
      code('osc.connect(gain); gain.connect(ctx.destination);'),
      code('osc.frequency.value = 880;'),
      code('gain.gain.setValueAtTime(0.3, ctx.currentTime);'),
      code('gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);'),
      code('osc.start(); osc.stop(ctx.currentTime + 0.18);'),

      spacer(), spacer(),

      pageBreak(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 6 — PAGES
      // ═══════════════════════════════════════════════════════════════════
      h1('6. Frontend — Bloc 8.5 : Pages'),

      h2('6.1 Dashboard opérateur /dashboard/[eventId]'),
      para('Page entièrement client-side (\'use client\'). JWT stocké dans localStorage sous la clé operator_token.'),
      spacer(),

      h3('Flux d\'authentification'),
      bullet('Pas de token → affiche LoginForm (POST /auth/login → stocke token)'),
      bullet('Token présent → useDashboard({ eventId, token }) démarre'),
      bullet('Logout → efface localStorage, réaffiche LoginForm'),
      spacer(),

      h3('Layout kanban'),
      bullet('5 colonnes : PAID (Nouvelles), ACCEPTED (Acceptées), PREPARING (En préparation), READY (Prêtes), RECOVERED (Récupérées)'),
      bullet('hasNew prop → point rouge pulsant sur la colonne PAID lors d\'une nouvelle commande'),
      bullet('OrderCard dans chaque colonne avec les boutons d\'action contextuels'),
      bullet('ConnectionBadge (vert/rouge) dans le header'),
      bullet('Bouton plein écran → document.documentElement.requestFullscreen()'),
      spacer(),

      h3('Boutons d\'action par statut'),
      twoColTable('Statut commande', 'Actions disponibles', [
        ['PAID', 'Accepter | Récupérée | Annuler'],
        ['ACCEPTED', 'Préparer | Récupérée | Annuler'],
        ['PREPARING', 'Prête ✓ | Récupérée | Annuler'],
        ['READY', 'Récupérée'],
        ['RECOVERED', 'Aucun bouton'],
      ]),
      spacer(),

      h2('6.2 Écran public /public/[eventId]'),
      para('Aucune authentification requise. Destiné à être affiché sur un TV ou écran dans le lieu.'),
      spacer(),

      h3('Règles ZERO PII'),
      bullet('Seul le numéro de commande (ex: BE-00000042) est affiché'),
      bullet('Aucun nom de client'),
      bullet('Aucun article de la commande'),
      bullet('Aucun montant'),
      bullet('Point de retrait optionnel (ex: Zone A — Tribune Nord)'),
      spacer(),

      h3('Cycle de vie d\'une commande sur l\'écran public'),
      bullet('Apparition : order_ready socket ou snapshot REST → ADD_ORDER → isNew=true (animation highlight)'),
      bullet('Après 3s : CLEAR_NEW → isNew=false (animation terminée)'),
      bullet('Après 5min : PRUNE automatique (toutes les 30s) → commande retirée'),
      spacer(),
      code('// Auto-prune toutes les 30s'),
      code('const prune = setInterval(() => {'),
      code('  dispatch({ type: \'PRUNE\', maxAgeMs: 5 * 60_000 });'),
      code('}, 30_000);'),
      spacer(),

      h3('Socket non authentifié → polling REST uniquement'),
      para('L\'écran public n\'a pas de JWT. Le gateway Socket.IO refuse les connexions sans token. L\'écran public utilise donc uniquement le polling REST (toutes les 10s sur /orders/event/:eid/active). C\'est un comportement intentionnel — l\'écran public est en lecture seule et ne nécessite pas de push temps réel immédiat.'),

      spacer(), spacer(),

      pageBreak(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 7 — STORYBOOK
      // ═══════════════════════════════════════════════════════════════════
      h1('7. Storybook — Stories Phase 8'),

      para('Quatre fichiers de stories ajoutés/mis à jour dans apps/operator/src/stories/.'),
      spacer(),

      threeColTable('Fichier', 'Stories', 'Cas couverts', [
        ['DashboardColumn.stories.tsx', '5', 'EmptyPaid, PaidWithOrders (hasNew), Preparing, Ready, Recovered'],
        ['NotificationPopup.stories.tsx', '3', 'NewOrderNotification, OrderReadyNotification, NoNotification'],
        ['PublicScreenRow.stories.tsx', '4', 'JustReady (isNew), ReadyTwoMinutes, NoPickupLabel, MultipleRows'],
        ['OrderCard.stories.tsx', '7', 'NewOrder, Accepted, Preparing, Ready, Recovered, Loading, SingleItem'],
      ]),
      spacer(),

      para('Commandes pour lancer Storybook :'),
      code('pnpm --filter @break-eat/operator storybook'),
      code('# → http://localhost:6007'),
      spacer(),

      spacer(), spacer(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 8 — FLUX REALTIME
      // ═══════════════════════════════════════════════════════════════════
      h1('8. Flux temps réel — Séquence complète'),

      h2('8.1 Nouvelle commande (payment_intent.succeeded)'),
      twoColTable('Etape', 'Detail', [
        ['1. Stripe webhook', 'POST /webhooks/stripe → StripeWebhooksService'],
        ['2. OrdersService', 'createFromPaymentIntent() → $transaction (Order + Payment + Stock)'],
        ['3. Outbox', 'RealtimeService.emitNewOrder() — APRES commit DB'],
        ['4. Gateway', 'Emit \'new_order\' sur rooms: organization:X, event:Y, supplier:Z'],
        ['5. Dashboard client', 'useDashboard reçoit \'new_order\' → dispatch NEW_ORDER'],
        ['6. Resync REST', 'fetchSnapshot() → GET /orders/event/:eid/dashboard'],
        ['7. UI', 'Colonne PAID mise a jour + NotificationPopup bleue + beep'],
      ]),
      spacer(),

      h2('8.2 Commande prête (PREPARING → READY)'),
      twoColTable('Etape', 'Detail', [
        ['1. Opérateur', 'PATCH /orders/:id/mark-ready (bouton "Prête ✓")'],
        ['2. OrdersService', 'transition(PREPARING, READY) → $transaction [update, audit]'],
        ['3. Outbox', 'emitOrderUpdated() + emitOrderReady() — APRES commit'],
        ['4. Gateway', 'order_ready sur rooms: order:X, pickup-point:Y, organization:Z, event:W'],
        ['5. Dashboard client', 'ORDER_READY → notification verte + beep gamme montante'],
        ['6. Ecran public', 'ADD_ORDER → ligne isNew=true pendant 3s → auto-prune a 5min'],
      ]),
      spacer(),

      h2('8.3 Reconnexion socket'),
      twoColTable('Etape', 'Detail', [
        ['1. Socket perdu', 'SOCKET_STATUS disconnected → polling fallback actif (10s)'],
        ['2. Socket rétabli', 'onConnect détecte reconnexion → onResync() callback'],
        ['3. Resync', 'fetchSnapshot() complet pour rattraper les events manqués'],
        ['4. SOCKET_STATUS', 'connected → polling fallback arrêté'],
      ]),

      spacer(), spacer(),

      pageBreak(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 9 — SÉCURITÉ
      // ═══════════════════════════════════════════════════════════════════
      h1('9. Sécurité & Contraintes'),

      h2('9.1 Authentification dashboard'),
      bullet('JWT stocké dans localStorage (client-side uniquement)'),
      bullet('Page dashboard : \'use client\' — pas de SSR possible'),
      bullet('LoginForm appelle POST /auth/login → stocke le token en localStorage'),
      bullet('Logout : efface localStorage + réinitialise l\'état useDashboard'),
      spacer(),

      h2('9.2 Écran public sans auth'),
      bullet('Aucun token — aucune PII exposée'),
      bullet('Socket.IO gateway refuse la connexion sans token → fallback polling REST'),
      bullet('GET /orders/event/:eid/active est un endpoint public (sans JwtAuthGuard) — V1'),
      bullet('À durcir en Phase 9 : token public éphémère ou rate-limiting sur cet endpoint'),
      spacer(),

      h2('9.3 CORS gateway (P2 ouvert)'),
      para('Le gateway Socket.IO utilise encore origin: \'*\' depuis Phase 6. À corriger en Phase 9 via variable d\'environnement CORS_ORIGINS.'),
      spacer(),

      h2('9.4 Variables d\'environnement Phase 8'),
      twoColTable('Variable', 'Usage', [
        ['NEXT_PUBLIC_API_URL', 'URL du backend (ex: https://api.breakeat.com/api/v1)'],
        ['NEXT_PUBLIC_SOCKET_URL', 'URL du gateway Socket.IO (ex: https://api.breakeat.com)'],
      ]),

      spacer(), spacer(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 10 — TESTS
      // ═══════════════════════════════════════════════════════════════════
      h1('10. Tests Phase 8'),

      h2('10.1 Récapitulatif backend'),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3600, 1680, 4080],
        rows: [
          new TableRow({
            tableHeader: true,
            children: ['Suite', 'Tests', 'Couverture'].map((text, i) => new TableCell({
              borders: BORDERS,
              width: { size: [3600, 1680, 4080][i], type: WidthType.DXA },
              shading: { fill: '1e3a5f', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: 'FFFFFF', font: 'Arial', size: 18 })] })],
            })),
          }),
          ...([
            ['simulator.service.spec.ts', '15', 'seedEvent, simulateRush, clearEvent, progressOrders, randomFailures, getStats'],
            ['orders.service.spec.ts (+5)', '5', 'findDashboardByEvent (3) + assignOrderToSlot (2)'],
            ['Total nouvelles suites Phase 8', '20', '2 suites modifiées/créées'],
            ['TOTAL BACKEND', '~223', '19 suites, 0 failure'],
          ]).map(([c1, c2, c3]) => new TableRow({
            children: [c1, c2, c3].map((text, i) => new TableCell({
              borders: BORDERS,
              width: { size: [3600, 1680, 4080][i], type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text, font: 'Arial', size: 18, bold: i === 0 && c1 === 'TOTAL BACKEND' })] })],
            })),
          })),
        ],
      }),
      spacer(),

      h2('10.2 Commande pour lancer les tests'),
      code('cd backend'),
      code('pnpm test -- --testPathPattern="simulator|orders.service"'),
      spacer(),

      spacer(), spacer(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 11 — INSTALLATION
      // ═══════════════════════════════════════════════════════════════════
      h1('11. Installation & Démarrage'),

      h2('11.1 Dépendance à installer'),
      para('Phase 8 ajoute socket.io-client dans apps/operator. Après avoir récupéré le code, exécuter :'),
      code('cd apps/operator'),
      code('pnpm install'),
      spacer(),
      para('Ou depuis la racine du monorepo :'),
      code('pnpm install'),
      spacer(),

      h2('11.2 Variables d\'environnement'),
      para('Créer/mettre à jour apps/operator/.env.local :'),
      code('NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1'),
      code('NEXT_PUBLIC_SOCKET_URL=http://localhost:3000'),
      spacer(),

      h2('11.3 Démarrage'),
      code('# Backend'),
      code('cd backend && pnpm start:dev'),
      code(''),
      code('# Frontend operator'),
      code('cd apps/operator && pnpm dev  # → http://localhost:3001'),
      code(''),
      code('# Storybook'),
      code('pnpm --filter @break-eat/operator storybook  # → http://localhost:6007'),
      spacer(),

      h2('11.4 Tester le dashboard'),
      bullet('1. Créer un compte via POST /api/v1/auth/register'),
      bullet('2. Créer un événement, attacher un supplier'),
      bullet('3. Ouvrir http://localhost:3001/dashboard/<eventId>'),
      bullet('4. Se connecter avec les credentials créés'),
      bullet('5. Ouvrir http://localhost:3001/public/<eventId> dans un second onglet'),
      bullet('6. Simuler des commandes : POST /internal/simulator/events/<eid>/seed'),
      bullet('7. Progresser les commandes : POST /internal/simulator/events/<eid>/progress'),

      spacer(), spacer(),

      // ═══════════════════════════════════════════════════════════════════
      // SECTION 12 — RISQUES ET P2 OUVERTS
      // ═══════════════════════════════════════════════════════════════════
      h1('12. Risques & Points ouverts Phase 9'),

      twoColTable('Sujet', 'Action Phase 9', [
        ['CORS origin: \'*\' sur le gateway Socket.IO (P2 depuis Phase 6)', 'Restreindre via variable CORS_ORIGINS'],
        ['Écran public reçoit mises à jour uniquement via polling (pas de WS)', 'Créer une room publique sans auth pour les écrans d\'affichage'],
        ['JWT dans localStorage (XSS risque)', 'Envisager httpOnly cookie ou token de courte durée en Phase 10'],
        ['pnpm install non lancé après ajout socket.io-client', 'Documenter dans README + CI vérification'],
        ['auto-prune 5min écran public = hardcodé', 'Exposer via variable env NEXT_PUBLIC_PUBLIC_SCREEN_TTL_MS'],
      ]),

      spacer(), spacer(),

      // ═══════════════════════════════════════════════════════════════════
      // FOOTER
      // ═══════════════════════════════════════════════════════════════════
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 },
        children: [
          new TextRun({ text: 'BREAK EAT — Phase 8 Technical Brief', font: 'Arial', size: 16, color: '94a3b8' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Version 0.16.0 — 2026-06-01 — CONFIDENTIEL', font: 'Arial', size: 16, color: '94a3b8' }),
        ],
      }),
    ],
  }],
});

// ─── write ───────────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, 'PHASE_8_DASHBOARDS_PUBLIC_SCREENS.docx');
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log(`✅  ${outPath} (${buffer.length.toLocaleString()} bytes)`);
}).catch((err) => {
  console.error('❌  Generation failed:', err.message);
  process.exit(1);
});
