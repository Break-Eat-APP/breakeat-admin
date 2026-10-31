import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * L'ENVOI DE COURRIEL — tout ce que le projet sait en envoyer.
 *
 * Il n'en envoyait aucun. Pas de SMTP, pas de fournisseur, pas de dépendance :
 * la récupération de mot de passe ne pouvait donc pas exister, et le lien
 * « Mot de passe oublié ? » affichait « à venir ».
 *
 * ── AUCUNE DÉPENDANCE AJOUTÉE, ET C'EST UN CHOIX ───────────────
 *
 * Resend et Brevo s'appellent par un seul POST. `fetch` est dans Node depuis
 * la 18. Ajouter `nodemailer` pour du SMTP aurait apporté un paquet à
 * surveiller, une montée de plus, et — dans ce dépôt — un risque de build
 * supplémentaire, pour un gain nul.
 *
 * ── TANT QUE RIEN N'EST CONFIGURÉ, LA FONCTION N'EXISTE PAS ────
 *
 * `estConfigure()` est faux, `/auth/password-reset/available` répond `false`,
 * et l'application n'offre pas le parcours. Si quelqu'un appelle la route
 * malgré tout, elle refuse par un 503 explicite.
 *
 * On ne fait PAS semblant. Une route qui répond « vérifie tes courriels »
 * sans pouvoir en envoyer est pire que le message d'attente qu'elle remplace :
 * le client attend, recommence, et finit par croire que son adresse est
 * inconnue.
 */
@Injectable()
export class CourrielService {
  private readonly logger = new Logger(CourrielService.name);

  constructor(private readonly config: ConfigService) {}

  private get reglages() {
    return {
      fournisseur: this.config.get<string>('app.courriel.fournisseur') ?? '',
      cle: this.config.get<string>('app.courriel.cle') ?? '',
      expediteur: this.config.get<string>('app.courriel.expediteur') ?? '',
      expediteurNom: this.config.get<string>('app.courriel.expediteurNom') ?? 'Break Eat',
    };
  }

  /**
   * Peut-on envoyer un courriel, là, maintenant ?
   *
   * Les trois réglages comptent, et l'expéditeur autant que la clé : un
   * fournisseur refuse un expéditeur dont le domaine n'est pas vérifié chez
   * lui, et le refus arrive à l'envoi — c'est-à-dire devant un client qui
   * attend son code.
   */
  estConfigure(): boolean {
    const { fournisseur, cle, expediteur } = this.reglages;
    return (
      (fournisseur === 'resend' || fournisseur === 'brevo') &&
      cle.trim() !== '' &&
      expediteur.trim() !== ''
    );
  }

  /** Le nom du fournisseur, pour le journal de démarrage. */
  fournisseur(): string {
    return this.estConfigure() ? this.reglages.fournisseur : 'aucun';
  }

  /**
   * Envoie un message en TEXTE BRUT.
   *
   * Pas de HTML, volontairement : un code à six chiffres n'a pas besoin de
   * mise en page, et un message en texte brut traverse mieux les filtres
   * qu'un courriel riche envoyé par un domaine jeune.
   *
   * LÈVE si l'envoi échoue. L'appelant décide quoi en dire au client — et dans
   * le cas de la réinitialisation, il ne doit rien en dire de plus que dans le
   * cas normal.
   */
  async envoyer(message: { a: string; sujet: string; texte: string }): Promise<void> {
    const { fournisseur, cle, expediteur, expediteurNom } = this.reglages;

    if (!this.estConfigure()) {
      // 503, et pas 500 : ce n'est pas une panne, c'est une fonction non
      // installée. La distinction compte pour qui lit les journaux.
      throw new ServiceUnavailableException('L’envoi de courriel n’est pas configuré.');
    }

    // Typé à la main : deux littéraux d'en-têtes aux clés DIFFÉRENTES forment
    // une union que `fetch` refuse — chaque branche voit la clé de l'autre
    // comme `undefined`, ce qui ne satisfait pas `Record<string, string>`.
    const requete: { url: string; entetes: Record<string, string>; corps: unknown } =
      fournisseur === 'resend'
        ? {
            url: 'https://api.resend.com/emails',
            entetes: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
            corps: {
              from: `${expediteurNom} <${expediteur}>`,
              to: [message.a],
              subject: message.sujet,
              text: message.texte,
            },
          }
        : {
            url: 'https://api.brevo.com/v3/smtp/email',
            entetes: { 'api-key': cle, 'Content-Type': 'application/json' },
            corps: {
              sender: { email: expediteur, name: expediteurNom },
              to: [{ email: message.a }],
              subject: message.sujet,
              textContent: message.texte,
            },
          };

    /**
     * UN DÉLAI, PARCE QU'UN TIERS PEUT NE JAMAIS RÉPONDRE.
     *
     * Sans lui, une requête suspendue tiendrait la connexion Prisma et le
     * fil d'exécution jusqu'au délai par défaut de l'hôte — plusieurs
     * minutes. Un soir de match, dix demandes suffiraient à occuper le
     * serveur pendant que le comptoir attend ses commandes.
     */
    const abandon = AbortSignal.timeout(10_000);

    let reponse: Response;
    try {
      reponse = await fetch(requete.url, {
        method: 'POST',
        headers: requete.entetes,
        body: JSON.stringify(requete.corps),
        signal: abandon,
      });
    } catch (e) {
      // L'ADRESSE DU DESTINATAIRE NE VA PAS DANS LE JOURNAL. Elle identifie
      // une personne, et un journal se partage plus facilement qu'une base.
      this.logger.error(
        `Envoi de courriel impossible (${fournisseur}) : ${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }

    if (!reponse.ok) {
      // Le corps de la réponse dit POURQUOI — domaine non vérifié, clé
      // révoquée, quota. C'est la première chose qu'on veut lire quand le
      // parcours ne marche pas, et elle ne contient pas l'adresse du client.
      const detail = await reponse.text().catch(() => '');
      this.logger.error(
        `Le fournisseur ${fournisseur} a refusé l’envoi (${reponse.status}) : ${detail.slice(0, 500)}`,
      );
      throw new Error(`Envoi refusé par ${fournisseur} (${reponse.status})`);
    }
  }
}
