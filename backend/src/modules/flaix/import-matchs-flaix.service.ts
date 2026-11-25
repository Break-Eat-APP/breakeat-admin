import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { VenueStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { rattacherLesPointsDeRetrait } from '../../common/helpers/rattachement-buvettes';
import { requireOrgAccess, MANAGE_ROLES } from '../../common/helpers/require-org-access';
import {
  actionApercu,
  deciderImport,
  lireFluxMatchs,
  nomCourtDuLieu,
  NOM_COURT_LIEU,
  type ActionApercu,
  type Decision,
} from './flux-matchs-flaix';

/**
 * LE CALENDRIER FLAIX D'UN LIEU, IMPORTÉ TOUTES LES 10 MINUTES (24-25/11/2026).
 *
 * Avant : chaque match était saisi deux fois, dans Flaix puis dans BreakEat.
 * Le club colle le lien de son calendrier Flaix dans « Événements &
 * configuration », voit l'APERÇU (ce qui serait créé, relié, mis à jour), puis
 * ACTIVE la synchronisation de ce lieu (`Venue.flaixFluxActif`). Ensuite, toutes
 * les 10 minutes, les événements se créent, se mettent à jour et s'annulent
 * seuls. Les règles vivent dans `flux-matchs-flaix.ts` ; ici, on lit et on écrit.
 *
 * `FLAIX_FLUX_IMPORT` reste un interrupteur GÉNÉRAL de secours : `arret` coupe
 * tout, `journal` lit sans écrire ; vide ou `actif`, chaque lieu suit son
 * propre réglage.
 *
 * Une panne de Flaix n'arrête rien : un lieu qui ne répond pas garde ses
 * événements, et sera relu au passage suivant. ADR-0018.
 */

const INTERVALLE_MS = 10 * 60_000;
const DELAI_REPONSE_MS = 10_000;

export type ModeImport = 'actif' | 'journal' | 'arret';

export interface BilanLieu {
  venueId: string;
  lieu: string;
  crees: number;
  modifies: number;
  erreur?: string;
}

/** Un événement du flux, tel que l'écran d'aperçu le montre. */
export interface LigneApercu {
  cle: string;
  nom: string;
  debut: string;
  fin: string;
  ouvreLe: string | null;
  affiche: string | null;
  annule: boolean;
  action: ActionApercu;
  /** L'événement BreakEat concerné (adopté, mis à jour), s'il existe. */
  eventId: string | null;
  raison: string | null;
}

export interface ReglageFluxLieu {
  lieu: string | null;
  actif: boolean;
}

@Injectable()
export class ImportMatchsFlaixService {
  private readonly logger = new Logger(ImportMatchsFlaixService.name);
  private enCours = false;
  /** L'ETag de la dernière réponse lue, par lieu : rien à refaire si rien n'a changé. */
  private readonly etags = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get mode(): ModeImport {
    const m = (this.config.get<string>('app.flaix.fluxImport') || 'actif').toLowerCase();
    return m === 'journal' || m === 'arret' ? m : 'actif';
  }

  private get base(): string {
    return (this.config.get<string>('app.flaix.fluxUrl') || 'https://flaix.bo.synertic.net/api/public/lieux').replace(
      /\/+$/,
      '',
    );
  }

  @Interval(INTERVALLE_MS)
  async tourner(): Promise<void> {
    if (this.mode === 'arret' || this.enCours) return;
    this.enCours = true;
    try {
      await this.importerTout(new Date());
    } catch (e: unknown) {
      this.logger.error(`Import du flux Flaix : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.enCours = false;
    }
  }

  /** Tous les lieux dont la synchronisation est active, l'un après l'autre. */
  async importerTout(maintenant: Date): Promise<BilanLieu[]> {
    const lieux = await this.prisma.venue.findMany({
      where: {
        flaixEnabled: true,
        flaixFluxActif: true,
        flaixVenueId: { not: null },
        status: VenueStatus.ACTIVE,
      },
      select: { id: true, organizationId: true, flaixVenueId: true },
    });
    const bilans: BilanLieu[] = [];
    for (const v of lieux) {
      const lieu = (v.flaixVenueId ?? '').trim();
      if (!NOM_COURT_LIEU.test(lieu)) {
        bilans.push({ venueId: v.id, lieu, crees: 0, modifies: 0, erreur: 'identifiant Flaix invalide' });
        continue;
      }
      try {
        const json = await this.lire(lieu, true);
        if (json === null) {
          bilans.push({ venueId: v.id, lieu, crees: 0, modifies: 0 });
          continue;
        }
        bilans.push(await this.importerLieu(v.id, v.organizationId, lieu, json, maintenant));
      } catch (e: unknown) {
        const erreur = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Flux Flaix « ${lieu} » : ${erreur}`);
        bilans.push({ venueId: v.id, lieu, crees: 0, modifies: 0, erreur });
      }
    }
    return bilans;
  }

  /**
   * Lit le flux d'un lieu. `null` = inchangé depuis la dernière lecture
   * (seulement avec `avecEtag` : l'aperçu relit toujours tout).
   */
  private async lire(lieu: string, avecEtag: boolean): Promise<unknown> {
    const adresse = `${this.base}/${encodeURIComponent(lieu)}/evenements`;
    const etag = avecEtag ? this.etags.get(lieu) : undefined;
    const res = await fetch(adresse, {
      headers: { Accept: 'application/json', ...(etag ? { 'If-None-Match': etag } : {}) },
      signal: AbortSignal.timeout(DELAI_REPONSE_MS),
      redirect: 'error',
    });
    if (res.status === 304) return null;
    if (res.status === 404) throw new Error('lieu inconnu chez Flaix (404)');
    if (!res.ok) throw new Error(`réponse ${res.status}`);
    const json: unknown = await res.json();
    const nouveau = res.headers.get('etag');
    // L'ETag n'est retenu que si l'on écrit : en mode journal, rien n'a été
    // écrit, et le retour en actif doit relire tout le flux.
    if (avecEtag && nouveau && this.mode === 'actif') this.etags.set(lieu, nouveau);
    return json;
  }

  private evenementsDuLieu(venueId: string) {
    return this.prisma.event.findMany({
      where: { venueId },
      select: {
        id: true,
        flaixEventId: true,
        name: true,
        startAt: true,
        endAt: true,
        status: true,
        isPermanentContainer: true,
        flaixOrderUrl: true,
        opponentName: true,
        posterUrl: true,
        ordersOpenAt: true,
      },
    });
  }

  /** Applique (ou journalise) les décisions pour un lieu. */
  async importerLieu(
    venueId: string,
    organizationId: string,
    lieu: string,
    json: unknown,
    maintenant: Date,
  ): Promise<BilanLieu> {
    const flux = lireFluxMatchs(json);
    if (!flux) throw new Error('réponse illisible (pas de liste « evenements »)');
    for (const raison of flux.ecartes) this.logger.warn(`Flux Flaix « ${lieu} », écarté — ${raison}`);

    const decisions = deciderImport(flux.evenements, await this.evenementsDuLieu(venueId), maintenant);
    const ecrire = this.mode === 'actif';
    const bilan: BilanLieu = { venueId, lieu, crees: 0, modifies: 0 };

    for (const d of decisions) {
      if (d.type === 'ignorer') continue;
      this.journaliser(lieu, d, ecrire);
      if (!ecrire) continue;
      try {
        if (d.type === 'creer') {
          await this.prisma.$transaction(async (tx) => {
            const ev = await tx.event.create({ data: { organizationId, venueId, ...d.data } });
            // Comme une création à la main : les points de retrait du club,
            // d'office (ADR-0009).
            await rattacherLesPointsDeRetrait(tx, ev.id, organizationId);
          });
          bilan.crees += 1;
        } else {
          await this.prisma.event.update({ where: { id: d.eventId }, data: d.data });
          bilan.modifies += 1;
        }
      } catch (e: unknown) {
        // Un événement raté n'arrête pas les autres ; il sera repris au passage suivant.
        this.logger.error(
          `Flux Flaix « ${lieu} », événement ${d.cle} non écrit : ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return bilan;
  }

  // ─── Le réglage du club, depuis « Événements & configuration » ──────────

  private async lieuDuClub(userId: string, orgId: string, venueId: string) {
    await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);
    const venue = await this.prisma.venue.findFirst({
      where: { id: venueId, organizationId: orgId },
      select: { id: true, organizationId: true, flaixEnabled: true, flaixVenueId: true, flaixFluxActif: true },
    });
    // Un lieu d'un autre club est traité comme inexistant.
    if (!venue) throw new NotFoundException('Lieu introuvable.');
    return venue;
  }

  async reglage(userId: string, orgId: string, venueId: string): Promise<ReglageFluxLieu> {
    const v = await this.lieuDuClub(userId, orgId, venueId);
    return { lieu: v.flaixVenueId, actif: v.flaixFluxActif };
  }

  private nomCourtOuErreur(lien: string): string {
    const nom = nomCourtDuLieu(lien);
    if (!nom) {
      throw new BadRequestException(
        'Lien Flaix non reconnu. Colle le lien de ta page événements Flaix (…/l/ton-lieu) ou le nom court du lieu.',
      );
    }
    return nom;
  }

  /** Ce que la synchronisation ferait, SANS rien écrire. */
  async apercu(
    userId: string,
    orgId: string,
    venueId: string,
    lien: string,
    maintenant: Date = new Date(),
  ): Promise<{ lieu: string; evenements: LigneApercu[] }> {
    await this.lieuDuClub(userId, orgId, venueId);
    const lieu = this.nomCourtOuErreur(lien);
    let json: unknown;
    try {
      json = await this.lire(lieu, false);
    } catch (e: unknown) {
      throw new BadRequestException(
        `Le calendrier Flaix de « ${lieu} » n’a pas pu être lu (${e instanceof Error ? e.message : String(e)}).`,
      );
    }
    const flux = lireFluxMatchs(json);
    if (!flux) throw new BadRequestException('La réponse de Flaix est illisible.');
    const decisions = deciderImport(flux.evenements, await this.evenementsDuLieu(venueId), maintenant);
    return {
      lieu,
      evenements: flux.evenements.map((f, i) => {
        const d = decisions[i];
        return {
          cle: f.cle,
          nom: f.nom,
          debut: f.debut.toISOString(),
          fin: f.fin.toISOString(),
          ouvreLe: f.ouvreLe ? f.ouvreLe.toISOString() : null,
          affiche: f.affiche,
          annule: f.annule,
          action: actionApercu(d),
          eventId: d.type === 'modifier' ? d.eventId : null,
          raison: d.type === 'ignorer' ? d.raison : null,
        };
      }),
    };
  }

  /**
   * Enregistre le lien et active (ou coupe) la synchronisation du lieu. À
   * l'activation, une première synchronisation part tout de suite : le club
   * voit ses événements sans attendre dix minutes.
   */
  async regler(
    userId: string,
    orgId: string,
    venueId: string,
    params: { lien?: string | null; actif: boolean },
    maintenant: Date = new Date(),
  ): Promise<ReglageFluxLieu & { bilan?: BilanLieu }> {
    const v = await this.lieuDuClub(userId, orgId, venueId);
    const saisi = params.lien?.trim();
    const lieu = saisi ? this.nomCourtOuErreur(saisi) : v.flaixVenueId;
    if (params.actif && !v.flaixEnabled) {
      throw new BadRequestException(
        'Ce lieu ne passe pas par Flaix : il faut d’abord activer « Passer la commande à Flaix ».',
      );
    }
    if (params.actif && !lieu) throw new BadRequestException('Colle d’abord le lien de ton calendrier Flaix.');

    await this.prisma.venue.update({
      where: { id: venueId },
      data: { flaixVenueId: lieu, flaixFluxActif: params.actif },
    });
    this.logger.log(
      `Calendrier Flaix « ${lieu ?? '—'} » ${params.actif ? 'activé' : 'coupé'} pour le lieu ${venueId} par ${userId}`,
    );

    if (!params.actif || !lieu) return { lieu, actif: params.actif };
    this.etags.delete(lieu);
    try {
      const json = await this.lire(lieu, true);
      const bilan =
        json === null
          ? { venueId, lieu, crees: 0, modifies: 0 }
          : await this.importerLieu(venueId, v.organizationId, lieu, json, maintenant);
      return { lieu, actif: true, bilan };
    } catch (e: unknown) {
      // Le réglage est enregistré ; la synchronisation reprendra au passage suivant.
      const erreur = e instanceof Error ? e.message : String(e);
      return { lieu, actif: true, bilan: { venueId, lieu, crees: 0, modifies: 0, erreur } };
    }
  }

  private journaliser(lieu: string, d: Exclude<Decision, { type: 'ignorer' }>, ecrit: boolean): void {
    const prefixe = ecrit ? 'Flux Flaix' : 'Flux Flaix (journal, rien écrit)';
    if (d.type === 'creer') {
      this.logger.log(
        `${prefixe} « ${lieu} » : création de « ${d.data.name} » (${d.cle}) le ${d.data.startAt.toISOString()}`,
      );
    } else {
      this.logger.log(
        `${prefixe} « ${lieu} » : ${d.adopte ? 'adoption' : 'mise à jour'} de ${d.eventId} (${d.cle}) — ${Object.keys(d.data).join(', ')}`,
      );
    }
  }
}
