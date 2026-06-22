'use client';

import { useState, type CSSProperties } from 'react';
import { Trophy, Tent, Building2, Zap, type LucideIcon } from 'lucide-react';
import {
  apiUpdateOrgBranding,
  apiGetVenues,
  apiCreateVenue,
  apiUpdateVenue,
  apiCreateEvent,
  apiCreateSupplier,
  apiAttachSupplier,
  apiCreateCategory,
  apiCreateProduct,
  apiCreatePickupPoint,
  apiCreateSlot,
  apiUpdateEventStatus,
  apiSetAppSetting,
  getOrgId,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ProductDraft {
  id: string;
  name: string;
  priceEuros: string;
  category: string;
}

interface Buvette {
  id: string;
  name: string;
  prepZone: string;
  pickupPoint: string;
  categories: string[];
  products: ProductDraft[];
}

interface NotifPrefs {
  orderAccepted: boolean;
  orderPreparing: boolean;
  orderReady: boolean;
  orderDelayed: boolean;
  channelPush: boolean;
  channelEmail: boolean;
}

interface PushCampaign {
  title: string;
  message: string;
  audience: 'ALL' | 'GROUP';
  timing: 'ON_ACTIVATION' | 'MANUAL';
}

interface WizardData {
  template: string;
  primaryColor: string;
  logoUrl: string;
  description: string;
  venueName: string;
  venueAddress: string;
  eventName: string;
  eventDate: string; // YYYY-MM-DD
  eventStart: string; // HH:MM
  eventEnd: string; // HH:MM
  buvettes: Buvette[];
  slotStart: string; // HH:MM
  slotDuration: number; // minutes
  slotCount: number;
  slotCapacity: number;
  notif: NotifPrefs;
  push: PushCampaign;
}

interface StepResult {
  label: string;
  status: 'pending' | 'running' | 'ok' | 'error';
  detail?: string;
}

interface DoneResult {
  eventId: string;
  operatorUrl: string;
  simulatorPath: string;
  qrLink: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toCents(euros: string): number {
  const n = parseFloat(euros.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── Templates de départ (pré-remplissent tout le wizard) ─────────────────────────

type TemplatePreset = {
  id: string;
  icon: LucideIcon;
  name: string;
  blurb: string;
  apply: () => Partial<WizardData>;
};

const TEMPLATES: TemplatePreset[] = [
  {
    id: 'stade',
    icon: Trophy,
    name: 'Stade / Match',
    blurb: 'Plusieurs buvettes (Nord / Sud) : boissons & snacks, retrait rapide pendant les pauses.',
    apply: () => ({
      template: 'stade',
      venueName: 'Patinoire / Stade',
      venueAddress: '1 Avenue du Sport, 75012 Paris',
      eventName: 'Match — Soirée',
      eventStart: '19:00',
      eventEnd: '23:00',
      buvettes: [
        {
          id: uid(),
          name: 'Buvette Nord',
          prepZone: 'Comptoir Nord',
          pickupPoint: 'Comptoir Nord',
          categories: ['Boissons', 'Snacks'],
          products: [
            { id: uid(), name: 'Coca-Cola 33cl', priceEuros: '2.50', category: 'Boissons' },
            { id: uid(), name: 'Bière 33cl', priceEuros: '4.00', category: 'Boissons' },
            { id: uid(), name: 'Eau minérale 50cl', priceEuros: '2.00', category: 'Boissons' },
            { id: uid(), name: 'Hot-Dog', priceEuros: '5.00', category: 'Snacks' },
            { id: uid(), name: 'Nachos + Sauce', priceEuros: '4.50', category: 'Snacks' },
          ],
        },
        {
          id: uid(),
          name: 'Buvette Sud',
          prepZone: 'Comptoir Sud',
          pickupPoint: 'Comptoir Sud',
          categories: ['Boissons'],
          products: [
            { id: uid(), name: 'Bière 50cl', priceEuros: '5.50', category: 'Boissons' },
            { id: uid(), name: 'Soft 33cl', priceEuros: '3.00', category: 'Boissons' },
            { id: uid(), name: 'Eau minérale 50cl', priceEuros: '2.00', category: 'Boissons' },
          ],
        },
      ],
      slotStart: '20:00',
      slotDuration: 20,
      slotCount: 3,
      slotCapacity: 30,
    }),
  },
  {
    id: 'festival',
    icon: Tent,
    name: 'Festival / Concert',
    blurb: 'Food trucks & stands : un stand par menu, gros volumes, créneaux larges.',
    apply: () => ({
      template: 'festival',
      venueName: 'Grande Scène',
      venueAddress: 'Parc des Expositions',
      eventName: 'Festival — Jour 1',
      eventStart: '18:00',
      eventEnd: '23:30',
      buvettes: [
        {
          id: uid(),
          name: 'Food Truck',
          prepZone: 'Zone food trucks',
          pickupPoint: 'Stand Scène',
          categories: ['Boissons', 'Plats'],
          products: [
            { id: uid(), name: 'Soft 33cl', priceEuros: '3.00', category: 'Boissons' },
            { id: uid(), name: 'Burger', priceEuros: '8.00', category: 'Plats' },
            { id: uid(), name: 'Frites', priceEuros: '4.00', category: 'Plats' },
            { id: uid(), name: 'Crêpe sucrée', priceEuros: '4.50', category: 'Plats' },
          ],
        },
        {
          id: uid(),
          name: 'Bar à bières',
          prepZone: 'Bar',
          pickupPoint: 'Stand Entrée',
          categories: ['Boissons'],
          products: [
            { id: uid(), name: 'Bière pression 50cl', priceEuros: '5.00', category: 'Boissons' },
            { id: uid(), name: 'IPA artisanale 33cl', priceEuros: '6.00', category: 'Boissons' },
            { id: uid(), name: 'Cidre 33cl', priceEuros: '4.50', category: 'Boissons' },
          ],
        },
      ],
      slotStart: '19:00',
      slotDuration: 30,
      slotCount: 4,
      slotCapacity: 40,
    }),
  },
  {
    id: 'entreprise',
    icon: Building2,
    name: 'Entreprise / Cafétéria',
    blurb: 'Service du midi : sandwichs, plats chauds, retrait par petits créneaux.',
    apply: () => ({
      template: 'entreprise',
      venueName: 'Cafétéria — Siège',
      venueAddress: 'Siège social, RDC',
      eventName: 'Service du midi',
      eventStart: '11:30',
      eventEnd: '14:00',
      buvettes: [
        {
          id: uid(),
          name: 'Cuisine centrale',
          prepZone: 'Cuisine',
          pickupPoint: 'Comptoir Cafétéria',
          categories: ['Boissons', 'Plats'],
          products: [
            { id: uid(), name: 'Café', priceEuros: '1.50', category: 'Boissons' },
            { id: uid(), name: 'Jus de fruits', priceEuros: '2.50', category: 'Boissons' },
            { id: uid(), name: 'Sandwich', priceEuros: '5.50', category: 'Plats' },
            { id: uid(), name: 'Salade', priceEuros: '7.00', category: 'Plats' },
            { id: uid(), name: 'Plat chaud', priceEuros: '9.00', category: 'Plats' },
          ],
        },
      ],
      slotStart: '12:00',
      slotDuration: 15,
      slotCount: 6,
      slotCapacity: 20,
    }),
  },
];

const STEP_LABELS = [
  'Template',
  'Événement',
  'Buvettes & produits',
  'Créneaux',
  'Notifications',
  'Campagne push',
];

// ─── Shared styles ─────────────────────────────────────────────────────────────

const sLabel: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: BRAND.inkSoft,
  marginBottom: 6,
};
const sInput: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px solid ${BRAND.border}`,
  fontSize: 14,
  fontFamily: 'inherit',
  color: BRAND.ink,
  background: '#fff',
  boxSizing: 'border-box',
};
const sHelp: CSSProperties = { fontSize: 12.5, color: BRAND.grey, marginTop: 4, lineHeight: 1.5 };
const sCard: CSSProperties = {
  background: BRAND.bg,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 14,
  padding: 24,
};

function defaultData(): WizardData {
  return {
    ...{
      template: 'stade',
      primaryColor: BRAND.orange,
      logoUrl: '',
      description: '',
      eventDate: todayPlus(7),
      notif: {
        orderAccepted: true,
        orderPreparing: true,
        orderReady: true,
        orderDelayed: true,
        channelPush: true,
        channelEmail: false,
      },
      push: {
        title: 'C’est ouvert !',
        message: 'Commandez dès maintenant et évitez la file : retrait à votre créneau.',
        audience: 'ALL',
        timing: 'ON_ACTIVATION',
      },
    },
    ...(TEMPLATES[0].apply() as WizardData),
  } as WizardData;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WizardPage() {
  const orgId = getOrgId();
  const [data, setData] = useState<WizardData>(defaultData);
  const [step, setStep] = useState(0); // 0..5 = inputs, 6 = récap/exécution
  const [stepError, setStepError] = useState('');
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<DoneResult | null>(null);
  const [globalError, setGlobalError] = useState('');

  function patch(p: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...p }));
  }

  function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    patch(t.apply());
  }

  // ─── Validation ────────────────────────────────────────────────────────────
  function validate(s: number): string | null {
    if (s === 1) {
      if (!data.venueName.trim()) return 'Le nom du lieu est requis.';
      if (!data.venueAddress.trim()) return 'L’adresse du lieu est requise.';
      if (!data.eventName.trim()) return 'Le nom de l’événement est requis.';
      if (!data.eventDate) return 'La date de l’événement est requise.';
      if (!data.eventStart || !data.eventEnd) return 'Les heures de début et de fin sont requises.';
      if (data.eventEnd <= data.eventStart) return 'L’heure de fin doit être après l’heure de début.';
    }
    if (s === 2) {
      if (data.buvettes.length === 0) return 'Ajoutez au moins une buvette / un stand.';
      for (const b of data.buvettes) {
        const bn = b.name.trim() || 'buvette';
        if (!b.name.trim()) return 'Chaque buvette doit avoir un nom.';
        if (!b.pickupPoint.trim()) return `Indiquez un point de retrait pour « ${bn} ».`;
        if (b.categories.length === 0) return `Ajoutez au moins une catégorie pour « ${bn} ».`;
        if (b.products.length === 0) return `Ajoutez au moins un produit pour « ${bn} ».`;
        for (const p of b.products) {
          if (!p.name.trim()) return `Chaque produit de « ${bn} » doit avoir un nom.`;
          const c = toCents(p.priceEuros);
          if (!Number.isFinite(c) || c <= 0) return `Prix invalide pour « ${p.name.trim() || 'produit'} » (${bn}).`;
          if (!p.category) return `Choisissez une catégorie pour « ${p.name.trim()} » (${bn}).`;
        }
      }
    }
    if (s === 3) {
      if (data.slotCount < 1) return 'Il faut au moins un créneau.';
      if (data.slotDuration < 1) return 'La durée d’un créneau doit être d’au moins 1 minute.';
      if (data.slotCapacity < 1) return 'La capacité d’un créneau doit être d’au moins 1.';
      if (!data.slotStart) return 'L’heure du premier créneau est requise.';
    }
    return null;
  }

  function next() {
    const err = validate(step);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError('');
    setStep((s) => Math.min(s + 1, 6));
  }
  function back() {
    setStepError('');
    setStep((s) => Math.max(s - 1, 0));
  }

  // ─── Slot preview ──────────────────────────────────────────────────────────
  function slotPreview(): { startAt: string; endAt: string; label: string }[] {
    const out: { startAt: string; endAt: string; label: string }[] = [];
    const base = new Date(`${data.eventDate}T${data.slotStart}:00`);
    if (isNaN(base.getTime())) return out;
    for (let i = 0; i < data.slotCount; i++) {
      const start = new Date(base.getTime() + i * data.slotDuration * 60000);
      const end = new Date(start.getTime() + data.slotDuration * 60000);
      out.push({
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        label: `${fmtTime(start)} – ${fmtTime(end)}`,
      });
    }
    return out;
  }

  // ─── Execution ─────────────────────────────────────────────────────────────
  async function runConfiguration() {
    if (!orgId) {
      setGlobalError('Aucune organisation sélectionnée.');
      return;
    }
    setRunning(true);
    setGlobalError('');
    setDone(null);

    const slots = slotPreview();
    const hasPush = data.push.title.trim() !== '' && data.push.message.trim() !== '';
    const allCategories = Array.from(new Set(data.buvettes.flatMap((b) => b.categories)));

    // Shared mutable context across tasks
    let venueId = '';
    let eventId = '';
    const catMap: Record<string, string> = {};

    type Task = { label: string; run: () => Promise<string | void> };
    const startAt = new Date(`${data.eventDate}T${data.eventStart}:00`);
    const endAt = new Date(`${data.eventDate}T${data.eventEnd}:00`);

    const tasks: Task[] = [
      {
        label: 'Application du template & de l’identité',
        run: async () => {
          const branding: { logoUrl?: string; primaryColor?: string; description?: string } = {
            primaryColor: data.primaryColor,
          };
          if (data.logoUrl.trim()) branding.logoUrl = data.logoUrl.trim();
          if (data.description.trim()) branding.description = data.description.trim();
          await apiUpdateOrgBranding(orgId, branding);
          return `Couleur ${data.primaryColor}`;
        },
      },
      {
        label: 'Lieu du club',
        run: async () => {
          // Un club = un lieu : on RÉUTILISE le lieu existant de l'org (et on le
          // met à jour) au lieu d'en créer un nouveau à chaque passage du wizard.
          const existing = await apiGetVenues(orgId);
          const list = Array.isArray(existing) ? existing : [];
          if (list.length > 0) {
            venueId = list[0].id;
            await apiUpdateVenue(orgId, venueId, {
              name: data.venueName.trim(),
              address: data.venueAddress.trim(),
              timezone: 'Europe/Paris',
            });
            return `${data.venueName.trim()} (lieu existant réutilisé)`;
          }
          const v = await apiCreateVenue(orgId, {
            name: data.venueName.trim(),
            address: data.venueAddress.trim(),
            timezone: 'Europe/Paris',
          });
          venueId = v.id;
          return data.venueName.trim();
        },
      },
      {
        label: 'Création de l’événement',
        run: async () => {
          const e = await apiCreateEvent(orgId, {
            venueId,
            name: data.eventName.trim(),
            startAt: startAt.toISOString().slice(0, 16),
            endAt: endAt.toISOString().slice(0, 16),
          });
          eventId = e.id;
          return data.eventName.trim();
        },
      },
      {
        label: `Création des catégories (${allCategories.length})`,
        run: async () => {
          let order = 1;
          for (const name of allCategories) {
            const c = await apiCreateCategory(orgId, { name, sortOrder: order++ });
            catMap[name] = c.id;
          }
          return allCategories.join(', ');
        },
      },
    ];

    // Une tâche par buvette : fournisseur + attachement + point de retrait + produits
    for (const b of data.buvettes) {
      tasks.push({
        label: `Buvette « ${b.name.trim() || 'sans nom'} »`,
        run: async () => {
          const sup = await apiCreateSupplier(orgId, {
            name: b.name.trim(),
            preparationZone: b.prepZone.trim() || undefined,
          });
          await apiAttachSupplier(orgId, eventId, sup.id);
          if (b.pickupPoint.trim()) {
            await apiCreatePickupPoint(orgId, {
              name: b.pickupPoint.trim(),
              venueId,
              eventId,
              supplierId: sup.id,
            });
          }
          await Promise.all(
            b.products.map((p) =>
              apiCreateProduct(orgId, sup.id, {
                name: p.name.trim(),
                price: toCents(p.priceEuros),
                categoryId: catMap[p.category],
              }),
            ),
          );
          const parts = [`${b.products.length} produit${b.products.length > 1 ? 's' : ''}`];
          if (b.pickupPoint.trim()) parts.push(`retrait : ${b.pickupPoint.trim()}`);
          return parts.join(' · ');
        },
      });
    }

    tasks.push(
      {
        label: `Création des créneaux (${slots.length})`,
        run: async () => {
          await Promise.all(
            slots.map((s) =>
              apiCreateSlot(eventId, {
                startAt: s.startAt,
                endAt: s.endAt,
                capacity: data.slotCapacity,
                label: s.label,
              }),
            ),
          );
          return `${slots.length} créneaux de ${data.slotDuration} min`;
        },
      },
      {
        label: 'Enregistrement des préférences de notifications',
        run: async () => {
          await apiSetAppSetting({
            key: 'notifications.preferences',
            scope: 'ORGANIZATION',
            scopeId: orgId,
            value: { ...data.notif, updatedAt: new Date().toISOString() },
          });
          const on = Object.entries(data.notif)
            .filter(([, v]) => v)
            .map(([k]) => k).length;
          return `${on} options activées`;
        },
      },
    );

    if (hasPush) {
      tasks.push({
        label: 'Préparation de la campagne push',
        run: async () => {
          await apiSetAppSetting({
            key: 'push.campaign.latest',
            scope: 'ORGANIZATION',
            scopeId: orgId,
            value: { ...data.push, eventId, createdAt: new Date().toISOString() },
          });
          return data.push.timing === 'ON_ACTIVATION' ? 'envoi à l’activation' : 'brouillon';
        },
      });
    }

    tasks.push({
      label: 'Activation de l’événement',
      run: async () => {
        await apiUpdateEventStatus(orgId, eventId, 'ACTIVE');
      },
    });

    setSteps(tasks.map((t) => ({ label: t.label, status: 'pending' as const })));

    try {
      for (let i = 0; i < tasks.length; i++) {
        setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s)));
        const detail = await tasks[i].run();
        setSteps((prev) =>
          prev.map((s, idx) =>
            idx === i ? { ...s, status: 'ok', detail: detail || undefined } : s,
          ),
        );
      }
      setDone({
        eventId,
        operatorUrl: `http://localhost:3002/dashboard/${eventId}`,
        simulatorPath: `/simulator?eventId=${eventId}`,
        qrLink: `breakeat://event/${eventId}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setGlobalError(msg);
      setSteps((prev) =>
        prev.map((s) => (s.status === 'running' ? { ...s, status: 'error', detail: msg } : s)),
      );
    } finally {
      setRunning(false);
    }
  }

  if (!orgId) {
    return (
      <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>
        Aucune organisation sélectionnée. Reconnectez-vous.
      </div>
    );
  }

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font, maxWidth: 860 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: '0 0 6px', letterSpacing: -0.3 }}>
        Configurer mon lieu
      </h1>
      <p style={{ color: BRAND.grey, fontSize: 14, marginBottom: 24 }}>
        {'Un parcours guidé, étape par étape : template, produits & prix, créneaux, notifications et campagne push. Tout est pré-rempli — modifiez ce que vous voulez, puis lancez la configuration.'}
      </p>

      {/* Stepper */}
      {!done && <Stepper current={step} />}

      {/* Body */}
      {!done && step < 6 && (
        <div style={{ ...sCard, marginTop: 18 }}>
          {step === 0 && <StepTemplate data={data} patch={patch} applyTemplate={applyTemplate} />}
          {step === 1 && <StepEvent data={data} patch={patch} />}
          {step === 2 && <StepBuvettes data={data} patch={patch} />}
          {step === 3 && <StepSlots data={data} patch={patch} preview={slotPreview()} />}
          {step === 4 && <StepNotifications data={data} patch={patch} />}
          {step === 5 && <StepPush data={data} patch={patch} />}

          {stepError && (
            <div
              style={{
                background: '#fee2e2',
                color: '#dc2626',
                padding: '10px 14px',
                borderRadius: 8,
                marginTop: 18,
                fontSize: 13,
              }}
            >
              {stepError}
            </div>
          )}

          {/* Nav */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 24,
              paddingTop: 18,
              borderTop: `1px solid ${BRAND.border}`,
            }}
          >
            <button onClick={back} disabled={step === 0} style={btnSecondary(step === 0)}>
              ← Précédent
            </button>
            <button onClick={next} style={btnPrimary()}>
              {step === 5 ? 'Vérifier le récapitulatif →' : 'Suivant →'}
            </button>
          </div>
        </div>
      )}

      {/* Récapitulatif + exécution */}
      {!done && step === 6 && (
        <Recap
          data={data}
          slots={slotPreview()}
          steps={steps}
          running={running}
          globalError={globalError}
          onBack={() => setStep(5)}
          onRun={() => void runConfiguration()}
        />
      )}

      {/* Succès */}
      {done && <Success done={done} onReset={() => {
        setData(defaultData());
        setStep(0);
        setSteps([]);
        setDone(null);
        setGlobalError('');
      }} />}
    </div>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

function Stepper({ current }: { current: number }) {
  const shown = Math.min(current, 5);
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.orange, marginBottom: 10 }}>
        Étape {shown + 1}/6 — {STEP_LABELS[shown]}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {STEP_LABELS.map((lbl, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo';
          return (
            <div key={lbl} style={{ flex: 1 }}>
              <div
                style={{
                  height: 6,
                  borderRadius: 4,
                  background:
                    state === 'todo' ? BRAND.border : state === 'active' ? BRAND.orange : BRAND.orangeSoft,
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  marginTop: 6,
                  textAlign: 'center',
                  color: state === 'active' ? BRAND.ink : BRAND.grey,
                  fontWeight: state === 'active' ? 700 : 500,
                }}
              >
                {lbl}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 0 — Template & identité ───────────────────────────────────────────────

function StepTemplate({
  data,
  patch,
  applyTemplate,
}: {
  data: WizardData;
  patch: (p: Partial<WizardData>) => void;
  applyTemplate: (id: string) => void;
}) {
  return (
    <div>
      <StepTitle title="Template & identité" subtitle="Choisissez un modèle de départ : il pré-remplit produits, créneaux et points de retrait. Vous pourrez tout ajuster aux étapes suivantes." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {TEMPLATES.map((t) => {
          const active = data.template === t.id;
          return (
            <button
              key={t.id}
              onClick={() => applyTemplate(t.id)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 12,
                padding: 16,
                background: active ? BRAND.orangeTint : '#fff',
                border: `2px solid ${active ? BRAND.orange : BRAND.border}`,
                fontFamily: 'inherit',
                transition: 'border-color 0.12s, background 0.12s',
              }}
            >
              <div style={{ marginBottom: 8, color: active ? BRAND.orange : BRAND.inkSoft }}><t.icon size={26} strokeWidth={1.6} /></div>
              <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 4 }}>
                {t.name}
              </div>
              <div style={{ fontSize: 12, color: BRAND.grey, lineHeight: 1.45 }}>{t.blurb}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <label style={sLabel}>Couleur principale</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={data.primaryColor}
              onChange={(e) => patch({ primaryColor: e.target.value })}
              style={{ width: 44, height: 38, border: `1px solid ${BRAND.border}`, borderRadius: 8, background: '#fff', cursor: 'pointer' }}
            />
            <input
              value={data.primaryColor}
              onChange={(e) => patch({ primaryColor: e.target.value })}
              style={{ ...sInput, width: 100 }}
            />
          </div>
        </div>
        <div>
          <label style={sLabel}>Logo (URL, optionnel)</label>
          <input
            value={data.logoUrl}
            onChange={(e) => patch({ logoUrl: e.target.value })}
            placeholder="https://…/logo.png"
            style={sInput}
          />
          <div style={sHelp}>Laissez vide pour garder le logo actuel du club.</div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={sLabel}>Description (optionnel)</label>
        <textarea
          value={data.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Quelques mots sur le club / l'enseigne…"
          rows={2}
          style={{ ...sInput, resize: 'vertical' }}
        />
      </div>
    </div>
  );
}

// ─── Step 1 — Lieu & événement ──────────────────────────────────────────────────

function StepEvent({ data, patch }: { data: WizardData; patch: (p: Partial<WizardData>) => void }) {
  return (
    <div>
      <StepTitle title="Lieu & événement" subtitle="Où et quand ? C'est le cadre qui accueillera les commandes et les créneaux de retrait." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Nom du lieu">
          <input value={data.venueName} onChange={(e) => patch({ venueName: e.target.value })} style={sInput} />
        </Field>
        <Field label="Adresse">
          <input value={data.venueAddress} onChange={(e) => patch({ venueAddress: e.target.value })} style={sInput} />
        </Field>
      </div>

      <div style={{ marginTop: 16 }}>
        <Field label="Nom de l'événement">
          <input value={data.eventName} onChange={(e) => patch({ eventName: e.target.value })} style={sInput} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
        <Field label="Date">
          <input type="date" value={data.eventDate} onChange={(e) => patch({ eventDate: e.target.value })} style={sInput} />
        </Field>
        <Field label="Début">
          <input type="time" value={data.eventStart} onChange={(e) => patch({ eventStart: e.target.value })} style={sInput} />
        </Field>
        <Field label="Fin">
          <input type="time" value={data.eventEnd} onChange={(e) => patch({ eventEnd: e.target.value })} style={sInput} />
        </Field>
      </div>
    </div>
  );
}

// ─── Step 2 — Buvettes & produits ─────────────────────────────────────────────────

function StepBuvettes({ data, patch }: { data: WizardData; patch: (p: Partial<WizardData>) => void }) {
  function updateBuvette(id: string, p: Partial<Buvette>) {
    patch({ buvettes: data.buvettes.map((b) => (b.id === id ? { ...b, ...p } : b)) });
  }
  function addBuvette() {
    patch({
      buvettes: [
        ...data.buvettes,
        { id: uid(), name: '', prepZone: '', pickupPoint: '', categories: ['Boissons'], products: [] },
      ],
    });
  }
  function removeBuvette(id: string) {
    if (data.buvettes.length <= 1) return;
    patch({ buvettes: data.buvettes.filter((b) => b.id !== id) });
  }

  return (
    <div>
      <StepTitle
        title="Buvettes & produits"
        subtitle="Un même lieu peut accueillir plusieurs buvettes ou stands. Chacun a sa zone de préparation, son point de retrait, ses catégories et son menu. Les prix sont en euros TTC."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data.buvettes.map((b, idx) => (
          <BuvetteCard
            key={b.id}
            index={idx}
            buvette={b}
            canRemove={data.buvettes.length > 1}
            onChange={(p) => updateBuvette(b.id, p)}
            onRemove={() => removeBuvette(b.id)}
          />
        ))}
      </div>

      <button onClick={addBuvette} style={{ ...btnSecondary(false), marginTop: 14 }}>
        + Ajouter une buvette / un stand
      </button>
    </div>
  );
}

function BuvetteCard({
  index,
  buvette,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  buvette: Buvette;
  canRemove: boolean;
  onChange: (p: Partial<Buvette>) => void;
  onRemove: () => void;
}) {
  const [newCat, setNewCat] = useState('');

  function updateProduct(id: string, p: Partial<ProductDraft>) {
    onChange({ products: buvette.products.map((pr) => (pr.id === id ? { ...pr, ...p } : pr)) });
  }
  function addProduct() {
    onChange({
      products: [
        ...buvette.products,
        { id: uid(), name: '', priceEuros: '', category: buvette.categories[0] ?? '' },
      ],
    });
  }
  function removeProduct(id: string) {
    onChange({ products: buvette.products.filter((pr) => pr.id !== id) });
  }
  function addCategory() {
    const name = newCat.trim();
    if (!name || buvette.categories.includes(name)) return;
    onChange({ categories: [...buvette.categories, name] });
    setNewCat('');
  }
  function removeCategory(name: string) {
    if (buvette.categories.length <= 1) return;
    onChange({
      categories: buvette.categories.filter((c) => c !== name),
      products: buvette.products.map((pr) =>
        pr.category === name ? { ...pr, category: buvette.categories.find((c) => c !== name) ?? '' } : pr,
      ),
    });
  }

  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18, background: BRAND.bgSubtle }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: BRAND.orange,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {index + 1}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink }}>
            {buvette.name.trim() || `Buvette ${index + 1}`}
          </span>
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            style={{ border: `1px solid ${BRAND.border}`, background: '#fff', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', color: '#dc2626', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}
          >
            Retirer
          </button>
        )}
      </div>

      {/* Identity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Field label="Nom de la buvette / stand">
          <input value={buvette.name} onChange={(e) => onChange({ name: e.target.value })} style={sInput} placeholder="Buvette Nord" />
        </Field>
        <Field label="Zone de préparation (opt.)">
          <input value={buvette.prepZone} onChange={(e) => onChange({ prepZone: e.target.value })} style={sInput} placeholder="Comptoir Nord" />
        </Field>
        <Field label="Point de retrait">
          <input value={buvette.pickupPoint} onChange={(e) => onChange({ pickupPoint: e.target.value })} style={sInput} placeholder="Comptoir Nord" />
        </Field>
      </div>

      {/* Categories */}
      <label style={sLabel}>Catégories</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        {buvette.categories.map((c) => (
          <span
            key={c}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#fff',
              border: `1px solid ${BRAND.border}`,
              borderRadius: 20,
              padding: '5px 10px',
              fontSize: 13,
              color: BRAND.ink,
            }}
          >
            {c}
            <button
              onClick={() => removeCategory(c)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: BRAND.grey, fontSize: 14, lineHeight: 1 }}
              title="Retirer"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          placeholder="+ catégorie"
          style={{ ...sInput, width: 130, padding: '6px 10px' }}
        />
      </div>

      {/* Products table */}
      <label style={sLabel}>Produits</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {buvette.products.map((p) => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 150px 36px', gap: 8, alignItems: 'center' }}>
            <input
              value={p.name}
              onChange={(e) => updateProduct(p.id, { name: e.target.value })}
              placeholder="Nom du produit"
              style={sInput}
            />
            <div style={{ position: 'relative' }}>
              <input
                value={p.priceEuros}
                onChange={(e) => updateProduct(p.id, { priceEuros: e.target.value })}
                placeholder="0.00"
                inputMode="decimal"
                style={{ ...sInput, paddingRight: 26 }}
              />
              <span style={{ position: 'absolute', right: 10, top: 10, color: BRAND.grey, fontSize: 13 }}>€</span>
            </div>
            <select
              value={p.category}
              onChange={(e) => updateProduct(p.id, { category: e.target.value })}
              style={{ ...sInput, cursor: 'pointer' }}
            >
              {buvette.categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={() => removeProduct(p.id)}
              style={{ border: `1px solid ${BRAND.border}`, background: '#fff', borderRadius: 8, height: 38, cursor: 'pointer', color: BRAND.grey }}
              title="Supprimer"
            >
              🗑
            </button>
          </div>
        ))}
        {buvette.products.length === 0 && (
          <div style={{ fontSize: 12.5, color: BRAND.grey, padding: '6px 0' }}>Aucun produit pour l’instant.</div>
        )}
      </div>
      <button onClick={addProduct} style={{ ...btnSecondary(false), marginTop: 12 }}>
        + Ajouter un produit
      </button>
    </div>
  );
}

// ─── Step 3 — Créneaux ──────────────────────────────────────────────────────────

function StepSlots({
  data,
  patch,
  preview,
}: {
  data: WizardData;
  patch: (p: Partial<WizardData>) => void;
  preview: { label: string }[];
}) {
  const pickupSummary = data.buvettes
    .map((b) => ({ name: b.name.trim() || 'Buvette', pickup: b.pickupPoint.trim() }))
    .filter((x) => x.pickup);

  return (
    <div>
      <StepTitle title="Créneaux de retrait" subtitle="À quels horaires les clients récupèrent leur commande. Les créneaux sont générés automatiquement et partagés par toutes les buvettes de l'événement." />

      {pickupSummary.length > 0 && (
        <div style={{ background: BRAND.orangeTint, border: `1px solid ${BRAND.orangeSoft}`, borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 8 }}>
            📍 Points de retrait (définis par buvette à l’étape précédente)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pickupSummary.map((x, i) => (
              <span key={i} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12.5, color: BRAND.ink }}>
                {x.name} → {x.pickup}
              </span>
            ))}
          </div>
        </div>
      )}

      <label style={sLabel}>Générateur de créneaux</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <Field label="Premier créneau">
          <input type="time" value={data.slotStart} onChange={(e) => patch({ slotStart: e.target.value })} style={sInput} />
        </Field>
        <Field label="Durée (min)">
          <input type="number" min={1} value={data.slotDuration} onChange={(e) => patch({ slotDuration: Number(e.target.value) })} style={sInput} />
        </Field>
        <Field label="Nombre">
          <input type="number" min={1} value={data.slotCount} onChange={(e) => patch({ slotCount: Number(e.target.value) })} style={sInput} />
        </Field>
        <Field label="Capacité / créneau">
          <input type="number" min={1} value={data.slotCapacity} onChange={(e) => patch({ slotCapacity: Number(e.target.value) })} style={sInput} />
        </Field>
      </div>

      {preview.length > 0 && (
        <div style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 8 }}>
            Aperçu — {preview.length} créneaux
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {preview.map((s, i) => (
              <span key={i} style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 12.5, color: BRAND.ink }}>
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 4 — Notifications ─────────────────────────────────────────────────────

function StepNotifications({ data, patch }: { data: WizardData; patch: (p: Partial<WizardData>) => void }) {
  function setNotif(p: Partial<NotifPrefs>) {
    patch({ notif: { ...data.notif, ...p } });
  }
  const events: { key: keyof NotifPrefs; label: string; desc: string }[] = [
    { key: 'orderAccepted', label: 'Commande acceptée', desc: 'Le client est prévenu dès que sa commande est prise en charge.' },
    { key: 'orderPreparing', label: 'En préparation', desc: 'Notification quand la préparation démarre.' },
    { key: 'orderReady', label: 'Commande prête', desc: 'Le client est invité à venir récupérer sa commande.' },
    { key: 'orderDelayed', label: 'Retard', desc: 'Alerte si la commande prend du retard.' },
  ];
  return (
    <div>
      <StepTitle title="Notifications" subtitle="Choisissez les moments où le client est prévenu, et par quel canal." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {events.map((ev) => (
          <Toggle
            key={ev.key}
            checked={data.notif[ev.key]}
            onChange={(v) => setNotif({ [ev.key]: v } as Partial<NotifPrefs>)}
            label={ev.label}
            desc={ev.desc}
          />
        ))}
      </div>

      <label style={{ ...sLabel, marginTop: 22 }}>Canaux</label>
      <div style={{ display: 'flex', gap: 10 }}>
        <ChannelChip active={data.notif.channelPush} onClick={() => setNotif({ channelPush: !data.notif.channelPush })} icon="🔔" label="Push" />
        <ChannelChip active={data.notif.channelEmail} onClick={() => setNotif({ channelEmail: !data.notif.channelEmail })} icon="✉️" label="E-mail" />
      </div>
      <div style={sHelp}>Ces préférences sont enregistrées au niveau du club et appliquées à ses événements.</div>
    </div>
  );
}

// ─── Step 5 — Campagne push ─────────────────────────────────────────────────────

function StepPush({ data, patch }: { data: WizardData; patch: (p: Partial<WizardData>) => void }) {
  function setPush(p: Partial<PushCampaign>) {
    patch({ push: { ...data.push, ...p } });
  }
  return (
    <div>
      <StepTitle title="Campagne push" subtitle="Un message envoyé aux clients pour lancer les commandes. Laissez les champs vides pour ne pas créer de campagne." />

      <Field label="Titre">
        <input value={data.push.title} onChange={(e) => setPush({ title: e.target.value })} maxLength={60} style={sInput} />
      </Field>
      <div style={{ marginTop: 14 }}>
        <Field label="Message">
          <textarea
            value={data.push.message}
            onChange={(e) => setPush({ message: e.target.value })}
            rows={3}
            maxLength={180}
            style={{ ...sInput, resize: 'vertical' }}
          />
        </Field>
        <div style={{ ...sHelp, textAlign: 'right' }}>{data.push.message.length}/180</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 6 }}>
        <Field label="Audience">
          <select value={data.push.audience} onChange={(e) => setPush({ audience: e.target.value as PushCampaign['audience'] })} style={{ ...sInput, cursor: 'pointer' }}>
            <option value="ALL">Tous les clients</option>
            <option value="GROUP">Groupes / membres seulement</option>
          </select>
        </Field>
        <Field label="Envoi">
          <select value={data.push.timing} onChange={(e) => setPush({ timing: e.target.value as PushCampaign['timing'] })} style={{ ...sInput, cursor: 'pointer' }}>
            <option value="ON_ACTIVATION">À l'activation de l'événement</option>
            <option value="MANUAL">Plus tard (brouillon)</option>
          </select>
        </Field>
      </div>

      {/* Preview */}
      {(data.push.title.trim() || data.push.message.trim()) && (
        <div style={{ marginTop: 18, background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: data.primaryColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}><Zap size={18} strokeWidth={2.2} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: BRAND.ink }}>{data.push.title || 'Titre du message'}</div>
            <div style={{ fontSize: 12.5, color: BRAND.inkSoft, marginTop: 2 }}>{data.push.message || 'Votre message apparaîtra ici.'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Récapitulatif + exécution ──────────────────────────────────────────────────

function Recap({
  data,
  slots,
  steps,
  running,
  globalError,
  onBack,
  onRun,
}: {
  data: WizardData;
  slots: { label: string }[];
  steps: StepResult[];
  running: boolean;
  globalError: string;
  onBack: () => void;
  onRun: () => void;
}) {
  const STATUS_ICON: Record<string, string> = { pending: '⬜', running: '🔄', ok: '✅', error: '❌' };
  const started = steps.length > 0;
  const hasPush = data.push.title.trim() !== '' && data.push.message.trim() !== '';
  const totalProducts = data.buvettes.reduce((n, b) => n + b.products.length, 0);
  const allCats = Array.from(new Set(data.buvettes.flatMap((b) => b.categories)));
  const pickupPoints = data.buvettes.map((b) => b.pickupPoint.trim()).filter(Boolean);

  return (
    <div style={{ ...sCard, marginTop: 18 }}>
      <StepTitle title="Récapitulatif" subtitle="Vérifiez la configuration, puis lancez. Tout est créé en une fois — vous pourrez ensuite tout modifier dans l'admin." />

      {!started && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 8 }}>
          <RecapCard title="Identité">
            <RecapLine k="Template" v={TEMPLATES.find((t) => t.id === data.template)?.name ?? data.template} />
            <RecapLine k="Couleur" v={data.primaryColor} swatch={data.primaryColor} />
          </RecapCard>
          <RecapCard title="Événement">
            <RecapLine k="Lieu" v={data.venueName} />
            <RecapLine k="Événement" v={data.eventName} />
            <RecapLine k="Quand" v={`${data.eventDate} · ${data.eventStart}–${data.eventEnd}`} />
          </RecapCard>
          <RecapCard title="Buvettes & menu">
            <RecapLine k="Buvettes / stands" v={data.buvettes.map((b) => b.name.trim() || 'Buvette').join(', ')} />
            <RecapLine k="Catégories" v={`${allCats.length} (${allCats.join(', ')})`} />
            <RecapLine k="Produits" v={`${totalProducts}`} />
          </RecapCard>
          <RecapCard title="Retrait">
            <RecapLine k="Points de retrait" v={pickupPoints.join(', ') || '—'} />
            <RecapLine k="Créneaux" v={`${slots.length} × ${data.slotDuration} min (cap. ${data.slotCapacity})`} />
          </RecapCard>
          <RecapCard title="Notifications">
            <RecapLine k="Canaux" v={[data.notif.channelPush ? 'Push' : null, data.notif.channelEmail ? 'E-mail' : null].filter(Boolean).join(', ') || 'Aucun'} />
            <RecapLine k="Événements" v={`${[data.notif.orderAccepted, data.notif.orderPreparing, data.notif.orderReady, data.notif.orderDelayed].filter(Boolean).length}/4 activés`} />
          </RecapCard>
          <RecapCard title="Campagne push">
            <RecapLine k="Statut" v={hasPush ? (data.push.timing === 'ON_ACTIVATION' ? 'Envoi à l’activation' : 'Brouillon') : 'Aucune'} />
            {hasPush && <RecapLine k="Titre" v={data.push.title} />}
          </RecapCard>
        </div>
      )}

      {/* Progress */}
      {started && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16 }}>{STATUS_ICON[s.status]}</span>
              <span style={{ fontSize: 14, color: s.status === 'error' ? '#dc2626' : s.status === 'ok' ? '#065f46' : BRAND.inkSoft, flex: 1 }}>
                {s.label}
              </span>
              {s.detail && <span style={{ fontSize: 12, color: BRAND.grey }}>{s.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {globalError && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginTop: 14, fontSize: 13 }}>
          {globalError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 18, borderTop: `1px solid ${BRAND.border}` }}>
        <button onClick={onBack} disabled={running} style={btnSecondary(running)}>
          ← Modifier
        </button>
        <button onClick={onRun} disabled={running} style={btnPrimary(running)}>
          {running ? 'Configuration en cours…' : '🚀 Lancer la configuration'}
        </button>
      </div>
    </div>
  );
}

// ─── Succès ─────────────────────────────────────────────────────────────────────

function Success({ done, onReset }: { done: DoneResult; onReset: () => void }) {
  return (
    <div style={{ background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 14, padding: 24, marginTop: 18 }}>
      <div style={{ fontWeight: 600, fontSize: 17, color: '#166534', marginBottom: 6 }}>
        ✅ Club configuré avec succès !
      </div>
      <p style={{ color: '#15803d', fontSize: 13.5, marginBottom: 18 }}>
        L&apos;événement est activé. Voici vos accès pour tester la réception de commande en direct.
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 8 }}>QR — scanner depuis le mobile</div>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(done.qrLink)}`}
            alt="QR Code événement"
            width={180}
            height={180}
            style={{ borderRadius: 8, border: '2px solid #16a34a' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 8 }}>Tester maintenant</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a href={done.operatorUrl} target="_blank" rel="noopener noreferrer" style={linkBtn(BRAND.ink)}>
              📊 Ouvrir le dashboard opérateur →
            </a>
            <a href={done.simulatorPath} style={linkBtn(BRAND.orange)}>
              🚀 Ouvrir le simulateur (Rush de commandes) →
            </a>
            <a href={`/events/${done.eventId}`} style={linkBtn('#fff', true)}>
              🎪 Voir l&apos;événement dans l&apos;admin →
            </a>
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: BRAND.grey }}>
            ID événement : <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 5, border: `1px solid ${BRAND.border}` }}>{done.eventId}</code>
          </div>
        </div>
      </div>

      <button onClick={onReset} style={{ ...btnSecondary(false), marginTop: 20 }}>
        Configurer un autre club
      </button>
    </div>
  );
}

// ─── Small UI atoms ─────────────────────────────────────────────────────────────

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 19, fontWeight: 600, color: BRAND.ink, margin: '0 0 4px' }}>{title}</h2>
      <p style={{ fontSize: 13.5, color: BRAND.grey, margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={sLabel}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        cursor: 'pointer',
        background: '#fff',
        border: `1px solid ${checked ? BRAND.orange : BRAND.border}`,
        borderRadius: 12,
        padding: '12px 14px',
        fontFamily: 'inherit',
        transition: 'border-color 0.12s',
      }}
    >
      <div
        style={{
          width: 40,
          height: 24,
          borderRadius: 14,
          background: checked ? BRAND.orange : BRAND.border,
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}
        />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.ink }}>{label}</div>
        <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 1 }}>{desc}</div>
      </div>
    </button>
  );
}

function ChannelChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        background: active ? BRAND.orangeTint : '#fff',
        border: `1.5px solid ${active ? BRAND.orange : BRAND.border}`,
        borderRadius: 10,
        padding: '9px 16px',
        fontSize: 14,
        fontWeight: 600,
        color: active ? BRAND.orange : BRAND.inkSoft,
        fontFamily: 'inherit',
      }}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}

function RecapCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.ink, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  );
}

function RecapLine({ k, v, swatch }: { k: string; v: string; swatch?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
      <span style={{ color: BRAND.grey }}>{k}</span>
      <span style={{ color: BRAND.ink, fontWeight: 600, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 6 }}>
        {swatch && <span style={{ width: 12, height: 12, borderRadius: 3, background: swatch, border: `1px solid ${BRAND.border}` }} />}
        {v}
      </span>
    </div>
  );
}

// ─── Button styles ─────────────────────────────────────────────────────────────

function btnPrimary(disabled = false): CSSProperties {
  return {
    background: disabled ? BRAND.orangeSoft : BRAND.orange,
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '11px 24px',
    fontWeight: 700,
    fontSize: 14.5,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit',
    boxShadow: disabled ? 'none' : BRAND.shadowButton,
  };
}

function btnSecondary(disabled = false): CSSProperties {
  return {
    background: '#fff',
    color: disabled ? BRAND.grey : BRAND.inkSoft,
    border: `1px solid ${BRAND.border}`,
    borderRadius: 10,
    padding: '11px 20px',
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit',
  };
}

function linkBtn(bg: string, outline = false): CSSProperties {
  return {
    display: 'inline-block',
    background: outline ? '#fff' : bg,
    color: outline ? BRAND.inkSoft : '#fff',
    border: outline ? `1px solid ${BRAND.border}` : 'none',
    borderRadius: 9,
    padding: '10px 18px',
    fontWeight: 600,
    fontSize: 13.5,
    textDecoration: 'none',
    fontFamily: 'inherit',
  };
}
