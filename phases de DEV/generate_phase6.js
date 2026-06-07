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
  // ─── COVER ────────────────────────────────────────────────────
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 2000, after: 200 }, children: [new TextRun({ text: 'BREAK EAT', font: ARIAL, bold: true, size: 56 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'PHASE 6 — ORDERS REALTIME, OUTBOX & SIMULATOR', font: ARIAL, bold: true, size: 32 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', font: ARIAL, italics: true, size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: '01/06/2026 (audit complet + P1 corrections)', font: ARIAL, size: 22 })] }),
  pageBreak(),

  // ─── 1. OBJECTIF ───────────────────────────────────────────────
  h1('1. OBJECTIF DE LA PHASE 6'),
  p('Phase 6 anime les commandes en temps reel et pose les bases du mode demo. Elle produit trois blocs independants mais complementaires :'),
  bullet('Bloc 6.1 — Order State Machine : 15 transitions autorisees, etats terminaux, guard pur sans effet de bord.'),
  bullet('Bloc 6.2 — Outbox + Realtime : emission Socket.IO APRES commit DB (regla outbox stricte), 3 evenements, 3-4 salles chacun.'),
  bullet('Bloc 6.3 — Demo Mode + Simulator : DemoGuard (DEMO_MODE=true requis), seedEvent / simulateRush / clearEvent, utilisateur demo stable.'),
  p('Sans Phase 6, les operateurs ne voient pas les commandes arriver en live, et il est impossible de tester un rush sans vrais clients.'),
  pageBreak(),

  // ─── 2. PRISMA ─────────────────────────────────────────────────
  h1('2. ENUMS PRISMA (herites de Phase 5, utilises en Phase 6)'),
  h2('OrderStatus (8 valeurs)'),
  code('PAID | ACCEPTED | PREPARING | READY | PICKED_UP | COMPLETED | CANCELLED | RECOVERED'),
  p('COMPLETED et CANCELLED sont terminaux : aucune transition sortante.'),
  p('READY ne peut PAS aller directement en CANCELLED (securite operator — force un RECOVER d abord).'),

  h2('OrderActorType (5 valeurs)'),
  code('SYSTEM | CUSTOMER | OPERATOR | ADMIN | FLAIX'),
  p('Utilise dans OrderAuditTrail pour tracer qui a effectue la transition.'),
  pageBreak(),

  // ─── 3. STATE MACHINE ──────────────────────────────────────────
  h1('3. ORDER STATE MACHINE — 15 TRANSITIONS AUTORISEES'),
  p('Classe pure OrderStateMachineService. Aucun effet de bord. Appelee AVANT toute ecriture DB.'),
  code('PAID        => ACCEPTED  | CANCELLED  | RECOVERED'),
  code('ACCEPTED    => PREPARING | CANCELLED  | RECOVERED'),
  code('PREPARING   => READY     | CANCELLED  | RECOVERED'),
  code('READY       => PICKED_UP | RECOVERED'),
  code('PICKED_UP   => COMPLETED'),
  code('RECOVERED   => ACCEPTED  | PREPARING  | READY'),
  code('COMPLETED   => (aucune transition — etat terminal)'),
  code('CANCELLED   => (aucune transition — etat terminal)'),

  h2('API de la state machine'),
  code('assertTransition(from, to)  // BadRequestException si interdit'),
  code('isAllowed(from, to)         // boolean — pour les guards'),
  code('allowedFrom(status)         // tableau des cibles autorisees'),

  h2('Regles critiques'),
  bullet('assertTransition() DOIT etre appelee AVANT toute ecriture DB (jamais apres).'),
  bullet('READY -> CANCELLED interdit : force le passage par RECOVERED d abord.'),
  bullet('La state machine ne connait pas Prisma : elle ne fait que valider la transition.'),
  pageBreak(),

  // ─── 4. OUTBOX + REALTIME ──────────────────────────────────────
  h1('4. OUTBOX PATTERN + REALTIME EVENTS (Bloc 6.2)'),
  h2('Regle outbox (CRITIQUE — non negociable)'),
  p('L emission realtime DOIT suivre l ordre exact ci-dessous. Toute deviation brise la coherence.'),
  code('1. assertTransition()                      // guard — avant tout'),
  code('2. $transaction([order.update, audit.create]) // ecriture atomique'),
  code('3. realtimeService.emitXxx(...)            // APRES commit — jamais dans la tx'),

  h2('Pourquoi : emit avant commit = ghost events'),
  p('Si l emit se fait avant le commit et que la transaction echoue (ex: contrainte PK), les clients recevront un evenement pour un etat qui n existe pas en base. Le frontend peut aller dans un etat incoherent impossible a reparer sans rechargement complet.'),

  h2('Les 3 evenements emis'),
  code('new_order     — emis apres createFromPaymentIntent()'),
  code('order_updated — emis apres chaque transition (y compris vers READY)'),
  code('order_ready   — emis en plus de order_updated quand nextStatus == READY'),

  h2('Ciblage des salles par evenement'),
  code('new_order     => organization:{id}  +  event:{id}  +  supplier:{id}'),
  code('order_updated => order:{id}         +  organization:{id}  +  event:{id}'),
  code('order_ready   => order:{id}  +  pickup-point:{id}  +  organization:{id}  +  event:{id}'),

  h2('Note critique : eventId dans l enveloppe != ID evenement concert'),
  p('Le champ eventId dans l enveloppe Socket.IO est un UUID de deduplication genere par randomUUID(). Il n a AUCUN rapport avec l ID de l evenement concert (concert eventId). Cette confusion a cause des bugs en Phase 5 — ne pas reproduire.'),
  pageBreak(),

  // ─── 5. GATEWAY ────────────────────────────────────────────────
  h1('5. SOCKET.IO GATEWAY — AUTHENTIFICATION ET SALLES'),
  h2('Authentification JWT sur connect'),
  code('handleConnection(client: Socket): void'),
  p('Le token JWT est extrait dans l ordre suivant :'),
  code('1. client.handshake.auth.token    (prioritaire — mobile / Expo)'),
  code('2. client.handshake.headers.authorization  (Bearer xxx — web)'),
  p('Si aucun token ou token invalide/expire : client.disconnect(true) immediatement. Aucune salle ne peut etre rejointe sans token valide.'),

  h2('Gestion des salles'),
  code('join_room   { room: string }  => { joined: string }'),
  code('leave_room  { room: string }  => { left:   string }'),
  p('Convention de nommage des salles (REALTIME_CONTRACTS.md) :'),
  code('organization:{uuid}'),
  code('event:{uuid}'),
  code('supplier:{uuid}'),
  code('pickup-point:{uuid}'),
  code('order:{uuid}'),
  code('dashboard:{uuid}'),

  h2('Note P2 — CORS origin : *'),
  p('Le gateway est configure avec cors: { origin: "*" }. En production, cela doit etre remplace par la liste des domaines autorises via CORS_ORIGINS. A corriger en Phase 9 (securisation PROD).'),
  pageBreak(),

  // ─── 6. ENDPOINTS OPERATOR ──────────────────────────────────────
  h1('6. ENDPOINTS OPERATOR (9 routes)'),
  h2('Routes customer (2 GET)'),
  code('GET  /api/v1/orders/:id            — voir sa propre commande + items + payments'),
  code('GET  /api/v1/orders/:id/audit      — lire l audit trail (propre commande)'),

  h2('Routes operator (6 PATCH)'),
  code('PATCH /api/v1/orders/:id/accept           PAID        => ACCEPTED'),
  code('PATCH /api/v1/orders/:id/start-preparing  ACCEPTED    => PREPARING'),
  code('PATCH /api/v1/orders/:id/mark-ready       PREPARING   => READY'),
  code('PATCH /api/v1/orders/:id/mark-picked-up   READY       => PICKED_UP'),
  code('PATCH /api/v1/orders/:id/recover          any         => RECOVERED'),
  code('PATCH /api/v1/orders/:id/cancel           PAID/ACCEPTED/PREPARING => CANCELLED'),

  h2('Route dashboard (1 GET)'),
  code('GET  /api/v1/orders/event/:eventId/active — snapshot toutes commandes actives'),

  h2('Controle d acces'),
  bullet('Toutes les routes sont protegees par JwtAuthGuard.'),
  bullet('Routes operator : assertOperatorAccessByOrder() verifie que le caller est membre de l organisation qui possede la commande.'),
  bullet('Route customer : verifie order.userId === caller.sub. 403 sinon.'),
  bullet('Route dashboard : assertOperatorAccess() via l eventId — membership org requise.'),
  pageBreak(),

  // ─── 7. DEMO MODE + SIMULATOR ──────────────────────────────────
  h1('7. DEMO MODE + SIMULATOR (Bloc 6.3)'),
  h2('DemoGuard'),
  p('Toutes les routes /simulator/* sont protegees par DemoGuard.'),
  code('// 403 si DEMO_MODE != true'),
  code('if (!this.configService.get("app.demoMode")) throw new ForbiddenException(...)'),
  p('main.ts refuse de demarrer si DEMO_MODE=true ET NODE_ENV=production (exit(1)) — evite un vrai event en mode demo.'),

  h2('SimulatorService — 3 methodes'),
  code('seedEvent(eventId, count=20)    // cree N commandes a divers stades de vie'),
  code('simulateRush(eventId, count=10) // cree N commandes en PAID en rafale'),
  code('clearEvent(eventId)             // supprime toutes les commandes DEMO-* de l event'),

  h2('Distribution seedEvent'),
  code('35% PAID      — en attente d acceptation'),
  code('25% ACCEPTED  — acceptees par operator'),
  code('25% PREPARING — en cuisine'),
  code('15% READY     — prets a recuperer'),

  h2('Utilisateur demo'),
  code('email        : demo-simulator@break-eat.internal'),
  code('passwordHash : DEMO_NO_LOGIN'),
  code('displayName  : "Demo Simulator"    // champ displayName — PAS firstName/lastName'),
  code('isActive     : false               // ne peut pas se connecter'),
  p('L utilisateur demo est cree une seule fois (upsert) et reutilise pour tous les seedings.'),

  h2('P1 fix : junction eventSuppliers (corrige 01/06/2026)'),
  p('Bug initial : seedEvent et simulateRush utilisaient event.suppliers (relation directe inexistante). Correction : utiliser la junction eventSuppliers[].supplier.'),
  code('// AVANT (bug) :'),
  code('const suppliers = event.suppliers;'),
  code('// APRES (correct) :'),
  code('const suppliers = event.eventSuppliers.map((es) => es.supplier);'),
  pageBreak(),

  // ─── 8. ENV ─────────────────────────────────────────────────────
  h1('8. CONFIGURATION ENV PHASE 6'),
  code('DEMO_MODE=true                          # active le simulator'),
  code('# (interdit si NODE_ENV=production)'),
  p('Les variables Stripe/JWT/Prisma sont heritees des phases precedentes. Phase 6 n ajoute qu une seule variable env.'),
  pageBreak(),

  // ─── 9. TESTS ───────────────────────────────────────────────────
  h1('9. TESTS LIVRES'),
  bullet('order-state-machine.service.spec.ts : 8 tests (transitions autorisees, transitions interdites, terminaux, READY->CANCELLED interdit, allowedFrom)'),
  bullet('orders.service.spec.ts : 9 tests (createFromPaymentIntent, idempotency, oversell guard, divergence guard, payment upsert, transition, outbox emit, READY => emitOrderReady)'),
  bullet('realtime.gateway.spec.ts : 6 tests (connect avec token valide, connect sans token, connect token expire, join_room, leave_room, extractToken fallback header)'),
  bullet('realtime.service.spec.ts : 5 tests (emitNewOrder 3 salles, emitOrderUpdated 3 salles, emitOrderReady 4 salles, dedup eventId, occurredAt present)'),
  bullet('demo.guard.spec.ts : 3 tests (autorise si DEMO_MODE true, refuse si false, refuse si absent)'),
  bullet('simulator.service.spec.ts : 5 tests (seedEvent, simulateRush, clearEvent, getOrCreateDemoUser, displayName correct)'),
  bullet('Total backend cumulatif apres Phase 6 : 170 tests, 17 suites.'),
  pageBreak(),

  // ─── 10. POINTS DE VIGILANCE ────────────────────────────────────
  h1('10. POINTS DE VIGILANCE POUR LA SUITE'),
  bullet('CORS origin:"*" sur le gateway — a restreindre Phase 9 via CORS_ORIGINS.'),
  bullet('Pas d ACL par salle : n importe quel client authentifie peut rejoindre n importe quelle salle si il connait l UUID. A evaluer Phase 9.'),
  bullet('Pas de test d integration Simulator — les tests unitaires utilisent des mocks Prisma. Un test E2E complet reste a faire.'),
  bullet('Pas de endpoint de resync dashboard (GET /orders/event/:id/active suffit V1 mais sans pagination).'),
  bullet('progressOrders() et randomFailures() du simulator sont prevus pour Phase 8.'),
  bullet('supplier_status_changed event non emis — a ajouter si le dashboard supplier doit reagir en live.'),
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
  const out = path.join(__dirname, 'PHASE_6_ORDERS_REALTIME_OUTBOX.docx');
  fs.writeFileSync(out, buf);
  console.log('Wrote', out);
});
