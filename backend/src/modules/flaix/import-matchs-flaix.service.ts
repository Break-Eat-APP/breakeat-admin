import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { VenueStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { rattacherLesPointsDeRetrait } from '../../common/helpers/rattachement-buvettes';
import { deciderImport, lireFluxMatchs, type Decision } from './flux-matchs-flaix';

/**
 * L'IMPORT AUTOMATIQUE DU FLUX DES MATCHS FLAIX (24/11/2026).
 *
 * Avant : chaque match était saisi deux fois, dans Flaix puis dans BreakEat.
 * Désormais, toutes les 10 minutes, BreakEat lit le flux de chaque lieu relié
 * à Flaix et crée, met à jour ou annule ses événements. Les règles vivent dans
 * `flux-matchs-flaix.ts` ; ici, on lit et on écrit.
 *
 * QUELS LIEUX : passés à Flaix (`flaixEnabled`) ET dont « l'identifiant du lieu
 * côté Flaix » (`flaixVenueId`, réglé dans l'admin) est rempli — c'est le
 * `<lieu>` de l'adresse du flux, par exemple `guillaume-stadium`.
 *
 * TROIS MODES (`FLAIX_FLUX_IMPORT`), pour l'allumer sans risque :
 *  · `journal` (défaut) : lit le flux et JOURNALISE ce qu'il ferait, sans rien
 *    écrire. À regarder dans les journaux Railway avant d'allumer ;
 *  · `actif` : écrit ;
 *  · `arret` : ne lit rien.
 *
 * Une panne de Flaix n'arrête rien : un lieu qui ne répond pas garde ses
 * événements, et sera relu au passage suivant.
 */

const INTERVALLE_MS = 10 * 60_000;
const DELAI_REPONSE_MS = 10_000;
/** Le `<lieu>` de l'adresse : jamais de « / » ni d'espace. */
const IDENTIFIANT_LIEU = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

export type ModeImport = 'actif' | 'journal' | 'arret';

export interface BilanLieu {
  venueId: string;
  lieu: string;
  crees: number;
  modifies: number;
  erreur?: string;
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
    const m = (this.config.get<string>('app.flaix.fluxImport') ?? 'journal').toLowerCase();
    return m === 'actif' || m === 'arret' ? m : 'journal';
  }

  private get base(): string {
    return (this.config.get<string>('app.flaix.fluxUrl') || 'https://flaix.bo.synertic.net/api/public/lieux').replace(/\/+$/, '');
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

  /** Tous les lieux reliés, l'un après l'autre. */
  async importerTout(maintenant: Date): Promise<BilanLieu[]> {
    const lieux = await this.prisma.venue.findMany({
      where: { flaixEnabled: true, flaixVenueId: { not: null }, status: VenueStatus.ACTIVE },
      select: { id: true, organizationId: true, flaixVenueId: true },
    });
    const bilans: BilanLieu[] = [];
    for (const v of lieux) {
      const lieu = (v.flaixVenueId ?? '').trim();
      if (!IDENTIFIANT_LIEU.test(lieu)) {
        bilans.push({ venueId: v.id, lieu, crees: 0, modifies: 0, erreur: 'identifiant Flaix invalide' });
        continue;
      }
      try {
        const json = await this.lire(lieu);
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

  /** Lit le flux d'un lieu. `null` = inchangé depuis la dernière lecture. */
  private async lire(lieu: string): Promise<unknown> {
    const adresse = `${this.base}/${encodeURIComponent(lieu)}/evenements`;
    const etag = this.etags.get(lieu);
    const res = await fetch(adresse, {
      headers: { Accept: 'application/json', ...(etag ? { 'If-None-Match': etag } : {}) },
      signal: AbortSignal.timeout(DELAI_REPONSE_MS),
      redirect: 'error',
    });
    if (res.status === 304) return null;
    if (!res.ok) throw new Error(`réponse ${res.status}`);
    const json: unknown = await res.json();
    const nouveau = res.headers.get('etag');
    // L'ETag n'est retenu qu'en mode actif : en mode journal, rien n'a été
    // écrit, et le passage en actif doit relire tout le flux.
    if (nouveau && this.mode === 'actif') this.etags.set(lieu, nouveau);
    return json;
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

    const existants = await this.prisma.event.findMany({
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
      },
    });
    const decisions = deciderImport(flux.evenements, existants, maintenant);
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

  private journaliser(lieu: string, d: Exclude<Decision, { type: 'ignorer' }>, ecrit: boolean): void {
    const prefixe = ecrit ? 'Flux Flaix' : 'Flux Flaix (journal, rien écrit)';
    if (d.type === 'creer') {
      this.logger.log(`${prefixe} « ${lieu} » : création de « ${d.data.name} » (${d.cle}) le ${d.data.startAt.toISOString()}`);
    } else {
      this.logger.log(
        `${prefixe} « ${lieu} » : ${d.adopte ? 'adoption' : 'mise à jour'} de ${d.eventId} (${d.cle}) — ${Object.keys(d.data).join(', ')}`,
      );
    }
  }
}
