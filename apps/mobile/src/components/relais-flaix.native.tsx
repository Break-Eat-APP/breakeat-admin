import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

import { THEME, FONT } from '@lib/theme';

/**
 * LE RELAIS FLAIX — version NATIVE (iOS / Android).
 *
 * La page de commande Flaix s'affiche DANS l'application, sans barre d'adresse
 * et sans quitter l'écran. Deux raisons, et la seconde n'est pas cosmétique :
 *
 *  1. la marque blanche. Flaix fait partie de Break Eat ; voir « flaixlabs.com »
 *     dans une barre d'adresse ferait apparaître un tiers au milieu du parcours ;
 *  2. la règle 4.2 d'Apple. Une application qui éjecte vers Safari pour sa
 *     fonction principale s'expose au refus « minimum functionality ». Le
 *     relais doit rester dedans.
 *
 * Pourquoi un fichier `.native` : `react-native-webview` ne rend pas sur le
 * web, et l'export web sert les clients qui n'installent pas l'app. Metro
 * choisit `relais-flaix.tsx` là-bas (une `iframe`), celui-ci ici.
 */
/**
 * Les domaines de Flaix — `flaixlabs.com` pour l'application et ses rapports,
 * `synertic.net` pour les pages de commande
 * (`commande.flaix.bo.synertic.net`).
 *
 * ⚠️ MÊME LISTE QUE `backend/src/modules/events/lien-flaix.ts`. Les deux
 * vivent dans des paquets différents, sans dépendance commune : toute
 * modification vaut pour les DEUX. Le serveur décide quel lien est
 * enregistrable ; celle-ci décide où la page a le droit d'emmener le client
 * une fois ouverte. Si elles divergent, un lien accepté par l'un se bloque
 * chez l'autre — écran blanc, sans explication.
 */
const DOMAINES_FLAIX = ['flaixlabs.com', 'synertic.net'] as const;

export function RelaisFlaix({ url, titre }: { url: string; titre: string }) {
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const webview = useRef<WebView>(null);

  /**
   * On ne suit que Flaix.
   *
   * Cette page prend un PAIEMENT. Si un lien y menait ailleurs — une publicité,
   * une page détournée — le client continuerait à croire qu'il est chez Break
   * Eat, sans barre d'adresse pour le détromper. Tout ce qui sort du domaine
   * est donc refusé net.
   *
   * `about:blank` et les formulaires internes passent : ce sont des étapes
   * normales d'une page de paiement.
   */
  const resteChezFlaix = (nav: WebViewNavigation): boolean => {
    if (!nav.url || nav.url === 'about:blank') return true;
    try {
      const hote = new URL(nav.url).hostname.toLowerCase();
      return DOMAINES_FLAIX.some((d) => hote === d || hote.endsWith(`.${d}`));
    } catch {
      return false;
    }
  };

  if (erreur) {
    return (
      <View style={styles.vide}>
        <Ionicons name="cloud-offline-outline" size={44} color={THEME.grey} />
        <Text style={styles.videTitre}>Page indisponible</Text>
        <Text style={styles.videTexte}>
          La page de commande de {titre} n&apos;a pas pu se charger. Vérifie ta connexion.
        </Text>
        <Pressable
          style={styles.bouton}
          onPress={() => {
            setErreur(false);
            setChargement(true);
            webview.current?.reload();
          }}
        >
          <Text style={styles.boutonTexte}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.cadre}>
      <WebView
        ref={webview}
        source={{ uri: url }}
        // Sans cela, iOS ouvre un lecteur plein écran sur la moindre vidéo.
        allowsInlineMediaPlayback
        // La page garde sa session d'un passage à l'autre : c'est ce qui évite
        // au client de tout ressaisir s'il revient à son panier.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onLoadEnd={() => setChargement(false)}
        onError={() => {
          setChargement(false);
          setErreur(true);
        }}
        onShouldStartLoadWithRequest={resteChezFlaix}
        style={styles.vue}
      />
      {chargement ? (
        <View style={styles.attente} pointerEvents="none">
          <ActivityIndicator size="large" color={THEME.orange} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { flex: 1, backgroundColor: '#fff' },
  vue: { flex: 1 },
  // L'attente se pose PAR-DESSUS la page, qui se peint derrière : la masquer
  // ferait clignoter l'écran en blanc à chaque étape du paiement.
  attente: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  vide: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  videTitre: { color: THEME.ink, fontSize: 18, fontFamily: FONT.bold, marginTop: 6 },
  videTexte: {
    color: THEME.inkSoft,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: FONT.regular,
  },
  bouton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: THEME.orange,
  },
  boutonTexte: { color: '#fff', fontSize: 15, fontFamily: FONT.bold },
});
