import helmet from 'helmet';
import { optionsHelmet } from './entetes';

/**
 * La politique de sécurité des en-têtes, tenue par des tests.
 *
 * Deux dangers opposés, et ces tests gardent les deux côtés :
 *   • la relâcher sans s'en rendre compte ;
 *   • la RESSERRER par réflexe, et casser silencieusement la page de retour de
 *     paiement — celle que voit un client qui vient de donner sa carte.
 *
 * On exécute le vrai `helmet` sur une fausse réponse plutôt que d'inspecter
 * l'objet de configuration : ce qui compte est l'en-tête RÉELLEMENT posé.
 */
describe('En-têtes de sécurité', () => {
  /** Passe une requête à travers `helmet` et rend les en-têtes obtenus. */
  function entetes(): Record<string, string> {
    const poses: Record<string, string> = {};
    const res = {
      setHeader: (nom: string, valeur: string | string[]) => {
        poses[nom.toLowerCase()] = Array.isArray(valeur) ? valeur.join(', ') : String(valeur);
      },
      removeHeader: (nom: string) => {
        delete poses[nom.toLowerCase()];
      },
      getHeader: () => undefined,
    };
    helmet(optionsHelmet)({ secure: true } as never, res as never, () => undefined);
    return poses;
  }

  it('impose HTTPS pour les visites suivantes', () => {
    expect(entetes()['strict-transport-security']).toContain('max-age=');
  });

  it('interdit au navigateur de deviner un type de contenu', () => {
    expect(entetes()['x-content-type-options']).toBe('nosniff');
  });

  it('interdit d’afficher l’API dans un cadre', () => {
    const e = entetes();
    expect(e['x-frame-options']).toBe('SAMEORIGIN');
    expect(e['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('n’autorise RIEN par défaut', () => {
    expect(entetes()['content-security-policy']).toContain("default-src 'none'");
  });

  describe('les deux assouplissements, et leur raison', () => {
    it('autorise le style et le script EN LIGNE', () => {
      // Le reçu et la page de retour de paiement sont des pages autonomes :
      // elles portent tout, sans fichier joint. Retirer ces deux exceptions
      // afficherait une page nue au client qui vient de payer, et le rebond
      // vers l'application ne partirait jamais.
      const csp = entetes()['content-security-policy'];
      expect(csp).toContain("style-src 'unsafe-inline'");
      expect(csp).toContain("script-src 'unsafe-inline'");
    });

    it('laisse les tableaux de bord lire les réponses', () => {
      // Ils sont hébergés ailleurs : une politique de ressources fermée les
      // couperait de l'API. C'est CORS qui tranche cette question, et il est
      // déjà limité à une liste d'origines.
      expect(entetes()['cross-origin-resource-policy']).toBeUndefined();
    });
  });

  it('ferme ce qui ne coûte rien à fermer', () => {
    const csp = entetes()['content-security-policy'];
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });
});
