import {
  Controller,
  Get,
  Header,
  ConflictException,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EventStatus, EventVisibility, Prisma, VenueStatus } from '@prisma/client';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { CLUB_EN_SERVICE } from '../../common/helpers/organisation-ouverte';
import {
  estCommandableMaintenant,
  fenetreDeCommande,
} from '../../common/helpers/fenetre-commande';
import { saisonDuLieu } from '../../common/helpers/saison-du-lieu';
import { modeDeCommande } from '../../common/helpers/mode-de-commande';
import { personnaliserLien, porteDesEtiquettes } from '../../common/helpers/personnaliser-lien';

/**
 * CE QU'UN LIEU PUBLIC LAISSE LIRE — une seule fois, pour les deux routes.
 *
 * La liste et la fiche d'un lieu doivent répondre EXACTEMENT la même chose :
 * deux sélections écrites séparément finiraient par diverger, et c'est ici
 * que ça se paierait cher. Il y a dans ce `select` des champs qui décident de
 * la confidentialité (`visibility`) et de l'ouverture de la commande
 * (`startAt`, `endAt`, `flaixOrderUrl`) : en oublier un sur une route, c'est
 * soit révéler un lieu privé, soit annoncer fermé un lieu qui vend.
 */
/**
 * JUSQU'OÙ ON REMONTE DANS LE PASSÉ — cent cinquante jours.
 *
 * Assez pour qu'un calendrier ouvert en mai montre encore le début de la
 * saison, et pour qu'un match d'hier reste lisible. Au-delà, personne ne
 * fait défiler : ce sont des lignes lues à chaque requête, par chaque
 * client, pour rien.
 *
 * Calculée À CHAQUE LECTURE, dans `lire()`. Posée dans la constante de
 * sélection — qui n'est évaluée qu'une fois à l'import — un conteneur qui vit des
 * mois aurait vu sa fenêtre glisser vers le passé, un jour de plus chaque jour.
 */
const JOURS_DE_MEMOIRE = 150;

function borneDeSaison(): Date {
  return new Date(Date.now() - JOURS_DE_MEMOIRE * 86_400_000);
}

const SELECTION_LIEU = {
  id: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  photoUrl: true,
  flaixEnabled: true,
  flaixVenueId: true,
  ordersOpenAt: true,
  timezone: true,
  buvettePlanUrl: true,
  organization: { select: { name: true, logoUrl: true, primaryColor: true } },
  /**
   * LA CONFIDENTIALITÉ SE DÉCIDE SUR L'ENSEMBLE — mais deux colonnes y
   * suffisent.
   *
   * Un lieu n'apparaît que s'il a au moins un événement accessible, TOUTES
   * visibilités et tous statuts confondus. Un lieu privé dont l'événement
   * privé n'est pas encore actif serait sinon révélé en « Bientôt ».
   *
   * Cette règle ne compte que des LIGNES : elle n'a besoin d'aucun contenu.
   * Elle est donc calculée par la base, dans `confidentialite()` — deux
   * agrégats qui rendent cinquante lignes au lieu de deux mille.
   */

  /**
   * LES ÉVÉNEMENTS QU'ON LIT VRAIMENT — bornés dans le temps.
   *
   * Ils ne l'étaient pas, et c'était le mur. Mesuré le 30/10 sur 50 lieux et
   * trois saisons (`scripts/banc-de-charge`) : 24 requêtes par seconde et
   * 7 secondes de latence médiane, contre 191 req/s quand la réponse ne
   * porte qu'un lieu. Chaque appel chargeait tous les matchs jamais joués
   * de chaque lieu rendu — et le coût grandissait d'un tiers à chaque
   * saison, pour des rencontres que personne ne regarde.
   *
   * La fenêtre couvre ce que quelqu'un peut avoir besoin de lire : la
   * saison écoulée (le calendrier garde une mémoire), et celle qui vient.
   *
   * LE CONTENANT D'UN LIEU PERMANENT ÉCHAPPE À LA BORNE, et ce n'est pas un
   * détail : il est créé une fois, sa date ne veut rien dire, et il porte
   * le lien de commande d'un restaurant ouvert tous les jours. Le couper
   * fermerait la vente de ces lieux-là du jour au lendemain.
   */
  // ⚠️ LE `where` DE CETTE RELATION EST POSÉ À CHAQUE LECTURE, dans
  // `lire()`, et surtout PAS ici : cet objet est une constante de module,
  // évaluée une seule fois à l'import. La borne y aurait été figée au
  // démarrage, et un conteneur vivant trois mois aurait lu trois mois de
  // plus que prévu — en s'éloignant un peu plus chaque jour, sans que rien
  // ne le signale. C'est le défaut que cette fenêtre venait corriger.
  events: {
    orderBy: { startAt: 'asc' },
    select: {
      id: true,
      name: true,
      status: true,
      visibility: true,
      // Les dates et le lien : c'est la DATE qui choisit le lien Flaix
      // à ouvrir (`fenetre-commande`), et non un motif d'URL deviné.
      startAt: true,
      endAt: true,
      isPermanentContainer: true,
      flaixOrderUrl: true,
      // L'adversaire : ce que le calendrier de la saison montre à la place
      // d'un numéro de jour (`common/helpers/saison-du-lieu.ts`).
      opponentName: true,
      opponentLogoUrl: true,
    },
  },
} satisfies Prisma.VenueSelect;

/**
 * PublicVenuesController — découverte des lieux pour l'app mobile (Phase 16).
 *
 * Point d'entrée du parcours « click-and-collect » : l'utilisateur cherche un lieu
 * (par nom/adresse) et/ou laisse l'app le géolocaliser pour trier/filtrer par
 * proximité. Aucune authentification requise (navigation libre).
 *
 * GET /api/v1/public/venues?q=&lat=&lng=&radiusKm=
 *   - q        : nom, adresse ou mots-clés configurés par le club (insensible à
 *                la casse). Une recherche IGNORE le rayon : on cherche un club
 *                précis, pas ce qui est à côté.
 *   - lat,lng  : position de l'utilisateur → distance (Haversine), tri par
 *                proximité, et exclusion de tout ce qui dépasse le rayon. Un
 *                lieu sans coordonnées n'apparaît donc PAS par ce chemin.
 *   - radiusKm : rayon de filtrage (défaut 10 km).
 *
 * Lieux privés (Phase 16.1) : un lieu n'apparaît que s'il a au moins un événement
 * accessible à l'appelant (PUBLIC, ou PRIVATE via appartenance à un groupe), TOUTES
 * visibilités/statuts confondus. Un lieu dont aucun événement n'est accessible est
 * masqué — sans révéler son existence — même si son événement privé n'est pas encore
 * actif (pas de fuite via « Bientôt »). `currentEventId` = premier événement accessible
 * ET actif (cible de navigation), sinon null (générique « Bientôt »). Les lieux sans
 * aucun événement restent listés (génériques, non confidentiels).
 */
@UseGuards(OptionalJwtAuthGuard)
@Controller('public/venues')
export class PublicVenuesController {
  /** Rayon par défaut au-delà duquel un lieu géolocalisé est écarté. */
  private static readonly DEFAULT_RADIUS_KM = 10;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * `no-store` : cette réponse peut porter le NOM, l'ADRESSE E-MAIL et le
   * TÉLÉPHONE du client, glissés dans le lien de commande Flaix. Un cache
   * partagé — proxy, CDN — servirait l'identité d'un client à un autre.
   *
   * L'en-tête est posé sur toute la route et non seulement quand le lien est
   * personnalisé : un cache qui garderait la version anonyme la rendrait
   * ensuite à un client connecté, qui perdrait sa personnalisation sans
   * comprendre pourquoi.
   */
  @Header('Cache-Control', 'no-store')
  @Get()
  async search(
    @CurrentUser() user?: JwtPayload,
    @Query('q') q?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    const term = q?.trim();
    const where: Prisma.VenueWhereInput = {
      status: VenueStatus.ACTIVE,
      // Un club suspendu n'apparaît plus : ni par la recherche, ni par la
      // proximité. C'est la première chose que « suspendre » doit faire.
      ...CLUB_EN_SERVICE,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { address: { contains: term, mode: 'insensitive' } },
              { searchTerms: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const userLat = parseCoord(lat);
    const userLng = parseCoord(lng);
    const hasLocation = userLat !== null && userLng !== null;
    const radius = parsePositiveNumber(radiusKm) ?? PublicVenuesController.DEFAULT_RADIUS_KM;

    let result = await this.projeter(
      await this.lire(where),
      user,
      hasLocation ? { lat: userLat, lng: userLng } : null,
    );

    // Deux chemins pour trouver un lieu, et deux seulement :
    //
    //  1. LA PROXIMITÉ — sans recherche, on n'affiche que les lieux géolocalisés
    //     dans le rayon. Un lieu sans coordonnées n'y figure pas : il n'a
    //     aucune position à comparer. C'est au club de renseigner son GPS.
    //  2. LA RECHERCHE — taper un nom, une adresse ou un mot-clé configuré par
    //     le club l'emporte sur la distance. Qui cherche « spartiates » veut ce
    //     club, qu'il soit à 2 ou 400 km ; répondre « aucun résultat » sur un
    //     nom exact serait incompréhensible.
    if (hasLocation && !term) {
      result = result.filter((v) => v.distanceKm !== null && v.distanceKm <= radius);
      result.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }

    // Ni position, ni recherche : aucun des deux chemins n'est emprunté, donc
    // rien à montrer. Lister tout le catalogue serait un troisième chemin non
    // voulu — et trompeur : un client verrait des clubs à 400 km comme s'ils
    // le concernaient. L'app affiche alors son invitation à autoriser la
    // localisation ou à chercher un nom.
    if (!hasLocation && !term) return [];

    return result;
  }

  /**
   * LA LECTURE BRUTE, isolée pour que `projeter` en déduise son type.
   *
   * Sans elle, il faudrait écrire à la main le type de ce que Prisma renvoie —
   * une trentaine de champs imbriqués, qu'un jour on oublierait de suivre.
   */
  private lire(where: Prisma.VenueWhereInput) {
    return this.prisma.venue.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        ...SELECTION_LIEU,
        // La fenêtre de saison, calculée MAINTENANT. Posée dans la
        // constante, elle vieillissait avec le processus.
        events: {
          ...SELECTION_LIEU.events,
          where: {
            OR: [{ startAt: { gte: borneDeSaison() } }, { isPermanentContainer: true }],
          },
        },
      },
    });
  }

  /**
   * DES LIGNES DE BASE VERS CE QUE L'APPLICATION A LE DROIT DE VOIR.
   *
   * Masquage des lieux privés, lien Flaix du moment, identité glissée dans ce
   * lien : trois règles délicates, tenues ICI et nulle part ailleurs. La liste
   * et la fiche d'un lieu passent toutes deux par cette méthode — une seconde
   * route qui les réécrirait de son côté finirait par en oublier une, et la
   * première oubliée serait la confidentialité.
   *
   * `position` vaut null quand on ignore où est le client : les distances
   * valent alors null, et aucun lieu n'est écarté pour cette raison.
   */
  private async projeter(
    venues: Awaited<ReturnType<PublicVenuesController['lire']>>,
    user: JwtPayload | undefined,
    position: { lat: number; lng: number } | null,
  ) {
    // Ensemble des événements PRIVÉS accessibles à l'utilisateur (via ses groupes).
    const accessibleEventIds = new Set<string>();
    if (user?.sub) {
      const memberships = await this.prisma.groupMember.findMany({
        where: { userId: user.sub },
        select: { group: { select: { events: { select: { eventId: true } } } } },
      });
      for (const m of memberships) {
        for (const ge of m.group.events) accessibleEventIds.add(ge.eventId);
      }
    }
    const canAccess = (ev: { id: string; visibility: EventVisibility }) =>
      ev.visibility === EventVisibility.PUBLIC || accessibleEventIds.has(ev.id);

    /**
     * QUI A DES ÉVÉNEMENTS, ET QUI EN A D'ACCESSIBLES — compté par la base.
     *
     * La règle n'a pas changé d'un mot : un lieu qui a des événements mais
     * AUCUN d'accessible reste masqué, toutes visibilités et tous statuts
     * confondus. Ce qui change, c'est qu'on ne rapatrie plus deux mille
     * lignes pour les compter en mémoire — la base rend cinquante nombres.
     *
     * Et surtout, la décision porte toujours sur la TOTALITÉ, jamais sur la
     * fenêtre de lecture : un lieu dont le seul événement privé est vieux de
     * six mois doit rester masqué.
     */
    const ids = venues.map((v) => v.id);
    const [aDesEvenements, aDuAccessible] = await Promise.all([
      this.prisma.event.groupBy({
        by: ['venueId'],
        where: { venueId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.event.groupBy({
        by: ['venueId'],
        where: {
          venueId: { in: ids },
          OR: [
            { visibility: EventVisibility.PUBLIC },
            ...(accessibleEventIds.size > 0 ? [{ id: { in: [...accessibleEventIds] } }] : []),
          ],
        },
        _count: { _all: true },
      }),
    ]);
    const porteurs = new Set(aDesEvenements.map((g) => g.venueId));
    const ouverts = new Set(aDuAccessible.map((g) => g.venueId));

    // L'instant de référence, lu UNE seule fois pour toute la réponse : deux
    // lieux de la même liste ne doivent pas être jugés à deux secondes
    // d'écart, sinon un événement peut « ouvrir » entre deux lignes.
    const maintenant = new Date();

    const result = venues
      .map((v) => {
        // Lieu privé masqué : a des événements, mais AUCUN accessible (toutes
        // visibilités confondues) — on ne révèle pas son existence, même sans
        // événement actif. La décision porte sur `tousLesEvenements`, jamais
        // sur la fenêtre : un lieu dont le seul événement privé est vieux de
        // six mois doit rester masqué.
        if (porteurs.has(v.id) && !ouverts.has(v.id)) return null;
        const accessible = v.events.filter(canAccess);
        // Cible de navigation : premier événement accessible ET actif.
        const currentEvent = accessible.find((e) => e.status === EventStatus.ACTIVE);

        // LE LIEN FLAIX DU MOMENT.
        //
        // Calculé sur les événements ACCESSIBLES uniquement : un lieu privé ne
        // doit pas livrer l'adresse de commande de son événement réservé.
        //
        // Et seulement si le lieu est en Flaix : UN interrupteur commande tout
        // le relais. Des liens collés d'avance sur un lieu non basculé ne
        // changent rien — c'est ce qui permet de préparer la saison tranquille.
        // Le fuseau du LIEU : « 8 h » n'a de sens que quelque part.
        const reglage = {
          heure: v.ordersOpenAt,
          timezone: v.timezone ?? 'Europe/Paris',
        };
        const fenetre = v.flaixEnabled
          ? fenetreDeCommande(accessible, maintenant, reglage)
          : ({ etat: 'aucun' } as const);

        // Le prochain événement annoncé, qu'il soit en Flaix ou non : c'est ce
        // qui permet à la carte de dire « samedi 20 h » au lieu de « Bientôt ».
        const prochain = accessible.find((e) => e.startAt.getTime() > maintenant.getTime());

        // QUELLE CASE DU CALENDRIER EST OUVERTE — le miroir exact de
        // `cheminDeCommande` (apps/mobile/src/lib/ouverture-lieu.ts).
        //
        // Écrit ici plutôt que déduit dans l'app : c'est la même règle que le
        // bouton, et deux écritures finiraient par se contredire — un
        // calendrier qui cercle un match dont le bouton refuse, c'est la panne
        // du 10/10 à nouveau, en pire.
        //
        //  · 'ouvert'  : Flaix a un lien pour maintenant → cette case ;
        //  · 'bientot' : lieu Flaix dont la commande ouvre plus tard. FERMÉ,
        //                et surtout pas rabattu sur le parcours Break Eat :
        //                c'est Flaix qui vend, le club ne tient plus ni carte
        //                ni prix ;
        //  · 'aucun'   : pas de relais Flaix ici → le parcours Break Eat
        //                reprend la main sur l'événement actif.
        /**
         * QUELS MATCHS SONT COMMANDABLES — au pluriel, désormais.
         *
         * On n'en désignait qu'UN, celui que `fenetreDeCommande` ouvrait.
         * Suffisant tant qu'un lieu n'accueillait qu'une rencontre à la
         * fois ; plus du tout quand deux épreuves se tiennent le même jour
         * dans le même stade. La seconde s'affichait alors au calendrier
         * SANS bouton : visible, et inaccessible.
         *
         * `estCommandableMaintenant` applique exactement les mêmes règles,
         * événement par événement. Pour un lieu qui n'en ouvre qu'un, la
         * réponse est identique à l'ancienne.
         */
        /**
         * QUELS MATCHS SONT COMMANDABLES — et par quel chemin.
         *
         * `modeDeCommande` tranche : c'est la MÊME règle que le panier et
         * que l'application. Elle était écrite trois fois, et les trois ne
         * disaient pas la même chose — un lieu basculé sans lien utilisable
         * n'avait plus aucun bouton, ni Flaix ni Break Eat.
         */
        const mode = modeDeCommande(v, accessible, maintenant, reglage);
        const ouvrable =
          mode === 'flaix'
            ? (ev: { id: string }) =>
                accessible.some(
                  (e) => e.id === ev.id && estCommandableMaintenant(e, maintenant, reglage),
                )
            : mode === 'break-eat'
              ? // Repli : c'est l'événement ACTIF qui prend les commandes, et
                // il n'y en a qu'un.
                (ev: { id: string }) => ev.id === currentEvent?.id
              : // Passé à Flaix, mais la commande ouvre plus tard : rien
                // n'est commandable, et surtout pas par le parcours
                // Break Eat — le club ne tient plus ni carte ni prix.
                () => false;

        const distanceKm =
          position && v.latitude !== null && v.longitude !== null
            ? haversineKm(position.lat, position.lng, v.latitude, v.longitude)
            : null;
        return {
          id: v.id,
          name: v.name,
          address: v.address,
          latitude: v.latitude,
          longitude: v.longitude,
          // La photo du lieu d'abord ; le logo du club ensuite. L'app
          // cadre l'une en plein et centre l'autre : voir `carte-lieu`.
          photoUrl: v.photoUrl ?? null,
          imageUrl: v.organization?.logoUrl ?? null,
          primaryColor: v.organization?.primaryColor ?? null,
          flaixEnabled: v.flaixEnabled,
          flaixVenueId: v.flaixVenueId,
          /** L'adresse à ouvrir MAINTENANT, ou null si la commande est fermée. */
          flaixOrderUrl: fenetre.etat === 'ouvert' ? fenetre.url : null,
          /** Quand elle ouvrira, pour l'annoncer au lieu de dire « fermé ». */
          commandeOuvreA: fenetre.etat === 'bientot' ? fenetre.ouvreA.toISOString() : null,
          prochainEvenement: prochain
            ? { id: prochain.id, name: prochain.name, startAt: prochain.startAt.toISOString() }
            : null,
          /**
           * LA SAISON — les matchs à domicile de ce lieu, bornés à une saison.
           *
           * Sur les événements ACCESSIBLES, comme le lien : un calendrier ne
           * doit pas révéler qu'un événement réservé existe.
           */
          saison: saisonDuLieu(accessible, maintenant, ouvrable),
          /**
           * L'HEURE à laquelle la commande ouvre, le jour du match (« 08:00 »).
           *
           * Brute, et non une date : c'est un réglage du LIEU, valable pour
           * tous ses matchs. L'app écrit « la commande ouvre à 8 h », ce qui
           * reste vrai pour un match dans trois mois — là où une date calculée
           * pour le prochain match serait fausse dès le suivant.
           *
           * À ne pas confondre avec les CRÉNEAUX DE RETRAIT, qui se règlent
           * dans Flaix. Ce qui ouvre ici, c'est la possibilité de commander —
           * jamais la buvette, que Break Eat ne modélise pas.
           */
          heureOuvertureCommande: v.ordersOpenAt,
          buvettePlanUrl: v.buvettePlanUrl,
          currentEventId: currentEvent?.id ?? null,
          distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    // ── L'IDENTITÉ DU CLIENT DANS LE LIEN FLAIX ──────────────────────
    //
    // Le club colle un lien qui porte des étiquettes (`[#firstname]`…),
    // héritées de son ancien back-office. Elles doivent être remplacées AVANT
    // que l'app n'ouvre la page : c'est ce qui évite au client de se
    // reconnecter chez Flaix. Voir `common/helpers/personnaliser-lien.ts`.
    //
    // On ne va chercher l'identité QUE si un lien l'attend : la grande
    // majorité des recherches n'en a aucun besoin, et c'est une requête de
    // moins sur chaque frappe au clavier.
    const aPersonnaliser = result.some(
      (v) => v.flaixOrderUrl && porteDesEtiquettes(v.flaixOrderUrl),
    );
    if (aPersonnaliser) {
      const client = user?.sub
        ? await this.prisma.user.findUnique({
            where: { id: user.sub },
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              displayName: true,
            },
          })
        : null;
      for (const v of result) {
        if (v.flaixOrderUrl) v.flaixOrderUrl = personnaliserLien(v.flaixOrderUrl, client);
      }
    }

    return result;
  }

  /**
   * OÙ COMMANDER POUR **CE** MATCH-LÀ.
   *
   * La liste des lieux ne porte aucune adresse de commande, et ce n'est pas
   * un oubli : ces adresses sont PERSONNALISÉES — le nom et le téléphone du
   * client y sont glissés pour qu'il n'ait pas à se reconnecter chez Flaix.
   * En mettre une par match ferait partir autant de copies de son identité
   * qu'il y a de rencontres affichées, à chaque ouverture de l'écran.
   *
   * L'application demande donc la destination AU MOMENT OÙ le supporter
   * appuie, pour le match qu'il a choisi. Une seule adresse, une seule fois.
   *
   * ── ET LA DESTINATION EST VÉRIFIÉE ICI ───────────────────────────────
   *
   * C'est le serveur qui décide, pas l'écran. Il refuse un match d'un autre
   * lieu, un match auquel l'appelant n'a pas accès, et un match dont la
   * commande n'est pas ouverte à cette seconde — même si l'application
   * croyait le contraire parce qu'elle affiche un écran d'il y a dix
   * minutes.
   *
   * 404 et non 403 sur un événement interdit : répondre « interdit »
   * confirmerait son existence à qui essaie des identifiants.
   */
  @Header('Cache-Control', 'no-store')
  @Get(':id/evenements/:eventId/commande')
  async destinationDeCommande(
    @Param('id') venueId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user?: JwtPayload,
  ): Promise<{ url: string; attendIdentite: boolean }> {
    const lieu = await this.prisma.venue.findFirst({
      where: { id: venueId, status: VenueStatus.ACTIVE, ...CLUB_EN_SERVICE },
      select: { ordersOpenAt: true, timezone: true, flaixEnabled: true },
    });
    if (!lieu) throw new NotFoundException('Lieu introuvable.');

    const evenement = await this.prisma.event.findFirst({
      // `venueId` dans la condition, et pas seulement l'identifiant : sans
      // lui, le match d'un AUTRE lieu passerait, et le supporter partirait
      // commander ailleurs.
      where: { id: eventId, venueId },
      select: {
        id: true,
        name: true,
        startAt: true,
        endAt: true,
        status: true,
        visibility: true,
        isPermanentContainer: true,
        flaixOrderUrl: true,
      },
    });
    if (!evenement) throw new NotFoundException('Événement introuvable.');

    // Un événement RÉSERVÉ ne se laisse pas ouvrir en le nommant.
    if (evenement.visibility !== EventVisibility.PUBLIC) {
      const autorise = user?.sub
        ? await this.prisma.groupMember.count({
            where: { userId: user.sub, group: { events: { some: { eventId } } } },
          })
        : 0;
      if (autorise === 0) throw new NotFoundException('Événement introuvable.');
    }

    if (!lieu.flaixEnabled) {
      throw new NotFoundException('Ce lieu ne passe pas par Flaix.');
    }

    const ouvert = estCommandableMaintenant(evenement, new Date(), {
      heure: lieu.ordersOpenAt,
      timezone: lieu.timezone ?? 'Europe/Paris',
    });
    if (!ouvert || !evenement.flaixOrderUrl) {
      // 409 et non 404 : le match existe, c'est son moment qui ne convient
      // pas. L'app peut le dire au supporter au lieu de le laisser croire
      // que la rencontre a disparu.
      throw new ConflictException('La commande de ce match n’est pas ouverte.');
    }

    /**
     * L'ADRESSE ATTEND-ELLE UNE IDENTITÉ ?
     *
     * Lu sur le lien BRUT, avant toute substitution — après, les étiquettes
     * ont disparu et la question n'a plus de réponse.
     *
     * L'application s'en sert pour demander ses coordonnées au client AVANT
     * de l'envoyer chez Flaix, plutôt que de le laisser les ressaisir
     * là-bas. Elle ne peut plus le deviner elle-même : c'est désormais le
     * serveur qui remplit le lien.
     */
    const attendIdentite = porteDesEtiquettes(evenement.flaixOrderUrl);

    /**
     * ON NE REND JAMAIS UNE ADRESSE QUI PORTE ENCORE SES ÉTIQUETTES.
     *
     * La substitution ne se faisait que pour un client CONNECTÉ. Un visiteur
     * sans session recevait donc le lien BRUT — `phone=[#Votre portable]` — et
     * l'application l'ouvrait quand même : Flaix écrivait ce texte dans son
     * formulaire, et le `#` d'une étiquette ouvrant un FRAGMENT d'URL, tout ce
     * qui suivait la première ne lui arrivait même pas. Le bouton est
     * accessible depuis l'écran public : le cas n'était pas théorique.
     *
     * `personnaliserLien` sait déjà quoi faire d'un client absent : il RETIRE
     * les paramètres qu'il ne peut pas remplir, et rend l'adresse nue. Son
     * propre commentaire le dit — « le client non connecté obtient donc
     * l'adresse nue : Flaix lui demandera ses coordonnées, ce qui est le repli
     * correct ». Il suffisait de l'appeler.
     *
     * On l'appelle donc TOUJOURS, avec `null` quand il n'y a pas de session.
     * Cela couvre du même geste le client connecté dont le téléphone n'est pas
     * renseigné : l'étiquette disparaît au lieu de partir en clair.
     */
    let url = evenement.flaixOrderUrl;
    if (attendIdentite) {
      const client = user?.sub
        ? await this.prisma.user.findUnique({
            where: { id: user.sub },
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              displayName: true,
            },
          })
        : null;
      url = personnaliserLien(url, client);
    }

    return { url, attendIdentite };
  }

  /**
   * UN LIEU, PAR SON IDENTIFIANT.
   *
   * Ce que la liste ne peut pas servir : un lieu FAVORI qu'on rouvre alors
   * qu'il est hors du rayon, ou qu'une recherche en cours a fait disparaître
   * de l'écran. Sans cette route, la tuile d'un favori ne menait nulle part —
   * on ne savait pas quoi ouvrir, faute de connaître l'état réel du lieu.
   *
   * Les mêmes règles s'appliquent : club suspendu, lieu privé masqué, lien du
   * moment. Elles ne sont pas réécrites ici, elles sont appelées — un lieu
   * qu'on refuse de lister ne doit pas se laisser lire en le nommant.
   *
   * 404 plutôt que 403 sur un lieu privé : répondre « interdit » confirmerait
   * son existence à qui essaie des identifiants.
   */
  @Header('Cache-Control', 'no-store')
  @Get(':id')
  async parId(
    @Param('id') id: string,
    @CurrentUser() user?: JwtPayload,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const userLat = parseCoord(lat);
    const userLng = parseCoord(lng);
    const [lieu] = await this.projeter(
      await this.lire({ id, status: VenueStatus.ACTIVE, ...CLUB_EN_SERVICE }),
      user,
      userLat !== null && userLng !== null ? { lat: userLat, lng: userLng } : null,
    );
    if (!lieu) throw new NotFoundException('Lieu introuvable.');
    return lieu;
  }
}

/** Parse une coordonnée décimale valide, sinon null. */
function parseCoord(raw?: string): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parsePositiveNumber(raw?: string): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Distance en kilomètres entre deux points (formule de Haversine). */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // rayon moyen de la Terre (km)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
