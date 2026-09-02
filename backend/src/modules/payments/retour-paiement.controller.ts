import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

/**
 * Le retour de la page de paiement.
 *
 * Stripe n'accepte comme `success_url` qu'une adresse http(s) : impossible d'y
 * mettre `breakeat://` directement. Sans intermédiaire, le client qui vient de
 * payer reste bloqué sur une page web, l'app ne sait rien, et il doit revenir
 * à la main — en découvrant une liste de commandes vide.
 *
 * Cette route est ce chaînon : une page minuscule qui rebondit VERS l'app.
 * Elle ne touche à rien, ne lit rien en base, et n'a besoin d'aucune session —
 * c'est Stripe qui l'appelle, dans le navigateur du client.
 *
 * La destination n'est JAMAIS fournie par l'appelant : `cible` est un choix
 * fermé entre `app` et `web`. Accepter une URL de retour libre ferait de cette
 * route une redirection ouverte, utilisable pour maquiller un lien de phishing
 * derrière notre domaine.
 */
@Controller('paiement')
export class RetourPaiementController {
  constructor(private readonly config: ConfigService) {}

  @Get('retour')
  @Header('Cache-Control', 'no-store')
  retour(
    @Query('panier') panier: string,
    @Query('etat') etat: string,
    @Query('cible') cible: string,
    @Res() res: Response,
  ): void {
    const paye = etat !== 'annule';
    const id = encodeURIComponent(panier ?? '');

    // Le web n'a pas besoin de rebond : on renvoie directement dans l'app web.
    if (cible !== 'app') {
      const base = (this.config.get<string>('app.split.webUrl') ?? '').replace(/\/+$/, '');
      res.redirect(302, paye ? `${base}/commandes?paye=1` : `${base}/panier?annule=1`);
      return;
    }

    const lien = `breakeat://paiement?panier=${id}&etat=${paye ? 'ok' : 'annule'}`;

    // Redirection immédiate, ET un lien visible.
    //
    // Le rebond automatique suffit dans l'immense majorité des cas. Mais si
    // iOS le bloque — page ouverte hors du navigateur intégré, réglage de
    // confidentialité — le client doit avoir un bouton, pas un écran blanc :
    // il vient de payer, c'est le pire moment pour le laisser sans issue.
    res.type('html').send(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${paye ? 'Paiement accepté' : 'Paiement annulé'}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
       background:#faf8f6;color:#2d2926;text-align:center;padding:24px}
  .c{max-width:340px}
  h1{font-size:21px;margin:0 0 8px;font-weight:700}
  p{font-size:15px;line-height:1.5;color:#6b625c;margin:0 0 24px}
  a{display:inline-block;background:#FC4002;color:#fff;text-decoration:none;
    border-radius:10px;padding:14px 26px;font-size:16px;font-weight:700}
</style>
</head>
<body>
  <div class="c">
    <h1>${paye ? '\u2713 Paiement accepté' : 'Paiement annulé'}</h1>
    <p>${paye ? 'Retour à Break Eat…' : 'Rien n’a été débité.'}</p>
    <a href="${lien}">Revenir à Break Eat</a>
  </div>
  <script>location.replace(${JSON.stringify(lien)});</script>
</body>
</html>`);
  }
}
