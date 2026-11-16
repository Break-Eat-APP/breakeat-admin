'use client';

import { useCallback, useEffect, useState } from 'react';
import { BRAND } from '@break-eat/brand';
import {
  fetchSlots,
  setSlotStatus,
  type PickupSlot,
  type SlotStatusValue,
} from '@/lib/api/orders-client';

/**
 * Barre des créneaux de récupération, pilotée par l'équipier.
 *
 * Le club décide des horaires ; l'équipier décide de ce qui reste ouvert. Une
 * file qui déborde, un stock qui manque, un four en panne : c'est visible du
 * comptoir, pas d'un dashboard.
 *
 * Fermer n'annule rien — les commandes déjà placées restent à préparer. Le
 * libellé le dit, pour lever l'hésitation au moment de cliquer.
 */
export function SlotBar({
  eventId,
  token,
  supplierId,
  posteEpingle = false,
}: {
  eventId: string;
  token: string;
  supplierId: string | null;
  /**
   * Compte rattaché à UNE buvette. Le serveur lui refuse d'ouvrir ou de fermer
   * un créneau COMMUN (sans buvette) : il déciderait pour les autres comptoirs.
   * Ces créneaux restent visibles, mais en lecture seule (16/11/2026) — ils
   * étaient cliquables, et le clic finissait en erreur rouge.
   */
  posteEpingle?: boolean;
}) {
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try {
      const tous = await fetchSlots(eventId, token);
      // Un équipier rattaché à une buvette ne voit QUE ses créneaux : lui
      // montrer ceux du comptoir d'à côté l'inviterait à fermer ce qui ne le
      // regarde pas. Les créneaux communs (supplierId nul) restent visibles.
      setSlots(
        supplierId ? tous.filter((s) => s.supplierId === null || s.supplierId === supplierId) : tous,
      );
      setErreur('');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Créneaux indisponibles');
    }
  }, [eventId, token, supplierId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function basculer(slot: PickupSlot) {
    const cible: SlotStatusValue = slot.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    setBusyId(slot.id);
    setErreur('');
    try {
      const maj = await setSlotStatus(eventId, slot.id, cible, token);
      setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, status: maj.status } : s)));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Changement refusé');
    } finally {
      setBusyId(null);
    }
  }

  // Aucun créneau configuré : la barre disparaît plutôt que d'occuper l'écran
  // avec un vide. Le tableau de commandes est ce qui compte ici.
  if (slots.length === 0 && !erreur) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '10px 16px',
        borderBottom: `1px solid ${BRAND.border}`,
        background: '#fff',
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: BRAND.grey,
        }}
      >
        Créneaux
      </span>

      {slots.map((slot) => {
        const ouvert = slot.status === 'OPEN';
        const complet = slot.status === 'FULL';
        const commun = posteEpingle && slot.supplierId === null;
        return (
          <button
            key={slot.id}
            type="button"
            onClick={() => {
              if (!commun) void basculer(slot);
            }}
            disabled={busyId === slot.id || commun}
            title={
              commun
                ? 'Créneau commun à toutes les buvettes : c’est le responsable qui l’ouvre ou le ferme.'
                : ouvert
                  ? 'Ferme ce créneau. Les commandes déjà passées restent à préparer.'
                  : 'Rouvre ce créneau à la prise de commandes.'
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 13px',
              borderRadius: 999,
              fontSize: 13.5,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: commun ? 'default' : busyId === slot.id ? 'wait' : 'pointer',
              opacity: busyId === slot.id ? 0.55 : 1,
              border: `1px solid ${ouvert ? '#6ee7b7' : complet ? '#fcd34d' : BRAND.border}`,
              background: ouvert ? '#ecfdf5' : complet ? '#fffbeb' : BRAND.bgSubtle,
              color: ouvert ? '#047857' : complet ? '#92400e' : BRAND.grey,
              textDecoration: ouvert || complet ? 'none' : 'line-through',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: ouvert ? '#059669' : complet ? '#d97706' : '#9ca3af',
              }}
            />
            {slot.label ?? heure(slot.startAt)}
            {commun ? <span style={{ fontWeight: 500, opacity: 0.75 }}> · commun</span> : null}
          </button>
        );
      })}

      {erreur && <span style={{ color: '#b91c1c', fontSize: 12.5 }}>{erreur}</span>}
    </div>
  );
}

/** Repli quand le club n'a pas nommé le créneau : on montre l'heure. */
function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
