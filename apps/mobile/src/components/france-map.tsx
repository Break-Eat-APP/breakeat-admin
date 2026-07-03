/**
 * FranceMap (NATIF — fallback) — placeholder en attendant react-native-svg.
 *
 * Le web utilise `france-map.web.tsx` (silhouette SVG orange + pins « B »).
 * Sur natif, on rendra le SVG via react-native-svg lors de la phase build native.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { BreakEatLogo } from '@components/break-eat-logo';
import { THEME } from '@lib/theme';

export interface FrancePin {
  id: string;
  x: number;
  y: number;
  size?: number;
}

interface Props {
  pins: FrancePin[];
  dimmed?: boolean;
}

export function FranceMap(_props: Props) {
  return (
    <View style={styles.wrap}>
      <BreakEatLogo size={56} variant="orange" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.bg },
});
