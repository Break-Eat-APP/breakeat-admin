'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiEvenementsDuClub,
  apiGetVenues,
  apiListOrganizations,
  type EvenementDuClub,
  type OrgListItem,
} from '@/lib/api/backoffice-client';
import { LiensCommandeFlaix } from '@/components/liens-commande-flaix';
import { BRAND } from '@break-eat/brand';

/**
 * LES LIENS DE COMMANDE FLAIX, TOUS CLUBS CONFONDUS.
 *
 * Deux portes pour la même saisie, et c'est voulu : un club autonome colle ses
 * liens dans son propre dashboard, et pour les autres on les dépose ici, sans
 * changer de session.
 *
 * Ce qu'on ne fait PAS : lister les quatre cents matchs de tous les clubs sur
 * une seule page. Ce n'est pas plus simple que de choisir un club — c'est
 * seulement plus long à lire, et on finit par coller un lien sur la mauvaise
 * ligne. Un club à la fois, choisi en haut.
 *
 * Les routes appelées sont celles du dashboard du club, avec un jeton
 * SUPER_ADMIN : même validation, mêmes avertissements, mêmes règles. Deux
 * écrans qui écriraient le même champ avec deux comportements, c'est la panne
 * qu'on cherche à éviter depuis le début.
 */
export default function LiensFlaixPage() {
  const [clubs, setClubs] = useState<OrgListItem[]>([]);
  const [clubId, setClubId] = useState('');
  const [evenements, setEvenements] = useState<EvenementDuClub[]>([]);
  // Le rythme du lieu : il décide de ce qu'on affiche (un lien unique, ou
  // des matchs datés). Jamais les deux.
  const [modeContinu, setModeContinu] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const liste = await apiListOrganizations();
        setClubs(liste);
        // Un seul club : on ne fait pas choisir entre une seule option.
        if (liste.length === 1) setClubId(liste[0].id);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Chargement impossible.');
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  const charger = useCallback(async (id: string) => {
    if (!id) {
      setEvenements([]);
      setModeContinu(false);
      return;
    }
    setChargement(true);
    setErreur('');
    try {
      const [evs, lieux] = await Promise.all([apiEvenementsDuClub(id), apiGetVenues(id)]);
      setEvenements(evs);
      setModeContinu(lieux[0]?.operatingMode === 'PERMANENT');
    } catch (e) {
      setEvenements([]);
      setErreur(e instanceof Error ? e.message : 'Chargement des événements impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger(clubId);
  }, [clubId, charger]);

  const club = useMemo(() => clubs.find((c) => c.id === clubId), [clubs, clubId]);

  // Combien de matchs à venir attendent encore leur lien — la seule chose
  // qu'on veut savoir d'un coup d'œil en arrivant sur un club.
  const manquants = useMemo(() => {
    const maintenant = Date.now();
    return evenements.filter(
      (e) =>
        new Date(e.endAt).getTime() > maintenant &&
        e.status !== 'CANCELLED' &&
        !e.flaixOrderUrl?.trim(),
    ).length;
  }, [evenements]);

  return (
    <div style={{ padding: '30px 36px 56px', fontFamily: BRAND.font }}>
      <h1 style={{
            fontFamily: BRAND.fontDisplay,
            fontSize: 30,
            fontWeight: 800,
            color: BRAND.ink,
            margin: 0,
            letterSpacing: -0.6,
        }}>
        Liens de commande Flaix
      </h1>
      <p
        style={{
          color: BRAND.inkSoft,
          fontSize: 13.5,
          margin: '6px 0 22px',
          lineHeight: 1.55,
          maxWidth: 640,
        }}
      >
        Un lien par match, collé une fois — c&apos;est la date qui décide lequel s&apos;ouvre.
        Choisis un club&nbsp;: la saisie est la même que dans son dashboard, et un club autonome
        peut continuer de le faire lui-même.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <label htmlFor="club" style={{ fontSize: 13, fontWeight: 600, color: BRAND.inkSoft }}>
          Club
        </label>
        <select
          id="club"
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
          style={{
            minWidth: 280,
            padding: '9px 12px',
            borderRadius: 9,
            border: `1px solid ${BRAND.border}`,
            fontSize: 14,
            fontFamily: 'inherit',
            background: '#fff',
          }}
        >
          <option value="">— Choisir un club —</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {club && !chargement ? (
          <span style={{ fontSize: 12.5, color: manquants > 0 ? '#92400e' : BRAND.grey }}>
            {manquants > 0
              ? `${manquants} match${manquants > 1 ? 's' : ''} à venir sans lien`
              : 'Tous les matchs à venir ont leur lien'}
          </span>
        ) : null}
      </div>

      {erreur ? (
        <div style={{ color: '#b91c1c', fontSize: 13.5, marginBottom: 16 }}>{erreur}</div>
      ) : null}

      <section
        style={{
          background: '#fff',
          border: `1px solid ${BRAND.border}`,
          borderRadius: 12,
          padding: 20,
        }}
      >
        {!clubId ? (
          <p style={{ margin: 0, fontSize: 13.5, color: BRAND.grey }}>
            Choisis un club pour voir ses matchs à venir.
          </p>
        ) : chargement ? (
          <p style={{ margin: 0, fontSize: 13.5, color: BRAND.grey }}>Chargement…</p>
        ) : (
          <LiensCommandeFlaix
            orgId={clubId}
            events={evenements}
            modeContinu={modeContinu}
            onSaved={(maj) =>
              setEvenements((cur) =>
                cur.map((e) => {
                  const m = maj.find((x) => x.id === e.id);
                  return m ? { ...e, flaixOrderUrl: m.flaixOrderUrl } : e;
                }),
              )
            }
          />
        )}
      </section>
    </div>
  );
}
