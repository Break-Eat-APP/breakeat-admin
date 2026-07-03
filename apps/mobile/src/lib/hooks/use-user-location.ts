/**
 * useUserLocation — géolocalisation avec dégradation gracieuse, ÉTAT PARTAGÉ.
 *
 * Backé par un store Zustand : tous les écrans (Lieux, Profil…) partagent le même
 * statut/coords. S'appuie sur `navigator.geolocation` (présent nativement sur le web,
 * polyfillé sur natif via @react-native-community/geolocation une fois le setup fait).
 *
 * Deux niveaux d'« activation » :
 *  - permission NAVIGATEUR (granted/denied) — hors de notre contrôle une fois refusée ;
 *  - préférence APP `optedOut` (persistée) — l'utilisateur peut désactiver la géoloc
 *    dans le menu même si le navigateur l'autorise. C'est notre vrai bouton on/off.
 *
 * `request()` (clic) demande la position ET affiche un message d'aide multiplateforme
 * si l'accès est bloqué. `request({ silent: true })` (auto au montage) reste muet et
 * respecte `optedOut`.
 *
 * Setup natif (à faire côté app, comme pour le push) :
 *   1. `pnpm --filter @break-eat/mobile add @react-native-community/geolocation`
 *   2. permissions iOS (NSLocationWhenInUseUsageDescription) + Android
 *      (ACCESS_FINE_LOCATION), rebuild natif.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { showAlert } from '@lib/alert';

export interface Coords {
  lat: number;
  lng: number;
}

export type LocationStatus =
  | 'idle' // pas encore demandé
  | 'requesting' // demande en cours
  | 'granted' // position obtenue
  | 'denied' // refus utilisateur / bloqué par le navigateur
  | 'unavailable'; // API géoloc absente

const OPT_OUT_KEY = 'break_eat_loc_opt_out';

/** Forme minimale de l'API web Geolocation, présente seulement si polyfillée. */
interface GeolocationLike {
  getCurrentPosition(
    success: (pos: { coords: { latitude: number; longitude: number } }) => void,
    error?: (err: { code?: number; message?: string }) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ): void;
}

interface PermissionsLike {
  query(desc: { name: 'geolocation' }): Promise<{ state: string; onchange: (() => void) | null }>;
}

function getNav() {
  return (globalThis as {
    navigator?: { geolocation?: GeolocationLike; permissions?: PermissionsLike; userAgent?: string };
  }).navigator;
}

/** Message d'aide adapté à la plateforme quand l'accès est bloqué. */
function deniedHelp(): string {
  if (Platform.OS !== 'web') {
    return "L'accès à votre position est refusé.\n\nActivez la localisation pour Break Eat dans les réglages de votre téléphone, puis réessayez.";
  }
  const ua = getNav()?.userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return [
      'Votre navigateur a refusé l\'accès à votre position.',
      'Sur iPhone :',
      '1. Réglages › Confidentialité et sécurité › Service de localisation : activé.',
      '2. Plus bas, Safari › « Lorsque l\'app est active ».',
      '3. Réglages › Apps › Safari › Localisation : « Demander » ou « Autoriser ».',
      'Puis revenez ici et rechargez la page.',
    ].join('\n');
  }
  if (/Android/i.test(ua)) {
    return [
      'Votre navigateur a refusé l\'accès à votre position.',
      'Sur Android : touchez le cadenas à gauche de l\'adresse › Autorisations › Localisation › Autoriser, puis rechargez la page.',
    ].join('\n');
  }
  return "Votre navigateur a refusé l'accès à votre position.\n\nPour l'autoriser : cliquez sur l'icône cadenas (ou localisation) à gauche de la barre d'adresse, mettez « Localisation » sur Autoriser, puis rechargez la page.";
}

interface LocationStore {
  coords: Coords | null;
  status: LocationStatus;
  /** Préférence app : l'utilisateur a coupé la géoloc (persisté). */
  optedOut: boolean;
  /** Demande la position. silent=true : auto au montage (muet, respecte optedOut). */
  request: (opts?: { silent?: boolean }) => void;
  /** Bouton « désactiver » : coupe la géoloc côté app, sans toucher au navigateur. */
  disable: () => void;
  hydrate: () => void;
  refreshPermission: () => void;
}

const useLocationStore = create<LocationStore>((set, get) => ({
  coords: null,
  status: 'idle',
  optedOut: false,

  request: (opts) => {
    const silent = opts?.silent === true;

    if (get().optedOut) {
      if (silent) return; // auto : on respecte le choix « désactivé »
      // clic explicite → l'utilisateur réactive
      set({ optedOut: false });
      void AsyncStorage.setItem(OPT_OUT_KEY, '0');
    }

    const geo = getNav()?.geolocation;
    if (!geo) {
      set({ status: 'unavailable' });
      if (!silent) {
        showAlert('Localisation indisponible', "La géolocalisation n'est pas disponible sur cet appareil. Recherchez une ville ci-dessus.");
      }
      return;
    }
    set({ status: 'requesting' });
    geo.getCurrentPosition(
      (pos) => set({ coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, status: 'granted' }),
      (err) => {
        set({ status: 'denied' });
        if (silent) return;
        if (err?.code === 1) showAlert('Localisation bloquée', deniedHelp());
        else showAlert('Position introuvable', 'Impossible de récupérer votre position pour le moment. Réessayez, ou recherchez une ville ci-dessus.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  },

  disable: () => {
    set({ optedOut: true, coords: null, status: 'idle' });
    void AsyncStorage.setItem(OPT_OUT_KEY, '1');
  },

  hydrate: () => {
    void AsyncStorage.getItem(OPT_OUT_KEY).then((v) => {
      if (v === '1') set({ optedOut: true });
    });
  },

  // Web : reflète l'état réel de la permission sans déclencher de prompt.
  refreshPermission: () => {
    const perms = getNav()?.permissions;
    if (!perms?.query) return;
    perms
      .query({ name: 'geolocation' })
      .then((res) => {
        const apply = () => {
          if (get().optedOut) return; // l'utilisateur a coupé : on n'y touche pas
          if (get().status === 'granted') return; // déjà des coords
          if (res.state === 'denied') set({ status: 'denied' });
          else if (res.state === 'granted') get().request({ silent: true }); // récupère les coords
        };
        apply();
        res.onchange = apply;
      })
      .catch(() => {
        /* API indisponible — on garde l'état courant */
      });
  },
}));

let hydratedOnce = false;

export function useUserLocation() {
  const coords = useLocationStore((s) => s.coords);
  const status = useLocationStore((s) => s.status);
  const optedOut = useLocationStore((s) => s.optedOut);
  const request = useLocationStore((s) => s.request);
  const disable = useLocationStore((s) => s.disable);
  const refreshPermission = useLocationStore((s) => s.refreshPermission);

  useEffect(() => {
    if (!hydratedOnce) {
      hydratedOnce = true;
      useLocationStore.getState().hydrate();
    }
    refreshPermission();
  }, [refreshPermission]);

  return { coords, status, optedOut, request, disable };
}
