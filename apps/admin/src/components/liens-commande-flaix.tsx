'use client';

import { useMemo, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import {
  apiDefinirLiensCommandeFlaix,
  type AdminEvent,
  type LigneMatchFlaix,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import { alertesDeSaisie } from '@/lib/alertes-liens';

/**
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
  events: AdminEvent[];
  onSaved: (maj: LigneMatchFlaix[]) => void;
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
  // L'ADVERSAIRE, saisi sur la même ligne que le lien.
  //
  // Deux états séparés plutôt qu'un objet par match : chaque champ se corrige
  // seul, et l'enregistrement n'envoie que ce qui a bougé — réécrire un lien
  // ancien devenu invalide ferait refuser tout le lot.
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [enregistre, setEnregistre] = useState(false);
  /**
   * Les adresses de blason qui ne rendent AUCUNE image.
   *
   * Retenues par adresse et non par match : corriger l'adresse doit réessayer
   * — sinon un club qui répare sa faute de frappe continuerait de voir les
   * initiales et croirait son logo refusé.
   */
  const [casses, setCasses] = useState<Set<string>>(new Set());

  const valeur = (e: AdminEvent) => saisies[e.id] ?? e.flaixOrderUrl ?? '';
  const valeurNom = (e: AdminEvent) => noms[e.id] ?? e.opponentName ?? '';
  const valeurLogo = (e: AdminEvent) => logos[e.id] ?? e.opponentLogoUrl ?? '';

  const aChange = (e: AdminEvent) =>
    valeur(e).trim() !== (e.flaixOrderUrl ?? '') ||
    valeurNom(e).trim() !== (e.opponentName ?? '') ||
    valeurLogo(e).trim() !== (e.opponentLogoUrl ?? '');
  const modifie = aVenir.some(aChange);

  /** Repli quand le club n'a pas (encore) de blason : les initiales, comme dans l'app. */
  const initiales = (nom: string) =>
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((m) => m[0]?.toUpperCase() ?? '')
      .join('');

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
      //
      // Et champ par champ, pas ligne par ligne : un champ non envoyé n'est pas
      // touché par le serveur. Envoyer les trois dès qu'un seul change ferait
      // repasser un lien ancien dans la validation, et le lot entier serait
      // refusé à cause d'une ligne qu'on ne voulait pas modifier.
      const liens = aVenir.filter(aChange).map((e) => ({
        eventId: e.id,
        ...(valeur(e).trim() !== (e.flaixOrderUrl ?? '') ? { url: valeur(e).trim() || null } : {}),
        ...(valeurNom(e).trim() !== (e.opponentName ?? '')
          ? { opponentName: valeurNom(e).trim() || null }
          : {}),
        ...(valeurLogo(e).trim() !== (e.opponentLogoUrl ?? '')
          ? { opponentLogoUrl: valeurLogo(e).trim() || null }
          : {}),
      }));
      if (liens.length === 0) return;

      const maj = await apiDefinirLiensCommandeFlaix(orgId, liens);
      onSaved(maj);
      setSaisies({});
      setNoms({});
      setLogos({});
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
            <br />
            Dis aussi <strong>contre qui on joue</strong> : le nom et le blason de
            l&apos;adversaire remplissent le calendrier de la saison dans l&apos;app. Les deux
            sont optionnels — sans blason, l&apos;app affiche les initiales.
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
          const nom = valeurNom(e);
          const logo = valeurLogo(e);
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

              {/*
                L'ADVERSAIRE — sur la même ligne que le lien, et pas ailleurs.

                C'est le même geste : le club ouvre sa saison, et pour chaque
                match il colle l'adresse de commande et dit contre qui on
                joue. Un second écran « adversaires » obligerait à repasser
                treize fois sur la même liste, et le calendrier de l'app
                resterait à moitié vide.

                Le contenant d'un lieu ouvert en continu n'a pas d'adversaire :
                il n'y a pas de match.
              */}
              {e.isPermanentContainer ? null : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    flexBasis: '100%',
                    paddingTop: 10,
                    borderTop: `1px dashed ${BRAND.border}`,
                  }}
                >
                  {/* L'aperçu du blason, à la taille où l'app le rend. Un
                      logo qui ne charge pas se voit ICI, pas le jour du
                      match sur le téléphone d'un supporter. */}
                  {logo.trim() && !casses.has(logo.trim()) ? (
                    <img
                      src={logo.trim()}
                      alt=""
                      width={38}
                      height={38}
                      // Une adresse qui ne rend pas d'image donne les
                      // INITIALES, pas un carré brisé : c'est exactement ce
                      // que l'app affichera, et le club le voit tout de suite.
                      onError={() => setCasses((s) => new Set(s).add(logo.trim()))}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        objectFit: 'contain',
                        background: '#fff',
                        border: `1px solid ${BRAND.border}`,
                        flex: '0 0 auto',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background: BRAND.bgSubtle,
                        color: BRAND.grey,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        flex: '0 0 auto',
                      }}
                      aria-hidden
                    >
                      {initiales(nom) || '—'}
                    </div>
                  )}

                  <input
                    value={nom}
                    onChange={(ev) => {
                      setNoms((s) => ({ ...s, [e.id]: ev.target.value }));
                      setErreur('');
                      setEnregistre(false);
                    }}
                    placeholder="Adversaire (ex. Racing 92)"
                    aria-label={`Adversaire du match ${e.name}`}
                    style={{
                      flex: '1 1 150px',
                      minWidth: 140,
                      padding: '8px 11px',
                      borderRadius: 9,
                      border: `1px solid ${BRAND.border}`,
                      fontSize: 13,
                      fontFamily: 'inherit',
                    }}
                  />
                  <input
                    type="url"
                    value={logo}
                    onChange={(ev) => {
                      setLogos((s) => ({ ...s, [e.id]: ev.target.value }));
                      setErreur('');
                      setEnregistre(false);
                    }}
                    placeholder="https://…/logo-adverse.png"
                    aria-label={`Logo de l’adversaire du match ${e.name}`}
                    style={{
                      flex: '1 1 200px',
                      minWidth: 180,
                      padding: '8px 11px',
                      borderRadius: 9,
                      border: `1px solid ${BRAND.border}`,
                      fontSize: 13,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
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
