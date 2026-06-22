'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Bell } from 'lucide-react';
import { apiGetAppSettings, apiSetAppSetting, getOrgId } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// Config stockée en app-settings (clé app.notifications, scope ORGANIZATION).
// Le backend lit ces modèles à chaque transition de commande (C1).

const SETTING_KEY = 'app.notifications';

interface StatusTemplate {
  enabled: boolean;
  title: string;
  body: string;
}
interface NotificationConfig {
  statuses: Record<string, StatusTemplate>;
}

// Étapes de commande pertinentes côté client (alignées sur OrderStatus backend).
const STEPS: { status: string; label: string; defaultTitle: string; defaultBody: string }[] = [
  { status: 'ACCEPTED',  label: 'Commande acceptée',   defaultTitle: 'Commande acceptée ✅',   defaultBody: 'Ta commande {orderNumber} a été acceptée, on s’en occupe !' },
  { status: 'PREPARING', label: 'En préparation',      defaultTitle: 'En préparation 👨‍🍳',     defaultBody: 'Ta commande {orderNumber} est en cours de préparation.' },
  { status: 'READY',     label: 'Prête à récupérer',   defaultTitle: 'Ta commande est prête ! 🎉', defaultBody: 'La commande {orderNumber} t’attend au point de retrait.' },
  { status: 'CANCELLED', label: 'Annulée',             defaultTitle: 'Commande annulée',        defaultBody: 'Ta commande {orderNumber} a été annulée.' },
];

function emptyConfig(): NotificationConfig {
  const statuses: Record<string, StatusTemplate> = {};
  for (const s of STEPS) statuses[s.status] = { enabled: s.status === 'READY', title: s.defaultTitle, body: s.defaultBody };
  return { statuses };
}

export default function NotificationsPage() {
  const orgId = getOrgId();
  const [config, setConfig] = useState<NotificationConfig>(() => emptyConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    try {
      const all = await apiGetAppSettings({ scope: 'ORGANIZATION' });
      const found = (Array.isArray(all) ? all : []).find((s) => s.key === SETTING_KEY && s.scopeId === orgId);
      const base = emptyConfig();
      if (found?.value && typeof found.value === 'object') {
        const v = found.value as Partial<NotificationConfig>;
        for (const s of STEPS) {
          base.statuses[s.status] = { ...base.statuses[s.status], ...(v.statuses?.[s.status] ?? {}) };
        }
      }
      setConfig(base);
    } catch {
      /* config absente → défauts */
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  function patch(status: string, p: Partial<StatusTemplate>) {
    setConfig((c) => ({ statuses: { ...c.statuses, [status]: { ...c.statuses[status], ...p } } }));
  }

  async function handleSave() {
    if (!orgId) return;
    setSaving(true);
    setMsg('');
    try {
      await apiSetAppSetting({ key: SETTING_KEY, scope: 'ORGANIZATION', scopeId: orgId, value: config });
      setMsg('✓ Notifications enregistrées.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  if (!orgId) return <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>Aucune organisation sélectionnée.</div>;

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0, letterSpacing: -0.3 }}>Notifications</h1>
          <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: '6px 0 0', maxWidth: 620, lineHeight: 1.55 }}>
            Personnalise le push envoyé au client <strong>à chaque étape</strong> de sa commande. Variable disponible :{' '}
            <code style={{ background: BRAND.bgSubtle, padding: '1px 6px', borderRadius: 4 }}>{'{orderNumber}'}</code>.
          </p>
        </div>
        <button onClick={() => void handleSave()} disabled={saving || loading} style={primaryBtn(saving || loading)}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      {msg && <div style={{ fontSize: 13, margin: '10px 0 14px', color: msg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{msg}</div>}

      <div style={{ background: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, margin: '12px 0 20px', lineHeight: 1.5 }}>
        ⚠️ L&apos;envoi réel suppose que l&apos;app cliente a enregistré un jeton push (setup natif Expo en cours). La config ci-dessous est déjà active côté backend.
      </div>

      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>
          {STEPS.map((step) => {
            const t = config.statuses[step.status];
            return (
              <div key={step.status} style={{ background: BRAND.surface, borderRadius: BRAND.radius.card, padding: 20, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: t.enabled ? 14 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: BRAND.orangeTint, color: BRAND.orange, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Bell size={17} strokeWidth={2} />
                    </div>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: 0 }}>{step.label}</h2>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: BRAND.inkSoft }}>
                    <input type="checkbox" checked={t.enabled} onChange={(e) => patch(step.status, { enabled: e.target.checked })} />
                    {t.enabled ? 'Activée' : 'Désactivée'}
                  </label>
                </div>
                {t.enabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={miniLabel}>Titre</div>
                      <input value={t.title} onChange={(e) => patch(step.status, { title: e.target.value })} style={field} placeholder={step.defaultTitle} />
                    </div>
                    <div>
                      <div style={miniLabel}>Message</div>
                      <input value={t.body} onChange={(e) => patch(step.status, { body: e.target.value })} style={field} placeholder={step.defaultBody} />
                    </div>
                  </div>
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
  return { background: disabled ? BRAND.orangeSoft : BRAND.orange, color: '#fff', border: 'none', borderRadius: BRAND.radius.control, padding: '11px 22px', fontWeight: 600, fontSize: 14, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', boxShadow: disabled ? 'none' : BRAND.shadowButton };
}
