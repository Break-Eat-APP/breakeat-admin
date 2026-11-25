import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewMessageEvent,
  WebViewNavigation,
} from 'react-native-webview/lib/WebViewTypes';
import { estChezFlaix, hoteHorsFlaix, navigationAutorisee } from '@lib/navigation-flaix';
import { creerSignalCommandeFlaix } from '@lib/signal-commande-flaix';
import { apiGetMesCommandesFlaix, apiSuivreCommandeFlaix } from '@lib/api/mobile-api';
import { useAuthStore } from '@store/auth.store';
import {
  INTERCEPTION_FERMETURE,
  estMessageFermer,
  jetonDeLAdresse,
  jetonDuMessage,
  nouvellesCommandes,
} from '@lib/suivi-commande-flaix';
import { navigateTo } from '@navigation/nav-ref';
import { suivreCommandeFlaixDansLApp } from '@lib/live-activity-tracking';
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
// La liste des domaines et la règle vivent dans `lib/navigation-flaix.ts` (testées).

export function RelaisFlaix({ url, titre }: { url: string; titre: string }) {
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  // L'adresse affichée quand la page a quitté Flaix (paiement chez un
  // prestataire) — la barre d'adresse que la page intégrée n'a pas.
  const [ailleurs, setAilleurs] = useState<string | null>(null);
  const webview = useRef<WebView>(null);

  /**
   * « TA COMMANDE EST PRÊTE » SANS PASSER PAR « MES COMMANDES » (24/11/2026).
   * Le serveur ne surveille une commande Flaix qu'après l'avoir lue : la page
   * la lui fait lire quand elle se pose (confirmation du paiement comprise),
   * quand on la ferme, et quand l'app passe en arrière-plan — le client qui
   * range son téléphone juste après avoir payé. Voir `lib/signal-commande-flaix.ts`.
   */
  /**
   * LA COMMANDE PAYÉE, ET SA LIVE ACTIVITY (24-25/11/2026).
   *
   * Flaix reste sur l'adresse du match après le paiement (constaté par Rémi le
   * 25/11 : `…/o/lemans-fc-vs-lyon`) : l'adresse ne dit pas quelle commande
   * vient d'être passée. Trois façons de la reconnaître, une seule suite :
   *  1. le MESSAGE de la page Flaix (`flaix_commande`), si son développeur
   *     l'ajoute — immédiat ;
   *  2. une adresse en `…/orders/<jeton>`, si Flaix y passe un jour ;
   *  3. sinon, la LISTE du client relue quand la page se pose, quand on la
   *     quitte, et au retour dans l'app : toute commande en cours apparue
   *     depuis l'ouverture de la page est la sienne.
   *
   * PAS DE DOUBLON : une commande n'est suivie qu'une fois ici (`suivies`),
   * `suivreCommandeFlaix` ne démarre pas une activité qui existe déjà, et le
   * serveur ignore une commande déjà suivie.
   *
   * iOS ne démarre une Live Activity que l'app À L'ÉCRAN : en arrière-plan, on
   * fait seulement suivre la commande au serveur (la notification « prête »
   * partira), et l'activité démarre au retour dans l'app.
   */
  const ouverteLe = useRef(Date.now());
  const connues = useRef<Set<string> | null>(null);
  const suivies = useRef(new Set<string>());

  const suivreJeton = (jeton: string) => {
    if (suivies.current.has(jeton) || !useAuthStore.getState().token) return;
    if (AppState.currentState !== 'active') {
      void apiSuivreCommandeFlaix(jeton).catch(() => undefined);
      return;
    }
    suivies.current.add(jeton);
    void suivreCommandeFlaixDansLApp(jeton);
  };

  const surAdresse = (adresse: string) => {
    const jeton = jetonDeLAdresse(adresse);
    if (jeton) suivreJeton(jeton);
  };

  const surMessage = (e: WebViewMessageEvent) => {
    // « Fermer » dans la page Flaix : direction « Mes commandes » (Rémi,
    // 25/11/2026). Quitter cet écran relit la liste : la commande qui vient
    // d'être passée y est suivie, et sa Live Activity démarre.
    if (estMessageFermer(e.nativeEvent.data)) {
      navigateTo('Commandes');
      return;
    }
    const jeton = jetonDuMessage(e.nativeEvent.data);
    if (jeton) suivreJeton(jeton);
  };

  /** Relit la liste (ce qui la met sous surveillance) et repère la nouvelle commande. */
  const lireEtReperer = async () => {
    const r = await apiGetMesCommandesFlaix();
    for (const jeton of nouvellesCommandes(r.commandes ?? [], connues.current ?? new Set(), ouverteLe.current)) {
      suivreJeton(jeton);
    }
  };

  const signal = useMemo(
    () =>
      creerSignalCommandeFlaix({
        lire: () => lireEtReperer(),
        estConnecte: () => Boolean(useAuthStore.getState().token),
      }),
    // `lireEtReperer` ne lit que des références : une seule création suffit.
    [],
  );

  // Les commandes que le client a DÉJÀ à l'ouverture de la page : elles ne sont
  // pas « la nouvelle ».
  useEffect(() => {
    if (!useAuthStore.getState().token) return;
    void apiGetMesCommandesFlaix()
      .then((r) => {
        connues.current = new Set((r.commandes ?? []).map((c) => c.id));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // Au départ ET au retour : au retour, l'app est à l'écran, et c'est là
    // seulement qu'iOS laisse démarrer la Live Activity.
    const abonnement = AppState.addEventListener('change', () => {
      void signal.maintenant();
    });
    return () => {
      abonnement.remove();
      void signal.maintenant();
    };
  }, [signal]);

  /**
   * CE QUE LA PAGE A LE DROIT D'OUVRIR — `lib/navigation-flaix.ts`, testé.
   *
   * Elle refusait net tout ce qui sortait de Flaix, ce qui aurait bloqué SANS
   * UN MOT un paiement redirigé vers son prestataire, ou un champ de carte
   * hébergé chez lui (audit du 09/11). Désormais : Flaix toujours, le reste
   * seulement en HTTPS — et l'adresse s'affiche dès qu'on a quitté Flaix.
   */
  const resteChezFlaix = (nav: ShouldStartLoadRequest): boolean => navigationAutorisee(nav.url);

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
        onMessage={surMessage}
        injectedJavaScriptBeforeContentLoaded={INTERCEPTION_FERMETURE}
        onNavigationStateChange={(nav: WebViewNavigation) => {
          setAilleurs(hoteHorsFlaix(nav.url));
          if (!nav.loading && estChezFlaix(nav.url)) signal.planifier();
          surAdresse(nav.url);
        }}
        style={styles.vue}
      />
      {ailleurs ? (
        // HORS DE FLAIX, ON LE DIT : le paiement se poursuit chez un
        // prestataire, et le client voit chez qui — cadenas et nom de domaine.
        <View style={styles.adresse} pointerEvents="none">
          <Ionicons name="lock-closed" size={13} color={THEME.inkSoft} />
          <Text style={styles.adresseTexte} numberOfLines={1}>
            Paiement sur {ailleurs}
          </Text>
        </View>
      ) : null}
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
  adresse: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: THEME.bgSubtle,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  adresseTexte: { color: THEME.inkSoft, fontSize: 12.5, fontFamily: FONT.semibold },
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
