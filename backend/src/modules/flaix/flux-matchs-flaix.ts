import { EventStatus } from '@prisma/client';
import { verifierLienFlaix } from '../events/lien-flaix';
import { verifierAffiche } from '../events/image-distante';
import { nettoyerNomAdversaire } from '../events/adversaire';

/**
 * LE FLUX DES MATCHS FLAIX — LECTURE ET DÉCISIONS (24/11/2026).
 *
 * Flaix publie, par lieu, la liste de ses événements en JSON
 * (`GET <FLAIX_FLUX_URL>/<lieu>/evenements`, cahier des charges B,
 * `brain/FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md`). Ce fichier ne parle à
 * personne : il LIT une réponse et DÉCIDE quoi faire de chaque événement. Le
 * service (`import-matchs-flaix.service.ts`) applique ces décisions en base.
 *
 * Séparé pour être testé sans base ni réseau : c'est ici que vivent les règles
 * qui pourraient abîmer un calendrier (doublons, annulations, liens).
 *
 * ── LES RÈGLES ─────────────────────────────────────────────────────────
 *
 *  · Un événement se reconnaît à son identifiant Flaix (`idInterne`, à défaut
 *    `id`). Jamais par son nom : un nom se corrige.
 *  · Un événement SAISI À LA MAIN avant l'import est ADOPTÉ, pas doublé, s'il
 *    est le seul du lieu à avoir le même lien de commande, ou à défaut à
 *    commencer à 3 h près.
 *  · Annulé chez Flaix → annulé chez nous. Un événement qui DISPARAÎT du flux
 *    n'est pas touché : on ne sait pas distinguer « annulé » d'« oublié ».
 *  · Un événement terminé ou annulé chez nous n'est plus modifié.
 *  · Flaix ne donne pas d'adversaire, d'affiche ? On garde ce que le club a mis.
 *  · Le lien de commande garde les ÉTIQUETTES d'identité (`[#mail]`…) : sans
 *    elles, Flaix ne reçoit plus l'e-mail du client, et ses commandes
 *    n'apparaissent plus dans « Mes commandes ». Un lien déjà en place qui mène
 *    à la même page est conservé tel quel ; un lien neuf reçoit le modèle.
 *  · L'heure d'ouverture de la commande (`commande.ouvreLe`) EST reprise
 *    (décision de Rémi du 25/11/2026 : « on s'adapte à lui ») et l'emporte sur
 *    l'heure du lieu (`Event.ordersOpenAt`, `fenetre-commande.ts`). Nulle chez
 *    Flaix : nulle chez nous, et l'heure du lieu reprend.
 */

/** Les étiquettes d'identité ajoutées à un lien de commande neuf. */
export const ETIQUETTES_IDENTITE =
  'firstname=[#firstname]&lastname=[#lastname]&mail=[#mail]&phone=[#Votre portable]';

/** À 3 h près : la tolérance d'adoption d'un événement saisi à la main. */
const ECART_ADOPTION_MS = 3 * 3600_000;
/** Sans heure de fin, un événement dure 3 h. */
const DUREE_PAR_DEFAUT_MS = 3 * 3600_000;

/** Un événement du flux, lu et vérifié. */
export interface EvenementFlux {
  /** L'identifiant Flaix stable. */
  cle: string;
  nom: string;
  debut: Date;
  fin: Date;
  adversaire: string | null;
  affiche: string | null;
  /** Le lien de commande, nu (sans étiquettes), vérifié ; null s'il manque. */
  lien: string | null;
  annule: boolean;
  /** L'heure d'ouverture de la commande donnée par Flaix, ou null. */
  ouvreLe: Date | null;
}

export interface FluxLu {
  lieu: string;
  evenements: EvenementFlux[];
  /** Les événements écartés, et pourquoi (pour les journaux). */
  ecartes: string[];
}

function texte(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function date(v: unknown): Date | null {
  const t = texte(v);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function estAnnule(statut: unknown): boolean {
  const s = texte(statut)?.toLowerCase() ?? '';
  return s.startsWith('annul') || s.startsWith('cancel');
}

/**
 * Lit une réponse du flux. Rend `null` si elle n'a pas la forme attendue — on
 * n'importe rien plutôt que d'importer de travers. Un événement illisible est
 * écarté seul, avec sa raison.
 */
export function lireFluxMatchs(json: unknown): FluxLu | null {
  if (!json || typeof json !== 'object') return null;
  const racine = json as Record<string, unknown>;
  if (!Array.isArray(racine.evenements)) return null;
  const lieu = racine.lieu as Record<string, unknown> | undefined;
  const lieuId = texte(lieu?.id) ?? '';

  const evenements: EvenementFlux[] = [];
  const ecartes: string[] = [];
  for (const brut of racine.evenements as unknown[]) {
    if (!brut || typeof brut !== 'object') continue;
    const e = brut as Record<string, unknown>;
    const cle =
      typeof e.idInterne === 'number' && Number.isFinite(e.idInterne)
        ? String(e.idInterne)
        : texte(e.idInterne) ?? texte(e.id) ?? (typeof e.id === 'number' ? String(e.id) : null);
    const nom = texte(e.nom);
    const debut = date(e.debut);
    if (!cle || !nom || !debut) {
      ecartes.push(`${cle ?? '?'} : identifiant, nom ou début manquant`);
      continue;
    }
    let fin = date(e.fin);
    if (!fin || fin.getTime() <= debut.getTime()) {
      fin = new Date(debut.getTime() + DUREE_PAR_DEFAUT_MS);
    }

    const commande = e.commande as Record<string, unknown> | undefined;
    const lienBrut = texte(commande?.lien) ?? texte(e.lienCommande);
    let lien: string | null = null;
    if (lienBrut) {
      const v = verifierLienFlaix(lienBrut);
      if (v.valide) lien = v.url;
      else ecartes.push(`${cle} : lien de commande refusé (${v.raison})`);
    }

    const afficheObj = e.affiche as Record<string, unknown> | string | null | undefined;
    const afficheBrute =
      typeof afficheObj === 'string' ? texte(afficheObj) : texte(afficheObj?.png) ?? texte(afficheObj?.url);
    let affiche: string | null = null;
    if (afficheBrute) {
      const v = verifierAffiche(afficheBrute);
      if (v.valide) affiche = v.url;
    }

    evenements.push({
      cle,
      nom: nom.slice(0, 200),
      debut,
      fin,
      adversaire: nettoyerNomAdversaire(texte(e.adversaire)),
      affiche,
      lien,
      annule: estAnnule(e.statut),
      ouvreLe: date(commande?.ouvreLe) ?? date(e.ouvertureCommande),
    });
  }
  return { lieu: lieuId, evenements, ecartes };
}

/** Le lien nu : origine et chemin, sans requête ni fragment (étiquettes). */
export function cheminDuLien(lien: string | null | undefined): string | null {
  if (!lien) return null;
  const coupe = lien.split(/[?#]/)[0];
  return coupe.replace(/\/+$/, '').toLowerCase() || null;
}

/** Le lien de commande à enregistrer pour un lien Flaix nu. */
export function lienAvecEtiquettes(lien: string): string {
  if (lien.includes('[#')) return lien;
  return `${lien}${lien.includes('?') ? '&' : '?'}${ETIQUETTES_IDENTITE}`;
}

/** Un événement du lieu, tel que l'import a besoin de le connaître. */
export interface EvenementExistant {
  id: string;
  flaixEventId: string | null;
  name: string;
  startAt: Date;
  endAt: Date;
  status: EventStatus;
  isPermanentContainer: boolean;
  flaixOrderUrl: string | null;
  opponentName: string | null;
  posterUrl: string | null;
  ordersOpenAt: Date | null;
}

export interface ChampsEvenement {
  name?: string;
  startAt?: Date;
  endAt?: Date;
  status?: EventStatus;
  flaixEventId?: string;
  flaixOrderUrl?: string;
  opponentName?: string;
  posterUrl?: string;
  ordersOpenAt?: Date | null;
}

export type Decision =
  | { type: 'creer'; cle: string; data: Required<Pick<ChampsEvenement, 'name' | 'startAt' | 'endAt' | 'flaixEventId'>> & ChampsEvenement }
  | { type: 'modifier'; cle: string; eventId: string; data: ChampsEvenement; adopte: boolean }
  | { type: 'ignorer'; cle: string; raison: string };

const FIGES: EventStatus[] = [EventStatus.ENDED, EventStatus.CANCELLED];

/**
 * Ce qu'il faut faire de chaque événement du flux, au vu de ceux du lieu.
 * Ne décide RIEN pour un événement absent du flux.
 */
export function deciderImport(
  flux: EvenementFlux[],
  existants: EvenementExistant[],
  maintenant: Date,
): Decision[] {
  const parCle = new Map<string, EvenementExistant>();
  for (const e of existants) if (e.flaixEventId) parCle.set(e.flaixEventId, e);
  // Un événement saisi à la main ne s'adopte qu'une fois par passage.
  const adoptes = new Set<string>();
  const decisions: Decision[] = [];

  for (const f of flux) {
    let ev = parCle.get(f.cle);
    let adopte = false;

    if (!ev) {
      const libres = existants.filter(
        (e) => !e.flaixEventId && !e.isPermanentContainer && !FIGES.includes(e.status) && !adoptes.has(e.id),
      );
      const chemin = cheminDuLien(f.lien);
      const parLien = chemin ? libres.filter((e) => cheminDuLien(e.flaixOrderUrl) === chemin) : [];
      const parHeure = libres.filter(
        (e) => Math.abs(e.startAt.getTime() - f.debut.getTime()) <= ECART_ADOPTION_MS,
      );
      const candidat = parLien.length === 1 ? parLien[0] : parLien.length === 0 && parHeure.length === 1 ? parHeure[0] : undefined;
      if (candidat) {
        ev = candidat;
        adopte = true;
        adoptes.add(candidat.id);
      }
    }

    if (!ev) {
      if (f.annule) {
        decisions.push({ type: 'ignorer', cle: f.cle, raison: 'annulé, jamais importé' });
        continue;
      }
      if (f.fin.getTime() <= maintenant.getTime()) {
        decisions.push({ type: 'ignorer', cle: f.cle, raison: 'déjà terminé' });
        continue;
      }
      decisions.push({
        type: 'creer',
        cle: f.cle,
        data: {
          name: f.nom,
          startAt: f.debut,
          endAt: f.fin,
          flaixEventId: f.cle,
          ...(f.lien ? { flaixOrderUrl: lienAvecEtiquettes(f.lien) } : {}),
          ...(f.adversaire ? { opponentName: f.adversaire } : {}),
          ...(f.affiche ? { posterUrl: f.affiche } : {}),
          ...(f.ouvreLe ? { ordersOpenAt: f.ouvreLe } : {}),
        },
      });
      continue;
    }

    if (FIGES.includes(ev.status)) {
      decisions.push({ type: 'ignorer', cle: f.cle, raison: `figé chez BreakEat (${ev.status})` });
      continue;
    }

    const data: ChampsEvenement = {};
    if (adopte) data.flaixEventId = f.cle;
    if (f.annule) {
      data.status = EventStatus.CANCELLED;
    } else {
      if (ev.name !== f.nom) data.name = f.nom;
      if (ev.startAt.getTime() !== f.debut.getTime()) data.startAt = f.debut;
      if (ev.endAt.getTime() !== f.fin.getTime()) data.endAt = f.fin;
      if (f.lien && cheminDuLien(ev.flaixOrderUrl) !== cheminDuLien(f.lien)) {
        data.flaixOrderUrl = lienAvecEtiquettes(f.lien);
      }
      if (f.adversaire && ev.opponentName !== f.adversaire) data.opponentName = f.adversaire;
      if (f.affiche && ev.posterUrl !== f.affiche) data.posterUrl = f.affiche;
      // L'heure d'ouverture suit Flaix, y compris quand il la retire.
      if ((ev.ordersOpenAt?.getTime() ?? null) !== (f.ouvreLe?.getTime() ?? null)) {
        data.ordersOpenAt = f.ouvreLe;
      }
    }

    if (Object.keys(data).length === 0) {
      decisions.push({ type: 'ignorer', cle: f.cle, raison: 'à jour' });
    } else {
      decisions.push({ type: 'modifier', cle: f.cle, eventId: ev.id, data, adopte });
    }
  }
  return decisions;
}
