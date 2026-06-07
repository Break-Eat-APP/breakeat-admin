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
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'PHASE 7 — SLOTS DE RETRAIT + FONDATIONS FLAIX', font: ARIAL, bold: true, size: 32 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: 'Technical Brief for Claude Code & Codex', font: ARIAL, italics: true, size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: '01/06/2026', font: ARIAL, size: 22 })] }),
  pageBreak(),

  // ─── 1. OBJECTIF ───────────────────────────────────────────────
  h1('1. OBJECTIF DE LA PHASE 7'),
  p('Phase 7 introduit deux modules independants qui preparent le terrain pour l IA et la gestion du flux en Phase 8+ :'),
  bullet('Module Slots : fenetres temporelles de retrait avec gestion de capacite race-safe. Les operators definissent des creneaux (ex: 12h00-12h15, 50 commandes max) ; les commandes y sont assignees atomiquement.'),
  bullet('Module Flaix (stub) : unique point d entree entre BREAK EAT et le moteur IA Flaix. En Phase 7 la couche HTTP est scaffoldee mais retourne null. Toute decision appliquee est tracee dans flaix_decisions (audit append-only).'),
  p('Phase 7 ne bloque PAS le flux de commandes si Flaix est indisponible. Le fallback est toujours un comportement normal sans slot Flaix.'),
  pageBreak(),

  // ─── 2. SCHEMA PRISMA ──────────────────────────────────────────
  h1('2. SCHEMA PRISMA — NOUVEAUX MODELES ET ENUMS'),
  h2('Enums ajoutes'),
  code('SlotStatus  = OPEN | FULL | CLOSED          (@map("slot_status"))'),
  code('SlotSource  = MANUAL | DEFAULT | FLAIX       (@map("slot_source"))'),
  code('FlaixDecisionType = SLOT_DECISION | RUSH_DECISION | RECOMMENDATION_DECISION'),

  h2('Modele Slot'),
  code('id            String       @id @default(uuid())'),
  code('eventId       String       — FK Event (required)'),
  code('supplierId    String?      — FK Supplier (optionnel : null = slot global)'),
  code('pickupPointId String?      — FK PickupPoint (optionnel)'),
  code('startAt       DateTime     — debut du creneau'),
  code('endAt         DateTime     — fin du creneau (endAt > startAt obligatoire)'),
  code('capacity      Int          — nb max commandes dans ce creneau'),
  code('currentLoad   Int @default(0) — nb commandes assignees (incrementee atomiquement)'),
  code('status        SlotStatus @default(OPEN)'),
  code('source        SlotSource @default(MANUAL)'),
  code('label         String?      — libelle optionnel ("Creneau midi")'),
  code('@@map("slots")'),

  h2('Modele FlaixDecision'),
  code('id            String       @id @default(uuid())'),
  code('decisionId    String       @unique — cle d idempotence (fournie par Flaix)'),
  code('type          FlaixDecisionType'),
  code('eventId       String       — FK Event'),
  code('slotId        String?      — FK Slot (si applicable)'),
  code('sourcePayload Json         — payload brut recu de Flaix (pour forensics)'),
  code('appliedAction String       — ce que le backend a fait ("slot_assigned", ...)'),
  code('affectedIds   String[]     — UUIDs des entites modifiees'),
  code('createdAt     DateTime @default(now())'),
  code('@@map("flaix_decisions")'),

  h2('Extensions sur modeles existants'),
  code('Cart.selectedSlotId  String? — FK Slot (slot choisi au checkout, nullable)'),
  code('Order.slotId         String? — FK Slot (FK ajoutee en Phase 7 ; colonne existait Phase 5)'),
  pageBreak(),

  // ─── 3. SLOTS — GESTION DE CAPACITE ────────────────────────────
  h1('3. SLOTS — GESTION DE CAPACITE ET RACE-SAFETY'),
  h2('Pattern race-safe (identique au stock Phase 5)'),
  p('La methode assignOrderToSlot utilise updateMany avec une clause WHERE conditionnelle pour eviter l oversell concurrent :'),
  code('// Increment seulement si encore sous la capacite'),
  code('const updated = await tx.slot.updateMany({'),
  code('  where: {'),
  code('    id: slotId,'),
  code('    currentLoad: { lt: slot.capacity },   // < capacity'),
  code('    status: { not: SlotStatus.CLOSED },'),
  code('  },'),
  code('  data: { currentLoad: { increment: 1 } },'),
  code('});'),
  code('if (updated.count === 0) throw new ConflictException("Slot full or closed");'),
  p('Si deux transactions concurrentes tentent d incrementer le meme slot au meme moment, PostgreSQL garantit qu au plus une reussit (grace au WHERE conditionnel). L autre recoit count=0 et leve un ConflictException.'),

  h2('Flip automatique vers FULL'),
  code('// Apres l increment, flipper si on a atteint la capacite'),
  code('await tx.slot.updateMany({'),
  code('  where: { id: slotId, currentLoad: slot.capacity },'),
  code('  data:  { status: SlotStatus.FULL },'),
  code('});'),

  h2('CRUD Slots — validations'),
  bullet('endAt > startAt : BadRequestException si viole.'),
  bullet('supplierId : verifie que le supplier est bien lie a l event via EventSupplier junction.'),
  bullet('pickupPointId : verifie que le PickupPoint appartient a l event.'),
  bullet('remove : interdit si des commandes sont deja assignees au slot (ConflictException).'),
  bullet('findByEvent : trie par startAt ASC.'),

  h2('Controle d acces'),
  bullet('CRUD necessite le role ORG_ADMIN ou MANAGER dans l organisation de l event.'),
  bullet('requireOrgAccess(prisma, callerId, organizationId, [ORG_ADMIN, MANAGER]).'),
  bullet('findByEvent et findOne : publics (pas de garde role).'),
  pageBreak(),

  // ─── 4. FLAIX — ARCHITECTURE STUB ──────────────────────────────
  h1('4. FLAIX — ARCHITECTURE STUB (Phase 7)'),
  h2('Principe : zero impact si non configure'),
  p('FlaixService lit FLAIX_API_URL au demarrage. Si absente, isConfigured() retourne false et tous les appels de decision retournent null immediatement. Le backend ne bloque jamais sur Flaix.'),
  code('isConfigured(): boolean  // true seulement si FLAIX_API_URL est defini'),

  h2('3 methodes de decision (stubs en Phase 7)'),
  code('requestSlotDecision(eventId, context)  => SlotDecisionPayload | null'),
  code('requestRushDecision(eventId)           => RushDecisionPayload | null'),
  code('requestRecommendation(eventId, userId) => RecommendationPayload | null'),
  p('En Phase 7 : la logique HTTP est commentee. Les methodes loggent le debug et retournent null. Phase 8+ : decommenter le fetch() et brancher l URL reelle.'),

  h2('FLAIX_CONTRACT.md — modules autorises a appeler FlaixService'),
  bullet('orders   -> flaix (rush decision lors d une transition)'),
  bullet('slots    -> flaix (slot decision lors d un assignement)'),
  bullet('dashboards -> flaix (rush decision pour affichage)'),
  bullet('products -> flaix (recommendations uniquement)'),
  p('AUCUN autre module ne doit importer FlaixService directement. Toute integration passe par ce service.'),
  pageBreak(),

  // ─── 5. FLAIX DECISIONS — AUDIT APPEND-ONLY ────────────────────
  h1('5. FLAIX DECISIONS — AUDIT APPEND-ONLY ET IDEMPOTENCE'),
  h2('recordDecision — regles critiques'),
  p('recordDecision est la seule methode qui ecrit dans flaix_decisions. Elle doit etre appelee APRES que la decision a ete appliquee (jamais avant).'),
  code('await flaixService.recordDecision('),
  code('  payload,          // payload brut Flaix (SlotDecisionPayload, ...)'),
  code('  "slot_assigned",  // ce que le backend a fait'),
  code('  [orderId],        // UUIDs affectes'),
  code('  slotId,           // optionnel'),
  code(');'),

  h2('Idempotence via decisionId'),
  code('// decisionId est fourni par Flaix (UNIQUE dans flaix_decisions)'),
  code('// Si appele deux fois avec le meme decisionId : P2002 silencieusement ignore'),
  code('catch (err) {'),
  code('  if (err?.code === "P2002") return;  // deja enregistre — ok'),
  code('  throw err;'),
  code('}'),

  h2('Lecture des decisions'),
  code('getLatestRushDecision(eventId)    // derniere decision RUSH pour un event'),
  code('listDecisionsForEvent(eventId)    // toutes les decisions d un event (desc)'),

  h2('Types de decisions (FlaixDecisionType)'),
  code('SLOT_DECISION           — Flaix recommande un creneau'),
  code('RUSH_DECISION           — Flaix evalue le niveau de rush'),
  code('RECOMMENDATION_DECISION — Flaix recommande des produits'),
  pageBreak(),

  // ─── 6. MIGRATION SQL ──────────────────────────────────────────
  h1('6. MIGRATION SQL (20260601_phase7_slots_flaix)'),
  p('La migration cree les enums, les tables, et ajoute la FK manquante sur orders.slot_id.'),
  code('-- Enums'),
  code('CREATE TYPE slot_status AS ENUM (\'OPEN\', \'FULL\', \'CLOSED\');'),
  code('CREATE TYPE slot_source AS ENUM (\'MANUAL\', \'DEFAULT\', \'FLAIX\');'),
  code('CREATE TYPE flaix_decision_type AS ENUM (\'SLOT_DECISION\', \'RUSH_DECISION\', \'RECOMMENDATION_DECISION\');'),
  code('-- Table slots'),
  code('CREATE TABLE slots ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ... );'),
  code('-- Table flaix_decisions'),
  code('CREATE TABLE flaix_decisions ( id UUID PRIMARY KEY, decision_id TEXT UNIQUE, ... );'),
  code('-- FK sur orders (colonne existait deja en Phase 5)'),
  code('ALTER TABLE orders ADD CONSTRAINT orders_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES slots(id);'),
  code('-- FK sur carts'),
  code('ALTER TABLE carts ADD COLUMN selected_slot_id UUID REFERENCES slots(id);'),
  pageBreak(),

  // ─── 7. ENV ─────────────────────────────────────────────────────
  h1('7. CONFIGURATION ENV PHASE 7'),
  code('FLAIX_API_URL=https://api.flaix.io   # optionnel — stub si absent'),
  code('FLAIX_API_KEY=sk_flaix_xxx           # optionnel — stub si absent'),
  p('Si FLAIX_API_URL est absent, FlaixService.isConfigured() retourne false et aucun appel HTTP n est effectue. Le backend fonctionne normalement sans l IA.'),
  pageBreak(),

  // ─── 8. TESTS ───────────────────────────────────────────────────
  h1('8. TESTS LIVRES'),
  bullet('slots.service.spec.ts : 21 tests (create avec validations, findByEvent tri, findOne 404, update partiel, update invalid time, remove avec/sans orders, assignOrderToSlot succes, assignOrderToSlot slot full, assignOrderToSlot slot closed, race condition simulee, flip FULL automatique).'),
  bullet('flaix.service.spec.ts : 12 tests (isConfigured true/false, requestSlotDecision stub null, requestSlotDecision non configure, requestRushDecision stub null, requestRecommendation null, recordDecision SLOT, recordDecision RUSH, P2002 idempotent ignore, rethrow erreur non-P2002, sourcePayload JSON correct, getLatestRushDecision, listDecisionsForEvent).'),
  bullet('Total backend cumulatif apres Phase 7 : 203 tests, 19 suites.'),
  pageBreak(),

  // ─── 9. POINTS DE VIGILANCE ────────────────────────────────────
  h1('9. POINTS DE VIGILANCE POUR LA SUITE'),
  bullet('Flaix HTTP stub : decommenter le fetch() dans requestSlotDecision/requestRushDecision en Phase 8 quand FLAIX_API_URL est fourni.'),
  bullet('assignOrderToSlot est appele manuellement par les operateurs via PATCH /orders/:id/assign-slot (Phase 8) — pas encore expose.'),
  bullet('Pas de cleanup automatique des slots expires (status OPEN apres endAt) — a ajouter en Phase 9 via un cron job.'),
  bullet('selectedSlotId sur Cart est nullable — la Phase 8 devra valider que le slot est dans la fenetre temporelle au moment du checkout.'),
  bullet('flaix_decisions est append-only : ne jamais modifier ou supprimer une entree. Si une decision est incorrecte, cree une nouvelle avec applied="reverted".'),
  bullet('FlaixDecisionType.RECOMMENDATION_DECISION non utilise en Phase 7 — scaffolde pour Phase 9 (recommandations produits).'),
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
  const out = path.join(__dirname, 'PHASE_7_SLOTS_FLAIX.docx');
  fs.writeFileSync(out, buf);
  console.log('Wrote', out);
});
