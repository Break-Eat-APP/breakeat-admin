'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Megaphone, Clock, Trash2, Percent, Send } from 'lucide-react';
import {
  apiGetScheduledPushes,
  apiCreateScheduledPush,
  apiCancelScheduledPush,
  apiGetEvents,
  getOrgId,
  type ScheduledPush,
  type AdminEvent,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  PENDING:   { bg: '#fef3c7', color: '#92400e', label: 'En attente' },
  SENT:      { bg: '#d1fae5', color: '#065f46', label: 'Envoyé' },
  CANCELLED: { bg: BRAND.bgSubtle, color: BRAND.inkSoft, label: 'Annulé' },
  FAILED:    { bg: '#fee2e2', color: '#991b1b', label: 'Échec' },
};

type Kind = 'PUSH' | 'DISCOUNT_CAMPAIGN';

export default function CampaignsPage() {
  const orgId = getOrgId();
  const [items, setItems] = useState<ScheduledPush[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    kind: 'PUSH' as Kind,
    title: '',
    body: '',
    eventId: '',
    discountPercent: '50',
    scheduledAt: '',
  });

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [list, evs] = await Promise.all([apiGetScheduledPushes(orgId), apiGetEvents(orgId)]);
      setItems(Array.isArray(list) ? list : []);
      setEvents(Array.isArray(evs) ? evs : []);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    setMsg('');
    try {
      await apiCreateScheduledPush(orgId, {
        kind: form.kind,
        title: form.title.trim(),
        body: form.body.trim() || undefined,
        eventId: form.eventId || undefined,
        discountPercent: form.kind === 'DISCOUNT_CAMPAIGN' ? parseInt(form.discountPercent, 10) : undefined,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
      });
      setForm({ kind: 'PUSH', title: '', body: '', eventId: '', discountPercent: '50', scheduledAt: '' });
      setMsg('✓ Programmé.');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(id: string) {
    if (!orgId || !confirm('Annuler ce push programmé ?')) return;
    try {
      await apiCancelScheduledPush(orgId, id);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (!orgId) return <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>Aucune organisation sélectionnée.</div>;

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0, letterSpacing: -0.3 }}>Campagnes &amp; push programmés</h1>
        <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: '6px 0 0', maxWidth: 640, lineHeight: 1.55 }}>
          Programme un push à la date et l&apos;heure de ton choix (annonces, rappels), ou une campagne promo
          automatique (ex. <strong>-50 % en fin de match</strong>). Le système envoie tout seul à l&apos;heure prévue.
        </p>
      </div>
      {msg && <div style={{ fontSize: 13, margin: '10px 0', color: msg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{msg}</div>}

      <div style={{ background: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, margin: '12px 0 20px', lineHeight: 1.5, maxWidth: 720 }}>
        ⚠️ L&apos;envoi réel suppose des jetons push enregistrés (setup natif Expo). Pour les campagnes -50 %, l&apos;annonce part automatiquement ; l&apos;application de la remise au panier sera branchée au checkout (suivi).
      </div>

      {/* Form */}
      <form onSubmit={handleCreate} style={{ background: BRAND.surface, borderRadius: BRAND.radius.card, padding: 22, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}`, marginBottom: 24, maxWidth: 720 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['PUSH', 'DISCOUNT_CAMPAIGN'] as Kind[]).map((k) => (
            <button key={k} type="button" onClick={() => setForm((f) => ({ ...f, kind: k }))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, border: `1.5px solid ${form.kind === k ? BRAND.orange : BRAND.border}`, background: form.kind === k ? BRAND.orangeTint : BRAND.surface, color: form.kind === k ? BRAND.orange : BRAND.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {k === 'PUSH' ? <><Send size={14} /> Push simple</> : <><Percent size={14} /> Campagne promo</>}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={miniLabel}>Titre *</div>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required style={field} placeholder={form.kind === 'DISCOUNT_CAMPAIGN' ? '-50 % maintenant ! 🔥' : 'Coup d’envoi dans 15 min ⚽'} />
          </div>
          <div>
            <div style={miniLabel}>Date &amp; heure d&apos;envoi *</div>
            <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} required style={field} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={miniLabel}>Message</div>
            <input value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} style={field} placeholder="Texte de la notification" />
          </div>
          <div>
            <div style={miniLabel}>Événement (optionnel — sinon tous)</div>
            <select value={form.eventId} onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value }))} style={{ ...field, cursor: 'pointer' }}>
              <option value="">Tous les clients de l&apos;org</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          </div>
          {form.kind === 'DISCOUNT_CAMPAIGN' && (
            <div>
              <div style={miniLabel}>Remise (%)</div>
              <input type="number" min="1" max="100" value={form.discountPercent} onChange={(e) => setForm((f) => ({ ...f, discountPercent: e.target.value }))} style={field} />
            </div>
          )}
        </div>
        <button type="submit" disabled={saving} style={primaryBtn(saving)}>
          {saving ? 'Programmation…' : 'Programmer'}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Aucun push programmé.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
          {items.map((it) => {
            const st = STATUS_STYLE[it.status] ?? { bg: BRAND.bgSubtle, color: BRAND.inkSoft, label: it.status };
            const ev = events.find((e) => e.id === it.eventId);
            return (
              <div key={it.id} style={{ background: BRAND.surface, borderRadius: 12, padding: '14px 18px', boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: it.kind === 'DISCOUNT_CAMPAIGN' ? '#ede9fe' : BRAND.orangeTint, color: it.kind === 'DISCOUNT_CAMPAIGN' ? '#6d28d9' : BRAND.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {it.kind === 'DISCOUNT_CAMPAIGN' ? <Percent size={18} /> : <Megaphone size={18} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: BRAND.ink }}>
                    {it.title}
                    {it.kind === 'DISCOUNT_CAMPAIGN' && it.discountPercent != null && <span style={{ color: '#6d28d9', marginLeft: 6 }}>−{it.discountPercent}%</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: BRAND.grey, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={12} /> {fmtDate(it.scheduledAt)}
                    {ev && <> · {ev.name}</>}
                    {it.status === 'SENT' && <> · {it.sentCount} envoi(s)</>}
                  </div>
                </div>
                <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{st.label}</span>
                {it.status === 'PENDING' && (
                  <button onClick={() => void handleCancel(it.id)} title="Annuler" style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'inline-flex' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const miniLabel: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: BRAND.grey, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 };
const field: CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: `1px solid ${BRAND.border}`, fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' };
function primaryBtn(disabled: boolean): CSSProperties {
  return { marginTop: 16, background: disabled ? BRAND.orangeSoft : BRAND.orange, color: '#fff', border: 'none', borderRadius: BRAND.radius.control, padding: '11px 22px', fontWeight: 600, fontSize: 14, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', boxShadow: disabled ? 'none' : BRAND.shadowButton };
}
