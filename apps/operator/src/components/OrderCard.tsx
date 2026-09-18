'use client';

import { useState } from 'react';
import { BRAND } from '@break-eat/brand';
import { StatusBadge, STATUS_COLORS, type StatusVariant } from './StatusBadge';
import {
  MissingItemsPanel,
  ROUGE_MANQUANT,
  FOND_MANQUANT,
  type LigneManquante,
} from './MissingItemsPanel';

/**
 * OrderCard — displays a single order on the operator dashboard.
 *
 * Shows: order number, status badge, items list, elapsed time,
 * and a primary action button for the next allowed transition.
 */

export interface OrderItem {
  id: string;
  productNameSnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
  /** Unités que le comptoir n'a pas pu servir. */
  missingQuantity?: number;
}

export interface OrderCardProps {
  id: string;
  orderNumber: string;
  status: StatusVariant;
  items: OrderItem[];
  createdAt: string;
  /**
   * Phase 19 — horodatage du « Je suis arrivé » côté client. Non nul ⇒ le client
   * attend au point de retrait : la carte pulse et affiche depuis combien de temps.
   */
  customerArrivedAt?: string | null;
  /** Dernier signalement de produits manquants ; nul si rien ne manque. */
  missingReportedAt?: string | null;
  isLoading?: boolean;
  onPrepare?: () => void;
  onReady?: () => void;
  onPickedUp?: () => void;
  onCancel?: () => void;
  /** Signale (ou retire) des produits manquants ; rejette en cas d'échec. */
  onMissing?: (lignes: LigneManquante[], retirerDeLaCarte: boolean) => Promise<void>;
}

/** Tant que le client n'est pas reparti, un manque peut encore être signalé. */
const STATUTS_SIGNALABLES = ['PAID', 'RECOVERED', 'ACCEPTED', 'PREPARING', 'READY'];

function formatCents(cents: number) {
  return `${(cents / 100).toFixed(2)} €`;
}

export function elapsed(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

export function OrderCard({
  orderNumber,
  status,
  items,
  createdAt,
  customerArrivedAt = null,
  missingReportedAt = null,
  isLoading = false,
  onPrepare,
  onReady,
  onPickedUp,
  onCancel,
  onMissing,
}: OrderCardProps) {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  const arrived = Boolean(customerArrivedAt);
  const [panneau, setPanneau] = useState(false);
  const manquantes = items.filter((it) => (it.missingQuantity ?? 0) > 0);
  const signalable = Boolean(onMissing) && STATUTS_SIGNALABLES.includes(status);
  // La bordure dit l'urgence : le client présent prime (il attend là, tout
  // de suite), puis le manque (il faudra lui parler), puis l'étape.
  const bordure = arrived ? BRAND.orange : manquantes.length > 0 ? ROUGE_MANQUANT : color;

  return (
    <div
      className={arrived ? 'breakeat-arrived' : undefined}
      style={{
        border: `1px solid ${arrived ? BRAND.orange : manquantes.length > 0 ? `${ROUGE_MANQUANT}66` : BRAND.border}`,
        borderLeft: `4px solid ${bordure}`,
        borderRadius: 12,
        padding: 14,
        width: '100%',
        maxWidth: 280,
        background: '#fff',
        boxShadow: '0 1px 2px rgba(45,41,38,0.05), 0 4px 14px rgba(45,41,38,0.05)',
        opacity: isLoading ? 0.6 : 1,
        transition: 'opacity 0.15s',
        fontFamily: BRAND.font,
        color: BRAND.ink,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>#{orderNumber}</span>
        <StatusBadge status={status} size="sm" />
      </div>

      {/* Elapsed time */}
      <div style={{ fontSize: 11, color: BRAND.grey, marginBottom: arrived ? 6 : 10 }}>
        Il y a {elapsed(createdAt)}
      </div>

      {/* Phase 19 — le client est au comptoir */}
      {arrived && customerArrivedAt && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(253, 64, 0, 0.10)',
            color: BRAND.orangeDark,
            border: `1px solid ${BRAND.orange}`,
            borderRadius: 8,
            padding: '5px 8px',
            fontSize: 11.5,
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          <span aria-hidden="true">🙋</span>
          Client présent · {elapsed(customerArrivedAt)}
        </div>
      )}

      {/* Produits manquants — le comptoir devra en parler au client. */}
      {manquantes.length > 0 && (
        <div
          style={{
            background: FOND_MANQUANT,
            color: ROUGE_MANQUANT,
            border: `1px solid ${ROUGE_MANQUANT}55`,
            borderRadius: 8,
            padding: '5px 8px',
            fontSize: 11.5,
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          Manquant signalé{missingReportedAt ? ` · ${elapsed(missingReportedAt)}` : ''} — client prévenu
        </div>
      )}

      {/* Items */}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px 0' }}>
        {items.map((it) => (
          <li
            key={it.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 13,
              padding: '2px 0',
              borderBottom: `1px solid ${BRAND.border}`,
            }}
          >
            <span
              style={{
                // Barré seulement si la ligne manque EN ENTIER : pour une
                // bière sur deux, il en reste une à servir.
                textDecoration: (it.missingQuantity ?? 0) >= it.quantity ? 'line-through' : undefined,
                color: (it.missingQuantity ?? 0) > 0 ? ROUGE_MANQUANT : undefined,
              }}
            >
              {it.productNameSnapshot}
              {(it.missingQuantity ?? 0) > 0 && (
                <span style={{ fontWeight: 800, fontSize: 11, marginLeft: 6 }}>
                  {it.missingQuantity} manquant{(it.missingQuantity ?? 0) > 1 ? 's' : ''}
                </span>
              )}
            </span>
            <span style={{ fontWeight: 700, color: BRAND.inkSoft }}>
              ×{it.quantity}
              <span style={{ fontWeight: 400, color: BRAND.grey, marginLeft: 4, fontSize: 11 }}>
                ({formatCents(it.unitPriceCentsSnapshot * it.quantity)})
              </span>
            </span>
          </li>
        ))}
      </ul>

      {panneau && onMissing && (
        <MissingItemsPanel lignes={items} onValider={onMissing} onFermer={() => setPanneau(false)} />
      )}

      {/* Un seul geste par carte : celui que l'etape appelle. */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(status === 'PAID' || status === 'RECOVERED') && (
          <ActionButton
            color={STATUS_COLORS.PREPARING}
            label="En préparation"
            onClick={onPrepare}
            disabled={isLoading}
          />
        )}
        {(status === 'ACCEPTED' || status === 'PREPARING') && (
          <ActionButton color={STATUS_COLORS.READY} label="Prête ✓" onClick={onReady} disabled={isLoading} />
        )}
        {status === 'READY' && (
          <ActionButton
            color={STATUS_COLORS.PICKED_UP}
            label="Remise au client"
            onClick={onPickedUp}
            disabled={isLoading}
          />
        )}
        {signalable && !panneau && (
          <SmallButton
            color={ROUGE_MANQUANT}
            label="Manquant"
            title="Signaler un produit manquant au client"
            onClick={() => setPanneau(true)}
            disabled={isLoading}
          />
        )}
        {/* Annulation — tant que la commande n'attend pas au comptoir. */}
        {['PAID', 'RECOVERED', 'ACCEPTED', 'PREPARING'].includes(status) && (
          <SmallButton color={STATUS_COLORS.CANCELLED} label="✕" title="Annuler" onClick={onCancel} disabled={isLoading} />
        )}
      </div>
    </div>
  );
}

function ActionButton({
  color,
  label,
  onClick,
  disabled,
}: {
  color: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        background: disabled ? BRAND.bgSubtle : color,
        color: disabled ? BRAND.grey : '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '7px 0',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700,
        fontSize: 13,
        fontFamily: 'inherit',
        transition: 'background 0.1s',
      }}
    >
      {label}
    </button>
  );
}

function SmallButton({
  color,
  label,
  title,
  onClick,
  disabled,
}: {
  color: string;
  label: string;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        flexShrink: 0,
        background: disabled ? BRAND.bgSubtle : color + '22',
        color: disabled ? BRAND.grey : color,
        border: `1px solid ${color}44`,
        borderRadius: 8,
        padding: '7px 10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700,
        fontSize: 13,
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}
