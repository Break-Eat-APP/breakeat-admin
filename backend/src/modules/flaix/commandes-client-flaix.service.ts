import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Les commandes Flaix d'un client, pour « Mes commandes » (21/11/2026).
 *
 * POURQUOI CE MODULE. Une commande passée dans Flaix ne crée rien chez
 * BreakEat : le client qui commande au stade ne la retrouvait pas dans l'app.
 * En attendant le flux poussé par Flaix (E1, `brain/FLAIX_FLUX_EVENEMENTS_
 * CAHIER_DES_CHARGES.md`), on LIT ses commandes chez Flaix :
 *
 *   POST <url>/api/public/clients/commandes   { email }   (en-tête X-Api-Key)
 *   GET  <url>/api/public/orders/<jeton>/status           (public, par commande)
 *
 * Rien n'est écrit en base : Flaix reste la source de vérité de ses commandes
 * (CLAUDE.md, règle 4). C'est Flaix qui dit « prête ».
 *
 * LIMITES ASSUMÉES (Rémi, 21/11, pour le match du 22/11) :
 *  - le client est reconnu par son ADRESSE E-MAIL, que BreakEat ne vérifie
 *    pas ; à remplacer par l'étiquette `[#breakeatId]` ou une vérification ;
 *  - l'état en direct est lu à la demande (quand l'écran se recharge), pas
 *    poussé. La notification « prête » passe par une surveillance en mémoire
 *    (`surveillance-commandes-flaix.service.ts`) ; pas de Live Activity.
 *
 * UNE PANNE FLAIX N'ARRÊTE JAMAIS BREAKEAT : toute erreur rend une liste vide
 * et un journal, jamais une exception vers l'app.
 */

/** Délai maximal d'un appel à Flaix : l'écran ne doit pas attendre plus. */
const DELAI_MS = 5_000;
/** Une même liste n'est redemandée à Flaix qu'au-delà de ce délai. */
const CACHE_MS = 5_000;
/** Commandes rendues à l'app, au plus (les plus récentes). */
const MAX_COMMANDES = 50;
/** Lectures d'état en direct par liste, au plus (les plus récentes en cours). */
const MAX_LECTURES_ETAT = 5;
/** Au-delà, une commande n'est plus « en cours », quel que soit son état. */
const FENETRE_EN_COURS_MS = 12 * 60 * 60 * 1000;
/** États de suivi Flaix qui terminent une commande. */
const ETATS_TERMINAUX = new Set([
  'collected',
  'picked_up',
  'delivered',
  'done',
  'completed',
  'served',
  'cancelled',
  'canceled',
  'refunded',
  'failed',
  'expired',
]);

export interface LigneCommandeFlaix {
  produit: string;
  quantite: number;
  totalTtc: number;
  tauxTva: number | null;
}

export interface CommandeFlaix {
  /** Le jeton Flaix : identifiant stable de la commande. */
  id: string;
  /** Le numéro que le client donne au comptoir. */
  numero: string;
  passeeLe: string;
  lieu: string | null;
  /**
   * La photo du lieu BreakEat, et le logo du club (26/11/2026) : le ticket
   * Flaix montre la même image qu'un ticket BreakEat. Posés par le contrôleur.
   */
  lieuPhotoUrl?: string | null;
  lieuLogoUrl?: string | null;
  /** Le nom court du lieu chez Flaix (`guillaume-stadium`), pour la note (26/11/2026). */
  lieuId?: string | null;
  /** L'`idInterne` de l'événement chez Flaix. */
  evenementId?: string | null;
  ville: string | null;
  evenement: string | null;
  pointDeRetrait: string | null;
  /** Heure de retrait prévue, ISO, ou null. */
  retraitPrevu: string | null;
  /** Heure affichée par Flaix (« 16:11 »), plus fraîche que `retraitPrevu`. */
  retraitAffiche: string | null;
  lignes: LigneCommandeFlaix[];
  totalTtc: number;
  devise: string;
  /** État Flaix brut (`queued`, `ready`…), ou null s'il n'a pas été lu. */
  etat: string | null;
  /** Libellé Flaix de l'état (« En attente », « Prête »…). */
  etatLibelle: string;
  etatDetail: string | null;
  prete: boolean;
  enCours: boolean;
  lienSuivi: string | null;
  lienRecu: string | null;
}

export interface ReponseCommandesFlaix {
  /** false = la fonction est éteinte (variables absentes) : rien à afficher. */
  active: boolean;
  /**
   * true = Flaix n'a pas répondu : la liste vide ne veut PAS dire « aucune
   * commande » (audit Codex du 21/11, P2). L'app ne le lit pas encore.
   */
  indisponible?: boolean;
  commandes: CommandeFlaix[];
}

/**
 * L'origine Flaix configurée, si elle est sûre : HTTPS, sans identifiants,
 * sans chemin. Sinon chaîne vide, et la fonction s'éteint : la clé et
 * l'e-mail ne partent jamais en clair (audit Codex du 21/11, P2).
 */
function origineSure(brute: string, logger: Logger): string {
  const v = brute.trim();
  if (v === '') return '';
  try {
    const u = new URL(v);
    if (u.protocol === 'https:' && !u.username && !u.password) return u.origin;
  } catch {
    /* refusée ci-dessous */
  }
  logger.error('FLAIX_COMMANDES_URL refusée : une origine https:// est attendue. Commandes Flaix éteintes.');
  return '';
}

/* Forme de la réponse Flaix — lue défensivement : tout champ peut manquer. */
interface CommandeBrute {
  reference?: unknown;
  jeton?: unknown;
  passeeLe?: unknown;
  statut?: unknown;
  evenement?: { nom?: unknown; idInterne?: unknown } | null;
  lieu?: { nom?: unknown; ville?: unknown; id?: unknown } | null;
  pointDeRetrait?: unknown;
  retraitPrevu?: unknown;
  lignes?: unknown;
  total?: { ttc?: unknown; devise?: unknown } | null;
  lienSuivi?: unknown;
  lienRecu?: unknown;
}

interface SuiviBrut {
  status?: unknown;
  status_label?: unknown;
  status_hint?: unknown;
  pickup_str?: unknown;
}

const texte = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : null;
const nombre = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Libellés de secours quand l'état n'a pas pu être lu chez Flaix. */
const LIBELLES_STATUT: Record<string, string> = {
  en_attente: 'En attente',
  en_preparation: 'En préparation',
  prete: 'Prête',
  recuperee: 'Récupérée',
  remise: 'Récupérée',
  annulee: 'Annulée',
};

/** Le statut de la LISTE Flaix (français) → l'état du SUIVI Flaix (anglais). */
const ETAT_DE_LA_LISTE: Record<string, string> = {
  en_attente: 'queued',
  en_preparation: 'preparing',
  prete: 'ready',
  remise: 'delivered',
  recuperee: 'delivered',
  annulee: 'cancelled',
  remboursee: 'refunded',
};

/**
 * Le libellé montré au CLIENT. Flaix écrit « Remise » : c'est le mot de
 * l'opératrice, sur son tableau. Le client lit « Récupérée » (Rémi, 23/11).
 */
function libelleClient(etat: string, libelleFlaix: string | null): string | null {
  if (['delivered', 'collected', 'picked_up', 'done', 'completed', 'served'].includes(etat)) {
    return 'Récupérée';
  }
  return libelleFlaix;
}

/**
 * LA PHRASE SOUS LE NUMÉRO, ÉCRITE PAR BREAKEAT (22/11/2026).
 *
 * Flaix envoie la sienne (`status_hint`), mais elle VOUVOIE (« Présentez-vous
 * au point de retrait. », constaté sur un téléphone le 22/11), alors que l'app
 * tutoie le client (CLAUDE.md § 4). On ne garde donc de Flaix que l'ÉTAT, et
 * la phrase est la nôtre. Un état inconnu n'a pas de phrase : mieux vaut rien
 * qu'une phrase fausse.
 */
export function phraseEtat(etat: string): string | null {
  if (estPrete(etat)) return 'Ta commande t’attend au point de retrait.';
  if (['queued', 'pending', 'waiting', 'received', 'accepted', 'paid'].includes(etat)) {
    return 'Ta commande est dans la file, on la prépare bientôt.';
  }
  if (PREPARATION.includes(etat)) {
    return 'Ta commande est en préparation.';
  }
  return null;
}

/** Les mots de Flaix pour « en préparation » (le suivi n'est pas documenté). */
const PREPARATION = ['preparing', 'in_preparation', 'in_progress', 'cooking', 'assigned', 'processing', 'started'];
/** Ce que le suivi Flaix sait dire, et que BreakEat comprend. */
const ETATS_CONNUS = new Set([
  'queued', 'pending', 'waiting', 'received', 'accepted', 'paid', 'ready', ...PREPARATION,
]);

/**
 * L'AVANCEMENT D'UNE COMMANDE, pour comparer deux sources (25/11/2026).
 *
 * La liste Flaix parle le vocabulaire du CONTRAT (`en_preparation`…, § 6) ;
 * le suivi en direct (`/status`) a le sien, qui n'est pas documenté. Le
 * ticket affichait l'état du suivi : un mot inconnu pour « en préparation »
 * laissait la commande sur « reçue » (Rémi, 25/11). On garde désormais
 * l'étape LA PLUS AVANCÉE des deux. -1 : inconnu, ou annulée.
 */
export function rangEtat(etat: string | null | undefined): number {
  const e = (etat ?? '').toLowerCase();
  if (!e) return -1;
  if (ETATS_TERMINAUX.has(e)) return ['cancelled', 'canceled', 'refunded', 'failed', 'expired'].includes(e) ? -1 : 3;
  if (estPrete(e)) return 2;
  if (PREPARATION.includes(e)) return 1;
  if (ETATS_CONNUS.has(e)) return 0;
  return -1;
}

@Injectable()
export class CommandesClientFlaixService {
  private readonly logger = new Logger(CommandesClientFlaixService.name);
  /** Les états de suivi inconnus déjà signalés : une ligne de journal par mot. */
  private readonly etatsInconnus = new Set<string>();
  private readonly origine: string;
  private readonly cle: string;
  private readonly cache = new Map<string, { a: number; valeur: CommandeFlaix[] }>();

  constructor(config: ConfigService) {
    this.origine = origineSure(config.get<string>('app.flaix.commandesUrl') ?? '', this.logger);
    this.cle = config.get<string>('app.flaix.commandesApiKey') ?? '';
  }

  get active(): boolean {
    return this.origine !== '' && this.cle !== '';
  }

  async pourEmail(email: string | null | undefined, maintenant = new Date()): Promise<ReponseCommandesFlaix> {
    if (!this.active || !email) return { active: this.active, commandes: [] };
    const cleCache = email.trim().toLowerCase();
    const enCache = this.cache.get(cleCache);
    if (enCache && maintenant.getTime() - enCache.a < CACHE_MS) {
      return { active: true, commandes: enCache.valeur };
    }

    let brutes: CommandeBrute[];
    try {
      const res = await fetch(`${this.origine}/api/public/clients/commandes`, {
        method: 'POST',
        headers: { 'X-Api-Key': this.cle, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleCache }),
        signal: AbortSignal.timeout(DELAI_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Commandes Flaix : réponse ${res.status}`);
        return { active: true, indisponible: true, commandes: [] };
      }
      const corps = (await res.json()) as { commandes?: unknown };
      brutes = Array.isArray(corps?.commandes) ? (corps.commandes as CommandeBrute[]) : [];
    } catch (e: unknown) {
      this.logger.warn(`Commandes Flaix injoignables : ${String(e)}`);
      return { active: true, indisponible: true, commandes: [] };
    }

    // Les plus récentes d'abord, et pas plus de MAX_COMMANDES (audit Codex du
    // 21/11, P2 : rien ne bornait la liste ni les lectures d'état).
    const commandes = brutes
      .map((b) => this.convertir(b, maintenant))
      .filter((c): c is CommandeFlaix => c !== null)
      .sort((a, b) => new Date(b.passeeLe).getTime() - new Date(a.passeeLe).getTime())
      .slice(0, MAX_COMMANDES);

    // L'état en direct, seulement pour les commandes récentes : c'est lui qui
    // dit « prête ». Les anciennes gardent le statut de la liste.
    await Promise.all(
      commandes
        .filter((c) => c.enCours)
        .slice(0, MAX_LECTURES_ETAT)
        .map((c) => this.lireSuivi(c)),
    );

    this.cache.set(cleCache, { a: maintenant.getTime(), valeur: commandes });
    if (this.cache.size > 5_000) this.cache.clear();
    return { active: true, commandes };
  }

  /** Une commande brute → la forme de l'app. Null si elle est inutilisable. */
  convertir(b: CommandeBrute, maintenant: Date): CommandeFlaix | null {
    const id = texte(b.jeton);
    const passeeLe = texte(b.passeeLe);
    if (!id || !/^[A-Za-z0-9_-]{8,128}$/.test(id) || !passeeLe) return null;
    const statut = texte(b.statut);
    const recente = maintenant.getTime() - new Date(passeeLe).getTime() < FENETRE_EN_COURS_MS;
    // « remise » est le mot de l'OPÉRATRICE Flaix ; le client lit
    // « Récupérée » (choix de Rémi, 23/11/2026).
    const terminale =
      statut !== null && ['remise', 'recuperee', 'annulee', 'remboursee'].includes(statut);
    const lignes = Array.isArray(b.lignes) ? (b.lignes as Record<string, unknown>[]) : [];
    return {
      id,
      numero: texte(b.reference) ?? '',
      passeeLe,
      lieu: texte(b.lieu?.nom),
      lieuId: texte(b.lieu?.id),
      evenementId: typeof b.evenement?.idInterne === 'number' ? String(b.evenement.idInterne) : texte(b.evenement?.idInterne),
      ville: texte(b.lieu?.ville),
      evenement: texte(b.evenement?.nom),
      pointDeRetrait: texte(b.pointDeRetrait),
      retraitPrevu: texte(b.retraitPrevu),
      retraitAffiche: null,
      lignes: lignes.map((l) => ({
        produit: texte(l.produit) ?? 'Article',
        quantite: nombre(l.quantite),
        totalTtc: nombre(l.totalTtc),
        tauxTva: typeof l.tauxTva === 'number' ? l.tauxTva : null,
      })),
      totalTtc: nombre(b.total?.ttc),
      devise: texte(b.total?.devise) ?? 'EUR',
      // L'état de la liste, traduit dans le vocabulaire du suivi : une
      // commande qu'on ne relit pas en direct garde quand même le bon ticket.
      etat: (statut && ETAT_DE_LA_LISTE[statut]) ?? null,
      etatLibelle: (statut && LIBELLES_STATUT[statut]) ?? statut ?? 'Commande passée',
      etatDetail: null,
      prete: statut === 'prete',
      enCours: recente && !terminale,
      lienSuivi: this.lienSur(b.lienSuivi),
      lienRecu: this.lienSur(b.lienRecu),
    };
  }

  /** N'accepte qu'un lien https vers l'origine Flaix configurée. */
  private lienSur(v: unknown): string | null {
    const s = texte(v);
    if (!s) return null;
    try {
      const u = new URL(s);
      return u.protocol === 'https:' && u.origin === new URL(this.origine).origin ? u.toString() : null;
    } catch {
      return null;
    }
  }

  /**
   * L'état en direct d'une commande, par son jeton. Null si Flaix ne répond
   * pas, ou répond sans état : l'appelant garde alors ce qu'il savait.
   */
  async lireEtat(jeton: string): Promise<EtatFlaix | null> {
    if (!this.active || !/^[A-Za-z0-9_-]{8,128}$/.test(jeton)) return null;
    try {
      const res = await fetch(`${this.origine}/api/public/orders/${encodeURIComponent(jeton)}/status`, {
        signal: AbortSignal.timeout(DELAI_MS),
      });
      if (!res.ok) return null;
      const s = (await res.json()) as SuiviBrut;
      const etat = texte(s.status);
      if (!etat) return null;
      // Un mot que BreakEat ne connaît pas : on le NOTE, une fois, pour l'ajouter
      // (le vocabulaire du suivi Flaix n'est pas documenté, 25/11/2026).
      if (!ETATS_CONNUS.has(etat) && !ETATS_TERMINAUX.has(etat) && !this.etatsInconnus.has(etat)) {
        this.etatsInconnus.add(etat);
        this.logger.warn(`État de suivi Flaix inconnu : « ${etat} » (${texte(s.status_label) ?? 'sans libellé'})`);
      }
      return {
        etat,
        libelle: texte(s.status_label),
        // Jamais le texte de Flaix, qui vouvoie : la phrase est la nôtre.
        detail: phraseEtat(etat),
        retraitAffiche: texte(s.pickup_str),
      };
    } catch (e: unknown) {
      this.logger.warn(`Suivi Flaix ${jeton.slice(0, 6)}… illisible (${String(e)})`);
      return null;
    }
  }

  private async lireSuivi(c: CommandeFlaix): Promise<void> {
    const e = await this.lireEtat(c.id);
    if (!e) return;
    c.retraitAffiche = e.retraitAffiche;
    // La liste dit déjà plus loin (ex. « en_preparation » quand le suivi dit un
    // mot inconnu) : on garde l'étape de la liste (25/11/2026).
    // Une fin (récupérée, ANNULÉE…) dite par le suivi l'emporte toujours.
    if (!estTerminal(e.etat) && rangEtat(c.etat) > rangEtat(e.etat)) return;
    c.etat = e.etat;
    c.etatLibelle = libelleClient(e.etat, e.libelle) ?? c.etatLibelle;
    c.etatDetail = e.detail;
    c.prete = estPrete(e.etat);
    c.enCours = !estTerminal(e.etat);
  }
}

export interface EtatFlaix {
  etat: string;
  libelle: string | null;
  detail: string | null;
  retraitAffiche: string | null;
}

/** L'état de suivi Flaix qui veut dire « prête ». */
export const estPrete = (etat: string): boolean => etat === 'ready';
/** Les états de suivi Flaix qui terminent une commande. */
export const estTerminal = (etat: string): boolean => ETATS_TERMINAUX.has(etat);
