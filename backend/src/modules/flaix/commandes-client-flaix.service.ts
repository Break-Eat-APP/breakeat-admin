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
 *    poussé : aucune notification « prête » ni Live Activity pour ces
 *    commandes.
 *
 * UNE PANNE FLAIX N'ARRÊTE JAMAIS BREAKEAT : toute erreur rend une liste vide
 * et un journal, jamais une exception vers l'app.
 */

/** Délai maximal d'un appel à Flaix : l'écran ne doit pas attendre plus. */
const DELAI_MS = 5_000;
/** Une même liste n'est redemandée à Flaix qu'au-delà de ce délai. */
const CACHE_MS = 5_000;
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
  commandes: CommandeFlaix[];
}

/* Forme de la réponse Flaix — lue défensivement : tout champ peut manquer. */
interface CommandeBrute {
  reference?: unknown;
  jeton?: unknown;
  passeeLe?: unknown;
  statut?: unknown;
  evenement?: { nom?: unknown } | null;
  lieu?: { nom?: unknown; ville?: unknown } | null;
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
  annulee: 'Annulée',
};

@Injectable()
export class CommandesClientFlaixService {
  private readonly logger = new Logger(CommandesClientFlaixService.name);
  private readonly origine: string;
  private readonly cle: string;
  private readonly cache = new Map<string, { a: number; valeur: CommandeFlaix[] }>();

  constructor(config: ConfigService) {
    this.origine = (config.get<string>('app.flaix.commandesUrl') ?? '').replace(/\/+$/, '');
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
        return { active: true, commandes: [] };
      }
      const corps = (await res.json()) as { commandes?: unknown };
      brutes = Array.isArray(corps?.commandes) ? (corps.commandes as CommandeBrute[]) : [];
    } catch (e: unknown) {
      this.logger.warn(`Commandes Flaix injoignables : ${String(e)}`);
      return { active: true, commandes: [] };
    }

    const commandes = brutes
      .map((b) => this.convertir(b, maintenant))
      .filter((c): c is CommandeFlaix => c !== null);

    // L'état en direct, seulement pour les commandes récentes : c'est lui qui
    // dit « prête ». Les anciennes gardent le statut de la liste.
    await Promise.all(commandes.filter((c) => c.enCours).map((c) => this.lireSuivi(c, maintenant)));

    commandes.sort((a, b) => b.passeeLe.localeCompare(a.passeeLe));
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
    const terminale = statut !== null && ['recuperee', 'annulee', 'remboursee'].includes(statut);
    const lignes = Array.isArray(b.lignes) ? (b.lignes as Record<string, unknown>[]) : [];
    return {
      id,
      numero: texte(b.reference) ?? '',
      passeeLe,
      lieu: texte(b.lieu?.nom),
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
      etat: null,
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

  private async lireSuivi(c: CommandeFlaix, maintenant: Date): Promise<void> {
    try {
      const res = await fetch(`${this.origine}/api/public/orders/${encodeURIComponent(c.id)}/status`, {
        signal: AbortSignal.timeout(DELAI_MS),
      });
      if (!res.ok) return;
      const s = (await res.json()) as SuiviBrut;
      const etat = texte(s.status);
      if (!etat) return;
      c.etat = etat;
      c.etatLibelle = texte(s.status_label) ?? c.etatLibelle;
      c.etatDetail = texte(s.status_hint);
      c.retraitAffiche = texte(s.pickup_str);
      c.prete = etat === 'ready';
      c.enCours = !ETATS_TERMINAUX.has(etat);
    } catch (e: unknown) {
      this.logger.warn(`Suivi Flaix ${c.numero} illisible (${String(e)}) à ${maintenant.toISOString()}`);
    }
  }
}
