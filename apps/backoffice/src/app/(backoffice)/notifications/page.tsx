'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import {
  apiListOrganizations,
  apiSendNotification,
  apiScheduleNotification,
  apiListScheduledNotifications,
  apiCancelScheduledNotification,
  type OrgListItem,
  type SendNotificationResult,
  type ScheduledPush,
} from '@/lib/api/backoffice-client';

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING:    { label: 'En attente', color: '#d97706' },
  PROCESSING: { label: 'En cours',   color: '#2563eb' },
  SENT:       { label: 'Envoyé',     color: '#059669' },
  CANCELLED:  { label: 'Annulé',     color: BRAND.grey },
  FAILED:     { label: 'Échec',      color: '#dc2626' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Valeur minimale pour datetime-local : maintenant + 2 min (arrondi à la minute). */
function minDatetimeLocal() {
  const d = new Date(Date.now() + 2 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

export default function NotificationsPage() {
  const qc = useQueryClient();

  const { data: orgs } = useQuery<OrgListItem[]>({
    queryKey: ['backoffice', 'organizations'],
    queryFn: apiListOrganizations,
  });

  const { data: scheduled, isLoading: schedLoading } = useQuery<ScheduledPush[]>({
    queryKey: ['backoffice', 'notifications', 'scheduled'],
    queryFn: apiListScheduledNotifications,
    refetchInterval: 30_000,
  });

  // ── Envoi immédiat ────────────────────────────────────────────
  const [nowTitle, setNowTitle]   = useState('');
  const [nowBody, setNowBody]     = useState('');
  const [nowOrgId, setNowOrgId]   = useState('');
  const [nowResult, setNowResult] = useState<SendNotificationResult | null>(null);
  const [nowError, setNowError]   = useState('');

  const sendMut = useMutation({
    mutationFn: () => apiSendNotification({
      title: nowTitle.trim(),
      body: nowBody.trim() || undefined,
      orgId: nowOrgId || undefined,
    }),
    onSuccess: (data) => { setNowResult(data); setNowError(''); setNowTitle(''); setNowBody(''); setNowOrgId(''); },
    onError: (e) => { setNowError(e instanceof Error ? e.message : 'Échec'); setNowResult(null); },
  });

  // ── Programmation future ──────────────────────────────────────
  const [schTitle, setSchTitle]   = useState('');
  const [schBody, setSchBody]     = useState('');
  const [schOrgId, setSchOrgId]   = useState('');
  const [schDate, setSchDate]     = useState('');
  const [schError, setSchError]   = useState('');
  const [schOk, setSchOk]         = useState(false);

  const scheduleMut = useMutation({
    mutationFn: () => apiScheduleNotification({
      title: schTitle.trim(),
      body: schBody.trim() || undefined,
      orgId: schOrgId || undefined,
      scheduledAt: new Date(schDate).toISOString(),
    }),
    onSuccess: () => {
      setSchOk(true); setSchError('');
      setSchTitle(''); setSchBody(''); setSchOrgId(''); setSchDate('');
      void qc.invalidateQueries({ queryKey: ['backoffice', 'notifications', 'scheduled'] });
    },
    onError: (e) => { setSchError(e instanceof Error ? e.message : 'Échec'); setSchOk(false); },
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => apiCancelScheduledNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backoffice', 'notifications', 'scheduled'] }),
  });

  const activeOrgs = orgs?.filter((o) => o.status === 'ACTIVE') ?? [];
  const pending    = scheduled?.filter((s) => s.status === 'PENDING') ?? [];
  const history    = scheduled?.filter((s) => s.status !== 'PENDING') ?? [];

  return (
    <div style={{ padding: '32px 40px', maxWidth: 780 }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: BRAND.ink, margin: 0 }}>Notifications push</h1>
        <p style={{ fontSize: 14, color: BRAND.grey, margin: '6px 0 0' }}>
          Envoie immédiat ou programmé vers tous les utilisateurs ou un club spécifique.
        </p>
      </header>

      {/* ── Envoi immédiat ──────────────────────────────────── */}
      <Section title="Envoyer maintenant">
        <form onSubmit={(e) => { e.preventDefault(); setNowResult(null); sendMut.mutate(); }}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TargetField orgs={activeOrgs} value={nowOrgId} onChange={setNowOrgId} />
          <TitleField value={nowTitle} onChange={setNowTitle} />
          <BodyField  value={nowBody}  onChange={setNowBody} />
          {nowTitle.trim() && <Preview title={nowTitle} body={nowBody} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="submit" disabled={sendMut.isPending || !nowTitle.trim()} style={primaryBtn}>
              {sendMut.isPending ? 'Envoi…' : nowOrgId ? 'Envoyer au club' : 'Envoyer à tous'}
            </button>
            {nowError && <span style={errText}>{nowError}</span>}
          </div>
        </form>
        {nowResult && (
          <div style={{ ...resultBox, marginTop: 16 }}>
            <b style={{ color: '#166534' }}>Envoyé ✓</b>
            <span style={{ marginLeft: 16, fontSize: 13, color: BRAND.inkSoft }}>
              {nowResult.recipients} appareils ciblés · {nowResult.sent} reçus · {nowResult.failed} échecs
            </span>
          </div>
        )}
      </Section>

      {/* ── Programmer pour plus tard ────────────────────────── */}
      <Section title="Programmer pour plus tard" style={{ marginTop: 20 }}>
        <form onSubmit={(e) => { e.preventDefault(); setSchOk(false); scheduleMut.mutate(); }}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TargetField orgs={activeOrgs} value={schOrgId} onChange={setSchOrgId} />
          <TitleField value={schTitle} onChange={setSchTitle} />
          <BodyField  value={schBody}  onChange={setSchBody} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>Date et heure d'envoi</span>
            <input
              type="datetime-local"
              value={schDate}
              onChange={(e) => setSchDate(e.target.value)}
              min={minDatetimeLocal()}
              required
              style={inputStyle}
            />
          </label>
          {schTitle.trim() && schDate && <Preview title={schTitle} body={schBody} scheduledAt={schDate} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="submit" disabled={scheduleMut.isPending || !schTitle.trim() || !schDate} style={primaryBtn}>
              {scheduleMut.isPending ? 'Enregistrement…' : 'Programmer l\'envoi'}
            </button>
            {schError && <span style={errText}>{schError}</span>}
            {schOk && <span style={{ fontSize: 13, color: '#059669' }}>Programmé ✓</span>}
          </div>
        </form>
      </Section>

      {/* ── Notifications en attente ─────────────────────────── */}
      {(pending.length > 0 || schedLoading) && (
        <Section title={`En attente d'envoi (${pending.length})`} style={{ marginTop: 20 }}>
          {schedLoading ? (
            <div style={{ fontSize: 13, color: BRAND.grey }}>Chargement…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pending.map((p) => (
                <PushRow key={p.id} push={p} onCancel={() => cancelMut.mutate(p.id)} cancelling={cancelMut.isPending} />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── Historique ───────────────────────────────────────── */}
      <Section title="Historique" style={{ marginTop: 20, opacity: history.length === 0 ? 0.5 : 1 }}>
        {history.length === 0 ? (
          <div style={{ fontSize: 13, color: BRAND.grey }}>Aucune notification envoyée pour l'instant.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.slice(0, 20).map((p) => <PushRow key={p.id} push={p} />)}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function Section({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 24, ...style }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: '0 0 18px' }}>{title}</h2>
      {children}
    </section>
  );
}

function TargetField({ orgs, value, onChange }: { orgs: OrgListItem[]; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>Destinataires</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">Tous les utilisateurs de l'app</option>
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}

function TitleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>Titre <span style={{ color: BRAND.grey, fontWeight: 400 }}>({value.length}/100)</span></span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Nouvelle offre disponible !" required maxLength={100} style={inputStyle} />
    </label>
  );
}

function BodyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>Message (optionnel) <span style={{ color: BRAND.grey, fontWeight: 400 }}>({value.length}/500)</span></span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder="Venez profiter de -20% ce soir !" rows={2} maxLength={500} style={{ ...inputStyle, resize: 'vertical' }} />
    </label>
  );
}

function Preview({ title, body, scheduledAt }: { title: string; body: string; scheduledAt?: string }) {
  return (
    <div style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: '12px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.grey, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Aperçu {scheduledAt ? `· Envoi le ${fmtDate(scheduledAt)}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: BRAND.orange, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>B</span>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.ink }}>{title}</div>
          {body.trim() && <div style={{ fontSize: 13, color: BRAND.inkSoft, marginTop: 2 }}>{body}</div>}
        </div>
      </div>
    </div>
  );
}

function PushRow({ push, onCancel, cancelling }: { push: ScheduledPush; onCancel?: () => void; cancelling?: boolean }) {
  const s = STATUS_LABEL[push.status] ?? { label: push.status, color: BRAND.grey };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: BRAND.bgSubtle, borderRadius: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.ink }}>{push.title}</div>
        {push.body && <div style={{ fontSize: 12, color: BRAND.inkSoft, marginTop: 1 }}>{push.body}</div>}
        <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 3 }}>
          {push.organization?.name ?? 'Tous les utilisateurs'} · {push.status === 'SENT' && push.sentAt ? `Envoyé le ${fmtDate(push.sentAt)} · ${push.sentCount} appareils` : fmtDate(push.scheduledAt)}
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
      {push.status === 'PENDING' && onCancel && (
        <button onClick={onCancel} disabled={cancelling} style={cancelBtnSmall}>Annuler</button>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: BRAND.inkSoft };

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${BRAND.border}`,
  fontSize: 14, color: BRAND.ink, background: '#fff', outline: 'none',
  width: '100%', fontFamily: 'inherit',
};

const primaryBtn: React.CSSProperties = {
  background: BRAND.orange, color: '#fff', border: 'none', borderRadius: 10,
  padding: '11px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
  fontFamily: 'inherit', whiteSpace: 'nowrap',
};

const cancelBtnSmall: React.CSSProperties = {
  background: '#fff', color: '#dc2626', border: '1px solid #fca5a5',
  borderRadius: 8, padding: '6px 12px', fontWeight: 600, fontSize: 12,
  cursor: 'pointer', fontFamily: 'inherit',
};

const resultBox: React.CSSProperties = {
  background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', fontSize: 14,
};

const errText: React.CSSProperties = { fontSize: 13, color: '#dc2626' };
