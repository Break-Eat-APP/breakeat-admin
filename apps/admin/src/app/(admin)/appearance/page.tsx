'use client';

import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import {
  Utensils, ShoppingBag, CalendarDays, MapPin, Info, Bell,
  Ticket, Beer, Coffee, Trophy, Music, Star, Plus, Trash2,
  type LucideIcon,
} from 'lucide-react';
import { apiGetAppSettings, apiSetAppSetting, apiGetSuppliers, type Supplier, getOrgId } from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Modèle ──────────────────────────────────────────────────────────────────────
// Config « Apparence de l'app » — pilote l'écran d'accueil de l'app client.
// Stockée en app-settings (clé app.appearance.home, scope ORGANIZATION).

const SETTING_KEY = 'app.appearance.home';

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, bag: ShoppingBag, calendar: CalendarDays, map: MapPin,
  info: Info, bell: Bell, ticket: Ticket, beer: Beer, coffee: Coffee,
  trophy: Trophy, music: Music, star: Star,
};
const ICON_KEYS = Object.keys(ICONS);

type CardActionType = 'none' | 'supplier' | 'orders' | 'scan' | 'url' | 'page';

interface AppCard {
  id: string;
  title: string;
  icon: string;        // clé ICONS, ou '' = carte texte seul
  iconColor?: string;  // surcharge par carte (vide = global)
  imageUrl?: string;   // si renseignée, l'image remplace l'icône
  textColor?: string;  // surcharge par carte (vide = global)
  // Ce que la carte ouvre quand on la tape (rendu par l'app cliente).
  action?: { type: CardActionType; supplierId?: string; url?: string; pageId?: string };
}

// Page secondaire navigable (ex. « Bien-être », « Événements collectifs »).
// Atteinte via une carte d'accueil dont l'action = page.
interface AppPage {
  id: string;
  name: string;       // titre affiché en haut de la page + libellé de navigation
  cards: AppCard[];
}

const ACTION_LABELS: Record<CardActionType, string> = {
  none: 'Aucune action',
  supplier: 'Ouvrir une buvette',
  orders: 'Mes commandes',
  scan: 'Scanner mon billet',
  url: 'Lien externe (Instagram, YouTube…)',
  page: 'Ouvrir une page de l’app',
};

interface HomeAppearance {
  preset: string;
  // Si vrai : l'interface du lieu est désactivée côté app → Flaix prend le dessus
  // (plan du lieu + choix d'emplacement, à venir avec l'intégration Flaix).
  flaixTakeover: boolean;
  // En-tête (logo centré + titre MAJUSCULE + sous-titre minuscule)
  header: {
    showLogo: boolean;
    title: string;
    subtitle: string;
    titleColor: string;
    subtitleColor: string;
  };
  theme: {
    primaryColor: string;
    textColor: string;
    iconColor: string;
    background: string;
    columns: 1 | 2;
    cardSize: 'sm' | 'md' | 'lg';
  };
  cards: AppCard[];
  // Pages secondaires (illimité) — chacune avec sa propre grille de cartes.
  pages: AppPage[];
}

const uid = () => Math.random().toString(36).slice(2, 9);

// ─── Presets (points de départ — affinables) ─────────────────────────────────────

const GOLD = '#e0a82e';

const PRESETS: Record<string, () => HomeAppearance> = {
  // STADE — cartes texte seul (ex. tribunes), titre orange, texte doré (cf. maquette Le Mans FC).
  stadium: () => ({
    preset: 'stadium',
    flaixTakeover: false,
    header: {
      showLogo: true,
      title: 'LA BUVETTE EN LIGNE SANS FILE D’ATTENTE',
      subtitle: 'Ta commande prête à l’heure que tu veux',
      titleColor: BRAND.orange,
      subtitleColor: '#2d2926',
    },
    theme: { primaryColor: BRAND.orange, textColor: GOLD, iconColor: BRAND.orange, background: '#ffffff', columns: 2, cardSize: 'lg' },
    cards: [
      { id: uid(), title: 'TRIBUNE NORD', icon: '', action: { type: 'supplier' } },
      { id: uid(), title: 'TRIBUNE SUD', icon: '', action: { type: 'supplier' } },
      { id: uid(), title: 'TRIBUNE EST', icon: '', action: { type: 'supplier' } },
      { id: uid(), title: 'TRIBUNE OUEST', icon: '', action: { type: 'supplier' } },
    ],
    pages: [],
  }),
  // RESTAURATION ENTREPRISE — cartes avec photo + texte (cf. maquette BoursoBank/Basilic).
  corporate: () => ({
    preset: 'corporate',
    flaixTakeover: false,
    header: {
      showLogo: true,
      title: 'NOS SERVICES',
      subtitle: 'Savourez chaque saison',
      titleColor: '#1f4e46',
      subtitleColor: '#b08d2e',
    },
    theme: { primaryColor: '#1f7a5c', textColor: '#ffffff', iconColor: '#b08d2e', background: '#ffffff', columns: 2, cardSize: 'lg' },
    cards: [
      { id: uid(), title: 'Restaurant', icon: 'utensils' },
      { id: uid(), title: 'Mon badge', icon: 'ticket' },
      { id: uid(), title: 'Bien-être', icon: 'star' },
      { id: uid(), title: 'Événements', icon: 'calendar' },
    ],
    pages: [],
  }),
  // FESTIVAL / CONCERT — cartes icône, accent violet.
  festival: () => ({
    preset: 'festival',
    flaixTakeover: false,
    header: {
      showLogo: true,
      title: 'LE FESTIVAL EN LIGNE',
      subtitle: 'Ta commande prête à l’heure que tu veux',
      titleColor: '#7c3aed',
      subtitleColor: '#2d2926',
    },
    theme: { primaryColor: '#7c3aed', textColor: '#2d2926', iconColor: '#7c3aed', background: '#faf7ff', columns: 2, cardSize: 'md' },
    cards: [
      { id: uid(), title: 'Programme', icon: 'music' },
      { id: uid(), title: 'La carte', icon: 'utensils' },
      { id: uid(), title: 'Mes commandes', icon: 'bag' },
      { id: uid(), title: 'Plan du site', icon: 'map' },
    ],
    pages: [],
  }),
};

// ─── Page ─────────────────────────────────────────────────────────────────────────

export default function AppearancePage() {
  const orgId = getOrgId();
  const [appearance, setAppearance] = useState<HomeAppearance>(() => PRESETS.stadium());
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  // Aperçu : null = accueil, sinon id de la page secondaire affichée.
  const [previewPageId, setPreviewPageId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [all, sups] = await Promise.all([
        apiGetAppSettings({ scope: 'ORGANIZATION' }),
        apiGetSuppliers(orgId),
      ]);
      setSuppliers(Array.isArray(sups) ? sups : []);
      const found = (Array.isArray(all) ? all : []).find(
        (s) => s.key === SETTING_KEY && s.scopeId === orgId,
      );
      if (found && found.value && typeof found.value === 'object') {
        // Normalisation : on garantit que tous les champs existent (compat configs anciennes).
        const v = found.value as Partial<HomeAppearance>;
        const base = PRESETS.stadium();
        setAppearance({
          preset: v.preset ?? 'custom',
          flaixTakeover: v.flaixTakeover ?? false,
          header: { ...base.header, ...(v.header ?? {}) },
          theme: { ...base.theme, ...(v.theme ?? {}) },
          cards: Array.isArray(v.cards) && v.cards.length > 0 ? v.cards : base.cards,
          pages: Array.isArray(v.pages) ? v.pages : [],
        });
      }
    } catch {
      /* config absente → on garde le preset par défaut */
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  function patchTheme(p: Partial<HomeAppearance['theme']>) {
    setAppearance((a) => ({ ...a, theme: { ...a.theme, ...p }, preset: 'custom' }));
  }
  function patchHeader(p: Partial<HomeAppearance['header']>) {
    setAppearance((a) => ({ ...a, header: { ...a.header, ...p }, preset: 'custom' }));
  }
  // Met à jour le tableau de cartes ciblé : la home (pageId=null) ou une page.
  function updateCards(pageId: string | null, fn: (cards: AppCard[]) => AppCard[]) {
    setAppearance((a) => {
      if (pageId === null) return { ...a, cards: fn(a.cards), preset: 'custom' };
      return { ...a, pages: a.pages.map((pg) => (pg.id === pageId ? { ...pg, cards: fn(pg.cards) } : pg)), preset: 'custom' };
    });
  }
  function patchCard(pageId: string | null, id: string, p: Partial<AppCard>) {
    updateCards(pageId, (cards) => cards.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }
  function addCard(pageId: string | null) {
    updateCards(pageId, (cards) => [...cards, { id: uid(), title: '', icon: 'star' }]);
  }
  function removeCard(pageId: string | null, id: string) {
    updateCards(pageId, (cards) => cards.filter((c) => c.id !== id));
  }
  function moveCard(pageId: string | null, id: string, dir: -1 | 1) {
    updateCards(pageId, (cards) => {
      const idx = cards.findIndex((c) => c.id === id);
      if (idx < 0) return cards;
      const next = idx + dir;
      if (next < 0 || next >= cards.length) return cards;
      const copy = [...cards];
      [copy[idx], copy[next]] = [copy[next]!, copy[idx]!];
      return copy;
    });
  }
  function patchFlaix(v: boolean) {
    setAppearance((a) => ({ ...a, flaixTakeover: v, preset: 'custom' }));
  }
  // ─── Pages secondaires ───
  function addPage() {
    setAppearance((a) => ({ ...a, pages: [...a.pages, { id: uid(), name: 'Nouvelle page', cards: [] }], preset: 'custom' }));
  }
  function removePage(pageId: string) {
    setAppearance((a) => ({
      ...a,
      // On retire la page ET on nettoie les actions des cartes qui pointaient dessus.
      pages: a.pages.filter((pg) => pg.id !== pageId),
      cards: a.cards.map((c) => (c.action?.type === 'page' && c.action.pageId === pageId ? { ...c, action: { type: 'none' } } : c)),
      preset: 'custom',
    }));
  }
  function renamePage(pageId: string, name: string) {
    setAppearance((a) => ({ ...a, pages: a.pages.map((pg) => (pg.id === pageId ? { ...pg, name } : pg)), preset: 'custom' }));
  }
  function applyPreset(name: string) {
    const p = PRESETS[name];
    if (p) setAppearance(p());
  }

  async function handleSave() {
    if (!orgId) return;
    setSaving(true);
    setMsg('');
    try {
      await apiSetAppSetting({ key: SETTING_KEY, scope: 'ORGANIZATION', scopeId: orgId, value: appearance });
      setMsg('✓ Apparence enregistrée. (Le rendu dans l’app mobile arrive dans le prochain bloc.)');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  if (!orgId) {
    return <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>Aucune organisation sélectionnée.</div>;
  }

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: 0, letterSpacing: -0.3 }}>Apparence de l&apos;app</h1>
          <p style={{ color: BRAND.inkSoft, fontSize: 13.5, margin: '6px 0 0', maxWidth: 560, lineHeight: 1.55 }}>
            Compose l&apos;écran d&apos;accueil de ton app client : cartes (icône ou image), couleurs, taille,
            disposition. Pars d&apos;un modèle, puis personnalise. L&apos;aperçu est en temps réel.
          </p>
        </div>
        <button onClick={() => void handleSave()} disabled={saving || loading} style={primaryBtn(saving || loading)}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      {msg && <div style={{ fontSize: 13, marginBottom: 14, color: msg.startsWith('✓') ? '#16a34a' : '#dc2626' }}>{msg}</div>}

      {loading ? (
        <div style={{ color: BRAND.grey, fontSize: 14, marginTop: 24 }}>Chargement…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 28, alignItems: 'start', marginTop: 18 }}>
          {/* ─── Contrôles ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {/* Modèles */}
            <Card title="Modèle de départ">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.keys(PRESETS).map((name) => (
                  <button
                    key={name}
                    onClick={() => applyPreset(name)}
                    style={{
                      padding: '8px 16px', borderRadius: 999,
                      border: `1.5px solid ${appearance.preset === name ? BRAND.orange : BRAND.border}`,
                      background: appearance.preset === name ? BRAND.orangeTint : BRAND.surface,
                      color: appearance.preset === name ? BRAND.orange : BRAND.inkSoft,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                    }}
                  >
                    {name === 'corporate' ? 'Restauration entreprise' : name === 'festival' ? 'Festival / Concert' : 'Stade'}
                  </button>
                ))}
                {appearance.preset === 'custom' && <span style={{ alignSelf: 'center', fontSize: 12.5, color: BRAND.grey }}>· personnalisé</span>}
              </div>
            </Card>

            {/* Intégration Flaix */}
            <Card title="Intégration Flaix">
              <Toggle
                value={appearance.flaixTakeover}
                onChange={patchFlaix}
                label="Désactiver l'interface standard — Flaix prend le dessus"
                description="Lorsqu'activé, l'app masque l'interface de commande et affiche le plan du lieu via Flaix. Le client choisit son emplacement, puis Flaix gère la suite. Requiert l'intégration Flaix (à venir — Phase 11.5)."
              />
            </Card>

            {/* En-tête */}
            <Card title="En-tête (logo + titres)">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13.5, color: BRAND.inkSoft, cursor: 'pointer' }}>
                <input type="checkbox" checked={appearance.header.showLogo} onChange={(e) => patchHeader({ showLogo: e.target.checked })} />
                Logo du club (centré en haut)
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={miniLabel}>Titre — affiché en MAJUSCULES</div>
                  <input value={appearance.header.title} onChange={(e) => patchHeader({ title: e.target.value })} placeholder="LA BUVETTE EN LIGNE…" style={{ ...field, marginTop: 4, textTransform: 'uppercase' }} />
                </div>
                <div>
                  <div style={miniLabel}>Sous-titre — minuscule</div>
                  <input value={appearance.header.subtitle} onChange={(e) => patchHeader({ subtitle: e.target.value })} placeholder="Ta commande prête à l’heure que tu veux" style={{ ...field, marginTop: 4 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <ColorField label="Couleur du titre" value={appearance.header.titleColor} onChange={(v) => patchHeader({ titleColor: v })} />
                  <ColorField label="Couleur du sous-titre" value={appearance.header.subtitleColor} onChange={(v) => patchHeader({ subtitleColor: v })} />
                </div>
              </div>
            </Card>

            {/* Thème global */}
            <Card title="Style global">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <ColorField label="Couleur principale" value={appearance.theme.primaryColor} onChange={(v) => patchTheme({ primaryColor: v })} />
                <ColorField label="Couleur du texte" value={appearance.theme.textColor} onChange={(v) => patchTheme({ textColor: v })} />
                <ColorField label="Couleur des icônes" value={appearance.theme.iconColor} onChange={(v) => patchTheme({ iconColor: v })} />
                <ColorField label="Fond d'écran" value={appearance.theme.background} onChange={(v) => patchTheme({ background: v })} />
              </div>
              <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={miniLabel}>Colonnes</div>
                  <Segmented options={[['1', '1'], ['2', '2']]} value={String(appearance.theme.columns)} onChange={(v) => patchTheme({ columns: Number(v) as 1 | 2 })} />
                </div>
                <div>
                  <div style={miniLabel}>Taille des cartes</div>
                  <Segmented options={[['sm', 'Petite'], ['md', 'Moyenne'], ['lg', 'Grande']]} value={appearance.theme.cardSize} onChange={(v) => patchTheme({ cardSize: v as 'sm' | 'md' | 'lg' })} />
                </div>
              </div>
            </Card>

            {/* Cartes (accueil) */}
            <Card title={`Cartes — accueil (${appearance.cards.length})`} action={<button onClick={() => addCard(null)} style={ghostBtn}><Plus size={14} strokeWidth={2.4} /> Ajouter</button>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {appearance.cards.map((c, i) => (
                  <CardEditor
                    key={c.id} card={c} index={i} total={appearance.cards.length}
                    theme={appearance.theme} suppliers={suppliers} pages={appearance.pages}
                    onPatch={(p) => patchCard(null, c.id, p)}
                    onRemove={() => removeCard(null, c.id)}
                    onMove={(d) => moveCard(null, c.id, d)}
                  />
                ))}
                {appearance.cards.length === 0 && <div style={{ fontSize: 13, color: BRAND.grey }}>Aucune carte. Ajoutez-en une.</div>}
              </div>
            </Card>

            {/* Pages secondaires */}
            <Card title={`Pages secondaires (${appearance.pages.length})`} action={<button onClick={addPage} style={ghostBtn}><Plus size={14} strokeWidth={2.4} /> Nouvelle page</button>}>
              <p style={{ fontSize: 12.5, color: BRAND.inkSoft, margin: '0 0 12px', lineHeight: 1.55 }}>
                Crée autant de pages que tu veux (Bien-être, Événements, Partenaires…). Pour y accéder, mets une carte d&apos;accueil
                en action <strong>« Ouvrir une page »</strong>. Chaque carte d&apos;une page peut aussi pointer vers un lien externe (Instagram, YouTube…).
              </p>
              {appearance.pages.length === 0 ? (
                <div style={{ fontSize: 13, color: BRAND.grey }}>Aucune page secondaire.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {appearance.pages.map((pg) => (
                    <div key={pg.id} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 16 }}>📄</span>
                        <input value={pg.name} onChange={(e) => renamePage(pg.id, e.target.value)} placeholder="Nom de la page" style={{ ...field, flex: 1, fontWeight: 600 }} />
                        <button onClick={() => addCard(pg.id)} style={ghostBtn}><Plus size={13} strokeWidth={2.4} /> Carte</button>
                        <button onClick={() => removePage(pg.id)} title="Supprimer la page" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.surface, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#dc2626', display: 'inline-flex' }}>
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {pg.cards.map((c, i) => (
                          <CardEditor
                            key={c.id} card={c} index={i} total={pg.cards.length}
                            theme={appearance.theme} suppliers={suppliers} pages={appearance.pages}
                            onPatch={(p) => patchCard(pg.id, c.id, p)}
                            onRemove={() => removeCard(pg.id, c.id)}
                            onMove={(d) => moveCard(pg.id, c.id, d)}
                          />
                        ))}
                        {pg.cards.length === 0 && <div style={{ fontSize: 12.5, color: BRAND.grey }}>Page vide — ajoute une carte.</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ─── Aperçu live (maquette téléphone) ─── */}
          <div style={{ position: 'sticky', top: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.grey, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>Aperçu en direct</div>
            <PhonePreview appearance={appearance} previewPageId={previewPageId} onSelectPage={setPreviewPageId} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aperçu téléphone ─────────────────────────────────────────────────────────────

function PhonePreview({ appearance, previewPageId, onSelectPage }: {
  appearance: HomeAppearance;
  previewPageId: string | null;
  onSelectPage: (id: string | null) => void;
}) {
  const { theme, header, pages } = appearance;
  const pad = theme.cardSize === 'lg' ? 22 : theme.cardSize === 'sm' ? 12 : 17;
  const iconSize = theme.cardSize === 'lg' ? 34 : theme.cardSize === 'sm' ? 22 : 28;
  const titleSize = theme.cardSize === 'lg' ? 15 : theme.cardSize === 'sm' ? 12 : 13.5;
  const minH = theme.cardSize === 'lg' ? 120 : theme.cardSize === 'sm' ? 70 : 92;

  const activePage = previewPageId ? pages.find((p) => p.id === previewPageId) ?? null : null;
  const cards = activePage ? activePage.cards : appearance.cards;

  return (
    <div>
      {/* Sélecteur d'écran d'aperçu */}
      {pages.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <button onClick={() => onSelectPage(null)} style={previewTab(!previewPageId)}>Accueil</button>
          {pages.map((p) => (
            <button key={p.id} onClick={() => onSelectPage(p.id)} style={previewTab(previewPageId === p.id)}>{p.name || 'Page'}</button>
          ))}
        </div>
      )}

      <div style={{ width: 360, borderRadius: 36, border: `10px solid #1c1917`, background: '#1c1917', boxShadow: BRAND.shadowSoft, overflow: 'hidden' }}>
        <div style={{ background: theme.background, minHeight: 600, display: 'flex', flexDirection: 'column' }}>
          {/* En-tête */}
          <div style={{ padding: '30px 24px 14px', textAlign: 'center' }}>
            {activePage ? (
              <>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.primaryColor, textAlign: 'left', marginBottom: 12 }}>‹ Accueil</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: header.titleColor, textTransform: 'uppercase', letterSpacing: 0.2 }}>{activePage.name}</div>
              </>
            ) : (
              <>
                {header.showLogo && (
                  <div style={{ width: 60, height: 60, margin: '0 auto 16px', borderRadius: 16, background: theme.primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 28, fontFamily: 'Georgia, serif' }}>
                    B
                  </div>
                )}
                {!!header.title && (
                  <div style={{ fontSize: 17, fontWeight: 800, color: header.titleColor, textTransform: 'uppercase', lineHeight: 1.22, letterSpacing: 0.2 }}>{header.title}</div>
                )}
                {!!header.subtitle && (
                  <div style={{ fontSize: 12.5, fontWeight: 400, color: header.subtitleColor, marginTop: 10, fontFamily: 'var(--font-jost), "Jost", sans-serif', lineHeight: 1.5 }}>{header.subtitle}</div>
                )}
              </>
            )}
          </div>

          {/* Grille de cartes */}
          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: `repeat(${theme.columns}, 1fr)`, gap: 14 }}>
            {cards.map((c) => {
              const hasImage = !!c.imageUrl;
              const Ico = c.icon ? ICONS[c.icon] : undefined;
              const iconColor = c.iconColor || theme.iconColor;
              const textColor = c.textColor || theme.textColor;
              return (
                <div key={c.id} style={{ background: '#fff', borderRadius: 16, padding: hasImage ? 0 : pad, boxShadow: '0 1px 2px rgba(28,25,23,0.05), 0 6px 18px rgba(28,25,23,0.10)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: Ico ? 10 : 0, minHeight: minH, justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
                  {hasImage ? (
                    <>
                      <img src={c.imageUrl} alt={c.title} style={{ width: '100%', height: minH, objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                        <div style={{ fontSize: titleSize, fontWeight: 800, color: c.textColor || '#fff', textAlign: 'center', textShadow: '0 1px 6px rgba(0,0,0,0.55)' }}>{c.title}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      {Ico && <Ico size={iconSize} strokeWidth={1.7} color={iconColor} />}
                      {!!c.title && <div style={{ fontSize: Ico ? titleSize : titleSize + 1, fontWeight: 800, color: textColor, textAlign: 'center', lineHeight: 1.2 }}>{c.title}</div>}
                      {/* Indicateur visuel du type d'action (aperçu éditeur) */}
                      {c.action?.type === 'url' && <div style={{ fontSize: 9, color: BRAND.grey, marginTop: 2 }}>↗ lien externe</div>}
                      {c.action?.type === 'page' && <div style={{ fontSize: 9, color: BRAND.grey, marginTop: 2 }}>→ page</div>}
                    </>
                  )}
                </div>
              );
            })}
            {cards.length === 0 && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: BRAND.grey, fontSize: 12, padding: 20 }}>Page vide</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function previewTab(active: boolean): CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${active ? BRAND.orange : BRAND.border}`,
    background: active ? BRAND.orangeTint : BRAND.surface,
    color: active ? BRAND.orange : BRAND.inkSoft,
  };
}

// ─── Éditeur d'une carte (réutilisé : accueil + pages secondaires) ────────────────

function CardEditor({ card: c, index: i, total, theme, suppliers, pages, onPatch, onRemove, onMove }: {
  card: AppCard;
  index: number;
  total: number;
  theme: HomeAppearance['theme'];
  suppliers: Supplier[];
  pages: AppPage[];
  onPatch: (p: Partial<AppCard>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, background: BRAND.bgSubtle }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
          <button onClick={() => onMove(-1)} disabled={i === 0} title="Monter" style={arrowBtn(i === 0)}>▲</button>
          <button onClick={() => onMove(1)} disabled={i === total - 1} title="Descendre" style={arrowBtn(i === total - 1)}>▼</button>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: BRAND.grey, flexShrink: 0 }}>#{i + 1}</span>
        <input value={c.title} onChange={(e) => onPatch({ title: e.target.value })} placeholder="Titre (optionnel)" style={{ ...field, flex: 1 }} />
        <button onClick={onRemove} title="Supprimer" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.surface, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: '#dc2626', display: 'inline-flex', flexShrink: 0 }}>
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>
      <div style={miniLabel}>Visuel — texte seul, icône, ou image</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 10px' }}>
        <button onClick={() => onPatch({ icon: '', imageUrl: '' })} title="Texte seul"
          style={{ height: 34, padding: '0 10px', borderRadius: 9, border: `1.5px solid ${!c.icon && !c.imageUrl ? BRAND.orange : BRAND.border}`, background: !c.icon && !c.imageUrl ? BRAND.orangeTint : BRAND.surface, color: !c.icon && !c.imageUrl ? BRAND.orange : BRAND.inkSoft, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Texte
        </button>
        {ICON_KEYS.map((k) => {
          const Ico = ICONS[k];
          const active = c.icon === k && !c.imageUrl;
          return (
            <button key={k} onClick={() => onPatch({ icon: k, imageUrl: '' })} title={k}
              style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${active ? BRAND.orange : BRAND.border}`, background: active ? BRAND.orangeTint : BRAND.surface, color: active ? BRAND.orange : BRAND.inkSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Ico size={17} strokeWidth={1.9} />
            </button>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={miniLabel}>Image (URL) — l&apos;upload arrive bientôt</div>
          <input value={c.imageUrl ?? ''} onChange={(e) => onPatch({ imageUrl: e.target.value })} placeholder="https://…/photo.jpg" style={field} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <ColorField label="Texte (carte)" value={c.textColor ?? theme.textColor} onChange={(v) => onPatch({ textColor: v })} small />
          <ColorField label="Icône (carte)" value={c.iconColor ?? theme.iconColor} onChange={(v) => onPatch({ iconColor: v })} small />
        </div>
      </div>
      {/* Action au clic */}
      <div style={{ marginTop: 10 }}>
        <div style={miniLabel}>Action au clic (côté app)</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <select
            value={c.action?.type ?? 'none'}
            onChange={(e) => onPatch({ action: { ...(c.action ?? {}), type: e.target.value as CardActionType } })}
            style={{ ...field, width: 'auto', minWidth: 170, cursor: 'pointer' }}
          >
            {(Object.keys(ACTION_LABELS) as CardActionType[]).map((t) => (
              <option key={t} value={t}>{ACTION_LABELS[t]}</option>
            ))}
          </select>
          {c.action?.type === 'supplier' && (
            <select
              value={c.action?.supplierId ?? ''}
              onChange={(e) => onPatch({ action: { type: 'supplier', supplierId: e.target.value } })}
              style={{ ...field, width: 'auto', minWidth: 170, cursor: 'pointer' }}
            >
              <option value="">— Choisir une buvette —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {c.action?.type === 'page' && (
            <select
              value={c.action?.pageId ?? ''}
              onChange={(e) => onPatch({ action: { type: 'page', pageId: e.target.value } })}
              style={{ ...field, width: 'auto', minWidth: 170, cursor: 'pointer' }}
            >
              <option value="">— Choisir une page —</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name || 'Page'}</option>)}
            </select>
          )}
          {c.action?.type === 'url' && (
            <input
              value={c.action?.url ?? ''}
              onChange={(e) => onPatch({ action: { type: 'url', url: e.target.value } })}
              placeholder="https://instagram.com/…"
              style={{ ...field, flex: 1, minWidth: 180 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Petits composants ────────────────────────────────────────────────────────────

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: BRAND.surface, borderRadius: BRAND.radius.card, padding: 22, boxShadow: BRAND.shadowCard, border: `1px solid ${BRAND.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: BRAND.ink, margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange, small }: { label: string; value: string; onChange: (v: string) => void; small?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={miniLabel}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} style={{ width: 34, height: 30, border: `1px solid ${BRAND.border}`, borderRadius: 8, background: '#fff', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
        {!small && <input value={value} onChange={(e) => onChange(e.target.value)} style={{ ...field, fontFamily: 'monospace', fontSize: 12 }} />}
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: 'hidden', marginTop: 4 }}>
      {options.map(([val, lbl]) => {
        const active = value === val;
        return (
          <button key={val} onClick={() => onChange(val)} style={{ padding: '7px 14px', border: 'none', background: active ? BRAND.orange : BRAND.surface, color: active ? '#fff' : BRAND.inkSoft, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{lbl}</button>
        );
      })}
    </div>
  );
}

const miniLabel: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: BRAND.grey, textTransform: 'uppercase', letterSpacing: 0.4 };
const field: CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 9, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' };
const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: BRAND.inkSoft, cursor: 'pointer', fontFamily: 'inherit' };
function primaryBtn(disabled: boolean): CSSProperties {
  return { background: disabled ? BRAND.orangeSoft : BRAND.orange, color: '#fff', border: 'none', borderRadius: BRAND.radius.control, padding: '11px 22px', fontWeight: 600, fontSize: 14, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', boxShadow: disabled ? 'none' : BRAND.shadowButton };
}
function arrowBtn(disabled: boolean): CSSProperties {
  return { display: 'block', padding: '1px 5px', fontSize: 9, lineHeight: 1, border: `1px solid ${BRAND.border}`, borderRadius: 4, background: disabled ? BRAND.bg : BRAND.surface, color: disabled ? BRAND.grey : BRAND.inkSoft, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit' };
}

// ─── Toggle component ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange, label, description }: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer' }} onClick={() => onChange(!value)}>
      {/* Pill visuel */}
      <div style={{
        width: 44, height: 24, borderRadius: 12, flexShrink: 0, marginTop: 2,
        background: value ? BRAND.orange : BRAND.border,
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.18s',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 9, background: '#fff',
          position: 'absolute', top: 3, left: value ? 23 : 3,
          transition: 'left 0.18s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
        }} />
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: BRAND.ink, userSelect: 'none' }}>{label}</div>
        {description && (
          <div style={{ fontSize: 12.5, color: BRAND.inkSoft, marginTop: 4, lineHeight: 1.55, maxWidth: 520, userSelect: 'none' }}>{description}</div>
        )}
      </div>
    </div>
  );
}
