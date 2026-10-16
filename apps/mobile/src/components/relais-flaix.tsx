import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * LE RELAIS FLAIX — version WEB.
 *
 * Deux fichiers pour ce composant, et c'est délibéré :
 *
 *  - celui-ci, `relais-flaix.tsx`, est pris par l'export web (Vercel) ;
 *  - `relais-flaix.native.tsx` est pris par iOS et Android.
 *
 * `react-native-webview` ne sait pas rendre sur le web. S'il était importé
 * ici, il casserait le bundle web — c'est-à-dire la version que les clients
 * utilisent SANS installer l'application, le soir d'un match, en scannant un
 * QR code. Metro choisit le bon fichier tout seul (même convention que
 * `paiement.ts` / `paiement.native.ts`).
 *
 * Sur le web, une `iframe` fait exactement le même travail, sans dépendance.
 */
export function RelaisFlaix({ url, titre }: { url: string; titre: string }) {
  return (
    <View style={styles.cadre}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {React.createElement('iframe' as any, {
        src: url,
        title: titre,
        style: {
          border: 'none',
          width: '100%',
          height: '100%',
          display: 'block',
        },
        // La page de Flaix prend un paiement : elle a besoin de ces deux-là,
        // et de rien de plus. Pas de caméra, pas de micro, pas de géoloc.
        allow: 'payment',
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { flex: 1, backgroundColor: '#fff' },
});
