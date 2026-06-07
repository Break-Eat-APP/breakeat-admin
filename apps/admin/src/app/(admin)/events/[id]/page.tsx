'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  apiGetEvent,
  apiUpdateEventStatus,
  apiUpdateEvent,
  apiGetSuppliers,
  apiAttachSupplier,
  apiDetachSupplier,
  apiCreateSupplier,
  apiGetPickupPoints,
  apiCreatePickupPoint,
  apiGetVenues,
  apiGetSlots,
  apiCreateSlot,
  apiDeleteSlot,
  apiGetGroups,
  apiGetEventScreens,
  apiGetOperatorScreens,
  apiApplyEventScreen,
  apiUpdateEventScreen,
  apiRemoveEventScreen,
  apiGetEventStats,
  type AdminEvent,
  type Supplier,
  type PickupPoint,
  type Slot,
  type Venue,
  type Group,
  type EventVisibility,
  type EventOperatorScreen,
  type OperatorScreenTemplate,
  type EventStats,
  type OperatorOrderStatus,
  getOrgId,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import { KIND_LABELS } from '@/components/operator-screens/screen-form';

// ─── Status config ────────────────────────────────────────────────────────────

const EVENT_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED'];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  ACTIVE:    { bg: '#d1fae5', color: '#065f46' },
  DRAFT:     { bg: BRAND.bgSubtle, color: BRAND.inkSoft },
  PAUSED:    { bg: '#fef3c7', color: '#92400e' },
  ENDED:     { bg: BRAND.border, color: BRAND.grey },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b' },
};

// ─── Components ───────────────────────────────────────────────────────────────

function Card({ title, children, action }: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ background: BRAND.bg, borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(28,25,23,0.06)', border: `1px solid ${BRAND.border}`, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.id as string;
  const orgId = getOrgId();

  const [event, setEvent] = useState<AdminEvent | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orgSuppliers, setOrgSuppliers] = useState<Supplier[]>([]);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Status change
  const [newStatus, setNewStatus] = useState('');
  const [changingStatus, setChangingStatus] = useState(false);

  // Attach supplier
  const [attachId, setAttachId] = useState('');
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState('');

  // Create supplier
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupZone, setNewSupZone] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [createSupError, setCreateSupError] = useState('');

  // Pickup point form
  const [ppName, setPpName] = useState('');
  const [creatingPp, setCreatingPp] = useState(false);
  const [ppError, setPpError] = useState('');

  // Slot form
  const [slotForm, setSlotForm] = useState({ startAt: '', endAt: '', capacity: '20', label: '' });
  const [creatingSlot, setCreatingSlot] = useState(false);
  const [slotError, setSlotError] = useState('');

  // Branding form
  const [brandDesc, setBrandDesc] = useState('');
  const [brandLogo, setBrandLogo] = useState('');
  const [brandColor, setBrandColor] = useState('');
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandError, setBrandError] = useState('');
  const [brandSuccess, setBrandSuccess] = useState('');

  // Access & visibility (Phase 14.7)
  const [orgGroups, setOrgGroups] = useState<Group[]>([]);
  const [visibility, setVisibility] = useState<EventVisibility>('PUBLIC');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [accessSuccess, setAccessSuccess] = useState('');

  // Operator screens (Phase 11) — per-event application of org templates
  const [eventScreens, setEventScreens] = useState<EventOperatorScreen[]>([]);
  const [orgTemplates, setOrgTemplates] = useState<OperatorScreenTemplate[]>([]);
  const [applyTemplateId, setApplyTemplateId] = useState('');
  const [applyingScreen, setApplyingScreen] = useState(false);
  const [screenError, setScreenError] = useState('');

  // Stats (Phase 15) — fetched independently so a manager-only 403 (revenue is
  // gated to MANAGE_ROLES) degrades gracefully without breaking the rest of the page.
  const [stats, setStats] = useState<EventStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsDenied, setStatsDenied] = useState(false);
  const [statsError, setStatsError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ev, orgSups, pps, sls, grps, evScreens, orgTpls] = await Promise.all([
        apiGetEvent(orgId, eventId),
        apiGetSuppliers(orgId),
        apiGetPickupPoints(orgId, { eventId }),
        apiGetSlots(eventId),
        apiGetGroups(orgId),
        apiGetEventScreens(eventId),
        apiGetOperatorScreens(orgId),
      ]);
      setEvent(ev);
      setNewStatus(ev.status);
      setBrandDesc(ev.description ?? '');
      setBrandLogo(ev.logoUrl ?? '');
      setBrandColor(ev.primaryColor ?? '');
      setOrgSuppliers(Array.isArray(orgSups) ? orgSups : []);
      setPickupPoints(Array.isArray(pps) ? pps : []);
      setSlots(Array.isArray(sls) ? sls : []);
      // Access & visibility — prefill from the single-event read.
      setOrgGroups(Array.isArray(grps) ? grps : []);
      setVisibility(ev.visibility ?? 'PUBLIC');
      setSelectedGroupIds(new Set((ev.groups ?? []).map((g) => g.groupId)));
      // Operator screens — applied links + full org template catalogue.
      setEventScreens(Array.isArray(evScreens) ? evScreens : []);
      setOrgTemplates(Array.isArray(orgTpls) ? orgTpls : []);
      // Get suppliers attached to this event
      const evWithSuppliers = ev as AdminEvent & { eventSuppliers?: Array<{ supplier: Supplier }> };
      if (evWithSuppliers.eventSuppliers) {
        setSuppliers(evWithSuppliers.eventSuppliers.map((es) => es.supplier));
      }
      // Load venue info
      if (ev.venueId) {
        apiGetVenues(orgId).then((venues) => {
          const v = venues.find((x) => x.id === ev.venueId);
          setVenue(v ?? null);
        }).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId, eventId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    setStatsDenied(false);
    setStatsError('');
    apiGetEventStats(eventId)
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Erreur';
        if (/access denied/i.test(msg)) setStatsDenied(true);
        else setStatsError(msg);
      })
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  async function handleStatusChange() {
    if (!event || newStatus === event.status) return;
    setChangingStatus(true);
    try {
      const updated = await apiUpdateEventStatus(orgId, eventId, newStatus);
      setEvent(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setChangingStatus(false);
    }
  }

  async function handleAttach(e: React.FormEvent) {
    e.preventDefault();
    setAttaching(true);
    setAttachError('');
    try {
      await apiAttachSupplier(orgId, eventId, attachId.trim());
      setAttachId('');
      await load();
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setAttaching(false);
    }
  }

  async function handleDetach(supplierId: string) {
    try {
      await apiDetachSupplier(orgId, eventId, supplierId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault();
    setCreatingSupplier(true);
    setCreateSupError('');
    try {
      const s = await apiCreateSupplier(orgId, { name: newSupName, preparationZone: newSupZone || undefined });
      setShowNewSupplier(false);
      setNewSupName('');
      setNewSupZone('');
      setOrgSuppliers((prev) => [...prev, s]);
    } catch (err) {
      setCreateSupError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreatingSupplier(false);
    }
  }

  async function handleCreatePickupPoint(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setCreatingPp(true);
    setPpError('');
    try {
      await apiCreatePickupPoint(orgId, {
        name: ppName.trim(),
        venueId: event.venueId,
        eventId: event.id,
      });
      setPpName('');
      await load();
    } catch (err) {
      setPpError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreatingPp(false);
    }
  }

  async function handleCreateSlot(e: React.FormEvent) {
    e.preventDefault();
    setCreatingSlot(true);
    setSlotError('');
    try {
      await apiCreateSlot(eventId, {
        startAt: new Date(slotForm.startAt).toISOString(),
        endAt: new Date(slotForm.endAt).toISOString(),
        capacity: parseInt(slotForm.capacity, 10),
        label: slotForm.label.trim() || undefined,
      });
      setSlotForm({ startAt: '', endAt: '', capacity: '20', label: '' });
      await load();
    } catch (err) {
      setSlotError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreatingSlot(false);
    }
  }

  async function handleDeleteSlot(slotId: string) {
    if (!confirm('Supprimer ce créneau ?')) return;
    try {
      await apiDeleteSlot(eventId, slotId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    setSavingBrand(true);
    setBrandError('');
    setBrandSuccess('');
    try {
      const body: { description?: string; logoUrl?: string; primaryColor?: string } = {
        description: brandDesc.trim(),
      };
      if (brandLogo.trim()) body.logoUrl = brandLogo.trim();
      if (brandColor.trim()) body.primaryColor = brandColor.trim();
      const updated = await apiUpdateEvent(orgId, eventId, body);
      setEvent(updated);
      setBrandSuccess('Branding sauvegardé.');
    } catch (err) {
      setBrandError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingBrand(false);
    }
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function handleSaveAccess(e: React.FormEvent) {
    e.preventDefault();
    setSavingAccess(true);
    setAccessError('');
    setAccessSuccess('');
    try {
      // When PUBLIC, group links are irrelevant — clear them so the event isn't
      // left with stale restrictions if it flips back to PRIVATE later.
      const groupIds = visibility === 'PRIVATE' ? [...selectedGroupIds] : [];
      const updated = await apiUpdateEvent(orgId, eventId, { visibility, groupIds });
      setEvent(updated);
      setVisibility(updated.visibility ?? visibility);
      setSelectedGroupIds(new Set((updated.groups ?? []).map((g) => g.groupId)));
      setAccessSuccess('Accès mis à jour.');
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingAccess(false);
    }
  }

  // ── Operator screens (Phase 11) ───────────────────────────────────────────────

  async function handleApplyScreen(e: React.FormEvent) {
    e.preventDefault();
    if (!applyTemplateId) return;
    setApplyingScreen(true);
    setScreenError('');
    try {
      await apiApplyEventScreen(eventId, { templateId: applyTemplateId });
      setApplyTemplateId('');
      await load();
    } catch (err) {
      setScreenError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setApplyingScreen(false);
    }
  }

  async function handleToggleScreen(linkId: string, enabled: boolean) {
    setScreenError('');
    try {
      await apiUpdateEventScreen(eventId, linkId, { enabled });
      await load();
    } catch (err) {
      setScreenError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleRemoveScreen(linkId: string) {
    if (!confirm('Retirer cet écran de l’événement ? Le modèle reste disponible pour d’autres événements.')) {
      return;
    }
    setScreenError('');
    try {
      await apiRemoveEventScreen(eventId, linkId);
      await load();
    } catch (err) {
      setScreenError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  // Persist an explicit 0..n-1 ordering for the rows whose sortOrder drifted.
  async function persistScreenOrder(ordered: EventOperatorScreen[]) {
    setScreenError('');
    try {
      await Promise.all(
        ordered
          .map((s, i) => (s.sortOrder === i ? null : apiUpdateEventScreen(eventId, s.id, { sortOrder: i })))
          .filter((p): p is Promise<EventOperatorScreen> => p !== null),
      );
      await load();
    } catch (err) {
      setScreenError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  function moveScreen(ordered: EventOperatorScreen[], index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[j]] = [next[j], next[index]];
    void persistScreenOrder(next);
  }

  if (loading) return <Shell>Chargement…</Shell>;
  if (error) return <Shell><ErrBanner msg={error} /></Shell>;
  if (!event) return null;

  const st = STATUS_STYLE[event.status] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft };
  const attachedIds = new Set(suppliers.map((s) => s.id));

  // Operator screens: order by effective sortOrder (per-event override ?? template default).
  const sortedScreens = [...eventScreens].sort((a, b) => {
    const oa = a.sortOrder ?? a.template?.sortOrder ?? 0;
    const ob = b.sortOrder ?? b.template?.sortOrder ?? 0;
    if (oa !== ob) return oa - ob;
    return (a.template?.name ?? '').localeCompare(b.template?.name ?? '');
  });
  const appliedTemplateIds = new Set(eventScreens.map((s) => s.templateId));
  const availableTemplates = orgTemplates.filter((t) => !appliedTemplateIds.has(t.id));

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: BRAND.ink, margin: 0 }}>
            {event.name}
          </h1>
          <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 600 }}>
            {event.status}
          </span>
        </div>
        <div style={{ color: BRAND.grey, fontSize: 13 }}>
          {new Date(event.startAt).toLocaleString('fr-FR')} → {new Date(event.endAt).toLocaleString('fr-FR')}
          {' · ID : '}
          <code style={{ background: BRAND.bgSubtle, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{event.id}</code>
        </div>
      </div>

      {/* Stats (Phase 15) */}
      <Card title="📊 Statistiques de l'événement">
        {statsLoading ? (
          <p style={{ color: BRAND.grey, fontSize: 14, margin: 0 }}>Chargement des statistiques…</p>
        ) : statsDenied ? (
          <p style={{ color: BRAND.grey, fontSize: 14, margin: 0 }}>
            🔒 Le chiffre d&apos;affaires est réservé aux rôles Administrateur d&apos;organisation et Manager.
          </p>
        ) : statsError ? (
          <div style={{ color: '#dc2626', fontSize: 14 }}>{statsError}</div>
        ) : stats ? (
          <>
            {/* KPI tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
              <StatTile
                label="CA HT"
                value={euros(stats.revenue.caHtCents)}
                sub={`TVA ${Math.round(stats.revenue.vatRate * 100)}% · TTC ${euros(stats.revenue.caTtcCents)}`}
                accent
              />
              <StatTile label="CA TTC" value={euros(stats.revenue.caTtcCents)} sub="Encaissé" />
              <StatTile label="Commandes" value={intFmt(stats.ordersCount)} sub="Payées" />
              <StatTile
                label="Panier moyen TTC"
                value={euros(stats.averageBasket.ttcCents)}
                sub={`HT ${euros(stats.averageBasket.htCents)}`}
              />
            </div>

            {/* Orders by status */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.inkSoft, marginBottom: 8 }}>
                Répartition par statut
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {STATUS_ORDER.map((s) => {
                  const count = stats.ordersByStatus[s] ?? 0;
                  const sty = ORDER_STATUS_STYLE[s];
                  const on = count > 0;
                  return (
                    <div
                      key={s}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        borderRadius: 999,
                        background: on ? sty.bg : BRAND.bgSubtle,
                        border: `1px solid ${on ? sty.bg : BRAND.border}`,
                        opacity: on ? 1 : 0.55,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: on ? sty.color : BRAND.grey }}>
                        {ORDER_STATUS_LABEL[s]}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: on ? sty.color : BRAND.grey }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top products */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.inkSoft, marginBottom: 8 }}>
                Top produits
              </div>
              {stats.topProducts.length === 0 ? (
                <p style={{ color: BRAND.grey, fontSize: 13, margin: 0 }}>Aucune vente pour le moment.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stats.topProducts.map((p, i) => (
                    <div
                      key={p.productId}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: BRAND.bgSubtle, borderRadius: 8 }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.grey, width: 22, textAlign: 'center' }}>
                        {i + 1}
                      </span>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: BRAND.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </span>
                      <span style={{ fontSize: 13, color: BRAND.grey, whiteSpace: 'nowrap' }}>
                        ×{intFmt(p.quantity)}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: BRAND.ink, minWidth: 90, textAlign: 'right' }}>
                        {euros(p.revenueCents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </Card>

      {/* Status change */}
      <Card title="Statut de l'événement">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, background: BRAND.bg, fontFamily: 'inherit' }}
          >
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={handleStatusChange}
            disabled={changingStatus || newStatus === event.status}
            onMouseEnter={(e) => { if (!(changingStatus || newStatus === event.status)) e.currentTarget.style.background = BRAND.orangeDark; }}
            onMouseLeave={(e) => { if (!(changingStatus || newStatus === event.status)) e.currentTarget.style.background = BRAND.orange; }}
            style={{
              background: newStatus === event.status ? BRAND.border : BRAND.orange,
              color: newStatus === event.status ? BRAND.grey : '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontWeight: 600,
              fontSize: 13,
              cursor: newStatus === event.status ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.15s ease',
            }}
          >
            {changingStatus ? 'Mise à jour…' : 'Appliquer'}
          </button>
          <span style={{ fontSize: 13, color: BRAND.grey }}>
            Statut actuel : <strong>{event.status}</strong>
          </span>
        </div>
      </Card>

      {/* Access & visibility (Phase 14.7) */}
      <Card title="🔒 Accès & visibilité">
        <form onSubmit={handleSaveAccess}>
          <p style={{ color: BRAND.grey, fontSize: 13, margin: '0 0 16px', maxWidth: 620 }}>
            Un événement <strong>public</strong> est visible et commandable par tous. Un
            événement <strong>privé</strong> n&apos;est accessible qu&apos;aux membres des
            groupes sélectionnés ci-dessous — les autres reçoivent une erreur 404.
          </p>

          {/* Visibility radios */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            {(['PUBLIC', 'PRIVATE'] as EventVisibility[]).map((v) => {
              const active = visibility === v;
              return (
                <button
                  type="button"
                  key={v}
                  onClick={() => setVisibility(v)}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    textAlign: 'left',
                    background: active ? BRAND.orangeTint : BRAND.bg,
                    border: `1.5px solid ${active ? BRAND.orange : BRAND.border}`,
                    borderRadius: 10,
                    padding: '12px 16px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: active ? BRAND.orange : BRAND.ink,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>{v === 'PUBLIC' ? '🌍' : '🔒'}</span>
                    {v === 'PUBLIC' ? 'Public' : 'Privé'}
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 3 }}>
                    {v === 'PUBLIC'
                      ? 'Ouvert à tous les utilisateurs.'
                      : 'Réservé aux groupes choisis.'}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Group multi-select (only when PRIVATE) */}
          {visibility === 'PRIVATE' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>
                Groupes autorisés ({selectedGroupIds.size} sélectionné
                {selectedGroupIds.size !== 1 ? 's' : ''})
              </label>
              {orgGroups.length === 0 ? (
                <div
                  style={{
                    marginTop: 8,
                    padding: '12px 14px',
                    background: BRAND.bgSubtle,
                    borderRadius: 8,
                    border: `1px solid ${BRAND.border}`,
                    fontSize: 13,
                    color: BRAND.grey,
                  }}
                >
                  Aucun groupe dans cette organisation.{' '}
                  <Link href="/groups" style={{ color: BRAND.orange, fontWeight: 600 }}>
                    Créer un groupe →
                  </Link>
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    maxHeight: 260,
                    overflowY: 'auto',
                  }}
                >
                  {orgGroups.map((g) => {
                    const checked = selectedGroupIds.has(g.id);
                    return (
                      <label
                        key={g.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '9px 12px',
                          background: checked ? BRAND.orangeTint : BRAND.bgSubtle,
                          border: `1px solid ${checked ? BRAND.orange : BRAND.border}`,
                          borderRadius: 8,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleGroup(g.id)}
                          style={{ accentColor: BRAND.orange, width: 16, height: 16 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.ink }}>
                            {g.name}
                          </div>
                          {g.emailDomain && (
                            <div style={{ fontSize: 12, color: BRAND.grey }}>@{g.emailDomain}</div>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: BRAND.grey }}>
                          {g._count?.members ?? 0} membre{(g._count?.members ?? 0) !== 1 ? 's' : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {accessError && (
            <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{accessError}</div>
          )}
          {accessSuccess && (
            <div style={{ color: '#16a34a', fontSize: 13, marginBottom: 10 }}>{accessSuccess}</div>
          )}

          <button
            type="submit"
            disabled={savingAccess}
            onMouseEnter={(e) => {
              if (!savingAccess) e.currentTarget.style.background = BRAND.orangeDark;
            }}
            onMouseLeave={(e) => {
              if (!savingAccess) e.currentTarget.style.background = BRAND.orange;
            }}
            style={{
              background: savingAccess ? BRAND.grey : BRAND.orange,
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 20px',
              fontWeight: 600,
              fontSize: 13,
              cursor: savingAccess ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.15s ease',
            }}
          >
            {savingAccess ? 'Sauvegarde…' : 'Sauvegarder l’accès'}
          </button>
        </form>
      </Card>

      {/* Suppliers */}
      <Card
        title={`Fournisseurs attachés (${suppliers.length})`}
        action={
          <button
            onClick={() => setShowNewSupplier((v) => !v)}
            style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: BRAND.inkSoft, fontFamily: 'inherit' }}
          >
            + Créer fournisseur
          </button>
        }
      >
        {/* Create supplier inline form */}
        {showNewSupplier && (
          <form
            onSubmit={handleCreateSupplier}
            style={{ background: BRAND.bgSubtle, borderRadius: 8, padding: 16, marginBottom: 16, border: `1px solid ${BRAND.border}` }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Nom du fournisseur *"
                value={newSupName}
                onChange={(e) => setNewSupName(e.target.value)}
                required
                style={{ flex: 1, minWidth: 150, padding: '7px 10px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'inherit' }}
              />
              <input
                type="text"
                placeholder="Zone de préparation (optionnel)"
                value={newSupZone}
                onChange={(e) => setNewSupZone(e.target.value)}
                style={{ flex: 1, minWidth: 150, padding: '7px 10px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'inherit' }}
              />
              <button
                type="submit"
                disabled={creatingSupplier}
                onMouseEnter={(e) => { if (!creatingSupplier) e.currentTarget.style.background = BRAND.orangeDark; }}
                onMouseLeave={(e) => { if (!creatingSupplier) e.currentTarget.style.background = BRAND.orange; }}
                style={{ background: creatingSupplier ? BRAND.grey : BRAND.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 600, fontSize: 13, cursor: creatingSupplier ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s ease' }}
              >
                {creatingSupplier ? 'Création…' : 'Créer'}
              </button>
            </div>
            {createSupError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{createSupError}</div>}
          </form>
        )}

        {/* Attach existing supplier */}
        <form onSubmit={handleAttach} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <select
            value={attachId}
            onChange={(e) => setAttachId(e.target.value)}
            required
            style={{ flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, background: BRAND.bg, fontFamily: 'inherit' }}
          >
            <option value="">Sélectionner un fournisseur existant…</option>
            {orgSuppliers.filter((s) => !attachedIds.has(s.id)).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={attaching || !attachId}
            onMouseEnter={(e) => { if (!(attaching || !attachId)) e.currentTarget.style.background = BRAND.orangeDark; }}
            onMouseLeave={(e) => { if (!(attaching || !attachId)) e.currentTarget.style.background = BRAND.orange; }}
            style={{ background: attaching ? BRAND.grey : BRAND.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: attaching || !attachId ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s ease' }}
          >
            {attaching ? 'Ajout…' : 'Attacher'}
          </button>
          {attachError && <span style={{ color: '#dc2626', fontSize: 13, alignSelf: 'center' }}>{attachError}</span>}
        </form>

        {/* Attached list */}
        {suppliers.length === 0 ? (
          <p style={{ color: BRAND.grey, fontSize: 14 }}>Aucun fournisseur attaché à cet événement.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suppliers.map((s) => (
              <div
                key={s.id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: BRAND.bgSubtle, borderRadius: 8, border: `1px solid ${BRAND.border}` }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.ink }}>{s.name}</div>
                  {s.preparationZone && <div style={{ fontSize: 12, color: BRAND.grey }}>Zone : {s.preparationZone}</div>}
                </div>
                <button
                  onClick={() => void handleDetach(s.id)}
                  style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Détacher
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Venue info */}
      <Card title="🏟️ Lieu">
        {venue ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.ink }}>{venue.name}</div>
              <div style={{ fontSize: 13, color: BRAND.grey, marginTop: 2 }}>{venue.address}</div>
            </div>
            <code style={{ background: BRAND.bgSubtle, padding: '3px 8px', borderRadius: 4, fontSize: 11, color: BRAND.grey }}>{venue.id}</code>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={{ color: BRAND.grey, fontSize: 14, margin: 0 }}>Venue ID : </p>
            <code style={{ background: BRAND.bgSubtle, padding: '3px 8px', borderRadius: 4, fontSize: 11 }}>{event.venueId}</code>
          </div>
        )}
      </Card>

      {/* Suppliers — add link to manage products */}
      {suppliers.length > 0 && (
        <Card title="🏪 Gérer les produits par fournisseur">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suppliers.map((s) => (
              <Link
                key={s.id}
                href={`/suppliers/${s.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: BRAND.bgSubtle, borderRadius: 8, border: `1px solid ${BRAND.border}`, textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.ink }}>{s.name}</div>
                  {s.preparationZone && <div style={{ fontSize: 12, color: BRAND.grey }}>Zone : {s.preparationZone}</div>}
                </div>
                <span style={{ color: BRAND.orange, fontSize: 13, fontWeight: 600 }}>Gérer les produits →</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Pickup Points */}
      <Card title={`📍 Points de retrait (${pickupPoints.length})`}>
        <form onSubmit={handleCreatePickupPoint} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={ppName}
            onChange={(e) => setPpName(e.target.value)}
            placeholder="Nom du point de retrait (ex: Comptoir Nord)"
            required
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, fontFamily: 'inherit' }}
          />
          <button
            type="submit"
            disabled={creatingPp || !ppName.trim()}
            onMouseEnter={(e) => { if (!(creatingPp || !ppName.trim())) e.currentTarget.style.background = BRAND.orangeDark; }}
            onMouseLeave={(e) => { if (!(creatingPp || !ppName.trim())) e.currentTarget.style.background = BRAND.orange; }}
            style={{ background: creatingPp ? BRAND.grey : BRAND.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: creatingPp || !ppName.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s ease' }}
          >
            {creatingPp ? '…' : '+ Ajouter'}
          </button>
        </form>
        {ppError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{ppError}</div>}
        {pickupPoints.length === 0 ? (
          <p style={{ color: BRAND.grey, fontSize: 14, margin: 0 }}>Aucun point de retrait.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pickupPoints.map((pp) => (
              <div key={pp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: BRAND.bgSubtle, borderRadius: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.ink }}>📍 {pp.name}</div>
                </div>
                <code style={{ fontSize: 11, color: BRAND.grey }}>{pp.id.slice(0, 8)}…</code>
                <button
                  onClick={() => void navigator.clipboard?.writeText(pp.id)}
                  style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  📋
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Time Slots */}
      <Card title={`⏰ Créneaux horaires (${slots.length})`}>
        <form
          onSubmit={handleCreateSlot}
          style={{ background: BRAND.bgSubtle, borderRadius: 8, padding: 16, marginBottom: 16, border: `1px solid ${BRAND.border}` }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 12, marginBottom: 8 }}>
            <div>
              <label style={slotLbl}>Début *</label>
              <input
                type="datetime-local"
                value={slotForm.startAt}
                onChange={(e) => setSlotForm((f) => ({ ...f, startAt: e.target.value }))}
                required
                style={slotInp}
              />
            </div>
            <div>
              <label style={slotLbl}>Fin *</label>
              <input
                type="datetime-local"
                value={slotForm.endAt}
                onChange={(e) => setSlotForm((f) => ({ ...f, endAt: e.target.value }))}
                required
                style={slotInp}
              />
            </div>
            <div>
              <label style={slotLbl}>Capacité *</label>
              <input
                type="number"
                min="1"
                value={slotForm.capacity}
                onChange={(e) => setSlotForm((f) => ({ ...f, capacity: e.target.value }))}
                required
                style={slotInp}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={slotLbl}>Label (affiché au client)</label>
              <input
                type="text"
                value={slotForm.label}
                onChange={(e) => setSlotForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="ex: 20:00 – 20:15"
                style={slotInp}
              />
            </div>
          </div>
          {slotError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{slotError}</div>}
          <button
            type="submit"
            disabled={creatingSlot}
            onMouseEnter={(e) => { if (!creatingSlot) e.currentTarget.style.background = BRAND.orangeDark; }}
            onMouseLeave={(e) => { if (!creatingSlot) e.currentTarget.style.background = BRAND.orange; }}
            style={{ background: creatingSlot ? BRAND.grey : BRAND.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: creatingSlot ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s ease' }}
          >
            {creatingSlot ? '…' : '+ Créer le créneau'}
          </button>
        </form>
        {slots.length === 0 ? (
          <p style={{ color: BRAND.grey, fontSize: 14, margin: 0 }}>Aucun créneau.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {slots.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: BRAND.bgSubtle, borderRadius: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.ink }}>
                    {s.label ?? `${new Date(s.startAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} – ${new Date(s.endAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.grey }}>
                    {new Date(s.startAt).toLocaleDateString('fr-FR')} · Capacité : {s.capacity}
                  </div>
                </div>
                <span style={{ background: s.status === 'OPEN' ? '#d1fae5' : BRAND.bgSubtle, color: s.status === 'OPEN' ? '#065f46' : BRAND.grey, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                  {s.status}
                </span>
                <button
                  onClick={() => void handleDeleteSlot(s.id)}
                  style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Suppr.
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* QR Code */}
      <Card title="📱 QR Code de l'événement">
        <p style={{ color: BRAND.grey, fontSize: 14, margin: '0 0 16px' }}>
          Ce QR code ouvre directement cet événement dans l&apos;application Break Eat.
        </p>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=breakeat%3A%2F%2Fevent%2F${event.id}`}
            alt="QR Code"
            width={180}
            height={180}
            style={{ borderRadius: 8, border: `1px solid ${BRAND.border}` }}
          />
          <div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 4 }}>Deep Link</div>
              <code style={{ background: BRAND.bgSubtle, padding: '6px 10px', borderRadius: 6, fontSize: 12, display: 'block' }}>
                breakeat://event/{event.id}
              </code>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 4 }}>UUID Événement</div>
              <code style={{ background: BRAND.bgSubtle, padding: '6px 10px', borderRadius: 6, fontSize: 11, display: 'block' }}>
                {event.id}
              </code>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                onClick={() => void navigator.clipboard?.writeText(`breakeat://event/${event.id}`)}
                onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.orangeDark; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.orange; }}
                style={{ background: BRAND.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s ease' }}
              >
                📋 Copier le lien
              </button>
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=breakeat%3A%2F%2Fevent%2F${event.id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: BRAND.bgSubtle, color: BRAND.inkSoft, border: `1px solid ${BRAND.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}
              >
                ⬇ Télécharger (400px)
              </a>
            </div>
          </div>
        </div>
      </Card>

      {/* Branding */}
      <Card title="🎨 Branding de l'événement">
        <form onSubmit={handleSaveBranding}>
          {brandError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{brandError}</div>}
          {brandSuccess && <div style={{ color: '#16a34a', fontSize: 13, marginBottom: 10 }}>{brandSuccess}</div>}

          <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>
              Description (affichée dans l&apos;app mobile)
            </label>
            <textarea
              placeholder="Ex : Match de Ligue 1 — Spartiates vs Olympique · Stade Vélodrome"
              value={brandDesc}
              onChange={(e) => setBrandDesc(e.target.value)}
              rows={3}
              style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>URL du logo</label>
              <input
                type="url"
                placeholder="https://example.com/logo-event.png"
                value={brandLogo}
                onChange={(e) => setBrandLogo(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft }}>Couleur principale</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="color"
                  value={brandColor || BRAND.orange}
                  onChange={(e) => setBrandColor(e.target.value)}
                  style={{ width: 38, height: 36, borderRadius: 6, border: `1px solid ${BRAND.border}`, cursor: 'pointer', padding: 2 }}
                />
                <input
                  type="text"
                  placeholder={BRAND.orange}
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  maxLength={7}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'monospace' }}
                />
              </div>
            </div>
          </div>

          {brandLogo && (
            <div style={{ marginBottom: 12 }}>
              <img
                src={brandLogo}
                alt="Logo preview"
                style={{ height: 40, borderRadius: 6, border: `1px solid ${BRAND.border}`, objectFit: 'contain', background: BRAND.bgSubtle, padding: 4 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={savingBrand}
            onMouseEnter={(e) => { if (!savingBrand) e.currentTarget.style.background = BRAND.orangeDark; }}
            onMouseLeave={(e) => { if (!savingBrand) e.currentTarget.style.background = BRAND.orange; }}
            style={{
              background: savingBrand ? BRAND.grey : BRAND.orange,
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 20px',
              fontWeight: 600,
              fontSize: 13,
              cursor: savingBrand ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.15s ease',
            }}
          >
            {savingBrand ? 'Sauvegarde…' : 'Sauvegarder le branding'}
          </button>
        </form>
      </Card>

      {/* Operator screens (Phase 11) */}
      <Card
        title="🖥️ Écrans opérateur"
        action={
          <Link
            href="/operator-screens"
            style={{ fontSize: 12, fontWeight: 600, color: BRAND.orange, textDecoration: 'none' }}
          >
            Gérer les modèles →
          </Link>
        }
      >
        <p style={{ color: BRAND.grey, fontSize: 13, margin: '0 0 16px', maxWidth: 620 }}>
          Appliquez des <strong>modèles d&apos;écran</strong> de l&apos;organisation à cet
          événement. L&apos;ordre et l&apos;activation ci-dessous sont propres à l&apos;événement ;
          les conditions d&apos;affichage (créneaux, statuts, fournisseurs) restent définies sur le
          modèle.
        </p>

        {/* Apply a template */}
        <form onSubmit={handleApplyScreen} style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <select
            value={applyTemplateId}
            onChange={(e) => setApplyTemplateId(e.target.value)}
            disabled={availableTemplates.length === 0}
            style={{ flex: 1, minWidth: 220, padding: '8px 10px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, background: BRAND.bg, fontFamily: 'inherit' }}
          >
            <option value="">
              {availableTemplates.length === 0
                ? 'Tous les modèles sont déjà appliqués'
                : 'Sélectionner un modèle à appliquer…'}
            </option>
            {availableTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {(t.icon ? `${t.icon} ` : '') + t.name} · {KIND_LABELS[t.kind]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={applyingScreen || !applyTemplateId}
            onMouseEnter={(e) => { if (!(applyingScreen || !applyTemplateId)) e.currentTarget.style.background = BRAND.orangeDark; }}
            onMouseLeave={(e) => { if (!(applyingScreen || !applyTemplateId)) e.currentTarget.style.background = BRAND.orange; }}
            style={{ background: applyingScreen || !applyTemplateId ? BRAND.grey : BRAND.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: applyingScreen || !applyTemplateId ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s ease' }}
          >
            {applyingScreen ? 'Application…' : 'Appliquer'}
          </button>
        </form>

        {screenError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{screenError}</div>}

        {/* Applied screens */}
        {sortedScreens.length === 0 ? (
          <p style={{ color: BRAND.grey, fontSize: 14, margin: 0 }}>
            {orgTemplates.length === 0
              ? 'Aucun modèle d’écran dans cette organisation. Créez-en un d’abord.'
              : 'Aucun écran appliqué à cet événement.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedScreens.map((s, i) => {
              const tpl = s.template;
              return (
                <div
                  key={s.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: BRAND.bgSubtle, borderRadius: 8, border: `1px solid ${BRAND.border}`, opacity: s.enabled ? 1 : 0.6 }}
                >
                  {/* Reorder */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button
                      onClick={() => moveScreen(sortedScreens, i, -1)}
                      disabled={i === 0}
                      title="Monter"
                      style={{ ...reorderBtn, cursor: i === 0 ? 'not-allowed' : 'pointer', color: i === 0 ? BRAND.border : BRAND.inkSoft }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveScreen(sortedScreens, i, 1)}
                      disabled={i === sortedScreens.length - 1}
                      title="Descendre"
                      style={{ ...reorderBtn, cursor: i === sortedScreens.length - 1 ? 'not-allowed' : 'pointer', color: i === sortedScreens.length - 1 ? BRAND.border : BRAND.inkSoft }}
                    >
                      ▼
                    </button>
                  </div>

                  <span style={{ fontSize: 20, width: 26, textAlign: 'center' }}>{tpl?.icon || '🖥️'}</span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: BRAND.ink }}>
                        {tpl?.name ?? 'Modèle supprimé'}
                      </span>
                      {!s.enabled && <span style={screenDisabledBadge}>désactivé</span>}
                    </div>
                    {tpl && (
                      <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
                        {KIND_LABELS[tpl.kind]}
                        {tpl.slotKinds.length > 0 && ` · ${tpl.slotKinds.length} créneau${tpl.slotKinds.length > 1 ? 'x' : ''}`}
                        {tpl.supplierIds.length > 0
                          ? ` · ${tpl.supplierIds.length} fournisseur${tpl.supplierIds.length > 1 ? 's' : ''}`
                          : ' · tous fournisseurs'}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => void handleToggleScreen(s.id, !s.enabled)}
                    style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}`, color: BRAND.inkSoft, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {s.enabled ? 'Désactiver' : 'Activer'}
                  </button>
                  <button
                    onClick={() => void handleRemoveScreen(s.id)}
                    style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Retirer
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Operator Dashboard shortcut */}
      <Card title="📊 Dashboard opérateur">
        <p style={{ color: BRAND.grey, fontSize: 14, margin: '0 0 12px' }}>
          Accédez au dashboard opérateur pour gérer les commandes en temps réel.
        </p>
        <a
          href={`http://localhost:3002/dashboard/${event.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-block', background: BRAND.ink, color: '#fff', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
        >
          Ouvrir le dashboard →
        </a>
      </Card>

      {/* Simulator shortcut */}
      <Card title="🚀 Simulateur">
        <p style={{ color: BRAND.grey, fontSize: 14, margin: '0 0 12px' }}>
          Accédez au simulateur pour tester cet événement avec des données de démonstration.
        </p>
        <a
          href={`/simulator?eventId=${event.id}`}
          style={{
            display: 'inline-block',
            background: BRAND.ink,
            color: '#fff',
            borderRadius: 8,
            padding: '10px 20px',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Ouvrir le simulateur →
        </a>
      </Card>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 32, fontFamily: BRAND.font, color: BRAND.grey }}>{children}</div>;
}

function ErrBanner({ msg }: { msg: string }) {
  return (
    <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#dc2626', fontSize: 14 }}>
      {msg}
    </div>
  );
}

// ─── Stats helpers (Phase 15) ───────────────────────────────────────────────────

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const INT = new Intl.NumberFormat('fr-FR');

/** Integer cents → "1 234,56 €". */
function euros(cents: number): string {
  return EUR.format((cents ?? 0) / 100);
}

function intFmt(n: number): string {
  return INT.format(n ?? 0);
}

/** Lifecycle order for the per-status breakdown (matches OrderStatus enum). */
const STATUS_ORDER: OperatorOrderStatus[] = [
  'PAID',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'PICKED_UP',
  'COMPLETED',
  'CANCELLED',
  'RECOVERED',
];

const ORDER_STATUS_LABEL: Record<OperatorOrderStatus, string> = {
  PAID: 'Payée',
  ACCEPTED: 'Acceptée',
  PREPARING: 'En préparation',
  READY: 'Prête',
  PICKED_UP: 'Retirée',
  COMPLETED: 'Terminée',
  CANCELLED: 'Annulée',
  RECOVERED: 'Récupérée',
};

const ORDER_STATUS_STYLE: Record<OperatorOrderStatus, { bg: string; color: string }> = {
  PAID: { bg: '#dbeafe', color: '#1e40af' },
  ACCEPTED: { bg: '#e0e7ff', color: '#3730a3' },
  PREPARING: { bg: '#fef3c7', color: '#92400e' },
  READY: { bg: '#d1fae5', color: '#065f46' },
  PICKED_UP: { bg: '#cffafe', color: '#155e75' },
  COMPLETED: { bg: '#dcfce7', color: '#166534' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b' },
  RECOVERED: { bg: '#f3e8ff', color: '#6b21a8' },
};

function StatTile({ label, value, sub, accent = false }: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? BRAND.orangeTint : BRAND.bgSubtle,
        border: `1px solid ${accent ? BRAND.orangeSoft : BRAND.border}`,
        borderRadius: 10,
        padding: '14px 16px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: accent ? BRAND.orange : BRAND.grey, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? BRAND.orange : BRAND.ink, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

const slotLbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 4 };
const slotInp: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };

const reorderBtn: React.CSSProperties = { background: 'none', border: 'none', fontSize: 10, lineHeight: 1, padding: 0, fontFamily: 'inherit' };
const screenDisabledBadge: React.CSSProperties = { background: BRAND.border, color: BRAND.inkSoft, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600 };
