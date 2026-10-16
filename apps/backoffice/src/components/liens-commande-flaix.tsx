'use client';

import { useMemo, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import {
  apiDefinirLiensCommandeFlaix,
  type EvenementDuClub,
} from '@/lib/api/backoffice-client';
import { BRAND } from '@break-eat/brand';
import { alertesDeSaisie } from '@/lib/alertes-liens';

/**
 * ⚠️ CE COMPOSANT EXISTE EN DOUBLE — `apps/admin` ET `apps/backoffice`.
 * Le dépôt n'a pas de bibliothèque d'interface partagée (même situation que
 * `coords.ts` et `alertes-liens.ts`). **Toute correction vaut pour les deux.**
 *
 * LES LIENS DE COMMANDE FLAIX, TOUTE LA SAISON D'UN COUP.
 *
 * Le geste qu'on remplace : avant chaque match, aller remplacer LE lien unique
 * du lieu. Un oubli, et le public de samedi arrivait sur la page de mardi.
 *
 * Ici, chaque match porte le sien. On colle les dix prochains en une fois, et
 * c'est la DATE qui décide lequel s'ouvre — personne n'a plus rien à faire le
 * jour du match.
 *
 * Tout ou rien à l'enregistrement : un seul lien refusé et rien n'est écrit.
 * À dix lignes, un enregistrement partiel laisserait croire que tout est passé.
 */
export function LiensCommandeFlaix({
  orgId,
  events,
  modeContinu,
  onSaved,
}: {
  orgId: string;
  /**
   * Le lieu est-il OUVERT EN CONTINU (restaurant) plutôt que par événement ?
   *
   * C'est le rythme du LIEU qui décide de ce qu'on affiche, jamais la
   * présence d'un contenant en base : un lieu passé d'un mode à l'autre garde
   * ses anciens événements, et mélanger les deux ferait coller un lien sur une
   * ligne qui ne s'ouvrira jamais.
   */
  modeContinu: boolean;
  events: EvenementDuClub[];
  onSaved: (maj: { id: string; flaixOrderUrl: string | null }[]) => void;
}) {
  // Les matchs à venir ou en cours, du plus proche au plus lointain. Un match
  // terminé n'a plus de commande à prendre : l'afficher noierait les autres.
  //
  // Le contenant d'un lieu OUVERT EN CONTINU (restaurant) passe en tête : il
  // n'a ni date ni fin, et son unique lien vaut tous les jours.
  const aVenir = useMemo(() => {
    // UN SEUL RYTHME À L'ÉCRAN. En continu : le contenant unique, et rien
    // d'autre. Par événement : les matchs datés, et jamais le contenant.
    if (modeContinu) return events.filter((e) => e.isPermanentContainer);

    const maintenant = Date.now();
    return events
      .filter((e) => !e.isPermanentContainer)
      .filter((e) => new Date(e.endAt).getTime() > maintenant)
      .filter((e) => e.status !== 'CANCELLED')
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [events, modeContinu]);

  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [enregistre, setEnregistre] = useState(false);

  const valeur = (e: EvenementDuClub) => saisies[e.id] ?? e.flaixOrderUrl ?? '';
  const modifie = aVenir.some((e) => valeur(e).trim() !== (e.flaixOrderUrl ?? ''));

  // Ce qui cloche dans la saisie EN COURS — pas seulement dans ce qui est
  // enregistré : l'erreur doit se voir au moment où on la commet, pas le jour
  // du match. On n'empêche rien, on montre (voir `alertes-liens.ts`).
  const alertes = useMemo(
    () =>
      alertesDeSaisie(
        aVenir.map((e) => ({
          id: e.id,
          name: e.name,
          startAt: e.startAt,
          endAt: e.endAt,
          url: saisies[e.id] ?? e.flaixOrderUrl ?? '',
          status: e.status,
        })),
      ),
    [aVenir, saisies],
  );
  const signales = new Set(alertes.flatMap((a) => a.ids));

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur('');
    setEnregistre(false);
    try {
      // On n'envoie QUE ce qui a bougé : réécrire des lignes inchangées, c'est
      // risquer de refuser tout le lot pour un lien ancien devenu invalide.
      const liens = aVenir
        .filter((e) => valeur(e).trim() !== (e.flaixOrderUrl ?? ''))
        .map((e) => ({ eventId: e.id, url: valeur(e).trim() || null }));
      if (liens.length === 0) return;

      const maj = await apiDefinirLiensCommandeFlaix(orgId, liens);
      onSaved(maj);
      setSaisies({});
      setEnregistre(true);
    } catch (e) {
      // Le serveur NOMME l'événement fautif : à dix lignes, « ce n'est pas un
      // lien Flaix » sans dire lequel oblige à tout relire.
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  if (aVenir.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13.5, color: BRAND.grey, lineHeight: 1.55 }}>
        {modeContinu
          ? 'Ce lieu est ouvert en continu, mais son espace de commande n’est pas encore créé. Enregistre le lieu une fois, puis reviens coller son lien.'
          : 'Aucun événement à venir. Crée tes matchs, puis reviens coller leurs liens Flaix — tu peux les saisir des mois à l’avance.'}
      </p>
    );
  }

  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 13.5, color: BRAND.inkSoft, lineHeight: 1.55 }}>
        {modeContinu ? (
          <>
            Ce lieu est <strong>ouvert en continu</strong> : un seul lien, valable tous les
            jours, sans heure d&apos;ouverture.
          </>
        ) : (
          <>
            Colle l&apos;adresse de commande que Flaix fournit pour chaque match.
            L&apos;application ouvre <strong>celle du match en cours</strong> — tu n&apos;as rien
            à changer le jour J. La commande ouvre à l&apos;avance selon le réglage du lieu.
          </>
        )}
      </p>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: BRAND.grey, lineHeight: 1.6 }}>
        Tu peux garder tes étiquettes d&apos;identité, comme dans ton ancien back-office :{' '}
        <code style={codeStyle}>[#firstname]</code> <code style={codeStyle}>[#lastname]</code>{' '}
        <code style={codeStyle}>[#mail]</code> <code style={codeStyle}>[#phone]</code> (ou{' '}
        <code style={codeStyle}>[#Votre portable]</code>). Break Eat les remplace par les
        coordonnées du client avant d&apos;ouvrir la page — il n&apos;a pas à se reconnecter.
        Un client non connecté reçoit l&apos;adresse sans ces informations.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {aVenir.map((e) => {
          const v = valeur(e);
          return (
            <div
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${BRAND.border}`,
                background: signales.has(e.id)
                  ? 'rgba(245,158,11,0.08)'
                  : v
                    ? 'rgba(22,163,74,0.04)'
                    : '#fff',
                borderColor: signales.has(e.id) ? '#fbbf24' : BRAND.border,
              }}
            >
              <div style={{ minWidth: 190, flex: '0 0 auto' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.ink }}>
                  {e.isPermanentContainer ? 'Ouvert en continu' : e.name}
                </div>
                <div style={{ fontSize: 12, color: BRAND.grey, marginTop: 2 }}>
                  {e.isPermanentContainer
                    ? 'Un seul lien, valable tous les jours'
                    : new Date(e.startAt).toLocaleString('fr-FR', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                </div>
              </div>
              <input
                type="url"
                value={v}
                onChange={(ev) => {
                  setSaisies((s) => ({ ...s, [e.id]: ev.target.value }));
                  setErreur('');
                  setEnregistre(false);
                }}
                placeholder="https://ops.flaixlabs.com/…"
                style={{
                  flex: 1,
                  minWidth: 230,
                  padding: '9px 12px',
                  borderRadius: 9,
                  border: `1px solid ${BRAND.border}`,
                  fontSize: 13.5,
                  fontFamily: 'inherit',
                }}
              />
              {e.flaixOrderUrl && v === e.flaixOrderUrl ? (
                <Check size={17} color="#16a34a" aria-label="Lien enregistré" />
              ) : (
                <Link2 size={17} color={BRAND.grey} />
              )}
            </div>
          );
        })}
      </div>

      {alertes.length > 0 ? (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid #fbbf24',
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
            À vérifier avant d&apos;enregistrer
          </div>
          {alertes.map((a, i) => (
            <div key={i} style={{ fontSize: 13, color: '#92400e', lineHeight: 1.55 }}>
              • {a.message}
            </div>
          ))}
        </div>
      ) : null}

      {erreur ? (
        <div style={{ marginTop: 12, fontSize: 13, color: '#b91c1c' }}>{erreur}</div>
      ) : null}
      {enregistre ? (
        <div style={{ marginTop: 12, fontSize: 13, color: '#16a34a' }}>
          Liens enregistrés. L&apos;application ouvrira le bon selon la date.
        </div>
      ) : null}

      <button
        onClick={() => void enregistrer()}
        disabled={envoi || !modifie}
        style={{
          marginTop: 16,
          background: BRAND.orange,
          color: '#fff',
          border: 0,
          borderRadius: 999,
          padding: '10px 22px',
          fontSize: 14,
          fontWeight: 700,
          cursor: envoi ? 'wait' : modifie ? 'pointer' : 'default',
          opacity: modifie ? 1 : 0.45,
          fontFamily: 'inherit',
        }}
      >
        {envoi ? 'Enregistrement…' : 'Enregistrer les liens'}
      </button>
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  background: BRAND.bgSubtle,
  borderRadius: 5,
  padding: '1px 5px',
  fontSize: 11.5,
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  color: BRAND.inkSoft,
};
