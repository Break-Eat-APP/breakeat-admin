'use client';

// ─────────────────────────────────────────────────────────────
// Phase 11 — Shared "display conditions" builder for operator
// screen templates. Used by both the create and the edit pages so
// the form (and the draft ⇄ API mapping) lives in ONE place.
// ─────────────────────────────────────────────────────────────

import { BRAND } from '@/lib/brand';
import type {
  OperatorScreenKind,
  SlotKind,
  OperatorOrderStatus,
  OperatorScreenTemplate,
  CreateOperatorScreenInput,
  ScreenFilters,
} from '@/lib/api/admin-client';

// ─── Labels (French) ──────────────────────────────────────────

export const KIND_ORDER: OperatorScreenKind[] = ['ORDERS_QUEUE', 'READY', 'RECOVERED', 'GENERAL'];

export const KIND_LABELS: Record<OperatorScreenKind, string> = {
  ORDERS_QUEUE: 'File de commandes',
  READY: 'Prêtes',
  RECOVERED: 'Récupérées',
  GENERAL: 'Général',
};

/** Statuts par défaut affichés quand "Statuts" est laissé vide (miroir du backend). */
export const KIND_DEFAULT_STATUSES: Record<OperatorScreenKind, string> = {
  ORDERS_QUEUE: 'Payée · Acceptée · En préparation',
  READY: 'Prête',
  RECOVERED: 'Récupérée · Reprise',
  GENERAL: 'Payée · Acceptée · En préparation · Prête',
};

export const SLOT_KIND_ORDER: SlotKind[] = ['IMMEDIATE', 'PAUSE_1', 'PAUSE_2', 'GENERAL', 'CUSTOM'];

export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  IMMEDIATE: 'Immédiat',
  PAUSE_1: '1ʳᵉ pause / mi-temps',
  PAUSE_2: '2ᵉ pause / mi-temps',
  GENERAL: 'Général',
  CUSTOM: 'Personnalisé',
};

export const STATUS_ORDER: OperatorOrderStatus[] = [
  'PAID',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'PICKED_UP',
  'RECOVERED',
  'COMPLETED',
  'CANCELLED',
];

export const STATUS_LABELS: Record<OperatorOrderStatus, string> = {
  PAID: 'Payée',
  ACCEPTED: 'Acceptée',
  PREPARING: 'En préparation',
  READY: 'Prête',
  PICKED_UP: 'Récupérée',
  RECOVERED: 'Reprise',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
};

// ─── Draft model + API mapping ────────────────────────────────

/** Flat, UI-friendly shape edited by the form (filters split out into fields). */
export interface ScreenDraft {
  name: string;
  kind: OperatorScreenKind;
  icon: string;
  sortOrder: number;
  enabled: boolean;
  slotKinds: SlotKind[];
  statuses: OperatorOrderStatus[];
  supplierIds: string[];
  categoryIds: string[];
  showRecap: boolean;
}

export const EMPTY_DRAFT: ScreenDraft = {
  name: '',
  kind: 'ORDERS_QUEUE',
  icon: '',
  sortOrder: 0,
  enabled: true,
  slotKinds: [],
  statuses: [],
  supplierIds: [],
  categoryIds: [],
  showRecap: false,
};

export function templateToDraft(t: OperatorScreenTemplate): ScreenDraft {
  return {
    name: t.name,
    kind: t.kind,
    icon: t.icon ?? '',
    sortOrder: t.sortOrder,
    enabled: t.enabled,
    slotKinds: t.slotKinds ?? [],
    statuses: t.statuses ?? [],
    supplierIds: t.supplierIds ?? [],
    categoryIds: t.filters?.categoryIds ?? [],
    showRecap: t.filters?.showRecap ?? false,
  };
}

export function draftToInput(d: ScreenDraft): CreateOperatorScreenInput {
  const filters: ScreenFilters = {};
  if (d.categoryIds.length > 0) filters.categoryIds = d.categoryIds;
  if (d.showRecap) filters.showRecap = true;
  return {
    name: d.name.trim(),
    kind: d.kind,
    icon: d.icon.trim() || undefined,
    sortOrder: Number.isFinite(d.sortOrder) ? d.sortOrder : 0,
    enabled: d.enabled,
    slotKinds: d.slotKinds,
    statuses: d.statuses,
    supplierIds: d.supplierIds,
    filters,
  };
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

// ─── Primitives ───────────────────────────────────────────────

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        border: `1px solid ${active ? BRAND.orange : BRAND.border}`,
        background: active ? BRAND.orangeTint : '#fff',
        color: active ? BRAND.orange : BRAND.inkSoft,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
      }}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: BRAND.grey }}>{hint}</div>}
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────

export interface ScreenConditionsFormProps {
  draft: ScreenDraft;
  onChange: (patch: Partial<ScreenDraft>) => void;
  suppliers: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  /** Hide the name field (e.g. when the page renders its own). Default: shown. */
  hideName?: boolean;
}

export function ScreenConditionsForm({
  draft,
  onChange,
  suppliers,
  categories,
  hideName,
}: ScreenConditionsFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, fontFamily: BRAND.font }}>
      {!hideName && (
        <Field label="Nom de l'écran *">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Buvette Spartiates — Immédiates"
            required
            maxLength={80}
            style={inputStyle}
          />
        </Field>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 16 }}>
        <Field
          label="Type d'écran"
          hint={`Statuts par défaut : ${KIND_DEFAULT_STATUSES[draft.kind]}`}
        >
          <select
            value={draft.kind}
            onChange={(e) => onChange({ kind: e.target.value as OperatorScreenKind })}
            style={inputStyle}
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ordre">
          <input
            type="number"
            min={0}
            value={draft.sortOrder}
            onChange={(e) => onChange({ sortOrder: Number(e.target.value) })}
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Icône (emoji, optionnel)">
          <input
            type="text"
            value={draft.icon}
            onChange={(e) => onChange({ icon: e.target.value })}
            placeholder="🍔"
            maxLength={32}
            style={inputStyle}
          />
        </Field>
        <Field label="État" hint="Un écran désactivé n'apparaît pas sur le board.">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingTop: 8 }}>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
            />
            <span style={{ fontSize: 14, color: BRAND.ink }}>Écran activé</span>
          </label>
        </Field>
      </div>

      <Divider label="Conditions d'affichage" />

      <Field
        label="Créneaux (moment de récupération)"
        hint="Vide = tous les créneaux. Le type de créneau est portable d'un événement à l'autre."
      >
        <div style={chipRow}>
          {SLOT_KIND_ORDER.map((sk) => (
            <Chip
              key={sk}
              active={draft.slotKinds.includes(sk)}
              onClick={() => onChange({ slotKinds: toggle(draft.slotKinds, sk) })}
            >
              {SLOT_KIND_LABELS[sk]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field
        label="Statuts de commande"
        hint="Vide = statuts par défaut du type d'écran (ci-dessus)."
      >
        <div style={chipRow}>
          {STATUS_ORDER.map((s) => (
            <Chip
              key={s}
              active={draft.statuses.includes(s)}
              onClick={() => onChange({ statuses: toggle(draft.statuses, s) })}
            >
              {STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>
      </Field>

      <Field
        label="Fournisseurs"
        hint="Vide = tous les fournisseurs. Un opérateur épinglé à un fournisseur ne voit que ses écrans."
      >
        {suppliers.length === 0 ? (
          <div style={emptyHint}>Aucun fournisseur dans cette organisation.</div>
        ) : (
          <div style={chipRow}>
            {suppliers.map((sup) => (
              <Chip
                key={sup.id}
                active={draft.supplierIds.includes(sup.id)}
                onClick={() => onChange({ supplierIds: toggle(draft.supplierIds, sup.id) })}
              >
                {sup.name}
              </Chip>
            ))}
          </div>
        )}
      </Field>

      <Field
        label="Catégories à afficher"
        hint="Vide = toutes les catégories. Sinon, seules ces catégories apparaissent sur l'écran."
      >
        {categories.length === 0 ? (
          <div style={emptyHint}>Aucune catégorie dans cette organisation.</div>
        ) : (
          <div style={chipRow}>
            {categories.map((c) => (
              <Chip
                key={c.id}
                active={draft.categoryIds.includes(c.id)}
                onClick={() => onChange({ categoryIds: toggle(draft.categoryIds, c.id) })}
              >
                {c.name}
              </Chip>
            ))}
          </div>
        )}
      </Field>

      <Field label="Récapitulatif produits">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={draft.showRecap}
            onChange={(e) => onChange({ showRecap: e.target.checked })}
          />
          <span style={{ fontSize: 14, color: BRAND.ink }}>
            Afficher le panneau « Récap produits » (quantités agrégées) à côté de l&apos;écran
          </span>
        </label>
      </Field>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: BRAND.grey,
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: BRAND.border }} />
    </div>
  );
}

const chipRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };

const emptyHint: React.CSSProperties = { fontSize: 13, color: BRAND.grey, fontStyle: 'italic' };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: BRAND.inkSoft,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 6,
  border: `1px solid ${BRAND.border}`,
  fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  background: '#fff',
  color: BRAND.ink,
};
