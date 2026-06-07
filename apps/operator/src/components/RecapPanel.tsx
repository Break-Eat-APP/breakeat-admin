'use client';

import { useMemo, useState } from 'react';
import { BRAND } from '@break-eat/brand';
import { StatusBadge, type StatusVariant } from './StatusBadge';
import type { Order } from '@/lib/api/orders-client';

/**
 * RecapPanel (Phase 11.4) — the right-hand side panel of the operator board.
 *
 * Two stacked tools, both scoped to the orders currently visible on the active
 * screen:
 *   1. Accès rapide — search a single order by its public number or by the
 *      customer's name, to locate it fast during service.
 *   2. Récap produits — aggregate every line into category groups with running
 *      totals ("N cmd · N u"), so the prep team sees the whole workload at a
 *      glance regardless of how orders are split across columns.
 *
 * Everything is derived from the live dashboard snapshot — no extra fetch.
 */

interface RecapPanelProps {
  orders: Order[];
  screenName: string;
  onHide: () => void;
}

interface CategoryGroup {
  name: string;
  total: number;
  products: { name: string; qty: number }[];
}

function aggregate(orders: Order[]): {
  totalUnits: number;
  categories: CategoryGroup[];
} {
  const catMap = new Map<string, Map<string, number>>();
  let totalUnits = 0;

  for (const order of orders) {
    for (const item of order.items) {
      totalUnits += item.quantity;
      const cat = item.categoryName ?? 'Autres';
      let products = catMap.get(cat);
      if (!products) {
        products = new Map();
        catMap.set(cat, products);
      }
      products.set(
        item.productNameSnapshot,
        (products.get(item.productNameSnapshot) ?? 0) + item.quantity,
      );
    }
  }

  const categories: CategoryGroup[] = [...catMap.entries()]
    .map(([name, products]) => {
      const list = [...products.entries()]
        .map(([n, qty]) => ({ name: n, qty }))
        .sort((a, b) => b.qty - a.qty);
      return { name, total: list.reduce((s, p) => s + p.qty, 0), products: list };
    })
    .sort((a, b) => b.total - a.total);

  return { totalUnits, categories };
}

export function RecapPanel({ orders, screenName, onHide }: RecapPanelProps) {
  const [query, setQuery] = useState('');
  const { totalUnits, categories } = useMemo(() => aggregate(orders), [orders]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return orders
      .filter(
        (o) =>
          o.publicOrderNumber.toLowerCase().includes(q) ||
          (o.customerName ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [orders, query]);

  return (
    <aside
      style={{
        width: 320,
        flex: '0 0 320px',
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: '#fff',
        border: `1px solid ${BRAND.border}`,
        borderRadius: 12,
        padding: 14,
        fontFamily: BRAND.font,
        maxHeight: '100%',
        overflowY: 'auto',
      }}
    >
      {/* ─── Accès rapide ─────────────────────────────────────────── */}
      <section>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: BRAND.ink }}>
            Accès rapide
          </h3>
          <button
            onClick={onHide}
            style={{
              background: 'transparent',
              border: 'none',
              color: BRAND.grey,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            Masquer ✕
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="N° commande ou nom du client…"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '8px 11px',
            borderRadius: 8,
            border: `1px solid ${BRAND.border}`,
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        {query.trim() !== '' && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {matches.length === 0 && (
              <span style={{ fontSize: 12, color: BRAND.grey }}>Aucun résultat</span>
            )}
            {matches.map((o) => (
              <div
                key={o.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '6px 9px',
                  borderRadius: 8,
                  background: BRAND.bgSubtle,
                  border: `1px solid ${BRAND.border}`,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: BRAND.ink }}>
                    #{o.publicOrderNumber}
                  </span>
                  {o.customerName && (
                    <span
                      style={{
                        fontSize: 12,
                        color: BRAND.inkSoft,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {o.customerName}
                    </span>
                  )}
                </div>
                <StatusBadge status={o.status as StatusVariant} size="sm" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Récap produits ───────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: BRAND.ink }}>
            Récap produits
          </h3>
          <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.orangeDark }}>
            {orders.length} cmd · {totalUnits} u
          </span>
        </div>

        <div style={{ fontSize: 11, color: BRAND.grey, marginBottom: 10 }}>{screenName}</div>

        {categories.length === 0 && (
          <span style={{ fontSize: 12, color: BRAND.grey }}>Aucun produit à préparer</span>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {categories.map((cat) => (
            <div key={cat.name}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 5,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color: BRAND.ink }}>
                  {cat.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#fff',
                    background: BRAND.orange,
                    borderRadius: 999,
                    padding: '1px 8px',
                  }}
                >
                  {cat.total}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {cat.products.map((p) => (
                  <div
                    key={p.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12.5,
                      color: BRAND.inkSoft,
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </span>
                    <span style={{ fontWeight: 800, color: BRAND.ink, paddingLeft: 8 }}>
                      {p.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
