'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star } from 'lucide-react';

import { BRAND } from '@/lib/brand';
import { getOrgId, apiGetOrgAvis, type AvisOrganisation } from '@/lib/api/admin-client';
import { Carte, Grille, Page, PageHeader, TitreCarte } from '@/components/ui';

/**
 * LES AVIS DES CLIENTS.
 *
 * Posés après chaque retrait, sur la BUVETTE qui a préparé. C'est le seul
 * retour direct que le club reçoit de ses clients : le chiffre d'affaires dit
 * combien on a vendu, pas si les gens sont repartis contents.
 *
 * La RÉPARTITION est aussi importante que la moyenne, et c'est pourquoi elle
 * occupe autant de place. Un 3 de moyenne recouvre deux situations opposées :
 * « tout le monde trouve ça moyen » et « la moitié adore, la moitié
 * déteste ». La seconde se corrige — on sait quoi chercher —, la première se
 * repense.
 */
export default function AvisPage() {
  const [avis, setAvis] = useState<AvisOrganisation | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    const orgId = getOrgId();
    if (!orgId) {
      setErreur('Aucun club associé à ce compte.');
      setChargement(false);
      return;
    }
    try {
      setAvis(await apiGetOrgAvis(orgId));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Chargement impossible');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (chargement) {
    return (
      <Page>
        <PageHeader titre="Avis clients" />
        <p style={{ color: BRAND.grey }}>Chargement…</p>
      </Page>
    );
  }

  if (erreur) {
    return (
      <Page>
        <PageHeader titre="Avis clients" />
        <Carte>
          <p style={{ color: BRAND.danger, margin: 0 }}>{erreur}</p>
        </Carte>
      </Page>
    );
  }

  const total = avis?.total ?? 0;
  const maxBarre = Math.max(1, ...(avis?.repartition ?? []).map((r) => r.nombre));

  return (
    <Page>
      <PageHeader
        titre="Avis clients"
        sous="Les notes laissées après un retrait, sur la buvette qui a préparé. Le chiffre d’affaires dit combien tu as vendu ; ceci dit si les gens sont repartis contents."
      />

      {total === 0 ? (
        /* Un écran vide qui EXPLIQUE, plutôt qu'un zéro sec : la première
           question d'un club devant une page sans note est « est-ce que ça
           marche ? ». */
        <Carte>
          <TitreCarte
            titre="Aucune note pour l’instant"
            sous="La question est posée dans l’application après chaque commande récupérée. Les premières notes arriveront avec les premiers retraits."
          />
        </Carte>
      ) : (
        <>
          <Grille min={260}>
            <Carte style={{ padding: 20 }}>
              <div style={{ fontSize: 12.5, color: BRAND.grey, fontWeight: 600 }}>
                Note moyenne
              </div>
              <div
                style={{
                  fontFamily: BRAND.fontDisplay,
                  fontSize: 38,
                  fontWeight: 800,
                  color: BRAND.orange,
                  letterSpacing: -1,
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                }}
              >
                {avis?.moyenne?.toFixed(1).replace('.', ',')}
                <span style={{ fontSize: 17, color: BRAND.grey, fontWeight: 600 }}>/ 5</span>
              </div>
              <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    size={17}
                    strokeWidth={2}
                    color={BRAND.orange}
                    fill={n <= Math.round(avis?.moyenne ?? 0) ? BRAND.orange : 'transparent'}
                  />
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: BRAND.grey, marginTop: 8 }}>
                sur {total} note{total > 1 ? 's' : ''}
              </div>
            </Carte>

            <Carte style={{ padding: 20, gridColumn: 'span 2' }}>
              <div
                style={{ fontSize: 12.5, color: BRAND.grey, fontWeight: 600, marginBottom: 12 }}
              >
                Répartition
              </div>
              {/* De 5 à 1 : on lit d'abord ce qui va bien, et l'œil descend
                  vers ce qui coince. L'inverse ouvre sur une mauvaise
                  nouvelle à chaque chargement. */}
              {[...(avis?.repartition ?? [])].reverse().map((r) => (
                <div
                  key={r.stars}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}
                >
                  <span
                    style={{
                      width: 34,
                      fontSize: 13,
                      color: BRAND.inkSoft,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    {r.stars}
                    <Star size={12} color={BRAND.orange} fill={BRAND.orange} />
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 10,
                      borderRadius: 999,
                      background: BRAND.bgSubtle,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${(r.nombre / maxBarre) * 100}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: BRAND.orange,
                      }}
                    />
                  </div>
                  <span
                    style={{ width: 32, textAlign: 'right', fontSize: 13, color: BRAND.inkSoft }}
                  >
                    {r.nombre}
                  </span>
                </div>
              ))}
            </Carte>
          </Grille>

          <Carte style={{ marginTop: 18 }}>
            <TitreCarte
              titre="Les derniers retours"
              sous="Le commentaire est facultatif : la plupart des clients notent sans écrire."
            />
            {avis?.notes.map((n, i) => (
              <div
                key={n.id}
                style={{
                  paddingTop: i === 0 ? 0 : 14,
                  paddingBottom: 14,
                  borderBottom:
                    i === (avis?.notes.length ?? 0) - 1 ? 'none' : `1px solid ${BRAND.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', gap: 1 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={14}
                        color={BRAND.orange}
                        fill={s <= n.stars ? BRAND.orange : 'transparent'}
                      />
                    ))}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: BRAND.ink }}>
                    {n.buvette ?? 'Buvette supprimée'}
                  </span>
                  <span style={{ fontSize: 12.5, color: BRAND.grey }}>
                    {n.commande != null ? `commande ${n.commande} · ` : ''}
                    {new Date(n.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {n.comment ? (
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: BRAND.inkSoft,
                      borderLeft: `3px solid ${BRAND.orangeTint}`,
                      paddingLeft: 12,
                    }}
                  >
                    {n.comment}
                  </p>
                ) : null}
              </div>
            ))}
          </Carte>
        </>
      )}
    </Page>
  );
}
