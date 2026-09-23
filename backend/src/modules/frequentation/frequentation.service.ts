import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { jourDeService } from '../../common/helpers/jour-de-service';
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
 * Le premier jour où la fréquentation a été mesurée (mise en service).
 *
 * Avant cette date, un jour avec des commandes et « 0 visiteur » ne dit PAS
 * que personne n'est venu : il dit que personne ne comptait. Le tableau de bord
 * l'écrit en toutes lettres plutôt que d'afficher des zéros.
 */
export const DEBUT_MESURE_FREQUENTATION = '2026-09-18';

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

    // Le même périmètre que la comptabilité : payé, et non annulé.
    const whereCommandes: Prisma.OrderWhereInput = {
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
    };

    const [visites, commandes, ventes, matchs] = await Promise.all([
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
      this.prisma.order.groupBy({ by: ['userId', 'venueId'], where: whereCommandes }),
      // Pour le détail PAR JOUR : quand, combien, où.
      this.prisma.order.findMany({
        where: whereCommandes,
        select: { createdAt: true, totalCents: true, venueId: true, userId: true },
      }),
      // Les matchs de la période, pour nommer chaque jour. Le contenant
      // invisible d'un lieu ouvert en continu n'est pas un match.
      this.prisma.event.findMany({
        where: {
          organizationId: orgId,
          isPermanentContainer: false,
          ...(filtre.venueId ? { venueId: filtre.venueId } : {}),
          ...(filtre.eventId ? { id: filtre.eventId } : {}),
          ...(filtre.du || filtre.au
            ? {
                startAt: {
                  ...(filtre.du ? { gte: filtre.du } : {}),
                  ...(filtre.au ? { lte: filtre.au } : {}),
                },
              }
            : {}),
        },
        select: { name: true, startAt: true, venueId: true },
      }),
    ]);

    const visiteurs = new Set(visites.map((v) => v.visitorKey));
    const connectes = new Set(visites.filter((v) => v.userId).map((v) => v.userId as string));
    // Un téléphone est ANONYME tant qu'aucune de ses visites n'a porté de
    // compte. Celui qui se connecte en cours de route bascule du côté des
    // connectés : on le connaît, il n'a plus rien d'anonyme.
    const identifies = new Set(visites.filter((v) => v.userId).map((v) => v.visitorKey));
    const anonymes = [...visiteurs].filter((cle) => !identifies.has(cle)).length;
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

    // Le PREMIER LIEU que chaque appareil a jamais ouvert : ce qui distingue une
    // découverte d'un habitué.
    const decouvertes = await this.premiersLieux([...visiteurs]);
    // Même règle que la colonne « Nouveaux » de chaque lieu, pour que la carte
    // du haut et le tableau ne se contredisent jamais : la découverte a eu lieu
    // CHEZ CE CLUB (et dans ce lieu si on en a choisi un), pendant la période.
    // Elle comptait tout appareil ouvert pour la première fois dans la période,
    // où qu'il ait découvert l'application.
    const nouveaux = [...visiteurs].filter((cle) => {
      const premiere = decouvertes.get(cle);
      return (
        premiere !== undefined &&
        premiere.organizationId === orgId &&
        (!filtre.venueId || premiere.venueId === filtre.venueId) &&
        (!filtre.du || premiere.quand >= filtre.du)
      );
    }).length;

    // Les noms de lieux, pour que le tableau se lise sans aller les chercher —
    // et leurs FUSEAUX, pour que chaque jour soit celui du comptoir.
    const lieuxIds = [
      ...new Set(
        [
          ...visites.map((v) => v.venueId),
          ...ventes.map((v) => v.venueId),
          ...matchs.map((m) => m.venueId),
        ].filter((v): v is string => !!v),
      ),
    ];
    const lieux = await this.prisma.venue.findMany({
      where: { id: { in: lieuxIds } },
      select: { id: true, name: true, timezone: true },
    });
    const noms = new Map(lieux.map((v) => [v.id, v.name]));
    const fuseaux = new Map(lieux.map((v) => [v.id, v.timezone]));
    const jourDe = (instant: Date, venueId: string | null) =>
      jourDeService(instant, (venueId && fuseaux.get(venueId)) || 'Europe/Paris')
        .toISOString()
        .slice(0, 10);

    // Un nouveau visiteur compte le jour de SA découverte — même règle que la
    // carte du haut.
    const decouvertesDuClub = [...visiteurs].flatMap((cle) => {
      const premiere = decouvertes.get(cle);
      return premiere &&
        premiere.organizationId === orgId &&
        (!filtre.venueId || premiere.venueId === filtre.venueId) &&
        (!filtre.du || premiere.quand >= filtre.du)
        ? [{ cle, premiere }]
        : [];
    });

    return {
      visiteursUniques: visiteurs.size,
      // Les DEUX chiffres qui ne se recoupent jamais : un téléphone anonyme
      // n'est pas dans `visiteursConnectes`, et inversement.
      visiteursAnonymes: anonymes,
      visites: compterPassages(visites),
      visiteursConnectes: connectes.size,
      clientsAyantCommande: acheteurs.size,
      connectesAyantCommande,
      // Parmi les visiteurs IDENTIFIÉS, la part qui a commandé. Nulle quand
      // personne d'identifié n'est venu : afficher 0 % serait un jugement, pas
      // une mesure.
      tauxConversion:
        connectes.size > 0 ? Math.round((connectesAyantCommande / connectes.size) * 1000) / 10 : null,
      nouveauxVisiteurs: nouveaux,
      ...this.parJour({ visites, ventes, matchs, decouvertes: decouvertesDuClub, jourDe }),
      parLieu: this.parLieu(visites, noms, decouvertes, clientsParLieu, filtre.du),
    };
  }

  /**
   * Le PREMIER LIEU que chaque appareil a jamais ouvert dans l'application, et
   * quand.
   *
   * C'est ce qui remplace, honnêtement, le « nombre de téléchargements par
   * lieu » — qu'aucune boutique d'applications ne fournit : un téléchargement
   * se passe avant que l'app ne s'ouvre, et Apple ne dit ni où ni par qui.
   *
   * Le premier LIEU, et non la première ouverture : chaque lancement signale
   * d'abord une ouverture SANS lieu (l'écran d'accueil), avant que le client ne
   * choisisse un stade. La toute première ligne d'un appareil n'est donc jamais
   * dans un lieu — la prendre faisait tomber la colonne « Nouveaux » à zéro
   * partout.
   *
   * `DISTINCT ON` est une particularité PostgreSQL, et c'est elle qui rend la
   * chose possible en UNE requête : pour chaque appareil, la plus ancienne
   * ligne rattachée à un lieu.
   */
  private async premiersLieux(
    cles: string[],
  ): Promise<Map<string, { organizationId: string | null; venueId: string; quand: Date }>> {
    if (cles.length === 0) return new Map();

    // `created_at` DÉPARTAGE : deux lieux ouverts dans la même demi-heure ont la
    // même `window_start`, et PostgreSQL choisissait alors au hasard — un essai
    // passait ou échouait selon le tirage. La ligne créée la première est celle
    // du lieu ouvert le premier.
    const lignes = await this.prisma.$queryRaw<
      Array<{
        visitor_key: string;
        organization_id: string | null;
        venue_id: string;
        window_start: Date;
      }>
    >`
      SELECT DISTINCT ON ("visitor_key") "visitor_key", "organization_id", "venue_id", "window_start"
      FROM "frequentation"
      WHERE "visitor_key" IN (${Prisma.join(cles)})
        AND "venue_id" IS NOT NULL
      ORDER BY "visitor_key", "window_start" ASC, "created_at" ASC
    `;
    return new Map(
      lignes.map((l) => [
        l.visitor_key,
        { organizationId: l.organization_id, venueId: l.venue_id, quand: l.window_start },
      ]),
    );
  }

  /**
   * Le détail JOUR PAR JOUR : ce qui répond à « quel jour avons-nous eu le
   * plus de monde », qu'une somme sur 30 jours noie.
   *
   * Le jour est le JOUR DE SERVICE du lieu (bascule à 4h, heure locale) — le
   * même que la numérotation des commandes. Découper à minuit UTC rangeait la
   * fin d'un match du soir sur le lendemain.
   */
  private parJour(e: {
    visites: LigneVisite[];
    ventes: Array<{ createdAt: Date; totalCents: number; venueId: string; userId: string }>;
    matchs: Array<{ name: string; startAt: Date; venueId: string }>;
    decouvertes: Array<{ cle: string; premiere: { venueId: string; quand: Date } }>;
    jourDe: (instant: Date, venueId: string | null) => string;
  }): { parJour: TrancheAudience[]; meilleurJour: string | null } {
    const jours = new Map<
      string,
      {
        visiteurs: Set<string>;
        identifies: Set<string>;
        passages: Set<string>;
        nouveaux: Set<string>;
        connectes: Set<string>;
        acheteurs: Set<string>;
        commandes: number;
        caTtcCents: number;
        evenements: Set<string>;
      }
    >();
    const jour = (cle: string) => {
      let tranche = jours.get(cle);
      if (!tranche) {
        tranche = {
          visiteurs: new Set(),
          identifies: new Set(),
          passages: new Set(),
          nouveaux: new Set(),
          connectes: new Set(),
          acheteurs: new Set(),
          commandes: 0,
          caTtcCents: 0,
          evenements: new Set(),
        };
        jours.set(cle, tranche);
      }
      return tranche;
    };

    for (const v of e.visites) {
      const t = jour(e.jourDe(v.windowStart, v.venueId));
      t.visiteurs.add(v.visitorKey);
      t.passages.add(clePassage(v));
      if (v.userId) {
        t.connectes.add(v.userId);
        t.identifies.add(v.visitorKey);
      }
    }
    for (const d of e.decouvertes) {
      jour(e.jourDe(d.premiere.quand, d.premiere.venueId)).nouveaux.add(d.cle);
    }
    for (const c of e.ventes) {
      const t = jour(e.jourDe(c.createdAt, c.venueId));
      t.commandes += 1;
      t.caTtcCents += c.totalCents;
      t.acheteurs.add(c.userId);
    }
    for (const m of e.matchs) {
      // Seulement les jours où il s'est passé quelque chose : un match créé
      // d'avance, sans une visite ni une commande, n'apprend rien.
      jours.get(e.jourDe(m.startAt, m.venueId))?.evenements.add(m.name);
    }

    const parJour = [...jours.entries()]
      .map(([cle, t]) => ({
        jour: cle,
        visiteursUniques: t.visiteurs.size,
        visiteursAnonymes: [...t.visiteurs].filter((cle) => !t.identifies.has(cle)).length,
        visites: t.passages.size,
        nouveauxVisiteurs: t.nouveaux.size,
        visiteursConnectes: t.connectes.size,
        // Des COMPTES des deux côtés, comme la carte du haut.
        clientsAyantCommande: t.acheteurs.size,
        tauxConversion:
          t.connectes.size > 0
            ? Math.round(
                ([...t.connectes].filter((u) => t.acheteurs.has(u)).length / t.connectes.size) * 1000,
              ) / 10
            : null,
        commandes: t.commandes,
        caTtcCents: t.caTtcCents,
        evenements: [...t.evenements].sort((a, b) => a.localeCompare(b, 'fr')),
        mesure: cle >= DEBUT_MESURE_FREQUENTATION,
      }))
      .sort((a, b) => a.jour.localeCompare(b.jour));

    // Le MEILLEUR jour : le plus de visiteurs ; à égalité, le plus de
    // commandes ; puis le plus récent. Aucun si personne n'est venu.
    const meilleur = [...parJour]
      .filter((t) => t.visiteursUniques > 0)
      .sort(
        (a, b) =>
          b.visiteursUniques - a.visiteursUniques ||
          b.commandes - a.commandes ||
          b.jour.localeCompare(a.jour),
      )[0];

    return { parJour, meilleurJour: meilleur?.jour ?? null };
  }

  private parLieu(
    visites: LigneVisite[],
    noms: Map<string, string>,
    decouvertes: Map<string, { venueId: string; quand: Date }>,
    clientsParLieu: Map<string, Set<string>>,
    depuis?: Date,
  ): AudienceLieu[] {
    const lieux = new Map<
      string,
      {
        visiteurs: Set<string>;
        identifies: Set<string>;
        connectes: Set<string>;
        passages: Set<string>;
        neufs: Set<string>;
      }
    >();
    for (const v of visites) {
      if (!v.venueId) continue;
      const ligne = lieux.get(v.venueId) ?? {
        visiteurs: new Set<string>(),
        identifies: new Set<string>(),
        connectes: new Set<string>(),
        passages: new Set<string>(),
        neufs: new Set<string>(),
      };
      ligne.visiteurs.add(v.visitorKey);
      ligne.passages.add(clePassage(v));
      if (v.userId) {
        ligne.connectes.add(v.userId);
        ligne.identifies.add(v.visitorKey);
      }

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
        visiteursAnonymes: [...l.visiteurs].filter((cle) => !l.identifies.has(cle)).length,
        visiteursConnectes: l.connectes.size,
        visites: l.passages.size,
        nouveauxVisiteurs: l.neufs.size,
        clients: clientsParLieu.get(venueId)?.size ?? 0,
      }))
      .sort((a, b) => b.visiteursUniques - a.visiteursUniques);
  }
}

/**
 * Un PASSAGE : un appareil, une demi-heure.
 *
 * Ni le nombre d'écrans vus (`hits`), ni le nombre de lignes : la carte puis le
 * menu écrivent deux lignes distinctes (périmètres différents) pour une seule
 * venue au stade. Dix allers-retours entre la carte et le panier font UN
 * passage — c'est tout l'objet de la fenêtre de trente minutes. Le tableau de
 * bord affichait la somme des écrans vus.
 */
function clePassage(v: { visitorKey: string; windowStart: Date }): string {
  return `${v.visitorKey}|${v.windowStart.getTime()}`;
}

function compterPassages(visites: Array<{ visitorKey: string; windowStart: Date }>): number {
  return new Set(visites.map(clePassage)).size;
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
  /** Jour de SERVICE du lieu (bascule à 4h, heure locale), `AAAA-MM-JJ`. */
  jour: string;
  visiteursUniques: number;
  /** Téléphones venus ce jour-là sans qu'aucun compte ne s'y connecte. */
  visiteursAnonymes: number;
  visites: number;
  nouveauxVisiteurs: number;
  visiteursConnectes: number;
  /** CLIENTS différents qui ont commandé ce jour-là (un client = une personne). */
  clientsAyantCommande: number;
  /** Parmi les visiteurs connectés du jour, la part qui a commandé ; `null` sans visiteur connecté. */
  tauxConversion: number | null;
  /** Commandes payées et non annulées — le périmètre de la comptabilité. */
  commandes: number;
  caTtcCents: number;
  /** Les matchs de ce jour-là, pour que la ligne dise de quoi elle parle. */
  evenements: string[];
  /** Faux avant la mise en service de la mesure : les zéros n'y veulent rien dire. */
  mesure: boolean;
}

export interface AudienceLieu {
  /** Téléphones venus ici sans qu'aucun compte ne s'y connecte. */
  visiteursAnonymes: number;
  /** Comptes différents vus ici. */
  visiteursConnectes: number;
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
  /** Tous les téléphones venus : anonymes + ceux d'un client identifié. */
  visiteursUniques: number;
  /** Téléphones venus SANS qu'aucun compte ne s'y connecte. */
  visiteursAnonymes: number;
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
  /** Le jour qui a vu le plus de visiteurs (`AAAA-MM-JJ`), `null` si personne. */
  meilleurJour: string | null;
  parLieu: AudienceLieu[];
}
