'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import {
  apiGetEvents,
  apiCreateEvent,
  apiGetVenues,
  type AdminEvent,
  type Venue,
  getOrgId,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  ACTIVE:    { bg: '#d1fae5', color: '#065f46' },
  DRAFT:     { bg: BRAND.bgSubtle, color: BRAND.inkSoft },
  PAUSED:    { bg: '#fef3c7', color: '#92400e' },
  ENDED:     { bg: BRAND.border, color: BRAND.grey },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b' },
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Actif', DRAFT: 'Brouillon', PAUSED: 'Pausé', ENDED: 'Terminé', CANCELLED: 'Annulé',
};

// ─── Create event form ────────────────────────────────────────────────────────

interface CreateForm {
  venueId: string;
  name: string;
  startAt: string;
  endAt: string;
}

const EMPTY_FORM: CreateForm = { venueId: '', name: '', startAt: '', endAt: '' };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const orgId = getOrgId();

  const loadEvents = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const [evs, vns] = await Promise.all([apiGetEvents(orgId), apiGetVenues(orgId)]);
      setEvents(Array.isArray(evs) ? evs : []);
      setVenues(Array.isArray(vns) ? vns : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  // Un club = un lieu : pré-sélectionne le lieu du club dans le formulaire (plus d'UUID à coller).
  useEffect(() => {
    if (venues.length > 0 && !form.venueId) {
      setForm((f) => ({ ...f, venueId: venues[0].id }));
    }
  }, [venues, form.venueId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      await apiCreateEvent(orgId, form);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await loadEvents();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreating(false);
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
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0, letterSpacing: -0.3 }}>
            Événements &amp; configuration
          </h1>
          <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: '6px 0 0', lineHeight: 1.55, maxWidth: 580 }}>
            Le centre de paramétrage de ton club : chaque événement réunit ses buvettes &amp; produits,
            créneaux, points de retrait, écrans opérateur et statistiques — tout se configure depuis sa fiche.
          </p>
          <p style={{ color: BRAND.grey, fontSize: 12.5, margin: '7px 0 0' }}>
            {events.length} événement{events.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.orangeDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.orange; }}
          style={{
            background: BRAND.orange,
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 20px',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.15s ease',
          }}
        >
          {showForm ? '✕ Annuler' : '+ Nouvel événement'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          style={{
            background: BRAND.bg,
            borderRadius: 12,
            padding: 24,
            boxShadow: BRAND.shadowSoft,
            marginBottom: 24,
            border: `2px solid ${BRAND.orange}`,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, margin: '0 0 16px' }}>
            Créer un événement
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Nom de l&apos;événement *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Concert Rock Festival 2026"
                required
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Lieu</label>
              {venues.length === 0 ? (
                <div
                  style={{
                    background: BRAND.orangeTint,
                    border: `1px solid ${BRAND.orangeSoft}`,
                    borderRadius: BRAND.radius.control,
                    padding: '12px 14px',
                    fontSize: 13,
                    color: BRAND.inkSoft,
                  }}
                >
                  Aucun lieu défini pour ton club.{' '}
                  <Link href={`/organizations/${orgId}`} style={{ color: BRAND.orange, fontWeight: 600 }}>
                    Crée ton lieu dans « Organisation »
                  </Link>{' '}
                  d&apos;abord — il sera ensuite utilisé automatiquement.
                </div>
              ) : venues.length === 1 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    borderRadius: BRAND.radius.control,
                    border: `1px solid ${BRAND.border}`,
                    background: BRAND.bgSubtle,
                    fontSize: 13.5,
                    color: BRAND.ink,
                  }}
                >
                  <MapPin size={16} strokeWidth={1.9} color={BRAND.orange} style={{ flexShrink: 0 }} />
                  <strong style={{ fontWeight: 600 }}>{venues[0].name}</strong>
                  <span style={{ color: BRAND.grey }}>· {venues[0].address}</span>
                </div>
              ) : (
                <select
                  value={form.venueId}
                  onChange={(e) => setForm((f) => ({ ...f, venueId: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} — {v.address}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label style={labelStyle}>Date de début *</label>
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Date de fin *</label>
              <input
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
                required
                style={inputStyle}
              />
            </div>
          </div>
          {createError && (
            <div style={{ color: '#dc2626', fontSize: 13, marginTop: 12 }}>{createError}</div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              type="submit"
              disabled={creating || venues.length === 0}
              style={{
                background: creating || venues.length === 0 ? BRAND.grey : BRAND.orange,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 24px',
                fontWeight: 600,
                fontSize: 14,
                cursor: creating || venues.length === 0 ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {creating ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
      ) : events.length === 0 ? (
        <div
          style={{
            background: BRAND.bg,
            borderRadius: 12,
            padding: 40,
            textAlign: 'center',
            color: BRAND.grey,
            boxShadow: '0 1px 3px rgba(28,25,23,0.06)',
            border: `1px solid ${BRAND.border}`,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎪</div>
          <div style={{ fontWeight: 600 }}>Aucun événement</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Créez votre premier événement ci-dessus.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map((ev) => {
            const st = STATUS_STYLE[ev.status] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft };
            return (
              <Link
                key={ev.id}
                href={`/events/${ev.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    background: BRAND.bg,
                    borderRadius: 10,
                    padding: '16px 20px',
                    boxShadow: '0 1px 3px rgba(28,25,23,0.06)',
                    border: `1px solid ${BRAND.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: BRAND.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {ev.name}
                      {ev.visibility === 'PRIVATE' && (
                        <span
                          style={{
                            background: BRAND.orangeTint,
                            color: BRAND.orange,
                            borderRadius: 999,
                            padding: '2px 9px',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          🔒 Privé
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
                      {new Date(ev.startAt).toLocaleDateString('fr-FR')}
                      {' → '}
                      {new Date(ev.endAt).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <span
                    style={{
                      background: st.bg,
                      color: st.color,
                      borderRadius: 999,
                      padding: '3px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {STATUS_LABEL[ev.status] ?? ev.status}
                  </span>
                  <span style={{ color: BRAND.grey, fontSize: 18 }}>›</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: BRAND.inkSoft,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 6,
  border: `1px solid ${BRAND.border}`,
  fontSize: 14,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
