/**
 * useUserLocation — géolocalisation avec dégradation gracieuse.
 *
 * L'app est en bare RN sans module natif de géoloc installé. Ce hook s'appuie sur
 * `navigator.geolocation` s'il est présent (polyfillé par
 * `@react-native-community/geolocation` une fois le setup natif fait). Tant que ce
 * n'est pas le cas, `status` vaut `'unavailable'` et l'écran Lieux retombe sur la
 * liste + la recherche manuelle — aucune erreur, aucun import non installé.
 *
 * Setup natif (à faire côté app, comme pour le push) :
 *   1. `pnpm --filter @break-eat/mobile add @react-native-community/geolocation`
 *   2. permissions iOS (NSLocationWhenInUseUsageDescription) + Android
 *      (ACCESS_FINE_LOCATION), rebuild natif.
 */
import { useCallback, useState } from 'react';

export interface Coords {
  lat: number;
  lng: number;
}

export type LocationStatus =
  | 'idle' // pas encore demandé
  | 'requesting' // demande en cours
  | 'granted' // position obtenue
  | 'denied' // refus utilisateur / erreur
  | 'unavailable'; // module natif absent

/** Forme minimale de l'API web Geolocation, présente seulement si polyfillée. */
interface GeolocationLike {
  getCurrentPosition(
    success: (pos: { coords: { latitude: number; longitude: number } }) => void,
    error?: (err: unknown) => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ): void;
}

function getGeolocation(): GeolocationLike | null {
  const nav = (globalThis as { navigator?: { geolocation?: GeolocationLike } }).navigator;
  return nav?.geolocation ?? null;
}

export function useUserLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');

  const request = useCallback(() => {
    const geo = getGeolocation();
    if (!geo) {
      setStatus('unavailable');
      return;
    }
    setStatus('requesting');
    geo.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('granted');
      },
      () => {
        setStatus('denied');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  return { coords, status, request };
}
