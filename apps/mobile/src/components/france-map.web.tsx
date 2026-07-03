/**
 * FranceMap (WEB) — silhouette plate de la France (greige clair) + pins logo « B » orange.
 *
 * Écran d'accueil / état vide : visuel vivant 100 % Break Eat sans vraie carte.
 * Le SVG est fourni en data URI (france-svg.ts) car Metro/web ne bundle pas les .svg
 * comme images. Les pins sont positionnés en % d'un CARRÉ centré = la zone exacte
 * occupée par la silhouette (resizeMode contain), pour un placement fiable.
 *
 * Sur natif : voir france-map.tsx (fallback en attendant react-native-svg).
 */
import React, { useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { BreakEatLogo } from '@components/break-eat-logo';
import { FRANCE_SVG_URI } from '@components/france-svg';
import { THEME } from '@lib/theme';

export interface FrancePin {
  id: string;
  /** Position en % du carré de la silhouette (0–100). */
  x: number;
  y: number;
  size?: number;
}

interface Props {
  pins: FrancePin[];
  /** (Conservé pour compat — non utilisé sur fond clair.) */
  dimmed?: boolean;
}

export function FranceMap({ pins }: Props) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };
  const side = Math.min(box.w, box.h);
  const left = (box.w - side) / 2;
  const top = (box.h - side) / 2;

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <Image source={{ uri: FRANCE_SVG_URI }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      {side > 0 && (
        <View style={[styles.pinLayer, { width: side, height: side, left, top }]} pointerEvents="none">
          {pins.map((p) => {
            const W = (p.size ?? 22) * 1.7; // goutte blanche (contour)
            const O = W * 0.82; // goutte orange (intérieur)
            const off = (W - O) / 2;
            return (
              <View
                key={p.id}
                // Pointe de la goutte ancrée sur le point (bas-centre).
                style={[styles.pin, { width: W, height: W, left: `${p.x}%`, top: `${p.y}%`, marginLeft: -W * 0.5, marginTop: -W * 0.95 }]}
              >
                {/* contour blanc */}
                <MaterialCommunityIcons name="map-marker" size={W} color="#ffffff" />
                {/* corps orange */}
                <MaterialCommunityIcons
                  name="map-marker"
                  size={O}
                  color={THEME.orange}
                  style={{ position: 'absolute', left: off, top: off }}
                />
                {/* « B » blanc dans le bulbe */}
                <View style={[styles.pinGlyph, { top: W * 0.15 }]}>
                  <BreakEatLogo size={W * 0.5} variant="white" />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#ffffff' },
  pinLayer: { position: 'absolute' },
  pin: { position: 'absolute', alignItems: 'center' },
  pinGlyph: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
});
