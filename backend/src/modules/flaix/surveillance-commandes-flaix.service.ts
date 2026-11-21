import { Injectable, Logger, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ExpoPushService } from '../notifications/expo-push.service';
import { PushTokensService } from '../notifications/push-tokens.service';
import {
  CommandesClientFlaixService,
  estPrete,
  estTerminal,
  type CommandeFlaix,
} from './commandes-client-flaix.service';

/**
 * « Ta commande est prête » pour une commande passée dans FLAIX (21/11/2026).
 *
 * POURQUOI. Flaix ne prévient pas BreakEat quand l'opérateur passe une commande
 * « prête » (le webhook E1 n'existe pas encore). Sans ce service, BreakEat ne
 * l'apprenait que si l'écran « Mes commandes » du client le demandait :
 * téléphone en poche, aucune notification.
 *
 * COMMENT. Chaque fois que « Mes commandes » est lu, le serveur retient les
 * commandes Flaix en cours de ce client. Toutes les 15 s, il demande leur état
 * à Flaix ; au passage à « prête », il envoie la même notification qu'une
 * commande BreakEat (toucher ouvre « Mes commandes »), UNE fois.
 *
 * ⚠️ DÉPANNAGE, PAS LE SYSTÈME DÉFINITIF (ADR-0015). La liste est en MÉMOIRE :
 *  - le client doit avoir ouvert « Mes commandes » une fois après sa commande ;
 *  - un redémarrage du serveur l'efface (reprise à la prochaine lecture) ;
 *  - un envoi raté n'est pas rejoué.
 * C'est l'inverse de la règle 3 de CLAUDE.md, assumé pour le match du 22/11.
 * Le webhook `ORDER_READY` de Flaix le remplacera.
 */

/** Rythme des vérifications chez Flaix. */
const INTERVALLE_MS = 15_000;
/** Au-delà, une commande n'est plus surveillée, quel que soit son état. */
const DUREE_MAX_MS = 12 * 60 * 60 * 1000;
/** Garde-fou mémoire : au-delà, les nouvelles commandes ne sont pas suivies. */
const MAX_SUIVIES = 5_000;
/** Appels simultanés vers Flaix, au plus. */
const PAR_PAQUET = 10;

interface Suivie {
  userId: string;
  numero: string;
  pointDeRetrait: string | null;
  passeeLe: number;
}

@Injectable()
export class SurveillanceCommandesFlaixService {
  private readonly logger = new Logger(SurveillanceCommandesFlaixService.name);
  private readonly suivies = new Map<string, Suivie>();
  /**
   * Les commandes déjà annoncées, et quand. Sans elles, une liste encore en
   * cache (lue juste avant « prête ») remettrait la commande en surveillance,
   * et le client recevrait la notification deux fois.
   */
  private readonly annoncees = new Map<string, number>();
  private tourEnCours = false;

  constructor(
    private readonly commandes: CommandesClientFlaixService,
    @Optional() private readonly expoPush?: ExpoPushService,
    @Optional() private readonly pushTokens?: PushTokensService,
  ) {}

  /** Combien de commandes sont surveillées (journaux, tests). */
  get taille(): number {
    return this.suivies.size;
  }

  /**
   * Retient les commandes en cours, pas encore prêtes, de ce client. Une
   * commande déjà prête n'est pas retenue : le client la voit à l'écran.
   */
  surveiller(userId: string, commandes: CommandeFlaix[]): void {
    for (const c of commandes) {
      if (!c.enCours || c.prete || this.suivies.has(c.id) || this.annoncees.has(c.id)) continue;
      if (this.suivies.size >= MAX_SUIVIES) {
        this.logger.warn('Surveillance Flaix pleine : commande non suivie');
        return;
      }
      this.suivies.set(c.id, {
        userId,
        numero: c.numero,
        pointDeRetrait: c.pointDeRetrait,
        passeeLe: new Date(c.passeeLe).getTime() || Date.now(),
      });
    }
  }

  @Interval(INTERVALLE_MS)
  async tourner(maintenant: Date = new Date()): Promise<void> {
    for (const [jeton, a] of this.annoncees) {
      if (maintenant.getTime() - a > DUREE_MAX_MS) this.annoncees.delete(jeton);
    }
    if (this.tourEnCours || this.suivies.size === 0) return;
    this.tourEnCours = true;
    try {
      const entrees = [...this.suivies.entries()];
      for (let i = 0; i < entrees.length; i += PAR_PAQUET) {
        await Promise.all(
          entrees.slice(i, i + PAR_PAQUET).map(([jeton, s]) => this.verifier(jeton, s, maintenant)),
        );
      }
    } catch (e: unknown) {
      this.logger.error(`Surveillance Flaix : tour interrompu (${String(e)})`);
    } finally {
      this.tourEnCours = false;
    }
  }

  private async verifier(jeton: string, s: Suivie, maintenant: Date): Promise<void> {
    if (maintenant.getTime() - s.passeeLe > DUREE_MAX_MS) {
      this.suivies.delete(jeton);
      return;
    }
    const e = await this.commandes.lireEtat(jeton);
    if (!e) return; // Flaix muet : on retentera au tour suivant.
    if (estPrete(e.etat)) {
      // Retirée AVANT l'envoi : une notification au plus, jamais deux.
      this.suivies.delete(jeton);
      this.annoncees.set(jeton, maintenant.getTime());
      await this.annoncer(s);
      return;
    }
    if (estTerminal(e.etat)) this.suivies.delete(jeton);
  }

  private async annoncer(s: Suivie): Promise<void> {
    if (!this.expoPush || !this.pushTokens) return;
    try {
      const jetons = await this.pushTokens.tokensForUsers([s.userId]);
      if (jetons.length === 0) return;
      const titre = 'Ta commande est prête';
      const corps =
        (s.numero ? `Commande n° ${s.numero} — ` : '') +
        (s.pointDeRetrait
          ? `à récupérer au point de retrait ${s.pointDeRetrait}.`
          : 'à récupérer au point de retrait.');
      const resultat = await this.expoPush.send(
        jetons.map((to) => ({
          to,
          title: titre,
          body: corps,
          sound: 'default' as const,
          // Même type qu'une commande BreakEat : l'app ouvre « Mes commandes ».
          data: { type: 'order_ready', source: 'flaix' },
        })),
      );
      if (resultat.invalidTokens.length > 0) await this.pushTokens.purgeInvalid(resultat.invalidTokens);
      this.logger.log(`Commande Flaix ${s.numero} prête : ${resultat.sent} appareil(s) prévenu(s)`);
    } catch (e: unknown) {
      this.logger.error(`Commande Flaix ${s.numero} prête, notification non envoyée (${String(e)})`);
    }
  }
}
