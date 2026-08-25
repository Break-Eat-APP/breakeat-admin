'use client';

import { useCallback, useEffect, useState } from 'react';
import { BRAND } from '@/lib/brand';
import {
  apiGetSlotTemplates,
  apiCreateSlotTemplate,
  apiUpdateSlotTemplate,
  apiDeleteSlotTemplate,
  apiGetSuppliers,
  minutesVersHeure,
  heureVersMinutes,
  type SlotTemplate,
  type SlotKindValue,
  type Supplier,
} from '@/lib/api/admin-client';

/**
 * Les moments de récupération, nommés côté métier.
 *
 * `kind` n'est pas décoratif : les écrans opérateur configurables ciblent ce
 * rôle plutôt qu'un identifiant de créneau — lequel change chaque jour, puisque
 * le créneau est régénéré. Choisir « À la mi-temps » ici, c'est ce qui permet à
 * un écran de rester juste demain.
 */
const MOMENTS: { value: SlotKindValue; label: string }[] = [
  { value: 'IMMEDIATE', label: 'Immédiat' },
  { value: 'PAUSE_1', label: 'Mi-temps' },
  { value: 'PAUSE_2', label: 'Deuxième pause' },
  { value: 'CUSTOM', label: 'Heure précise' },
];

/**
 * Configuration des créneaux de récupération d'un lieu.
 *
 * Décrits UNE fois, rejoués chaque jour : le créneau du jour est créé par le
 * serveur à la première visite d'un client. Rien à ressaisir le matin.
 *
 * Rattachés à une buvette : deux comptoirs d'un même lieu peuvent servir à des
 * heures différentes.
 */
export function SlotTemplatesPanel({ orgId, venueId }: { orgId: string; venueId: string }) {
  const [templates, setTemplates] = useState<SlotTemplate[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Formulaire d'ajout
  const [supplierId, setSupplierId] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<SlotKindValue>('CUSTOM');
  const [debut, setDebut] = useState('17:45');
  const [fin, setFin] = useState('18:00');
  const [capacite, setCapacite] = useState('20');
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [tpl, sup] = await Promise.all([apiGetSlotTemplates(venueId), apiGetSuppliers(orgId)]);
      setTemplates(Array.isArray(tpl) ? tpl : []);
      const liste = Array.isArray(sup) ? sup : [];
      setSuppliers(liste);
      if (!supplierId && liste[0]) setSupplierId(liste[0].id);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      setChargement(false);
    }
    // `supplierId` volontairement hors dépendances : il n'est initialisé qu'une
    // fois, et l'inclure relancerait le chargement à chaque choix de buvette.
  }, [venueId, orgId]);

  useEffect(() => { void charger(); }, [charger]);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    const d = heureVersMinutes(debut);
    const f = heureVersMinutes(fin);
    if (d === null || f === null) {
      setErreur('Horaires attendus au format 17:45.');
      return;
    }
    if (f <= d) {
      setErreur('La fin du créneau doit suivre son début.');
      return;
    }
    if (!supplierId) {
      setErreur('Choisissez la buvette concernée.');
      return;
    }
    setAjoutEnCours(true);
    setErreur('');
    try {
      await apiCreateSlotTemplate(venueId, {
        supplierId,
        label: label.trim() || minutesVersHeure(d),
        kind,
        startMinutes: d,
        endMinutes: f,
        capacity: Math.max(1, Number(capacite) || 20),
      });
      setLabel('');
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Création refusée');
    } finally {
      setAjoutEnCours(false);
    }
  }

  async function basculerActif(t: SlotTemplate) {
    setBusyId(t.id);
    try {
      await apiUpdateSlotTemplate(venueId, t.id, { isActive: !t.isActive });
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Modification refusée');
    } finally {
      setBusyId(null);
    }
  }

  async function supprimer(t: SlotTemplate) {
    const question =
      `Supprimer le créneau « ${t.label} » ?\n\n` +
      'Les créneaux déjà créés les jours précédents sont conservés — ils portent ' +
      'peut-être des commandes. Seule la génération future s’arrête.\n\n' +
      'Pour une pause temporaire, désactivez-le plutôt.';
    if (!confirm(question)) return;
    setBusyId(t.id);
    try {
      await apiDeleteSlotTemplate(venueId, t.id);
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Suppression refusée');
    } finally {
      setBusyId(null);
    }
  }

  // Regroupés par buvette : c'est ainsi qu'on les pense sur le terrain.
  const parBuvette = suppliers
    .map((s) => ({ supplier: s, items: templates.filter((t) => t.supplierId === s.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <p style={{ fontSize: 13.5, color: BRAND.grey, lineHeight: 1.7, margin: '0 0 18px' }}>
        Décrivez vos heures de retrait <strong>une seule fois</strong> : elles se rejouent chaque
        jour, sans rien ressaisir. Vos équipiers ouvrent ou ferment chaque créneau depuis leur
        poste, selon la file du moment.
      </p>

      {erreur && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', color: '#b91c1c', fontSize: 13, marginBottom: 16 }}>
          {erreur}
        </div>
      )}

      {chargement && <div style={{ color: BRAND.grey, fontSize: 13 }}>Chargement…</div>}

      {!chargement && suppliers.length === 0 && (
        <div style={{ color: BRAND.grey, fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
          Créez d’abord une buvette : un créneau de retrait appartient toujours à un comptoir.
        </div>
      )}

      {parBuvette.map(({ supplier, items }) => (
        <div key={supplier.id} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.ink, marginBottom: 8 }}>
            {supplier.name}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '10px 14px',
                  border: `1px solid ${BRAND.border}`,
                  borderRadius: 10,
                  background: t.isActive ? '#fff' : BRAND.bgSubtle,
                  opacity: t.isActive ? 1 : 0.65,
                }}
              >
                <strong style={{ fontSize: 14, color: BRAND.ink, minWidth: 120 }}>{t.label}</strong>
                <span style={{ fontSize: 13, color: BRAND.grey, fontVariantNumeric: 'tabular-nums' }}>
                  {minutesVersHeure(t.startMinutes)} – {minutesVersHeure(t.endMinutes)}
                </span>
                <span style={{ fontSize: 12.5, color: BRAND.grey }}>
                  {t.capacity} commandes max
                </span>
                <span style={{ fontSize: 12, color: BRAND.grey }}>
                  {MOMENTS.find((m) => m.value === t.kind)?.label ?? t.kind}
                </span>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void basculerActif(t)}
                    disabled={busyId === t.id}
                    title={t.isActive ? 'Cesse de créer ce créneau chaque jour' : 'Reprend la création quotidienne'}
                    style={boutonDiscret}
                  >
                    {t.isActive ? 'Désactiver' : 'Réactiver'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void supprimer(t)}
                    disabled={busyId === t.id}
                    style={{ ...boutonDiscret, color: '#dc2626', borderColor: '#fca5a5' }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {suppliers.length > 0 && (
        <form onSubmit={ajouter} style={{ borderTop: `1px solid ${BRAND.border}`, paddingTop: 18, marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.ink, marginBottom: 12 }}>
            Ajouter un créneau
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Champ label="Buvette">
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={champStyle}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Champ>
            <Champ label="Nom affiché au client">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="17h45" style={champStyle} />
            </Champ>
            <Champ label="Moment">
              <select value={kind} onChange={(e) => setKind(e.target.value as SlotKindValue)} style={champStyle}>
                {MOMENTS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </Champ>
            <Champ label="De">
              <input value={debut} onChange={(e) => setDebut(e.target.value)} placeholder="17:45" style={{ ...champStyle, width: 90 }} />
            </Champ>
            <Champ label="À">
              <input value={fin} onChange={(e) => setFin(e.target.value)} placeholder="18:00" style={{ ...champStyle, width: 90 }} />
            </Champ>
            <Champ label="Capacité">
              <input value={capacite} onChange={(e) => setCapacite(e.target.value)} style={{ ...champStyle, width: 90 }} />
            </Champ>
            <button
              type="submit"
              disabled={ajoutEnCours}
              style={{
                background: BRAND.orange,
                color: '#fff',
                border: 'none',
                borderRadius: 9,
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: ajoutEnCours ? 'wait' : 'pointer',
                opacity: ajoutEnCours ? 0.6 : 1,
              }}
            >
              {ajoutEnCours ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: BRAND.grey }}>{label}</label>
      {children}
    </div>
  );
}

const champStyle: React.CSSProperties = {
  padding: '9px 11px',
  border: `1px solid ${BRAND.border}`,
  borderRadius: 9,
  fontSize: 14,
  fontFamily: 'inherit',
  color: BRAND.ink,
  background: '#fff',
};

const boutonDiscret: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${BRAND.border}`,
  borderRadius: 7,
  color: BRAND.inkSoft,
  padding: '5px 12px',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
