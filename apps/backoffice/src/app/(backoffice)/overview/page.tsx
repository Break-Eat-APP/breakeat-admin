'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Building2,
  Link2,
  UserCircle,
  Users,
} from 'lucide-react';
import { apiGetKpis, apiListOrganizations } from '@/lib/api/backoffice-client';
import { BRAND } from '@break-eat/brand';
import { PurgeDemo } from '@/components/purge-demo';
import {
  Carte,
  CarteLien,
  Grille,
  Kpi,
  Page,
  PageHeader,
  TitreSection,
} from '@/components/ui';

/**
 * LA VUE D'ENSEMBLE — et le point d'entrée vers tout le reste.
 *
 * Deux choses sur un seul écran, et c'est voulu :
 *
 *  1. LES CHIFFRES de la plateforme. Ils répondent à « où en est-on ? » ;
 *  2. LES DESTINATIONS, groupées par question. Elles répondent à « où vais-je
 *     pour faire ça ? ».
 *
 * Le menu latéral sait déjà y mener, mais un menu se lit mot à mot. Une grille
 * de cartes se parcourt d'un regard, et chaque carte dit son ÉTAT — « 3 clubs »,
 * « 12 comptes » — ce qu'un menu ne dira jamais. C'est la différence entre
 * savoir où cliquer et savoir ce qu'on va y trouver.
 */
export default function OverviewPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['backoffice-kpis'],
    queryFn: apiGetKpis,
  });

  // Le détail par club sert la carte « Organisations » : un nombre vu d'ici
  // évite d'ouvrir l'écran pour savoir s'il y a quelque chose dedans.
  const { data: clubs } = useQuery({
    queryKey: ['backoffice-orgs-resume'],
    queryFn: apiListOrganizations,
  });

  const tauxCollectes = data?.revenue.vatBreakdown?.map((t) => t.label) ?? [];

  const nbClubs = clubs?.length ?? data?.organizationsCount ?? 0;
  const nbEvenements = clubs?.reduce((t, c) => t + (c._count?.events ?? 0), 0) ?? 0;
  const nbGroupes = clubs?.reduce((t, c) => t + (c._count?.groups ?? 0), 0) ?? 0;

  return (
    <Page>
      <PageHeader
        titre="Vue d'ensemble"
        sous="Les chiffres de toute la plateforme, et l'accès à chaque réglage."
      />

      {/* Au-dessus des chiffres : c'est la démonstration qui les fausse. */}
      <PurgeDemo />

      {isLoading ? <Muet>Chargement des indicateurs…</Muet> : null}
      {isError ? (
        <Carte style={{ borderColor: BRAND.dangerBg, background: BRAND.dangerBg }}>
          <span style={{ color: BRAND.danger, fontSize: 13.5 }}>
            {error instanceof Error ? error.message : 'Impossible de charger les indicateurs.'}
          </span>
        </Carte>
      ) : null}

      {data ? (
        <>
          <TitreSection>Chiffre d&apos;affaires</TitreSection>
          <Grille min={230}>
            <Kpi libelle="CA total TTC" valeur={formatEuros(data.revenue.caTtcCents)} accent />
            <Kpi
              libelle="CA total HT"
              valeur={formatEuros(data.revenue.caHtCents)}
              indice={
                tauxCollectes.length > 0
                  ? `TVA ${tauxCollectes.join(' · ')}`
                  : 'TVA par taux de produit'
              }
            />
            <Kpi libelle="Commandes" valeur={data.ordersCount.toLocaleString('fr-FR')} />
          </Grille>

          <TitreSection>Panier moyen</TitreSection>
          <Grille min={230}>
            <Kpi libelle="Panier moyen TTC" valeur={formatEuros(data.averageBasket.ttcCents)} />
            <Kpi libelle="Panier moyen HT" valeur={formatEuros(data.averageBasket.htCents)} />
            <Kpi libelle="Comptes clients" valeur={data.accountsCount.toLocaleString('fr-FR')} />
          </Grille>
        </>
      ) : null}

      {/* ── Les destinations, rangées par question ───────────────────── */}

      <TitreSection>Clubs</TitreSection>
      <Grille>
        <CarteLien
          href="/organizations"
          icone={Building2}
          titre="Organisations"
          description="Créer un club, régler son lieu, son encaissement, et donner l'accès à son responsable."
          etat={`${nbClubs} club${nbClubs > 1 ? 's' : ''} · ${nbEvenements} événement${nbEvenements > 1 ? 's' : ''}`}
        />
        <CarteLien
          href="/liens-flaix"
          icone={Link2}
          titre="Liens de commande"
          description="Coller les adresses Flaix d'une saison entière. C'est la date qui décide laquelle s'ouvre."
          etat="Un lien par match"
        />
      </Grille>

      <TitreSection>Personnes</TitreSection>
      <Grille>
        <CarteLien
          href="/users"
          icone={UserCircle}
          titre="Utilisateurs"
          description="Tous les comptes de la plateforme, leurs rôles, et les comptes archivés."
          etat={`${(data?.accountsCount ?? 0).toLocaleString('fr-FR')} compte${(data?.accountsCount ?? 0) > 1 ? 's' : ''}`}
        />
        <CarteLien
          href="/groups"
          icone={Users}
          titre="Groupes & accès"
          description="Qui a le droit de voir un événement privé — par groupe, ou par domaine d'adresse."
          etat={`${nbGroupes} groupe${nbGroupes > 1 ? 's' : ''}`}
        />
      </Grille>

      <TitreSection>Communication</TitreSection>
      <Grille>
        <CarteLien
          href="/notifications"
          icone={Bell}
          titre="Notifications"
          description="Programmer un message pour les clients d'un événement, et suivre ce qui est parti."
          etat="Envois programmés"
        />
      </Grille>
    </Page>
  );
}

function Muet({ children }: { children: React.ReactNode }) {
  return <p style={{ color: BRAND.grey, fontSize: 13.5, margin: '14px 0' }}>{children}</p>;
}

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });
}
