'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Power, ToggleLeft } from 'lucide-react';
import {
  apiDeleteFeatureFlag,
  apiGetEvents,
  apiGetFeatureFlags,
  apiSetFeatureFlag,
  apiSonderInterrupteur,
  getOrgId,
  getOrgName,
  getStoredUser,
  type AdminEvent,
  type FeatureFlag,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import { CLES_BRANCHEES, INTERRUPTEURS, type Interrupteur } from '@/lib/interrupteurs';

/**
 * LES INTERRUPTEURS — allumer ou éteindre une fonction sans redéployer.
 *
 * Le mécanisme existait depuis des semaines ; il n'avait AUCUN écran.
 * `apiSetFeatureFlag` était dans le client d'API et personne ne l'appelait :
 * pour couper « Partager l'addition » sur un club un samedi soir, il fallait
 * appeler l'API en ligne de commande avec un jeton d'administrateur, ou écrire
 * du SQL. C'est-à-dire : au moment où l'on en a besoin, on ne peut pas.
 *
 * ── CE QUE CET ÉCRAN FAIT DIFFÉREMMENT D'UN FORMULAIRE ─────────
 *
 * « Paramètres » est une saisie libre clé-valeur, et c'est bien pour ce qu'il
 * fait. Ici, ce serait un piège : une faute de frappe dans `app.split.enabled`
 * crée une ligne que personne ne lira jamais, et on chercherait pourquoi
 * « l'interrupteur ne marche pas ». Les clés viennent donc d'une liste
 * (`lib/interrupteurs.ts`), jamais du clavier.
 *
 * ── ET IL NE RECALCULE RIEN ────────────────────────────────────
 *
 * L'état affiché est DEMANDÉ à l'adresse que l'application interroge
 * elle-même. C'est la leçon du défaut corrigé le 31/10 : le serveur résolvait
 * ÉVÉNEMENT > CLUB > GLOBAL, l'affichage ne lui passait rien, et les deux se
 * contredisaient. Un écran d'administration qui refait le calcul de son côté
 * finirait par mentir de la même façon — et c'est le genre de mensonge qu'on
 * ne découvre qu'un soir de match.
 *
 * ── « RIEN DE POSÉ » N'EST PAS « ÉTEINT » ──────────────────────
 *
 * Sans aucune ligne, c'est la variable d'environnement qui décide. L'écran le
 * dit à chaque ligne vide, parce que la confusion inverse ferait couper une
 * fonction en croyant la rallumer.
 */
export default function InterrupteursPage() {
  const orgId = getOrgId();
  const orgName = getOrgName();
  const superAdmin = getStoredUser()?.globalRole === 'SUPER_ADMIN';

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [evenements, setEvenements] = useState<AdminEvent[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  /** L'événement choisi pour la troisième ligne de chaque carte. */
  const [matchId, setMatchId] = useState('');

  /** Ce que l'application voit, par clé : hors contexte, et pour le match choisi. */
  const [vu, setVu] = useState<Record<string, { global?: boolean; match?: boolean }>>({});

  /** La clé+portée en cours d'écriture — pour désarmer les boutons sans tout figer. */
  const [enCours, setEnCours] = useState('');

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur('');
    try {
      const [lignes, matchs] = await Promise.all([
        apiGetFeatureFlags(),
        orgId ? apiGetEvents(orgId) : Promise.resolve<AdminEvent[]>([]),
      ]);
      setFlags(lignes);
      setEvenements(matchs);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Lecture impossible');
    } finally {
      setChargement(false);
    }
  }, [orgId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  /**
   * On interroge la SONDE de chaque interrupteur — l'adresse que l'application
   * appelle. Relancé quand le match choisi change, et après chaque écriture.
   *
   * Un échec ne laisse pas une valeur périmée à l'écran : on efface. Afficher
   * « actif » parce que c'était vrai il y a une minute est exactement ce qu'on
   * cherche à éviter ici.
   */
  const sonder = useCallback(async () => {
    const resultats: Record<string, { global?: boolean; match?: boolean }> = {};
    await Promise.all(
      INTERRUPTEURS.map(async (i) => {
        const [g, m] = await Promise.all([
          apiSonderInterrupteur(i.sonde()).catch(() => undefined),
          matchId ? apiSonderInterrupteur(i.sonde(matchId)).catch(() => undefined) : undefined,
        ]);
        resultats[i.cle] = { global: g, match: m };
      }),
    );
    setVu(resultats);
  }, [matchId]);

  useEffect(() => {
    void sonder();
  }, [sonder]);

  const ligneDe = (cle: string, scope: string, scopeId?: string | null) =>
    flags.find(
      (f) => f.key === cle && f.scope === scope && (f.scopeId ?? null) === (scopeId ?? null),
    );

  async function poser(cle: string, scope: string, scopeId: string | undefined, enabled: boolean) {
    setEnCours(`${cle}:${scope}:${scopeId ?? ''}`);
    setErreur('');
    try {
      await apiSetFeatureFlag({ key: cle, scope, scopeId, enabled });
      await charger();
      await sonder();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Écriture refusée');
    } finally {
      setEnCours('');
    }
  }

  async function retirer(ligne: FeatureFlag, heriteDe: string) {
    if (
      !confirm(
        `Retirer ce réglage ?\n\nLa portée ne décidera plus rien : ${heriteDe}.\n` +
          `Ce n'est pas « couper » — pour couper, utilise le bouton Couper.`,
      )
    ) {
      return;
    }
    setEnCours(`${ligne.key}:${ligne.scope}:${ligne.scopeId ?? ''}`);
    setErreur('');
    try {
      await apiDeleteFeatureFlag(ligne.id);
      await charger();
      await sonder();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Suppression refusée');
    } finally {
      setEnCours('');
    }
  }

  /** Les lignes en base dont AUCUN code ne lit la clé. */
  const orphelines = flags.filter((f) => !CLES_BRANCHEES.has(f.key));

  return (
    <div style={{ padding: '30px 36px 56px', fontFamily: BRAND.font }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: BRAND.fontDisplay,
            fontSize: 30,
            fontWeight: 800,
            color: BRAND.ink,
            margin: 0,
            letterSpacing: -0.6,
          }}
        >
          Interrupteurs
        </h1>
        <p style={{ color: BRAND.grey, fontSize: 14, margin: '4px 0 0' }}>
          Allumer ou éteindre une fonction, tout de suite, sans attendre une mise à jour.
        </p>
      </div>

      {erreur && (
        <div
          style={{
            background: '#fee2e2',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          {erreur}
        </div>
      )}

      {chargement ? (
        <div style={{ color: BRAND.grey, fontSize: 14 }}>Chargement…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {INTERRUPTEURS.map((i) => (
            <Carte
              key={i.cle}
              i={i}
              vu={vu[i.cle] ?? {}}
              ligneGlobale={ligneDe(i.cle, 'GLOBAL')}
              ligneClub={orgId ? ligneDe(i.cle, 'ORGANIZATION', orgId) : undefined}
              ligneMatch={matchId ? ligneDe(i.cle, 'EVENT', matchId) : undefined}
              orgId={orgId}
              orgName={orgName}
              superAdmin={superAdmin}
              evenements={evenements}
              matchId={matchId}
              setMatchId={setMatchId}
              enCours={enCours}
              poser={poser}
              retirer={retirer}
            />
          ))}

          {/* ── Ce qui est posé mais que personne ne lit ──────────── */}
          {orphelines.length > 0 && (
            <div
              style={{
                background: BRAND.surface,
                borderRadius: BRAND.radius.card,
                padding: 24,
                boxShadow: BRAND.shadowCard,
                border: `1px solid ${BRAND.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <AlertTriangle size={17} color="#b45309" strokeWidth={2} />
                <h2 style={{ ...BRAND.sectionTitle, margin: 0 }}>
                  Posés en base, lus par personne
                </h2>
              </div>
              <p style={{ color: BRAND.grey, fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
                Ces lignes existent, et aucun code ne les consulte — ce ne sont pas des
                interrupteurs, seulement des valeurs rangées. Les changer n&apos;aura aucun
                effet. Souvent, c&apos;est une faute de frappe dans la clé d&apos;un vrai
                interrupteur.
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <tbody>
                  {orphelines.map((f) => (
                    <tr key={f.id} style={{ borderTop: `1px solid ${BRAND.border}` }}>
                      <td style={{ padding: '10px 0' }}>
                        <code
                          style={{
                            background: BRAND.bgSubtle,
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 13,
                          }}
                        >
                          {f.key}
                        </code>
                      </td>
                      <td style={{ padding: '10px 0', color: BRAND.grey, fontSize: 12 }}>
                        {f.scope}
                        {f.scopeId ? ` · ${f.scopeId.slice(0, 8)}…` : ''}
                      </td>
                      <td style={{ padding: '10px 0', color: BRAND.grey, fontSize: 12 }}>
                        {f.enabled ? 'actif' : 'inactif'}
                      </td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        <button
                          onClick={() => void retirer(f, 'cette ligne ne servait à rien')}
                          style={{
                            background: 'none',
                            border: '1px solid #fca5a5',
                            color: '#dc2626',
                            borderRadius: 6,
                            padding: '3px 10px',
                            fontSize: 12,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Retirer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────

function Carte({
  i,
  vu,
  ligneGlobale,
  ligneClub,
  ligneMatch,
  orgId,
  orgName,
  superAdmin,
  evenements,
  matchId,
  setMatchId,
  enCours,
  poser,
  retirer,
}: {
  i: Interrupteur;
  vu: { global?: boolean; match?: boolean };
  ligneGlobale?: FeatureFlag;
  ligneClub?: FeatureFlag;
  ligneMatch?: FeatureFlag;
  orgId: string;
  orgName: string;
  superAdmin: boolean;
  evenements: AdminEvent[];
  matchId: string;
  setMatchId: (v: string) => void;
  enCours: string;
  poser: (cle: string, scope: string, scopeId: string | undefined, enabled: boolean) => Promise<void>;
  retirer: (ligne: FeatureFlag, heriteDe: string) => Promise<void>;
}) {
  /** L'état retenu pour l'en-tête : celui du match si un match est choisi. */
  const effectif = matchId && vu.match !== undefined ? vu.match : vu.global;

  return (
    <div
      style={{
        background: BRAND.surface,
        borderRadius: BRAND.radius.card,
        boxShadow: BRAND.shadowCard,
        border: `1px solid ${BRAND.border}`,
        overflow: 'hidden',
      }}
    >
      {/* En-tête */}
      <div style={{ padding: '22px 24px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ToggleLeft size={20} color={BRAND.inkSoft} strokeWidth={1.9} />
            <h2 style={{ ...BRAND.sectionTitle, margin: 0 }}>{i.label}</h2>
          </div>
          <Pastille etat={effectif} />
        </div>

        <p style={{ color: BRAND.inkSoft, fontSize: 14, margin: '12px 0 0', lineHeight: 1.55 }}>
          {i.quoi}
        </p>
        <p
          style={{
            color: BRAND.grey,
            fontSize: 13,
            margin: '8px 0 0',
            lineHeight: 1.55,
            paddingLeft: 12,
            borderLeft: `2px solid ${BRAND.border}`,
          }}
        >
          <strong style={{ color: BRAND.inkSoft }}>Si tu coupes :</strong> {i.siCoupe}
        </p>
      </div>

      {/* Les trois portées.

          LARGEURS FIXES, et c'est nécessaire : en disposition automatique, le
          tableau prend la largeur de son contenu le plus long — « rien —
          c'est GROUP_SPLIT_ENABLED qui décide » et la rangée de boutons ne
          se coupent nulle part. La carte débordait alors de la fenêtre, et la
          colonne des actions sortait de l'écran : les boutons existaient sans
          être atteignables. Vu à 1024 ET à 1440. */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '24%' }} />
          <col style={{ width: '26%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '34%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: BRAND.bgSubtle, borderTop: `1px solid ${BRAND.border}` }}>
            <th style={th}>Portée</th>
            <th style={th}>Réglage posé ici</th>
            <th style={th}>Ce que l’app voit</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          <Rangee
            titre="Tous les clubs"
            sous={superAdmin ? 'Le dernier recours.' : 'Réservé à Break Eat.'}
            ligne={ligneGlobale}
            siRien={`c’est ${i.defautEnv} qui décide`}
            voit={vu.global}
            desarme={!superAdmin}
            raisonDesarme="Seul Break Eat peut toucher à la portée globale."
            occupe={enCours === `${i.cle}:GLOBAL:`}
            onPoser={(v) => poser(i.cle, 'GLOBAL', undefined, v)}
            onRetirer={ligneGlobale ? () => retirer(ligneGlobale, `c’est ${i.defautEnv} qui décidera`) : undefined}
          />

          <Rangee
            titre={orgName || 'Mon club'}
            sous="L’emporte sur la portée globale."
            ligne={ligneClub}
            siRien="la portée globale décide"
            voit={undefined}
            noteVoit="se lit sur la ligne du match"
            desarme={!orgId}
            raisonDesarme="Aucun club sélectionné."
            occupe={enCours === `${i.cle}:ORGANIZATION:${orgId}`}
            onPoser={(v) => poser(i.cle, 'ORGANIZATION', orgId, v)}
            onRetirer={ligneClub ? () => retirer(ligneClub, 'la portée globale décidera') : undefined}
          />

          <tr style={{ borderTop: `1px solid ${BRAND.border}` }}>
            <td style={{ ...td, verticalAlign: 'top' }}>
              <div style={{ fontWeight: 600, color: BRAND.ink, marginBottom: 6 }}>Un match</div>
              <select
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: `1px solid ${BRAND.border}`,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  background: BRAND.surface,
                }}
              >
                <option value="">— choisir un match —</option>
                {evenements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {new Date(e.startAt).toLocaleDateString('fr-FR')}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 5 }}>
                L’emporte sur le club et sur le global.
              </div>
            </td>

            {matchId ? (
              <>
                <td style={td}>
                  <Pose ligne={ligneMatch} siRien="le réglage du club décide" />
                </td>
                <td style={td}>
                  <Pastille etat={vu.match} petite />
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <Boutons
                    ligne={ligneMatch}
                    occupe={enCours === `${i.cle}:EVENT:${matchId}`}
                    onPoser={(v) => poser(i.cle, 'EVENT', matchId, v)}
                    onRetirer={
                      ligneMatch ? () => retirer(ligneMatch, 'le réglage du club décidera') : undefined
                    }
                  />
                </td>
              </>
            ) : (
              <td colSpan={3} style={{ ...td, color: BRAND.grey, fontSize: 13 }}>
                Choisis un match pour voir ce que ses clients voient, et pour le régler à part.
              </td>
            )}
          </tr>
        </tbody>
      </table>

      {/* Le rappel qui évite la pire confusion */}
      <div
        style={{
          borderTop: `1px solid ${BRAND.border}`,
          background: BRAND.bgSubtle,
          padding: '12px 24px',
          fontSize: 12,
          color: BRAND.grey,
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: BRAND.inkSoft }}>Aucun réglage posé n’est pas « éteint ».</strong>{' '}
        Quand aucune portée ne décide, c’est la variable <code>{i.defautEnv}</code> du serveur qui
        tranche. « Retirer » rend donc la décision au niveau du dessus ; pour éteindre, il faut
        <em> couper</em>.
      </div>
    </div>
  );
}

function Rangee({
  titre,
  sous,
  ligne,
  siRien,
  voit,
  noteVoit,
  desarme,
  raisonDesarme,
  occupe,
  onPoser,
  onRetirer,
}: {
  titre: string;
  sous: string;
  ligne?: FeatureFlag;
  siRien: string;
  voit?: boolean;
  noteVoit?: string;
  desarme: boolean;
  raisonDesarme: string;
  occupe: boolean;
  onPoser: (v: boolean) => Promise<void>;
  onRetirer?: () => Promise<void>;
}) {
  return (
    <tr style={{ borderTop: `1px solid ${BRAND.border}` }}>
      <td style={td}>
        <div style={{ fontWeight: 600, color: BRAND.ink }}>{titre}</div>
        <div style={{ fontSize: 11, color: BRAND.grey, marginTop: 3 }}>{sous}</div>
      </td>
      <td style={td}>
        <Pose ligne={ligne} siRien={siRien} />
      </td>
      <td style={td}>
        {noteVoit ? (
          <span style={{ fontSize: 12, color: BRAND.grey }}>{noteVoit}</span>
        ) : (
          <Pastille etat={voit} petite />
        )}
      </td>
      <td style={{ ...td, textAlign: 'right' }}>
        {desarme ? (
          <span style={{ fontSize: 11, color: BRAND.grey }}>{raisonDesarme}</span>
        ) : (
          <Boutons ligne={ligne} occupe={occupe} onPoser={onPoser} onRetirer={onRetirer} />
        )}
      </td>
    </tr>
  );
}

/** Ce qui est posé à CETTE portée — et rien d'autre. */
function Pose({ ligne, siRien }: { ligne?: FeatureFlag; siRien: string }) {
  if (!ligne) {
    return (
      <span style={{ fontSize: 13, color: BRAND.grey }}>
        rien — <span style={{ fontStyle: 'italic' }}>{siRien}</span>
      </span>
    );
  }
  return (
    <span
      style={{
        background: ligne.enabled ? '#dcfce7' : '#fee2e2',
        color: ligne.enabled ? '#166534' : '#991b1b',
        borderRadius: 6,
        padding: '3px 10px',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {ligne.enabled ? 'allumé' : 'coupé'}
    </span>
  );
}

/** Ce que l'application voit RÉELLEMENT — venu de sa propre adresse. */
function Pastille({ etat, petite }: { etat?: boolean; petite?: boolean }) {
  if (etat === undefined) {
    return <span style={{ fontSize: 12, color: BRAND.grey }}>—</span>;
  }
  const actif = etat;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: actif ? '#dcfce7' : BRAND.bgSubtle,
        color: actif ? '#166534' : BRAND.inkSoft,
        borderRadius: 999,
        padding: petite ? '3px 10px' : '5px 14px',
        fontSize: petite ? 12 : 13,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: actif ? '#16a34a' : BRAND.grey,
        }}
      />
      {actif ? 'Actif' : 'Inactif'}
    </span>
  );
}

function Boutons({
  ligne,
  occupe,
  onPoser,
  onRetirer,
}: {
  ligne?: FeatureFlag;
  occupe: boolean;
  onPoser: (v: boolean) => Promise<void>;
  onRetirer?: () => Promise<void>;
}) {
  if (occupe) {
    return <span style={{ fontSize: 12, color: BRAND.grey }}>…</span>;
  }
  // Les boutons PASSENT À LA LIGNE plutôt que d'élargir la colonne : trois
  // boutons côte à côte dans une colonne fixe, c'est le genre de détail qui
  // pousse tout le tableau hors de l'écran.
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {ligne?.enabled !== true && (
        <button onClick={() => void onPoser(true)} style={btnAllumer}>
          Allumer
        </button>
      )}
      {ligne?.enabled !== false && (
        <button onClick={() => void onPoser(false)} style={btnCouper}>
          <Power size={12} strokeWidth={2.4} style={{ marginRight: 4, verticalAlign: -1 }} />
          Couper
        </button>
      )}
      {onRetirer && (
        <button onClick={() => void onRetirer()} style={btnRetirer} title="Rendre la décision au niveau du dessus">
          Retirer
        </button>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '9px 24px',
  color: BRAND.grey,
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
};
const td: React.CSSProperties = { padding: '14px 24px', verticalAlign: 'middle' };

const btnBase: React.CSSProperties = {
  borderRadius: 6,
  padding: '5px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnAllumer: React.CSSProperties = {
  ...btnBase,
  background: '#16a34a',
  color: '#fff',
  border: 'none',
};
const btnCouper: React.CSSProperties = {
  ...btnBase,
  background: '#fff',
  color: '#b91c1c',
  border: '1px solid #fca5a5',
};
const btnRetirer: React.CSSProperties = {
  ...btnBase,
  background: 'none',
  color: BRAND.grey,
  border: `1px solid ${BRAND.border}`,
  fontWeight: 500,
};
