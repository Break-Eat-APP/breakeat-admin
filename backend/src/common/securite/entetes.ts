import type { HelmetOptions } from 'helmet';

/**
 * Les en-têtes de sécurité de l'API.
 *
 * Sortis de `main.ts` pour une raison précise : cette configuration est le
 * genre de chose qu'on « resserre » un jour par réflexe, sans savoir ce qu'elle
 * tient. Ici elle est lisible, commentée, et tenue par des tests qui disent
 * POURQUOI chaque assouplissement existe.
 *
 * Ce que `helmet` apporte réellement ici :
 *   • HSTS — le navigateur refuse de reparler à l'API en clair ;
 *   • `X-Content-Type-Options: nosniff` — pas de type deviné ;
 *   • `X-Frame-Options` / `frame-ancestors` — l'API ne peut pas être affichée
 *     dans un cadre, donc pas de détournement de clic ;
 *   • `Referrer-Policy` — nos adresses ne fuient pas vers les sites tiers.
 */
export const optionsHelmet: HelmetOptions = {
  contentSecurityPolicy: {
    // Écrite entièrement à la main : le défaut de `helmet` bloquerait les deux
    // pages HTML servies par l'API, et l'une d'elles est sur le chemin de
    // l'argent.
    useDefaults: false,
    directives: {
      // Rien n'est autorisé par défaut. Tout ce qui suit est une exception
      // pesée.
      defaultSrc: ["'none'"],

      // Le reçu et la page de retour de paiement portent leurs styles et leur
      // script EN LIGNE : ce sont des pages autonomes, sans fichier joint, et
      // c'est ce qui leur permet de s'afficher instantanément après un
      // paiement. Sans ces deux exceptions, le client verrait une page nue et
      // le rebond vers l'application ne partirait jamais.
      //
      // Le risque est contenu ailleurs : tout ce que ces pages affichent et qui
      // vient d'un club ou d'un client passe par `echapper()`.
      styleSrc: ["'unsafe-inline'"],
      scriptSrc: ["'unsafe-inline'"],

      // Le reçu peut porter un logo en ligne.
      imgSrc: ["'self'", 'data:'],

      // Aucune de nos pages ne soumet de formulaire ni ne change de base :
      // interdire les deux ferme des détournements classiques sans rien coûter.
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },

  // Les réponses sont lues par les tableaux de bord et par l'application,
  // hébergés sur d'autres domaines. Une politique de ressources fermée les
  // empêcherait de lire ce qu'on leur envoie — et c'est CORS, déjà limité à une
  // liste d'origines, qui décide de cette question.
  crossOriginResourcePolicy: false,
};
