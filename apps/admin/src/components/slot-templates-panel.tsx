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
/**
 * Duree d'un creneau horaire, deduite plutot que demandee.
 *
 * Le club pense « 17h45 », pas « de 17h45 a 18h00 ». Lui faire saisir une fin
 * serait une question sans interet, a laquelle il repondrait au hasard.
 */
const DUREE_CRENEAU_MIN = 15;

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
export function SlotTemplatesPanel({
  orgId,
  venueId,
  supplierId: buvetteFixee,
}: {
  orgId: string;
  venueId: string;
  /**
   * Quand il est fourni, le panneau se limite a CETTE buvette : plus de
   * regroupement, plus de choix a refaire a chaque ajout. C'est la forme
   * utilisee dans la fiche d'une buvette, ou l'on sait deja de laquelle on
   * parle.
   */
  supplierId?: string;
}) {
  const [templates, setTemplates] = useState<SlotTemplate[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Formulaire d'ajout
  const [supplierId, setSupplierId] = useState('');
  /**
   * Deux façons d'ajouter un créneau, parce qu'il en existe deux dans la vraie
   * vie : une HEURE (« 17h45 ») ou un MOMENT (« mi-temps », « entracte »).
   *
   * Un moment n'a pas d'heure connue d'avance — la mi-temps tombe quand elle
   * tombe. Demander une plage horaire pour ça n'aurait aucun sens : c'est
   * l'équipier qui l'ouvre depuis son poste quand le moment arrive.
   */
  const [mode, setMode] = useState<'heure' | 'moment'>('heure');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<SlotKindValue>('PAUSE_1');
  const [debut, setDebut] = useState('');
  const [limiteActive, setLimiteActive] = useState(false);
  const [capacite, setCapacite] = useState('20');
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [tpl, sup] = await Promise.all([apiGetSlotTemplates(venueId), apiGetSuppliers(orgId)]);
      setTemplates(Array.isArray(tpl) ? tpl : []);
      const liste = Array.isArray(sup) ? sup : [];
      setSuppliers(liste);
      if (buvetteFixee) setSupplierId(buvetteFixee);
      else if (!supplierId && liste[0]) setSupplierId(liste[0].id);
      setErreur('');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      setChargement(false);
    }
    // `supplierId` volontairement hors dépendances : il n'est initialisé qu'une
    // fois, et l'inclure relancerait le chargement à chaque choix de buvette.
  }, [venueId, orgId, buvetteFixee]);

  useEffect(() => { void charger(); }, [charger]);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      setErreur('Choisissez la buvette concernée.');
      return;
    }

    let startMinutes: number;
    let endMinutes: number;
    let nom: string;
    let moment: SlotKindValue;

    if (mode === 'heure') {
      const d = heureVersMinutes(debut);
      if (d === null) {
        setErreur('Heure attendue au format 17h45.');
        return;
      }
      // La plage est DÉDUITE, pas demandée. Le club pense « 17h45 », pas
      // « de 17h45 à 18h00 » — lui faire saisir une fin serait une question
      // sans intérêt, à laquelle il répondrait au hasard.
      startMinutes = d;
      endMinutes = Math.min(d + DUREE_CRENEAU_MIN, 1440);
      nom = label.trim() || minutesVersHeure(d);
      moment = 'CUSTOM';
    } else {
      nom = label.trim();
      if (!nom) {
        setErreur('Donnez un nom au moment (mi-temps, entracte…).');
        return;
      }
      // Un moment n'a pas d'heure : il court sur la journée, et c'est
      // l'équipier qui l'ouvre quand il arrive. Les bornes ne servent qu'à
      // satisfaire le modèle, elles ne sont jamais montrées au client.
      startMinutes = 0;
      endMinutes = 1440;
      moment = kind;
    }

    setAjoutEnCours(true);
    setErreur('');
    try {
      await apiCreateSlotTemplate(venueId, {
        supplierId,
        label: nom,
        kind: moment,
        startMinutes,
        endMinutes,
        capacityEnabled: limiteActive,
        capacity: Math.max(1, Number(capacite) || 20),
      });
      setLabel('');
      setDebut('');
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
    .filter((s) => !buvetteFixee || s.id === buvetteFixee)
    .map((s) => ({ supplier: s, items: templates.filter((t) => t.supplierId === s.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <p style={{ fontSize: 13.5, color: BRAND.grey, lineHeight: 1.7, margin: '0 0 18px' }}>
        Décrivez les heures de retrait de {buvetteFixee ? 'cette buvette' : 'chaque buvette'}{' '}
        <strong>une seule fois</strong> : elles se rejouent chaque jour, sans rien ressaisir.
        Votre équipier ouvre ou ferme chaque créneau depuis son poste, selon la file du moment.
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
          {!buvetteFixee && (
            <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.ink, marginBottom: 8 }}>
              {supplier.name}
            </div>
          )}
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
                {/* Un moment couvre la journee entiere (0 a 1440) : afficher
                    « 00:00 - 24:00 » n'apprendrait rien. On dit plutot QUI
                    l'ouvre, ce qui est l'information utile. */}
                <span style={{ fontSize: 13, color: BRAND.grey, fontVariantNumeric: 'tabular-nums' }}>
                  {estUnMoment(t)
                    ? 'ouvert par l’equipier'
                    : minutesVersHeure(t.startMinutes)}
                </span>
                <span style={{ fontSize: 12.5, color: BRAND.grey }}>
                  {t.capacityEnabled ? `${t.capacity} commandes max` : 'sans limite'}
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
          {/* Deux facons d'ajouter, parce qu'il en existe deux sur le terrain.
              Un onglet plutot qu'un menu deroulant : le choix change les champs
              affiches, il doit se voir avant d'etre fait. */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {([['heure', 'A une heure precise'], ['moment', 'A un moment du match']] as const).map(
              ([v, lbl]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMode(v)}
                  style={{
                    padding: '7px 15px',
                    borderRadius: 8,
                    fontSize: 13.5,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    border: `1px solid ${mode === v ? BRAND.orange : BRAND.border}`,
                    background: mode === v ? BRAND.orange : '#fff',
                    color: mode === v ? '#fff' : BRAND.inkSoft,
                  }}
                >
                  {lbl}
                </button>
              ),
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {!buvetteFixee && (
              <Champ label="Buvette">
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={champStyle}>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Champ>
            )}

            {mode === 'heure' ? (
              <>
                <Champ label="Heure de retrait">
                  <input
                    value={debut}
                    onChange={(e) => setDebut(e.target.value)}
                    placeholder="17h45"
                    style={{ ...champStyle, width: 110 }}
                  />
                </Champ>
                <Champ label="Nom affiche (optionnel)">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="reprend l'heure"
                    style={champStyle}
                  />
                </Champ>
              </>
            ) : (
              <>
                <Champ label="Nom du moment">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Mi-temps, entracte, pause..."
                    list="moments-courants"
                    style={champStyle}
                  />
                  <datalist id="moments-courants">
                    <option value="Mi-temps" />
                    <option value="Entracte" />
                    <option value="Pause" />
                    <option value="Immediat" />
                  </datalist>
                </Champ>
                <Champ label="Type">
                  <select value={kind} onChange={(e) => setKind(e.target.value as SlotKindValue)} style={champStyle}>
                    {MOMENTS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </Champ>
              </>
            )}

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
              {ajoutEnCours ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>

          {/* Limite de commandes : eteinte par defaut.
              Une limite subie est pire qu'aucune limite — le club l'active
              quand il en a besoin, pas parce qu'un champ la reclamait. */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 16, fontSize: 13.5, color: BRAND.ink, cursor: 'pointer' }}>
            <input type="checkbox" checked={limiteActive} onChange={(e) => setLimiteActive(e.target.checked)} />
            Limiter le nombre de commandes sur ce creneau
          </label>
          {limiteActive && (
            <div style={{ marginTop: 10 }}>
              <Champ label="Commandes maximum">
                <input value={capacite} onChange={(e) => setCapacite(e.target.value)} style={{ ...champStyle, width: 110 }} />
              </Champ>
            </div>
          )}

          <p style={{ fontSize: 12.5, color: BRAND.grey, margin: '14px 0 0', lineHeight: 1.6 }}>
            {mode === 'heure'
              ? 'Le client verra cette heure dans la liste des retraits possibles.'
              : 'Un moment n’a pas d’heure fixe : c’est votre equipier qui l’ouvre depuis son poste quand il arrive.'}
          </p>
        </form>
      )}
    </div>
  );
}

/** Un moment n'a pas d'heure : il couvre la journee entiere. */
function estUnMoment(t: SlotTemplate): boolean {
  return t.startMinutes === 0 && t.endMinutes === 1440;
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
