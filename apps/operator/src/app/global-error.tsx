'use client';

/**
 * L'ÉCRAN DE DERNIER RECOURS DU POSTE OPÉRATEUR.
 *
 * Next.js affiche ce composant quand une erreur casse la racine de
 * l'application — le cas où aucune autre frontière d'erreur ne peut rattraper.
 * Deux raisons de l'écrire :
 *
 *  • **l'erreur arrive dans Sentry.** Sans ce fichier, une erreur de rendu de
 *    la racine ne remontait nulle part : l'équipière voyait une page blanche,
 *    et nous n'avions aucune trace. Le build le signalait à chaque passage ;
 *
 *  • **l'équipière a un bouton.** En plein service, les mains occupées, un
 *    écran blanc sans issue oblige à redémarrer le navigateur. « Réessayer »
 *    remonte la page sans perdre la session.
 *
 * Volontairement sans dépendance ni style importé : ce composant remplace le
 * `layout`, donc tout ce qu'il utilise doit survivre à la panne qui l'amène.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#faf8f5',
          color: '#2d2926',
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, margin: '0 0 10px' }}>Le poste a rencontré un problème</h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.5, color: '#6b6560', margin: '0 0 20px' }}>
            Les commandes en cours ne sont pas perdues : elles vivent sur le serveur.
            Réessaie, et si l’écran revient, appelle le support.
          </p>
          <button
            onClick={() => reset()}
            style={{
              border: 0,
              borderRadius: 12,
              padding: '12px 24px',
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              background: '#ff6b35',
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
          {/*
            La référence technique, en petit : c'est elle qu'on demande au
            support, et la chercher dans une console pendant un service est
            impossible.
          */}
          {error.digest ? (
            <p style={{ fontSize: 11, color: '#a8a29e', marginTop: 18 }}>Réf. {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
