'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import {
  apiGetEvents,
  apiDeleteEvent,
  apiUpdateEventStatus,
  apiCreateEvent,
  apiGetVenues,
  type AdminEvent,
  type LigneMatchFlaix,
  type Venue,
  getOrgId,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import { LiensCommandeFlaix } from '@/components/liens-commande-flaix';

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
      // `true` : le contenant d'un lieu ouvert en continu porte SON lien
      // Flaix. Sans lui, un restaurant n'aurait nulle part où le coller.
      const [evs, vns] = await Promise.all([apiGetEvents(orgId, true), apiGetVenues(orgId)]);
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


  // Le contenant d'un lieu OUVERT EN CONTINU n'est pas un événement : personne
  // ne l'a créé, personne ne le modifie. Il n'apparaît donc pas dans la liste
  // — mais il reste dans `events`, car c'est lui qui porte le lien Flaix d'un
  // tel lieu (section plus bas).
  const evenementsVisibles = events.filter((e) => !e.isPermanentContainer);

  const [busyId, setBusyId] = useState<string | null>(null);

  /**
   * Archiver = sortir l'evenement de la circulation en CONSERVANT tout.
   * C'est le geste normal apres un match : commandes, chiffre d'affaires et
   * historique client restent intacts, l'evenement cesse simplement d'accepter
   * de nouvelles commandes.
   */
  async function handleArchive(id: string, name: string) {
    if (!confirm(`Archiver « ${name} » ?

Il n'acceptera plus de commandes. Toutes les donnees sont conservees.`)) return;
    setBusyId(id);
    setError('');
    try {
      await apiUpdateEventStatus(orgId, id, 'ENDED');
      await loadEvents();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setError(msg);
      window.alert(`Archivage impossible

${msg}`);
    } finally {
      setBusyId(null);
    }
  }

  /** Supprimer = effacer la ligne. Le serveur refuse si des commandes existent. */
  async function handleDelete(id: string, name: string) {
    if (!confirm(`Supprimer « ${name} » ?

Cette action est definitive. Pour conserver les donnees, archivez plutot.`)) return;
    setBusyId(id);
    setError('');
    try {
      await apiDeleteEvent(orgId, id);
      await loadEvents();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setError(msg);
      window.alert(`Suppression impossible

${msg}`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');

    // LA MÊME RÈGLE QUE LE SERVEUR, vérifiée AVANT l'envoi.
    //
    // Le serveur refuse déjà une fin antérieure au début — et son message est
    // désormais en français. Mais une erreur qui revient d'un aller-retour
    // arrive après le clic, quand le club a déjà détourné les yeux. Dite ici,
    // elle apparaît sous le champ qu'il vient de remplir.
    //
    // Le serveur reste l'arbitre : ce contrôle-ci n'est qu'un confort, et une
    // requête fabriquée à la main serait toujours refusée là-bas.
    if (form.startAt && form.endAt && new Date(form.endAt) <= new Date(form.startAt)) {
      setCreateError(
        'La fin de l’événement doit être après son début. Vérifie l’heure de fin — ' +
          'pour un match qui finit après minuit, mets la date du lendemain.',
      );
      return;
    }

    setCreating(true);
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

  const lieu = venues[0];
  const modeContinu = lieu?.operatingMode === 'PERMANENT';
  const estFlaix = lieu?.flaixEnabled === true;
  // Même partage que la saisie des liens : à venir = pas encore fini et pas
  // annulé. Le reste n'a plus de commande à prendre.
  const estAVenir = (ev: AdminEvent) =>
    new Date(ev.endAt).getTime() > Date.now() && ev.status !== 'CANCELLED';
  const aVenir = evenementsVisibles.filter(estAVenir);
  const passes = evenementsVisibles.filter((ev) => !estAVenir(ev));

  /** Ce que le serveur vient d'écrire, reporté sur la liste sans la recharger. */
  const appliquerMaj = (maj: LigneMatchFlaix[]) =>
    setEvents((cur) =>
      cur.map((e) => {
        const m = maj.find((x) => x.id === e.id);
        // `{ ...e, ...m }` et non une liste de champs : le serveur ne rend QUE
        // ce qu'il a écrit, et une clé absente ne doit pas écraser localement
        // ce qui est toujours en base — corriger un blason effacerait sinon
        // le lien à l'écran.
        return m ? { ...e, ...m } : e;
      }),
    );

  /**
   * L'EN-TÊTE D'UN MATCH — nom, date, statut, Archiver, Supprimer, fiche.
   *
   * Plus de lien autour de toute la carte : les champs de saisie vivent
   * dessous, et un champ dans un lien ouvrirait la fiche au premier clic.
   * Le NOM et la flèche mènent à la fiche.
   */
  const enTeteMatch = (ev: AdminEvent) => {
    const st = STATUS_STYLE[ev.status] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft };
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5, color: BRAND.ink, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/events/${ev.id}`} style={{ color: BRAND.ink, textDecoration: 'none' }}>
              {ev.name}
            </Link>
            {ev.visibility === 'PRIVATE' && (
              <span style={{ background: BRAND.orangeTint, color: BRAND.orange, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>
                🔒 Privé
              </span>
            )}
            {ev.flaixReportUrl ? (
              <span style={{ background: BRAND.bgSubtle, color: BRAND.inkSoft, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>
                📊 Rapport Flaix
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 12.5, color: BRAND.grey, marginTop: 2 }}>
            {new Date(ev.startAt).toLocaleString('fr-FR', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
        <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 600 }}>
          {STATUS_LABEL[ev.status] ?? ev.status}
        </span>
        {ev.status !== 'ENDED' && ev.status !== 'CANCELLED' && (
          <button
            type="button"
            onClick={() => void handleArchive(ev.id, ev.name)}
            disabled={busyId === ev.id}
            title="Archiver — conserve toutes les donnees"
            style={ghostBtn}
          >
            Archiver
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleDelete(ev.id, ev.name)}
          disabled={busyId === ev.id}
          title="Supprimer definitivement"
          style={dangerBtn}
        >
          Supprimer
        </button>
        <Link
          href={`/events/${ev.id}`}
          title="Ouvrir la fiche du match"
          style={{ color: BRAND.inkSoft, fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Fiche ›
        </Link>
      </div>
    );
  };

  return (
    <div style={{ padding: '30px 36px 56px', fontFamily: BRAND.font }}>
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
          <h1 style={{ fontFamily: BRAND.fontDisplay, fontSize: 30, fontWeight: 800, color: BRAND.ink, margin: 0, letterSpacing: -0.6 }}>
            Événements &amp; configuration
          </h1>
          <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: '6px 0 0', lineHeight: 1.55, maxWidth: 580 }}>
            Le centre de paramétrage de ton club : chaque événement réunit ses buvettes &amp; produits,
            créneaux, points de retrait, écrans opérateur et statistiques — tout se configure depuis sa fiche.
          </p>
          <p style={{ color: BRAND.grey, fontSize: 12.5, margin: '7px 0 0' }}>
            {evenementsVisibles.length} événement{evenementsVisibles.length !== 1 ? 's' : ''}
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
          <h2 style={{ ...BRAND.sectionTitle, margin: '0 0 16px' }}>
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

      {/*
        UNE CARTE PAR MATCH (décision de Rémi, 10/11/2026).

        La page montrait chaque match DEUX fois : la liste des événements en
        haut, puis « Liens de commande Flaix » en bas, avec le lien,
        l'adversaire et le blason. Il fallait rapprocher les deux à l'œil — et
        un lien collé sur le mauvais match passait inaperçu.

        Désormais, un match à venir = une carte : son en-tête (nom, date,
        statut, Archiver, Supprimer, fiche) et, dessous, ses champs. Un seul
        bouton enregistre la saison entière. Les matchs passés ou annulés sont
        listés à part, sans champs : ils n'ont plus de commande à prendre.

        Un lieu OUVERT EN CONTINU garde l'ancien découpage : il n'a qu'un lien,
        celui de son contenant, qui n'est pas un match.
      */}
      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
      ) : evenementsVisibles.length === 0 && !modeContinu ? (
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
      ) : modeContinu ? (
        <>
          {evenementsVisibles.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {evenementsVisibles.map((ev) => (
                <div key={ev.id} style={carteStyle}>{enTeteMatch(ev)}</div>
              ))}
            </div>
          ) : null}
          <section
            style={{
              background: '#fff',
              border: `1px solid ${BRAND.border}`,
              borderRadius: 12,
              padding: 20,
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, color: BRAND.ink, margin: '0 0 4px' }}>
              Lien de commande Flaix
            </h2>
            <p style={{ fontSize: 12.5, color: BRAND.grey, margin: '0 0 14px' }}>
              Un seul lien, valable tous les jours.
            </p>
            <LiensCommandeFlaix
              orgId={orgId}
              events={events}
              modeContinu
              onSaved={appliquerMaj}
            />
          </section>
        </>
      ) : (
        <>
          {aVenir.length === 0 ? (
            <div style={{ ...carteStyle, color: BRAND.grey, fontSize: 14 }}>
              Aucun match à venir. Crée le prochain avec « + Nouvel événement ».
            </div>
          ) : (
            <LiensCommandeFlaix
              orgId={orgId}
              events={events}
              modeContinu={false}
              enTete={(ev) => enTeteMatch(ev)}
              avecLien={estFlaix}
              onSaved={appliquerMaj}
            />
          )}

          {passes.length > 0 ? (
            <div style={{ marginTop: 32 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.inkSoft, margin: '0 0 10px' }}>
                Matchs passés ou annulés ({passes.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {passes.map((ev) => (
                  <div key={ev.id} style={{ ...carteStyle, opacity: 0.85 }}>{enTeteMatch(ev)}</div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

const carteStyle: React.CSSProperties = {
  background: BRAND.bg,
  borderRadius: 10,
  padding: '14px 18px',
  boxShadow: '0 1px 3px rgba(28,25,23,0.06)',
  border: `1px solid ${BRAND.border}`,
};

const ghostBtn: React.CSSProperties = {
  background: '#fff', border: `1px solid ${BRAND.border}`, color: BRAND.inkSoft,
  borderRadius: 8, padding: '5px 12px', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
};

const dangerBtn: React.CSSProperties = {
  ...ghostBtn, borderColor: '#fca5a5', color: '#dc2626',
};

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
