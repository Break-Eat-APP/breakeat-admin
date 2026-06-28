'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BRAND } from '@break-eat/brand';
import {
  apiListOrganizations,
  apiSendNotification,
  type OrgListItem,
  type SendNotificationResult,
} from '@/lib/api/backoffice-client';

export default function NotificationsPage() {
  const { data: orgs } = useQuery<OrgListItem[]>({
    queryKey: ['backoffice', 'organizations'],
    queryFn: apiListOrganizations,
  });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [orgId, setOrgId] = useState('');
  const [result, setResult] = useState<SendNotificationResult | null>(null);
  const [sendError, setSendError] = useState('');

  const sendMut = useMutation({
    mutationFn: () =>
      apiSendNotification({ title: title.trim(), body: body.trim() || undefined, orgId: orgId || undefined }),
    onSuccess: (data) => {
      setResult(data);
      setSendError('');
      setTitle('');
      setBody('');
      setOrgId('');
    },
    onError: (e) => {
      setSendError(e instanceof Error ? e.message : "Échec de l'envoi");
      setResult(null);
    },
  });

  const activeOrgs = orgs?.filter((o) => o.status === 'ACTIVE') ?? [];

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720 }}>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: BRAND.ink, margin: 0 }}>
          Notifications push
        </h1>
        <p style={{ fontSize: 14, color: BRAND.grey, margin: '6px 0 0' }}>
          Envoie un message push à tous les utilisateurs de l'app, ou uniquement aux membres
          d'un club.
        </p>
      </header>

      <section style={card}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setResult(null);
            sendMut.mutate();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          {/* Cible */}
          <Field label="Destinataires">
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Tous les utilisateurs de l'app</option>
              {activeOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>

          {/* Titre */}
          <Field label="Titre de la notification">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nouvelle offre disponible !"
              required
              maxLength={100}
              style={inputStyle}
            />
            <span style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
              {title.length}/100
            </span>
          </Field>

          {/* Message */}
          <Field label="Message (optionnel)">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Venez profiter de -20% sur tous les produits ce soir !"
              rows={3}
              maxLength={500}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <span style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
              {body.length}/500
            </span>
          </Field>

          {/* Aperçu */}
          {title.trim() && (
            <div style={previewBox}>
              <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.grey, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Aperçu
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: BRAND.orange, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>B</span>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.ink }}>{title.trim()}</div>
                  {body.trim() && (
                    <div style={{ fontSize: 13, color: BRAND.inkSoft, marginTop: 2 }}>{body.trim()}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
            <button type="submit" disabled={sendMut.isPending || !title.trim()} style={primaryBtn}>
              {sendMut.isPending ? 'Envoi…' : orgId ? 'Envoyer au club' : 'Envoyer à tous'}
            </button>
            {sendError && (
              <span style={{ fontSize: 13, color: '#dc2626' }}>{sendError}</span>
            )}
          </div>
        </form>
      </section>

      {/* Résultat du dernier envoi */}
      {result && (
        <section style={{ ...card, marginTop: 20, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#166534', marginBottom: 12 }}>
            Notification envoyée ✓
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <Stat label="Appareils ciblés" value={result.recipients} color={BRAND.ink} />
            <Stat label="Envoyés" value={result.sent} color="#059669" />
            <Stat label="Échecs" value={result.failed} color={result.failed > 0 ? '#dc2626' : BRAND.grey} />
          </div>
          {result.recipients === 0 && (
            <p style={{ fontSize: 13, color: BRAND.grey, marginTop: 10 }}>
              Aucun appareil enregistré pour cette cible — les utilisateurs doivent avoir ouvert
              l'app et accepté les notifications.
            </p>
          )}
        </section>
      )}

      {/* Historique (à venir) */}
      <section style={{ ...card, marginTop: 20, opacity: 0.6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.inkSoft, marginBottom: 6 }}>
          Historique des envois — à venir
        </div>
        <div style={{ fontSize: 13, color: BRAND.grey }}>
          L'historique des notifications envoyées sera affiché ici.
        </div>
      </section>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.inkSoft }}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 1 }}>{label}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${BRAND.border}`,
  borderRadius: 16,
  padding: 24,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: `1.5px solid ${BRAND.border}`,
  fontSize: 14,
  color: BRAND.ink,
  background: '#fff',
  outline: 'none',
  width: '100%',
  fontFamily: 'inherit',
};

const previewBox: React.CSSProperties = {
  background: BRAND.bgSubtle,
  border: `1px solid ${BRAND.border}`,
  borderRadius: 12,
  padding: '14px 16px',
};

const primaryBtn: React.CSSProperties = {
  background: BRAND.orange,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '11px 20px',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
