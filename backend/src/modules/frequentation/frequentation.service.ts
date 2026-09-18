import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { requireOrgAccess } from '../../common/helpers/require-org-access';
import { OrgRole } from '../../common/enums/role.enum';

/** Ce qu'on sait compter. Toute autre valeur est refusée sans être écrite. */
export const TYPES_VISITE = [
  'APP_OPEN',
  'LOGIN',
  'VENUE_VIEW',
  'EVENT_VIEW',
  'MENU_VIEW',
] as const;
export type TypeVisite = (typeof TYPES_VISITE)[number];

/**
 * Trente minutes : la durée d'une visite.
 *
 * Choisie pour que dix allers-retours entre la carte et le panier comptent pour
 * UNE visite. Plus court, on mesurerait la nervosité du client ; plus long, on
 * confondrait deux passages distincts à la mi-temps et après le match.
 */
const FENETRE_MS = 30 * 60 * 1000;

/**
 * La fréquentation de l'application : qui l'ouvre, et où.
 *
 * Ce que ça répond, et qui n'avait aucune réponse jusqu'ici : « combien de
 * personnes ont ouvert notre carte pendant le match, et combien ont commandé ».
 * Les commandes seules ne disent que la seconde moitié — elles ne savent rien
 * de ceux qui ont regardé et sont repartis.
 *
 * LIMITE À CONNAÎTRE, et à répéter à qui lit ces chiffres : la mesure repose
 * sur un identifiant d'installation que l'application fournit elle-même. Elle
 * compte donc des appareils, pas des personnes — un client qui désinstalle et
 * réinstalle compte deux fois — et rien n'empêcherait quelqu'un de fabriquer de
 * fausses visites. Ce sont des ordres de grandeur d'audience, pas des chiffres
 * certifiés comme l'est le chiffre d'affaires.
 */
@Injectable()
export class FrequentationService {
  private readonly logger = new Logger(FrequentationService.name);

  /** Lire l'audience d'un club : même cercle que le fichier client. */
  private static readonly ROLES = [OrgRole.ORG_ADMIN, OrgRole.MANAGER, OrgRole.MARKETING];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enregistre une visite. Silencieuse : elle ne renvoie rien et ne fait jamais
   * échouer l'application.
   *
   * Une mesure d'audience ne doit jamais empêcher un client de commander. Tout
   * ce qui cloche ici — lieu inconnu, type inattendu, base indisponible — se
   * termine en journal, pas en erreur remontée à l'écran.
   */
  async signaler(
    visite: {
      visitorKey: string;
      kind: TypeVisite;
      venueId?: string | null;
      eventId?: string | null;
    },
    userId?: string,
  ): Promise<void> {
    try {
      const perimetre = await this.resoudrePerimetre(visite.venueId, visite.eventId);
      // Un lieu ou un événement qu'on ne reconnaît pas n'écrit RIEN. Sans ce
      // garde-fou, n'importe qui pourrait gonfler la table avec des
      // identifiants inventés.
      if (perimetre === null) return;

      const scope = `${visite.kind}:${perimetre.venueId ?? '-'}:${perimetre.eventId ?? '-'}`;
      const windowStart = new Date(Math.floor(Date.now() / FENETRE_MS) * FENETRE_MS);

      await this.prisma.frequentation.upsert({
        where: {
          visitorKey_scope_windowStart: { visitorKey: visite.visitorKey, scope, windowStart },
        },
        // Revenir dans la même demi-heure n'ajoute pas une visite : ça épaissit
        // celle qui existe.
        update: { hits: { increment: 1 }, ...(userId ? { userId } : {}) },
        create: {
          visitorKey: visite.visitorKey,
          userId: userId ?? null,
          organizationId: perimetre.organizationId,
          venueId: perimetre.venueId,
          eventId: perimetre.eventId,
          kind: visite.kind,
          scope,
          windowStart,
        },
      });
    } catch (e: unknown) {
      this.logger.warn(
        `Visite non enregistrée (${visite.kind}) : ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * À quel club rattacher cette visite.
   *
   * Jamais d'après ce que dit l'application : elle pourrait se tromper, ou
   * mentir. Le club se DÉDUIT du lieu ou de l'événement, relus en base.
   */
  private async resoudrePerimetre(
    venueId?: string | null,
    eventId?: string | null,
  ): Promise<{ organizationId: string | null; venueId: string | null; eventId: string | null } | null> {
    if (eventId) {
      const evenement = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: { organizationId: true, venueId: true },
      });
      if (!evenement) return null;
      return {
        organizationId: evenement.organizationId,
        venueId: venueId ?? evenement.venueId,
        eventId,
      };
    }
    if (venueId) {
      const lieu = await this.prisma.venue.findUnique({
        where: { id: venueId },
        select: { organizationId: true },
      });
      if (!lieu) return null;
      return { organizationId: lieu.organizationId, venueId, eventId: null };
    }
    // Ouverture de l'application sans destination : comptée pour la plateforme.
    return { organizationId: null, venueId: null, eventId: null };
  }

  /** L'audience d'un club, avec de quoi la lire par jour et par lieu. */
  async pourOrganisation(
    orgId: string,
    userId: string,
    filtre: FiltreFrequentation = {},
  ): Promise<AudienceClub> {
    await requireOrgAccess(this.prisma, userId, orgId, FrequentationService.ROLES);

    const where: Prisma.FrequentationWhereInput = {
      organizationId: orgId,
      ...(filtre.venueId ? { venueId: filtre.venueId } : {}),
      ...(filtre.eventId ? { eventId: filtre.eventId } : {}),
      ...(filtre.du || filtre.au
        ? {
            windowStart: {
              ...(filtre.du ? { gte: filtre.du } : {}),
              ...(filtre.au ? { lte: filtre.au } : {}),
            },
          }
        : {}),
    };

    const [visites, commandes] = await Promise.all([
      this.prisma.frequentation.findMany({
        where,
        select: {
          visitorKey: true,
          userId: true,
          venueId: true,
          hits: true,
          windowStart: true,
        },
      }),
      this.prisma.order.groupBy({
        by: ['userId', 'venueId'],
        where: {
          organizationId: orgId,
          paymentStatus: PaymentStatus.SUCCEEDED,
          status: { not: OrderStatus.CANCELLED },
          ...(filtre.venueId ? { venueId: filtre.venueId } : {}),
          ...(filtre.eventId ? { eventId: filtre.eventId } : {}),
          ...(filtre.du || filtre.au
            ? {
                createdAt: {
                  ...(filtre.du ? { gte: filtre.du } : {}),
                  ...(filtre.au ? { lte: filtre.au } : {}),
                },
              }
            : {}),
        },
      }),
    ]);

    const visiteurs = new Set(visites.map((v) => v.visitorKey));
    const connectes = new Set(visites.filter((v) => v.userId).map((v) => v.userId as string));
    const acheteurs = new Set(commandes.map((c) => c.userId));

    // Les clients de CHAQUE lieu : un habitué du Vélodrome qui commande une
    // fois à l'annexe compte pour les deux, et c'est ce qu'un club veut savoir.
    const clientsParLieu = new Map<string, Set<string>>();
    for (const c of commandes) {
      const deja = clientsParLieu.get(c.venueId) ?? new Set<string>();
      deja.add(c.userId);
      clientsParLieu.set(c.venueId, deja);
    }

    // Ceux qui ont REGARDÉ puis COMMANDÉ, sur la même période et le même
    // périmètre. C'est cette intersection qui donne un taux honnête : le
    // numérateur et le dénominateur comptent alors la même chose — des comptes.
    //
    // Le rapport « acheteurs / visiteurs uniques » serait trompeur : il
    // diviserait des COMPTES par des APPAREILS. Un client qui regarde sur son
    // téléphone et commande depuis le même compte compterait une fois en haut
    // et une fois en bas, mais un visiteur non connecté ne peut jamais entrer
    // au numérateur — le taux paraîtrait donc plus faible qu'il n'est.
    const connectesAyantCommande = [...connectes].filter((c) => acheteurs.has(c)).length;

    // La toute première ouverture de chaque appareil : ce qui distingue une
    // découverte d'un habitué.
    const decouvertes = await this.premieresOuvertures([...visiteurs]);
    const nouveaux = [...visiteurs].filter((cle) => {
      const premiere = decouvertes.get(cle);
      return premiere !== undefined && (!filtre.du || premiere.quand >= filtre.du);
    }).length;

    // Les noms de lieux, pour que le tableau se lise sans aller les chercher.
    const lieuxIds = [...new Set(visites.map((v) => v.venueId).filter((v): v is string => !!v))];
    const noms = new Map(
      (
        await this.prisma.venue.findMany({
          where: { id: { in: lieuxIds } },
          select: { id: true, name: true },
        })
      ).map((v) => [v.id, v.name]),
    );

    return {
      visiteursUniques: visiteurs.size,
      visites: visites.reduce((total, v) => total + v.hits, 0),
      visiteursConnectes: connectes.size,
      clientsAyantCommande: acheteurs.size,
      connectesAyantCommande,
      // Parmi les visiteurs IDENTIFIÉS, la part qui a commandé. Nulle quand
      // personne d'identifié n'est venu : afficher 0 % serait un jugement, pas
      // une mesure.
      tauxConversion:
        connectes.size > 0 ? Math.round((connectesAyantCommande / connectes.size) * 1000) / 10 : null,
      nouveauxVisiteurs: nouveaux,
      parJour: this.parJour(visites),
      parLieu: this.parLieu(visites, noms, decouvertes, clientsParLieu, filtre.du),
    };
  }

  /**
   * Où et quand chaque appareil a ouvert l'application POUR LA PREMIÈRE FOIS.
   *
   * C'est ce qui remplace, honnêtement, le « nombre de téléchargements par
   * lieu » — qu'aucune boutique d'applications ne fournit : un téléchargement
   * se passe avant que l'app ne s'ouvre, et Apple ne dit ni où ni par qui.
   *
   * Ce chiffre-ci vaut mieux, d'ailleurs : quelqu'un qui télécharge et n'ouvre
   * jamais n'apporte rien à un club.
   *
   * `DISTINCT ON` est une particularité PostgreSQL, et c'est elle qui rend la
   * chose possible en UNE requête : pour chaque appareil, la ligne la plus
   * ancienne, avec le lieu où elle a eu lieu.
   */
  private async premieresOuvertures(
    cles: string[],
  ): Promise<Map<string, { venueId: string | null; quand: Date }>> {
    if (cles.length === 0) return new Map();

    const lignes = await this.prisma.$queryRaw<
      Array<{ visitor_key: string; venue_id: string | null; window_start: Date }>
    >`
      SELECT DISTINCT ON ("visitor_key") "visitor_key", "venue_id", "window_start"
      FROM "frequentation"
      WHERE "visitor_key" IN (${Prisma.join(cles)})
      ORDER BY "visitor_key", "window_start" ASC
    `;
    return new Map(
      lignes.map((l) => [l.visitor_key, { venueId: l.venue_id, quand: l.window_start }]),
    );
  }

  private parJour(visites: LigneVisite[]): TrancheAudience[] {
    const jours = new Map<string, { visiteurs: Set<string>; visites: number }>();
    for (const v of visites) {
      const jour = v.windowStart.toISOString().slice(0, 10);
      const tranche = jours.get(jour) ?? { visiteurs: new Set<string>(), visites: 0 };
      tranche.visiteurs.add(v.visitorKey);
      tranche.visites += v.hits;
      jours.set(jour, tranche);
    }
    return [...jours.entries()]
      .map(([jour, t]) => ({ jour, visiteursUniques: t.visiteurs.size, visites: t.visites }))
      .sort((a, b) => a.jour.localeCompare(b.jour));
  }

  private parLieu(
    visites: LigneVisite[],
    noms: Map<string, string>,
    decouvertes: Map<string, { venueId: string | null; quand: Date }>,
    clientsParLieu: Map<string, Set<string>>,
    depuis?: Date,
  ): AudienceLieu[] {
    const lieux = new Map<string, { visiteurs: Set<string>; visites: number; neufs: Set<string> }>();
    for (const v of visites) {
      if (!v.venueId) continue;
      const ligne = lieux.get(v.venueId) ?? {
        visiteurs: new Set<string>(),
        visites: 0,
        neufs: new Set<string>(),
      };
      ligne.visiteurs.add(v.visitorKey);
      ligne.visites += v.hits;

      // Un NOUVEAU visiteur de ce lieu : celui dont la toute première ouverture
      // de l'application, jamais, a eu lieu ICI — et dans la période lue. Un
      // client qui connaissait déjà Break Eat par un autre stade ne compte pas
      // comme une découverte pour ce club.
      const premiere = decouvertes.get(v.visitorKey);
      if (premiere && premiere.venueId === v.venueId && (!depuis || premiere.quand >= depuis)) {
        ligne.neufs.add(v.visitorKey);
      }
      lieux.set(v.venueId, ligne);
    }
    return [...lieux.entries()]
      .map(([venueId, l]) => ({
        venueId,
        nom: noms.get(venueId) ?? 'Lieu supprimé',
        visiteursUniques: l.visiteurs.size,
        visites: l.visites,
        nouveauxVisiteurs: l.neufs.size,
        clients: clientsParLieu.get(venueId)?.size ?? 0,
      }))
      .sort((a, b) => b.visiteursUniques - a.visiteursUniques);
  }
}

interface LigneVisite {
  visitorKey: string;
  userId: string | null;
  venueId: string | null;
  hits: number;
  windowStart: Date;
}

export interface FiltreFrequentation {
  venueId?: string;
  eventId?: string;
  du?: Date;
  au?: Date;
}

export interface TrancheAudience {
  jour: string;
  visiteursUniques: number;
  visites: number;
}

export interface AudienceLieu {
  venueId: string;
  nom: string;
  visiteursUniques: number;
  visites: number;
  /** Appareils dont la toute PREMIÈRE ouverture de l'app a eu lieu ici. */
  nouveauxVisiteurs: number;
  /** Comptes DISTINCTS ayant commandé dans ce lieu sur la période. */
  clients: number;
}

export interface AudienceClub {
  visiteursUniques: number;
  visites: number;
  visiteursConnectes: number;
  clientsAyantCommande: number;
  /**
   * Appareils qui ont découvert Break Eat pendant la période lue, tous lieux
   * confondus. Ce que ne dit AUCUNE boutique d'applications : un
   * téléchargement se passe avant la première ouverture, et personne ne sait
   * où. Celui-ci vaut mieux — télécharger sans jamais ouvrir n'apporte rien.
   */
  nouveauxVisiteurs: number;
  /** Visiteurs identifiés qui ont AUSSI commandé — le numérateur du taux. */
  connectesAyantCommande: number;
  /**
   * Part des visiteurs IDENTIFIÉS qui ont commandé, en pourcentage, une
   * décimale. `null` quand aucun visiteur identifié n'est venu.
   *
   * Calculé sur les seuls visiteurs connectés, et c'est délibéré : le
   * numérateur et le dénominateur comptent alors la même chose. Rapporter des
   * comptes à des appareils donnerait un nombre qu'on ne saurait pas lire.
   */
  tauxConversion: number | null;
  parJour: TrancheAudience[];
  parLieu: AudienceLieu[];
}
