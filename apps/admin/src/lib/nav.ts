import {
  Building2,
  CalendarDays,
  Contact,
  CreditCard,
  FileBarChart,
  FileText,
  LayoutDashboard,
  Megaphone,
  Palette,
  Receipt,
  Settings,
  Star,
  Store,
  Tags,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react';

/**
 * LE MENU DE LA CONSOLE — et les pages de section qui en découlent.
 *
 * Une seule source pour les deux : la barre de gauche et la page d'atterrissage
 * de chaque section lisent ce fichier. Décrire la navigation à deux endroits,
 * c'est se garantir qu'un jour l'un dira une chose et l'autre une autre.
 *
 * CHAQUE ENTRÉE PORTE UNE PHRASE, et c'est le cœur de l'affaire. Un libellé de
 * menu dit où l'on va ; il ne dit pas ce qu'on y fait. « Encaissement » ne
 * répond pas à « c'est là que je mets mon RIB ? ». La phrase, oui — et elle
 * n'est lisible que sur la page de section, là où l'on cherche.
 */

export type EntreeNav = {
  href: string;
  icon: LucideIcon;
  label: string;
  /** Ce qu'on y fait, en une phrase. Affichée sur la page de section. */
  description: string;
  external?: boolean;
};

export type GroupeNav = {
  /** Identifiant d'URL de la page de section : `/section/<slug>`. */
  slug: string;
  title: string;
  /** L'icône de la section dans le menu — c'est elle qu'on reconnaît avant le mot. */
  icon: LucideIcon;
  /** La phrase sous le titre de la page de section. */
  sous: string;
  items: EntreeNav[];
};

export const NAV_GROUPS: GroupeNav[] = [
  {
    slug: 'pilotage',
    icon: LayoutDashboard,
    title: 'Pilotage',
    sous: 'Ce que ton club a vendu, et à qui.',
    items: [
      {
        href: '/dashboard',
        icon: LayoutDashboard,
        label: 'Tableau de bord',
        description: "Le chiffre du jour, les événements en cours, et l'accès à tout le reste.",
      },
      {
        href: '/accounting',
        icon: Receipt,
        label: 'Comptabilité',
        description: "Chiffre d'affaires, TVA par taux, et l'export de tes ventes.",
      },
      {
        // Avec le tableau de bord et la comptabilité : c'est du PILOTAGE. Le
        // club y lit son audience et sa clientèle, pas une configuration.
        href: '/clients',
        icon: Contact,
        label: 'Mes clients',
        description: 'Qui commande, à quelle fréquence, et ce qu’ils consomment.',
      },
      {
        // Avec le pilotage : ce que les clients disent du service est une
        // MESURE, au même titre que le chiffre d'affaires — pas un réglage.
        href: '/avis',
        icon: Star,
        label: 'Avis clients',
        description: 'Les notes laissées après chaque retrait, buvette par buvette.',
      },
      {
        // Les rapports d'événements vivent chez Flaix, avec leurs propres
        // identifiants : on y mène, sans jamais toucher au mot de passe. Le lien
        // de CHAQUE match est sur sa fiche événement.
        href: 'https://ops.flaixlabs.com/login',
        icon: FileBarChart,
        label: 'Rapports Flaix',
        description: 'Les rapports détaillés de tes matchs, chez Flaix. Tes identifiants Flaix.',
        external: true,
      },
    ],
  },
  {
    // Regroupé par objet plutôt que par écran : « mon lieu », « mes points de
    // retrait », « mon équipe ». Le club cherche une chose, pas une page.
    slug: 'mon-lieu',
    icon: Building2,
    title: 'Mon lieu',
    sous: 'Tous les réglages du lieu, au même endroit.',
    items: [
      {
        // UNE entrée pour le lieu, et une seule.
        //
        // « Configurer mon lieu » pointait vers le wizard, « Fiche du lieu »
        // vers le vrai formulaire. Le club configurait donc dans un écran qui
        // CRÉE un ensemble neuf à chaque passage, puis relisait l'autre — d'où
        // « rien ne s'enregistre ». Deux portes pour un même objet, dont une
        // qui empile des doublons.
        href: '/organizations',
        icon: Building2,
        label: 'Mon lieu',
        description:
          "L'adresse, le fuseau, la photo vue par tes clients, le plan des buvettes et le relais Flaix.",
      },
      {
        href: '/events',
        icon: CalendarDays,
        label: 'Événements',
        description:
          'Créer un match, le rendre actif, et coller les liens de commande Flaix de la saison.',
      },
      {
        // L'apparence décrit ce que le client voit DE CE LIEU : sa place est ici,
        // pas dans un groupe « communication » avec les campagnes push.
        href: '/appearance',
        icon: Palette,
        label: "Apparence de l'app",
        description: "Couleurs, logo et raccourcis de l'accueil — ce que le client voit de toi.",
      },
      {
        // Le contrat signé avec Break Eat et les pièces du lieu : c'est une
        // pièce DU LIEU, pas un réglage système.
        href: '/documentation',
        icon: FileText,
        label: 'Documentation',
        description: 'Ton contrat Break Eat et les pièces du lieu, consultables à tout moment.',
      },
      {
        // Le wizard reste accessible, nommé pour ce qu'il est : la mise en place
        // INITIALE, pas l'écran où l'on revient modifier.
        href: '/wizard',
        icon: Wand2,
        label: 'Configuration de démarrage',
        description: 'La mise en place initiale, pas à pas. Pour revenir modifier, va dans Mon lieu.',
      },
    ],
  },
  {
    slug: 'points-de-retrait',
    icon: Store,
    title: 'Points de retrait',
    sous: 'Où l’on sert, et où va l’argent.',
    items: [
      {
        href: '/suppliers',
        icon: Store,
        label: 'Points de retrait',
        description: 'Les buvettes, leurs produits, leurs prix, leur TVA et leurs créneaux.',
      },
      {
        href: '/encaissement',
        icon: CreditCard,
        label: 'Encaissement',
        description: "Le compte Stripe du club — c'est lui qui reçoit l'argent des commandes.",
      },
    ],
  },
  {
    slug: 'equipe-clients',
    icon: Users,
    title: 'Équipe & clients',
    sous: 'Qui travaille, et qui a le droit de voir quoi.',
    items: [
      {
        href: '/team',
        icon: Users,
        label: 'Équipe',
        description: 'Les comptes de tes équipiers, et la buvette que chacun tient au comptoir.',
      },
      {
        href: '/groups',
        icon: Tags,
        label: 'Groupes de clients',
        description: "Qui a accès à un événement privé — par groupe, ou par domaine d'adresse.",
      },
    ],
  },
  {
    slug: 'communication',
    icon: Megaphone,
    title: 'Communication',
    sous: 'Parler à tes clients, au bon moment.',
    items: [
      {
        // « Notifications » — un push par ETAPE de commande — a ete retiree le
        // 07/09/2026 : la Live Activity raconte deja la progression, et le push
        // la doublait. Ce qui compte reste la CAMPAGNE, adressee a tous les
        // clients d'un club.
        href: '/campaigns',
        icon: Megaphone,
        label: 'Campagnes & push',
        description: 'Envoyer un message à tes clients — avant un match, ou après.',
      },
    ],
  },
  {
    slug: 'systeme',
    icon: Settings,
    title: 'Système',
    sous: 'Les réglages techniques. Rarement nécessaires.',
    items: [
      {
        href: '/settings',
        icon: Settings,
        label: 'Paramètres',
        description: 'Réglages techniques en clé-valeur. À ne toucher qu’en connaissance de cause.',
      },
    ],
  },
];

/** Retrouve un groupe par son identifiant d'URL. */
export function groupeParSlug(slug: string): GroupeNav | undefined {
  return NAV_GROUPS.find((g) => g.slug === slug);
}
