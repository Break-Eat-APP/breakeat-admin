import type { NextConfig } from 'next';

/**
 * UNE BUILD PUBLIEE SANS ADRESSE D'API NE DOIT PAS SORTIR.
 *
 * `NEXT_PUBLIC_API_URL` est inlinee a la COMPILATION. Absente ce jour-la,
 * l'application part en ligne en visant `http://localhost:3000` — c'est-a-dire
 * LA MACHINE DU VISITEUR. Chaque appel echoue, et l'echec se deguise en
 * « identifiant incorrect » : on cherche des heures du cote des comptes.
 *
 * Le repli etait pose ICI, dans `env` : le code client ne pouvait meme pas
 * s'en apercevoir, puisqu'il recevait une adresse — la mauvaise. Son
 * `console.error` de secours ne partait donc jamais au bon moment, et il
 * n'aurait de toute facon ete lu que par qui ouvre la console, une fois la
 * panne en production.
 *
 * On ne bloque QUE sur Vercel (`process.env.VERCEL`), jamais en CI ni en
 * local : la CI compile pour verifier que le code tient, elle ne publie
 * rien, et un developpeur doit pouvoir construire sans configurer Vercel.
 */
const LOCAL_PAR_DEFAUT = 'http://localhost:3000/api/v1';

if (process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error(
    'NEXT_PUBLIC_API_URL est absente de cette build Vercel. Publiee telle quelle, ' +
      "l'application viserait " + LOCAL_PAR_DEFAUT + ' depuis le navigateur du ' +
      'visiteur, et tous les appels echoueraient. Poser la variable dans Vercel ' +
      '(Settings > Environment Variables), puis redeployer.',
  );
}


const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Shared workspace package shipping raw TS/TSX — Next must transpile it.
  transpilePackages: ['@break-eat/brand'],
  // Le repli local, et SEULEMENT en local : sur Vercel, le garde ci-dessus
  // a deja arrete la build si la variable manque.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? LOCAL_PAR_DEFAUT,
  },
};

export default nextConfig;
